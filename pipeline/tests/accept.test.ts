import { describe, expect, test } from "vitest";
import { evaluateAcceptance } from "../src/accept";
import type { Dictionary } from "../src/dictionary";
import type { ExtractedIngredient } from "../src/types";

const DICT: Dictionary = {
  version: 1,
  entries: [
    { inci_name: "Aqua", common_name: "Water", synonyms: ["Water"], flags: [] },
    { inci_name: "Glycerin", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Tocopherol", common_name: null, synonyms: [], flags: [] },
  ],
};

function ings(...names: string[]): ExtractedIngredient[] {
  return names.map((n, i) => ({ raw: n, canonical: n, position: i }));
}

const GOOD = {
  classification: "full_list" as const,
  confidence: 0.95,
  ingredients: ings("Aqua", "Glycerin", "Tocopherol"),
  dictionary: DICT,
};

describe("evaluateAcceptance", () => {
  test("accepts a clean, confident, fully-resolved full list", () => {
    expect(evaluateAcceptance(GOOD).accepted).toBe(true);
  });

  test("REJECTS key_ingredients even at confidence 1.0", () => {
    // The single most important rule in the system. A "Key Ingredients" block
    // is a partial list by definition, so no confidence value makes it safe.
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "key_ingredients",
      confidence: 1.0,
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/key_ingredients/i);
  });

  test("rejects confidence below the threshold", () => {
    const decision = evaluateAcceptance({ ...GOOD, confidence: 0.89 });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/confidence/i);
  });

  test("rejects a list containing an unresolvable ingredient", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      ingredients: ings("Aqua", "Glycerin", "Unobtainium"),
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/Unobtainium/);
  });

  test("rejects a list that is too short to be a real INCI list", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      ingredients: ings("Aqua", "Glycerin"),
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/at least 3/i);
  });

  test("rejects active_inactive, which always needs review", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "active_inactive",
    });
    expect(decision.accepted).toBe(false);
  });

  test("reports every failing reason, not just the first", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "key_ingredients",
      confidence: 0.1,
      ingredients: ings("Unobtainium"),
    });
    expect(decision.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
