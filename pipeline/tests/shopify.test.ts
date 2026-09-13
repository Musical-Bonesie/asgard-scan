import { describe, expect, test, vi } from "vitest";
import {
  buildMetafieldWrites,
  chunkMetafields,
  createAdminClient,
  MAX_RETRIES,
  METAFIELD_NAMESPACE,
  SHOPIFY_API_VERSION,
} from "../src/shopify";

const GID = "gid://shopify/Product/123";

describe("buildMetafieldWrites", () => {
  const writes = buildMetafieldWrites(GID, {
    ingredients: [
      { raw: "Aqua", canonical: "Aqua", position: 0 },
      { raw: "Glycerin", canonical: "Glycerin", position: 1 },
    ],
    classification: "full_list",
    confidence: 0.95,
    reviewedAt: "2026-08-17T10:00:00Z",
  });

  function get(key: string) {
    return writes.find((w) => w.key === key)!;
  }

  test("writes all four metafields in the asgard namespace", () => {
    expect(writes).toHaveLength(4);
    expect(writes.every((w) => w.namespace === METAFIELD_NAMESPACE)).toBe(true);
    expect(writes.every((w) => w.ownerId === GID)).toBe(true);
  });

  test("encodes the ingredient list as a JSON array string, in order", () => {
    const list = get("inci_list");
    expect(list.type).toBe("list.single_line_text_field");
    expect(JSON.parse(list.value)).toEqual(["Aqua", "Glycerin"]);
  });

  test("records the source so a partial list is never mistaken for complete", () => {
    expect(get("inci_source").value).toBe("full_list");
  });

  test("records confidence and review timestamp", () => {
    expect(get("inci_confidence").value).toBe("0.95");
    expect(get("inci_reviewed_at").type).toBe("date_time");
    expect(get("inci_reviewed_at").value).toBe("2026-08-17T10:00:00Z");
  });

  test("marks key_ingredients as partial in inci_source", () => {
    const partial = buildMetafieldWrites(GID, {
      ingredients: [{ raw: "Niacinamide", canonical: "Niacinamide", position: 0 }],
      classification: "key_ingredients",
      confidence: 0.8,
      reviewedAt: "2026-08-17T10:00:00Z",
    });
    expect(partial.find((w) => w.key === "inci_source")!.value).toBe(
      "key_ingredients",
    );
  });

  test.each([
    [0.9, "0.90"],
    [1, "1.00"],
    [0, "0.00"],
    [0.873, "0.87"],
  ])("writes inci_confidence %s with exactly two decimals as %j (spec: 0.00–1.00)", (confidence, expected) => {
    const w = buildMetafieldWrites(GID, {
      ingredients: [{ raw: "Aqua", canonical: "Aqua", position: 0 }],
      classification: "full_list",
      confidence,
      reviewedAt: null,
    });
    const write = w.find((x) => x.key === "inci_confidence")!;
    expect(write.type).toBe("number_decimal");
    expect(write.value).toBe(expected);
  });

  test("throws for a none classification — the spec writes no metafields for these (I6)", () => {
    expect(() =>
      buildMetafieldWrites(GID, {
        ingredients: [{ raw: "Aqua", canonical: "Aqua", position: 0 }],
        classification: "none",
        confidence: 1,
        reviewedAt: "2026-08-17T10:00:00Z",
      }),
    ).toThrow(/none/);
  });

  test("throws for an empty ingredient list rather than writing inci_list: [] (I6)", () => {
    expect(() =>
      buildMetafieldWrites(GID, {
        ingredients: [],
        classification: "full_list",
        confidence: 0.95,
        reviewedAt: "2026-08-17T10:00:00Z",
      }),
    ).toThrow(/empty/);
  });

  test("orders inci_list by position, never by array order", () => {
    const w = buildMetafieldWrites(GID, {
      ingredients: [
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
        { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
        { raw: "Aqua", canonical: "Aqua", position: 0 },
      ],
      classification: "full_list",
      confidence: 0.95,
      reviewedAt: null,
    });
    expect(JSON.parse(w.find((x) => x.key === "inci_list")!.value)).toEqual([
      "Aqua",
      "Glycerin",
      "Tocopherol",
    ]);
  });

  test("omits inci_reviewed_at entirely when reviewedAt is null (auto-accepted, unreviewed)", () => {
    const unreviewed = buildMetafieldWrites(GID, {
      ingredients: [{ raw: "Aqua", canonical: "Aqua", position: 0 }],
      classification: "full_list",
      confidence: 0.95,
      reviewedAt: null,
    });
    expect(unreviewed).toHaveLength(3);
    expect(unreviewed.map((w) => w.key).sort()).toEqual(
      ["inci_confidence", "inci_list", "inci_source"].sort(),
    );
    expect(unreviewed.find((w) => w.key === "inci_reviewed_at")).toBeUndefined();
  });
});

describe("chunkMetafields", () => {
  test("never exceeds the 25-metafield API limit", () => {
    // 10 products x 4 metafields = 40 writes
    const writes = Array.from({ length: 40 }, (_, i) => ({
      ownerId: `gid://shopify/Product/${i}`,
      namespace: METAFIELD_NAMESPACE,
      key: "inci_list",
      type: "list.single_line_text_field",
      value: "[]",
    }));

    const chunks = chunkMetafields(writes);

    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.flat()).toHaveLength(40);
  });

  test("keeps a product's four metafields together in one chunk", () => {
    // metafieldsSet is atomic per call, so splitting a product across two
    // calls could leave it with a list but no source marker.
    const writes = Array.from({ length: 12 }, (_, i) => ({
      ownerId: `gid://shopify/Product/${Math.floor(i / 4)}`,
      namespace: METAFIELD_NAMESPACE,
      key: `k${i % 4}`,
      type: "single_line_text_field",
      value: "x",
    }));

    const chunks = chunkMetafields(writes, 8);

    for (const chunk of chunks) {
      const owners = new Set(chunk.map((w) => w.ownerId));
      for (const owner of owners) {
        const inChunk = chunk.filter((w) => w.ownerId === owner).length;
        const total = writes.filter((w) => w.ownerId === owner).length;
        expect(inChunk).toBe(total);
      }
    }
  });

  function group(ownerId: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      ownerId,
      namespace: METAFIELD_NAMESPACE,
      key: `k${i}`,
      type: "single_line_text_field",
      value: "x",
    }));
  }

  test("packs a mix of 3-write and 4-write products without exceeding the limit or splitting a product", () => {
    // Auto-accepted products get 3 writes (no inci_reviewed_at); reviewed ones get 4.
    const writes = [
      ...group("p1", 3),
      ...group("p2", 4),
      ...group("p3", 3),
      ...group("p4", 4),
      ...group("p5", 3),
      ...group("p6", 4),
      ...group("p7", 3),
      ...group("p8", 4),
      ...group("p9", 3),
    ];

    const chunks = chunkMetafields(writes, 25);

    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.flat()).toHaveLength(writes.length);
    for (const chunk of chunks) {
      const owners = new Set(chunk.map((w) => w.ownerId));
      for (const owner of owners) {
        const inChunk = chunk.filter((w) => w.ownerId === owner).length;
        const total = writes.filter((w) => w.ownerId === owner).length;
        expect(inChunk).toBe(total);
      }
    }
  });

  test("packs near the boundary by real group size: 7 x 4-write products at maxPerCall 25 yields 24 then 4, not seven chunks", () => {
    const writes = Array.from({ length: 7 }, (_, i) => group(`p${i}`, 4)).flat();

    const chunks = chunkMetafields(writes, 25);

    expect(chunks.map((c) => c.length)).toEqual([24, 4]);
  });

  test("throws when a single product's group is larger than maxPerCall rather than splitting it", () => {
    const writes = group("p1", 5);
    expect(() => chunkMetafields(writes, 4)).toThrow();
  });
});

