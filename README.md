# Church Operations Platform

An operations platform for independent churches: which categories the offering
came in under, what each one counted to note by note, what was set aside to the
bucket account, who was present, which departments have reported, and what the
pastor has approved.

Multiple churches share one application and one database, each with its own
records, accounts, roles and configuration. A church user cannot discover or
reach another church through the app. Foursquare TBC in Lagos is the first
church using it, and is not the parent of the others.

**Live:** not deployed yet.

## Where it stands

The domain model and the design are finished. The server starts, connects to a
PostgreSQL database and answers a health check — and that is still the whole of
it, because none of the written routes are mounted yet. The first migration has
been applied and the seed creates two complete churches, so the schema is real
rather than described. The Prisma schema covers every entity, and route,
middleware and domain files exist for authentication and offerings.

The frontend is scaffolded: a Vite + React + TypeScript PWA carrying the theme
tokens, a module that owns the transport, and typed hooks for every offering and
income-category endpoint the server has written. One screen is built on top of
them, Offering Entry — adding a category, counting it note by note, and
finalizing — with every total coming from the server and none typed.

**None of those hooks has ever reached a live endpoint.** No router is mounted,
so `/health` is still the only route that answers, and the request and response
types are transcribed from the server's source rather than confirmed against
traffic. The screen renders and builds; it has never shown a real figure, and
nothing links to it yet, because the screen that lists offerings does not
exist.

On the server, `npx tsc --noEmit` reports one error, and it is deliberate. Signing in has to put
the caller's church into the session token, and the account models do not carry
one yet — that schema change is the next piece of work, now that the decision
behind it is settled. The call is left failing with the reasoning written beside
it rather than papered over. Everything downstream — the scoping middleware and every scoped query — is
finished and waiting on that one value. The running server is unaffected, because
no router is mounted: `npm run dev` still answers `/health`.

| Built                                                                      | Not yet built                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The domain model: entities, computations, state machines, validation rules  | **The scoping that makes the church column mean anything**                   |
| The isolation rules the platform has to meet, written as a specification    | Every screen except Offering Entry, and the sign-in the protected ones wait on |
| A PostgreSQL database, the first migration, and a seed that creates two complete churches | Any church-owned endpoint reachable, so none of the schema is exercised yet |
| A server test harness: vitest, supertest, and the app split from the listener | Any test that touches the database, which waits on a mounted router        |
| A `Church` model, a two-church seed, and a required church column on all 20 church-owned models | Sign-in putting a church into the session, which blocks the rest             |
| Church scoping on every offering and income-category query, and one middleware that resolves the church from the session | The two-church tests that prove the scoping holds                            |
|                                                                            | The church column on the account models — a schema change, no longer a decision |
| The design: 88 screens across five roles, mobile and desktop               | Any route mounted — the written auth and offering routers are not wired in  |
| A fixed visual language: palette, type scale, status chips, touch metrics   | The two-church isolation suite, which needs endpoints to call                |
| Prisma schema, 26 models and 15 enums, covering every entity               | Every screen, and the sign-in the protected ones wait on                    |
| A frontend skeleton: Vite, React, the theme tokens, a PWA shell, the routing | Any proof that a hook and its endpoint agree at run time        |
| The Offering Entry screen: categories, note-by-note counting, server-owned totals, finalize | Offering History, the screen that lists offerings and links into entry |
| Typed offering and income-category hooks, and one module that owns the transport | Auth hooks — nine endpoints written on the server, called by nothing  |
| Route, middleware and domain files for auth, offerings and income categories | Any rate limiting, on sign-in, verification codes or password reset           |
| The money, error and HTTP helpers those files import                       | PDF export, notifications, offline attendance sync                          |
| An Express server that starts and serves `GET /health`                     | Deployment, and the hosting decision it waits on                            |

The written routes predate the move to multiple churches. The column they need
now exists, but scoping every query to it and proving the isolation with
two-church tests comes before any further feature work — retro-fitting that to
endpoints already in use is how a leak ships.

## Running it locally

Needs Node 22 or later. The server serves a health check and nothing else. The
frontend runs and builds, and shows a theme-check page at `/`.

