# Ingredient Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract INCI ingredient lists from 95 Shopify product descriptions into Shopify product metafields, backed by a curated ingredient dictionary and an admin review queue for anything below the confidence bar.

**Architecture:** A Shopify app on React Router 7 hosts the admin review UI. The extraction pipeline is a **standalone TypeScript program** in the same repository — it reads the Shopify Admin API and writes metafields, never touching the app's request path, so it can be run manually and swapped without touching the app. Two Claude passes (classify, then extract) with structured outputs. The ingredient dictionary is a versioned JSON file, not a database.

**Tech Stack:** React Router 7 (`@shopify/shopify-app-react-router`), Shopify Polaris, TypeScript, Vitest, `@anthropic-ai/sdk`, Shopify Admin GraphQL API.

**Spec:** [`docs/superpowers/specs/2026-08-15-ingredient-foundation-design.md`](../specs/2026-08-15-ingredient-foundation-design.md)

## Global Constraints

- **No application database.** The ingredient dictionary is `data/ingredient-dictionary.json`. The template's Prisma/SQLite is for Shopify session storage only — do not add application tables to it.
- **No user data is stored** anywhere in this sub-project. Extraction and review are admin-only.
- **Metafields are the source of truth.** Anything else is a rebuildable projection.
- **Metafield namespace is `asgard`.** Keys: `inci_list`, `inci_source`, `inci_confidence`, `inci_reviewed_at`.
- **`metafieldsSet` accepts a maximum of 25 metafields per call** and is atomic — a single error persists nothing. Four metafields per product means **6 products per call**.
- **Ingredient order is significant.** INCI lists are ordered by descending concentration to 1%. Order must survive description → extraction → metafield → UI.
- **`key_ingredients` is never auto-accepted**, at any confidence. It is by definition a partial list.
- **Model is `claude-opus-5`.** Use `output_config.format` with a JSON schema on every extraction call so responses are schema-valid by construction.
- **Never write a partial list without `inci_source` marking it partial.**

### Deviation from the spec — read this

The spec specifies the **Anthropic Batch API** for the bulk run. This plan implements **synchronous calls with a concurrency cap of 5** instead, because:

- The saving is ~$0.56 on a ~$1.12 run — real but small.
- Batch adds submit/poll/retrieve code and a 24-hour completion window, which is poor feedback while you are still tuning prompts.
- Synchronous with concurrency 5 completes ~190 calls in roughly 10 minutes.

Task 4 puts the model call behind a `ClassifierClient` interface specifically so a Batch implementation can be dropped in later without touching callers. **If you would rather follow the spec exactly, say so before starting** — it changes Tasks 4, 5, and 10.

---

## File Structure

```
/                                        (repo root)
├── shopify.app.toml                     scaffolded — app config
├── package.json                         scaffolded + pipeline scripts added
├── vite.config.ts                       scaffolded; Vitest config added (Task 2)
├── .env                                 gitignored — secrets
├── .env.sample                          committed template
├── app/                                 React Router app (scaffolded)
│   ├── shopify.server.ts                scaffolded — Shopify auth
│   └── routes/
│       └── app.review.tsx               Task 9 — review queue UI
├── data/
│   ├── ingredient-dictionary.json       Task 6 — curated dictionary
│   └── candidates.json                  Task 8 — review queue (gitignored)
├── pipeline/
│   ├── fixtures/
│   │   └── labelled-products.json       Task 3 — hand-labelled test set
│   ├── src/
│   │   ├── types.ts                     Task 2 — shared types
│   │   ├── strip-html.ts                Task 2 — HTML → text
│   │   ├── classify.ts                  Task 4 — pass 1
│   │   ├── extract.ts                   Task 5 — pass 2
│   │   ├── dictionary.ts                Task 6 — load/normalize/resolve
│   │   ├── accept.ts                    Task 7 — auto-accept bar
│   │   ├── candidates.ts                Task 8 — review queue store
│   │   ├── shopify.ts                   Task 9 — catalogue read + metafield write
│   │   └── run.ts                       Task 10 — orchestrator CLI
│   └── tests/                           one test file per src module
└── docs/superpowers/{specs,plans}/
```

Each pipeline module has one responsibility and is independently testable. `strip-html`, `dictionary`, and `accept` are pure functions with no I/O — they carry the highest test value and no API cost.

---

## Task 1: Scaffold the Shopify app

**Files:**
- Create: everything from the Shopify template at repo root
- Modify: `.gitignore`
- Create: `.env.sample`

**Interfaces:**
- Consumes: nothing
- Produces: a booting Shopify app; `app/shopify.server.ts` exporting `authenticate`

> **Requires your Shopify Partner account.** This task is interactive and cannot be fully automated. It creates an app in your Partner dashboard.

- [ ] **Step 1: Scaffold into a temporary directory**

The Shopify CLI creates its own directory, so scaffold beside the repo and move the files in.

```bash
cd /Users/signebone/Documents/projects
npm init -y --scope=@tmp 2>/dev/null || true
npx --yes @shopify/cli@latest app init \
  --template=https://github.com/Shopify/shopify-app-template-react-router \
  --name asgard-beauty-app \
  --path /Users/signebone/Documents/projects/_scaffold
```

Follow the prompts: log in, and create a **new app** named `Asgard Beauty`.

- [ ] **Step 2: Move the scaffold into the repo**

```bash
cd /Users/signebone/Documents/projects/asgard-scan
git checkout feature/shopify-ingredient-foundation
rsync -a --exclude='.git' /Users/signebone/Documents/projects/_scaffold/ ./
rm -rf /Users/signebone/Documents/projects/_scaffold
```

- [ ] **Step 3: Verify it boots**

```bash
npm install
npm run dev
```

Expected: the CLI prints a preview URL and the app installs on your development store. Press `p` to open it. You should see the template's default page inside the Shopify admin.

Stop the dev server with Ctrl-C once confirmed.

- [ ] **Step 4: Add pipeline secrets to `.env.sample`**

Create `.env.sample`:

```
# Shopify custom app Admin API access token (read_products, write_products)
SHOPIFY_ADMIN_TOKEN=
# Your store domain, e.g. asgard-beauty.myshopify.com
SHOPIFY_SHOP_DOMAIN=
# Anthropic API key for the extraction pipeline
ANTHROPIC_API_KEY=
```

Copy it to `.env` and fill in real values. Confirm `.env` is gitignored:

```bash
git check-ignore -v .env
```

Expected: prints a matching `.gitignore` rule. If it prints nothing, add `.env` to `.gitignore` before continuing.

- [ ] **Step 5: Ignore the candidates file**

Append to `.gitignore`:

```
# review queue state — regenerable, may contain unreviewed extraction output
data/candidates.json
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Shopify app on React Router 7"
```

---

## Task 2: HTML stripping and shared types

