# iHelp — Basic Scale

**Course:** Internet Technologies — Become a Full-Stack Engineer, RUNI CS 2026
**Document:** 5 of 6 (Scale, assignment stage 8)
**Grounded in:** the deployed implementation (numbers below are the real constants in the code)

---

## 1. The Scale Envelope This MVP Targets

iHelp is designed for a **single pilot area with tens of active users and
hundreds of requests** (product spec §14). Every mechanism below is chosen to be
*correct and simple* inside that envelope, with a named successor for when the
envelope breaks. That is the honest trade this document defends: no premature
infrastructure, no silent cliffs — each limit is known, bounded, and monitored
by an explicit signal.

## 2. What Happens at Tens → Hundreds of Users

| Load source | At 10s of users | At 100s of users | First thing to break |
|---|---|---|---|
| Feed (`/requests`) | Trivial: one indexed SELECT, ≤ 200 rows, in-memory sort | Still fine: the fetch is **capped at 200 rows** regardless of table size | Requests beyond the newest 200 stop appearing in the feed (see §5) |
| Request detail | 4–6 single-key reads + one bulk signed-URL call | Same — all keyed by `request_id` | Nothing until offers-per-request grow unusually large |
| Writes (offers, transitions) | Single-row RPCs with row locks | Row locks serialize only *per request* — different requests never contend | Hot single request with many simultaneous offers (acceptable: inserts don't take the request lock; only assign/cancel/complete do) |
| Auth/session | Middleware refresh per request | Supabase Auth scales independently of us | — |
| Admin review queue | Human-bound, not machine-bound | **The manual queue is the product's real bottleneck** (spec §14) — a staffing problem before a technical one | Queue latency, visible in `idx_applications_queue` |
| Storage | ≤ 5 MB/object, ≤ 5 photos/request | Linear growth, CDN-served signed URLs | Orphaned objects accumulate (§7) |

Postgres itself (Supabase's smallest tier) handles this envelope with orders of
magnitude to spare; the interesting limits are all in *our* choices, listed in §7.

## 3. Heavy Queries and the Indexes That Serve Them

Every recurring query has a matching index (migration `0003_indexes.sql`);
none of them require a table scan at any realistic size:

| Query (page) | Shape | Index |
|---|---|---|
| Feed | `status in (open,has_offers) and not is_hidden order by created_at desc limit 200` | `idx_requests_browse (status, is_hidden, created_at desc)` |
| My requests | `requester_id = ? order by created_at desc` | `idx_requests_owner` |
| Offers on a request (detail) | `request_id = ? and status='active'` | `idx_offers_request` (partial on active) |
| My offers | `helper_id = ? order by created_at desc` | `idx_offers_helper` |
| Photos of a request | `request_id = ? order by position` | `idx_photos_request` |
| Helper rating aggregate | `helper_id = ?` on `ratings` / the view | `idx_ratings_helper` |
| Admin queue | `status='pending' order by created_at` | `idx_applications_queue` (partial on pending) |

The two partial indexes are deliberate: they stay small (only live rows) and
double as documentation of the hot predicates.

**The one query that cannot be pushed to the database today** is distance
ordering: Haversine is computed in TypeScript (`lib/geo.ts`), so the DB cannot
`ORDER BY distance`. The mitigation is the cap (§5); the successor is a SQL
Haversine expression — no PostGIS needed — computed over an indexed
bounding-box prefilter.

## 4. Avoiding Over-Fetching

- **Column lists, not `*`, on every list query** (feed, offers, my-*, admin,
  ratings) — the feed ships 7 columns per row, not the row. The single-row
  request-detail read uses `*` deliberately: one row, most columns render.
- **Reads are Server Components**: the browser receives rendered HTML, never
  raw rows — coordinates in particular stay server-side (architecture §8.1).
- **Photos load per page, not per table**: only the first photo of the 12
  visible cards is fetched and signed (one bulk `createSignedUrls` call), not
  every photo of every request.
- **Rating aggregates are computed per page** over only the helpers actually
  rendered (`in (helperIds)`), not globally.

## 5. Pagination — Where It Is Real and Where It Is Honest

- **Feed:** fetch capped at **200 newest matching rows** → Haversine-sort in
  memory → serve **12 per page** via URL param (`?page=N`). Back/forward and
  sharing work because the URL is the state. The honest limitation: a request
  older than the newest 200 in its filter drops out of the feed even if it is
  close by. At MVP scale (hundreds of *total* requests, most not open) the cap
  is far above reality; the moment it becomes visible, the successor is
  **DB-side distance ordering + keyset pagination** (order by a SQL Haversine
  expression, paginate by `(distance, id)` cursor) — a migration-sized change
  isolated to one query, which is exactly why the cap was acceptable now.
- **My requests / my offers / admin lists:** unpaginated by design — they are
  per-user (or per-admin) lists measured in dozens; adding pagination there
  would be UI complexity with no load benefit. The admin moderation list is
  capped at the newest 50.

## 6. Client/Server Separation Under Load

The separation was chosen for security, but it is also the scaling story:

- **All reads happen server-side** (RSC) close to the DB; the client never
  polls, never holds a cache to invalidate, and re-fetches only on navigation
  or after its own mutation (`revalidatePath`).
- **All writes are single round-trips** (Server Action → one RPC/one statement).
- **The only browser↔Supabase traffic is file upload** — deliberately, so
  multi-MB payloads never transit the Next.js server (architecture §5). Uploads
  scale with Supabase Storage, not with our functions.
- **The one third-party runtime dependency is OpenStreetMap raster tiles** —
  display-only, keyless, free; a tile-server outage degrades to a blank map
  square, never breaks a flow. The browser fetches tiles directly from the OSM
  tile CDN, so map traffic adds zero load to our servers or the DB.
- Vercel serverless concurrency scales horizontally per request; nothing in the
  app holds cross-request state, so there is no coordination cost.

## 7. Current Limits (Known, Bounded, Accepted)

| # | Limit | Bound / signal | Accepted because |
|---|---|---|---|
| 1 | Feed cap 200 before distance sort | Feed misses older open requests; signal: open-request count approaching 200 | MVP scale is far below it; successor isolated to one query |
| 2 | Rating aggregates computed on read | O(ratings-per-helper) per page | Correctness free of update anomalies; denormalized counters (trigger-maintained) are the successor when profiles get hot |
| 3 | Signed URLs generated per page view (request photos, verification docs) | One storage API call per page | 1-hour expiry amortizes browsing; a CDN-cached public bucket is the successor if photo traffic dominates — the public `avatars` bucket already uses that pattern, so profile pictures render with no per-view signing cost |
| 4 | Orphaned storage objects (upload-then-abandon) | Growth ∝ abandoned forms; bounded by 5 MB × 5 | Invisible to users; periodic sweep (list objects, anti-join `request_photos`/`doc_path`) is a 20-line admin script |
| 5 | Manual admin review queue | Human latency; signal: pending-queue age | The trust model *requires* a human in the MVP (spec §4.1); semi-automation (SMS OTP) is the roadmap |
| 6 | No push/realtime — freshness is navigation-time | Users refresh to see new offers | Product decision (spec §10); Supabase Realtime is a drop-in successor on the offers table |
| 7 | Single region (Vercel + Supabase) | Latency for far users | Audience is one country; irrelevant at MVP |
| 8 | No rate limiting on RPCs | Abuse ceiling = per-user data caps (one active offer per request, one open application per kind, 5 photos ≤ 5 MB) | The DB constraints already bound the damage; see security doc §9 for the roadmap |

## 8. What a Larger-Scale Version Would Change (priority order)

1. **DB-side distance + keyset pagination** (removes limit #1) — SQL Haversine
   with a lat/lng bounding-box prefilter; no PostGIS required until city-scale
   becomes country-scale.
2. **Trigger-maintained rating aggregates** on `profiles` (removes #2) — the
   write path already runs through one RPC, so the counter update is one line
   in `submit_rating`.
3. **Supabase Realtime on `offers`/`help_requests`** (removes #6) — the schema
   is already event-shaped (status enums, timestamps).
4. **Storage lifecycle job** (removes #4) and image resizing (thumbnails for
   feed cards instead of full photos).
5. **Rate limiting** at the edge (middleware token bucket per user) and on
   auth endpoints (Supabase's built-ins configured stricter).
6. **Admin tooling**: queue SLAs, bulk review, audit log table — the
   `verification_applications` audit trail already stores the data.
7. **Read scaling** (only if needed): Supabase read replicas; the app's reads
   are already stateless and per-request, so pointing RSC reads at a replica is
   configuration, not redesign.

The through-line: every successor above is *additive* — none requires undoing a
decision, because the boundaries (RPC write path, server-side reads, URL state)
were drawn where the scale seams are.
