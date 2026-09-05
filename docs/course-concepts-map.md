# iHelp — Course-Concepts Map (how every taught concept was implemented, and why)

This is the **exam-defense traceability doc**. For each concept a full-stack /
"Internet Technologies" course teaches, it answers four questions the examiner
will ask:

> **What** is the concept · **How** did we implement it · **Why** that way ·
> **Where** is it in the code (and which **test** proves it).

Use it as a lookup: if you're asked *"how did you do authentication / sessions /
SQL / security?"*, jump to that row. Everything here is cross-checked against the
actual code, not just the design docs.

- **Live app:** https://ihelp-roan.vercel.app · **Repo:** https://github.com/YuvGev00/ihelp
- **Companion docs:** `architecture.md` (mechanism), `technical-design.md`
  (full SQL), `security.md` (risk register), `internal-architecture.md`
  (decision index), `file-reference.md` (every file).

> **One-line thesis to repeat:** *the database is the only authority.* Every
> permission is enforced in Postgres (RLS + `SECURITY DEFINER` functions +
> guard triggers); the app never holds the service-role key. The UI and server
> code repeat checks only for a friendly message — a hand-crafted request that
> skips them still hits Postgres as nothing but the caller's own identity.

---

## 0. Quick index — "how did you do X?"

| Concept (course topic) | Section |
|---|---|
| HTTP: requests, methods, status codes | [§1](#1-http--requests-methods-status-codes) |
| Cookies, sessions & JWT | [§2](#2-cookies-sessions--jwt) |
| Authentication (signup / login / logout) | [§3](#3-authentication) |
| Authorization (who-can-do-what) | [§4](#4-authorization--rls-security-definer-guard-triggers) |
| The database — relational model & SQL | [§5](#5-the-database--relational-model--sql) |
| No REST API — Server Actions & RPC | [§6](#6-no-rest-api--server-actions--rpc) |
| Client vs. server rendering | [§7](#7-client-vs-server-rendering) |
| Input validation | [§8](#8-input-validation) |
| Web-security threats: XSS, CSRF, SQL injection | [§9](#9-web-security-threats-xss-csrf-sql-injection) |
| File upload & storage | [§10](#10-file-upload--storage) |
| State management & data flow | [§11](#11-state-management--data-flow) |
| Testing | [§12](#12-testing) |
| Deployment & environment | [§13](#13-deployment--environment) |

---

## 1. HTTP — requests, methods, status codes

**What:** the web runs on HTTP request/response; methods (GET/POST) and status
codes (200/302/401/403/404/503) carry meaning.

**How & where in iHelp:**
- **GET** = every page read. Server Components issue the DB read while rendering;
  the browser just receives HTML. e.g. the feed `app/(app)/(onboarded)/requests/page.tsx`.
- **POST** = every write. Server Actions are POSTs to the same origin (Next.js
  encodes them); e.g. submitting the login form calls `signIn` in `actions/auth.ts`.
- **302 redirect** — after a successful action we `redirect(...)` (`actions/auth.ts`
  → `/requests`; middleware → `/login`). Post-Redirect-Get so a refresh doesn't re-POST.
- **401/redirect to login** — an unauthenticated request to a protected route is
  bounced by `proxy.ts` → `updateSession` before any page renders.
- **404** — a row you're not allowed to see is *invisible* under RLS, so the page
  renders `app/(app)/not-found.tsx`. "Forbidden" and "doesn't exist" look
  identical **on purpose** (no existence leak).
- **503** — `app/api/health/route.ts` returns 503 `{ok:false}` when the DB is
  unreachable (used by the keep-alive cron and the presentation health-check).

**Why:** we lean on framework-standard semantics (PRG, same-origin POST) instead
of hand-rolling an HTTP layer, so there is less surface to get wrong.

---

## 2. Cookies, sessions & JWT

**What:** HTTP is stateless; a **session cookie** carries identity across
requests. Supabase issues a **JWT** (access token) + a refresh token, stored in
cookies.

**How & where (verified in code):**
- The session lives in **cookies managed by `@supabase/ssr`** — not in React
  state, not in `localStorage`. `lib/supabase/server.ts` builds a per-request
  client from the cookie store (`cookies()` from `next/headers`).
- **Refresh on every request:** `proxy.ts` (the Next.js 16 middleware
  convention file) delegates to `updateSession` in `lib/supabase/middleware.ts`,
  which calls `supabase.auth.getUser()` — this refreshes an expired access token
  and re-writes the cookie via `supabaseResponse.cookies.set(...)`.
- **The JWT rides every DB/storage call.** Because the server client is built
  from the caller's cookie, Postgres sees `auth.uid()` = this user, and RLS
  applies as them. This is the hinge of the whole security model.
- **Cookie flags:** `@supabase/ssr` sets the auth cookies **HttpOnly** (JS can't
  read them → blunts token theft via XSS), **Secure** (HTTPS-only in
  production), and **SameSite=Lax** (not sent on cross-site subrequests → CSRF
  resistance). We rely on the library's hardened defaults rather than setting
  these by hand.

**Why:** cookie-based sessions are readable in Server Components, Server Actions,
*and* middleware — one consistent identity everywhere. Hand-rolled JWT handling
is the classic way to introduce a vulnerability, so we deliberately don't.

**Deep-dive answer if pressed "what's in the session cookie?":** an access JWT
(short-lived, signed by Supabase, claims include `sub` = user id, `role`,
`exp`) plus a refresh token; the middleware trades an expired access token for a
fresh one using the refresh token, transparently.

---

## 3. Authentication

**What:** proving *who you are* — signup, login, logout, password handling.

**How & where:** `actions/auth.ts` — three Server Actions:
- `signUp` → `supabase.auth.signUp({email,password})`. On success `redirect("/profile")`
  for onboarding (set a display name). A duplicate email (a real 422 with email
  confirmation off) is mapped to a "go log in" message, not a dead-end retry.
- `signIn` → `supabase.auth.signInWithPassword(...)`; on success `redirect("/requests")`;
  on failure a generic "email or password incorrect" (no hint which was wrong).
- `signOut` → `supabase.auth.signOut()` (clears the session cookie) → `redirect("/login")`.
- Inputs validated first by zod (`lib/validation/auth.ts`: email format, password
  ≥ 8 chars on signup).

**Password handling — we don't touch it.** Supabase (GoTrue) hashes passwords
with **bcrypt**, enforces the login, and issues tokens. We never store, compare,
or log a raw password. This is a *deliberate* choice — rolling your own password
hashing/session logic is the classic security mistake.

**Why the anon (publishable) key is safe in the browser:** it only lets a client
*attempt* queries; RLS decides, per row, what actually returns. Leaking it grants
nothing beyond what any signed-up user already has. (See §4, §9.)

**Honest limitation (own it):** email confirmation is **off** for the demo (so
seeded accounts work instantly) — risk **R1** in `security.md`. Identity
trust comes from the *admin verification* step, not from email. SMS OTP is the
named roadmap item.

---

## 4. Authorization — RLS, `SECURITY DEFINER`, guard triggers

**What:** deciding *what an authenticated user may do* — the heart of the grade.

**Four enforcement layers, and only the last is trusted:**

| Layer | File | Role |
|---|---|---|
| 1. Middleware | `proxy.ts` / `lib/supabase/middleware.ts` | session refresh + signed-out redirect (UX gate, not security) |
| 2. UI | components/pages | hides buttons you can't use (friendliness only) |
| 3. Server Action guards | `actions/*.ts` | early, clear errors before hitting the DB |
| 4. **Database** | `supabase/migrations/*.sql` | **the real authority** |

**How the database enforces it (verified):**
- **RLS on all 7 tables** (`0006_policies.sql`) — a policy per table per action,
  each commented with the product rule it enforces. Example: `offers_select` =
  **sealed bids** — only the offer's owner *and* the request's owner can read an
  offer. `profiles_private` is **own-row-only** (`user_id = auth.uid()`) so phone
  & home coordinates never leak.
- **The `profiles` / `profiles_private` split** — the flagship decision.
  Postgres RLS is *row-level, not column-level*: you can't hide *columns* from a
  readable row. So private fields (phone, lat/lng, `is_admin`) live in a
  **separate table** whose only read path is your own row.
- **11 `SECURITY DEFINER` RPCs** (`0004_functions.sql` + later migrations) for
  every rule RLS can't express — e.g. `assign_offer` (atomically pick one offer,
  close the rest, in one transaction), `confirm_completion` (both sides), the
  contact reveal. Each **re-checks permission in its own body** (e.g. `is_admin()`),
  so being the definer doesn't mean it trusts the caller.
- **Guard triggers** (`0005_triggers.sql`) — `guard_protected_columns` is an
  *invoker-rights* trigger that **blocks direct writes to system columns**
  (status, flags, `is_admin`) — the thing RLS alone can't do. This is what stops
  a user making themselves admin.
- **Least-privilege grants** (`0008_grants.sql`) — explicit table grants pin
  exactly what `anon`/`authenticated` may do (the platform's implicit defaults
  were unreliable, so we ended up stricter than default).

**Why:** because the database is the only authority, a crafted request that skips
the UI and actions still lands on Postgres with only the caller's JWT — and is
denied. That's the property the permission tests prove.

**Proven by:** `tests/integration/permissions.test.ts` — 15 "attack" tests (P1–P15)
that *try* a forbidden action as the wrong user (self-admin, reading sealed
offers, editing others' rows, anon lockout) and assert **denial**.

---

## 5. The database — relational model & SQL

**What:** a relational schema, keys, constraints, the query language.

**How & where** (`supabase/migrations/` — the source of truth, 14 ordered files):
- **7 tables** (`0002_tables.sql`): `profiles`, `profiles_private`,
  `verification_applications`, `help_requests`, `offers`, `request_photos`,
  `ratings`. Foreign keys wire them; a deliberate circular FK is handled explicitly.
- **Enums** (`0001_enums.sql`) for closed value-sets (`request_status`,
  `offer_status`, …) — an invalid state becomes a **type error**, not bad data.
- **Constraints** — `CHECK` (e.g. `price_matches_mode` couples pricing stance to
  the price field), `UNIQUE` (incl. two **partial** unique indexes — e.g. one
  active offer per helper per request).
- **Indexes** (`0003_indexes.sql`) — one per hot query path (feed browse, a
  helper's offers, the admin queue), including partial indexes. Each maps to a
  page in `scale.md §3`.
- **Triggers** (`0005_triggers.sql`) keep invariants: `handle_new_user` creates
  the profile rows on signup; `sync_request_offer_status` flips `open ↔ has_offers`.
- **The state machine**: `open → has_offers → assigned → completed → rated`
  (+ `cancelled`) — an enum plus one timestamp column per state, so history is
  legible without a separate audit table.

**Why:** modelling the rules *in the schema* (types, constraints, RLS) means the
database rejects bad data structurally — the app can't corrupt it even with a bug.

**Proven by:** `tests/integration/lifecycle.test.ts` + the D1–D10 database tests
(unique indexes, checks, the signup trigger, the migration-0013 security fix).

---

## 6. No REST API — Server Actions & RPC

**What:** the classic choice is a REST API (route handlers). We deliberately have
**none** for the product.

**How & where:**
- **Every write is a typed Server Action** (`actions/*.ts`): validate with zod →
  call the DB (a table write under RLS, or an RPC) → `revalidatePath(...)` →
  return a typed `ActionResult`. There is no `/api/requests` route to enumerate.
- **RPC** = calling a Postgres `SECURITY DEFINER` function via
  `supabase.rpc("assign_offer", …)` — used wherever a write needs a permission
  check or atomicity RLS can't give.
- The **only** HTTP route handler is `app/api/health/route.ts` (`GET /api/health`)
  — infrastructure, not product data.

**Why (the interview answer):** "We expose no API of our own, so there's no public
surface to enumerate, rate-limit, or version. Every mutation is a same-origin,
type-checked action; and even those aren't trusted — the database re-checks
everything. Less surface, same power." Contrast with REST: a REST endpoint would
need its own auth guard on every route; here the guard is one layer down, in the
data itself.

---

## 7. Client vs. server rendering

**What:** React Server Components (run on the server, no JS shipped) vs. Client
Components (`"use client"`, interactive in the browser).

**How & where:**
- **Reads render on the server.** Pages are Server Components that query Supabase
  directly while rendering (e.g. the feed). The distance sort (Haversine,
  `lib/geo.ts`) runs on the server — raw coordinates **never leave the server**;
  the browser only gets the computed distance.
- **Client Components are leaves** — only where interactivity is needed:
  `OfferForm`, `MapPicker`, `FileUploader`, the confirm dialogs. They're marked
  `"use client"`.
- **Per-request read de-duplication:** `getUser()` / `getViewerProfile()` in
  `lib/supabase/server.ts` are wrapped in React `cache()` so the layered layouts
  don't each re-issue the same query in one render.

**Why:** server rendering keeps secrets and heavy logic (and coordinates) off the
client, ships less JavaScript, and lets every read run under the user's RLS
identity without a round-trip API.

---

## 8. Input validation

**What:** never trust client input; validate at every boundary.

**How & where — three lines of defense:**
1. **Client** — HTML attributes (`required`, `maxLength`, `type=email`) for
   instant feedback.
2. **Server** — **zod** schemas in `lib/validation/*.ts` parse every Server
   Action's `FormData` (`safeParse`) before any DB call. Field errors flow back
   via `zodFieldErrors` (`actions/helpers.ts`).
3. **Database** — `CHECK`/`UNIQUE`/enum/`NOT NULL` constraints are the final,
   authoritative gate.

**Two real regressions the validation guards against** (and tests for them):
- **"(0,0) Null Island"** — coordinates coerced from absent form fields could
  become `(0,0)` (a valid-looking point off the coast of Africa); `request.ts`
  uses string-first coercion to reject it.
- **Absent-field `null`** — an optional file field arrives as `null` from
  `FormData`; normalised with `?? ""` so zod doesn't mis-handle it.

**Why:** the client validation is UX; the zod layer gives a typed, authoritative
parse in the trusted server; the DB constraints mean even a bypassed action
can't write bad data. Mirrored on purpose across all three.

**Proven by:** `lib/validation/schemas.test.ts` (15 tests incl. both regressions).

---

## 9. Web-security threats: XSS, CSRF, SQL injection

The three the examiner will name. Each is addressed:

**XSS (cross-site scripting)** — *mitigated.* React **escapes all rendered
content** by default; we use **no `dangerouslySetInnerHTML`** anywhere, so a
malicious string stored in the DB is inert text at render, never executed. Auth
cookies are **HttpOnly**, so even a hypothetical XSS can't read the session token.

**CSRF (cross-site request forgery)** — *mitigated.* Writes are **Next.js Server
Actions**: same-origin POSTs with a framework-encrypted action identifier, so a
third-party site can't forge a call. Session cookies are **SameSite=Lax**, so the
browser won't attach them to cross-site subrequests. There is no traditional
REST endpoint for an attacker to target.

**SQL injection** — *structurally impossible in our code.* We write **no dynamic
SQL and no string concatenation into queries**. All access is either the
Supabase query builder (parameterised) or `SECURITY DEFINER` RPCs called with
**typed, bound arguments** (`supabase.rpc(name, {arg: value})`). Inside the
functions, `search_path` is pinned so a caller can't shadow a table. Postgres
receives values as parameters, never as concatenated SQL text.

**Why frame it this way:** we removed the *categories* of bug rather than patching
instances — no raw HTML sink (XSS), no forgeable endpoint (CSRF), no string SQL
(injection).

---

## 10. File upload & storage

**What:** users upload request photos, avatars, and verification documents.

**How & where:**
- **Direct browser → Supabase Storage** (`components/FileUploader.tsx`), carrying
  the user's JWT, into a path scoped to their own folder. The **server never
  carries the file bytes** — only the resulting path is passed back to the action.
- **Buckets** (`0007_storage.sql`): `request-photos` and `verification-docs` are
  **private** — read via short-lived **signed URLs**; storage RLS scopes writes
  to `own-folder`. `avatars` (`0012`) is **public** (non-sensitive, avoids a
  signed URL on every render).
- Type/size checks client-side; the action stores only the path.

**Why:** offloading bytes to Storage keeps the server stateless and cheap; signed
URLs mean a private doc (an ID photo) is only reachable by someone the DB lets in.

---

## 11. State management & data flow

**What:** where application state lives.

**How & where:**
- **Server owns the data.** No global client store (no Redux/Context for data);
  the DB is the state, Server Components read it fresh.
- **Form state** uses React `useActionState` over Server Actions
  (`components/AuthForm.tsx`, offer/rating forms) — pending state + typed errors
  without a client data layer.
- **URL is state** — feed filters (category, distance) and pagination live in the
  query string, so they're shareable and server-readable.
- After a write, `revalidatePath(...)` invalidates the server cache so the next
  render is fresh.

**Why:** keeping data state on the server means the client can't hold a stale or
tampered copy of anything that matters; the URL-as-state makes the feed
bookmarkable with zero extra code.

---

## 12. Testing

**What:** automated proof the product works *and* is safe.

**How & where** (`tests/`, `e2e/`, co-located `*.test.ts`): **63 tests** (62
Vitest + 1 Playwright E2E, verified with `npx vitest run`).
- **Integration — permissions** (`permissions.test.ts`, P1–P15): the *attack*
  suite — each tries a forbidden action as the wrong user and asserts **denial**.
  A happy-path-only test proves nothing; asserting denial is the point.
- **Integration — lifecycle** (`lifecycle.test.ts`): drives
  create→offer→assign→dual-complete→rate through the real RPCs; race conditions;
  the after-job flow; the final-price security regression.
- **Database** (D1–D10): unique/partial indexes, checks, the signup trigger, the
  migration-0013 fix.
- **Unit**: `lib/geo.test.ts` (Haversine), `lib/validation/schemas.test.ts`
  (bounds, enums, the (0,0) + null-FormData regressions).
- **Component**: `components/ui.test.tsx` (Stars, StatusChip Hebrew labels, Badge).
- **End-to-end**: `e2e/core-flow.spec.ts` — Playwright drives the whole loop
  through the real UI in **two isolated browser sessions**, asserting the ₪ price.

**Why:** the tests are organised around the security thesis — most of them exist
to prove the *database* denies the wrong user, which is exactly what the grade
rewards.

**Count breakdown:** 62 Vitest tests — integration 31 (lifecycle 11 +
permissions 20), geo 6, validation 15, component UI 10 — plus **1 Playwright
E2E** = **63 total**.

---

## 13. Deployment & environment

**What:** how it runs in production.

**How & where:**
- **Vercel** hosts the Next.js app (Server Components + Actions run in Vercel's
  Node runtime). **Supabase** hosts Postgres + Auth + Storage.
- **Environment variables** (`.env.local.example`): only two are needed by the
  app — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, both
  **public by design** (RLS is the authority). The **service-role/secret key is
  never in app code** — only in local tooling (`scripts/seed.ts`,
  `scripts/reset-demo-password.mts`).
- **Keep-alive**: `.github/workflows/keepalive.yml` pings `/api/health` every 3
  days so the free-tier DB doesn't pause (best-effort).
- **PWA**: `app/manifest.ts` makes it installable.

**Why:** two managed services, few moving parts; the only secrets that exist are
public-safe, which is only true *because* the database enforces everything.

---

## 14. The 30-second "how did you do X?" cheat answers

- **Authentication?** Supabase Auth (email+password, bcrypt-hashed by GoTrue); I
  never touch raw passwords. Three Server Actions in `actions/auth.ts`.
- **Sessions?** Cookie-based via `@supabase/ssr`; the middleware (`proxy.ts`)
  refreshes the JWT each request; the token rides every DB call so RLS knows me.
- **Authorization?** Enforced in Postgres: RLS on all 7 tables + 11 `SECURITY
  DEFINER` functions + guard triggers. The app never uses the service-role key.
- **SQL injection?** Impossible — no dynamic SQL; parameterised query builder and
  bound RPC args only.
- **CSRF?** Same-origin encrypted Server Actions + SameSite cookies; no REST
  endpoint to forge.
- **XSS?** React auto-escaping, no `dangerouslySetInnerHTML`, HttpOnly cookies.
- **Why no REST API?** No public surface to secure; every write is a typed action
  and the DB re-checks it anyway.
- **Scale?** Feed capped at 200, Haversine in TS, every limit has a named
  successor; the human admin queue breaks before the DB does.
