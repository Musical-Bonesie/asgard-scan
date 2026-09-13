import { describe, expect, test } from "vitest";
import { stripHtml } from "../src/strip-html";

describe("stripHtml", () => {
  test("removes tags and keeps text", () => {
    expect(stripHtml("<p>Aqua, Glycerin</p>")).toBe("Aqua, Glycerin");
  });

  test("turns block tags into newlines so sections stay separate", () => {
    // Without this, "Ingredients:" would run into the list and the
    // classifier would see one blob instead of a labelled section.
    expect(stripHtml("<p>Ingredients:</p><p>Aqua</p>")).toBe(
      "Ingredients:\nAqua",
    );
  });

  test("decodes the entities Shopify descriptions actually contain", () => {
    expect(stripHtml("<p>Water &amp; Glycerin&nbsp;Extract</p>")).toBe(
      "Water & Glycerin Extract",
    );
  });

  test("collapses runs of whitespace but preserves line structure", () => {
    expect(stripHtml("<p>Aqua   ,    Glycerin</p>")).toBe("Aqua , Glycerin");
  });

  test("handles an empty or null-ish description", () => {
    expect(stripHtml("")).toBe("");
  });
});
