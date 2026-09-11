import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
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
  /** When the candidate's metafields were written to Shopify. Null until published. */
  publishedAt: string | null;
  /** The extractor's notes, e.g. which section of the description it used. */
  notes: string;
  /** The classifier's reasoning for its classification. */
  reasoning: string;
}

type StoredCandidate = Omit<Candidate, "publishedAt" | "notes" | "reasoning"> & {
  publishedAt?: string | null;
  notes?: string;
  reasoning?: string;
};

/** Load the store, backfilling fields added after older files were written. */
export function loadCandidates(path: string): Candidate[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8")) as StoredCandidate[];
  return raw.map((candidate) => ({
    ...candidate,
    publishedAt: candidate.publishedAt ?? null,
    notes: candidate.notes ?? "",
    reasoning: candidate.reasoning ?? "",
  }));
}

/**
 * Write the store atomically, keeping the previous version as `<path>.bak`.
 *
 * The file holds human review decisions, which cannot be regenerated, so a
 * crash mid-write must never leave it truncated: the new contents go to a
 * temp file in the same directory (so the rename stays on one filesystem and
 * is atomic), the current file is copied to `.bak`, and only then is the temp
 * file renamed into place.
 */
export function saveCandidates(path: string, candidates: Candidate[]): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${process.pid}.tmp`);

  writeFileSync(tmp, JSON.stringify(candidates, null, 2) + "\n", "utf8");
  try {
    if (existsSync(path)) copyFileSync(path, `${path}.bak`);
    renameSync(tmp, path);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

/**
 * Merge a long-running command's in-memory store with what is on disk now.
 *
 * pipeline:extract and pipeline:publish load the file, work for minutes,
 * then save the whole list. Meanwhile the review UI may have saved a human
 * decision (or a publish may have happened). Matching by productGid, the
 * on-disk record wins whenever it has a reviewedAt or publishedAt that the
 * in-memory record lacks — that is a decision or a write to Shopify made
 * during the run. Otherwise the in-memory record (the command's own result)
 * wins. Records present on only one side are kept: in-memory order first,
 * then any disk-only records.
 */
export function mergeWithDisk(
  onDisk: Candidate[],
  inMemory: Candidate[],
): Candidate[] {
  const diskByGid = new Map(onDisk.map((c) => [c.productGid, c]));
  const memoryGids = new Set(inMemory.map((c) => c.productGid));

  const merged = inMemory.map((memory) => {
    const disk = diskByGid.get(memory.productGid);
    if (!disk) return memory;
    const diskReviewedMidRun = disk.reviewedAt !== null && memory.reviewedAt === null;
    const diskPublishedMidRun = disk.publishedAt !== null && memory.publishedAt === null;
    return diskReviewedMidRun || diskPublishedMidRun ? disk : memory;
  });

  return [...merged, ...onDisk.filter((c) => !memoryGids.has(c.productGid))];
}

/**
 * Re-read the file just before saving and merge (see mergeWithDisk), so a
 * human decision saved while a long command ran is never reverted.
 */
export function saveCandidatesMerged(path: string, candidates: Candidate[]): void {
  saveCandidates(path, mergeWithDisk(loadCandidates(path), candidates));
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