```sh
cd server
npm install
npm run dev             # http://localhost:4000
curl localhost:4000/health   # {"status":"ok"}
```

| Command (in `server/`) | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | nodemon + ts-node against `src/index.ts`            |
| `npm test`             | vitest + supertest against the app, no port bound   |
| `npm run db:migrate`   | `prisma migrate dev`                                |
| `npm run db:seed`      | Loads the two fictional churches                    |
| `npx prisma generate`  | Regenerates the client into `src/generated/prisma`  |

There is still no `build`, no `lint` and no `format` on the server. **`DATABASE_URL`
is now required to start it**: the server connects before it binds the port and
exits if it cannot, because a server that accepts requests and then fails every
query is harder to diagnose than one that never came up. Copy `.env.example` to
`.env` and fill it in. `PORT` defaults to 4000. `JWT_SECRET` is read lazily and
matters only once tokens are signed, but it has no default — a shared fallback
signing secret is worse than a refusal to sign. `CORS_ORIGIN` is the browser
origin allowed to call the server, comma-separated for more than one; left
empty it falls back to the Vite dev server at `http://localhost:5173`, so local
work needs nothing set.

`npm test` needs no database today — the suites exercise the app through
supertest and `/health` deliberately runs no query — but it does need
`server/.env.test` to exist. A test run loads that file and never `.env`, and
throws on startup if it is missing, because the fallback is what would let the
first database-backed suite empty the development database without saying so.
Copy `.env.test.example` to `.env.test` and point `DATABASE_URL` at a database
the suite is allowed to truncate.

```sh
cd frontend
npm install
npm run dev             # http://localhost:5173
```

| Command (in `frontend/`) | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `npm run dev`            | Vite dev server                                                   |
| `npm run build`          | Type-checks the app and the tests, then builds, service worker included |
| `npm run typecheck`      | The app, then the tests and the server types they assert against  |
| `npm run lint`           | oxlint, with warnings failing the run                             |
| `npm test`               | vitest                                                            |

`frontend/tests/` holds the Naira formatting rules, the transport's behaviour
against malformed and hostile failure bodies, the wire shape the real
`presentOffering` produces, the request shapes the client's types promise, the
Offering Entry screen driven through a real DOM, one test that runs against a
live server, and a compile-time contract comparing the client's offering type
with the type the server's own code produces. That last one is checked by
`npm run typecheck` and `npm run build` rather than run by vitest.

Most suites run in Node. A test that needs a browser opts in with
`// @vitest-environment jsdom` as a docblock on its first line, so only the
files that render pay for a DOM.

`npm test` on its own reports **7 files, 262 tests**: the live-server test is
skipped, because a machine with nothing listening would otherwise report an
absence as a failure. Copy `frontend/.env.example` to `.env`, set
`VITE_API_BASE_URL` to the server's address and start the server, and the run
becomes **8 files, 274 tests**:

```sh
VITE_API_BASE_URL=http://localhost:4000 npm test
```

In `frontend/`, `npm run typecheck`, `npm run lint`, `npm run build` and
`npm test` are all green. The contract assertions that used to fail now hold:
the published offering type says what the endpoint has always sent, because the
presenter takes a category's id from the saved row it is already reading, while
the shared total calculation still leaves that id optional so it can serve the
provisional total the device shows while counting. In `server/`,
`npx tsc --noEmit` is red at one line, on purpose, and that one is in the gaps
below.

## Repository layout

