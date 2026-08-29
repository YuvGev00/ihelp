# iHelp — Presentation Guide (10–15 minutes, assignment stage 12)

This is your run-sheet for the final presentation. It covers **every bullet the
assignment (§12) requires**, gives you a **word-for-word talk track**, a
**step-by-step live demo**, an **anticipated-questions cheat sheet**, and a
**pre-flight checklist**. Rehearse against `docs/07-internal-architecture.md`
(§4 decision index, §5 hard questions) for the deep answers.

**Live app:** https://ihelp-roan.vercel.app · **Repo:** https://github.com/YuvGev00/ihelp

---

## 0. The 12 things you MUST cover (assignment §12)

Tick each off as you rehearse — every one has a home in the timing table below.

| # | Required (Hebrew) | Where it's covered |
|---|---|---|
| 1 | מה המוצר | Min 0–1 |
| 2 | איזו בעיה הוא פותר | Min 0–1 |
| 3 | מי המשתמשים שלו | Min 1–2 |
| 4 | למה יש לו ערך עסקי | Min 1–2 |
| 5 | איך המערכת בנויה | Min 7–9 |
| 6 | מה הארכיטקטורה | Min 7–9 |
| 7 | איך נראה בסיס הנתונים | Min 9–10 |
| 8 | מהם התהליכים המרכזיים | Min 2–7 (demo) |
| 9 | אילו בדיקות כתבתם | Min 10–11 |
| 10 | איך חשבתם על סקייל | Min 11–12 |
| 11 | איך חשבתם על אבטחה | Min 12–13 |
| 12 | מה הייתם משפרים אם היה עוד זמן | Min 13–14 |

The assignment's key instruction: *"imagine a job interview — you must understand
the product inside and out and defend every decision."* So the goal is not to
show features, it's to show **why each decision is the right one**. Every time you
show something, follow it with a "we chose X because Y" sentence.

---

## 1. Timing (target 13 min + 2 min Q&A buffer)

| Min | Segment | §12 bullets |
|---|---|---|
| 0–1 | **The problem + the product** | 1, 2 |
| 1–2 | **Users + business value** | 3, 4 |
| 2–7 | **Live demo — the full core loop** | 8 |
| 7–9 | **How it's built + architecture** | 5, 6 |
| 9–10 | **The database** | 7 |
| 10–11 | **Tests** | 9 |
| 11–12 | **Scale** | 10 |
| 12–13 | **Security** | 11 |
| 13–14 | **What I'd improve with more time** | 12 |
| 14–15 | **Q&A** | — |

If you're running long, the demo (min 2–7) is where to trim — cut step 7 and 8
first; never cut the assign→complete→rate spine.

---

## 2. What to SAY at each step (talk track)

### Min 0–1 — The problem + the product  *(§12: 1, 2)*
> "Finding trustworthy, available help is slow and one-directional — you search,
> compare, and call around, and providers don't even see that you need help.
> **iHelp reverses that.** You post one request, and identity-verified helpers
> near you *compete* to help — for pay or as volunteers. When it's done, you rate
> them. The reversal is the whole idea: demand is published once, and supply comes
> to it."

Open on the **landing page** or the **feed**. One sentence, then move on — don't
linger.

### Min 1–2 — Users + business value  *(§12: 3, 4)*
> "One account type — the same person can request in the morning and help in the
> afternoon; permissions are per-row, not per-account. Three roles show up:
> **requester**, **verified helper** (optionally with a reviewed professional
> badge), and **admin**. The **customer** — the side we'd monetize — is the
> professional helper: iHelp is lead-generation, delivering nearby ready-to-buy
> demand. Requesters are free by design, because charging demand would kill the
> liquidity that makes the platform valuable to supply. And trust is **symmetric**
> — a fake request can lure a helper as easily as a fake helper can harm a
> requester — which is why *both* sides pass admin-reviewed identity verification."

### Min 2–7 — Live demo  *(§12: 8 — central processes)*
See the full script in §3 below. This is the heart; rehearse it until it's muscle
memory.

