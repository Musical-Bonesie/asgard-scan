import type { Classification, ExtractedIngredient } from "./types";

export const METAFIELD_NAMESPACE = "asgard";
/** metafieldsSet accepts at most 25 metafields per call. */
export const MAX_METAFIELDS_PER_CALL = 25;
const METAFIELDS_PER_PRODUCT = 4;

/**
 * Shopify silently serves retired API versions using the oldest supported
 * one, so pinning this matters: an unpinned or stale version means the code
 * runs against a version nobody chose. Verified as the latest stable release
 * as of 2026-09-11.
 */
export const SHOPIFY_API_VERSION = "2026-07";

export interface MetafieldWrite {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  descriptionHtml: string;
}

export interface BuildParams {
  ingredients: ExtractedIngredient[];
  classification: Classification;
  confidence: number;
  reviewedAt: string;
}

export function buildMetafieldWrites(
  productGid: string,
  params: BuildParams,
): MetafieldWrite[] {
  const ordered = [...params.ingredients].sort(
    (a, b) => a.position - b.position,
  );

  const base = { ownerId: productGid, namespace: METAFIELD_NAMESPACE };

  return [
    {
      ...base,
      key: "inci_list",
      type: "list.single_line_text_field",
      // List metafields take a JSON-encoded array as their value.
      value: JSON.stringify(ordered.map((i) => i.canonical)),
    },
    {
      ...base,
      key: "inci_source",
      type: "single_line_text_field",
      value: params.classification,
    },
    {
      ...base,
      key: "inci_confidence",
      type: "number_decimal",
      value: String(params.confidence),
    },
    {
      ...base,
      key: "inci_reviewed_at",
      type: "date_time",
      value: params.reviewedAt,
    },
  ];
}

/**
 * Split writes into API-sized calls without ever splitting one product across
 * two calls. metafieldsSet is atomic per call, so a split product could end up
 * with an ingredient list but no inci_source marker — precisely the state where
 * a partial list looks complete.
 */
export function chunkMetafields(
  writes: MetafieldWrite[],
  maxPerCall: number = MAX_METAFIELDS_PER_CALL,
): MetafieldWrite[][] {
  const byOwner = new Map<string, MetafieldWrite[]>();
  for (const write of writes) {
    const group = byOwner.get(write.ownerId) ?? [];
    group.push(write);
    byOwner.set(write.ownerId, group);
  }

  const productsPerCall = Math.max(
    1,
    Math.floor(maxPerCall / METAFIELDS_PER_PRODUCT),
  );

  const chunks: MetafieldWrite[][] = [];
  let current: MetafieldWrite[] = [];
  let productsInCurrent = 0;

  for (const group of byOwner.values()) {
    if (productsInCurrent >= productsPerCall) {
      chunks.push(current);
      current = [];
      productsInCurrent = 0;
    }
    current.push(...group);
    productsInCurrent += 1;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title vendor descriptionHtml }
    }
  }
`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

export interface GraphQLClient {
  request(query: string, variables?: Record<string, unknown>): Promise<any>;
}

export const MAX_RETRIES = 5;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface AdminClientOptions {
  /** Test seam: injected fetch implementation. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: injected sleep implementation. Defaults to a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Build a client against the Admin GraphQL API using a custom app token.
 *
 * Shopify uses a leaky-bucket rate limit and answers 429 when it is drained.
 * It also returns THROTTLED inside a 200 response for GraphQL specifically,
 * so checking response.ok alone is not enough.
 */
export function createAdminClient(
  shopDomain: string,
  accessToken: string,
  options?: AdminClientOptions,
): GraphQLClient {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const doFetch = options?.fetchImpl ?? fetch;
  const sleep = options?.sleep ?? realSleep;

  return {
    async request(query, variables = {}) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await doFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables }),
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? 2);
          await sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Shopify API ${response.status}: ${await response.text()}`,
          );
        }

        const json = await response.json();

        // GraphQL throttling arrives as a 200 with an error code.
        const throttled = json.errors?.some(
          (e: { extensions?: { code?: string } }) =>
            e.extensions?.code === "THROTTLED",
        );
        if (throttled) {
          await sleep(2 ** attempt * 1000);
          continue;
        }

        if (json.errors) {
          throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
        }
        return json.data;
      }

      throw new Error(`Shopify API still throttled after ${MAX_RETRIES} retries`);
    },
  };
}

export async function fetchAllProducts(
  client: GraphQLClient,
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  for (;;) {
    const data = await client.request(PRODUCTS_QUERY, { cursor });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

export async function writeMetafields(
  client: GraphQLClient,
  writes: MetafieldWrite[],
): Promise<void> {
  for (const chunk of chunkMetafields(writes)) {
    const data = await client.request(METAFIELDS_SET, { metafields: chunk });
    const errors = data.metafieldsSet.userErrors;
    if (errors.length > 0) {
      throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
    }
  }
}
