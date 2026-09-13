import { describe, expect, test } from "vitest";
import {
  firstIngredientMatches,
  gateOutcome,
  needsExtractionCheck,
  renderGateReport,
  scoreClassifications,
  scoreExtractions,
  type ExtractionCheck,
  type ExtractionScore,
  type FixtureResult,
} from "../src/evaluate";
import type { Dictionary } from "../src/dictionary";
import type { ExtractedIngredient } from "../src/types";

function result(
  overrides: Partial<FixtureResult> & Pick<FixtureResult, "expected" | "actual">,
): FixtureResult {
  return {
    id: 1,
    title: "Test product",
    error: undefined,
    ...overrides,
  };
}

describe("scoreClassifications", () => {
  test("all correct gives accuracy 1 and no costly errors", () => {
    const results: FixtureResult[] = [
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
      result({ id: 2, title: "B", expected: "none", actual: "none" }),
    ];

    const score = scoreClassifications(results);

    expect(score.total).toBe(2);
    expect(score.correct).toBe(2);
    expect(score.accuracy).toBe(1);
    expect(score.partialAsComplete).toEqual([]);
    expect(score.errors).toEqual([]);
  });

  test("a key_ingredients fixture classified full_list is the costliest error", () => {
    const results: FixtureResult[] = [
      result({
        id: 1,
        title: "Partial list product",
        expected: "key_ingredients",
        actual: "full_list",
      }),
    ];

    const score = scoreClassifications(results);

    expect(score.partialAsComplete).toEqual(["Partial list product"]);
  });

  test("full_list classified key_ingredients is safe over-caution, not listed", () => {
    // The reverse direction only routes to human review — it must never be
    // reported alongside the costly error above.
    const results: FixtureResult[] = [
      result({
        id: 1,
        title: "Over-cautious product",
        expected: "full_list",
        actual: "key_ingredients",
      }),
    ];

    const score = scoreClassifications(results);

    expect(score.partialAsComplete).toEqual([]);
  });

  test("an error result counts as incorrect and appears in errors", () => {
    const results: FixtureResult[] = [
      result({
        id: 1,
        title: "Failed product",
        expected: "full_list",
        actual: "error",
        error: "network timeout",
      }),
    ];

    const score = scoreClassifications(results);

    expect(score.total).toBe(1);
    expect(score.correct).toBe(0);
    expect(score.accuracy).toBe(0);
    expect(score.errors).toEqual([
      { title: "Failed product", error: "network timeout" },
    ]);
  });

  test("confusion matrix counts are exact for a small mixed input", () => {
    const results: FixtureResult[] = [
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
      result({ id: 2, title: "B", expected: "full_list", actual: "full_list" }),
      result({
        id: 3,
        title: "C",
        expected: "key_ingredients",
        actual: "full_list",
      }),
      result({
        id: 4,
        title: "D",
        expected: "none",
        actual: "error",
        error: "boom",
      }),
    ];

    const score = scoreClassifications(results);

    expect(score.confusion).toEqual({
      full_list: { full_list: 2 },
      key_ingredients: { full_list: 1 },
      active_inactive: {},
      none: { error: 1 },
    });
  });

  test("empty input gives total 0, accuracy 0, and does not crash", () => {
    const score = scoreClassifications([]);

    expect(score.total).toBe(0);
    expect(score.correct).toBe(0);
    expect(score.accuracy).toBe(0);
    expect(score.partialAsComplete).toEqual([]);
    expect(score.errors).toEqual([]);
    expect(score.confusion).toEqual({
      full_list: {},
      key_ingredients: {},
      active_inactive: {},
      none: {},
    });
  });
});

function ings(...names: string[]): ExtractedIngredient[] {
  return names.map((n, i) => ({ raw: n, canonical: n, position: i }));
}

function check(overrides: Partial<ExtractionCheck> = {}): ExtractionCheck {
  return {
    id: 1,
    title: "Test product",
    expectedFirstIngredient: "Aqua",
    expectedMinCount: 3,
    ingredients: ings("Aqua", "Glycerin", "Tocopherol"),
    ...overrides,
  };
}

const DICT: Dictionary = {
  version: 1,
  entries: [
    { inci_name: "Aqua", common_name: "Water", synonyms: ["Water"], flags: [] },
  ],
};

describe("needsExtractionCheck", () => {
  test.each([
    ["full_list", true],
    ["active_inactive", true],
    ["key_ingredients", false],
    ["none", false],
  ] as const)("%s -> %s", (classification, expected) => {
    expect(needsExtractionCheck(classification)).toBe(expected);
  });
});

