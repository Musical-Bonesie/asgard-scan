import { normalizeToken, resolveToken, type Dictionary } from "./dictionary";
import type { Classification, ExtractedIngredient } from "./types";

export const CONFIDENCE_THRESHOLD = 0.9;
export const MIN_INGREDIENTS = 3;

/**
 * A marketing highlights heading ("Key Ingredients", "Star Ingredient",
 * "Ingredient Spotlight", ...). Most descriptions that carry one ALSO carry a
 * complete list, which the classifier rightly calls full_list — but then the
 * extractor may have returned the highlights, or merged them into the list.
 * Neither model pass can be trusted on exactly this shape, so its presence
 * alone routes the product to a human.
 */
export const HIGHLIGHTS_HEADING =
  /\b(key|star|hero|featured)\s+ingredients?\b|ingredients?\s+spotlight/i;

export interface AcceptDecision {
  accepted: boolean;
  /** Every failed condition, so review UI can explain itself. */
  reasons: string[];
}

export interface AcceptParams {
  classification: Classification;
  confidence: number;
  ingredients: ExtractedIngredient[];
  dictionary: Dictionary;
  /**
   * The stripped description the list was extracted from. When present, a
   * highlights heading in it routes the product to review. Every pipeline
   * caller (processProduct, reevaluateCandidates) passes it.
   */
  rawText?: string;
}

/**
 * Canonical names that occur more than once, compared with normalizeToken,
 * each reported once in first-seen order (as first written).
 */
export function findDuplicateIngredients(
  ingredients: ExtractedIngredient[],
): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const duplicates: string[] = [];
  for (const ingredient of ingredients) {
    const key = normalizeToken(ingredient.canonical);
    if (seen.has(key) && !reported.has(key)) {
      reported.add(key);
      duplicates.push(
        ingredients.find((i) => normalizeToken(i.canonical) === key)!.canonical,
      );
    }
    seen.add(key);
  }
  return duplicates;
}

/**
 * The conservative auto-accept bar.
 *
 * Every condition is evaluated (rather than short-circuiting) so the review
 * queue can show a reviewer all of what is wrong at once.
 */
export function evaluateAcceptance(params: AcceptParams): AcceptDecision {
  const reasons: string[] = [];

  if (params.classification !== "full_list") {
    reasons.push(
      `classification is "${params.classification}", not "full_list" — ` +
        `only a complete INCI list can be auto-accepted`,
    );
  }

  if (params.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(
      `confidence ${params.confidence} is below the ${CONFIDENCE_THRESHOLD} threshold`,
    );
  }

  if (params.ingredients.length < MIN_INGREDIENTS) {
    reasons.push(
      `list has ${params.ingredients.length} ingredients; at least ${MIN_INGREDIENTS} required`,
    );
  }

  const unresolved = params.ingredients
    .filter((i) => resolveToken(params.dictionary, i.canonical) === null)
    .map((i) => i.canonical);

  if (unresolved.length > 0) {
    reasons.push(`unrecognised ingredients: ${unresolved.join(", ")}`);
  }

  // A real INCI list names each ingredient once. A repeat is the signature of
  // a highlights section merged into the complete list (or a list extracted
  // twice), which also tends to put a highlighted ingredient first.
  const duplicates = findDuplicateIngredients(params.ingredients);
  if (duplicates.length > 0) {
    reasons.push(
      `duplicate ingredients: ${duplicates.join(", ")} — a real INCI list names ` +
        `each ingredient once; this looks like a highlights section merged into ` +
        `the list`,
    );
  }

  const heading = params.rawText?.match(HIGHLIGHTS_HEADING);
  if (heading) {
    const quoted = heading[0].replace(/\s+/g, " ");
    reasons.push(
      `description has a highlights section ("${quoted}") — check that the ` +
        `list is the complete ingredient list, in its written order, with no ` +
        `highlights merged in`,
    );
  }

  return { accepted: reasons.length === 0, reasons };
}
