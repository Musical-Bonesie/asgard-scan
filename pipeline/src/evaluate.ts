import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAnthropicClient } from "./anthropic-client";
import { classifyDescription } from "./classify";
import {
  loadDictionary,
  normalizeToken,
  resolveToken,
  type Dictionary,
} from "./dictionary";
import { extractIngredients } from "./extract";
import { mapWithConcurrency } from "./run";
import { stripHtml } from "./strip-html";
import type { Classification, ExtractedIngredient } from "./types";
import fixtures from "../fixtures/labelled-products.json";

// Resolved relative to this module, not the process cwd, mirroring run.ts —
// the pipeline runs from inside pipeline/, where a cwd-relative path would
// still happen to resolve correctly for these two files, but staying
// consistent with run.ts avoids a subtle divergence if either ever moves.
const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));
const DICTIONARY_PATH = fileURLToPath(
  new URL("../../data/ingredient-dictionary.json", import.meta.url),
);

const CONCURRENCY = 5;

export interface FixtureResult {
  id: number | string;
  title: string;
  expected: Classification;
  actual: Classification | "error";
  error?: string;
}

export interface EvaluationScore {
  total: number;
  correct: number;
  /** correct / total, 0 when total is 0. */
  accuracy: number;
  /** counts[expected][actual] */
  confusion: Record<Classification, Partial<Record<Classification | "error", number>>>;
  /**
   * The costliest error: expected key_ingredients, got full_list — a partial
   * list presented as complete. Listed by title. The reverse direction
   * (full_list misclassified as key_ingredients) is safe over-caution — it
   * only routes to human review — and must never appear here.
   */
  partialAsComplete: string[];
  errors: { title: string; error: string }[];
}

const CLASSIFICATIONS: Classification[] = [
  "full_list",
  "key_ingredients",
  "active_inactive",
  "none",
];

/**
 * Pure scoring over already-computed classification results — no network,
 * no I/O. This is what makes the metric testable without paid API calls.
 */
export function scoreClassifications(results: FixtureResult[]): EvaluationScore {
  const confusion = Object.fromEntries(
    CLASSIFICATIONS.map((c) => [c, {}]),
  ) as EvaluationScore["confusion"];

  let correct = 0;
  const partialAsComplete: string[] = [];
  const errors: { title: string; error: string }[] = [];

  for (const result of results) {
    const bucket = confusion[result.expected];
    bucket[result.actual] = (bucket[result.actual] ?? 0) + 1;

    if (result.actual === result.expected) {
      correct += 1;
    }

    if (result.expected === "key_ingredients" && result.actual === "full_list") {
      partialAsComplete.push(result.title);
    }

    if (result.actual === "error") {
      errors.push({ title: result.title, error: result.error ?? "unknown error" });
    }
  }

  const total = results.length;
  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    confusion,
    partialAsComplete,
    errors,
  };
}

/**
 * Fixtures whose expected classification carries a list that gets written to
 * Shopify also have their extraction checked. key_ingredients and none carry
 * no firstIngredient to check against.
 */
export function needsExtractionCheck(expected: Classification): boolean {
  return expected === "full_list" || expected === "active_inactive";
}

/** One fixture's extraction, ready to be scored. */
export interface ExtractionCheck {
  id: number | string;
  title: string;
  expectedFirstIngredient: string | null;
  /** A FLOOR, never an exact count: the list must have at least this many. */
  expectedMinCount: number;
  /** Absent when the extraction call failed. */
  ingredients?: ExtractedIngredient[];
  error?: string;
}

export interface ExtractionScore {
  /** Extraction checks attempted, including ones that errored. */
  total: number;
  /** One entry per problem, by fixture title. */
  mismatches: { title: string; problem: string }[];
  errors: { title: string; error: string }[];
}

/**
 * Whether the extracted first ingredient is the expected one.
 *
 * Compared with normalizeToken against both the canonical name and the raw
 * text (the fixture labels record the ingredient as written, e.g. "100%
 * organic Moringa Oleifera seed oil.", while the canonical name is the
 * standardised INCI form). With a dictionary, two names that resolve to the
 * same entry (Water / Aqua) also match. None of this tolerance can make a
 * DIFFERENT ingredient match — a highlight put first still fails.
 */
export function firstIngredientMatches(
  expected: string,
  first: ExtractedIngredient,
  dictionary?: Dictionary,
): boolean {
  const key = normalizeToken(expected);
  if (normalizeToken(first.canonical) === key || normalizeToken(first.raw) === key) {
    return true;
  }
  if (dictionary) {
    const expectedEntry = resolveToken(dictionary, expected);
    if (expectedEntry !== null) {
      return (
        resolveToken(dictionary, first.canonical) === expectedEntry ||
        resolveToken(dictionary, first.raw) === expectedEntry
      );
    }
  }
  return false;
}

