# Security

## Status

This repository is an archived 2021 bootcamp capstone. The Heroku backend that
served it is no longer running (`https://asgard-scan.herokuapp.com` returns 404),
so the issues recorded below are **not currently reachable**. They are documented
because the code still describes them, and because anyone redeploying this repo
would reintroduce them.

**Do not redeploy this application as-is.**

## Remediation performed (2026-08-15)

### Repository hygiene

- **Purged `node_modules` from all git history.** 40,400 vendored dependency
  files were committed across every branch, keeping a large vulnerable-package
  surface permanently present in the repo tree. Repo went from 40,556 tracked
  files / 119 MB to 156 tracked files / ~12 MB.
- **Fixed the root cause in `.gitignore`.** The old rule was `/node_modules`,
  anchored to the repository root, so `client/node_modules` and
  `server/node_modules` were never ignored. Now `node_modules/`, unanchored.
- **Retired the published demo credentials.** The README previously listed a
  working username and password for the live deployment.

### Secret scan

Every commit across all 9 branches was scanned (project files, excluding
vendored dependencies). **No real secrets were found:**

| Check | Result |
| --- | --- |
| Private keys / certificates | None |
| AWS access keys | None (2 regex hits were base64 PNG data inside an SVG) |
| Shopify / Stripe / GitHub / Slack / Google tokens | None |
| Database connection strings | None real (only the README's `yourname:randompassword@localhost` placeholder) |
| Hardcoded `JWT_SECRET` or JWT literals | None |
| Committed `.env` files | None — only empty `.env.sample` templates |

### Application vulnerabilities fixed

| # | Issue | Resolution |
| --- | --- | --- |
| 1 | `authorize` middleware was applied to **zero** routes — every endpoint public | Applied to all user-data and mutating routes |
| 2 | Middleware read `req.headers.aithorization` (typo). Because that key never exists, the guard fired on **every** request and returned 401 unconditionally — the middleware was fail-closed and completely unusable, which is why it ended up commented out of the routes | Correct header key |
| 3 | Token parsed with `.split("")[1]`, which splits the header into single characters and uses the letter `e` as the token. Unreachable in practice because of #2 | Proper `Bearer <token>` parsing, whitespace-split and case-insensitive |
| 4 | `jwt.verify` used the callback form, making it easy to continue into the handler after already responding | Throwing form inside `try/catch`; fails closed |
| 5 | `jwt.sign({ id: user.id })` used the Prisma **model delegate**, not the logged-in user — every token carried an empty payload | Signs the authenticated user's real id/username |
| 6 | Login signed a token *before* verifying the password | Reordered: find user → verify password → then sign |
| 7 | `Invalid Credentials` branches lacked `return`, so execution continued after responding | Added `return` on every failure path |
| 8 | Nonexistent username crashed on `currentUser.password` | Guarded |
| 9 | `GET /users` dumped every user plus their skin-sensitivity data, unauthenticated | Removed |
| 10 | `PATCH`/`DELETE` routes trusted a `:username` URL param with no ownership check | Ownership enforced against the token subject |
| 11 | `deleteProductSensitiveTo` deleted by `id: username` from the URL, unauthenticated | Scoped to a real product id owned by the caller |
| 12 | `cors()` open to all origins | Env-driven origin allowlist |
| 13 | bcrypt cost factor 8 | Raised to 12 |
| 14 | Token expiry `3600000` **seconds** (~41 days) | `1h` |
| 15 | JWTs persisted in the database `token` column | No longer stored; column dropped by migration |
| 16 | The public `GET /products` catalogue selected the `noSensitivity` and `yesSensitivity` relations, leaking users' skin-sensitivity records (with `userId`) to unauthenticated callers | Relations removed from the selection |
| 17 | `@unique` index on `User.password`. Harmless while bcrypt salts every hash, but a password-existence oracle under any deterministic hashing | Index dropped by migration |
| 18 | Login responses distinguished "no such user" from "wrong password", enabling account enumeration | Identical `401` response for both |
| 19 | No error handler; thrown errors returned stack traces to the client | Central handler returns a generic 500 |
| 20 | Dead `models/*.js` flat-file store and `data/users.json` fixture containing a plaintext password field | Removed |

### Dependencies

- `jsonwebtoken` 8.5.1 → 9.x (8.x carries its own advisories)
- Prisma 3.x → current
- Removed the unused `mysql` package (Prisma handles the driver)
- Moved `nodemon` to `devDependencies`
- Client migrated off the deprecated `react-scripts` 4.0.3 (Create React App) to
  Vite — CRA was the source of nearly all 197 client-side advisories. Also
  React 17 → 18 (`createRoot`), react-router 5 → 7 (`Routes`/`element`,
  `Navigate`, an `Outlet`-based `ProtectedRoute`), and axios 0.21 → 1.x.

**Result: 0 known vulnerabilities in both workspaces** (was 25 server / 197
client).

| Workspace | Before | After |
| --- | --- | --- |
| `server` | 25 (1 critical, 15 high) | **0** |
| `client` | 197 (18 critical, 59 high) | **0** |

### Client-side fixes

The client had to change to match the hardened API:

- Every authenticated call now sends its bearer token via a shared axios
  request interceptor. Previously only `getSingleUser` sent one and the callers
  mostly forgot, so the mutating endpoints were being called unauthenticated.
- A response interceptor clears the stored token on any `401`, so an expired
  session cannot leave the UI in a half-authenticated state.
- Removed `getUser()`, which called the deleted dump-every-user endpoint.
- `loginUser` no longer hardcodes the dead Heroku URL.
- `deleteProductSensitiveTo` takes a record id instead of a username.
- `ProtectedRoute` rendered a hardcoded `HomePage` for every protected route
  regardless of the element passed to it. It now renders an `<Outlet />`.
- Note: `ProtectedRoute` is a UX convenience only, never a security boundary.
  Authorization is enforced server-side on every request.

## Credential rotation checklist

The scan found no leaked secrets, so this is precautionary — but because the app
was publicly deployed with broken authentication, treat anything it ever held as
untrusted:

- [ ] Rotate `JWT_SECRET` (any token ever issued should be considered invalid)
- [ ] Rotate the production database password
- [ ] Unpublish or password-protect the Netlify deployment, which is still live
      and pointing at a dead API
- [ ] Delete the retired `demo` account if the database is ever restored
- [ ] Confirm the Heroku app and its add-on database are fully deleted, not just
      idled — a dormant Postgres/MySQL add-on may still hold user records
- [ ] Revoke any Heroku/Netlify deploy tokens tied to this repository

## Reporting

To report a security issue in this repository, contact the maintainer directly
rather than opening a public issue.
