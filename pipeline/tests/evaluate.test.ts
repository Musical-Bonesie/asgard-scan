import { describe, expect, test } from "vitest";
import { scoreClassifications, type FixtureResult } from "../src/evaluate";

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
