import { describe, expect, test, vi } from "vitest";
import {
  mapWithConcurrency,
  parseLimit,
  processAll,
  processProduct,
  reevaluateCandidates,
  selectProductsToProcess,
} from "../src/run";
import type { Candidate } from "../src/candidates";
import type { Dictionary } from "../src/dictionary";

const DICT: Dictionary = {
  version: 1,
  entries: [
    { inci_name: "Aqua", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Glycerin", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Tocopherol", common_name: null, synonyms: [], flags: [] },
  ],
};

const PRODUCT = {
  id: "gid://shopify/Product/1",
  title: "Test Serum",
  vendor: "Test Brand",
  descriptionHtml: "<p>Ingredients: Aqua, Glycerin, Tocopherol</p>",
};

function deps(classification: string, confidence: number) {
  return {
    dictionary: DICT,
    classify: vi.fn().mockResolvedValue({
      classification,
      reasoning: "",
      confidence,
    }),
    extract: vi.fn().mockResolvedValue({
      ingredients: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
        { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
      ],
      confidence,
      notes: "",
    }),
  };
}

describe("processProduct", () => {
  test("marks a clean full list as approved", async () => {
    const candidate = await processProduct(deps("full_list", 0.95), PRODUCT);
    expect(candidate.status).toBe("approved");
    expect(candidate.reasons).toEqual([]);
  });

  test("routes key_ingredients to pending review", async () => {
    const candidate = await processProduct(
      deps("key_ingredients", 0.99),
      PRODUCT,
    );
    expect(candidate.status).toBe("pending");
    expect(candidate.reasons.join(" ")).toMatch(/key_ingredients/i);
  });

  test("routes low confidence to pending review", async () => {
    const candidate = await processProduct(deps("full_list", 0.4), PRODUCT);
    expect(candidate.status).toBe("pending");
  });

  test("skips the extract call entirely when there is no ingredient data", async () => {
    const d = deps("none", 1);
    const candidate = await processProduct(d, PRODUCT);
    expect(d.extract).not.toHaveBeenCalled();
    expect(candidate.status).toBe("pending");
  });

  test("carries the stripped description for the reviewer", async () => {
    const candidate = await processProduct(deps("full_list", 0.95), PRODUCT);
    expect(candidate.rawText).toBe("Ingredients: Aqua, Glycerin, Tocopherol");
  });
});

describe("reevaluateCandidates", () => {
  const base = {
    productGid: "gid://shopify/Product/1",
    productTitle: "T",
    vendor: "V",
    rawText: "x",
    classification: "full_list" as const,
    proposedList: [
      { raw: "Aqua", canonical: "Aqua", position: 0 },
      { raw: "Glycerin", canonical: "Glycerin", position: 1 },
      { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
    ],
    confidence: 0.95,
    reasons: ["unrecognised ingredients: Tocopherol"],
    status: "pending" as const,
    reviewedAt: null,
  };

  test("promotes a candidate once the dictionary covers its ingredients", () => {
    const [result] = reevaluateCandidates([base], DICT);
    expect(result.status).toBe("approved");
    expect(result.reasons).toEqual([]);
  });

  test("leaves an already-reviewed candidate alone", () => {
    // A human decision outranks the automated bar.
    const rejected = { ...base, status: "rejected" as const };
    const [result] = reevaluateCandidates([rejected], DICT);
    expect(result.status).toBe("rejected");
  });

  test("keeps a candidate pending when the dictionary still lacks an ingredient", () => {
    const withUnknown = {
      ...base,
      proposedList: [
        ...base.proposedList,
        { raw: "Unobtainium", canonical: "Unobtainium", position: 3 },
      ],
    };
    const [result] = reevaluateCandidates([withUnknown], DICT);
    expect(result.status).toBe("pending");
    expect(result.reasons.join(" ")).toMatch(/Unobtainium/);
  });
});

describe("mapWithConcurrency", () => {
  test("processes every item", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 5, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(5);
  });

  test("preserves input order in the output", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n * 10));
      return n;
    });
    expect(result).toEqual([3, 1, 2]);
  });
});

