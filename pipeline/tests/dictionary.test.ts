import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  loadDictionary,
  normalizeToken,
  resolveToken,
  type Dictionary,
} from "../src/dictionary";

const DICT: Dictionary = {
  version: 1,
  entries: [
    {
      inci_name: "Aqua",
      common_name: "Water",
      synonyms: ["Water", "Eau", "Aqua/Water/Eau"],
      flags: [],
    },
    {
      inci_name: "Linalool",
      common_name: null,
      synonyms: [],
      flags: [
        {
          flag_type: "eu_fragrance_allergen",
          source: "EU Cosmetics Regulation 1223/2009 Annex III",
        },
      ],
    },
  ],
};

describe("normalizeToken", () => {
  test("lowercases and trims", () => {
    expect(normalizeToken("  Aqua  ")).toBe("aqua");
  });

  test("strips parenthetical common names", () => {
    expect(normalizeToken("Butyrospermum Parkii (Shea) Butter")).toBe(
      "butyrospermum parkii butter",
    );
  });

  test("collapses internal whitespace", () => {
    expect(normalizeToken("Citrus   Limon  Peel")).toBe("citrus limon peel");
  });

  test("strips trailing punctuation", () => {
    expect(normalizeToken("Glycerin.")).toBe("glycerin");
  });
});

describe("resolveToken", () => {
  test("resolves a canonical name", () => {
    expect(resolveToken(DICT, "Aqua")?.inci_name).toBe("Aqua");
  });

  test("resolves a synonym to its canonical entry", () => {
    expect(resolveToken(DICT, "Water")?.inci_name).toBe("Aqua");
    expect(resolveToken(DICT, "eau")?.inci_name).toBe("Aqua");
  });

  test("returns null for an unknown ingredient", () => {
    expect(resolveToken(DICT, "Unobtainium")).toBeNull();
  });

  test("carries allergen flags through", () => {
    const entry = resolveToken(DICT, "Linalool");
    expect(entry?.flags[0].flag_type).toBe("eu_fragrance_allergen");
  });
});

describe("the real dictionary file", () => {
  const path = fileURLToPath(
    new URL("../../data/ingredient-dictionary.json", import.meta.url),
  );
  const dict = loadDictionary(path);

  test("carries exactly 26 EU fragrance allergen entries", () => {
    const allergens = dict.entries.filter((e) =>
      e.flags.some((f) => f.flag_type === "eu_fragrance_allergen"),
    );
    expect(allergens.length).toBe(26);
  });

  test("has no duplicate normalized inci_name across entries", () => {
    const keys = dict.entries.map((e) => normalizeToken(e.inci_name));
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
