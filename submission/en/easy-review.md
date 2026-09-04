# iHelp — Easy-Review Guide (what I built and how to check it)

**Internet Technologies — Become a Full-Stack Engineer · RUNI CS 2026**

This document is intended for a reviewer who did not watch a live presentation. It briefly explains **what I built**, and provides a **~5-minute review path** to confirm that the product works — with no need to install anything.

- **Live site:** https://ihelp-roan.vercel.app
- **Code repository:** https://github.com/YuvGev00/ihelp

---

## 1. What iHelp is (in one line)

**A reverse help marketplace.** Instead of someone who needs help searching for a professional and calling around, they **post a single request**, and verified helpers in their area **compete** with offers to help — whether paid or volunteer. The requester chooses an offer, both sides confirm the work was done, and the requester rates the helper.

**The core technical idea:** *the database is the single source of authority.* Every permission rule is enforced in PostgreSQL (RLS + SECURITY DEFINER functions + triggers) — not in the site's code. Even a request that bypasses the interface is blocked at the database.

---

## 2. Quick access (demo accounts)

All demo accounts on the live site use the password **`12345678`**:

| Email | Role | Why it's useful for review |
|---|---|---|
| `dana@ihelp.demo` | Requester (verified) | Post a request, choose an offer, rate |
| `yossi@ihelp.demo` | Professional helper (verified + badge) | Submit an offer on a request |
| `admin@ihelp.demo` | Admin | Approve identity verifications, hide requests |
| `noa@ihelp.demo` | Not verified | See the verification gate that blocks actions |

> **Tip:** To play a requester and a helper simultaneously, use **two separate browsers** (or a regular window + a private window) — not two tabs in the same window, because they share the login cookie.

**Is the site awake?** The database on Supabase's free tier may "fall asleep" after a few days of inactivity. Quick check: open https://ihelp-roan.vercel.app/api/health — if you get `{"ok":true,"db":"reachable"}` everything is live. If not — you need to wake it up through the Supabase dashboard and wait 1–2 minutes.

---

## 3. 5-minute review path (the core loop)

This is the product's core flow. You can go through all of it on the live site:

1. **Log in as the requester** — `dana@ihelp.demo` / `12345678`.
2. **Post a request** — click "New help request" (`/requests/new`), fill in a title, description, category, confirm location, and post. *An image is not required* — you can post without one. The request will go live with status "Open".
3. **Log in as the helper** (in a second browser) — `yossi@ihelp.demo` / `12345678`, open the same request and submit an offer (choose a pricing stance: fixed price / volunteer / price after the work). The helper **does not see** competing offers.
4. **Selection** — go back to Dana's browser, refresh (the status is now "Has offers"), open the offer-comparison workbench, and choose the offer. The assignment is atomic — it closes all the other offers in a single transaction. Now the phone numbers are revealed to the two parties only.
5. **Two-sided confirmation** — both parties click "Confirm the help was completed". Only when both have confirmed does the request move to "Completed".
6. **Rating** — Dana gives the helper a rating. His public reputation page updates — without revealing who rated.

**Bonus — the verification gate:** log in as `noa@ihelp.demo` (not verified) and try to post a request — you will be redirected to the verification page. This demonstrates that permissions are enforced, not just hidden.

---

## 4. Where everything is in the code (quick map)

| Area | Where | What's there |
|---|---|---|
| Database | `supabase/migrations/*.sql` | 15 migrations: 7 tables, RLS, 11 RPC functions, triggers — **the source of truth** |
| Writes | `actions/*.ts` | Server Actions: create request, offer, assignment, completion, rating, admin, verification |
| Reads + validation | `lib/` | Supabase clients, zod schemas, distance math (Haversine), Hebrew strings |
| Pages | `app/` | Next.js App Router — feed, request page, helper profile, admin, verification |
| Components | `components/` | Forms, maps, offer-comparison workbench, timeline |
| Tests | `tests/`, `e2e/`, `*.test.ts` | 62 Vitest tests + one Playwright E2E test = 63 in total |

---

## 5. Where each assignment requirement is met

| Requirement | Where to see it |
|---|---|
| Product specification document | `docs/product-spec.md` |
| Technical design | `docs/technical-design.md` |
| Testing specification | `docs/testing-spec.md` |
| Test code | `tests/`, `e2e/`, `lib/*.test.ts` |
| Basic scale | `docs/scale.md` |
| Basic security | `docs/security.md` |
| Running locally | `README.md` ("Running locally" section) |
| Live site | https://ihelp-roan.vercel.app |
| GitHub repository | https://github.com/YuvGev00/ihelp |

**Additional documents for deeper reading:** `docs/architecture.md` (architecture),
`docs/internal-architecture.md` (internal guide + decision log),
`docs/file-reference.md` (every file in the project),
`docs/course-concepts-map.md` (each course topic → how it was implemented, why, and where in the code).

---

## 6. Three points worth noting

1. **The database enforces everything.** Not the code. There are 62 tests, of which 15 impersonate the wrong user and verify that the database **rejects** them. This is the core security claim.
2. **One account, multiple roles.** There is no separate "requester account" and "helper account" — the same person can request and help. Permissions are attached to rows, not to the account.
3. **Deliberate cuts.** There are no real payments (only recording a price + marking "paid"), no chat, no PostGIS — all of these are conscious decisions in favor of a small, clean, secure MVP. The rationale is documented in `docs/product-spec.md §10`.
