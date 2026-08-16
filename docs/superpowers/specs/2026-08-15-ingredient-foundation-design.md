# Ingredient Data Foundation — Design

**Date:** 2026-08-15
**Status:** Approved for planning
**Sub-project:** 1 of 4 (see Roadmap Context)

---

## Roadmap context

The Asgard Beauty product concept decomposes into four independent sub-projects.
This spec covers only the first.

| # | Sub-project | Status |
| --- | --- | --- |
| **1** | **Ingredient data foundation** — extract INCI lists into Shopify metafields, build the ingredient dictionary, provide an admin review surface | **This spec** |
| 2 | Ingredient comparison — customer photographs a product label, OCR, compare against catalogue and their reaction history | Not started |
| 3 | AI skin analyzer — photo capture + lifestyle questionnaire, assessment, reasoned recommendations | Not started |
| 4 | Native mobile app | Deferred; mobile web first |

Sub-projects 2 and 3 both depend on this one. Nothing else can be built first.

### Product decisions already made

- **Audience:** single-store (asgardbeauty.com) first, architected so productising to
  other merchants later is a migration rather than a rewrite. Shop-scoped data is
  keyed by shop domain from the start.
- **Surface:** storefront (Shopify theme app extension) plus an admin surface.
  Mobile web before native.
- **Framing:** the customer-facing features give cosmetic guidance, never diagnosis.
  Anything reading as a medical claim ("you have rosacea") crosses into
  medical-device territory in the US, EU, and Canada. This constraint shapes
  sub-project 3 but is recorded here because it is a project-wide rule.
- **Identity: Shopify customer accounts. This application stores no passwords.**
  Storefront identity comes from the login the store already has; Supabase Auth
  carries the session. See "No inherited data" below for why this was a free choice.
- **Clean slate.** The predecessor Express + React application has been removed
  from this branch. It remains on `main` — hardened, tested, 0 vulnerabilities —
  and in git history, so nothing is lost.

### No inherited data — and what that bought

The predecessor application's Heroku backend has been offline for years
(`https://asgard-scan.herokuapp.com` returns 404) and its database went with it.
There is **no data to migrate and no schema to preserve**, which removes the usual
constraint on a rewrite.

The most valuable consequence is the identity decision above. The old application
hand-rolled JWT authentication, and that is exactly where its critical defects
lived: tokens signed with an empty payload, a token issued before the password was
verified, and a `@unique` index on the password column. With no user table to carry
forward, the correct answer — **do not own authentication at all** — costs nothing.
A live user table would have made the same decision a migration project.

**Outstanding verification (not blocking this sub-project):** deleting a Heroku app
deletes its add-ons, but a database provisioned standalone, or attached to a second
app, can outlive the app it was created for. Confirm in the Heroku dashboard that
no add-on database or `pg:backups` export is still holding user rows. This matters
for data-protection obligations, not for migration.

---

## Problem

Asgard Beauty is a **multi-brand** retailer: 95 products across 19 brands
(Sade Baron, All Things Jill, Corpa Flora, Routine, Graydon, Cyberderm,
Étymologie, Henné Organics, Ava Isa, EAST 29TH, and others). Product types skew
toward serums (17), body lotion (14), lip care (12), body wash (10), and
moisturisers (8), with 5 sunscreens.

Ingredient data **exists but is unstructured**. Measured against the live
catalogue on 2026-08-15:

| Measure | Count (of 95) |
| --- | --- |
| Mention the word "ingredient" | 91 |
| Contain a real INCI-style list in the description HTML | 84 |
| Contain neither | 4 |
| **Recoverable by naive regex extraction** | **59 (62%)** |

The 36 regex failures are not random, and this is the finding that shapes the
whole design:

1. **13 products label the section "Key Ingredients:"** — marketing copy listing a
   handful of highlights, *not* the full INCI list.
2. **Sunscreens split into "Medicinal Ingredients" / "Inactive Ingredients"**
   (Elta MD, Ava Isa, Cyberderm).
3. Some lists carry no label at all.

**Naively parsing a "Key Ingredients" block as if it were a complete INCI list
produces confidently wrong output.** For a sensitivity tool, a wrong ingredient
list is worse than a missing one: it can tell someone a product is free of an
ingredient that is actually in it. Distinguishing these cases is therefore the
core requirement, not a refinement.

## Goals

1. Every product with recoverable ingredient data has a structured, ordered INCI
   list attached to it in Shopify.
2. Every list is explicitly labelled as complete or partial. A partial list must
   never be mistakable for a complete one.
