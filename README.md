# iHelp — מבקשים עזרה, העוזרים מגיעים אליכם

Final project for **Internet Technologies — Become a Full-Stack Engineer** (RUNI CS 2026).

**🌐 Live app:** https://ihelp-roan.vercel.app · **Repo:** https://github.com/YuvGev00/ihelp

iHelp reverses the help-search model: a requester posts a help request, and
identity-verified helpers nearby compete to offer help — paid or volunteer.
Both sides of every transaction pass admin-reviewed identity verification, and
helpers are rated after completion.

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS, Auth, Storage) · Tailwind v4 · Vercel · Leaflet + OpenStreetMap (display-only maps, no API key)

## Documentation

> **Reviewing this project?** Start with **[docs/12-easy-review.md](docs/12-easy-review.md)** —
> what was built + a 5-minute review path on the live site (Hebrew).

| Doc | Content |
|---|---|
| [docs/12-easy-review.md](docs/12-easy-review.md) | **Easy-review guide** (Hebrew) — what was built + a 5-minute review path; the reviewer's entry point |
| [docs/01-product-spec.md](docs/01-product-spec.md) | Product specification — problem, users, customer, goals, processes, state machine, permission matrix |
| [docs/02-architecture.md](docs/02-architecture.md) | Architecture — components, technology choices, data flows, enforcement layers |
| [docs/03-technical-design.md](docs/03-technical-design.md) | Technical design — full SQL schema, every RLS policy, RPC bodies, CRUD, validation, error handling, UX |
| [docs/04-testing-spec.md](docs/04-testing-spec.md) | Testing specification — what is tested and why it proves the product works |
| [docs/05-scale.md](docs/05-scale.md) | Scale — load analysis, indexes, pagination, limits and successors |
| [docs/06-security.md](docs/06-security.md) | Security — auth/authz layers, secrets, env vars, remaining risks |
| [docs/07-internal-architecture.md](docs/07-internal-architecture.md) | Internal guide — repo tour, flows, decision index (presentation prep) |
| [docs/08-presentation.md](docs/08-presentation.md) | Presentation plan — 10–15 min outline + demo script |
| [docs/09-project-walkthrough.md](docs/09-project-walkthrough.md) | Follow-along guide — setup, "is it up?" checks, demo logins, core flow |
| [docs/10-file-reference.md](docs/10-file-reference.md) | File-by-file reference — every source file's purpose & implementation |
| [docs/11-course-concepts-map.md](docs/11-course-concepts-map.md) | Course-concepts map — every taught concept → how/why/where in the code |

## Running locally

Prerequisites: Node.js ≥ 20, Docker (for local Supabase), Supabase CLI (used via `npx`).

```bash
# 1. Install dependencies
npm install

# 2. Start a local Supabase stack (applies supabase/migrations automatically)
npx supabase start
#    → prints API URL, anon key, and service_role key

# 3. Configure environment
cp .env.local.example .env.local
#    fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from step 2

# 4. (Optional) seed demo data — requires the service_role key from step 2
SUPABASE_SERVICE_ROLE_KEY=... SEED_PASSWORD=... npx tsx scripts/seed.ts

# 5. Run
npm run dev        # http://localhost:3000
```

Other commands: `npm test` (unit tests), `npm run lint`, `npm run build`.

## Environment variables

The deployed app needs **exactly two**, both safe to expose because Row Level
Security is the authority (see `docs/02-architecture.md` §9):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — grants nothing beyond what RLS allows |

`SUPABASE_SERVICE_ROLE_KEY` is used **only** by the local seed script — never
set it on Vercel; no application code reads it.

## Security model in one paragraph

Every permission is enforced in the database: RLS policies for row access,
unique/check constraints for cross-row rules, and a small audited set of
SECURITY DEFINER functions (eleven RPCs) for atomic state transitions — the UI and
server actions only mirror these rules for usability. A crafted API request
carrying a user's JWT hits exactly the same wall. Details: `docs/03-technical-design.md` §2–§3.