describe("parseLimit", () => {
  test.each([
    [undefined, undefined],
    ["", undefined],
    ["0", undefined],
    ["-3", undefined],
    ["abc", undefined],
    ["2.5", undefined],
    ["10abc", undefined],
    ["1e3", undefined],
    ["5", 5],
    [" 7 ", 7],
  ] as const)("parseLimit(%j) -> %j", (input, expected) => {
    expect(parseLimit(input)).toBe(expected);
  });
});

describe("processAll", () => {
  const makeProduct = (n: number) => ({
    id: `gid://shopify/Product/${n}`,
    title: `Product ${n}`,
    vendor: "Test Brand",
    descriptionHtml: `<p>Ingredients: Aqua, Glycerin, Tocopherol (marker ${n})</p>`,
  });

  test("isolates one product's failure, keeps the rest as candidates, and reports it", async () => {
    const products = [makeProduct(1), makeProduct(2), makeProduct(3)];

    const classify = vi.fn().mockImplementation(async (text: string) => {
      if (text.includes("(marker 2)")) {
        throw new Error("simulated 529 overload");
      }
      return { classification: "full_list", reasoning: "", confidence: 0.95 };
    });
    const extract = vi.fn().mockResolvedValue({
      ingredients: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
        { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
      ],
      confidence: 0.95,
      notes: "",
    });

    const result = await processAll(
      { dictionary: DICT, classify, extract },
      products,
      3,
    );

    // The middle product failed; the other two still come back as
    // candidates, in their original input order.
    expect(result.candidates.map((c) => c.productGid)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/3",
    ]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].product.title).toBe("Product 2");
    expect(result.failures[0].error).toMatch(/simulated 529 overload/);
  });
});

describe("selectProductsToProcess", () => {
  const reviewedProduct = {
    id: "gid://shopify/Product/1",
    title: "Reviewed",
    vendor: "V",
    descriptionHtml: "",
  };
  const pendingProduct = {
    id: "gid://shopify/Product/2",
    title: "Pending",
    vendor: "V",
    descriptionHtml: "",
  };
  const newProduct = {
    id: "gid://shopify/Product/3",
    title: "New",
    vendor: "V",
    descriptionHtml: "",
  };

  const storedBase: Candidate = {
    productGid: reviewedProduct.id,
    productTitle: "Reviewed",
    vendor: "V",
    rawText: "",
    classification: "full_list",
    proposedList: [],
    confidence: 0.5,
    reasons: [],
    status: "rejected",
    reviewedAt: "2026-01-01T00:00:00.000Z",
  };

  test("skips a product whose stored candidate has already been reviewed", () => {
    const result = selectProductsToProcess([reviewedProduct], [storedBase]);
    expect(result).toEqual([]);
  });

  test("processes a product whose stored candidate is pending with reviewedAt null", () => {
    const storedPending: Candidate = {
      ...storedBase,
      productGid: pendingProduct.id,
      status: "pending",
      reviewedAt: null,
    };
    const result = selectProductsToProcess([pendingProduct], [storedPending]);
    expect(result).toEqual([pendingProduct]);
  });

  test("processes a product with no stored candidate at all", () => {
    const result = selectProductsToProcess([newProduct], [storedBase]);
    expect(result).toEqual([newProduct]);
  });

  test("filters a mixed list, preserving order", () => {
    const storedPending: Candidate = {
      ...storedBase,
      productGid: pendingProduct.id,
      status: "pending",
      reviewedAt: null,
    };
    const result = selectProductsToProcess(
      [reviewedProduct, pendingProduct, newProduct],
      [storedBase, storedPending],
    );
    expect(result.map((p) => p.id)).toEqual([pendingProduct.id, newProduct.id]);
  });
});
