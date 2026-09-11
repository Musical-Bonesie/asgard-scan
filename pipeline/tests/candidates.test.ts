import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  loadCandidates,
  mergeWithDisk,
  pendingCandidates,
  saveCandidates,
  saveCandidatesMerged,
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
    publishedAt: null,
    notes: "",
    reasoning: "",
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

  test("loads a candidates file written before publishedAt existed with publishedAt null", () => {
    const legacy = candidate() as unknown as Record<string, unknown>;
    delete legacy.publishedAt;
    writeFileSync(file, JSON.stringify([legacy]), "utf8");

    const loaded = loadCandidates(file);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].publishedAt).toBeNull();
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

  test("loads a candidates file written before notes and reasoning existed with both backfilled to empty strings", () => {
    const legacy = candidate() as unknown as Record<string, unknown>;
    delete legacy.notes;
    delete legacy.reasoning;
    writeFileSync(file, JSON.stringify([legacy]), "utf8");

    const loaded = loadCandidates(file);
    expect(loaded[0].notes).toBe("");
    expect(loaded[0].reasoning).toBe("");
  });

  test("round-trips notes and reasoning", () => {
    saveCandidates(file, [
      candidate({ notes: "used the Ingredients: list", reasoning: "labelled INCI list" }),
    ]);
    const [loaded] = loadCandidates(file);
    expect(loaded.notes).toBe("used the Ingredients: list");
    expect(loaded.reasoning).toBe("labelled INCI list");
  });
});

describe("atomic save with backup", () => {
  test("the first save writes a valid file and no backup (there was nothing to back up)", () => {
    saveCandidates(file, [candidate()]);
    expect(loadCandidates(file)).toHaveLength(1);
    expect(existsSync(`${file}.bak`)).toBe(false);
  });

  test("a later save leaves a valid file and a .bak holding the previous contents", () => {
    saveCandidates(file, [candidate({ status: "rejected", reviewedAt: "2026-09-01T00:00:00.000Z" })]);
    const previous = readFileSync(file, "utf8");

    saveCandidates(file, [candidate(), candidate({ productGid: "gid://shopify/Product/2" })]);

    expect(loadCandidates(file)).toHaveLength(2);
    expect(readFileSync(`${file}.bak`, "utf8")).toBe(previous);
    expect(loadCandidates(`${file}.bak`)[0].status).toBe("rejected");
  });

  test("leaves no temporary file behind", () => {
    saveCandidates(file, [candidate()]);
    saveCandidates(file, [candidate()]);
    expect(readdirSync(dir).sort()).toEqual(["candidates.json", "candidates.json.bak"]);
  });

  test("creates the directory when it does not exist", () => {
    const nested = join(dir, "data", "candidates.json");
    saveCandidates(nested, [candidate()]);
    expect(loadCandidates(nested)).toHaveLength(1);
  });
});

describe("mergeWithDisk", () => {
  const T = "2026-09-11T10:00:00.000Z";

  test("keeps an on-disk human decision that arrived mid-run over the stale in-memory record", () => {
    // main() loaded this candidate as pending, re-extracted it for ~10
    // minutes, and meanwhile a reviewer rejected it in the UI.
    const onDisk = [candidate({ status: "rejected", reviewedAt: T })];
    const inMemory = [candidate({ status: "approved", confidence: 0.99 })];

    const [merged] = mergeWithDisk(onDisk, inMemory);
    expect(merged.status).toBe("rejected");
    expect(merged.reviewedAt).toBe(T);
  });

  test("keeps an on-disk publishedAt that arrived mid-run", () => {
    const onDisk = [candidate({ status: "approved", reviewedAt: T, publishedAt: T })];
    const inMemory = [candidate({ status: "pending" })];

    const [merged] = mergeWithDisk(onDisk, inMemory);
    expect(merged.publishedAt).toBe(T);
    expect(merged.status).toBe("approved");
  });

  test("otherwise the in-memory record wins", () => {
    const onDisk = [candidate({ status: "pending", confidence: 0.5 })];
    const inMemory = [candidate({ status: "approved", confidence: 0.95 })];
    expect(mergeWithDisk(onDisk, inMemory)[0].confidence).toBe(0.95);
  });

  test("the in-memory record wins when it carries the publish (publishMain's own stamp)", () => {
    const onDisk = [candidate({ status: "approved" })];
    const inMemory = [candidate({ status: "approved", publishedAt: T })];
    expect(mergeWithDisk(onDisk, inMemory)[0].publishedAt).toBe(T);
  });

  test("keeps records that exist on only one side, in-memory order first", () => {
    const onDisk = [
      candidate({ productGid: "gid://shopify/Product/9", productTitle: "Disk only" }),
      candidate({ productGid: "gid://shopify/Product/1" }),
    ];
    const inMemory = [
      candidate({ productGid: "gid://shopify/Product/1" }),
      candidate({ productGid: "gid://shopify/Product/2", productTitle: "Memory only" }),
    ];
    expect(mergeWithDisk(onDisk, inMemory).map((c) => c.productGid)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
      "gid://shopify/Product/9",
    ]);
  });

  test("saveCandidatesMerged re-reads the file just before saving", () => {
    // What was on disk when a long run started...
    saveCandidates(file, [candidate()]);
    const loadedAtStart = loadCandidates(file);
    // ...a reviewer approves it mid-run...
    saveCandidates(file, [candidate({ status: "approved", reviewedAt: T, publishedAt: T })]);
    // ...and the run saves its now-stale copy.
    saveCandidatesMerged(file, loadedAtStart);

    const [final] = loadCandidates(file);
    expect(final.reviewedAt).toBe(T);
    expect(final.publishedAt).toBe(T);
  });
});