3. No ingredient data reaches the catalogue without passing a confidence bar or
   human review.
4. An ingredient dictionary exists that maps naming variants to canonical forms
   and carries allergen flags.
5. The pipeline is re-runnable, so new stock is processed the same way.

## Non-goals

- Any customer-facing UI. This sub-project produces data and an admin surface only.
- OCR of user-supplied label photographs (sub-project 2).
- Any storage of personal or biometric data (sub-projects 2 and 3).
- Ingredient safety or efficacy claims. The dictionary records *what an ingredient
  is* and *whether it is a declarable allergen*, not whether it is "good" or "bad".

---

## Architecture

```
Shopify product descriptions (95 products, HTML)
        │
        ▼  Pass 1 — classify (structured output)
   full_list │ key_ingredients │ active_inactive │ none
        │
        ▼  Pass 2 — extract + normalize (structured output)
   ordered ingredient list + per-product confidence
        │
        ├── meets auto-accept bar ──► Shopify metafields ──► sync to Postgres
        └── otherwise ─────────────► review queue ──► human approval ──► same path
```

### Source of truth vs. projection

This split is load-bearing and easy to misread, so it is stated explicitly:

- **Shopify metafields are the source of truth** for a product's ingredient list.
  The data belongs to the merchant, is visible and editable in the Shopify admin,
  and survives the app being uninstalled or abandoned.
- **Postgres holds a derived, read-optimized projection.** Shopify cannot answer
  "which products contain no linalool" — that is a join. The `product_ingredients`
  table exists to make that query fast.

The projection is always rebuildable from metafields. If the two ever disagree,
metafields win.

### Why hybrid rather than one or the other

Metafields alone cannot hold the ingredient dictionary: synonyms, allergen
classes, and canonical mappings are *reference data*, not per-product data, and
have nowhere to live on a product. A database alone would move the merchant's own
product data outside Shopify, where it is invisible in the admin and lost if the
app dies. The rule that resolves it: **product facts live on the product;
reference data lives in the database.**

### Database choice: Supabase

Chosen against the needs of all three build sub-projects, not just this one:

| Need | Why Supabase |
| --- | --- |
| Ingredient dictionary (canonical → synonyms → flags) | Real Postgres; the model is relational |
| Per-user isolation of reaction history (sub-project 2) | Row-level security enforced in the database, not in application code |
| Skin photographs (sub-project 3) | Storage with signed expiring URLs; hard delete for GDPR/BIPA erasure requests |
| Possible ingredient similarity search | `pgvector` already present |

Alternatives rejected: Neon and PlanetScale are database-only, requiring separate
auth and object-storage vendors; Firebase is a poor fit for a graph-shaped
ingredient model.

**Prerequisite:** the Supabase connector is not currently authorized in the
development environment. Schema and migrations can be written without it;
operating the project directly requires connecting it in claude.ai connector
settings.

**Deferred to sub-project 3:** once skin photographs are stored, a signed DPA and
an explicit data region are required. Not a blocker for this sub-project, which
stores no personal data.

---

## Shopify metafields

Namespace: `asgard`. Owner type: `PRODUCT`.

| Key | Type | Purpose |
| --- | --- | --- |
| `inci_list` | `list.single_line_text_field` | The ordered ingredient list |
| `inci_source` | `single_line_text_field` | `full_list` \| `key_ingredients` \| `active_inactive` \| `manual` |
| `inci_confidence` | `number_decimal` | Extraction confidence, 0.00–1.00 |
| `inci_reviewed_at` | `date_time` | Null until a human has approved it |

**Order is meaningful.** INCI lists are ordered by descending concentration down
to 1%, after which order is arbitrary. Preserving order is what makes "is this
ingredient a headline or a trace?" answerable, so `inci_list` is an ordered list
type and position is preserved through to the database.

`inci_source` exists so a partial list can never be silently treated as complete.
Any consumer of this data must branch on it.

---

## Database schema

### Reference tables

These hold catalogue and reference data, **not user data**. RLS here restricts
*writes*; reads are public. Per-user read partitioning is deliberately not applied
where there is no per-user data — that arrives in sub-project 2 with reaction
history.