```
├── server/              Express + TypeScript API over PostgreSQL with Prisma
│   ├── prisma/
│   │   ├── schema.prisma    Every model, relation and constraint
│   │   ├── migrations/     The applied schema history
│   │   └── seed.ts          Fictional data only: two complete churches
│   └── src/
│       ├── index.ts         App setup and listen, nothing else
│       ├── domain/          Offering rules and their checks
│       ├── lib/             Env, the Prisma client, money, errors, HTTP and auth helpers
│       ├── middleware/      authenticate, scopeToChurch, authorize, validate, errors
│       └── modules/         Route files for auth and offerings
├── frontend/            The React PWA: skeleton, theme, typed hooks, one screen
│   ├── src/
│   │   ├── api/             One file per resource, exporting its hooks
│   │   ├── components/      Props in, markup out: status chip, money, counting
│   │   ├── config/          Static option lists, such as the notes counted
│   │   ├── forms/           Each form owns its schema and calls back on save
│   │   ├── pages/           One per screen; composes hooks, never fetches
│   │   ├── lib/             The transport, Naira formatting, class merging
│   │   └── types.ts         The shapes the server returns and accepts
│   └── tests/               Naira formatting, the transport, the wire shape, the entry screen under a DOM, two contracts
├── design/              Design frames, and the consolidated design spec
│   └── DESIGN-SPEC.md       Tokens, states, component inventory, screen list
└── docs/
    ├── domain.md            What the entities are and the rules on money
    └── architecture.md      How it is put together, and why Postgres
```

## Documentation

| Document                                           | Read it for                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| [docs/domain.md](docs/domain.md)                   | The Sunday being digitized, the entities, and every rule on money         |
| [docs/architecture.md](docs/architecture.md)       | How the packages fit, where authority lives, why PostgreSQL over MongoDB  |
| [design/DESIGN-SPEC.md](design/DESIGN-SPEC.md)     | Palette, type scale, status chips, metrics, and all 88 screens            |

The designer brief, the build spec, the project brief, the project handbook, the
coding conventions, the build plan and the conflict resolutions all live outside
this repository, because they quote the church's own figures and internal
decisions. Where those documents disagree the designer brief wins, then the build
spec, then the project brief, then the handbook.

Design and domain decisions are tracked in that brief as a numbered register,
`DEC-01` to `DEC-12`. Two have since been settled: one account belongs to
exactly one church, and a revision to an approved offering returns it for
approval again — the second on an interim basis, pending the alternative the
brief still asks for. The other ten are open, and each blocks named work, which
is why some things here are specified in detail and deliberately not built. An older `Q`-numbered register in the conventions document is kept as
history where the two overlap.

Four of the five design frame files were truncated in transfer at 256 KiB, and
`design/DESIGN-SPEC.md` records which file recovers each missing section.

## Deployment

Not deployed. The hosting decision has not been made, and it is the last task in
the build plan rather than an early one — what runs today is a health check and
a database with no reachable endpoint in front of it, which is not yet worth
putting anywhere.

## Stack

Express 5, TypeScript 5.9 (strict), Prisma 6.19 over PostgreSQL, `jsonwebtoken`
for session tokens, `bcryptjs` for password hashing, `zod` for validation,
`nodemon` and `ts-node` in development.

The frontend is Vite 8, React 19, TypeScript (strict), Tailwind 4, TanStack
Query, react-hook-form with zod, sonner, lucide-react and `vite-plugin-pwa`,
with shadcn/ui configured and no primitive pulled in yet. Tests run on vitest.

Linting is oxlint rather than the eslint the Vite template ships, and it is the
one dependency outside the agreed list. The reason is that it covers TypeScript
and the rules of hooks without a plugin stack to keep in step, and it lints the
whole project in well under a second — which is what makes a lint step survive
being run on every slice rather than quietly skipped. Going back to eslint is a
config change, not a code change.

## Known gaps

Tracked here rather than quietly:

- Tenancy is modelled and partly enforced. Twenty church-owned models carry a
  required `churchId`; names that were globally unique — department, income
  category, the expense week — are unique per church instead; sixteen child
  relations are composite foreign keys on `[churchId, parentId]`, so the database
  itself refuses a row whose church differs from its parent's. The offering and
  income-category queries are scoped to the session's church. What is missing is
  proof: see the test gap below.
- The account models — `User` and its roles, sessions and tokens — have no
  church column yet. The decision they were waiting on is made: one account
  belongs to one church, so email and username stay unique across the whole
  platform and a person serving two churches needs two addresses. What is left
  is the schema change itself, and nothing but that is in the way. Until it
  lands, signing in cannot put a church into the session token, which is the
  one line `npx tsc --noEmit` reports in `server/` — left failing with the
  reasoning written beside it rather than papered over. Every query that
  depends on that value is already scoped, and nothing is mounted, so the
  server still runs.
