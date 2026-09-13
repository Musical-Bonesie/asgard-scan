/** How a product's description presents its ingredient information. */
export type Classification =
  | "full_list" // a complete INCI list
  | "key_ingredients" // marketing highlights only — NEVER a complete list
  | "active_inactive" // regulatory split, e.g. sunscreens
  | "none"; // no ingredient data present

export interface ClassifyResult {
  classification: Classification;
  reasoning: string;
  confidence: number;
}

export interface ExtractedIngredient {
  /** Exactly as written in the description. */
  raw: string;
  /** Normalized canonical INCI name. */
  canonical: string;
  /** 0-based. INCI order is concentration order — this must be preserved. */
  position: number;
}

export interface ExtractResult {
  ingredients: ExtractedIngredient[];
  confidence: number;
  notes: string;
}