```sql
create table public.ingredients (
  id          bigint generated always as identity primary key,
  inci_name   text not null unique,       -- canonical, e.g. 'Tocopherol'
  common_name text,                       -- e.g. 'Vitamin E'
  created_at  timestamptz not null default now()
);

create table public.ingredient_synonyms (
  id            bigint generated always as identity primary key,
  ingredient_id bigint not null references public.ingredients(id) on delete cascade,
  synonym       text not null unique,     -- 'Aqua', 'Water', 'Eau'
  source        text not null             -- 'seed' | 'extraction' | 'manual'
);
create index ingredient_synonyms_ingredient_id_idx
  on public.ingredient_synonyms (ingredient_id);

create table public.ingredient_flags (
  id            bigint generated always as identity primary key,
  ingredient_id bigint not null references public.ingredients(id) on delete cascade,
  flag_type     text not null,            -- 'eu_fragrance_allergen' | 'common_sensitizer'
  source        text not null,            -- citation for the claim
  notes         text
);
create index ingredient_flags_ingredient_id_idx
  on public.ingredient_flags (ingredient_id);

create table public.product_ingredients (
  shop_domain        text   not null,     -- multi-tenant from day one
  shopify_product_id bigint not null,
  ingredient_id      bigint not null references public.ingredients(id) on delete cascade,
  position           int    not null,     -- INCI order = concentration order
  primary key (shop_domain, shopify_product_id, position)
);
create index product_ingredients_ingredient_id_idx
  on public.product_ingredients (ingredient_id);
```

Every foreign-key column carries its own index. `product_ingredients_ingredient_id_idx`
specifically powers the "products without ingredient X" query that sub-project 2
depends on.

`shop_domain` is present from the start so productising to other merchants is a
migration rather than a rewrite, per the audience decision above.

### RLS on reference tables

```sql
alter table public.ingredients enable row level security;
alter table public.ingredients force row level security;

create policy ingredients_public_read on public.ingredients
  for select to anon, authenticated using (true);
-- No insert/update/delete policy. Writes are service-role only, by omission.
```

The same pattern applies to `ingredient_synonyms`, `ingredient_flags`, and
`product_ingredients`. `force row level security` ensures the policy applies even
to the table owner.

### Pipeline tables

Not publicly readable. No policy is created at all, so under `force row level
security` these are unreachable except by the service role.

```sql
create table public.extraction_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  model        text not null,             -- e.g. 'claude-opus-5'
  product_count int not null default 0,
  notes        text
);

create table public.extraction_candidates (
  id                 bigint generated always as identity primary key,
  run_id             bigint not null references public.extraction_runs(id) on delete cascade,
  shop_domain        text   not null,
  shopify_product_id bigint not null,
  raw_text           text   not null,     -- the source description, for review context
  classification     text   not null,     -- full_list | key_ingredients | active_inactive | none
  proposed_list      jsonb  not null,
  confidence         numeric(3,2) not null,
  status             text   not null default 'pending',  -- pending | approved | rejected
  reviewed_at        timestamptz
);
create index extraction_candidates_run_id_idx on public.extraction_candidates (run_id);
create index extraction_candidates_status_idx on public.extraction_candidates (status)
  where status = 'pending';   -- partial index: the review queue only ever reads pending

alter table public.extraction_runs enable row level security;
alter table public.extraction_runs force row level security;
alter table public.extraction_candidates enable row level security;
alter table public.extraction_candidates force row level security;
```

### Note on future user tables

When sub-project 2 adds reaction history, its policies must use the subselect
form for performance — `using ((select auth.uid()) = user_id)`, not
`using (auth.uid() = user_id)`. The bare form re-evaluates `auth.uid()` once per
row. Every column referenced in a policy must also be indexed. Recorded here so
the pattern is established before the first user table exists.

---

## Extraction pipeline

### Model and cost

`claude-opus-5` ($5/$25 per MTok). Measured against the real catalogue: roughly
81K input tokens and 28K output tokens across all 95 products, or about **$1.12
per full run** — approximately **$0.56** via the Batch API, which is appropriate
here since this is not latency-sensitive.

Cost is not a design constraint at this scale. This justifies using the most
capable model and a two-pass approach rather than optimising for tokens.

### Pass 1 — classify

Input: the product's description HTML, stripped to text.
Output (structured, via `output_config.format` so the response is schema-valid by
construction — no parsing to defend):

```json
{
  "classification": "full_list | key_ingredients | active_inactive | none",
  "reasoning": "string",
  "confidence": 0.0
}
```

The classifier's job is the distinction identified in the Problem section: a full
INCI list versus a marketing highlight reel versus a regulatory active/inactive
split. This is a separate pass because conflating classification with extraction
is what makes naive approaches fail.

### Pass 2 — extract and normalize

Runs only for classifications other than `none`. Output:

```json
{
  "ingredients": [{"raw": "string", "canonical": "string", "position": 0}],
  "confidence": 0.0,
  "notes": "string"
}
```

