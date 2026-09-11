import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { evaluateAcceptance } from "./accept";
import { createAnthropicClient } from "./anthropic-client";
import { classifyDescription } from "./classify";
import {
  loadCandidates,
  saveCandidates,
  upsertCandidate,
  type Candidate,
} from "./candidates";
import { loadDictionary, type Dictionary } from "./dictionary";
import { extractIngredients } from "./extract";
import {
  createAdminClient,
  fetchAllProducts,
  type ShopifyProduct,
} from "./shopify";
import { stripHtml } from "./strip-html";
import type { ClassifyResult, ExtractResult } from "./types";

// Resolved relative to this module, not the process cwd — the pipeline runs
// from inside pipeline/, where a cwd-relative "data/..." would resolve to
// pipeline/data/ instead of the repo-root data/ directory.
const DICTIONARY_PATH = fileURLToPath(
  new URL("../../data/ingredient-dictionary.json", import.meta.url),
);
const CANDIDATES_PATH = fileURLToPath(
  new URL("../../data/candidates.json", import.meta.url),
);
const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

const CONCURRENCY = 5;

export interface ProcessDeps {
  dictionary: Dictionary;
  classify: (text: string) => Promise<ClassifyResult>;
  extract: (
    text: string,
    classification: ClassifyResult["classification"],
  ) => Promise<ExtractResult>;
}

/** Run both passes for one product and decide whether it needs review. */
export async function processProduct(
  deps: ProcessDeps,
  product: ShopifyProduct,
): Promise<Candidate> {
  const text = stripHtml(product.descriptionHtml);
  const classified = await deps.classify(text);

  const extracted =
    classified.classification === "none"
      ? { ingredients: [], confidence: classified.confidence, notes: "" }
      : await deps.extract(text, classified.classification);

  const decision = evaluateAcceptance({
    classification: classified.classification,
    confidence: Math.min(classified.confidence, extracted.confidence),
    ingredients: extracted.ingredients,
    dictionary: deps.dictionary,
  });

  return {
    productGid: product.id,
    productTitle: product.title,
    vendor: product.vendor,
    rawText: text,
    classification: classified.classification,
    proposedList: extracted.ingredients,
    confidence: Math.min(classified.confidence, extracted.confidence),
    reasons: decision.reasons,
    status: decision.accepted ? "approved" : "pending",
    reviewedAt: null,
  };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export interface ProcessFailure {
  product: ShopifyProduct;
  /** error.message, never the raw error object — callers must not leak secrets. */
  error: string;
}

export interface ProcessAllResult {
  /** In input order. Excludes any product that failed. */
  candidates: Candidate[];
  failures: ProcessFailure[];
}

export interface ProcessAllProgress {
  index: number;
  total: number;
  product: ShopifyProduct;
  candidate?: Candidate;
  error?: string;
}

/**
 * Process every product, isolating per-product failures.
 *
 * mapWithConcurrency's Promise.all rejects the whole batch on the first
 * failure: with ~95 products x 2 model calls, a single transient 529,
 * network blip, truncation, or refusal would otherwise lose every
 * already-completed (and already-paid-for) candidate along with it. Each
 * product's error is caught here instead, recorded in `failures`, and the
 * batch continues — so a re-run only needs to retry what actually failed.
 */
export async function processAll(
  deps: ProcessDeps,
  products: ShopifyProduct[],
  concurrency: number,
  onProgress?: (progress: ProcessAllProgress) => void,
): Promise<ProcessAllResult> {
  type Outcome =
    | { ok: true; candidate: Candidate }
    | { ok: false; failure: ProcessFailure };

  let done = 0;
  const outcomes = await mapWithConcurrency<ShopifyProduct, Outcome>(
    products,
    concurrency,
    async (product) => {
      try {
        const candidate = await processProduct(deps, product);
        done += 1;
        onProgress?.({ index: done, total: products.length, product, candidate });
        return { ok: true, candidate };
      } catch (error) {
        done += 1;
        const message = error instanceof Error ? error.message : String(error);
        onProgress?.({ index: done, total: products.length, product, error: message });
        return { ok: false, failure: { product, error: message } };
      }
    },
  );

  const candidates: Candidate[] = [];
  const failures: ProcessFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) candidates.push(outcome.candidate);
    else failures.push(outcome.failure);
  }
  return { candidates, failures };
}

/**
 * Re-run ONLY the accept bar against a grown dictionary, reusing the cached
 * extractions.
 *
 * This is the spec's stage 3. Growing the dictionary is an iterative loop, and
 * re-extracting on every pass would re-pay the full model cost to re-test a
 * pure function. Already-reviewed candidates are left alone — a human decision
 * outranks the bar.
 */
export function reevaluateCandidates(
  candidates: Candidate[],
  dictionary: Dictionary,
): Candidate[] {
  return candidates.map((candidate) => {
    if (candidate.status !== "pending") return candidate;

    const decision = evaluateAcceptance({
      classification: candidate.classification,
      confidence: candidate.confidence,
      ingredients: candidate.proposedList,
      dictionary,
    });

    return {
      ...candidate,
      reasons: decision.reasons,
      status: decision.accepted ? "approved" : "pending",
    };
  });
}

