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

The domain model and the design are finished. The server now starts and answers
a health check, which is the whole of it: no database has ever been created,
there are no migrations, and none of the written routes are mounted yet. The
Prisma schema covers every entity, and route, middleware and domain files exist
for authentication and offerings. The frontend has no `package.json`.

`npx tsc --noEmit` reports one error, and it is deliberate. Signing in has to put
the caller's church into the session token, and there is no way to derive it yet:
the account models carry no church, because whether one account belongs to a
single church or spans several is an open decision. Guessing would hard-code that
answer into sign-in, so the call is left failing with the reasoning written beside
it. Everything downstream — the scoping middleware and every scoped query — is
finished and waiting on that one value. The running server is unaffected, because
no router is mounted: `npm run dev` still answers `/health`.

| Built                                                                      | Not yet built                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The domain model: entities, computations, state machines, validation rules  | **The scoping that makes the church column mean anything**                   |
| The isolation rules the platform has to meet, written as a specification    | Any migration, so no database exists                                        |
| A `Church` model, a two-church seed, and a required church column on all 20 church-owned models | Sign-in putting a church into the session, which blocks the rest             |
| Church scoping on every offering and income-category query, and one middleware that resolves the church from the session | The two-church tests that prove the scoping holds                            |
|                                                                            | The church column on the account models, pending a cross-church identity decision |
| The design: 88 screens across five roles, mobile and desktop               | Any route mounted — the written auth and offering routers are not wired in  |
| A fixed visual language: palette, type scale, status chips, touch metrics   | Any test, and any test script to run one                                    |
| Prisma schema, 26 models and 15 enums, covering every entity               | The frontend, which has no `package.json` yet                               |
| Route, middleware and domain files for auth, offerings and income categories | Every screen                                                                |
| The money, error and HTTP helpers those files import                       | PDF export, notifications, offline attendance sync                          |
| An Express server that starts and serves `GET /health`                     | Deployment, and the hosting decision it waits on                            |

The written routes predate the move to multiple churches. The column they need
now exists, but scoping every query to it and proving the isolation with
two-church tests comes before any further feature work — retro-fitting that to
endpoints already in use is how a leak ships.

## Running it locally

Needs Node 22 or later. Only the API package runs today, and all it serves is a
health check.

```sh
cd server
npm install
npm run dev             # http://localhost:4000
curl localhost:4000/health   # {"status":"ok"}
```

| Command               | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | nodemon + ts-node against `src/index.ts`           |
| `npx prisma generate` | Regenerates the client into `src/generated/prisma` |

That is the whole script list. There is no `build`, no `test`, no `lint` and no
`format` yet, and no `.env.example`. `PORT` is the only variable needed to start
the server, and it defaults to 4000 — `JWT_SECRET`, `ACCESS_TOKEN_TTL` and
`REFRESH_TOKEN_TTL_DAYS` are read lazily and matter only once tokens are signed,
and nothing yet opens a database connection, so `DATABASE_URL` is not required to
run what exists. Adding the test harness comes before any feature work, so that it
exists before there is anything to test.

`frontend/` holds a stray `next-env.d.ts` and a build directory from an
abandoned start. Treat it as empty.

## Repository layout

```
├── server/              Express + TypeScript API over PostgreSQL with Prisma
│   ├── prisma/
│   │   ├── schema.prisma    Every model, relation and constraint
│   │   └── seed.ts          Fictional data only. Needs a database, so unrun
│   └── src/
│       ├── index.ts         App setup and listen, nothing else
│       ├── domain/          Offering rules and their checks
│       ├── lib/             Env, the Prisma client, money, errors, HTTP and auth helpers
│       ├── middleware/      authenticate, scopeToChurch, authorize, validate, errors
│       └── modules/         Route files for auth and offerings
├── frontend/            The React PWA. Not scaffolded yet.
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
`DEC-01` to `DEC-12`. All twelve are currently open, and each one blocks named
work — which is why some things here are specified in detail and deliberately not
built. An older `Q`-numbered register in the conventions document is kept as
history where the two overlap.

Four of the five design frame files were truncated in transfer at 256 KiB, and
`design/DESIGN-SPEC.md` records which file recovers each missing section.

## Deployment

Not deployed. The hosting decision has not been made, and it is the last task in
the build plan rather than an early one — what runs today is a health check with
no database behind it, which is not yet worth putting anywhere.

## Stack

Express 5, TypeScript 5.9 (strict), Prisma 6.19 over PostgreSQL, `jsonwebtoken`
for session tokens, `bcryptjs` for password hashing, `zod` for validation,
`nodemon` and `ts-node` in development. The frontend is planned as
Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query and react-hook-form
with zod, built as a PWA.

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
  church column yet. `User.email` and `User.username` are globally unique, which
  would forbid one person holding accounts at two churches. Whether that should
  be allowed is an open decision, so the constraint is being left alone rather
  than guessed at.
- The type-check is red on purpose, at one line: sign-in cannot put a church into
  the session token until the cross-church identity decision is made. Every query
  that depends on it is already scoped. Nothing is mounted, so the server runs.
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
- There is no httpOnly cookie and no CSRF defence. Both tokens are returned in
  the JSON response body and sent back as an `Authorization: Bearer` header, so
  they sit in storage a script can read; one cross-site scripting bug would hand
  over a whole church's finances. The specification requires httpOnly cookies
  with CSRF protection on state-changing requests. It belongs with the login
  slice.
- Nothing is rate-limited — not sign-in, not verification codes, not password
  reset. Verification codes are at least capped at five attempts per code now,
  but per-address and per-IP limits need a library this project has not agreed
  to add yet.
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
- The schema represents money as `Decimal(14, 2)`. Every specification says
  integer kobo. The correction touches every money path and is owned by this
  repository's author.
- Installed packages drift from the conventions in two places: `zod` where
  `express-validator` is specified, and `bcryptjs` where `bcrypt` is.
- The church crest asset is missing; screens use the documented four-square
  fallback until it is exported from the design project.
- `server/src/modules/` and `server/src/domain/` do not match the documented
  `routes/` and `controllers/` layout, and will be moved.

## A note on data

This repository is public and contains **no real church data**. No member names,
no real figures, no credentials, no `.env` files. Seed data and everything
appearing in the design frames is fabricated.