/**
 * Pure scoring of extraction checks (C1): the first ingredient must be the
 * labelled one — a highlights section used or merged in usually puts a
 * highlighted ingredient first — and the list must reach the labelled floor,
 * which catches an extractor that returned only the highlights.
 */
export function scoreExtractions(
  checks: ExtractionCheck[],
  dictionary?: Dictionary,
): ExtractionScore {
  const mismatches: { title: string; problem: string }[] = [];
  const errors: { title: string; error: string }[] = [];

  for (const check of checks) {
    if (check.ingredients === undefined) {
      errors.push({ title: check.title, error: check.error ?? "unknown error" });
      continue;
    }

    // The only permitted ordering is by position.
    const ordered = [...check.ingredients].sort((a, b) => a.position - b.position);

    if (check.expectedFirstIngredient !== null) {
      const first = ordered[0];
      if (first === undefined) {
        mismatches.push({
          title: check.title,
          problem: `no ingredients extracted, expected first "${check.expectedFirstIngredient}"`,
        });
      } else if (!firstIngredientMatches(check.expectedFirstIngredient, first, dictionary)) {
        mismatches.push({
          title: check.title,
          problem: `first ingredient is "${first.canonical}", expected "${check.expectedFirstIngredient}"`,
        });
      }
    }

    if (ordered.length < check.expectedMinCount) {
      mismatches.push({
        title: check.title,
        problem: `extracted ${ordered.length} ingredients, expected at least ${check.expectedMinCount}`,
      });
    }
  }

  return { total: checks.length, mismatches, errors };
}

export interface GateOutcome {
  passed: boolean;
  /**
   * False when the gate could not be evaluated: nothing ran, or some fixture
   * errored, so a clean-looking result may simply mean nothing was tested.
   */
  evaluated: boolean;
  reasons: string[];
}

/**
 * The owner's pre-publish gate. Fails on the costliest classification error,
 * on any extraction mismatch, on any error, and when nothing was evaluated —
 * a gate that tested nothing must never read as a pass.
 */
export function gateOutcome(score: {
  classification: EvaluationScore;
  extraction: ExtractionScore;
}): GateOutcome {
  const { classification, extraction } = score;
  const reasons: string[] = [];
  let evaluated = true;

  if (classification.total === 0) {
    evaluated = false;
    reasons.push("nothing was evaluated: no fixture was classified");
  }
  if (extraction.total === 0) {
    evaluated = false;
    reasons.push("no extraction check ran, so the extraction (C1) check was not evaluated");
  }
  if (classification.errors.length > 0) {
    evaluated = false;
    reasons.push(`${classification.errors.length} fixture(s) failed to classify`);
  }
  if (extraction.errors.length > 0) {
    evaluated = false;
    reasons.push(`${extraction.errors.length} fixture(s) failed to extract`);
  }
  if (classification.partialAsComplete.length > 0) {
    reasons.push(
      `key_ingredients classified as full_list (a partial list presented as complete): ` +
        classification.partialAsComplete.join(", "),
    );
  }
  if (extraction.mismatches.length > 0) {
    const titles = [...new Set(extraction.mismatches.map((m) => m.title))];
    reasons.push(
      `${extraction.mismatches.length} extraction mismatch(es): ${titles.join(", ")}`,
    );
  }

  return { passed: reasons.length === 0, evaluated, reasons };
}