### Min 7–9 — How it's built + architecture  *(§12: 5, 6)*
Show `docs/07-internal-architecture.md §1` (the one-screen diagram) or draw it.
> "Three tiers, deliberately few moving parts: a Next.js App Router app on Vercel
> — Server Components for reads, Server Actions for writes, **no separate API
> server** — talking to Supabase: Postgres with Row Level Security, Auth, and
> Storage. The thesis of the whole project is **the database is the only
> authority**. Every permission is enforced in Postgres — RLS policies, plus
> eleven SECURITY DEFINER functions for the things RLS can't express, plus
> column-guard triggers. The UI and server code repeat those checks only for a
> nice error message; nothing depends on them for safety. That's why the app never
> uses the service-role key — even admin actions run as the signed-in user."

The one decision to be proud of out loud: **the `profiles` split**. "RLS is
row-level, not column-level. If a user's phone and home coordinates lived in the
broadly-readable profile row, any signed-in user could read them. So we split
private columns into their own table — the contact reveal is the only path in."

### Min 9–10 — The database  *(§12: 7)*
Open `supabase/migrations/0002_tables.sql` and `0006_policies.sql` side by side.
> "Seven tables. The state machine is an enum plus one timestamp column per state
> — `open → has_offers → assigned → completed → rated`, plus cancelled. Here's a
> table, here's its RLS policy, and here's the comment explaining exactly which
> product rule it enforces. Every policy carries its justification, because the
> assignment is about defending decisions."

