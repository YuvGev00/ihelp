# iHelp — Project Walkthrough (a guide you can follow start to finish)

This is the hand-holding guide: how to get the project running, how the pieces
fit, and how to walk through it — whether you're setting up on a fresh machine,
demoing, or just re-familiarizing yourself before the presentation.

- **Live app:** https://ihelp-roan.vercel.app
- **Repo:** https://github.com/YuvGev00/ihelp
- **What it is:** a Hebrew, RTL, reversed help-marketplace. A requester posts a
  help request; identity-verified helpers nearby compete with offers (fixed
  price / volunteer / price-after-the-job); the requester picks one; both confirm
  completion; the requester rates the helper.

> **Companion docs:** for *what to say* in the presentation see
> `presentation.md`; for a file-by-file explanation see
> `file-reference.md`; for the deep "why" behind decisions see
> `internal-architecture.md`.

---

## Part A — The two "is it up?" checks (do this first, every time)

The app has two independent moving parts. Check both:

1. **Vercel (the frontend/app).** Open https://ihelp-roan.vercel.app/login — if the
   login page loads, Vercel is up. **Vercel does not pause**, so this is almost
   always fine.
2. **Supabase (the database).** This is the free-tier piece that **pauses after
   ~7 days of inactivity**. Quick test: open
   https://ihelp-roan.vercel.app/api/health.
   - `{"ok":true,"db":"reachable"}` → the DB is up, you're good.
   - `{"ok":false,"error":"db_error"}` (HTTP 503) → **the DB is paused.**

**If the DB is paused (this WILL happen if the project sat idle):**
1. Go to https://supabase.com/dashboard and open the `iHelp` project.
2. Click **"Restore project" / "Resume"**. Wait 1–2 minutes.
3. Re-check `/api/health` until it returns `{"ok":true,...}`.

> There is a GitHub Actions keep-alive (`.github/workflows/keepalive.yml`) that
> pings the DB every 3 days to *try* to prevent this, but Supabase's free tier can
> pause anyway — it is best-effort, not a guarantee. **Before a live demo, always
> resume the DB manually and confirm `/api/health` is green.** The only way to
> guarantee it never pauses is the paid Supabase Pro plan.

---

## Part A2 — Demo logins (live site)

