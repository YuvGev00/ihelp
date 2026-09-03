<div align="center">

# iHelp — מבקשים עזרה, העוזרים מגיעים אליכם

**A reversed help-marketplace: post one request, and verified neighbors compete to help you.**

Final project · *Internet Technologies — Become a Full-Stack Engineer* · RUNI CS 2026

[![Live](https://img.shields.io/badge/live-ihelp--roan.vercel.app-0f6b4f?style=flat-square)](https://ihelp-roan.vercel.app)
&nbsp;
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-63%20passing-0f6b4f?style=flat-square)

**[🌐 Live app](https://ihelp-roan.vercel.app)** · **[📄 Easy-review guide](docs/12-easy-review.md)** · **[📚 All docs](#-documentation)**

</div>

---

## What is iHelp?

Finding trustworthy, available help is slow and one-directional — you search,
compare, and call providers one by one, and they can't even see that you need
help. **iHelp reverses that.**

A requester posts **one** help request; identity-verified helpers nearby
**compete** with offers — for pay or as volunteers. The requester picks one
offer, both sides confirm the work is done, and the requester rates the helper.

> **The core idea, technically:** *the database is the only authority.* Every
> permission rule is enforced inside PostgreSQL (Row Level Security + `SECURITY
> DEFINER` functions + guard triggers) — not in the app code. Even a request that
> bypasses the UI hits the same wall.

**Tech stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS,
Auth, Storage) · Tailwind CSS v4 · Vercel · Leaflet + OpenStreetMap (display-only
maps, no API key).

---

## 🔑 Try it live

The live site has six seeded demo accounts — all with the password **`12345678`**:

| Email | Role |
|---|---|
| `dana@ihelp.demo` | Requester — post a request, compare offers, rate |
| `yossi@ihelp.demo` | Helper (verified + professional badge) — make an offer |
| `admin@ihelp.demo` | Admin — approve verifications, moderate |
| `noa@ihelp.demo` | Unverified — shows the verification gate |

> **Two-account demo:** log in as Dana and Yossi in **two separate browsers**
> (not two tabs — they share the login cookie).
>
> **Is the site awake?** Open [`/api/health`](https://ihelp-roan.vercel.app/api/health) —
> `{"ok":true,"db":"reachable"}` means the free-tier database is live.

---

## 📚 Documentation

> **Reviewing this project?** Start with **[docs/12-easy-review.md](docs/12-easy-review.md)** —
> what was built and a 5-minute review path on the live site (Hebrew).

**Required submission documents**

| Doc | Content |
|---|---|
| [01 · Product spec](docs/01-product-spec.md) | Problem, users, customer, goals, processes, state machine, permission matrix |
| [03 · Technical design](docs/03-technical-design.md) | Full SQL schema, every RLS policy, RPC bodies, CRUD, validation, error handling, UX |
| [04 · Testing spec](docs/04-testing-spec.md) | What is tested and why it proves the product works |
| [05 · Scale](docs/05-scale.md) | Load analysis, indexes, pagination, limits and their successors |
| [06 · Security](docs/06-security.md) | Auth/authz layers, secrets, env vars, remaining risks |

**Deeper reference**

| Doc | Content |
|---|---|
| [02 · Architecture](docs/02-architecture.md) | Components, technology choices, data flows, enforcement layers |
| [07 · Internal guide](docs/07-internal-architecture.md) | Repo tour, core flow, the decision index |
| [08 · Presentation](docs/08-presentation.md) | Talk track + demo script |
| [09 · Walkthrough](docs/09-project-walkthrough.md) | Follow-along setup, "is it up?" checks, core flow |
| [10 · File reference](docs/10-file-reference.md) | Every source file's purpose & implementation |
| [11 · Course-concepts map](docs/11-course-concepts-map.md) | Every taught concept → how it was built, why, and where in the code |
| [12 · Easy-review guide](docs/12-easy-review.md) | What was built + a 5-minute review path (the reviewer's entry point) |

---

## 🗂️ Project structure

```
app/            Next.js App Router pages — (public) signed-out · (app) signed-in
actions/        Server Actions — every write (request, offer, assign, rate, admin…)
components/     React UI — forms, maps, the offer-comparison workbench, timeline
lib/            Supabase clients · zod validation · geo (Haversine) · Hebrew strings
supabase/       migrations/ — 15 SQL files: 7 tables, RLS, 11 RPCs, triggers
tests/, e2e/    62 Vitest tests (incl. RLS "attack" tests) + 1 Playwright E2E
docs/           All project documentation
```

---

## 🚀 Running locally

**Prerequisites:** Node.js ≥ 20 · Docker (for local Supabase) · Supabase CLI (via `npx`).

```bash
# 1. Install dependencies
npm install

# 2. Start a local Supabase stack (applies supabase/migrations automatically)
npx supabase start
#    → prints the API URL, anon key, and service_role key

# 3. Configure environment
cp .env.local.example .env.local
#    fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from step 2

# 4. (Optional) seed demo data — requires the service_role key from step 2
SUPABASE_SERVICE_ROLE_KEY=... SEED_PASSWORD=... npx tsx scripts/seed.ts

# 5. Run
npm run dev        # → http://localhost:3000
```

**Other commands:** `npm test` (Vitest) · `npm run test:e2e` (Playwright) ·
`npm run lint` · `npm run build`.

---

## 🔐 Environment variables

The deployed app needs **exactly two** — both safe to expose, because Row Level
Security is the authority (see [architecture §9](docs/02-architecture.md)):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — grants nothing beyond what RLS allows |

`SUPABASE_SERVICE_ROLE_KEY` is used **only** by the local seed script — it is
never set on Vercel, and no application code reads it.

---

## 🛡️ Security model in one paragraph

Every permission is enforced in the database: RLS policies for row access,
unique/check constraints for cross-row rules, and a small audited set of
`SECURITY DEFINER` functions (eleven RPCs) for atomic state transitions. The UI
and Server Actions only mirror these rules for a friendly error — a crafted API
request carrying a user's JWT hits exactly the same wall. Full detail:
[technical design §2–§3](docs/03-technical-design.md).
