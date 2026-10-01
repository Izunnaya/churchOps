# Architecture

How the two packages are put together, and the reasoning behind the choices
that were actually weighed rather than defaulted to.

## Shape

Two services, deliberately not folded together: an Express API over PostgreSQL,
and a React PWA that talks to it over HTTP. Mobile-first, with desktop
enhancement at 1024px and above.

One application serves every church, from one database, with a church column on
every church-owned table. A database or a schema per church was rejected: for a
handful of churches it multiplies migration and connection work without removing
the thing that actually protects data, which is a correctly scoped query. The
cost of this choice is that scoping is never optional — one unscoped `findMany`
is a cross-church leak, which is why the isolation tests are not negotiable.

```
server/
  prisma/schema.prisma   every model, relation and constraint
  src/
    index.ts             app setup and listen, nothing else
    lib/                 one Prisma client, money, errors, http helpers
    middleware/          authenticate, authorize, validate, error handling
    routes/              one router per resource, wiring only
    controllers/         one controller per resource, the work
frontend/
  src/
    api/                 one file per backend resource, exporting hooks
    pages/               one per screen; composes hooks, never fetches
    forms/               own their schema and submit handler
    components/          take props and render
```

The order inside a route is always **authenticate → authorize → validate →
controller**. A route file holds no logic.

## Where authority lives

The backend owns every total. The frontend may preview a figure while someone
is typing — counting is instant and local, and labelled provisional until
saved — but the server recomputes it on save and never accepts a total, a role, a
user id or a church from the client. Role and church both come from the database
record reached through the session, never from a body, a query or a header.

Hiding a button is not authorization. Every restricted action is enforced on the
route that performs it.

## Tenant isolation

One rule: **the caller's church comes from the session, on the server, on every
request.** No endpoint takes a church id as a parameter, because then it would be
something a client could change.

In practice that is one middleware resolving the session's church and attaching
it, plus discipline in the controllers: every read filters on it, every write
stamps it, and before an update or delete the target row's church is confirmed.
Rows referenced together in one write must belong to the same church — an
offering's service, a report's department, a comment's subject.

A row in another church returns exactly what a row that does not exist returns.
Not a 403 against a 404, not a different message: the same response, because any
difference confirms the record is real.

The same scoping applies to the things that are easy to forget — exports, stored
files, notification recipients, background jobs, cache keys and the offline
attendance queue. Queued work carries its church, account and service, and is
re-authorized on reconnect rather than trusted.

**This is not implemented yet.** The schema and the written routes predate it.
Build Spec section 16 is the specification; the build plan puts the church model,
the scoping middleware and a two-church test suite ahead of any further feature.

## Why PostgreSQL and not MongoDB

This was weighed rather than defaulted to.

The data is aggressively relational. An offering has many categories, each with
many denomination counts. Members connect to departments, attendance ties
members to services. Nearly every entity exists to reference another.

The decisive reason is the money. Finalizing an offering must write the
offering, its categories and their denomination rows together or not at all, and
PostgreSQL gives real multi-table transactions to guarantee it. "Weaker
guarantees about money" is not an acceptable trade for financial data carrying
audit requirements.

The second reason is reporting. "Diesel spend between March and June", "who
hasn't attended in six weeks", "every category's deductions this quarter" —
these are joins and aggregations. SQL does them natively; a document store would
need denormalisation or application-side joins.

The honest counter-case: MongoDB shines when records are self-contained
documents, when the schema shifts shape often, and when horizontal scale matters
more than relational integrity. None of those apply here. The data is
interconnected and integrity-critical, the shape is settled, and the scale is
measured in churches rather than in millions of documents — and isolation between
churches is a constraint a relational schema can enforce rather than something
left to application code to remember.

## Why a PWA and not native

No workflow needs native device features, and one codebase is the right call for
a solo developer. The app is reached mostly by tapping a WhatsApp link, so every
screen has to work as a direct landing page regardless.

Offline support is deliberately narrow: attendance marks queue on the device and
sync later, identified by a client-generated uuid so a retry cannot create a
duplicate. Offering and expense drafts autosave, but finalizing or submitting
needs a connection.

## Layering, and the rule against more of it

No new layer without a demonstrated problem in existing code. No repositories,
no DTO classes, no base controllers, no generic CRUD factories, no dependency
injection, no interfaces with a single implementation. "It might scale better"
is not a demonstrated problem, and **neither is multi-tenancy** — serving several
churches is a reason to scope queries, not a licence for a tenant-context
abstraction or a query-builder wrapper.

A helper used by one controller lives at the bottom of that controller. It moves
to `lib/` when a second caller actually exists, not in anticipation of one.

Libraries do infrastructure — validation, data fetching, forms, hashing, tokens,
icons. Business rules are written out plainly in this codebase: who may approve
an offering, when a report locks, how a revision works. Those never hide in
config or get delegated to a package.

## Money representation

Integer kobo throughout, in fields whose names end in `Kobo`. Never `Float`.
Formatting to `₦` happens once, in the interface.

> The committed schema does not yet honour this — see Known gaps in the
> [README](../README.md). The correction is owned by the repository's author
> because it touches every money path.