For `active_inactive`, both sections are extracted and concatenated with actives
first, preserving each section's internal order.

### Run ordering

The three stages run in this order, and the order matters:

1. **Extract** every product (passes 1 and 2) into `extraction_candidates`. Nothing
   is written to Shopify yet.
2. **Build the dictionary** from the full extracted corpus (see Ingredient
   dictionary seeding).
3. **Evaluate the auto-accept bar** and write or queue each candidate.

Stage 2 sits between the other two because the auto-accept bar tests extracted
tokens against the dictionary — so the dictionary must exist before any product
is judged. Running extraction and acceptance as a single pass would make the bar
unevaluable on a first run, when the dictionary is still empty.

On subsequent runs (new stock), the dictionary already exists; stage 2 then only
adds newly-seen ingredients.

### Auto-accept bar (conservative)

Evaluated in stage 3, after the dictionary exists. A product's extraction is
written directly to metafields **only if all** hold:

1. `classification == "full_list"`
2. `confidence >= 0.90`
3. Every extracted token resolves to a dictionary entry — either a canonical
   `inci_name` or a registered synonym
4. The list has at least 3 entries

Anything else enters the review queue. In particular, **`key_ingredients` is never
auto-accepted** regardless of confidence — by definition it is a partial list, and
the risk it carries is exactly what this design exists to prevent.

Expected outcome on the current catalogue: roughly 25–35 of 95 products require
review on the first run. This is a deliberate trade of the merchant's time against
the risk of publishing a wrong ingredient list.

---

## Ingredient dictionary seeding

1. **From the corpus.** Extract every distinct ingredient string across the 95
   products (expected: roughly 400–600 raw strings), cluster obvious variants, and
   promote canonical forms.
2. **Known synonym pairs.** `Aqua`/`Water`/`Eau`, `Tocopherol`/vitamin E, and the
   standard INCI/common-name pairs.
3. **EU 26 declarable fragrance allergens.** A public, citable, closed list, and
   the single highest-value flag set for a sensitivity tool — these are the
   ingredients EU law requires be declared *because* they commonly cause reactions.

Each flag row records its `source`, so every claim the product later makes to a
customer is traceable to a citation.

---

## Admin review surface

Minimal, and built because it is needed permanently, not just for the first run —
every new product added to the store passes through it.

For each pending candidate, display: product title and brand, the original
description text, the proposed ingredient list, the classification, the
confidence, and any extraction notes. Actions: approve, edit-then-approve, reject.

Approval writes the metafields, syncs the projection, and stamps `inci_reviewed_at`.

---

## Error handling

| Failure | Handling |
| --- | --- |
| Shopify API rate limit | Respect the leaky-bucket limit; exponential backoff |
| Metafield write fails mid-run | Run is resumable; per-product state lives in `extraction_candidates`, so a re-run skips completed products |
| Model returns low confidence | Routed to review, never dropped silently |
| Product has no ingredient data (the 4 known) | Recorded as `classification: none`; no metafields written; not treated as an error |
| Projection drifts from metafields | Metafields win; a rebuild command re-derives the projection |

---

## Testing

The extraction is a classifier, so it is tested as one.

**Labelled fixture set.** Roughly 20 real products, hand-labelled, spanning all
four classification cases: clean full list, key-ingredients-only, sunscreen
active/inactive split, and no data. Fixtures are real descriptions from the live
catalogue, not synthetic.

**The regression that matters most:** a `Key Ingredients` block must never be
classified as `full_list`. This is asserted explicitly and separately, because it
is the failure that would silently produce misleading advice.

**Other coverage:**
- Ingredient order is preserved end to end (description → metafield → projection)
- Auto-accept bar rejects each of its four conditions independently
- Synonym normalization maps variants to one canonical entry
- RLS: an anonymous client can read `ingredients` and **cannot** read
  `extraction_candidates`
- The projection can be rebuilt from metafields and matches

---

## Prerequisites

1. **Shopify custom app Admin API access token** with `read_products` and
   `write_products` scopes.
2. **Supabase project**, and the connector authorized if it is to be operated
   directly from the development environment.
3. **Anthropic API key** for the extraction pipeline.

---

## Open questions

None blocking. Two decisions are deliberately deferred:

- **Exact confidence threshold.** Set at 0.90 as a conservative starting point.
  The first run's actual confidence distribution should be inspected and the
  threshold tuned from real numbers.
- **Data region and DPA for Supabase.** Required before sub-project 3 stores skin
  photographs; not required for this sub-project, which stores no personal data.