The seeded demo accounts on the **live** site
(https://ihelp-roan.vercel.app/login) all share one simple password so you can
log in fast during the presentation:

| Email | Password | Role |
|---|---|---|
| `admin@ihelp.demo` | `12345678` | Admin — reviews verifications, moderates |
| `dana@ihelp.demo` | `12345678` | Requester (identity-verified) |
| `yossi@ihelp.demo` | `12345678` | Helper — verified **+ professional badge** ("חשמלאי מוסמך") |
| `rina@ihelp.demo` | `12345678` | Helper (identity-verified) |
| `amir@ihelp.demo` | `12345678` | Helper (identity-verified) |
| `noa@ihelp.demo` | `12345678` | Unverified — use to show the verification gate + admin queue |

> These are throwaway presentation logins holding no real data, which is why the
> shared `12345678` password is fine. To reset them again (e.g. after Supabase
> rotates keys), run — with the project's **secret** key from the Supabase
> dashboard (Project Settings → API Keys → the key labeled *Secret*, formerly
> *service_role*):
>
> ```bash
> RESET_URL='https://ukynxxrbfenrsnwqgtix.supabase.co' \
> RESET_KEY='<secret key>' \
> DEMO_PASSWORD='12345678' \
> npx tsx scripts/reset-demo-password.mts
> ```
>
> **Two-account demos:** log in as Dana (requester) in one browser and Yossi
> (helper) in a **separate** browser — not two tabs of the same one, which share
> the cookie and fight over the session (the #1 gotcha).

---

## Part B — Running it locally (fresh machine)

You need: **Node.js ≥ 20**, **Docker** (for local Supabase), and the **Supabase
CLI** (used via `npx`, no install needed).

```bash
# 1. Install dependencies
npm install

# 2. Start a local Supabase stack. This applies every migration in
#    supabase/migrations/ automatically and prints your local keys.
npx supabase start
#    → note the "API URL", "anon key", and "service_role key" it prints

# 3. Configure environment
cp .env.local.example .env.local
#    Put the API URL into NEXT_PUBLIC_SUPABASE_URL and the anon key into
#    NEXT_PUBLIC_SUPABASE_ANON_KEY (both printed by step 2).

# 4. (Optional but recommended) Seed demo data — accounts + requests in every
#    lifecycle state. Uses the service_role key LOCALLY ONLY.
SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 2> \
SEED_PASSWORD=demo-local-1234 \
npx tsx scripts/seed.ts

# 5. Run the app
npm run dev
#    → http://localhost:3000
```

**Demo accounts after seeding** (all use whatever `SEED_PASSWORD` you set):

| Email | Role |
|---|---|
| `admin@ihelp.demo` | Admin (reviews verifications, moderates) |
| `dana@ihelp.demo` | Requester (identity-verified) |
| `yossi@ihelp.demo` | Helper — verified **+ professional badge** ("חשמלאי מוסמך") |
| `rina@ihelp.demo` | Helper (identity-verified) |
| `amir@ihelp.demo` | Helper (identity-verified) |
| `noa@ihelp.demo` | Unverified — use to show the verification gate + admin queue |

> **Two-account demos:** to play requester and helper at once, use **two separate
> browsers** (or one normal + one incognito window). Two tabs in the *same* window
> share the login cookie and the sessions will fight — this is the #1 gotcha.

**Useful commands:**

```bash
npm run build          # production build
npm run lint           # eslint
npm test               # vitest (unit + integration; integration needs supabase running)
npm run test:e2e       # Playwright end-to-end (needs supabase + seed)
npx supabase db reset  # wipe + re-apply all migrations (fresh DB)
npx supabase stop      # stop the local stack
```

---

## Part C — The one-screen mental model

```
  Browser (Hebrew, RTL)
        │  reads = Server Components  ·  writes = Server Actions
        ▼
  Next.js 16 App Router  on  Vercel        ← no separate API server
        │  every call carries the signed-in user's JWT
        ▼
  Supabase = Postgres (RLS) + Auth + Storage
        └─ THE DATABASE IS THE ONLY AUTHORITY
           (RLS policies + SECURITY DEFINER functions + guard triggers)
```

**The single most important idea to understand:** every permission rule is
enforced *in the database*, not in the app code. The UI and server actions repeat
the checks only to show a friendly error — but even a hand-crafted request that
skips them hits Postgres with nothing but the caller's own identity, and the
database decides, per row, what they may see or do. That's why the app never uses
the powerful "service-role" key anywhere in its code.

---

## Part D — Walking the core flow (what happens, end to end)

Follow this as a click-through, or read it to understand the system:

1. **Sign up / log in** → on first login you land on `/profile` to set a display
   name and (optionally) share your location.
2. **Get verified** (`/verification`) → submit name, phone, a short description,
   optionally an ID photo. An **admin** approves it. You cannot post or offer until
   you're verified — this gate is symmetric (both requesters and helpers pass it).
3. **Browse** (`/requests`) → the feed shows open requests near you, sorted by
   distance (computed in the app, no paid maps), with category + distance filters
   and a live map of pins.
4. **Post a request** (`/requests/new`) → title, description, category, up to 5
   photos (optional, uploaded straight to storage), and a map-confirmed location.
5. **Helpers offer** → a verified helper opens your request and submits an offer,
   choosing one of three pricing stances (fixed / volunteer / price-after-job).
   Offers are **sealed** — a helper never sees competitors' offers.
6. **Compare + assign** → as the requester you see the **offer-comparison
   workbench**: sort by price/rating, filter, and each offer's stance is labeled.
   You pick one; the assignment is **atomic** (picks that offer, closes all others
   in one transaction). Only now are the two parties' phone numbers revealed to
   each other.
7. **Both confirm completion** → the request only becomes "completed" when *both*
   sides confirm (the fairness mechanism). For a price-after-job offer, the helper
   sets the final amount here.
8. **Rate** → the requester rates the helper 1–5 + a note. The helper's public
   **reputation page** updates: completed-jobs count, category expertise, a
   star-distribution histogram, and reviews — without ever revealing who rated
   them.

The request moves through a strict state machine:
`open → has_offers → assigned → completed → rated` (plus a `cancelled` branch).
You can see it as the **lifecycle timeline** at the top of any request you're a
party to.

Two things that are deliberately *not* here (and why): a real **payment gateway**
(no money moves — a "paid" checkbox after completion is record-keeping only; a
real gateway is a fragile paid dependency with no learning value) and the
**emergency page** is static info only — `tel:` links to real hotlines, zero
business logic, by design.

---

## Part E — Presenting (the short version)

The full run-sheet is `presentation.md`. The essentials:

- **Resume Supabase first** (Part A) and confirm `/api/health` is green.
- **Two separate browsers**, logged in as Dana (requester) and Yossi (helper),
  plus an admin tab.
- Record the **E2E fallback** the day before: `npx playwright test --trace on`,
  keep the trace — if the live demo misbehaves, the trace replays the exact loop.
- Tell the story as *decisions*, not features: "the database is the only
  authority," "trust is symmetric," "helpers dictate the price." The assignment
  grades your ability to defend each choice like a job interview.

---

## Part F — Where everything lives (quick map)

| Folder | What's in it |
|---|---|
| `app/` | Pages & layouts (Next.js App Router). `(public)/` = signed-out; `(app)/(onboarded)/` = signed-in app; `api/health/` = the keep-alive endpoint. |
| `actions/` | Server Actions — every write (create request, offer, assign, rate, admin…). |
| `components/` | React UI components (forms, maps, cards, the timeline, comparison workbench…). |
| `lib/` | Shared code: Supabase clients, zod validation, geo math, Hebrew strings, error mapping. |
| `supabase/migrations/` | The database, as ordered SQL: tables, RLS policies, functions, triggers. **This is the source of truth for the data model.** |
| `scripts/seed.ts` | Demo-data seeder (local/admin tooling only). |
| `tests/`, `e2e/` | Integration + unit tests (vitest) and the Playwright end-to-end. |
| `docs/` | All the written documents (spec, architecture, technical design, tests, scale, security, this walkthrough, and the file reference). |

For a file-by-file explanation of purpose + how each was implemented, see
**`file-reference.md`**.
