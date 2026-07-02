# iHelp — מבקשים עזרה, העוזרים מגיעים אליכם

Final project for **Internet Technologies — Become a Full-Stack Engineer** (RUNI CS 2026).

iHelp reverses the help-search model: a requester posts a help request, and
identity-verified helpers nearby compete to offer help — paid or volunteer.
Both sides of every transaction pass admin-reviewed identity verification, and
helpers are rated after completion.

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS, Auth, Storage) · Tailwind v4 · Vercel

## Documentation

| Doc | Content |
|---|---|
| [docs/01-product-spec.md](docs/01-product-spec.md) | Product specification — problem, users, customer, goals, processes, state machine, permission matrix |
| [docs/02-architecture.md](docs/02-architecture.md) | Architecture — components, technology choices, data flows, enforcement layers |
| [docs/03-technical-design.md](docs/03-technical-design.md) | Technical design — full SQL schema, every RLS policy, RPC bodies, CRUD, validation, error handling, UX |

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
SECURITY DEFINER functions (ten RPCs) for atomic state transitions — the UI and
server actions only mirror these rules for usability. A crafted API request
carrying a user's JWT hits exactly the same wall. Details: `docs/03-technical-design.md` §2–§3.
