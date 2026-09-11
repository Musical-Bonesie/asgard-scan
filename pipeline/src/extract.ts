import type { ClassifierClient } from "./classify";
import type { Classification, ExtractResult } from "./types";

export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string" },
          canonical: { type: "string" },
          position: { type: "integer" },
        },
        required: ["raw", "canonical", "position"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
  required: ["ingredients", "confidence", "notes"],
  additionalProperties: false,
} as const;

const BASE_PROMPT = `Extract the ingredient list from this cosmetic product description.

Rules:
- Preserve the order exactly as written. INCI lists are ordered by descending
  concentration, so order carries meaning and must not be sorted or tidied.
- "raw" is the ingredient exactly as it appears. "canonical" is the standard
  INCI name with parenthetical common names removed — e.g.
  "Butyrospermum Parkii (Shea) Butter" has canonical "Butyrospermum Parkii Butter".
- Do not invent ingredients. Extract only what is present.
- Set confidence to your genuine certainty that this list is complete and
  correctly ordered.
`;

const SPLIT_PROMPT = `This description splits ingredients into active/medicinal and
inactive sections. Extract both, actives first, preserving each section's
internal order.
`;

export async function extractIngredients(
  client: ClassifierClient,
  text: string,
  classification: Classification,
): Promise<ExtractResult> {
  if (classification === "none") {
    return { ingredients: [], confidence: 1, notes: "no ingredient data" };
  }

  const prompt =
    BASE_PROMPT +
    (classification === "active_inactive" ? SPLIT_PROMPT : "") +
    "\nDESCRIPTION:\n" +
    text;

  const raw = await client.complete(prompt, EXTRACT_SCHEMA);
  const parsed = JSON.parse(raw) as ExtractResult;

  // Renumber from the array order. The array order is what the model actually
  // produced; the position field is advisory and has been seen to be wrong.
  const ingredients = parsed.ingredients.map((ing, index) => ({
    ...ing,
    position: index,
  }));

  return { ...parsed, ingredients };
}
