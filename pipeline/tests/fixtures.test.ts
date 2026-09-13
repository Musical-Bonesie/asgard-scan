import { describe, expect, test } from "vitest";
import fixtures from "../fixtures/labelled-products.json";
import { HIGHLIGHTS_HEADING } from "../src/accept";
import { stripHtml } from "../src/strip-html";
import type { Classification } from "../src/types";

const VALID: Classification[] = [
  "full_list",
  "key_ingredients",
  "active_inactive",
  "none",
];

interface LabelledFixture {
  id: number | string;
  title: string;
  vendor: string;
  bodyHtml: string;
  expected: { classification: string; firstIngredient: string | null; minCount: number };
  derived?: boolean;
  derivedFrom?: number | string;
  rationale?: string;
}

const all = fixtures as LabelledFixture[];
const real = all.filter((f) => f.derived !== true);
const derived = all.filter((f) => f.derived === true);

/** True when `candidate` can be produced from `source` by deletions alone. */
function isSubsequence(candidate: string, source: string): boolean {
  let i = 0;
  for (let j = 0; j < source.length && i < candidate.length; j++) {
    if (candidate[i] === source[j]) i++;
  }
  return i === candidate.length;
}

describe("labelled fixture set", () => {
  test("covers every classification case", () => {
    const seen = new Set(fixtures.map((f) => f.expected.classification));
    for (const c of VALID) {
      expect(seen.has(c), `no fixture for "${c}"`).toBe(true);
    }
  });

  test("has enough examples to be meaningful", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  test("every fixture has real description HTML", () => {
    for (const f of fixtures) {
      expect(typeof f.bodyHtml, `${f.title} bodyHtml`).toBe("string");
      if (f.expected.classification !== "none") {
        expect(f.bodyHtml.length, `${f.title} looks empty`).toBeGreaterThan(50);
      }
    }
  });

  test("classifications are valid values", () => {
    for (const f of fixtures) {
      expect(VALID).toContain(f.expected.classification as Classification);
    }
  });

  test("ids and titles are unique", () => {
    expect(new Set(all.map((f) => String(f.id))).size).toBe(all.length);
    expect(new Set(all.map((f) => f.title)).size).toBe(all.length);
  });

  test("every key_ingredients fixture is either derived or carries a written rationale", () => {
    for (const f of all.filter((x) => x.expected.classification === "key_ingredients")) {
      const documented =
        f.derived === true ||
        (typeof f.rationale === "string" && f.rationale.trim().length > 0);
      expect(documented, `${f.title} has neither derived: true nor a rationale`).toBe(true);
    }
  });
});

describe("derived highlights-only fixtures (Ruling 16)", () => {
  test("there are at least 3, so the costliest error is asserted on the shape the spec names", () => {
    expect(derived.length).toBeGreaterThanOrEqual(3);
  });

  test.each(derived.map((f) => [f.title, f] as const))(
    "%s: provenance, label, and deletion-only derivation",
    (_title, f) => {
      // Provenance: derivedFrom names a real (non-derived) fixture.
      const source = real.find((r) => r.id === f.derivedFrom);
      expect(source, `derivedFrom ${String(f.derivedFrom)} is not a real fixture id`).toBeDefined();
      expect(f.id).toBe(`${String(f.derivedFrom)}-derived`);
      expect(f.vendor).toBe(source!.vendor);

      // Label: highlights only, so a partial list by definition.
      expect(f.expected).toEqual({
        classification: "key_ingredients",
        firstIngredient: null,
        minCount: 0,
      });

      // Derived from a real co-occurrence description: its source has a
      // complete list AND a highlights mention...
      expect(source!.expected.classification).toBe("full_list");
      expect(stripHtml(source!.bodyHtml)).toMatch(HIGHLIGHTS_HEADING);

      // ...by deleting text only — nothing added or reworded — so the
      // highlights stay byte-for-byte real.
      expect(f.bodyHtml.length).toBeLessThan(source!.bodyHtml.length);
      expect(isSubsequence(f.bodyHtml, source!.bodyHtml)).toBe(true);

      // The highlights survive and the complete list is gone.
      const text = stripHtml(f.bodyHtml);
      expect(text).toMatch(HIGHLIGHTS_HEADING);
      expect(text).not.toContain(`${source!.expected.firstIngredient},`);
    },
  );
});
