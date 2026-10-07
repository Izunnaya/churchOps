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

`npx tsc --noEmit` reports no errors, which is newer than it sounds — the project
did not compile at all until the empty `env` and `db` placeholders at the `src`
root were replaced by the modules in `lib/` that everything had been importing.

| Built                                                                      | Not yet built                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The domain model: entities, computations, state machines, validation rules  | **The church column on every church-owned model, and the scoping that uses it** |
| The isolation rules the platform has to meet, written as a specification    | Any migration, so no database exists                                        |
| A `Church` model, and a seed that creates two of them                      | Per-church contents — members, users, departments and categories            |
| The design: 88 screens across five roles, mobile and desktop               | Any route mounted — the written auth and offering routers are not wired in  |
| A fixed visual language: palette, type scale, status chips, touch metrics   | Any test, and any test script to run one                                    |
| Prisma schema, 26 models and enums, covering every entity                  | The frontend, which has no `package.json` yet                               |
| Route, middleware and domain files for auth, offerings and income categories | Every screen                                                                |
| The money, error and HTTP helpers those files import                       | PDF export, notifications, offline attendance sync                          |
| An Express server that starts and serves `GET /health`                     | Deployment, and the hosting decision it waits on                            |

The schema and the written routes predate the move to multiple churches, so they
are single-church throughout. Adding the church column, scoping every query to it
and proving the isolation with two-church tests comes before any further feature
work — retro-fitting that to endpoints already in use is how a leak ships.

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
│       ├── middleware/      authenticate, authorize, validate, error handling
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
for sessions in an httpOnly cookie, `bcryptjs` for password hashing, `zod` for
validation, `nodemon` and `ts-node` in development. The frontend is planned as
Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query and react-hook-form
with zod, built as a PWA.

## Known gaps

Tracked here rather than quietly:

- Tenancy is started but not enforced. A `Church` model exists and the seed
  creates two, but nothing references it yet: no church column on any other
  model, and no query is scoped. `User.email` and `User.username` are globally
  unique, which would forbid one person holding accounts at two churches —
  whether that should be allowed is an open decision, so the constraint is being
  left alone rather than guessed at.
- `prisma/seed.ts` is outside `tsconfig.json`'s `include`, so the project's own
  `tsc --noEmit` does not check it. Widening that means moving `rootDir`, which
  belongs with the build and test setup rather than here.
- Refusals currently distinguish a missing record (404) from a forbidden one
  (403). Once churches share a database they must be identical, because the
  difference confirms that someone else's record exists.
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
