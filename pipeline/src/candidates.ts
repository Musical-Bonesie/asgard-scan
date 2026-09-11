import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Classification, ExtractedIngredient } from "./types";

export type CandidateStatus = "pending" | "approved" | "rejected";

export interface Candidate {
  productGid: string;
  productTitle: string;
  vendor: string;
  /** The source description, so a reviewer can check the proposal against it. */
  rawText: string;
  classification: Classification;
  proposedList: ExtractedIngredient[];
  confidence: number;
  /** Why the auto-accept bar rejected it. Empty when it passed. */
  reasons: string[];
  status: CandidateStatus;
  reviewedAt: string | null;
}

export function loadCandidates(path: string): Candidate[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")) as Candidate[];
}

export function saveCandidates(path: string, candidates: Candidate[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(candidates, null, 2) + "\n", "utf8");
}

/** Replace by productGid, or append when the product is new. */
export function upsertCandidate(
  list: Candidate[],
  candidate: Candidate,
): Candidate[] {
  const index = list.findIndex((c) => c.productGid === candidate.productGid);
  if (index === -1) return [...list, candidate];
  const next = [...list];
  next[index] = candidate;
  return next;
}

export function pendingCandidates(list: Candidate[]): Candidate[] {
  return list.filter((c) => c.status === "pending");
}
