import { describe, expect, test, vi } from "vitest";
import {
  buildMetafieldWrites,
  chunkMetafields,
  createAdminClient,
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
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
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
