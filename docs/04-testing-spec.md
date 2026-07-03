# iHelp — Testing Specification

**Course:** Internet Technologies — Become a Full-Stack Engineer, RUNI CS 2026
**Document:** 4 of 6 (Testing, assignment stages 6–7)
**Depends on:** `01-product-spec.md` (rules under test), `03-technical-design.md` (mechanisms under test)

---

## 1. Testing Philosophy — what "it works" means here

iHelp's central claim is not "the buttons work" — it is that **the database
enforces every rule in the product spec's §9.2 permission matrix, even against
callers that skip the UI entirely**. The test suite is therefore weighted
accordingly (assignment: "test the central processes, not every line"):

1. **The highest-value tests talk to a real PostgreSQL** (local Supabase) with
   real JWTs, attempting both the allowed action *and its forbidden twin*. A
   permission test that only checks the happy path proves nothing; every RLS
   test here asserts *denial* too — spec §13.2 makes exactly this a success
   criterion.
2. **Pure logic gets unit tests** — cheap, fast, no environment.
3. **UI gets a thin layer**: component render tests for shared vocabulary and
   one end-to-end pass over the core marketplace loop, because the loop working
   in a browser is the product working.

What is deliberately *not* tested: styling, static pages' content, Next.js
framework behavior, and Supabase's own auth internals — none of these are our
logic.

## 2. Test Layers, Tools, and Where They Run

| Layer | Tool | Environment | Files |
|---|---|---|---|
| Unit — pure logic | Vitest | Node, no DB | `lib/geo.test.ts`, `lib/validation/*.test.ts`, `lib/errors.test.ts` |
| Component — shared UI | Vitest + React Testing Library (jsdom) | No DB | `components/ui.test.tsx` |
| **Integration — RLS / RPC / state machine** | Vitest + `@supabase/supabase-js` | **Local Supabase** (`npx supabase start`) | `tests/integration/*.test.ts` |
| End-to-end — core loop | Playwright | Local Supabase + `next dev` | `e2e/core-flow.spec.ts` |

Integration and E2E tests **skip automatically** when no local stack is
detected (`SUPABASE_URL` absent), so `npm test` always passes in a bare
checkout while the full suite runs where it matters.

## 3. What Is Tested and Why (assignment stage-6 checklist)

### 3.1 Central features & business processes (integration + E2E)

The full request lifecycle, exercised through real clients as real users:

| # | Scenario | Proves |
|---|---|---|
| F1 | Verified user creates a request via `create_request_with_photos` (with an uploaded photo) → status `open`, photos attached | The only write path into `help_requests` works and enforces its invariants |
| F2 | Second verified user submits an offer → request flips to `has_offers` (trigger T2) | Offer flow + automatic status sync |
| F3 | Owner calls `assign_offer` → request `assigned`, chosen offer `selected`, competitor offer `closed` | The atomic pivotal moment, including competitor closure |
| F4 | Both sides call `confirm_completion` → flags set per caller; status flips to `completed` only after the second call | Dual-sided completion semantics |
| F5 | Owner calls `submit_rating` → rating row exists, request `rated`, helper aggregate visible via `helper_ratings` | Rating + atomic terminal transition |
| F6 | Owner calls `cancel_request` mid-flow → request `cancelled`, live offers `closed` | The terminal escape hatch |
| F7 | Withdraw last active offer → request returns to `open` | The has_offers↔open cycle |
| E2E | The F1–F5 chain driven through the real UI by two browser sessions | The product works as users experience it |

### 3.2 Permission tests — different users attempting forbidden actions (integration)

One test per §9.2 matrix row that could be abused, always asserting **denial**
(error or zero-row result — the silent-denial pattern):

