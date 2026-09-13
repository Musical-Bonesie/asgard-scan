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

  describe("duplicate ingredients (C1: a merged highlights section)", () => {
    test("routes to review when two canonical names normalize to the same ingredient", () => {
      // Merging a "Key Ingredients" block into the complete list repeats the
      // highlighted ingredients. normalizeToken folds case, parentheticals and
      // trailing punctuation, so these are the same ingredient.
      const decision = evaluateAcceptance({
        ...GOOD,
        ingredients: ings("Glycerin", "Aqua", "glycerin (Vegetable).", "Tocopherol"),
      });
      expect(decision.accepted).toBe(false);
      expect(decision.reasons).toHaveLength(1);
      expect(decision.reasons[0]).toMatch(/duplicate/i);
      expect(decision.reasons[0]).toMatch(/Glycerin/);
    });

    test("names each duplicated ingredient once", () => {
      const decision = evaluateAcceptance({
        ...GOOD,
        ingredients: ings("Aqua", "Glycerin", "Aqua", "Glycerin", "Aqua"),
      });
      const reason = decision.reasons.find((r) => /duplicate/i.test(r))!;
      expect(reason).toMatch(/duplicate ingredients: Aqua, Glycerin/);
    });
  });

  describe("highlights heading in the description (C1)", () => {
    test.each([
      "Key Ingredients:",
      "KEY INGREDIENT",
      "Star ingredients",
      "Hero Ingredient:",
      "Featured Ingredients",
      "Ingredient Spotlight:",
      "Ingredients spotlight",
      "Key\nIngredients",
    ])("routes to review when the description contains %j", (heading) => {
      const decision = evaluateAcceptance({
        ...GOOD,
        rawText: `A lovely serum.\n${heading}\nNiacinamide\nIngredients: Aqua, Glycerin, Tocopherol`,
      });
      expect(decision.accepted).toBe(false);
      expect(decision.reasons).toHaveLength(1);
      expect(decision.reasons[0]).toMatch(/highlights/i);
    });

    test("quotes the heading it found so the reviewer knows where to look", () => {
      const decision = evaluateAcceptance({
        ...GOOD,
        rawText: "Ingredient Spotlight: Avocado\nIngredients: Aqua, Glycerin, Tocopherol",
      });
      expect(decision.reasons[0]).toContain('"Ingredient Spotlight"');
    });

    test("does not fire on ordinary ingredient wording", () => {
      const decision = evaluateAcceptance({
        ...GOOD,
        rawText:
          "Made with keyingredients-free love. Ingredients: Aqua, Glycerin, Tocopherol. " +
          "All ingredients are organic. Monkey ingredients? No.",
      });
      expect(decision.accepted).toBe(true);
    });
  });

  test("still accepts a clean list whose description has no highlights heading and no duplicates", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      rawText: "A lovely serum.\nIngredients: Aqua, Glycerin, Tocopherol",
    });
    expect(decision).toEqual({ accepted: true, reasons: [] });
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

  test("the C1 rules add their own reasons alongside the others", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "key_ingredients",
      confidence: 0.1,
      ingredients: ings("Unobtainium", "Unobtainium"),
      rawText: "Key Ingredients: Unobtainium",
    });
    expect(decision.reasons).toHaveLength(6);
  });
});