**Files:**
- Create: `pipeline/src/types.ts`
- Create: `pipeline/src/strip-html.ts`
- Create: `pipeline/tests/strip-html.test.ts`
- Modify: `vite.config.ts` (add Vitest config)
- Modify: `package.json` (add test script)

**Interfaces:**
- Consumes: nothing
- Produces: `stripHtml(html: string): string`; types `Classification`, `ExtractedIngredient`, `ClassifyResult`, `ExtractResult`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/strip-html.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { stripHtml } from "../src/strip-html";

describe("stripHtml", () => {
  test("removes tags and keeps text", () => {
    expect(stripHtml("<p>Aqua, Glycerin</p>")).toBe("Aqua, Glycerin");
  });

  test("turns block tags into newlines so sections stay separate", () => {
    // Without this, "Ingredients:" would run into the list and the
    // classifier would see one blob instead of a labelled section.
    expect(stripHtml("<p>Ingredients:</p><p>Aqua</p>")).toBe(
      "Ingredients:\nAqua",
    );
  });

  test("decodes the entities Shopify descriptions actually contain", () => {
    expect(stripHtml("<p>Water &amp; Glycerin&nbsp;Extract</p>")).toBe(
      "Water & Glycerin Extract",
    );
  });

  test("collapses runs of whitespace but preserves line structure", () => {
    expect(stripHtml("<p>Aqua   ,    Glycerin</p>")).toBe("Aqua , Glycerin");
  });

  test("handles an empty or null-ish description", () => {
    expect(stripHtml("")).toBe("");
  });
});
```

- [ ] **Step 2: Add Vitest config and run the test to see it fail**

Modify `vite.config.ts` — add a `test` key to the exported config:

```typescript
  test: {
    environment: "node",
    include: ["pipeline/tests/**/*.test.ts", "app/**/*.test.{ts,tsx}"],
  },
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Run: `npx vitest run pipeline/tests/strip-html.test.ts`
Expected: FAIL — `Cannot find module '../src/strip-html'`

- [ ] **Step 3: Write the types**

Create `pipeline/src/types.ts`:

```typescript
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
```

- [ ] **Step 4: Write the implementation**

Create `pipeline/src/strip-html.ts`:

```typescript
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
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run pipeline/tests/strip-html.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/types.ts pipeline/src/strip-html.ts pipeline/tests/strip-html.test.ts vite.config.ts package.json
git commit -m "feat: HTML stripping and shared pipeline types"
```

---

## Task 3: Labelled fixture set

**Files:**
- Create: `pipeline/fixtures/labelled-products.json`
- Create: `pipeline/tests/fixtures.test.ts`

**Interfaces:**
- Consumes: `Classification` from `pipeline/src/types.ts`
- Produces: `pipeline/fixtures/labelled-products.json` — an array of `{ id, title, vendor, bodyHtml, expected }` used by Tasks 4, 5, and 7

This is the test foundation for the whole pipeline. It must be **real descriptions from the live store**, not synthetic — synthetic examples are cleaner than reality and hide exactly the failures this pipeline exists to catch.

- [ ] **Step 1: Pull the live catalogue to source fixtures from**

```bash
curl -s "https://asgardbeauty.com/products.json?limit=250" -o /tmp/catalogue.json
node -e "const p=require('/tmp/catalogue.json').products; console.log(p.length + ' products'); p.slice(0,200).forEach(x=>console.log(x.id, '|', x.vendor, '|', x.title))"
```

- [ ] **Step 2: Build the fixture file**

Pick **20 products spanning all four cases** — at minimum: 8 `full_list`, 5 `key_ingredients`, 3 `active_inactive` (the Elta MD / Ava Isa / Cyberderm sunscreens), 4 `none`.

Create `pipeline/fixtures/labelled-products.json`. Populate `bodyHtml` verbatim from the catalogue JSON:

```json
[
  {
    "id": 000000000,
    "title": "EAST 29th | Verse Lotion Mist",
    "vendor": "EAST 29TH",
    "bodyHtml": "<PASTE body_html VERBATIM FROM catalogue.json>",
    "expected": {
      "classification": "full_list",
      "firstIngredient": "Aqua",
      "minCount": 10
    }
  }
]
```

For `key_ingredients` and `none` entries, set `firstIngredient` to `null` and `minCount` to `0`.

- [ ] **Step 3: Write the test that guards the fixture set itself**

Create `pipeline/tests/fixtures.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import fixtures from "../fixtures/labelled-products.json";
import type { Classification } from "../src/types";

const VALID: Classification[] = [
  "full_list",
  "key_ingredients",
  "active_inactive",
  "none",
];

describe("labelled fixture set", () => {
  test("covers every classification case", () => {
    const seen = new Set(fixtures.map((f) => f.expected.classification));
    for (const c of VALID) {
      expect(seen.has(c), `no fixture for "${c}"`).toBe(true);
    }
  });

  test("has enough examples to be meaningful", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  test("every fixture has real description HTML", () => {
    for (const f of fixtures) {
      expect(typeof f.bodyHtml, `${f.title} bodyHtml`).toBe("string");
      if (f.expected.classification !== "none") {
        expect(f.bodyHtml.length, `${f.title} looks empty`).toBeGreaterThan(50);
      }
    }
  });

  test("classifications are valid values", () => {
    for (const f of fixtures) {
      expect(VALID).toContain(f.expected.classification as Classification);
    }
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/fixtures.test.ts`
Expected: PASS — 4 tests. If "covers every classification case" fails, the fixture set is missing a case; add it.

- [ ] **Step 5: Commit**

```bash
git add pipeline/fixtures/labelled-products.json pipeline/tests/fixtures.test.ts
git commit -m "test: hand-labelled fixture set from the live catalogue"
```

---

## Task 4: Classifier (pass 1)

**Files:**
- Create: `pipeline/src/classify.ts`
- Create: `pipeline/tests/classify.test.ts`

**Interfaces:**
- Consumes: `stripHtml`, `ClassifyResult`, `Classification`
- Produces: `ClassifierClient` interface; `classifyDescription(client: ClassifierClient, text: string): Promise<ClassifyResult>`; `CLASSIFY_SCHEMA`

The `ClassifierClient` interface is the seam that lets a Batch API implementation replace the synchronous one later without touching callers.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/classify.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
import { classifyDescription, CLASSIFY_SCHEMA } from "../src/classify";
import type { ClassifierClient } from "../src/classify";

