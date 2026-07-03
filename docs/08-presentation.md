# iHelp — Presentation Plan (10–15 minutes, assignment stage 12)

Every required bullet from the assignment appears below with its minute slot.
Practice against `docs/07-internal-architecture.md` — especially §4 (decision
index) and §5 (hard questions).

## Timing

| Min | Segment | Assignment bullets covered |
|---|---|---|
| 0–1 | **The problem + the product** — finding trustworthy help is slow and one-directional; iHelp reverses it: post a request, verified helpers compete on trust, speed, **and price** (each offer carries the helper's price, or is free) | מה המוצר · איזו בעיה הוא פותר |
| 1–2 | **Users + value** — requesters (free by design), helpers (verified, rated, professional badge), admin; the customer is the professional helper (lead-gen economics); trust is symmetric because physical risk is symmetric | מי המשתמשים · למה יש לו ערך עסקי |
| 2–7 | **Live demo** (script below) — the full core loop with two browsers | מהם התהליכים המרכזיים |
| 7–9 | **How it's built** — one-screen architecture (internal doc §1); "the database is the only authority" thesis; the 10-RPC + RLS + guard-trigger design; why Server Actions and no REST; the profiles split story | איך המערכת בנויה · מה הארכיטקטורה |
| 9–10 | **The database** — show `0002_tables.sql` + `0006_policies.sql` side by side: a table, its policy, its justification comment; the state machine as enums + timestamps | איך נראה בסיס הנתונים |
| 10–11 | **Tests** — the inverted pyramid: 26 integration tests that *attack* the DB as the wrong user; show test P10 (self-admin attempt) and X1 (assign-vs-withdraw race) failing closed; 10-second E2E clip | אילו בדיקות כתבתם |
| 11–12 | **Scale** — the envelope, the 200-cap + Haversine trade, what breaks first (the human queue) and every limit's named successor | איך חשבתם על סקייל |
| 12–13 | **Security** — the four layers; anon key is safe *because* RLS; zero service-role in app code; the honest R1–R10 list (pick R1 + R3 to say aloud — owning limitations reads as strength) | איך חשבתם על אבטחה |
| 13–14 | **With more time** — chat between matched parties, SMS OTP, DB-side distance + realtime offers, requester reputation | מה הייתם משפרים אם היה עוד זמן |
| 14–15 | Q&A buffer | — |

## Demo Script (minutes 2–7, seeded data + two browser windows)

Window A = Dana (requester) · Window B = Yossi (helper, professional badge).
Pre-demo: run `scripts/seed.ts` against the demo instance; log both windows in;
keep `/admin` open in a third tab as the admin.

1. **A:** feed — point at distance sorting ("2.4 ק"מ ממך"), category chips,
   badges on nothing yet. 20 sec.
2. **A:** post a request (photo included — mention direct-to-storage upload).
   Land on the detail page: status **פתוחה**. 60 sec.
3. **B:** open the same request, submit an offer **with a price (₪120)** —
   mention the empty-price = volunteer option, and the sealed-bid note: B will
   never see competitors. 40 sec.
4. **A:** refresh — status **יש הצעות**; the offer cards show badges, rating
   averages, **and price chips side by side — the price competition moment**.
   Assign. Show the contact card appearing (phone revealed only now, only to
   these two) with המחיר שסוכם. 60 sec.
5. **A+B:** both press completion confirm — show the "waiting for other side" /
   "הצד השני אישר" states between clicks. 40 sec.
6. **A:** rate 5 stars → status **דורגה**; open Yossi's profile — the average
   moved. 30 sec.
7. **Admin tab:** show the pending queue (Noa's application with prior-history
   panel), approve; one glance at moderation hide/unhide. 40 sec.
8. **Fallback:** if anything misbehaves live, the E2E recording
   (`npx playwright test --trace on` artifact) replays the exact same loop —
   record it the day before.

## The Three Stories to Tell if Asked "What Was Hard?"

1. **The profiles split** — discovering that row-level security genuinely
   cannot slice columns, and rebuilding the data model around it.
2. **The grants surprise** — the local platform shipped tables with *no* DML
   grants; instead of patching, we pinned least-privilege verb grants in a
   migration and ended up more secure than the platform default.
3. **The zod-null bug class** — a silent failure on the form path (absent
   optional fields arrive as `null`), caught in review, fixed once, regression-
   tested forever.

## Presentation Assets Checklist

- [ ] Demo instance seeded, demo password set via `SEED_PASSWORD`, works in
      incognito (deploy checklist in README)
- [ ] Two browser profiles logged in + admin tab
- [ ] E2E trace recording as fallback
- [ ] `docs/07-internal-architecture.md` §4–§5 rehearsed
- [ ] Rotate/delete demo accounts after the presentation (security R9)
