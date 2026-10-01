# Foursquare TBC Church Operations Platform

The church's internal tool for running a Sunday: which categories the offering
came in under, what each one counted to note by note, what was set aside to the
bucket account, who was present, which departments have reported, and what the
pastor has approved.

**Live:** not deployed yet.

## Where it stands

The domain model and the design are finished; the application is not started.
The Prisma schema covers every entity, and route, middleware and domain files
exist for authentication and offerings — but `src/index.ts`, `src/app.ts`,
`src/db.ts` and `src/env.ts` are all empty files, there are no migrations, and
no database has ever been created. Nothing runs yet. The frontend has no
`package.json`.

| Built                                                                      | Not yet built                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The domain model: entities, computations, state machines, validation rules  | Any migration, so no database exists                                        |
| The design: 88 screens across five roles, mobile and desktop               | The server entry point — `index.ts`, `app.ts`, `db.ts`, `env.ts` are empty  |
| A fixed visual language: palette, type scale, status chips, touch metrics   | Any test, and any test script to run one                                    |
| Prisma schema, 26 models and enums, covering every entity                  | The frontend, which has no `package.json` yet                               |
| Route, middleware and domain files for auth, offerings and income categories | Every screen                                                                |
| The money, error and HTTP helpers those files import                       | PDF export, notifications, offline attendance sync                          |
|                                                                            | Deployment, and the hosting decision it waits on                            |

## Running it locally

Needs Node 22 or later. Only the API package is installable today, and it will
not start.

```sh
cd server
npm install
npx prisma generate     # works: the schema is valid
npm run dev             # starts nodemon, which runs an empty entry point
```

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | nodemon against `src/index.ts`, which is empty      |
| `npx prisma generate` | Regenerates the client into `src/generated/prisma` |

That is the whole script list. There is no `build`, no `test`, no `lint` and no
`format` yet, and no `.env.example` — you would need a `.env` of your own with a
`DATABASE_URL` pointing at a PostgreSQL database. Adding the test harness comes
before any feature work, so that it exists before there is anything to test.

`frontend/` holds a stray `next-env.d.ts` and a build directory from an
abandoned start. Treat it as empty.

## Repository layout

```
├── server/              Express + TypeScript API over PostgreSQL with Prisma
│   ├── prisma/
│   │   └── schema.prisma    Every model, relation and constraint
│   └── src/
│       ├── domain/          Offering rules and their checks
│       ├── lib/             Money, errors, HTTP helpers, auth helpers
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

The project handbook, the build spec, the project brief, the coding conventions,
the build plan and the conflict resolutions all live outside this repository,
because they quote the church's own figures and internal decisions. Where those
documents disagree, the build spec wins, then the brief, then the handbook. The
`Q`-numbers referred to in commits are questions in the conventions document's
open-questions section; seven of them are still unanswered and each one blocks
named work.

Four of the five design frame files were truncated in transfer at 256 KiB, and
`design/DESIGN-SPEC.md` records which file recovers each missing section.

## Deployment

Not deployed. The hosting decision has not been made, and it is the last task in
the build plan rather than an early one — there is no point deploying a server
that does not start.

## Stack

Express 5, TypeScript 5.9 (strict), Prisma 6.19 over PostgreSQL, `jsonwebtoken`
for sessions in an httpOnly cookie, `bcryptjs` for password hashing, `zod` for
validation, `nodemon` and `ts-node` in development. The frontend is planned as
Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query and react-hook-form
with zod, built as a PWA.

## Known gaps

Tracked here rather than quietly:

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
