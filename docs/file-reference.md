# iHelp — File & Component Reference

Every source file in the project, grouped by area, with **what it's for** and
**how it's implemented**. Use this to find where something lives, to prepare for
"where is X handled?" questions, or to onboard onto the codebase.

**Legend:** 🟩 Server Component / server code · 🟦 Client Component (`"use client"`)
· 🟨 shared/isomorphic lib · 🟥 SQL.

---

## 1. Database — `supabase/migrations/*.sql` 🟥

The data model and all its rules, as ordered SQL. This is the **source of truth**:
the app trusts the database, so these files *are* the security and business logic.

| File | Purpose | How it's implemented |
|---|---|---|
| `0001_enums.sql` | The closed value-sets the state machine leans on | Postgres `enum` types: `request_status`, `offer_status`, `application_kind`, `application_status`. An invalid state becomes a *type error*. |
| `0002_tables.sql` | The seven tables | `profiles` (public) + `profiles_private` (own-row-only: phone, coordinates, `is_admin`) — split because RLS is row-level, not column-level; `verification_applications`, `help_requests`, `offers`, `request_photos`, `ratings`. Constraints (check, unique) live here. |
| `0003_indexes.sql` | Query performance | One index per hot query path (feed browse, a helper's offers, the admin queue), including partial indexes. |
| `0004_functions.sql` | The privileged write path | The `SECURITY DEFINER` RPCs — `create_request_with_photos`, `assign_offer` (atomic pick-one-close-rest), `confirm_completion`, `cancel_request`, `submit_rating`, `mark_paid`, `review_application`, `revoke_verification`, `set_request_hidden`, `get_counterpart_contact` — each does its own in-body permission check. Also the `is_admin()` / `is_identity_verified()` helpers. |
| `0005_triggers.sql` | Invisible invariants | `handle_new_user` (creates profile rows on signup), `sync_request_offer_status` (keeps `open ↔ has_offers` correct), `guard_protected_columns` (an *invoker-rights* trigger that blocks direct writes to system columns — the thing RLS can't do), `prepare_offer_insert` (snapshots the request title onto the offer). |
| `0006_policies.sql` | Row Level Security — the authority | An RLS policy per table per action, each with a comment naming the product rule it enforces. E.g. `offers_select` = sealed bids (only the offer owner + request owner). Also the `helper_ratings` **view** that exposes ratings publicly *without* rater identity. |
| `0007_storage.sql` | File buckets | `request-photos` and `verification-docs` (private, signed-URL access) with storage RLS policies scoping writes to each user's own folder. |
| `0008_grants.sql` | Least privilege | Explicit table grants — the local Supabase image shipped tables with *no* DML grants, so this pins exactly what `anon`/`authenticated` may do, ending up stricter than the platform default. |
| `0009_offer_pricing.sql` | Move price to the offer | Adds `offers.price`; pricing becomes the helper's, not the requester's. |
| `0010_offer_pricing_mode.sql` | Three pricing stances | Adds `offers.pricing_mode` (fixed/volunteer/after_job) + `final_price` + the `set_final_price` RPC + the `price_matches_mode` check. |
| `0011_drop_payment_type.sql` | Pricing lives on the offer | The request carries no pricing; each offer declares its own stance (fixed / volunteer / after-job). |
| `0012_avatars.sql` | Profile pictures | Adds `profiles.avatar_path` + a **public** `avatars` bucket (safe: non-sensitive, avoids per-render signed URLs). |
| `0013_pin_final_price_insert.sql` | Pin the after-job price | Pins `final_price is null` at offer insert, so the after-job amount can only be set through the guarded `set_final_price` RPC — never fabricated at insert. |
| `0014_helper_stats.sql` | Richer reputation | Extends `helper_ratings` with request category (still no rater linkage) + adds the `get_helper_stats` RPC (jobs count, category breakdown, star histogram) — aggregates only, so no raw row leaks. |

---

## 2. Server Actions — `actions/*.ts` 🟩

Every **write** goes through a Server Action. The pattern is uniform: validate
input with zod → call the DB (RPC or table write) → the DB is the real gate →
`revalidatePath` → return a typed `ActionResult`.

| File | Purpose | How it's implemented |
|---|---|---|
| `auth.ts` | Sign up / in / out | Wraps Supabase Auth; maps a duplicate-email error to a "go log in" message; redirects to `/profile` for onboarding. |
| `helpers.ts` | Shared action util | `zodFieldErrors` — flattens zod issues into `{ field: message }` for the forms. |
| `profile.ts` | Update profile / location / avatar | `updateProfile` writes name/phone/avatar (own-row RLS); `updateLocation` persists browser-captured coordinates. |
| `verification.ts` | Submit verification applications | `submitIdentityApplication` / `submitProfessionalApplication` — insert into `verification_applications`; note the `?? ""` normalization for optional file paths (the zod-null bug class). |
| `requests.ts` | Request lifecycle (requester side) | `createRequest` (calls the atomic photos RPC), `updateRequest` (content-only edit with the silent-denial `.select()` pattern), `cancelRequest`, `assignOffer`, `confirmCompletion`, `markPaid` — mostly thin wrappers over RPCs. |
| `offers.ts` | Offers (helper side) | `createOffer`, `updateOffer`, `withdrawOffer`, `setFinalPrice`. |
| `ratings.ts` | Rating | `submitRating` → the `submit_rating` RPC (which atomically inserts the rating and advances the request to `rated`). |
| `admin.ts` | Admin actions | `reviewApplication`, `revokeVerification`, `setRequestHidden` → the admin RPCs (which re-check `is_admin()` in-body). |

---

## 3. Shared library — `lib/*` 🟨

| File | Purpose | How it's implemented |
|---|---|---|
| `supabase/server.ts` | Per-request Supabase client (server) | Cookie-based client via `@supabase/ssr`; carries the user's JWT so RLS applies. Also `getUser()`/`getViewerProfile()` wrapped in React `cache()` to dedupe reads across layouts. |
| `supabase/client.ts` | Browser Supabase client | Used only where the browser must talk to Supabase directly (direct-to-storage uploads). |
| `supabase/middleware.ts` | Session refresh + redirects | Refreshes the auth cookie; bounces signed-out users to `/login` and signed-in users off the marketing pages. |
| `validation/*.ts` | zod schemas (input validation) | One schema per form: `auth`, `profile`, `verification`, `request`, `offer`, `rating`. Mirrors the DB constraints so the client gets instant feedback and the server gets an authoritative parse. `request.ts` uses string-first coercion to avoid the "(0,0) Null Island" trap; `offer.ts` enforces the fixed↔price coupling. |
| `errors.ts` | RPC-error → Hebrew message | `mapDbError` turns stable DB error codes into user-facing Hebrew; RLS denials collapse to a generic "no permission" so nothing leaks about row existence. Defines the `ActionResult` type. |
| `strings.ts` | All Hebrew UI copy | Every user-facing string in one module — keeps RTL/locale review to a single file, code stays English. |
| `categories.ts` | Request categories | The canonical category list (keys + Hebrew labels); the DB check mirrors it. |
| `geo.ts` | Distance math | Haversine great-circle distance in ~15 lines — no PostGIS, no paid maps. `geo.test.ts` covers it. |
| `leaflet-icon.ts` | Map marker fix | Points Leaflet's default marker icons at bundled assets (Leaflet's defaults break under bundlers). |

---

## 4. Pages & layouts — `app/*` 🟩 (unless noted)

**Root & public** (`app/` and `app/(public)/`):

| File | Purpose | How it's implemented |
|---|---|---|
| `layout.tsx` | Root shell | `<html dir="rtl" lang="he">`, the Assistant Hebrew font, PWA/viewport metadata. Cookie-free so static routes stay static. |
| `globals.css` | Design system | Tailwind v4 + the pine-green token palette; shared component classes (`.card`, `.btn-primary`, `.chip`…); mobile tap/touch/overscroll hardening. |
| `manifest.ts` | PWA manifest | Generates the web app manifest (standalone, RTL, pine colors) → installable. |
| `(public)/page.tsx` | Landing | The pitch + hero; `force-static`. |
| `(public)/login/page.tsx`, `signup/page.tsx` | Auth entry | Thin pages rendering `<AuthForm>` in the right mode. |
| `(public)/emergency/page.tsx` | Emergency numbers | **Static, info-only** — `tel:` links to real hotlines, zero logic, excluded from middleware. A hard product boundary. |
| `api/health/route.ts` | Keep-alive endpoint | A public GET that does one trivial DB read and returns 200 — pinged by the GitHub Actions cron so Supabase doesn't pause. |

**Signed-in app** (`app/(app)/`):

| File | Purpose | How it's implemented |
|---|---|---|
| `(app)/layout.tsx` | App shell | Session read, desktop nav + mobile bottom-nav, onboarding redirect (empty display name → `/profile`). This layout — not the root — is session-aware. |
| `(app)/error.tsx`, `not-found.tsx` | Boundaries | Friendly Hebrew error/404 (RLS-invisible rows render as not-found — indistinguishable from missing, deliberately). |
| `(app)/profile/page.tsx` | Own profile | Name/phone/avatar form, geolocation capture, own rating, the install nudge. Lives *outside* `(onboarded)` to avoid a redirect loop. |
| `(onboarded)/layout.tsx` | Onboarding gate | Redirects users with no display name to `/profile`. |
| `(onboarded)/requests/page.tsx` | The feed | Fetches capped open requests, sorts by Haversine distance server-side, renders cards + `<FeedMap>`; category/distance filters via URL state; pagination. |
| `(onboarded)/requests/new/page.tsx` | Post a request | Gated to verified users; renders `<RequestForm>`. |
| `(onboarded)/requests/[id]/page.tsx` | Request detail | The big role-adaptive page: timeline, photos, map, and per-role panels (owner sees the comparison workbench + assign; helper sees the offer form; parties see contact + completion; owner rates). Two-round `Promise.all` fetch. |
| `(onboarded)/requests/*/loading.tsx` | Skeletons | Loading placeholders that match the real layouts (no content jump). |
| `(onboarded)/my/requests/page.tsx`, `my/offers/page.tsx` | "My" lists | The user's own requests / offers, with action-relevant status. |
| `(onboarded)/helpers/[id]/page.tsx` | Helper reputation | Stat tiles, category-expertise chips, star-distribution histogram, reviews with context — from `get_helper_stats` + the `helper_ratings` view. |
| `(onboarded)/verification/page.tsx` | Get verified | Shows current status; renders the identity / professional application forms. |
| `(onboarded)/admin/page.tsx` | Admin dashboard | Pending-verification queue (with signed doc URLs), moderation hide/unhide, revoke — 404s for non-admins, but real authority is in the RPCs. |

---

## 5. Components — `components/*` (🟦 client unless noted)

| File | Purpose | How it's implemented |
|---|---|---|
| `ui.tsx` 🟩 | Shared UI vocabulary | `Avatar`, `Badge`, `Stars`, `StatusChip`/`PublicStatusChip`, `OfferPriceChip`, `StatChip`, `RatingBars`, `CategoryChips`, `EmptyState`, `formatDate`. The design-system primitives. |
| `AuthForm.tsx` | Login/signup form | `useActionState` over the auth action; inline field errors. |
| `NavLinks.tsx`, `BottomNav.tsx` | Navigation | Desktop nav + mobile bottom tab bar with active-state + `aria-current`. |
| `RequestForm.tsx` | Create/edit a request | Core fields + `<FileUploader>` + a `<MapPicker>` location field; disables submit while a photo uploads. |
| `FileUploader.tsx` | Direct-to-storage upload | Uploads files browser→Supabase Storage with the user JWT (own folder), passes back only the path; type/size checks; reports "busy" to the parent. |
| `OfferForm.tsx` | Make/edit an offer | The three-stance pricing picker (fixed/volunteer/after_job); the price field shows only for "fixed". Also `StarsInput`. |
| `OfferComparison.tsx` | **Offer-comparison workbench** | Client-side sort (price/rating/newest) + filter (volunteers/fixed/pros) + summary line + explicit stance labels; the selected offer pins to top. All data arrives as props — no queries. |
| `LifecycleActions.tsx` | Lifecycle buttons | `AssignButton`, `CancelRequestButton`, `ConfirmCompletionButton`, `MarkPaidButton`, `SetFinalPriceForm`, `RatingForm`, and the shared `useConfirmedTransition` hook (confirm dialog + surfaces errors + refreshes stale views). |
| `RequestTimeline.tsx` 🟩 | **Lifecycle stepper** | RTL stepper rendering the five states with real per-state timestamps; current step ringed; a cancelled branch. Pure presentation. |
| `AdminReview.tsx` | Admin controls | `ReviewForm` (approve/reject with note), `HideToggle`, `RevokeButton` — reuse `useConfirmedTransition` so failures aren't silent. |
| `VerificationForms.tsx` | Verification apps | Identity + professional application forms with doc upload. |
| `ProfileForm.tsx` | Profile editing | Name/phone/avatar; shows the "can't remove a saved phone" rule. |
| `GeolocationPrompt.tsx` | Capture location | One-time browser geolocation → persisted server-side. |
| `MapView.tsx`, `MapPicker.tsx`, `FeedMap.tsx`, `RequestsMap.tsx` | Maps (Leaflet/OSM) | Display-only OpenStreetMap: `MapView` shows one request's location; `MapPicker` lets a requester place a pin; `FeedMap`/`RequestsMap` plot all feed requests as pins with click-toggle popups. No API key. |
| `ShareButton.tsx` | Web Share | `navigator.share` (OS share sheet) with a clipboard fallback + inline "copied" confirmation; feature-detected, SSR-safe. |
| `InstallPrompt.tsx` | Install nudge | Surfaces "Add to Home Screen" — Chromium `beforeinstallprompt` + an iOS Safari hint; hidden when already installed. |

---

## 6. Tests — `tests/`, `e2e/`, and co-located `*.test.ts` 🟨

| File | Purpose | How it's implemented |
|---|---|---|
| `tests/integration/helpers.ts` | Test harness | Spins up real Supabase clients for real users against the local stack; skips cleanly if the stack is absent. |
| `tests/integration/lifecycle.test.ts` | The happy path + edge cases | Drives create→offer→assign→dual-complete→rate through real RPCs; race conditions; the after-job flow; the `get_helper_stats` check; the final-price security regression. |
| `tests/integration/permissions.test.ts` | RLS / authorization | The "attack" tests: each *tries* a forbidden action as the wrong user (self-admin, reading sealed offers, editing others' rows…) and asserts denial. |
| `lib/geo.test.ts` | Haversine unit tests | Known-distance assertions. |
| `lib/validation/schemas.test.ts` | Validation unit tests | Length bounds, category enum, phone format, price/stance coupling, the (0,0) and null-FormData regressions. |
| `components/ui.test.tsx` | Component tests | React Testing Library over `Stars`, `StatusChip` (Hebrew labels), `Badge`. |
| `e2e/core-flow.spec.ts` | End-to-end | Playwright drives the entire core loop through the real UI in two isolated browser sessions, asserting the ₪ price. |

---

## 7. Config, tooling & assets

| File | Purpose |
|---|---|
| `proxy.ts` | Next.js middleware (named `proxy.ts` per Next 16); calls `updateSession` and defines the matcher (excludes `/emergency`, `/api/health`, the manifest). |
| `scripts/seed.ts` | Demo-data seeder — creates auth users via the service-role admin API (local/CI only) and inserts requests/offers/ratings in every lifecycle state. |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts` | Build/lint/test configuration. |
| `.github/workflows/keepalive.yml` | Cron that pings `/api/health` every 3 days to keep the free-tier DB from pausing. |
| `public/icons/*.png` | PWA icons (192, 512, maskable, apple-touch). |
| `.env.local.example` | Template listing the required env vars (the two public `NEXT_PUBLIC_SUPABASE_*` for the app; service-role for local seeding only). |
| `images.d.ts`, `next-env.d.ts` | TypeScript ambient declarations. |

---

## 8. The docs themselves — `docs/*`

| File | What it is |
|---|---|
| `product-spec.md` | Product spec — problem, users, customer, goals, processes, permission matrix. |
| `architecture.md` | Architecture — components, data flow, the privileged-code inventory, enforcement layers. |
| `technical-design.md` | The full SQL blueprint — schema, every RLS policy, every RPC body, validation, UX. |
| `testing-spec.md` | What is tested and why it proves the product works. |
| `scale.md` | Load analysis, indexes, pagination, limits and their named successors. |
| `security.md` | Auth/authz layers, secrets, env vars, remaining risks. |
| `internal-architecture.md` | Internal guide — repo tour, flows, and the *decision index* (the "why" behind each choice). |
| `presentation.md` | The presentation run-sheet (talk track + demo script). |
| `project-walkthrough.md` | The follow-along guide (setup, run, understand, present). |
| `file-reference.md` | **This file** — every file's purpose and implementation. |