function fakeClient(payload: unknown): ClassifierClient {
  return {
    complete: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

describe("classifyDescription", () => {
  test("returns the parsed classification", async () => {
    const client = fakeClient({
      classification: "full_list",
      reasoning: "Labelled 'Ingredients:' followed by an INCI list",
      confidence: 0.95,
    });

    const result = await classifyDescription(client, "Ingredients: Aqua, Glycerin");

    expect(result.classification).toBe("full_list");
    expect(result.confidence).toBe(0.95);
  });

  test("passes the description to the model", async () => {
    const client = fakeClient({
      classification: "none",
      reasoning: "no ingredient data",
      confidence: 0.9,
    });

    await classifyDescription(client, "A lovely moisturiser.");

    expect(client.complete).toHaveBeenCalledWith(
      expect.stringContaining("A lovely moisturiser."),
      CLASSIFY_SCHEMA,
    );
  });

  test("rejects a classification outside the allowed set", async () => {
    const client = fakeClient({
      classification: "banana",
      reasoning: "",
      confidence: 0.9,
    });

    await expect(classifyDescription(client, "x")).rejects.toThrow(
      /invalid classification/i,
    );
  });

  test("rejects a confidence outside 0..1", async () => {
    const client = fakeClient({
      classification: "full_list",
      reasoning: "",
      confidence: 4,
    });

    await expect(classifyDescription(client, "x")).rejects.toThrow(
      /confidence/i,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/classify.test.ts`
Expected: FAIL — `Cannot find module '../src/classify'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/classify.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/classify.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/classify.ts pipeline/tests/classify.test.ts
git commit -m "feat: ingredient section classifier with schema validation"
```

---

## Task 5: Extractor (pass 2)

**Files:**
- Create: `pipeline/src/extract.ts`
- Create: `pipeline/tests/extract.test.ts`

**Interfaces:**
- Consumes: `ClassifierClient`, `Classification`, `ExtractResult`, `ExtractedIngredient`
- Produces: `extractIngredients(client, text, classification): Promise<ExtractResult>`; `EXTRACT_SCHEMA`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/extract.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
import { extractIngredients } from "../src/extract";
import type { ClassifierClient } from "../src/classify";

function fakeClient(payload: unknown): ClassifierClient {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify(payload)) };
}

describe("extractIngredients", () => {
  test("returns ingredients in description order", async () => {
    const client = fakeClient({
      ingredients: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
      ],
      confidence: 0.95,
      notes: "",
    });

    const result = await extractIngredients(
      client,
      "Ingredients: Aqua, Glycerin",
      "full_list",
    );

    expect(result.ingredients.map((i) => i.canonical)).toEqual([
      "Aqua",
      "Glycerin",
    ]);
  });

  test("returns nothing for a description with no ingredient data", async () => {
    const client = fakeClient({ ingredients: [], confidence: 1, notes: "" });

    const result = await extractIngredients(client, "Lovely.", "none");

    expect(result.ingredients).toEqual([]);
    // No model call should be made for "none" — it is already decided.
    expect(client.complete).not.toHaveBeenCalled();
  });

  test("repairs out-of-order positions rather than trusting the model", async () => {
    // Order carries concentration meaning, so it must be correct even if the
    // model emits positions inconsistently.
    const client = fakeClient({
      ingredients: [
        { raw: "Glycerin", canonical: "Glycerin", position: 5 },
        { raw: "Aqua", canonical: "Aqua", position: 2 },
      ],
      confidence: 0.9,
      notes: "",
    });

    const result = await extractIngredients(client, "x", "full_list");

    expect(result.ingredients.map((i) => i.position)).toEqual([0, 1]);
    expect(result.ingredients.map((i) => i.canonical)).toEqual([
      "Glycerin",
      "Aqua",
    ]);
  });

  test("tells the model to put actives first for a split list", async () => {
    const client = fakeClient({ ingredients: [], confidence: 0.9, notes: "" });

    await extractIngredients(client, "x", "active_inactive");

    const prompt = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(prompt).toMatch(/actives first/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/extract.test.ts`
Expected: FAIL — `Cannot find module '../src/extract'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/extract.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/extract.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/extract.ts pipeline/tests/extract.test.ts
git commit -m "feat: ingredient extractor preserving concentration order"
```

---

## Task 6: Ingredient dictionary

**Files:**
- Create: `pipeline/src/dictionary.ts`
- Create: `pipeline/tests/dictionary.test.ts`
- Create: `data/ingredient-dictionary.json`

**Interfaces:**
- Consumes: nothing
- Produces: `Dictionary`, `DictionaryEntry`, `Flag` types; `normalizeToken(t: string): string`; `resolveToken(dict, token): DictionaryEntry | null`; `loadDictionary(path): Dictionary`

The JSON shape mirrors the `ingredients` / `ingredient_synonyms` / `ingredient_flags` tables in the spec, so it migrates into Postgres in sub-project 2 without reshaping.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/dictionary.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  normalizeToken,
  resolveToken,
  type Dictionary,
} from "../src/dictionary";

const DICT: Dictionary = {
  version: 1,
  entries: [
    {
      inci_name: "Aqua",
      common_name: "Water",
      synonyms: ["Water", "Eau", "Aqua/Water/Eau"],
      flags: [],
    },
    {
      inci_name: "Linalool",
      common_name: null,
      synonyms: [],
      flags: [
        {
          flag_type: "eu_fragrance_allergen",
          source: "EU Cosmetics Regulation 1223/2009 Annex III",
        },
      ],
    },
  ],
};

describe("normalizeToken", () => {
  test("lowercases and trims", () => {
    expect(normalizeToken("  Aqua  ")).toBe("aqua");
  });

  test("strips parenthetical common names", () => {
    expect(normalizeToken("Butyrospermum Parkii (Shea) Butter")).toBe(
      "butyrospermum parkii butter",
    );
  });

  test("collapses internal whitespace", () => {
    expect(normalizeToken("Citrus   Limon  Peel")).toBe("citrus limon peel");
  });

  test("strips trailing punctuation", () => {
    expect(normalizeToken("Glycerin.")).toBe("glycerin");
  });
});

describe("resolveToken", () => {
  test("resolves a canonical name", () => {
    expect(resolveToken(DICT, "Aqua")?.inci_name).toBe("Aqua");
  });

  test("resolves a synonym to its canonical entry", () => {
    expect(resolveToken(DICT, "Water")?.inci_name).toBe("Aqua");
    expect(resolveToken(DICT, "eau")?.inci_name).toBe("Aqua");
  });

  test("returns null for an unknown ingredient", () => {
    expect(resolveToken(DICT, "Unobtainium")).toBeNull();
  });

  test("carries allergen flags through", () => {
    const entry = resolveToken(DICT, "Linalool");
    expect(entry?.flags[0].flag_type).toBe("eu_fragrance_allergen");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/dictionary.test.ts`
Expected: FAIL — `Cannot find module '../src/dictionary'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/dictionary.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/dictionary.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Seed the dictionary file**

Create `data/ingredient-dictionary.json`. Seed it with the common synonym pairs and the EU fragrance allergens — these are the highest-value entries because EU law requires their declaration *precisely because* they commonly cause reactions.

```json
{
  "version": 1,
  "entries": [
    {
      "inci_name": "Aqua",
      "common_name": "Water",
      "synonyms": ["Water", "Eau", "Aqua/Water/Eau", "Aqua (Water)"],
      "flags": []
    },
    {
      "inci_name": "Tocopherol",
      "common_name": "Vitamin E",
      "synonyms": ["Vitamin E", "Tocopherol (Vitamin E)"],
      "flags": []
    },
    {
      "inci_name": "Linalool",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Limonene",
      "common_name": null,
      "synonyms": ["D-Limonene"],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Citronellol",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Geraniol",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Citral",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Eugenol",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Coumarin",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    },
    {
      "inci_name": "Benzyl Alcohol",
      "common_name": null,
      "synonyms": [],
      "flags": [
        {
          "flag_type": "eu_fragrance_allergen",
          "source": "EU Cosmetics Regulation 1223/2009 Annex III"
        }
      ]
    }
  ]
}
```

> The full Annex III fragrance-allergen list has 26 entries. Add the remaining
> 16 (Amyl Cinnamal, Benzyl Salicylate, Cinnamyl Alcohol, Cinnamal, Hydroxycitronellal,
> Isoeugenol, Anisyl Alcohol, Benzyl Cinnamate, Farnesol, Butylphenyl Methylpropional,
> Alpha-Isomethyl Ionone, Benzyl Benzoate, Amylcinnamyl Alcohol, Methyl 2-Octynoate,
> Evernia Prunastri Extract, Evernia Furfuracea Extract) using the same shape.
> Task 10 grows the dictionary further from the real corpus.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/dictionary.ts pipeline/tests/dictionary.test.ts data/ingredient-dictionary.json
git commit -m "feat: ingredient dictionary with EU fragrance allergen flags"
```

---

## Task 7: Auto-accept bar

**Files:**
- Create: `pipeline/src/accept.ts`
- Create: `pipeline/tests/accept.test.ts`

**Interfaces:**
- Consumes: `Classification`, `ExtractedIngredient`, `Dictionary`, `resolveToken`
- Produces: `evaluateAcceptance(params): AcceptDecision` where `AcceptDecision = { accepted: boolean; reasons: string[] }`; `CONFIDENCE_THRESHOLD`

This is the safety gate the whole design exists for. Each of the four conditions gets its own test, so a regression names itself.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/accept.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { evaluateAcceptance } from "../src/accept";
import type { Dictionary } from "../src/dictionary";
import type { ExtractedIngredient } from "../src/types";

const DICT: Dictionary = {
  version: 1,
  entries: [
    { inci_name: "Aqua", common_name: "Water", synonyms: ["Water"], flags: [] },
    { inci_name: "Glycerin", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Tocopherol", common_name: null, synonyms: [], flags: [] },
  ],
};

function ings(...names: string[]): ExtractedIngredient[] {
  return names.map((n, i) => ({ raw: n, canonical: n, position: i }));
}

const GOOD = {
  classification: "full_list" as const,
  confidence: 0.95,
  ingredients: ings("Aqua", "Glycerin", "Tocopherol"),
  dictionary: DICT,
};

describe("evaluateAcceptance", () => {
  test("accepts a clean, confident, fully-resolved full list", () => {
    expect(evaluateAcceptance(GOOD).accepted).toBe(true);
  });

  test("REJECTS key_ingredients even at confidence 1.0", () => {
    // The single most important rule in the system. A "Key Ingredients" block
    // is a partial list by definition, so no confidence value makes it safe.
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "key_ingredients",
      confidence: 1.0,
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/key_ingredients/i);
  });

  test("rejects confidence below the threshold", () => {
    const decision = evaluateAcceptance({ ...GOOD, confidence: 0.89 });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/confidence/i);
  });

  test("rejects a list containing an unresolvable ingredient", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      ingredients: ings("Aqua", "Glycerin", "Unobtainium"),
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/Unobtainium/);
  });

  test("rejects a list that is too short to be a real INCI list", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      ingredients: ings("Aqua", "Glycerin"),
    });
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/at least 3/i);
  });

  test("rejects active_inactive, which always needs review", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "active_inactive",
    });
    expect(decision.accepted).toBe(false);
  });

  test("reports every failing reason, not just the first", () => {
    const decision = evaluateAcceptance({
      ...GOOD,
      classification: "key_ingredients",
      confidence: 0.1,
      ingredients: ings("Unobtainium"),
    });
    expect(decision.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/accept.test.ts`
Expected: FAIL — `Cannot find module '../src/accept'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/accept.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/accept.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/accept.ts pipeline/tests/accept.test.ts
git commit -m "feat: conservative auto-accept bar for extractions"
```

---

## Task 8: Candidate store (review queue)

**Files:**
- Create: `pipeline/src/candidates.ts`
- Create: `pipeline/tests/candidates.test.ts`

**Interfaces:**
- Consumes: `Classification`, `ExtractedIngredient`
- Produces: `Candidate` type; `loadCandidates(path): Candidate[]`; `saveCandidates(path, c): void`; `upsertCandidate(list, c): Candidate[]`; `pendingCandidates(list): Candidate[]`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/candidates.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/candidates.test.ts`
Expected: FAIL — `Cannot find module '../src/candidates'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/candidates.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/candidates.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/candidates.ts pipeline/tests/candidates.test.ts
git commit -m "feat: review-queue candidate store"
```

---

## Task 9: Shopify catalogue read and metafield writes

**Files:**
- Create: `pipeline/src/shopify.ts`
- Create: `pipeline/tests/shopify.test.ts`

**Interfaces:**
- Consumes: `ExtractedIngredient`, `Classification`
- Produces: `ShopifyProduct` type; `buildMetafieldWrites(productGid, params): MetafieldWrite[]`; `chunkMetafields(writes, size?): MetafieldWrite[][]`; `fetchAllProducts(client): Promise<ShopifyProduct[]>`; `METAFIELD_NAMESPACE`

`buildMetafieldWrites` and `chunkMetafields` are pure and fully tested. The network calls are thin wrappers over them.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/shopify.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  buildMetafieldWrites,
  chunkMetafields,
  METAFIELD_NAMESPACE,
} from "../src/shopify";

const GID = "gid://shopify/Product/123";

describe("buildMetafieldWrites", () => {
  const writes = buildMetafieldWrites(GID, {
    ingredients: [
      { raw: "Aqua", canonical: "Aqua", position: 0 },
      { raw: "Glycerin", canonical: "Glycerin", position: 1 },
    ],
    classification: "full_list",
    confidence: 0.95,
    reviewedAt: "2026-08-17T10:00:00Z",
  });

  function get(key: string) {
    return writes.find((w) => w.key === key)!;
  }

  test("writes all four metafields in the asgard namespace", () => {
    expect(writes).toHaveLength(4);
    expect(writes.every((w) => w.namespace === METAFIELD_NAMESPACE)).toBe(true);
    expect(writes.every((w) => w.ownerId === GID)).toBe(true);
  });

  test("encodes the ingredient list as a JSON array string, in order", () => {
    const list = get("inci_list");
    expect(list.type).toBe("list.single_line_text_field");
    expect(JSON.parse(list.value)).toEqual(["Aqua", "Glycerin"]);
  });

  test("records the source so a partial list is never mistaken for complete", () => {
    expect(get("inci_source").value).toBe("full_list");
  });

  test("records confidence and review timestamp", () => {
    expect(get("inci_confidence").value).toBe("0.95");
    expect(get("inci_reviewed_at").type).toBe("date_time");
    expect(get("inci_reviewed_at").value).toBe("2026-08-17T10:00:00Z");
  });

  test("marks key_ingredients as partial in inci_source", () => {
    const partial = buildMetafieldWrites(GID, {
      ingredients: [{ raw: "Niacinamide", canonical: "Niacinamide", position: 0 }],
      classification: "key_ingredients",
      confidence: 0.8,
      reviewedAt: "2026-08-17T10:00:00Z",
    });
    expect(partial.find((w) => w.key === "inci_source")!.value).toBe(
      "key_ingredients",
    );
  });
});

describe("chunkMetafields", () => {
  test("never exceeds the 25-metafield API limit", () => {
    // 10 products x 4 metafields = 40 writes
    const writes = Array.from({ length: 40 }, (_, i) => ({
      ownerId: `gid://shopify/Product/${i}`,
      namespace: METAFIELD_NAMESPACE,
      key: "inci_list",
      type: "list.single_line_text_field",
      value: "[]",
    }));

    const chunks = chunkMetafields(writes);

    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.flat()).toHaveLength(40);
  });

  test("keeps a product's four metafields together in one chunk", () => {
    // metafieldsSet is atomic per call, so splitting a product across two
    // calls could leave it with a list but no source marker.
    const writes = Array.from({ length: 12 }, (_, i) => ({
      ownerId: `gid://shopify/Product/${Math.floor(i / 4)}`,
      namespace: METAFIELD_NAMESPACE,
      key: `k${i % 4}`,
      type: "single_line_text_field",
      value: "x",
    }));

    const chunks = chunkMetafields(writes, 8);

    for (const chunk of chunks) {
      const owners = new Set(chunk.map((w) => w.ownerId));
      for (const owner of owners) {
        const inChunk = chunk.filter((w) => w.ownerId === owner).length;
        const total = writes.filter((w) => w.ownerId === owner).length;
        expect(inChunk).toBe(total);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/shopify.test.ts`
Expected: FAIL — `Cannot find module '../src/shopify'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/shopify.ts`:

```typescript
import type { Classification, ExtractedIngredient } from "./types";

export const METAFIELD_NAMESPACE = "asgard";
/** metafieldsSet accepts at most 25 metafields per call. */
export const MAX_METAFIELDS_PER_CALL = 25;
const METAFIELDS_PER_PRODUCT = 4;

export interface MetafieldWrite {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  descriptionHtml: string;
}

export interface BuildParams {
  ingredients: ExtractedIngredient[];
  classification: Classification;
  confidence: number;
  reviewedAt: string;
}

export function buildMetafieldWrites(
  productGid: string,
  params: BuildParams,
): MetafieldWrite[] {
  const ordered = [...params.ingredients].sort(
    (a, b) => a.position - b.position,
  );

  const base = { ownerId: productGid, namespace: METAFIELD_NAMESPACE };

  return [
    {
      ...base,
      key: "inci_list",
      type: "list.single_line_text_field",
      // List metafields take a JSON-encoded array as their value.
      value: JSON.stringify(ordered.map((i) => i.canonical)),
    },
    {
      ...base,
      key: "inci_source",
      type: "single_line_text_field",
      value: params.classification,
    },
    {
      ...base,
      key: "inci_confidence",
      type: "number_decimal",
      value: String(params.confidence),
    },
    {
      ...base,
      key: "inci_reviewed_at",
      type: "date_time",
      value: params.reviewedAt,
    },
  ];
}

/**
 * Split writes into API-sized calls without ever splitting one product across
 * two calls. metafieldsSet is atomic per call, so a split product could end up
 * with an ingredient list but no inci_source marker — precisely the state where
 * a partial list looks complete.
 */
export function chunkMetafields(
  writes: MetafieldWrite[],
  maxPerCall: number = MAX_METAFIELDS_PER_CALL,
): MetafieldWrite[][] {
  const byOwner = new Map<string, MetafieldWrite[]>();
  for (const write of writes) {
    const group = byOwner.get(write.ownerId) ?? [];
    group.push(write);
    byOwner.set(write.ownerId, group);
  }

  const productsPerCall = Math.max(
    1,
    Math.floor(maxPerCall / METAFIELDS_PER_PRODUCT),
  );

  const chunks: MetafieldWrite[][] = [];
  let current: MetafieldWrite[] = [];
  let productsInCurrent = 0;

  for (const group of byOwner.values()) {
    if (productsInCurrent >= productsPerCall) {
      chunks.push(current);
      current = [];
      productsInCurrent = 0;
    }
    current.push(...group);
    productsInCurrent += 1;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title vendor descriptionHtml }
    }
  }
`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

export interface GraphQLClient {
  request(query: string, variables?: Record<string, unknown>): Promise<any>;
}

const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build a client against the Admin GraphQL API using a custom app token.
 *
 * Shopify uses a leaky-bucket rate limit and answers 429 when it is drained.
 * It also returns THROTTLED inside a 200 response for GraphQL specifically,
 * so checking response.ok alone is not enough.
 */
export function createAdminClient(
  shopDomain: string,
  accessToken: string,
): GraphQLClient {
  const url = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  return {
    async request(query, variables = {}) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables }),
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? 2);
          await sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `Shopify API ${response.status}: ${await response.text()}`,
          );
        }

        const json = await response.json();

        // GraphQL throttling arrives as a 200 with an error code.
        const throttled = json.errors?.some(
          (e: { extensions?: { code?: string } }) =>
            e.extensions?.code === "THROTTLED",
        );
        if (throttled) {
          await sleep(2 ** attempt * 1000);
          continue;
        }

        if (json.errors) {
          throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
        }
        return json.data;
      }

      throw new Error(`Shopify API still throttled after ${MAX_RETRIES} retries`);
    },
  };
}

export async function fetchAllProducts(
  client: GraphQLClient,
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  for (;;) {
    const data = await client.request(PRODUCTS_QUERY, { cursor });
    products.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return products;
}

export async function writeMetafields(
  client: GraphQLClient,
  writes: MetafieldWrite[],
): Promise<void> {
  for (const chunk of chunkMetafields(writes)) {
    const data = await client.request(METAFIELDS_SET, { metafields: chunk });
    const errors = data.metafieldsSet.userErrors;
    if (errors.length > 0) {
      throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run pipeline/tests/shopify.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/shopify.ts pipeline/tests/shopify.test.ts
git commit -m "feat: Shopify catalogue read and chunked metafield writes"
```

---

## Task 10: Orchestrator CLI

**Files:**
- Create: `pipeline/src/anthropic-client.ts`
- Create: `pipeline/src/run.ts`
- Create: `pipeline/tests/run.test.ts`
- Modify: `package.json` (add `pipeline:extract` script)

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 5, 6, 7, 8, 9
- Produces: `processProduct(deps, product): Promise<Candidate>`; `mapWithConcurrency<T, R>(items, limit, fn): Promise<R[]>`

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/run.test.ts`:

```typescript
import { describe, expect, test, vi } from "vitest";
import {
  mapWithConcurrency,
  processProduct,
  reevaluateCandidates,
} from "../src/run";
import type { Dictionary } from "../src/dictionary";

const DICT: Dictionary = {
  version: 1,
  entries: [
    { inci_name: "Aqua", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Glycerin", common_name: null, synonyms: [], flags: [] },
    { inci_name: "Tocopherol", common_name: null, synonyms: [], flags: [] },
  ],
};

const PRODUCT = {
  id: "gid://shopify/Product/1",
  title: "Test Serum",
  vendor: "Test Brand",
  descriptionHtml: "<p>Ingredients: Aqua, Glycerin, Tocopherol</p>",
};

function deps(classification: string, confidence: number) {
  return {
    dictionary: DICT,
    classify: vi.fn().mockResolvedValue({
      classification,
      reasoning: "",
      confidence,
    }),
    extract: vi.fn().mockResolvedValue({
      ingredients: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
        { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
      ],
      confidence,
      notes: "",
    }),
  };
}

describe("processProduct", () => {
  test("marks a clean full list as approved", async () => {
    const candidate = await processProduct(deps("full_list", 0.95), PRODUCT);
    expect(candidate.status).toBe("approved");
    expect(candidate.reasons).toEqual([]);
  });

  test("routes key_ingredients to pending review", async () => {
    const candidate = await processProduct(
      deps("key_ingredients", 0.99),
      PRODUCT,
    );
    expect(candidate.status).toBe("pending");
    expect(candidate.reasons.join(" ")).toMatch(/key_ingredients/i);
  });

  test("routes low confidence to pending review", async () => {
    const candidate = await processProduct(deps("full_list", 0.4), PRODUCT);
    expect(candidate.status).toBe("pending");
  });

  test("skips the extract call entirely when there is no ingredient data", async () => {
    const d = deps("none", 1);
    const candidate = await processProduct(d, PRODUCT);
    expect(d.extract).not.toHaveBeenCalled();
    expect(candidate.status).toBe("pending");
  });

  test("carries the stripped description for the reviewer", async () => {
    const candidate = await processProduct(deps("full_list", 0.95), PRODUCT);
    expect(candidate.rawText).toBe("Ingredients: Aqua, Glycerin, Tocopherol");
  });
});

describe("reevaluateCandidates", () => {
  const base = {
    productGid: "gid://shopify/Product/1",
    productTitle: "T",
    vendor: "V",
    rawText: "x",
    classification: "full_list" as const,
    proposedList: [
      { raw: "Aqua", canonical: "Aqua", position: 0 },
      { raw: "Glycerin", canonical: "Glycerin", position: 1 },
      { raw: "Tocopherol", canonical: "Tocopherol", position: 2 },
    ],
    confidence: 0.95,
    reasons: ["unrecognised ingredients: Tocopherol"],
    status: "pending" as const,
    reviewedAt: null,
  };

  test("promotes a candidate once the dictionary covers its ingredients", () => {
    const [result] = reevaluateCandidates([base], DICT);
    expect(result.status).toBe("approved");
    expect(result.reasons).toEqual([]);
  });

  test("leaves an already-reviewed candidate alone", () => {
    // A human decision outranks the automated bar.
    const rejected = { ...base, status: "rejected" as const };
    const [result] = reevaluateCandidates([rejected], DICT);
    expect(result.status).toBe("rejected");
  });

  test("keeps a candidate pending when the dictionary still lacks an ingredient", () => {
    const withUnknown = {
      ...base,
      proposedList: [
        ...base.proposedList,
        { raw: "Unobtainium", canonical: "Unobtainium", position: 3 },
      ],
    };
    const [result] = reevaluateCandidates([withUnknown], DICT);
    expect(result.status).toBe("pending");
    expect(result.reasons.join(" ")).toMatch(/Unobtainium/);
  });
});

describe("mapWithConcurrency", () => {
  test("processes every item", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 5, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(5);
  });

  test("preserves input order in the output", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n * 10));
      return n;
    });
    expect(result).toEqual([3, 1, 2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run pipeline/tests/run.test.ts`
Expected: FAIL — `Cannot find module '../src/run'`

- [ ] **Step 3: Write the Anthropic client adapter**

Create `pipeline/src/anthropic-client.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ClassifierClient } from "./classify";

/**
 * Synchronous ClassifierClient.
 *
 * Structured outputs make the response schema-valid by construction, so
 * callers can JSON.parse without defensive handling.
 */
export function createAnthropicClient(apiKey: string): ClassifierClient {
  const client = new Anthropic({ apiKey });

  return {
    async complete(prompt: string, schema: object): Promise<string> {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("model declined the request");
      }

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") {
        throw new Error("no text block in response");
      }
      return text.text;
    },
  };
}
```

Install the SDK:

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 4: Write the orchestrator**

Create `pipeline/src/run.ts`:

```typescript
import { config } from "dotenv";
import { evaluateAcceptance } from "./accept";
import { createAnthropicClient } from "./anthropic-client";
import { classifyDescription } from "./classify";
import {
  loadCandidates,
  saveCandidates,
  upsertCandidate,
  type Candidate,
} from "./candidates";
import { loadDictionary, type Dictionary } from "./dictionary";
import { extractIngredients } from "./extract";
import {
  createAdminClient,
  fetchAllProducts,
  type ShopifyProduct,
} from "./shopify";
import { stripHtml } from "./strip-html";
import type { ClassifyResult, ExtractResult } from "./types";

const DICTIONARY_PATH = "data/ingredient-dictionary.json";
const CANDIDATES_PATH = "data/candidates.json";
const CONCURRENCY = 5;

export interface ProcessDeps {
  dictionary: Dictionary;
  classify: (text: string) => Promise<ClassifyResult>;
  extract: (
    text: string,
    classification: ClassifyResult["classification"],
  ) => Promise<ExtractResult>;
}

/** Run both passes for one product and decide whether it needs review. */
export async function processProduct(
  deps: ProcessDeps,
  product: ShopifyProduct,
): Promise<Candidate> {
  const text = stripHtml(product.descriptionHtml);
  const classified = await deps.classify(text);

  const extracted =
    classified.classification === "none"
      ? { ingredients: [], confidence: classified.confidence, notes: "" }
      : await deps.extract(text, classified.classification);

  const decision = evaluateAcceptance({
    classification: classified.classification,
    confidence: Math.min(classified.confidence, extracted.confidence),
    ingredients: extracted.ingredients,
    dictionary: deps.dictionary,
  });

  return {
    productGid: product.id,
    productTitle: product.title,
    vendor: product.vendor,
    rawText: text,
    classification: classified.classification,
    proposedList: extracted.ingredients,
    confidence: Math.min(classified.confidence, extracted.confidence),
    reasons: decision.reasons,
    status: decision.accepted ? "approved" : "pending",
    reviewedAt: null,
  };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Re-run ONLY the accept bar against a grown dictionary, reusing the cached
 * extractions.
 *
 * This is the spec's stage 3. Growing the dictionary is an iterative loop, and
 * re-extracting on every pass would re-pay the full model cost to re-test a
 * pure function. Already-reviewed candidates are left alone — a human decision
 * outranks the bar.
 */
export function reevaluateCandidates(
  candidates: Candidate[],
  dictionary: Dictionary,
): Candidate[] {
  return candidates.map((candidate) => {
    if (candidate.status !== "pending") return candidate;

    const decision = evaluateAcceptance({
      classification: candidate.classification,
      confidence: candidate.confidence,
      ingredients: candidate.proposedList,
      dictionary,
    });

    return {
      ...candidate,
      reasons: decision.reasons,
      status: decision.accepted ? "approved" : "pending",
    };
  });
}

export async function reevaluateMain(): Promise<void> {
  const dictionary = loadDictionary(DICTIONARY_PATH);
  const before = loadCandidates(CANDIDATES_PATH);
  const after = reevaluateCandidates(before, dictionary);
  saveCandidates(CANDIDATES_PATH, after);

  const pendingBefore = before.filter((c) => c.status === "pending").length;
  const pendingAfter = after.filter((c) => c.status === "pending").length;
  console.log(
    `Re-evaluated ${before.length} candidates against dictionary v${dictionary.version}.`,
  );
  console.log(
    `Pending: ${pendingBefore} -> ${pendingAfter} (${pendingBefore - pendingAfter} newly auto-accepted). No model calls made.`,
  );
}

async function main(): Promise<void> {
  config();

  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopToken = process.env.SHOPIFY_ADMIN_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!shop || !shopToken || !anthropicKey) {
    throw new Error(
      "Missing env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_TOKEN, ANTHROPIC_API_KEY",
    );
  }

  const dictionary = loadDictionary(DICTIONARY_PATH);
  const anthropic = createAnthropicClient(anthropicKey);
  const admin = createAdminClient(shop, shopToken);

  console.log("Fetching catalogue...");
  const products = await fetchAllProducts(admin);
  console.log(`${products.length} products`);

  const deps: ProcessDeps = {
    dictionary,
    classify: (text) => classifyDescription(anthropic, text),
    extract: (text, classification) =>
      extractIngredients(anthropic, text, classification),
  };

  let done = 0;
  const candidates = await mapWithConcurrency(
    products,
    CONCURRENCY,
    async (product) => {
      const candidate = await processProduct(deps, product);
      done += 1;
      console.log(
        `[${done}/${products.length}] ${candidate.status.padEnd(8)} ${candidate.productTitle}`,
      );
      return candidate;
    },
  );

  let stored = loadCandidates(CANDIDATES_PATH);
  for (const candidate of candidates) {
    stored = upsertCandidate(stored, candidate);
  }
  saveCandidates(CANDIDATES_PATH, stored);

  const approved = candidates.filter((c) => c.status === "approved").length;
  console.log(
    `\nDone. ${approved} auto-accepted, ${candidates.length - approved} need review.`,
  );
  console.log(`Review them at /app/review — nothing has been written to Shopify yet.`);
}

// Only run when executed directly, so tests can import this module freely.
if (process.argv[1]?.endsWith("run.ts")) {
  const entry = process.argv.includes("--reevaluate") ? reevaluateMain : main;
  entry().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

Add to `package.json` scripts:

```json
"pipeline:extract": "tsx pipeline/src/run.ts",
"pipeline:reevaluate": "tsx pipeline/src/run.ts --reevaluate"
```

Install the runner and dotenv:

```bash
npm install --save-dev tsx
npm install dotenv
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run pipeline/tests/run.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all tests across all files

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/run.ts pipeline/src/anthropic-client.ts pipeline/tests/run.test.ts package.json package-lock.json
git commit -m "feat: extraction pipeline orchestrator with bounded concurrency"
```

---

## Task 11: Admin review UI

**Files:**
- Create: `app/routes/app.review.tsx`
- Modify: `app/routes/app.tsx` (add nav link)

**Interfaces:**
- Consumes: `loadCandidates`, `saveCandidates`, `pendingCandidates`, `Candidate` from `pipeline/src/candidates`; `buildMetafieldWrites`, `writeMetafields`, `createAdminClient` from `pipeline/src/shopify`
- Produces: a `/app/review` route

- [ ] **Step 1: Write the route**

Create `app/routes/app.review.tsx`:

```tsx
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  loadCandidates,
  pendingCandidates,
  saveCandidates,
} from "../../pipeline/src/candidates";
import {
  buildMetafieldWrites,
  writeMetafields,
} from "../../pipeline/src/shopify";
import { authenticate } from "../shopify.server";

const CANDIDATES_PATH = "data/candidates.json";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { candidates: pendingCandidates(loadCandidates(CANDIDATES_PATH)) };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const productGid = String(form.get("productGid"));
  const decision = String(form.get("decision"));

  const all = loadCandidates(CANDIDATES_PATH);
  const candidate = all.find((c) => c.productGid === productGid);
  if (!candidate) return { ok: false, error: "candidate not found" };

  if (decision === "approve") {
    const reviewedAt = new Date().toISOString();
    const writes = buildMetafieldWrites(candidate.productGid, {
      ingredients: candidate.proposedList,
      classification: candidate.classification,
      confidence: candidate.confidence,
      reviewedAt,
    });
    await writeMetafields(
      { request: (query, variables) => admin.graphql(query, { variables }).then((r) => r.json()).then((j) => j.data) },
      writes,
    );
    candidate.status = "approved";
    candidate.reviewedAt = reviewedAt;
  } else {
    candidate.status = "rejected";
    candidate.reviewedAt = new Date().toISOString();
  }

  saveCandidates(CANDIDATES_PATH, all);
  return { ok: true };
}

export default function ReviewQueue() {
  const { candidates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  if (candidates.length === 0) {
    return (
      <Page title="Ingredient review">
        <Card>
          <Text as="p">
            Nothing to review. Run <code>npm run pipeline:extract</code> to
            process the catalogue.
          </Text>
        </Card>
      </Page>
    );
  }

  return (
    <Page title={`Ingredient review (${candidates.length} pending)`}>
      <Layout>
        {candidates.map((candidate) => (
          <Layout.Section key={candidate.productGid}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    {candidate.productTitle}
                  </Text>
                  <InlineStack gap="200">
                    <Badge
                      tone={
                        candidate.classification === "full_list"
                          ? "success"
                          : "attention"
                      }
                    >
                      {candidate.classification}
                    </Badge>
                    <Badge>{`confidence ${candidate.confidence}`}</Badge>
                  </InlineStack>
                </InlineStack>

                <Text as="p" tone="subdued">
                  {candidate.vendor}
                </Text>

                {candidate.reasons.length > 0 && (
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      Why this needs review
                    </Text>
                    <List type="bullet">
                      {candidate.reasons.map((reason) => (
                        <List.Item key={reason}>{reason}</List.Item>
                      ))}
                    </List>
                  </BlockStack>
                )}

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Proposed list ({candidate.proposedList.length}) — in
                    concentration order
                  </Text>
                  <Text as="p">
                    {candidate.proposedList.map((i) => i.canonical).join(", ") ||
                      "(none extracted)"}
                  </Text>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Original description
                  </Text>
                  <Text as="p" tone="subdued">
                    {candidate.rawText.slice(0, 600)}
                  </Text>
                </BlockStack>

                <InlineStack gap="200">
                  <fetcher.Form method="post">
                    <input
                      type="hidden"
                      name="productGid"
                      value={candidate.productGid}
                    />
                    <input type="hidden" name="decision" value="approve" />
                    <Button submit variant="primary">
                      Approve and write to Shopify
                    </Button>
                  </fetcher.Form>
                  <fetcher.Form method="post">
                    <input
                      type="hidden"
                      name="productGid"
                      value={candidate.productGid}
                    />
                    <input type="hidden" name="decision" value="reject" />
                    <Button submit tone="critical">
                      Reject
                    </Button>
                  </fetcher.Form>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `app/routes/app.tsx`, inside the existing `<NavMenu>` element, add:

```tsx
<Link to="/app/review">Ingredient review</Link>
```

- [ ] **Step 3: Verify it renders**

```bash
npm run dev
```

Open the app in your Shopify admin and click "Ingredient review". With no `data/candidates.json` present, it should show the empty state telling you to run the pipeline.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add app/routes/app.review.tsx app/routes/app.tsx
git commit -m "feat: admin review queue for pending extractions"
```

---

## Task 12: First real run and dictionary growth

**Files:**
- Modify: `data/ingredient-dictionary.json`

**Interfaces:**
- Consumes: everything
- Produces: populated metafields and a grown dictionary

- [ ] **Step 1: Create the metafield definitions in Shopify**

Definitions give the metafields names and types in the Shopify admin UI. Run in the GraphQL app at `https://<your-shop>.myshopify.com/admin/apps/shopify-graphiql-app`, once per key:

```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    namespace: "asgard"
    key: "inci_list"
    name: "INCI ingredient list"
    description: "Ordered by descending concentration"
    type: "list.single_line_text_field"
    ownerType: PRODUCT
  }) {
    createdDefinition { id name }
    userErrors { field message code }
  }
}
```

Repeat for `inci_source` (`single_line_text_field`), `inci_confidence` (`number_decimal`), and `inci_reviewed_at` (`date_time`).

- [ ] **Step 2: Dry-run against a handful of products first**

Temporarily change `CONCURRENCY` to `2` and add `.slice(0, 5)` after `fetchAllProducts(admin)` in `pipeline/src/run.ts`. Then:

```bash
npm run pipeline:extract
```

Expected: 5 lines of output, each `approved` or `pending`. Inspect `data/candidates.json` and confirm the ingredient lists match the product pages. **Nothing has been written to Shopify yet** — the pipeline only writes `candidates.json`.

- [ ] **Step 3: Run the full catalogue**

Remove the `.slice(0, 5)`, restore `CONCURRENCY` to `5`, and run again. Expect roughly 10 minutes and a summary line like `62 auto-accepted, 33 need review`.

- [ ] **Step 4: Grow the dictionary from the real corpus**

List every ingredient the accept bar could not resolve:

```bash
node -e "
const c = require('./data/candidates.json');
const missing = new Map();
for (const cand of c) {
  for (const r of cand.reasons) {
    const m = r.match(/^unrecognised ingredients: (.*)$/);
    if (m) for (const name of m[1].split(', ')) missing.set(name, (missing.get(name) || 0) + 1);
  }
}
[...missing.entries()].sort((a,b) => b[1]-a[1]).forEach(([n,count]) => console.log(count, n));
" | head -60
```

Add the genuine ingredients to `data/ingredient-dictionary.json`, working down by frequency. Where two entries are the same ingredient spelled differently, add one as a `synonym` of the other rather than as a second entry. Bump `version`.

- [ ] **Step 5: Re-evaluate — do NOT re-extract**

```bash
npm run pipeline:reevaluate
```

Expected output like `Pending: 33 -> 19 (14 newly auto-accepted). No model calls made.`

This re-runs only the accept bar against the cached extractions. **Use this, not `pipeline:extract`, while growing the dictionary** — re-extracting would re-pay the full model cost and ~10 minutes to re-test a pure function whose inputs have not changed. Re-run `pipeline:extract` only when the *catalogue* changes or you have edited a prompt.

Repeat steps 4–5 until the remaining pending items are genuine judgement calls rather than dictionary gaps.

- [ ] **Step 6: Work the review queue**

Open `/app/review` in the Shopify admin. For each candidate, check the proposed list against the original description and approve or reject. Approving writes the metafields immediately.

- [ ] **Step 7: Verify metafields landed on a product**

```graphql
query {
  products(first: 3) {
    nodes {
      title
      metafields(namespace: "asgard", first: 4) { nodes { key value type } }
    }
  }
}
```

Expected: `inci_list` holds a JSON array in concentration order; `inci_source` says `full_list`.

- [ ] **Step 8: Commit the grown dictionary**

```bash
git add data/ingredient-dictionary.json
git commit -m "feat: grow ingredient dictionary from the live corpus"
```

---

## Done when

- [ ] Every product with recoverable ingredient data has `asgard.inci_list` populated in concentration order
- [ ] Every populated product has `asgard.inci_source`, so no partial list can pass as complete
- [ ] `npm test` passes
- [ ] The `key_ingredients` regression test in `pipeline/tests/accept.test.ts` passes — a "Key Ingredients" block is never auto-accepted
- [ ] `data/ingredient-dictionary.json` is committed and covers the catalogue's common ingredients
- [ ] `/app/review` shows an empty queue
- [ ] No secrets are committed: `git log -p | grep -iE 'shpat_|sk-ant-'` returns nothing
