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
- **`metafieldsSet` accepts a maximum of 25 metafields per call** and is atomic — a single error persists nothing. `pipeline:publish` makes **one call per product** (three or four metafields), so a product's writes are never split across calls and one bad product fails alone.
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

## Implementation notes

The pipeline was built as a **self-contained package at `pipeline/`** — its own
`package.json`, `vitest.config.ts`, and `tsconfig.json`. Run its scripts from
inside `pipeline/` (e.g. `cd pipeline && npm run pipeline:extract`), not from
the repo root. Two tasks were added beyond this plan's original scope: **Task
10b** (publish approved candidates to Shopify) and **Task 10c** (a fixture
accuracy check that scores the classifier against the hand-labelled set
before any publish).

---

## File Structure

```
/                                        (repo root)
├── shopify.app.toml                     scaffolded — app config
├── package.json                         scaffolded — root Shopify app only; the pipeline has its own package.json and scripts
├── vite.config.ts                       scaffolded — the pipeline runs its own Vitest config from pipeline/, not this file
├── .gitignore                           the repo's own, with the template's rules merged in by hand (Task 1)
├── app/                                 React Router app (scaffolded)
│   ├── shopify.server.ts                scaffolded — Shopify auth
│   └── routes/
│       └── app.review.tsx               Task 11 — review queue UI
├── data/
│   ├── ingredient-dictionary.json       Task 6 — curated dictionary
│   ├── candidates.json                  Task 8 — review queue; holds human review decisions (gitignored, not regenerable)
│   └── candidates.json.bak              previous version, kept by every save (gitignored)
├── pipeline/                            self-contained package — run its scripts from inside pipeline/
│   ├── package.json                     own dependencies and pipeline:* scripts
│   ├── vitest.config.ts                 own Vitest config
│   ├── tsconfig.json                    own TypeScript config (@types/node, resolveJsonModule)
│   ├── .env.sample                      committed template — copy to pipeline/.env (gitignored) for pipeline secrets
│   ├── fixtures/
│   │   └── labelled-products.json       Task 3 — hand-labelled test set (plus 4 derived highlights-only fixtures)
│   ├── src/
│   │   ├── types.ts                     Task 2 — shared types
│   │   ├── strip-html.ts                Task 2 — HTML → text
│   │   ├── classify.ts                  Task 4 — pass 1
│   │   ├── extract.ts                   Task 5 — pass 2
│   │   ├── dictionary.ts                Task 6 — load/normalize/resolve
│   │   ├── accept.ts                    Task 7 — auto-accept bar
│   │   ├── candidates.ts                Task 8 — review queue store (atomic save + .bak)
│   │   ├── shopify.ts                   Task 9 — catalogue read + metafield write
│   │   ├── anthropic-client.ts          Task 10 — Claude API adapter
│   │   ├── run.ts                       Task 10 — orchestrator CLI (extract / reevaluate / publish)
│   │   └── evaluate.ts                  Task 10c — fixture gate: classification + extraction
│   └── tests/                           one test file per src module
└── docs/superpowers/{specs,plans}/
```

There is no root `.env` or `.env.sample`: the app's Shopify secrets are managed
by the Shopify CLI, and the pipeline's live in `pipeline/.env`.

Each pipeline module has one responsibility and is independently testable. `strip-html`, `dictionary`, and `accept` are pure functions with no I/O — they carry the highest test value and no API cost.

---

## Task 1: Scaffold the Shopify app

