# iHelp — Internal Architecture Guide (presentation prep)

**Purpose (assignment §11):** the map for explaining the system "מבפנים ומבחוץ" —
architecture, central files, flows, database, tests, and every technical
decision with its why. Read this before the presentation; every claim links to
the file that proves it.

---

## 1. The System on One Screen

```
Browser (Hebrew RTL)
  │  HTML (Server Components render everything)
  │  form POST (Server Actions — all writes)
  │  direct upload (photos → Supabase Storage, user JWT)
  ▼
Next.js 16 on Vercel
  proxy.ts ─ session refresh (excludes /emergency)
  app/     ─ pages: (public) static │ (app) shell │ (onboarded) gate
  actions/ ─ zod-validate → guard → Supabase call → revalidate
  lib/     ─ supabase clients │ geo │ validation │ strings │ errors
  ▼  anon key + user JWT on every call
Supabase
  Postgres ─ RLS policies + grants + constraints + 10 RPCs + 4 triggers  ← THE AUTHORITY
  Auth     ─ email/password, cookie sessions
  Storage  ─ request-photos, verification-docs (private, signed URLs)
```

One sentence to open with: **"Every rule is enforced in the database; the UI
and server are convenience layers — and our test suite attacks the database
directly to prove it."**

## 2. Repo Tour — the files that matter

| Path | What it is | Present it when asked about |
|---|---|---|
| `supabase/migrations/0001–0003` | Enums, tables + constraints, indexes | Schema, data integrity |
| `supabase/migrations/0004_functions.sql` | 3 policy helpers + **10 SECURITY DEFINER RPCs** | State machine, atomicity, "how do you stop X" |
| `supabase/migrations/0005_triggers.sql` | Signup, offer-status sync, **column guard**, offer-insert prep | "RLS can't do that" questions |
| `supabase/migrations/0006_policies.sql` | Every RLS policy + the `helper_ratings` view | Authorization |
| `supabase/migrations/0008_grants.sql` | Explicit least-privilege verb grants | The platform-defaults war story |
| `proxy.ts`, `lib/supabase/middleware.ts` | Session refresh, signed-out/signed-in redirects, `/emergency` exclusion | Auth plumbing, static emergency page |
| `app/(app)/layout.tsx` → `(onboarded)/layout.tsx` | Session shell → onboarding gate | Route-group trick (no redirect loop) |
| `app/(app)/(onboarded)/requests/page.tsx` | Feed: capped fetch → Haversine sort → paginate → bulk-sign photos | Scale, geo |
| `app/(app)/(onboarded)/requests/[id]/page.tsx` | The role-adaptive detail page — the whole lifecycle UI | Product demo, per-role views |
| `actions/*.ts` | The complete write surface (17 actions) | "Where does X happen" |
| `lib/validation/*.ts` | zod schemas mirroring DB constraints | Input validation |
| `lib/geo.ts` | Haversine, ~15 lines | "Why no PostGIS/maps API" |
| `tests/integration/*.test.ts` | 26 tests attacking the DB as real users | Security proof |
| `e2e/core-flow.spec.ts` | Two-browser core loop | "Show me it works" |
| `scripts/seed.ts` | Demo data, every lifecycle state | Demo prep |

## 3. The Core Flow, End to End (know this cold)

`open → has_offers → assigned → completed → rated` (+ `cancelled` terminal):

1. **Post** — `RequestForm` → `actions/requests.ts#createRequest` → RPC
   `create_request_with_photos`: verifies identity flag, 1–5 *deduped* photo
   paths, each a real object in the caller's own storage folder; inserts
   request + photos in one transaction. *No INSERT policy exists on these
   tables — the RPC is the only door.*
2. **Offer** — direct insert on `offers`; the INSERT policy pins verified
   caller, not-own-request, open/visible request, and **`status='active'`**
   (an offer cannot be born "selected"). Trigger T2 flips the request to
   `has_offers` (definer — a helper's insert updates the requester's row).
   Trigger T4 snapshots the request title onto the offer (my-offers renders
   after the parent becomes invisible).
3. **Assign** — RPC `assign_offer`: owner check (`not_found` for anyone else —
   the error-ordering rule), `FOR UPDATE` lock, guarded updates: request must
   still be `has_offers`, offer must still be `active` (the withdraw race
   rolls the whole thing back — test X1), competitors close atomically.
4. **Contact** — RPC `get_counterpart_contact`: the *only* cross-user path to
   a phone number; parties only, `assigned` onward; reads `profiles_private`
   with definer rights because row-level SELECT can't slice columns.
