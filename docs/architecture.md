# Architecture

How the two packages are put together, and the reasoning behind the choices
that were actually weighed rather than defaulted to.

## Shape

Two services, deliberately not folded together: an Express API over PostgreSQL,
and a React PWA that talks to it over HTTP. Mobile-first, with desktop
enhancement at 1024px and above.

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
is typing, but the server recomputes it on save and never accepts a total, a
role or a user id from the client. Role comes from the database record reached
through the verified token — never from a body, a query or a header.

Hiding a button is not authorization. Every restricted action is enforced on the
route that performs it.

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
more than relational integrity. None of those apply to a single church's
interconnected, integrity-critical data at this size.

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
is not a demonstrated problem.

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
