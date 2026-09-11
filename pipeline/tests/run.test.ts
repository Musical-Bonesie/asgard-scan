import { describe, expect, test, vi } from "vitest";
import {
  mapWithConcurrency,
  parseLimit,
  processAll,
  processProduct,
  publishApproved,
  reevaluateCandidates,
  selectProductsToProcess,
} from "../src/run";
import type { Candidate } from "../src/candidates";
import type { Dictionary } from "../src/dictionary";
import type { GraphQLClient } from "../src/shopify";

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
    publishedAt: null,
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
    publishedAt: null,
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
      publishedAt: null,
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
      publishedAt: null,
    };
    const result = selectProductsToProcess(
      [reviewedProduct, pendingProduct, newProduct],
      [storedBase, storedPending],
    );
    expect(result.map((p) => p.id)).toEqual([pendingProduct.id, newProduct.id]);
  });

  test("skips a product whose stored candidate has already been published, even if never reviewed", () => {
    const publishedProduct = {
      id: "gid://shopify/Product/4",
      title: "Published",
      vendor: "V",
      descriptionHtml: "",
    };
    const storedPublished: Candidate = {
      ...storedBase,
      productGid: publishedProduct.id,
      status: "approved",
      reviewedAt: null,
      publishedAt: "2026-01-02T00:00:00.000Z",
    };
    const result = selectProductsToProcess([publishedProduct], [storedPublished]);
    expect(result).toEqual([]);
  });
});