describe("firstIngredientMatches", () => {
  test("compares with normalizeToken: case, parentheticals and trailing punctuation are ignored", () => {
    expect(
      firstIngredientMatches("Camellia Sinensis (Camellia) Seed Oil*", {
        raw: "Camellia Sinensis (Camellia) Seed Oil*",
        canonical: "Camellia Sinensis Seed Oil",
        position: 0,
      }),
    ).toBe(true);
  });

  test("matches on the raw text when the canonical name was standardised", () => {
    expect(
      firstIngredientMatches("100% organic Moringa Oleifera seed oil.", {
        raw: "100% organic Moringa Oleifera seed oil",
        canonical: "Moringa Oleifera Seed Oil",
        position: 0,
      }),
    ).toBe(true);
  });

  test("matches dictionary synonyms when a dictionary is given", () => {
    const first = { raw: "Aqua/Water", canonical: "Aqua", position: 0 };
    expect(firstIngredientMatches("Water", first)).toBe(false);
    expect(firstIngredientMatches("Water", first, DICT)).toBe(true);
  });

  test("a highlighted ingredient in first place does not match", () => {
    // The C1 failure: merging the Bakuchiol fixture's "Key ingredients" block
    // into its INCI list puts Bakuchiol first.
    expect(
      firstIngredientMatches("Caprylic/Capric Triglyceride", {
        raw: "Bakuchiol",
        canonical: "Bakuchiol",
        position: 0,
      }),
    ).toBe(false);
  });
});

