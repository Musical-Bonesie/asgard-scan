const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|section)[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Convert Shopify description HTML to plain text for the classifier.
 *
 * Block tags become newlines rather than being deleted: a label like
 * "Ingredients:" must stay on its own line, otherwise it merges into the
 * list and the classifier loses the strongest signal it has.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  let text = html.replace(BLOCK_TAGS, "\n");
  text = text.replace(/<[^>]+>/g, "");

  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  // Numeric entities, e.g. &#8211;
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code)),
  );

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
