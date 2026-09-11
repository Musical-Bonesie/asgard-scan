import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAnthropicClient } from "./anthropic-client";
import { classifyDescription } from "./classify";
import { mapWithConcurrency } from "./run";
import { stripHtml } from "./strip-html";
import type { Classification } from "./types";
import fixtures from "../fixtures/labelled-products.json";

// Resolved relative to this module, not the process cwd, mirroring run.ts —
// the pipeline runs from inside pipeline/, where a cwd-relative path would
// still happen to resolve correctly for these two files, but staying
// consistent with run.ts avoids a subtle divergence if either ever moves.
const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

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

interface Fixture {
  id: number | string;
  title: string;
  vendor: string;
  bodyHtml: string;
  expected: { classification: Classification; firstIngredient: string | null; minCount: number };
}

/**
 * Exercise the real classifier against the hand-labelled fixtures.
 *
 * This is Controller Ruling 3's promised scripted run: it costs real API
 * calls and is non-deterministic, so it lives here rather than in the unit
 * suite, and the operator runs it by hand before any metafield is written.
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
  const typedFixtures = fixtures as Fixture[];

  const results = await mapWithConcurrency<Fixture, FixtureResult>(
    typedFixtures,
    CONCURRENCY,
    async (fixture) => {
      try {
        const text = stripHtml(fixture.bodyHtml);
        const classified = await classifyDescription(anthropic, text);
        return {
          id: fixture.id,
          title: fixture.title,
          expected: fixture.expected.classification,
          actual: classified.classification,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          id: fixture.id,
          title: fixture.title,
          expected: fixture.expected.classification,
          actual: "error",
          error: message,
        };
      }
    },
  );

  const score = scoreClassifications(results);

  console.log(`\nAccuracy: ${score.correct}/${score.total} (${(score.accuracy * 100).toFixed(1)}%)`);

  console.log("\nConfusion matrix (expected -> actual: count):");
  for (const expected of CLASSIFICATIONS) {
    const row = score.confusion[expected];
    const entries = Object.entries(row);
    if (entries.length === 0) continue;
    for (const [actual, count] of entries) {
      console.log(`  ${expected} -> ${actual}: ${count}`);
    }
  }

  if (score.partialAsComplete.length > 0) {
    console.log(
      `\n!!! COSTLIEST ERROR: ${score.partialAsComplete.length} key_ingredients fixture(s) classified as full_list — a partial list would be presented as complete:`,
    );
    for (const title of score.partialAsComplete) {
      console.log(`  - ${title}`);
    }
  } else {
    console.log("\nNo key_ingredients fixture was classified as full_list.");
  }

  if (score.errors.length > 0) {
    console.log(`\n${score.errors.length} fixture(s) failed to classify:`);
    for (const { title, error } of score.errors) {
      console.log(`  - ${title}: ${error}`);
    }
  }

  if (score.partialAsComplete.length > 0) {
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