describe("scoreExtractions", () => {
  test("a correct first ingredient and a count at the floor pass", () => {
    const score = scoreExtractions([check()]);
    expect(score).toEqual({ total: 1, mismatches: [], errors: [] });
  });

  test("minCount is a floor, never an exact count", () => {
    const score = scoreExtractions([
      check({ ingredients: ings("Aqua", "Glycerin", "Tocopherol", "Citral", "Linalool") }),
    ]);
    expect(score.mismatches).toEqual([]);
  });

  test("reports a wrong first ingredient by title", () => {
    const score = scoreExtractions([
      check({
        title: "Bakuchiol Building Blocks",
        expectedFirstIngredient: "Caprylic/Capric Triglyceride",
        ingredients: ings("Bakuchiol", "Caprylic/Capric Triglyceride", "Salicylic Acid"),
      }),
    ]);
    expect(score.mismatches).toHaveLength(1);
    expect(score.mismatches[0].title).toBe("Bakuchiol Building Blocks");
    expect(score.mismatches[0].problem).toMatch(
      /first ingredient is "Bakuchiol", expected "Caprylic\/Capric Triglyceride"/,
    );
  });

  test("reports a count below the floor by title", () => {
    const score = scoreExtractions([
      check({ title: "Short", expectedMinCount: 14, ingredients: ings("Aqua", "Glycerin") }),
    ]);
    expect(score.mismatches).toEqual([
      { title: "Short", problem: "extracted 2 ingredients, expected at least 14" },
    ]);
  });

  test("reports both problems for one fixture, each separately", () => {
    const score = scoreExtractions([
      check({ title: "Both", expectedMinCount: 10, ingredients: ings("Niacinamide") }),
    ]);
    expect(score.mismatches.map((m) => m.title)).toEqual(["Both", "Both"]);
  });

  test("uses position order, not array order, to find the first ingredient", () => {
    const score = scoreExtractions([
      check({
        ingredients: [
          { raw: "Glycerin", canonical: "Glycerin", position: 1 },
          { raw: "Aqua", canonical: "Aqua", position: 0 },
          { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
        ],
      }),
    ]);
    expect(score.mismatches).toEqual([]);
  });

  test("an empty extraction is a mismatch, not a crash", () => {
    const score = scoreExtractions([check({ title: "Empty", ingredients: [] })]);
    expect(score.mismatches.map((m) => m.problem)).toEqual([
      'no ingredients extracted, expected first "Aqua"',
      "extracted 0 ingredients, expected at least 3",
    ]);
  });

  test("an extraction error is reported as an error, not a mismatch", () => {
    const score = scoreExtractions([
      check({ title: "Boom", ingredients: undefined, error: "529 overloaded" }),
    ]);
    expect(score.total).toBe(1);
    expect(score.errors).toEqual([{ title: "Boom", error: "529 overloaded" }]);
    expect(score.mismatches).toEqual([]);
  });

  test("passes a dictionary through to the first-ingredient comparison", () => {
    const withSynonym = check({
      expectedFirstIngredient: "Water",
      ingredients: [
        { raw: "Aqua/Water/Eau", canonical: "Aqua", position: 0 },
        ...ings("x", "Glycerin", "Tocopherol").slice(1),
      ],
    });
    expect(scoreExtractions([withSynonym]).mismatches).toHaveLength(1);
    expect(scoreExtractions([withSynonym], DICT).mismatches).toEqual([]);
  });
});

describe("gateOutcome", () => {
  const cleanExtraction: ExtractionScore = { total: 1, mismatches: [], errors: [] };

  function allCorrect() {
    return scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
      result({ id: 2, title: "B", expected: "key_ingredients", actual: "key_ingredients" }),
    ]);
  }

  test("all-correct passes", () => {
    expect(
      gateOutcome({ classification: allCorrect(), extraction: cleanExtraction }),
    ).toEqual({ passed: true, evaluated: true, reasons: [] });
  });

  test("inaccuracy that is not the costly error does not fail the gate", () => {
    // full_list -> key_ingredients is safe over-caution: it lowers accuracy
    // but only routes a product to review.
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "key_ingredients" }),
    ]);
    expect(
      gateOutcome({ classification, extraction: cleanExtraction }).passed,
    ).toBe(true);
  });

  test("any partialAsComplete fails", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
      result({ id: 2, title: "Partial", expected: "key_ingredients", actual: "full_list" }),
    ]);
    const outcome = gateOutcome({ classification, extraction: cleanExtraction });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.reasons.join(" ")).toMatch(/Partial/);
  });

  test("any classification error fails and marks the gate as not evaluated", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
      result({ id: 2, title: "B", expected: "none", actual: "error", error: "bad key" }),
    ]);
    const outcome = gateOutcome({ classification, extraction: cleanExtraction });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(false);
    expect(outcome.reasons.join(" ")).toMatch(/1 fixture\(s\) failed to classify/);
  });

  test("every fixture erroring fails (the gate tested nothing)", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "key_ingredients", actual: "error", error: "529" }),
      result({ id: 2, title: "B", expected: "full_list", actual: "error", error: "529" }),
    ]);
    const outcome = gateOutcome({
      classification,
      extraction: { total: 1, mismatches: [], errors: [{ title: "B", error: "529" }] },
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(false);
  });

  test("any extraction error fails and marks the gate as not evaluated", () => {
    const outcome = gateOutcome({
      classification: allCorrect(),
      extraction: { total: 1, mismatches: [], errors: [{ title: "A", error: "refused" }] },
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(false);
    expect(outcome.reasons.join(" ")).toMatch(/failed to extract/);
  });

  test("any extraction mismatch fails", () => {
    const outcome = gateOutcome({
      classification: allCorrect(),
      extraction: {
        total: 1,
        mismatches: [{ title: "A", problem: "extracted 2 ingredients, expected at least 14" }],
        errors: [],
      },
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.reasons.join(" ")).toMatch(/extraction/);
  });

  test("empty input fails (nothing was evaluated)", () => {
    const outcome = gateOutcome({
      classification: scoreClassifications([]),
      extraction: scoreExtractions([]),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(false);
    expect(outcome.reasons.join(" ")).toMatch(/nothing was evaluated/i);
  });

  test("no extraction check at all fails (the C1 check did not run)", () => {
    const outcome = gateOutcome({
      classification: allCorrect(),
      extraction: scoreExtractions([]),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.evaluated).toBe(false);
  });
});

describe("renderGateReport", () => {
  test("prints GATE NOT EVALUATED, and never the reassuring line, when errors exist", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "key_ingredients", actual: "error", error: "bad key" }),
    ]);
    const extraction = scoreExtractions([]);
    const lines = renderGateReport(
      classification,
      extraction,
      gateOutcome({ classification, extraction }),
    ).join("\n");
    expect(lines).toMatch(/GATE NOT EVALUATED/);
    expect(lines).not.toMatch(/No key_ingredients fixture was classified as full_list/);
    expect(lines).toMatch(/A: bad key/);
  });

  test("prints the reassuring line and GATE PASSED only when everything was evaluated and clean", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
    ]);
    const extraction = scoreExtractions([check({ title: "A" })]);
    const lines = renderGateReport(
      classification,
      extraction,
      gateOutcome({ classification, extraction }),
    ).join("\n");
    expect(lines).toMatch(/No key_ingredients fixture was classified as full_list/);
    expect(lines).toMatch(/GATE PASSED/);
    expect(lines).not.toMatch(/GATE NOT EVALUATED|GATE FAILED/);
  });

  test("lists every extraction mismatch by title and prints GATE FAILED", () => {
    const classification = scoreClassifications([
      result({ id: 1, title: "A", expected: "full_list", actual: "full_list" }),
    ]);
    const extraction = scoreExtractions([
      check({ title: "Bakuchiol", ingredients: ings("Bakuchiol", "x", "y") }),
    ]);
    const lines = renderGateReport(
      classification,
      extraction,
      gateOutcome({ classification, extraction }),
    ).join("\n");
    expect(lines).toMatch(/Bakuchiol: first ingredient is "Bakuchiol", expected "Aqua"/);
    expect(lines).toMatch(/GATE FAILED/);
  });
});