describe("createAdminClient retry behavior", () => {
  const noopSleep = () => Promise.resolve();

  function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: init?.headers,
    });
  }

  test("retries after a 429 with Retry-After, then resolves", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 429, headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    const client = createAdminClient("shop.myshopify.com", "token", {
      fetchImpl,
      sleep: noopSleep,
    });

    const result = await client.request("query {}");

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("retries a THROTTLED GraphQL error returned with HTTP 200, then resolves", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ errors: [{ extensions: { code: "THROTTLED" } }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    const client = createAdminClient("shop.myshopify.com", "token", {
      fetchImpl,
      sleep: noopSleep,
    });

    const result = await client.request("query {}");

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("rejects with a retry-limit error after exhausting retries on persistent throttling", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ errors: [{ extensions: { code: "THROTTLED" } }] }),
        ),
      );

    const client = createAdminClient("shop.myshopify.com", "token", {
      fetchImpl,
      sleep: noopSleep,
    });

    await expect(client.request("query {}")).rejects.toThrow(/retries|retry/i);
    // MAX_RETRIES retries plus the initial attempt.
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  test("rejects immediately, without retrying, on a non-throttle GraphQL error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ errors: [{ message: "bad field" }] }));

    const client = createAdminClient("shop.myshopify.com", "token", {
      fetchImpl,
      sleep: noopSleep,
    });

    await expect(client.request("query {}")).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("requests the pinned API version and sends the access token header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));

    const client = createAdminClient("shop.myshopify.com", "secret-token", {
      fetchImpl,
      sleep: noopSleep,
    });

    await client.request("query {}");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain(`/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
    expect(String(url)).toContain("/admin/api/2026-07/graphql.json");
    expect((init.headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe(
      "secret-token",
    );
  });
});