- Cross-church *reads* are still controller discipline, not a database
  guarantee. A query that forgets its church filter compiles and returns another
  church's rows. Child-against-parent divergence is now enforced in the schema,
  but nothing stops an unscoped `findMany`. The two-church test suite is what
  turns the convention into a guarantee, and it is not written yet.
- `MemberImportRow.duplicateOfMemberId` and `resolvedMemberId` can still point at
  another church's member, which would show a reviewer a name they must not see.
  They are the two relations a composite key cannot cover, because they use
  `onDelete: SetNull` and `churchId` cannot be nulled. They need either a
  different delete behaviour or a check in the controller.
- `prisma/seed.ts` is outside `tsconfig.json`'s `include`, so the project's own
  `tsc --noEmit` does not check it. Widening that means moving `rootDir`, which
  belongs with the build and test setup rather than here.
- A bearer token in the `Authorization` header is the decided session scheme, so
  this is a risk accepted rather than a requirement still unmet. Both tokens are
  returned in the sign-in response body and the client sends the header back.
  **The exposure stands and is not mitigated:** a bearer token is reachable by
  script by definition, so one cross-site scripting bug would hand over a whole
  church's finances, and an httpOnly cookie is the thing that removes that. In
  exchange there is no cookie, so there is no CSRF surface to defend. The client
  holds the token in memory only, never in `localStorage`, and the whole scheme
  sits in one file, so the decision can be reversed without touching a hook.
- Nothing on the frontend has been run against a working endpoint. The hooks
  for offerings and income categories are typed from the server's source and
  structured against its routers, and no router is mounted, so not one of them
  has ever had a reply. What is proven is the failure path: the transport is
  tested against the live process, and an error page that is not the server's
  own envelope arrives as a sentence rather than as a crash.
- No sign-in screen and no auth hooks. Nine auth endpoints are written on the
  server and nothing calls them, so there is no way into the app yet and no
  protected route to come back to.
- Nothing is rate-limited — not sign-in, not verification codes, not password
  reset. Verification codes are at least capped at five attempts per code now,
  but per-address and per-IP limits need a library this project has not agreed
  to add yet.
- A Church Secretary can work out the bucket rate for a category even though the
  rate is not sent to her. She sees each category's amount and the offering's
  total set-aside, and the rate is one division: on the project's own worked
  example, 1,182,000 over 11,820,000 is exactly 10%. Three per-category fields
  are withheld from her, but that is tidiness rather than a boundary — do not
  mistake it for one. Keeping the aggregate visible is deliberate: she is granted
  the weekly financial report, and that report carries the set-aside and usable
  income. The real fix, if the rate ever needs to be confidential from her, is to
  serve those figures from the weekly report endpoint under its own
  authorization, not to withhold more fields here.
- Two findings from the review pass are recorded and not yet fixed: approval
  lives in three mutable columns, so a revision followed by a re-approval
  overwrites who approved the original figure and when; and category-name
  uniqueness is case-insensitive in the controller but case-sensitive in the
  database, while the rate lookup has no deterministic order, so two
  differently-cased categories of the same name can return different deductions
  on consecutive reads.
- `AttendanceSummary` stores the Men/Women/Children split as typed numbers, and
  `Member` has no date of birth, so the split is a headcount rather than derived
  from age as the specification requires. Changing the child-age threshold later
  cannot correct past summaries.
- `Church.enabledModules` is stored and never read, so it looks like access
  control and is not.
- Installed packages drift from the conventions in three places: `zod` where
  `express-validator` is specified, `bcryptjs` where `bcrypt` is, and oxlint
  where the conventions name no linter at all. The first two are the server's
  and predate this; the third is recorded in the stack section above with its
  reason.
- The church crest asset is missing; screens use the documented four-square
  fallback until it is exported from the design project.
- `server/src/modules/` and `server/src/domain/` do not match the documented
  `routes/` and `controllers/` layout, and will be moved.

## A note on data

This repository is public and contains **no real church data**. No member names,
no real figures, no credentials, no `.env` files. Seed data and everything
appearing in the design frames is fabricated.