5. **Complete** — RPC `confirm_completion`: caller's side derived from
   identity (never a parameter); flips to `completed` only when both flags
   true. Idempotent per side (test X2).
6. **Rate** — RPC `submit_rating`: owner + `completed`; inserts rating and
   advances to `rated` in one transaction. Third parties read ratings via the
   `helper_ratings` view — stars and note, **no rater linkage**.

## 4. The Decision Index — every "why?", one line each

**Product**
- *Reversed marketplace?* Demand posts once; supply competes — shortens time-to-help (spec §3).
- *Both sides verified?* A fake request lures a helper as easily as a fake helper harms a requester — symmetric physical risk ⇒ symmetric gate (spec §4.1).
- *No payments?* External dependency + compliance for zero mechanic-validation value; amount is data, "paid" is a marker (spec §3).
- *No chat?* Phone reveal after mutual commitment covers coordination; chat is the first post-MVP item (spec §3).
- *Emergency page static?* Anything that looks like dispatch creates a life-safety expectation we cannot meet — `force-static` + middleware exclusion make it *provably* inert (spec §11).

**Architecture**
- *Server Actions, no REST?* Less surface to secure; nothing external calls us (arch §7).
- *profiles split in two?* RLS is row-level; helper cards need broad reads, so phone/coords/admin-flag live in an own-row-only table (arch §4.1 — was the review's critical catch).
- *10 RPCs?* Every rule RLS cannot express: cross-owner writes, old-vs-new column rules, multi-table atomicity, column slicing (arch §4.2).
- *No service key in app?* Leaking the deployment's env grants nothing beyond a signed-up user (arch §9).
- *Direct-to-storage uploads?* Server Actions cap bodies ~1MB; files never transit our functions (arch §5).
- *No ORM?* The graded layer IS the SQL — an ORM would hide it (arch §3).

**Data**
- *Enums for statuses, text+CHECK for category?* States are design-stable (invalid = type error); categories are content that grows (doc 3 §1.1).
- *Timestamps per state, no history table?* Every metric-relevant state is reached once; the open↔has_offers cycle is derived from offers (doc 3 §1.2).
- *Computed rating averages?* Correctness free at MVP scale; trigger-counters are the named successor (scale §7.2).
- *No DELETEs anywhere?* Audit trails and referential history; `cancelled`/`withdrawn`/`revoked` are states (doc 3 §4).
- *Explicit grants migration?* Platform default privileges proved unreliable — and least-privilege is stronger anyway: authenticated has **no INSERT** on RPC-only tables (security §3).

**Process**
- *Docs before code, gates between phases?* The assignment grades defensibility; each phase was adversarially reviewed (85 doc findings + 25 code findings fixed before they shipped).

## 5. Likely Hard Questions (with the answers' locations)

| Question | Answer lives in |
|---|---|
| "Prove a user can't read someone else's phone" | test P11 + `profiles_private` policies (0006) + contact RPC (0004 §3.10) |
| "What if two requesters assign simultaneously / helper withdraws mid-assign?" | `assign_offer` FOR UPDATE + guarded updates; test X1 shows the rollback |
| "Why does completion need both sides?" | Fairness: neither side unilaterally triggers rating (spec §9.1); RLS can't express it → RPC |
| "What's your heaviest query and its plan?" | Feed: `idx_requests_browse`, 200-row cap, in-memory Haversine (scale §3/§5) |
| "What breaks first at 10× users?" | The human review queue, then the feed cap — both with signals and successors (scale §2/§7) |
| "What are you least happy with?" | Honest: R1–R3 (email confirmation off, no rate limiting, manual identity proofing) — security §9 |
| "Why is the anon key in the browser safe?" | RLS is the authority; the key grants nothing a signup doesn't (security §7) |

## 6. Test Story (30 seconds)

60 vitest tests + 1 Playwright spec. The pyramid is deliberately inverted
toward **integration**: 26 tests create real users against a real Postgres and
attack every permission as the wrong user — the suite's centerpiece is denial,
not happy paths, because the product's claim is "the database says no."
E2E drives the full Hebrew UI with two browsers in 10 seconds.

## 7. Deploy Topology (once live)

GitHub `main` → Vercel (build + host; two public env vars) — and separately —
Supabase cloud project (migrations pushed via `supabase db push`, buckets and
policies created by the same SQL, email confirmation OFF, seed via
`scripts/seed.ts` pointed at the cloud URL with its service key, admin flag set
in the SQL editor). Nothing else. Demo accounts get rotated after the
presentation (security R9).
