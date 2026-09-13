import type { Classification, ClassifyResult } from "./types";

/**
 * The seam between the pipeline and the model.
 *
 * Synchronous today. A Batch API implementation satisfies the same interface,
 * so swapping it in later requires no change to callers.
 */
export interface ClassifierClient {
  complete(prompt: string, schema: object): Promise<string>;
}

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    classification: {
      type: "string",
      enum: ["full_list", "key_ingredients", "active_inactive", "none"],
    },
    reasoning: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["classification", "reasoning", "confidence"],
  additionalProperties: false,
} as const;

const VALID: Classification[] = [
  "full_list",
  "key_ingredients",
  "active_inactive",
  "none",
];

const PROMPT = `You are classifying a cosmetic product description by how it presents ingredient information.

Choose exactly one:

- "full_list": a complete INCI ingredient list. Usually labelled "Ingredients:",
  and typically long, comma-separated, and led by a high-concentration
  ingredient such as Aqua/Water.
- "key_ingredients": marketing highlights only. Often labelled "Key
  Ingredients:" and naming a handful of hero ingredients. This is NOT a
  complete list even when it is long. If you cannot tell whether a list is
  complete or a selection of highlights, choose this — treating a partial list
  as complete is the costly error here.
- "active_inactive": a regulatory split, e.g. "Medicinal Ingredients" and
  "Inactive Ingredients". Common for sunscreens.
- "none": no ingredient information at all.

A "Key Ingredients" (or similar highlights) section does not rule out
"full_list". Descriptions often carry both: a short marketing highlights
section AND, separately, a complete ingredient list (commonly under a heading
like "Ingredients:" or "Full Ingredient List"). When a highlights section and
a separate complete list are both present in the same description, classify
it as "full_list" — your job is to find the complete list despite the
marketing heading, not to stop at the first heading you see. Only choose
"key_ingredients" when the highlights are the ONLY ingredient information in
the description, or when the only list present is plainly incomplete. If you
cannot tell whether a list is complete or a selection of highlights, still
choose "key_ingredients" — over-caution here is safe, it only routes the
product to human review.

Set confidence to your genuine certainty, 0 to 1. Do not inflate it.

DESCRIPTION:
`;

export async function classifyDescription(
  client: ClassifierClient,
  text: string,
): Promise<ClassifyResult> {
  const raw = await client.complete(PROMPT + text, CLASSIFY_SCHEMA);
  const parsed = JSON.parse(raw) as ClassifyResult;

  if (!VALID.includes(parsed.classification)) {
    throw new Error(`invalid classification: ${parsed.classification}`);
  }
  if (
    typeof parsed.confidence !== "number" ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    throw new Error(`confidence out of range: ${parsed.confidence}`);
  }

  return parsed;
}
