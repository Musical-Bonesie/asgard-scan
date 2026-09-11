import { resolveToken, type Dictionary } from "./dictionary";
import type { Classification, ExtractedIngredient } from "./types";

export const CONFIDENCE_THRESHOLD = 0.9;
export const MIN_INGREDIENTS = 3;

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

  return { accepted: reasons.length === 0, reasons };
}