/** The human-readable report. Pure, so what the gate prints is tested. */
export function renderGateReport(
  classification: EvaluationScore,
  extraction: ExtractionScore,
  gate: GateOutcome,
): string[] {
  const lines: string[] = [];

  lines.push(
    `\nClassification accuracy: ${classification.correct}/${classification.total} ` +
      `(${(classification.accuracy * 100).toFixed(1)}%)`,
  );

  lines.push("\nConfusion matrix (expected -> actual: count):");
  for (const expected of CLASSIFICATIONS) {
    for (const [actual, count] of Object.entries(classification.confusion[expected])) {
      lines.push(`  ${expected} -> ${actual}: ${count}`);
    }
  }

  if (classification.partialAsComplete.length > 0) {
    lines.push(
      `\n!!! COSTLIEST ERROR: ${classification.partialAsComplete.length} key_ingredients ` +
        `fixture(s) classified as full_list — a partial list would be presented as complete:`,
    );
    for (const title of classification.partialAsComplete) {
      lines.push(`  - ${title}`);
    }
  } else if (gate.evaluated) {
    // Only reassure when every fixture was actually classified: with errors,
    // "none was misclassified" may just mean none was classified.
    lines.push("\nNo key_ingredients fixture was classified as full_list.");
  }

  if (classification.errors.length > 0) {
    lines.push(`\n${classification.errors.length} fixture(s) failed to classify:`);
    for (const { title, error } of classification.errors) {
      lines.push(`  - ${title}: ${error}`);
    }
  }

  lines.push(
    `\nExtraction check: ${extraction.total} fixture(s), ` +
      `${extraction.mismatches.length} mismatch(es), ${extraction.errors.length} error(s).`,
  );
  for (const { title, problem } of extraction.mismatches) {
    lines.push(`  - ${title}: ${problem}`);
  }
  if (extraction.errors.length > 0) {
    lines.push(`${extraction.errors.length} fixture(s) failed to extract:`);
    for (const { title, error } of extraction.errors) {
      lines.push(`  - ${title}: ${error}`);
    }
  }

  if (!gate.evaluated) {
    lines.push(
      "\n!!! GATE NOT EVALUATED — the check did not run completely. Fix the errors " +
        "above and re-run; do NOT treat this as a pass.",
    );
  } else if (gate.passed) {
    lines.push("\nGATE PASSED.");
  } else {
    lines.push("\n!!! GATE FAILED — do not publish:");
  }
  for (const reason of gate.reasons) {
    lines.push(`  - ${reason}`);
  }

  return lines;
}

interface Fixture {
  id: number | string;
  title: string;
  vendor: string;
  bodyHtml: string;
  expected: { classification: Classification; firstIngredient: string | null; minCount: number };
  /** Set on fixtures derived from a real product by removing its complete list. */
  derived?: boolean;
  derivedFrom?: number | string;
  rationale?: string;
}

interface FixtureOutcome {
  classification: FixtureResult;
  extraction: ExtractionCheck | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Exercise the real classifier AND extractor against the hand-labelled
 * fixtures.
 *
 * This is Controller Ruling 3's promised scripted run: it costs real API
 * calls and is non-deterministic, so it lives here rather than in the unit
 * suite, and the operator runs it by hand before the first paid extraction.
 * All decisions are made by the pure functions above; this only wires them.
 *
 * Only ANTHROPIC_API_KEY is required — this never touches the Shopify store.
 */
export async function evaluateMain(): Promise<void> {
  config({ path: ENV_PATH });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("Missing env: ANTHROPIC_API_KEY");
  }

  const anthropic = createAnthropicClient(anthropicKey);
  const dictionary = loadDictionary(DICTIONARY_PATH);
  const typedFixtures = fixtures as Fixture[];

  const outcomes = await mapWithConcurrency<Fixture, FixtureOutcome>(
    typedFixtures,
    CONCURRENCY,
    async (fixture) => {
      const text = stripHtml(fixture.bodyHtml);
      const expected = fixture.expected.classification;

      let classification: FixtureResult;
      try {
        const classified = await classifyDescription(anthropic, text);
        classification = {
          id: fixture.id,
          title: fixture.title,
          expected,
          actual: classified.classification,
        };
      } catch (error) {
        classification = {
          id: fixture.id,
          title: fixture.title,
          expected,
          actual: "error",
          error: errorMessage(error),
        };
      }

      if (!needsExtractionCheck(expected)) {
        return { classification, extraction: null };
      }

      // Extract with the LABELLED classification, independent of what the
      // classifier said: this checks the extractor on exactly the path a
      // correctly classified product takes (C1), and a classifier error
      // must not hide an extractor problem.
      const base = {
        id: fixture.id,
        title: fixture.title,
        expectedFirstIngredient: fixture.expected.firstIngredient,
        expectedMinCount: fixture.expected.minCount,
      };
      try {
        const extracted = await extractIngredients(anthropic, text, expected);
        return { classification, extraction: { ...base, ingredients: extracted.ingredients } };
      } catch (error) {
        return { classification, extraction: { ...base, error: errorMessage(error) } };
      }
    },
  );

  const classificationScore = scoreClassifications(outcomes.map((o) => o.classification));
  const extractionScore = scoreExtractions(
    outcomes.flatMap((o) => (o.extraction ? [o.extraction] : [])),
    dictionary,
  );
  const gate = gateOutcome({
    classification: classificationScore,
    extraction: extractionScore,
  });

  for (const line of renderGateReport(classificationScore, extractionScore, gate)) {
    console.log(line);
  }

  if (!gate.passed) {
    process.exitCode = 1;
  }
}

// Only run when executed directly, so tests can import this module freely.
if (process.argv[1]?.endsWith("evaluate.ts")) {
  evaluateMain().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
