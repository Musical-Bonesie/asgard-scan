import { readFileSync } from "node:fs";

export interface Flag {
  flag_type: string;
  source: string;
  notes?: string;
}

export interface DictionaryEntry {
  inci_name: string;
  common_name: string | null;
  synonyms: string[];
  flags: Flag[];
}

export interface Dictionary {
  version: number;
  entries: DictionaryEntry[];
}

/**
 * Reduce an ingredient string to a comparable key.
 *
 * Parentheticals are stripped because suppliers write the same ingredient as
 * both "Butyrospermum Parkii Butter" and "Butyrospermum Parkii (Shea) Butter".
 */
export function normalizeToken(token: string): string {
  return token
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[.,;:*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveToken(
  dict: Dictionary,
  token: string,
): DictionaryEntry | null {
  const key = normalizeToken(token);
  for (const entry of dict.entries) {
    if (normalizeToken(entry.inci_name) === key) return entry;
    if (entry.synonyms.some((s) => normalizeToken(s) === key)) return entry;
  }
  return null;
}

export function loadDictionary(path: string): Dictionary {
  return JSON.parse(readFileSync(path, "utf8")) as Dictionary;
}