| # | Forbidden action attempted | Expected |
|---|---|---|
| P1 | Unverified user calls `create_request_with_photos` | `forbidden` |
| P2 | Unverified user inserts an offer directly | RLS insert denial |
| P3 | Helper offers on their **own** request | RLS insert denial |
| P4 | Offer inserted born `selected` | RLS insert denial (status pin) |
| P5 | Non-owner reads someone else's offer (sealed bids) | zero rows |
| P6 | Stranger reads an `assigned` request they're not party to | zero rows |
| P7 | Non-owner calls `assign_offer` / `cancel_request` | `not_found` (existence-safe) |
| P8 | Helper calls `submit_rating`; stranger calls `confirm_completion` | `not_found` |
| P9 | Owner PATCHes `status`/`is_paid` directly (crafted update) | guard-trigger `forbidden` / zero rows |
| P10 | User PATCHes own `is_identity_verified` / `is_admin` | guard-trigger `forbidden` |
| P11 | User reads another user's `profiles_private` row (phone/home coords) | zero rows |
| P12 | Non-party calls `get_counterpart_contact` | `not_found`; parties succeed only from `assigned` |
| P13 | Non-admin calls `review_application` / `set_request_hidden` / `revoke_verification` | `forbidden` |
| P14 | User inserts an application with `status='approved'` (forged audit row) | RLS insert denial |
| P15 | Anonymous (no JWT) reads any table / `helper_ratings` view | denial / zero rows |

### 3.3 Database tests (integration)

Constraints and triggers as the last line of defense:

| # | Case | Expected |
|---|---|---|
| D1 | Second *active* offer by same helper on same request | unique-index violation |
| D2 | Second application of same kind while one is pending | partial-unique violation |
| D3 | Priced offer on a volunteer request / offer price out of bounds; free offers allowed anywhere | policy/CHECK denial |
| D4 | Second rating for the same request | PK violation |
| D5 | Professional application without a document | CHECK violation |
| D6 | Signup trigger creates `profiles` + `profiles_private` rows | rows exist |
| D7 | `helper_ratings` view exposes stars/note but **no** `rater_id`/`request_id` | column absence |
| D8 | Identity revocation clears both flags and revokes pending professional applications | flags false, applications `revoked` |

### 3.4 Invalid-input tests (unit, zod schemas)

Every schema rejects what the DB would reject — same bounds, friendlier
message: title/description/message length bounds, bad phone formats, stars
outside 1–5, offer-price bounds, photo count 0 and 6, **absent
location (the (0,0) "Null Island" regression)**, absent optional fields
arriving as `null` (the FormData regression class found in review).

### 3.5 Edge cases (integration)

| # | Case | Expected |
|---|---|---|
| X1 | `assign_offer` on a just-withdrawn offer | `offer_not_active`, transaction rolled back — request still `has_offers` |
| X2 | `confirm_completion` called twice by the same side | idempotent — still waiting for the other side |
| X3 | `mark_paid` on volunteer request / before completion / twice | `invalid_state` |
| X4 | Approving a professional application after identity was revoked | `invalid_state` |
| X5 | Rejection without a note | `note_required` |
| X6 | Photo paths pointing at another user's folder / nonexistent objects | `forbidden` / `photo_not_uploaded` |

### 3.6 Basic UI tests (component + E2E)

Component: `Stars` (aggregate rendering + empty state), `StatusChip` /
`PaymentChip` (Hebrew labels per status), `Badge` (verified/professional
combinations). E2E asserts the Hebrew RTL shell renders, forms submit, and the
lifecycle panels appear for the right role at the right state.

## 4. Test Data Strategy

Integration tests are **self-contained**: each run creates its own throwaway
users via the local stack's admin API (allowed: local tooling), promotes one to
admin by direct SQL, and builds its fixtures through the same RPCs users would
call. No dependence on `scripts/seed.ts` (which serves the demo, not the
suite). E2E uses the seed script's known accounts.

## 5. Running

```bash
npm test                    # unit + component (+ integration when stack is up)
npx supabase start          # local stack for integration/E2E
npm run test:e2e            # Playwright core-flow spec (starts next dev itself)
```

## 6. Success Criteria for the Suite

The suite fulfills spec §13.2 ("every permission … demonstrated by tests that
attempt forbidden actions and observe denial") when every §3.2 row runs against
the real database and fails **closed** — and the F-chain proves the happy path
end to end.
