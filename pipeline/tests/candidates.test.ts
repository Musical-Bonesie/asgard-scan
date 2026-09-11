import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  loadCandidates,
  pendingCandidates,
  saveCandidates,
  upsertCandidate,
  type Candidate,
} from "../src/candidates";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cand-"));
  file = join(dir, "candidates.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    productGid: "gid://shopify/Product/1",
    productTitle: "Test Serum",
    vendor: "Test Brand",
    rawText: "Ingredients: Aqua",
    classification: "full_list",
    proposedList: [{ raw: "Aqua", canonical: "Aqua", position: 0 }],
    confidence: 0.95,
    reasons: [],
    status: "pending",
    reviewedAt: null,
    ...overrides,
  };
}

describe("candidate store", () => {
  test("returns an empty list when the file does not exist", () => {
    expect(loadCandidates(file)).toEqual([]);
  });

  test("round-trips through disk", () => {
    saveCandidates(file, [candidate()]);
    const loaded = loadCandidates(file);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].productTitle).toBe("Test Serum");
  });

  test("upsert replaces by product id rather than duplicating", () => {
    const list = [candidate()];
    const updated = upsertCandidate(
      list,
      candidate({ confidence: 0.5, status: "pending" }),
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].confidence).toBe(0.5);
  });

  test("upsert appends a genuinely new product", () => {
    const list = [candidate()];
    const updated = upsertCandidate(
      list,
      candidate({ productGid: "gid://shopify/Product/2" }),
    );
    expect(updated).toHaveLength(2);
  });

  test("pendingCandidates filters out reviewed items", () => {
    const list = [
      candidate(),
      candidate({ productGid: "gid://shopify/Product/2", status: "approved" }),
    ];
    expect(pendingCandidates(list)).toHaveLength(1);
  });

  test("preserves ingredient order across a save/load cycle", () => {
    const ordered = candidate({
      proposedList: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
        { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
      ],
    });
    saveCandidates(file, [ordered]);
    expect(
      loadCandidates(file)[0].proposedList.map((i) => i.canonical),
    ).toEqual(["Aqua", "Glycerin", "Tocopherol"]);
  });
});