**Files:**
- Create: everything from the Shopify template at repo root, except the template's `.gitignore` and `README.md`
- Modify: `.gitignore` (merge the template's ignore rules in by hand — Step 3)
- Copy: `pipeline/.env.sample` → `pipeline/.env` (Step 5; `pipeline/.env.sample` already exists, no root `.env.sample` is created)

**Interfaces:**
- Consumes: nothing
- Produces: a booting Shopify app; `app/shopify.server.ts` exporting `authenticate`

> **Requires your Shopify Partner account.** This task is interactive and cannot be fully automated. It creates an app in your Partner dashboard.

- [ ] **Step 1: Scaffold into a temporary directory**

The Shopify CLI always creates the app in a NEW subdirectory named after
`--name`, inside `--path`. With the command below the app lands in
`/Users/signebone/Documents/projects/_scaffold/asgard-beauty-app/` — not in
`_scaffold/` itself.

```bash
cd /Users/signebone/Documents/projects
npx --yes @shopify/cli@latest app init \
  --template=https://github.com/Shopify/shopify-app-template-react-router \
  --name asgard-beauty-app \
  --path /Users/signebone/Documents/projects/_scaffold
ls /Users/signebone/Documents/projects/_scaffold/asgard-beauty-app/package.json
```

Follow the prompts: log in and choose your organization. Because `--name` is
given, the CLI creates a new app called `asgard-beauty-app` in your Partner
dashboard without asking for a name (you can rename it there later). The
final `ls` must print the path back; if it reports "No such file or
directory", run `ls /Users/signebone/Documents/projects/_scaffold` to see
where the app landed and use that directory in Steps 2 and 3.

- [ ] **Step 2: Copy the scaffold into the repo**

```bash
cd /Users/signebone/Documents/projects/asgard-scan
git checkout feature/shopify-ingredient-foundation
git status
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.gitignore' \
  --exclude='README.md' \
  /Users/signebone/Documents/projects/_scaffold/asgard-beauty-app/ ./
```

`git status` must say "nothing to commit, working tree clean" before you
copy, so that Step 7's commit contains only the scaffold.

Every part of the rsync line matters:

- **The source is `_scaffold/asgard-beauty-app/`, with the trailing slash.**
  That copies the app's *contents* into the repo root. Copying from
  `_scaffold/` instead would put the app in a nested `asgard-beauty-app/`
  directory, and Step 4's `npm install` would fail with no `package.json`.
- **`.gitignore` and `README.md` are excluded.** The template ships its own of
  both; copying them would overwrite the repo's, silently dropping the ignore
  rules for `data/candidates.json`, `data/candidates.json.bak`, `build/` and
  `!.env.sample`, and replacing the project README. Step 3 merges the
  template's ignore rules in by hand instead.
- **`.git` is excluded** because the CLI initialised its own repository in the
  scaffold, and **`node_modules` is excluded** because Step 4 installs fresh.

The pipeline is unaffected: it lives in its own package at `pipeline/`, with
its own `package.json`, so the scaffold's root `package.json` and
`vite.config.ts` do not collide with anything it needs.

- [ ] **Step 3: Merge the template's `.gitignore` into the repo's**

Look at the template's ignore rules (the scaffold directory still exists):

```bash
cat /Users/signebone/Documents/projects/_scaffold/asgard-beauty-app/.gitignore
```

Append to the repo's root `.gitignore`, under a `# Shopify app (template)`
comment, every line it does not already cover. As of this writing that means:

```
/.cache
/app/build
/public/build/
/public/_dev
/app/public/build
/prisma/dev.sqlite
/prisma/dev.sqlite-journal
database.sqlite
/extensions/*/dist
.shopify/*
.shopify.lock
.react-router/
```

The two `prisma/dev.sqlite` lines are the important ones: that file is the
app's session store and holds your shop's Admin API access token. Already
covered by the root file, so skip them: `node_modules`, `.DS_Store`, `/build`
(the root has `build/`), `.env` and `.env.*`. **Leave out any lockfile lines**
(`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) if the template has them:
this repo commits its lockfiles — `pipeline/package-lock.json` is tracked — and
an unanchored `package-lock.json` rule would match the pipeline's too.

Check the rules work (these paths need not exist yet), then remove the scaffold:

```bash
git check-ignore -v prisma/dev.sqlite .shopify/project.json data/candidates.json data/candidates.json.bak pipeline/.env
rm -rf /Users/signebone/Documents/projects/_scaffold
```

Expected: five lines, one matching rule per path. If any path is missing from
the output, fix `.gitignore` before continuing.

- [ ] **Step 4: Verify it boots**

```bash
npm install
npm run dev
```

Expected: the CLI prints a preview URL and the app installs on your development store. Press `p` to open it. You should see the template's default page inside the Shopify admin.

Stop the dev server with Ctrl-C once confirmed.

- [ ] **Step 5: Set up pipeline secrets**

Pipeline secrets live in `pipeline/.env`, not a root `.env.sample` — the
pipeline is a self-contained package that loads its own env file
(`pipeline/src/run.ts` and `pipeline/src/evaluate.ts` resolve `pipeline/.env`
via a module-relative path, independent of the process cwd).
`pipeline/.env.sample` already exists as the committed template; copy it and
fill in real values:

```bash
cp pipeline/.env.sample pipeline/.env
```

Confirm it's gitignored:

```bash
git check-ignore -v pipeline/.env
```

Expected: prints the root `.gitignore`'s plain `.env` rule (e.g.
`.gitignore:12:.env	pipeline/.env`) — an unanchored `.env` matches a file of
that name at any depth. (The `.env.*` rule next to it is for files such as
`.env.local`; it does not match `pipeline/.env`.) If it prints nothing, add
`.env` to `.gitignore` before continuing.

- [ ] **Step 6: Ignore the candidates file — already done**

`data/candidates.json` and its backup `data/candidates.json.bak` are already
listed in the root `.gitignore`, and Step 3's check covered them. Confirm
rather than repeat:

```bash
git check-ignore -v data/candidates.json data/candidates.json.bak
```

Expected: prints a matching `.gitignore` rule for each.

- [ ] **Step 7: Commit**

Do not use `git add -A`. First look at exactly what would be committed:

```bash
git status --short
```

Read every line. It should list only the scaffold's files — `app/`,
`prisma/` (migrations and schema, never `dev.sqlite`), `public/`,
`extensions/`, `package.json`, `package-lock.json`, `shopify.app.toml`,
`vite.config.ts`, `tsconfig.json`, `env.d.ts` and the template's other
dotfiles and docs — plus your `.gitignore` edit. There must be **no `data/`,
no `build/`, no `.env` or `pipeline/.env`, no `prisma/dev.sqlite`, and no
`node_modules/`**. If any of those appears, fix `.gitignore` and look again.

When the list is clean, stage those paths by name, check what is staged, and
commit:

```bash
git add .gitignore <each path listed by git status>
git diff --cached --stat
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
- Consumes: `loadCandidates`, `saveCandidates`, `pendingCandidates`, `upsertCandidate`, `Candidate` from `pipeline/src/candidates`; `buildMetafieldWrites`, `writeMetafields` from `pipeline/src/shopify`
- Produces: a `/app/review` route

The current React Router template builds its UI from **Polaris web
components** (`<s-page>`, `<s-section>`, `<s-button>`, ...) — it does not
install the `@shopify/polaris` React package, and its nav is `<s-app-nav>`,
not `<NavMenu>`. The code below uses the same components as the template's
own `app/routes/app._index.tsx`; compare with that file if anything differs
in your scaffold.

- [ ] **Step 1: Write the route**

Create `app/routes/app.review.tsx`:

```tsx
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  loadCandidates,
  pendingCandidates,
  saveCandidates,
  upsertCandidate,
  type Candidate,
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

  const candidate = loadCandidates(CANDIDATES_PATH).find(
    (c) => c.productGid === productGid,
  );
  if (!candidate) return { ok: false, error: "candidate not found" };
  // Only a pending candidate is the reviewer's to decide: a stale page or a
  // double click must never overturn a decision already made.
  if (candidate.status !== "pending") {
    return { ok: false, error: "candidate was already decided" };
  }

  const now = new Date().toISOString();
  let updated: Candidate;

  if (decision === "approve") {
    // buildMetafieldWrites throws for a "none" candidate or an empty list:
    // those are rejected, never approved (the page offers no Approve button
    // for them).
    const writes = buildMetafieldWrites(candidate.productGid, {
      ingredients: candidate.proposedList,
      classification: candidate.classification,
      confidence: candidate.confidence,
      reviewedAt: now,
    });
    await writeMetafields(
      { request: (query, variables) => admin.graphql(query, { variables }).then((r) => r.json()).then((j) => j.data) },
      writes,
    );
    // Stamp reviewedAt AND publishedAt with the same timestamp: this write
    // already put the metafields on Shopify, so leaving publishedAt null
    // would make pipeline:publish write the product again.
    updated = { ...candidate, status: "approved", reviewedAt: now, publishedAt: now };
  } else {
    updated = { ...candidate, status: "rejected", reviewedAt: now };
  }

  // Re-read the file just before saving and replace only this candidate, so
  // a pipeline command that saved while the Shopify write was in flight is
  // not reverted. saveCandidates is atomic and keeps candidates.json.bak.
  saveCandidates(
    CANDIDATES_PATH,
    upsertCandidate(loadCandidates(CANDIDATES_PATH), updated),
  );
  return { ok: true };
}

export default function ReviewQueue() {
  const { candidates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const decide = (productGid: string, decision: "approve" | "reject") =>
    fetcher.submit({ productGid, decision }, { method: "POST" });

  if (candidates.length === 0) {
    return (
      <s-page heading="Ingredient review">
        <s-section>
          <s-paragraph>
            Nothing to review. Run <code>npm run pipeline:extract</code> from
            inside <code>pipeline/</code> to process the catalogue.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={`Ingredient review (${candidates.length} pending)`}>
      {fetcher.data && !fetcher.data.ok && (
        <s-section>
          <s-paragraph>
            <s-text tone="critical">{fetcher.data.error}</s-text>
          </s-paragraph>
        </s-section>
      )}

      {candidates.map((candidate) => {
        // The only permitted ordering is by position (concentration order).
        const ordered = [...candidate.proposedList].sort(
          (a, b) => a.position - b.position,
        );
        const approvable =
          candidate.classification !== "none" && ordered.length > 0;

        return (
          <s-section key={candidate.productGid} heading={candidate.productTitle}>
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base">
                <s-badge
                  tone={candidate.classification === "full_list" ? "success" : "warning"}
                >
                  {candidate.classification}
                </s-badge>
                <s-badge>{`confidence ${candidate.confidence.toFixed(2)}`}</s-badge>
                <s-text>{candidate.vendor}</s-text>
              </s-stack>

              {candidate.reasons.length > 0 && (
                <s-stack direction="block" gap="small">
                  <s-heading>Why this needs review</s-heading>
                  <s-unordered-list>
                    {candidate.reasons.map((reason) => (
                      <s-list-item key={reason}>{reason}</s-list-item>
                    ))}
                  </s-unordered-list>
                </s-stack>
              )}

              <s-stack direction="block" gap="small">
                <s-heading>
                  {`Proposed list (${ordered.length}) — in concentration order`}
                </s-heading>
                <s-paragraph>
                  {ordered.map((i) => i.canonical).join(", ") || "(none extracted)"}
                </s-paragraph>
              </s-stack>

              <s-stack direction="block" gap="small">
                <s-heading>Extraction notes</s-heading>
                <s-paragraph>
                  {candidate.notes || "(no notes — check which section the list came from)"}
                </s-paragraph>
                <s-heading>Classifier reasoning</s-heading>
                <s-paragraph>{candidate.reasoning || "(none recorded)"}</s-paragraph>
              </s-stack>

              <s-stack direction="block" gap="small">
                <s-heading>Original description (full text)</s-heading>
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  {/* s-box cannot scroll, so a plain div does: the ingredient
                      list is usually far down the description, and the
                      reviewer must be able to check every entry against it. */}
                  <div style={{ maxHeight: "24rem", overflowY: "auto", whiteSpace: "pre-wrap" }}>
                    {candidate.rawText}
                  </div>
                </s-box>
              </s-stack>

              <s-stack direction="inline" gap="base">
                {approvable && (
                  <s-button
                    variant="primary"
                    onClick={() => decide(candidate.productGid, "approve")}
                  >
                    Approve and write to Shopify
                  </s-button>
                )}
                <s-button
                  tone="critical"
                  onClick={() => decide(candidate.productGid, "reject")}
                >
                  Reject
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        );
      })}
    </s-page>
  );
}
```

> **Deliberately deferred: edit-then-approve, and the `manual` source value.**
> The spec lists "edit-then-approve" as a review action and `manual` as an
> `inci_source` value; this task ships approve and reject only. A list that
> needs correcting is rejected for now (the product then gets no metafields),
> and the correction is a later increment. When editing is added, the edited
> list must be saved into `proposedList` before the metafields are written,
> and written with `inci_source: "manual"` — otherwise `pipeline:publish` or a
> re-evaluation could later overwrite a human's edit with the original machine
> proposal.

- [ ] **Step 2: Add the nav link**

In `app/routes/app.tsx`, inside the existing `<s-app-nav>` element, add:

```tsx
<s-link href="/app/review">Ingredient review</s-link>
```

- [ ] **Step 3: Verify it renders**

```bash
npm run dev
```

Open the app in your Shopify admin and click "Ingredient review". With no `data/candidates.json` present, it should show the empty state telling you to run the pipeline.

If the dev server refuses to load a file under `pipeline/` because it is
outside Vite's allowed list, add `"pipeline"` to `server.fs.allow` in the root
`vite.config.ts`.

- [ ] **Step 4: Run the pipeline's suite**

The root app has no test script, so run the pipeline's from inside `pipeline/`:

```bash
cd pipeline && npm test && cd ..
```

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

Every pipeline command below runs from inside `pipeline/`
(e.g. `cd pipeline && npm run pipeline:extract`), not from the repo root. The
`node -e` snippets run from the repo root, where `data/` lives. Do not run two
pipeline commands at once, and do not hand-edit `data/candidates.json` while
one is running.

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

- [ ] **Step 2: Gate on the fixture check — BEFORE the first paid extraction**

```bash
npm run pipeline:evaluate-fixtures
echo "exit code: $?"
```

This runs the real classifier over every hand-labelled fixture and, for each
fixture labelled `full_list` or `active_inactive`, the real extractor too
(43 model calls: 26 classifications and 17 extractions — cents, not dollars;
only `ANTHROPIC_API_KEY` is needed, and it never touches the store). Doing it first means any prompt
tuning it forces happens before you pay for a full-catalogue extraction, not
after.

It reports the classification confusion matrix and then checks, per fixture:
that no `key_ingredients` fixture — including the four highlights-only
fixtures derived from real descriptions — is classified `full_list`; that
the extracted first ingredient is the labelled one (a highlights section
used or merged in usually puts a highlighted ingredient first); and that the
extracted list is at least the labelled minimum length. It ends with one of:

- `GATE PASSED.` (exit code 0) — continue.
- `GATE FAILED — do not publish:` (exit code 1) — a partial list would be
  presented as complete, or an extraction came back wrong. Every problem is
  listed by product title. Tune the prompt in `pipeline/src/classify.ts` or
  `pipeline/src/extract.ts`, run `npm test`, and repeat this step.
- `GATE NOT EVALUATED` (exit code 1) — some calls errored (bad key, overload,
  refusal), so a clean-looking result may just mean nothing was tested. Fix
  the errors it lists and re-run. Never treat this as a pass.

A lower overall accuracy with no listed problem is acceptable: a `full_list`
fixture classified `key_ingredients` is safe over-caution that only routes a
product to review.

- [ ] **Step 3: Dry-run against a handful of products**

Never edit source for a dry run — cap it with the `PIPELINE_LIMIT` env var instead:

```bash
PIPELINE_LIMIT=5 npm run pipeline:extract
```

Expected: one progress line per product (5), each `approved` or `pending` —
with the seed dictionary, expect all or nearly all `pending` (see Step 4).
Inspect `data/candidates.json` (at the repo root — the pipeline reads and
writes it via a path relative to `pipeline/`, not the process cwd) and
confirm the ingredient lists match the product pages, and that each
candidate's `notes` names the section the list came from. **Nothing has been
written to Shopify yet** — the pipeline only writes `candidates.json`.

- [ ] **Step 4: Run the full catalogue**

```bash
npm run pipeline:extract
```

Expect roughly 10 minutes and a summary line `Done. N auto-accepted, M need
review.` **On this first run N will be at or near zero, and that is
correct.** The seed dictionary holds only Aqua, Tocopherol and the 26 EU
fragrance allergens, so almost every list contains an ingredient it cannot
resolve yet. This is the spec's run ordering — extract everything first,
then build the dictionary from the extracted corpus (Step 5), then evaluate
the bar (Step 6) — and re-evaluation, not re-extraction, is what promotes
products to auto-accepted.

Some products stay in review whatever the dictionary holds, by design:
every product whose description has a highlights heading ("Key
Ingredients", "Star Ingredient", "Ingredient Spotlight", ...) — at least the
13 "Key Ingredients" products the spec counts, plus any whose copy mentions a
"star ingredient" or similar — because on exactly that shape the extractor
may have used or merged the highlights; any list with a duplicated ingredient;
`key_ingredients` and `active_inactive` products; and the few `none`
products with no ingredient data. Products that failed (e.g. an overloaded
API) are listed at the end and were not saved — re-run the same command to
retry them.

- [ ] **Step 5: Grow the dictionary from the real corpus**

List every ingredient the accept bar could not resolve. Run this from the repo root, since `data/` lives there rather than inside `pipeline/`:

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

- [ ] **Step 6: Re-evaluate — do NOT re-extract**

```bash
npm run pipeline:reevaluate
```

Expected output like `Pending: 80 -> 52 (28 newly auto-accepted, 0 demoted back to review). No model calls made.`

This re-runs only the accept bar against the cached extractions. **Use this, not `pipeline:extract`, while growing the dictionary** — re-extracting would re-pay the full model cost and ~10 minutes to re-test a pure function whose inputs have not changed. Re-run `pipeline:extract` only when the *catalogue* changes or you have edited a prompt.

Re-evaluation works in both directions. If you raise `CONFIDENCE_THRESHOLD`
in `pipeline/src/accept.ts` after looking at the real confidence
distribution, or remove a synonym that turned out to be wrong, run it again:
any auto-accepted product that has not been published yet and no longer
passes is demoted back to review. Published and human-reviewed candidates
are never touched.

Repeat steps 5–6 until the remaining pending items are genuine judgement calls rather than dictionary gaps.

- [ ] **Step 7: Work the review queue**

Open `/app/review` in the Shopify admin. For each candidate, check the
proposed list against the full original description, read the extraction
notes and the classifier's reasoning, and approve or reject. Approving writes
the metafields immediately.

- **Reject every `none` candidate.** These products have no ingredient data;
  the spec writes no metafields for them, so the page shows only a Reject
  button, and the pipeline refuses to write them even if approved.
- For a candidate held back by a **highlights section**, confirm the proposed
  list is the complete ingredient list — in its written order, with nothing
  from the highlights merged in and nothing duplicated — before approving.
- A list that is wrong in any way is rejected: editing before approval is
  not built yet (see Task 11).

- [ ] **Step 8: Publish the auto-accepted candidates**

```bash
npm run pipeline:publish
```

This writes every approved-but-unpublished candidate's metafields to
Shopify; the review queue handles the rest. Safe to re-run — it never
touches a pending, rejected, or already-published candidate. Run Step 6
first if you have changed the dictionary or the threshold since the last
re-evaluation.

- [ ] **Step 9: Verify metafields landed on a product**

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

- [ ] **Step 10: Commit the grown dictionary**

```bash
git add data/ingredient-dictionary.json
git commit -m "feat: grow ingredient dictionary from the live corpus"
```

`data/candidates.json` is not committed (it is gitignored), but it holds your
review decisions, which cannot be regenerated. Every save keeps the previous
version as `data/candidates.json.bak`; copy the file somewhere safe after a
review session.

### Later: when a reviewed or published product's description changes

`pipeline:extract` never re-extracts a product that has been reviewed or
published — that would overwrite a human decision. Instead, each run compares
those products' current descriptions with the text they were reviewed
against and prints any that changed:

```
!!! 1 skipped product(s) have a description that changed since they were reviewed or published — their stored result, and any metafields already on Shopify, reflect the OLD text:
  - EAST 29th | Valia Cleanser (gid://shopify/Product/6810174193718)
```

To force re-extraction of one, delete its entry from `data/candidates.json`
(from the repo root, with no pipeline command running; replace the id with
the one printed):

```bash
PRODUCT_GID='gid://shopify/Product/6810174193718' node -e "
const fs = require('fs');
const path = './data/candidates.json';
const gid = process.env.PRODUCT_GID;
const all = JSON.parse(fs.readFileSync(path, 'utf8'));
const kept = all.filter((c) => c.productGid !== gid);
if (kept.length === all.length) throw new Error('no candidate for ' + gid);
fs.copyFileSync(path, path + '.bak');
fs.writeFileSync(path, JSON.stringify(kept, null, 2) + '\n');
console.log('Removed ' + gid + '; the previous file is kept as ' + path + '.bak');
"
```

(The variable is `PRODUCT_GID`, not `GID`: zsh reserves `GID` for your group
id.) Then run `npm run pipeline:extract` from inside `pipeline/`. Note that
this also re-extracts every candidate still pending. The product then goes
through the bar and, if needed, the review queue like a new one.

**If that product had been human-reviewed**, its old `inci_reviewed_at`
metafield stays on the product — a fresh auto-accepted list would then carry
a review timestamp it never received. The pipeline does not remove it; delete
it by hand in the GraphiQL app (same id) right after deleting the entry:

```graphql
mutation {
  metafieldsDelete(metafields: [
    { ownerId: "gid://shopify/Product/6810174193718", namespace: "asgard", key: "inci_reviewed_at" }
  ]) {
    deletedMetafields { key namespace ownerId }
    userErrors { field message }
  }
}
```

If the product is approved again in the review queue, approval writes a new
`inci_reviewed_at` anyway.

---

## Done when

- [ ] Every product with recoverable ingredient data has `asgard.inci_list` populated in concentration order
- [ ] Every populated product has `asgard.inci_source`, so no partial list can pass as complete
- [ ] No product classified `none` has any `asgard.*` metafield
- [ ] `cd pipeline && npm test` passes
- [ ] The `key_ingredients` regression test in `pipeline/tests/accept.test.ts` passes — a candidate *classified* `key_ingredients` is never auto-accepted, at any confidence. (It tests the classification, not the text: whether a "Key Ingredients" block gets that classification is what the fixture gate below measures.)
- [ ] The accept bar's highlights rules in `pipeline/tests/accept.test.ts` pass — a description containing a highlights heading ("Key Ingredients", "Star Ingredient", "Ingredient Spotlight", ...) and a list containing a duplicated ingredient each route the product to review, even when it is classified `full_list`
- [ ] `data/ingredient-dictionary.json` is committed and covers the catalogue's common ingredients
- [ ] `pipeline:evaluate-fixtures` prints `GATE PASSED.` and exits 0: no `key_ingredients` fixture (including the derived highlights-only ones) classified as `full_list`, every extraction check has the labelled first ingredient and at least the labelled minimum count, and no fixture errored
- [ ] `pipeline:publish` reports 0 failures
- [ ] `/app/review` shows an empty queue
- [ ] No secrets are committed: `git log -p | grep -iE 'shpat_|sk-ant-'` returns nothing