Point at one concrete policy, e.g. `offers_select` (sealed bids: only the offer's
owner and the request's owner can read it).

### Min 10–11 — Tests  *(§12: 9)*
> "62 automated tests. The interesting ones are the **integration tests that
> attack the database as the wrong user** — they *try* the forbidden action and
> assert it's denied. For example, a test where a user tries to make themselves
> admin, and one for the assign-vs-withdraw race. Plus a Playwright end-to-end
> test that drives the entire core loop through the real UI in two browser
> sessions." Show `npx vitest run` output (61 passed) or the `tests/integration/`
> permission tests, and mention the E2E.

### Min 11–12 — Scale  *(§12: 10)*
> "At tens-to-hundreds of users it's comfortable. The heaviest read is the feed —
> we fetch a capped 200 open requests and compute distance in TypeScript with the
> Haversine formula, no PostGIS, no paid maps. That's the deliberate trade: zero
> geo-infrastructure now, and the named successor is DB-side distance with keyset
> pagination when the cap becomes visible. What breaks *first* isn't the DB — it's
> the human admin verification queue, and I say so honestly. Every limit in the
> scale doc has a named successor."

### Min 12–13 — Security  *(§12: 11)*
> "Four enforcement layers, and only the last is trusted: middleware, UI, server
> guards, and the database. The anon key is public **because** RLS is the
> authority — leaking it grants nothing beyond what any signed-up user already
> has. The service-role key is in zero lines of app code. And I keep an honest
> list of remaining risks — for instance, identity verification is manual admin
> review, not government-grade proofing, and request coordinates are readable by
> signed-in users. Owning the limitations is part of the design." Mention the one
> real bug the review caught and fixed: an offer could be inserted with a
> pre-set final price — closed by migration 0013 with a regression test.

### Min 13–14 — What I'd improve  *(§12: 12)*
> "In-app chat between the matched pair — right now they exchange phone numbers;
> keeping it on-platform gives an audit trail, and it's a clean RLS table. SMS OTP
> to actually verify the phone. In-app notifications so you don't have to poll.
> And requester-side reputation, to close the trust symmetry fully. All of these
> were deliberate cuts to keep the MVP small, clean, and secure."

---

## 3. The live demo — step by step (min 2–7)

**Setup (do this BEFORE you present — see the checklist in §5):**
- **Two separate browsers** (e.g. Chrome + Firefox), OR **one normal window +
  one incognito window**. Do **not** use two tabs in the same window — they share
  the login cookie and the sessions will fight. This is the single most important
  setup detail.
  - **Window A = Dana** (`dana@ihelp.demo`) — the requester.
  - **Window B = Yossi** (`yossi@ihelp.demo`) — a verified professional helper.
- A **third tab (or the admin browser) = the admin** (`admin@ihelp.demo`), parked
  on `/admin`.
- Password: the demo password (in `.env.local` as `CLOUD_SEED_PASSWORD`).
- All three logged in and on their starting pages before you say word one.

**The script** (each step has the click + the one line to say):

1. **[A] The feed** — *"Here's the reversed marketplace from the requester's side:
   open requests near me, sorted by distance, with a live map. These filters are
   just URL state."* Point at the distance chips and the map pins. **(20s)**

2. **[A] Post a request** — click **בקשת עזרה חדשה**. Fill title + description,
   pick a category, attach a photo, confirm the location on the map. *"The photo
   uploads straight from the browser to storage — the server never carries the
   file bytes. Location is confirmed on the map; no paid geocoding."* Publish →
   land on the detail page, status **פתוחה**, and point at the **lifecycle
   timeline** at the top. *"This timeline is the state machine, made visible."*
   **(60s)**

3. **[B] Make an offer** — Yossi opens the same request and submits an offer.
   Show the **three-stance pricing picker**: מחיר קבוע / מחיר ייקבע לאחר העבודה /
   בהתנדבות. Pick **fixed at ₪120**. *"Helpers dictate the price — three stances,
   because a plumber often can't quote before seeing the problem. And it's
   sealed-bid: Yossi never sees competing offers."* **(30s)**

4. **[A] Compare + assign** — Dana refreshes; status is now **יש הצעות**. Show the
   **offer-comparison workbench**: the summary line, the **sort/filter controls**,
   and each offer's **explicit stance label**. *"This is the climax — supply
   competing, demand choosing. I can sort by price or rating and see fixed vs
   volunteer vs after-job at a glance."* Click **בחירה בהצעה זו** → confirm. *"That
   assignment is one atomic database function — it picks this offer and closes all
   the others in a single transaction, so there's never a half-finished state."*
   Point at the **contact card** that just appeared: *"The phone number is revealed
   now, and only to these two people — never before, never to anyone else."*
   **(75s)**

5. **[A + B] Dual completion** — both press **אישור שהעזרה הושלמה**. Do A first:
   show the *"waiting for the other side"* state; then B — now it flips to
   **completed**. *"Neither side can close the job alone — the request only
   completes when both confirm. That's the fairness mechanism."* **(45s)**

6. **[A] Rate** — Dana rates 5 stars + a note → status **דורגה**. Then open
   **Yossi's helper profile**. *"And here's the payoff of the trust layer — a real
   reputation page: completed-jobs count, the categories he works in, a
   star-distribution histogram, and each review with its context. Notice it never
   shows *who* rated him — that anonymity is enforced by a database view."* **(40s)**

7. **[Optional — newest feature] After-job final price** — on a seeded request
   where the offer was **מחיר ייקבע לאחר העבודה**, the completed request shows the
   **קביעת המחיר הסופי** panel; the helper enters the amount and the price chip
   flips from *מחיר ייקבע בסיום* to the final ₪. *"Even the after-the-job pricing
   stance is closed properly, with its own guarded function."* **(15s)**

8. **[Admin] Verification + moderation** — switch to the admin tab: show the
   pending verification queue (Noa's identity application — name, phone,
   self-description, and her ID document via a signed URL), approve it, then
   glance at the request hide/unhide list. *"Admins act through their own
   locked-down functions — they approve applications and hide requests, but can't
   touch arbitrary data. And once Noa is approved she can transact — both sides of
   every deal have passed a human review."* **(40s)**

9. **[Mobile flourish, optional]** — on a phone (or a narrow window), show the
   **bottom tab bar** and the **↗ שיתוף** share button popping the OS share sheet;
   mention it's an **installable PWA** ("Add to Home Screen"). *"The same web app
   installs and feels native on a phone — no separate app."* **(20s)**

**If the live demo misbehaves:** have the **E2E recording** ready to play
(`npx playwright test --trace on`, open the trace) — it replays this exact loop.
Record it the day before so you always have a fallback.

---

## 4. Anticipated questions — quick answers

Keep these one-liners ready; they're the "job interview" moments.

- **"Why Server Actions and no REST API?"** — Every mutation is a typed Server
  Action; there's no public API surface to enumerate or secure, and no third party
  needs to call us programmatically. Less surface, same power.
- **"How do you stop a user reading someone else's data?"** — RLS on every table;
  the private columns (phone, coordinates) live in a separate own-row-only table;
  the contact reveal is a single narrow function. A crafted API call hits the same
  policies with only the caller's own JWT.
- **"Why is the public anon key safe to ship?"** — Because RLS is the authority.
  The key only lets you *attempt* queries; the database decides what you actually
  get, per-row, as yourself.
- **"What if two people act at once — race conditions?"** — The pivotal writes
  (assign, complete) are single atomic database functions with row locks and
  guarded updates, and I have a test for the assign-vs-withdraw race.
- **"Why no PostGIS / real maps?"** — Haversine in ~15 lines of TypeScript is
  enough at city scale, keeps the deploy self-contained, and has a named successor
  (DB-side distance) for when scale demands it. OpenStreetMap tiles are the one
  third-party runtime dependency — display-only, keyless, and if they fail the app
  still works.
- **"Is verification real?"** — It's manual admin review, honestly weaker than
  government-grade proofing; I document that openly and name SMS OTP as the
  roadmap. But it's symmetric — both sides pass it.
- **"What was hardest?"** — see §5.
- **"Is there a native app?"** — No, and it's not required: the assignment mandates
  a web app reachable by URL. It *is* an installable PWA, which is a bonus.

## 5. The three "what was hard" stories (have one ready)

1. **The `profiles` split** — realizing RLS genuinely can't slice columns, and
   rebuilding the data model so private fields (phone, coordinates, is_admin) live
   in an own-row-only table. This is the strongest one to tell.
2. **The least-privilege grants** — the local Supabase image shipped tables with
   *no* DML grants; rather than paper over it, I pinned explicit least-privilege
   grants in a migration and ended up more secure than the platform default.
3. **The offer final-price bypass** — a review found a helper could insert an offer
   with a pre-set final price, defeating the after-job flow. Closed in migration
   0013 with `final_price is null` pinned at insert, plus a regression test.

---

## 6. Pre-flight checklist (the day before + right before)

**The day before:**
- [ ] Confirm the live site loads: https://ihelp-roan.vercel.app
- [ ] Confirm the Supabase project is **not paused** (the keep-alive cron should
      handle this, but check) and the demo data is seeded.
- [ ] Record the **E2E fallback**: `npx playwright test --trace on`, keep the trace.
- [ ] Rehearse the demo end-to-end once, out loud, timed.
- [ ] Re-read `docs/07-internal-architecture.md` §4 (decisions) + §5 (hard Qs).

**Right before you present:**
- [ ] **Two separate browsers** (or normal + incognito), NOT two tabs.
- [ ] Window A logged in as **Dana**, Window B as **Yossi**, admin tab as **admin**.
- [ ] Each window on its starting page (A on the feed, B on the feed, admin on
      `/admin`).
- [ ] Zoom the browser to ~110–125% so the audience can read Hebrew text.
- [ ] Have `0002_tables.sql`, `0006_policies.sql`, and the internal-architecture
      doc open in your editor for the architecture/database segments.
- [ ] Phone ready (or a narrow window) if you'll do the mobile flourish.

**After the presentation:**
- [ ] Rotate or delete the demo accounts / password (security risk R9).

---

## 7. One-line summary to open or close with

> "iHelp reverses the search for help — you post once and verified neighbors
> compete to help you — and every line of it is built so the database itself is
> the thing that enforces trust. Small, clean, working, secure."