describe("publishApproved", () => {
  function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
    return {
      productGid: "gid://shopify/Product/1",
      productTitle: "Test Serum",
      vendor: "Test Brand",
      rawText: "Ingredients: Aqua",
      classification: "full_list",
      proposedList: [{ raw: "Aqua", canonical: "Aqua", position: 0 }],
      confidence: 0.95,
      reasons: [],
      status: "approved",
      reviewedAt: null,
      publishedAt: null,
      ...overrides,
    };
  }

  function fakeClient(
    impl: (query: string, variables?: Record<string, unknown>) => Promise<any>,
  ): GraphQLClient {
    return { request: vi.fn(impl) };
  }

  test("publishes only approved, unpublished candidates and stamps publishedAt with now()", async () => {
    const approved = makeCandidate();
    const pending = makeCandidate({
      productGid: "gid://shopify/Product/2",
      status: "pending",
    });
    const client = fakeClient(async () => ({
      metafieldsSet: { metafields: [], userErrors: [] },
    }));

    const result = await publishApproved(
      client,
      [approved, pending],
      () => "2026-09-11T00:00:00.000Z",
    );

    const published = result.candidates.find(
      (c) => c.productGid === approved.productGid,
    )!;
    expect(published.publishedAt).toBe("2026-09-11T00:00:00.000Z");
    expect(result.published).toBe(1);
  });

  test("skips pending, rejected, and already-published candidates without making a request for them", async () => {
    const pending = makeCandidate({
      productGid: "gid://shopify/Product/1",
      status: "pending",
    });
    const rejected = makeCandidate({
      productGid: "gid://shopify/Product/2",
      status: "rejected",
    });
    const alreadyPublished = makeCandidate({
      productGid: "gid://shopify/Product/3",
      status: "approved",
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    const client = fakeClient(async () => ({
      metafieldsSet: { metafields: [], userErrors: [] },
    }));

    const result = await publishApproved(
      client,
      [pending, rejected, alreadyPublished],
      () => "2026-09-11T00:00:00.000Z",
    );

    expect(client.request).not.toHaveBeenCalled();
    expect(result.published).toBe(0);
    expect(result.candidates).toEqual([pending, rejected, alreadyPublished]);
  });

  test("writes an auto-accepted candidate (reviewedAt null) without inci_reviewed_at", async () => {
    const approved = makeCandidate({ reviewedAt: null });
    let sentMetafields: any[] = [];
    const client = fakeClient(async (_query, variables) => {
      sentMetafields = variables!.metafields as any[];
      return { metafieldsSet: { metafields: [], userErrors: [] } };
    });

    await publishApproved(client, [approved], () => "2026-09-11T00:00:00.000Z");

    expect(sentMetafields.map((m) => m.key).sort()).toEqual(
      ["inci_confidence", "inci_list", "inci_source"].sort(),
    );
  });

  test("writes a human-approved candidate (reviewedAt set) with all four metafields, including inci_reviewed_at", async () => {
    const approved = makeCandidate({ reviewedAt: "2026-09-01T10:00:00Z" });
    let sentMetafields: any[] = [];
    const client = fakeClient(async (_query, variables) => {
      sentMetafields = variables!.metafields as any[];
      return { metafieldsSet: { metafields: [], userErrors: [] } };
    });

    await publishApproved(client, [approved], () => "2026-09-11T00:00:00.000Z");

    expect(sentMetafields).toHaveLength(4);
    expect(sentMetafields.map((m) => m.key).sort()).toEqual(
      ["inci_confidence", "inci_list", "inci_reviewed_at", "inci_source"].sort(),
    );
    const reviewedAtWrite = sentMetafields.find((m) => m.key === "inci_reviewed_at");
    expect(reviewedAtWrite.value).toBe("2026-09-01T10:00:00Z");
  });

  test("one product's write failing leaves it unpublished, records the failure, and still publishes the others", async () => {
    const failing = makeCandidate({
      productGid: "gid://shopify/Product/1",
      productTitle: "Failing Product",
    });
    const succeeding = makeCandidate({
      productGid: "gid://shopify/Product/2",
      productTitle: "Succeeding Product",
    });

    const client = fakeClient(async (_query, variables) => {
      const metafields = variables!.metafields as any[];
      if (metafields.some((m) => m.ownerId === failing.productGid)) {
        return {
          metafieldsSet: {
            metafields: [],
            userErrors: [{ field: ["metafields"], message: "boom", code: "INVALID" }],
          },
        };
      }
      return { metafieldsSet: { metafields: [], userErrors: [] } };
    });

    const result = await publishApproved(
      client,
      [failing, succeeding],
      () => "2026-09-11T00:00:00.000Z",
    );

    const failedCandidate = result.candidates.find(
      (c) => c.productGid === failing.productGid,
    )!;
    const succeededCandidate = result.candidates.find(
      (c) => c.productGid === succeeding.productGid,
    )!;
    expect(failedCandidate.publishedAt).toBeNull();
    expect(succeededCandidate.publishedAt).toBe("2026-09-11T00:00:00.000Z");
    expect(result.published).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].productGid).toBe(failing.productGid);
    expect(result.failures[0].productTitle).toBe("Failing Product");
    expect(result.failures[0].error).toMatch(/boom/);
  });

  test("a malformed candidate (e.g. hand-edited proposedList) between two valid ones fails in isolation without rejecting the whole publish", async () => {
    const before = makeCandidate({
      productGid: "gid://shopify/Product/1",
      productTitle: "Before",
    });
    const malformed = makeCandidate({
      productGid: "gid://shopify/Product/2",
      productTitle: "Malformed",
      // Simulates an operator hand-edit of candidates.json leaving
      // proposedList null instead of an array.
      proposedList: null as unknown as Candidate["proposedList"],
    });
    const after = makeCandidate({
      productGid: "gid://shopify/Product/3",
      productTitle: "After",
    });
    const client = fakeClient(async () => ({
      metafieldsSet: { metafields: [], userErrors: [] },
    }));

    const result = await publishApproved(
      client,
      [before, malformed, after],
      () => "2026-09-11T00:00:00.000Z",
    );

    const beforeCandidate = result.candidates.find(
      (c) => c.productGid === before.productGid,
    )!;
    const malformedCandidate = result.candidates.find(
      (c) => c.productGid === malformed.productGid,
    )!;
    const afterCandidate = result.candidates.find(
      (c) => c.productGid === after.productGid,
    )!;

    expect(beforeCandidate.publishedAt).toBe("2026-09-11T00:00:00.000Z");
    expect(afterCandidate.publishedAt).toBe("2026-09-11T00:00:00.000Z");
    expect(malformedCandidate.publishedAt).toBeNull();
    expect(result.published).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].productGid).toBe(malformed.productGid);
    expect(result.failures[0].productTitle).toBe("Malformed");
  });

  test("returns the full candidate list in the same order and length as the input", async () => {
    const a = makeCandidate({ productGid: "gid://shopify/Product/1" });
    const b = makeCandidate({ productGid: "gid://shopify/Product/2", status: "pending" });
    const c = makeCandidate({ productGid: "gid://shopify/Product/3" });
    const client = fakeClient(async () => ({
      metafieldsSet: { metafields: [], userErrors: [] },
    }));

    const result = await publishApproved(client, [a, b, c], () => "now");

    expect(result.candidates.map((x) => x.productGid)).toEqual([
      a.productGid,
      b.productGid,
      c.productGid,
    ]);
  });

  test("makes one writeMetafields call per product, not one big batched call", async () => {
    const a = makeCandidate({ productGid: "gid://shopify/Product/1" });
    const b = makeCandidate({ productGid: "gid://shopify/Product/2" });
    const client = fakeClient(async () => ({
      metafieldsSet: { metafields: [], userErrors: [] },
    }));

    await publishApproved(client, [a, b], () => "now");

    expect(client.request).toHaveBeenCalledTimes(2);
  });
});
