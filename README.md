# Asgard Beauty — Shopify App

A two-part skincare tool for [asgardbeauty.com](https://asgardbeauty.com), a
multi-brand retailer carrying 95 products across 19 brands.

1. **Ingredient comparison** — a customer photographs a product they already use,
   and we compare its ingredients against the catalogue and against their own
   reaction history, to help narrow down what their skin reacts to.
2. **AI skin analyzer** — photos plus a short lifestyle questionnaire produce a
   cosmetic assessment and product recommendations, each with the reasoning shown.

The goal is informed decisions, not pushing product. Recommendations explain
*why* something suits a given skin state, and defer to a dermatologist on anything
clinical — this gives cosmetic guidance, never diagnosis.

## Status

Early. The design for the first sub-project is written and approved; implementation
has not started.

| # | Sub-project | Status |
| --- | --- | --- |
| **1** | Ingredient data foundation | **Design approved** — [spec](docs/superpowers/specs/2026-08-15-ingredient-foundation-design.md) |
| 2 | Ingredient comparison | Not started |
| 3 | AI skin analyzer | Not started |
| 4 | Native mobile app | Deferred — mobile web first |

Sub-projects 2 and 3 both depend on 1: neither works without structured ingredient
data.

## Planned stack

- **Shopify app** — theme app extension for the storefront, plus an admin surface
- **Shopify metafields** — source of truth for per-product INCI ingredient lists
- **Supabase (Postgres)** — ingredient dictionary, and later user data under
  row-level security
- **Claude** — ingredient extraction and classification

**Identity comes from Shopify customer accounts. This app stores no passwords.**

## History

This repository previously held *Asgard Scan*, a 2021 bootcamp capstone
(Express + Create React App + Prisma/MySQL) exploring the same ingredient-comparison
idea. Its backend has been offline for years.

That application still lives on the `main` branch in a hardened state, and in git
history. It was **not** simply deleted — it went through a full security
remediation first:

- Authentication and authorization fixed. The `authorize` middleware had been
  applied to zero routes, leaving every endpoint public.
- Dependency vulnerabilities: 222 → **0**
- 40,400 vendored `node_modules` files purged from git history (119 MB → 12 MB)
- First test suite added: 33 tests

The full record, including the credential-rotation checklist, is in
[SECURITY.md](SECURITY.md).

**Do not redeploy the old application.** It is kept as a reference, not as
something to run.
