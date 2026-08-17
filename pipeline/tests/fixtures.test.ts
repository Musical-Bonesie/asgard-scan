import { describe, expect, test } from "vitest";
import fixtures from "../fixtures/labelled-products.json";
import type { Classification } from "../src/types";

const VALID: Classification[] = [
  "full_list",
  "key_ingredients",
  "active_inactive",
  "none",
];

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
});