export async function reevaluateMain(): Promise<void> {
  const dictionary = loadDictionary(DICTIONARY_PATH);
  const before = loadCandidates(CANDIDATES_PATH);
  const after = reevaluateCandidates(before, dictionary);
  saveCandidates(CANDIDATES_PATH, after);

  const pendingBefore = before.filter((c) => c.status === "pending").length;
  const pendingAfter = after.filter((c) => c.status === "pending").length;
  console.log(
    `Re-evaluated ${before.length} candidates against dictionary v${dictionary.version}.`,
  );
  console.log(
    `Pending: ${pendingBefore} -> ${pendingAfter} (${pendingBefore - pendingAfter} newly auto-accepted). No model calls made.`,
  );
}

/**
 * Parse PIPELINE_LIMIT: only a bare positive integer (after trimming) caps
 * how many products main() processes; everything else means "process
 * everything".
 *
 * Deliberately stricter than Number.parseInt, which parses a leading prefix
 * and silently accepts the rest: "2.5" -> 2, "10abc" -> 10, "1e3" -> 1. Each
 * of those would run the wrong number of paid model calls without any
 * indication that the value was actually malformed.
 */
export function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return n > 0 ? n : undefined;
}

/**
 * Drop products whose STORED candidate has already been reviewed by a
 * human (reviewedAt !== null).
 *
 * upsertCandidate replaces by productGid, so re-running extraction against
 * an already-reviewed product would silently overwrite a human's decision
 * (e.g. a rejection) with a fresh auto-evaluation and reset reviewedAt to
 * null — the exact thing reevaluateCandidates's "a human decision outranks
 * the bar" invariant forbids — and re-pay model cost for no benefit. A
 * product with no stored candidate, or one still pending, is processed
 * normally.
 */
export function selectProductsToProcess(
  products: ShopifyProduct[],
  stored: Candidate[],
): ShopifyProduct[] {
  const reviewed = new Set(
    stored.filter((c) => c.reviewedAt !== null).map((c) => c.productGid),
  );
  return products.filter((p) => !reviewed.has(p.id));
}

async function main(): Promise<void> {
  config({ path: ENV_PATH });

  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopToken = process.env.SHOPIFY_ADMIN_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!shop || !shopToken || !anthropicKey) {
    throw new Error(
      "Missing env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_TOKEN, ANTHROPIC_API_KEY",
    );
  }

  const dictionary = loadDictionary(DICTIONARY_PATH);
  const anthropic = createAnthropicClient(anthropicKey);
  const admin = createAdminClient(shop, shopToken);

  console.log("Fetching catalogue...");
  let products = await fetchAllProducts(admin);
  console.log(`${products.length} products`);

  const limit = parseLimit(process.env.PIPELINE_LIMIT);
  if (limit !== undefined && limit < products.length) {
    console.log(`PIPELINE_LIMIT=${limit}: processing only the first ${limit}.`);
    products = products.slice(0, limit);
  }

  let stored = loadCandidates(CANDIDATES_PATH);
  const toProcess = selectProductsToProcess(products, stored);
  const alreadyReviewed = products.length - toProcess.length;
  if (alreadyReviewed > 0) {
    console.log(
      `Skipping ${alreadyReviewed} already-reviewed product(s) — human decisions are never overwritten.`,
    );
  }

  const deps: ProcessDeps = {
    dictionary,
    classify: (text) => classifyDescription(anthropic, text),
    extract: (text, classification) =>
      extractIngredients(anthropic, text, classification),
  };

  const { candidates, failures } = await processAll(
    deps,
    toProcess,
    CONCURRENCY,
    (progress) => {
      if (progress.candidate) {
        console.log(
          `[${progress.index}/${progress.total}] ${progress.candidate.status.padEnd(8)} ${progress.product.title}`,
        );
      } else {
        console.log(
          `[${progress.index}/${progress.total}] FAILED   ${progress.product.title}: ${progress.error}`,
        );
      }
    },
  );

  for (const candidate of candidates) {
    stored = upsertCandidate(stored, candidate);
  }
  saveCandidates(CANDIDATES_PATH, stored);

  const approved = candidates.filter((c) => c.status === "approved").length;
  console.log(
    `\nDone. ${approved} auto-accepted, ${candidates.length - approved} need review.`,
  );
  if (failures.length > 0) {
    console.log(
      `${failures.length} product(s) failed and were NOT saved — re-run to retry them:`,
    );
    for (const failure of failures) {
      console.log(`  - ${failure.product.title}: ${failure.error}`);
    }
  }
  console.log(`Review them at /app/review — nothing has been written to Shopify yet.`);
}

// Only run when executed directly, so tests can import this module freely.
if (process.argv[1]?.endsWith("run.ts")) {
  const entry = process.argv.includes("--reevaluate") ? reevaluateMain : main;
  entry().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
