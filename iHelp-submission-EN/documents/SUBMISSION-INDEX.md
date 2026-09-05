# iHelp — Submission Index

**Internet Technologies — Become a Full-Stack Engineer · RUNI CS 2026**
**Final submission · deadline 6 September 2026**

This folder contains everything required by the assignment's "What to submit"
list. Each of the 10 required items is mapped below to where it lives.

> A Hebrew version of every document in this folder is in the sibling
> `../he/` folder. Code, SQL, and identifiers stay in English in both.

---

## The 10 required submission items

| # | Required item | Where it is |
|---|---|---|
| 1 | **Link to the live app (Vercel)** | https://ihelp-roan.vercel.app |
| 2 | **Link to the GitHub repository** | https://github.com/YuvGev00/ihelp *(public)* |
| 3 | **Product specification document** | [`product-spec.md`](product-spec.md) |
| 4 | **Technical design document** | [`technical-design.md`](technical-design.md) |
| 5 | **Testing specification document** | [`testing-spec.md`](testing-spec.md) |
| 6 | **Test code** | In the repo: `tests/`, `e2e/`, `lib/*.test.ts` — 62 Vitest + 1 Playwright E2E (see item 5 for the map) |
| 7 | **Basic scale document** | [`scale.md`](scale.md) |
| 8 | **Basic security document** | [`security.md`](security.md) |
| 9 | **Local-run instructions** | [`README.md`](README.md) (section "Running locally") |
| 10 | **"Easy review" document** | [`easy-review.md`](easy-review.md) — what was built + a 5-minute review path. |

---

## Live-demo access

The six seeded demo accounts on the live site all use the password `12345678`:

| Email | Role |
|---|---|
| `admin@ihelp.demo` | Admin — reviews verifications, moderates |
| `dana@ihelp.demo` | Requester (identity-verified) |
| `yossi@ihelp.demo` | Helper — verified **+ professional badge** |
| `rina@ihelp.demo`, `amir@ihelp.demo` | Helpers (identity-verified) |
| `noa@ihelp.demo` | Unverified — shows the verification gate |

> For a two-account demo (requester + helper at once), use **two separate
> browsers**, not two tabs — they share the login cookie.

---

## What else is in the repository (beyond the required list)

The submission list above is complete. For depth, the repo also includes:

| Doc | Content |
|---|---|
| `docs/architecture.md` | Architecture — components, technology choices, data flows, enforcement layers |
| `docs/internal-architecture.md` | Internal guide — repo tour, core flow, decision index |
| `docs/project-walkthrough.md` | Follow-along guide — setup, "is it up?" checks, core flow |
| `docs/file-reference.md` | Every source file's purpose & implementation |
| `docs/course-concepts-map.md` | Every taught concept → how it was implemented, why, and where in the code |

---

## The product in one line

> iHelp reverses the search for help — you post one request and verified
> neighbors compete to help you — and every rule is enforced by the database
> itself. Small, clean, working, secure.
