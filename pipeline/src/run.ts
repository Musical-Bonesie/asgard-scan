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
 * Read PIPELINE_LIMIT from the environment: a positive integer caps how many
 * products main() processes, for cheap dry runs against a real store without
 * editing source. Anything invalid or absent means "process everything" —
 * this is a convenience knob, not a correctness gate, so it fails open.
 */
function readPipelineLimit(): number | null {
  const raw = process.env.PIPELINE_LIMIT;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
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

  const limit = readPipelineLimit();
  if (limit !== null && limit < products.length) {
    console.log(`PIPELINE_LIMIT=${limit}: processing only the first ${limit}.`);
    products = products.slice(0, limit);
  }

  const deps: ProcessDeps = {
    dictionary,
    classify: (text) => classifyDescription(anthropic, text),
    extract: (text, classification) =>
      extractIngredients(anthropic, text, classification),
  };

  let done = 0;
  const candidates = await mapWithConcurrency(
    products,
    CONCURRENCY,
    async (product) => {
      const candidate = await processProduct(deps, product);
      done += 1;
      console.log(
        `[${done}/${products.length}] ${candidate.status.padEnd(8)} ${candidate.productTitle}`,
      );
      return candidate;
    },
  );

  let stored = loadCandidates(CANDIDATES_PATH);
  for (const candidate of candidates) {
    stored = upsertCandidate(stored, candidate);
  }
  saveCandidates(CANDIDATES_PATH, stored);

  const approved = candidates.filter((c) => c.status === "approved").length;
  console.log(
    `\nDone. ${approved} auto-accepted, ${candidates.length - approved} need review.`,
  );
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
