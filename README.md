# Church Operations Platform

An internal operations tool for a single Foursquare Gospel Church in Lagos. It replaces what the church does today on paper and over WhatsApp: counting Sunday offerings note by note, marking attendance by name, collecting department reports, tracking weekly expenses, and reporting all of it up to church leadership.

Built for one church. Deliberately not multi-tenant.

## Status

Early. The domain model is settled and the schema is drafted; the application is not yet runnable.

| Area | State |
|---|---|
| Domain model and build spec | Complete — data model, computations, state machines, validation, API surface |
| Design | Complete — 88 screens across five roles, mobile and desktop, with a fixed visual language |
| Prisma schema | Drafted, pre-migration |
| Backend | Auth and offering routes partially written; entry points not wired |
| Frontend | Not started |
| Tests | Not started |

This file is updated as each slice lands, so it should always describe what actually works rather than what is planned.

## The problem

Every Sunday, money arrives in separate envelopes and is counted by hand. Tithe and Worship Offering are counted on their own; everything else goes into the offering box and is counted as one pool. Transfers arrive with no cash behind them at all. The treasurer writes totals on a paper form, photographs it, and sends it to the pastor on WhatsApp with a note asking for approval.

That process works. The software's job is to be faster than the paper form without changing how the church actually operates — not to impose a tidier process on people who already have one.

## Roles

| Role | What they do |
|---|---|
| Treasurer | Records offerings, records weekly expenses, submits the weekly financial report |
| Usher | Marks named attendance during the service, adds first-time visitors |
| Church Secretary | Maintains the members register, follows up visitors, approves leader accounts, reviews department reports, manages the calendar |
| Department Leader | Submits weekly and quarterly department reports |
| Senior Pastor | Reads, questions and approves. Never edits anything. |

One person can hold two roles — Treasurer and Department Leader is a real combination — and switches between them from the menu. The active role decides what the navigation shows, and every state change records which role the actor was using at the time.

## Domain rules worth knowing

These are the rules that make the system more interesting than CRUD, and the ones the code is organised around.

**Money is integer kobo.** Never a float, never a decimal that rounds somewhere unexamined. Naira formatting happens in the interface, for display only.

**Nobody ever types a total.** Counts go in; every total is computed — per category, per offering, per week, per expense line. A total that arrives from a client is not trusted.

**Counting is category-first.** Each giving category carries its own denomination breakdown, because the church physically separates the money into envelopes before anyone counts it. The breakdown belongs to the category, not to the service. Categories that arrive as transfers have no breakdown at all, only an amount.

**Cash and category totals legitimately differ.** Transfers have no cash behind them, so the two figures disagree on a normal Sunday. The interface explains this; it never flags it as an error.

**Finalized offerings are revised, never overwritten.** A transfer arriving after the sheet is finalized creates a revision carrying the original figure, the adjustment, who recorded it, when, and why. Both figures stay visible. This is an audit trail, not a silent edit.

**Don't store what you can compute — but compute history from historically correct inputs.** Totals, attendance splits and bucket deductions are derived on read, so they cannot go stale. The exception is the input: a deduction uses the percentage that applied when the offering was finalized, not today's percentage, so changing a rate never rewrites last month's books. An age bracket uses age on the service date, not age now.

**Multi-table money writes are transactional.** An offering, its categories and their denomination counts save together or not at all. Orphaned cash rows would make the system lie about money, which is the one failure mode that matters most here.

**Attendance has one source of truth.** Ushers mark named members individually; that record *is* the count. The Men/Women/Children split is derived from each member's recorded sex and date of birth. There is no manual headcount anywhere in the system to disagree with it.

**Approval and questioning are different actions.** The pastor can leave a comment without deciding. The record stays awaiting approval, the submitter sees the comment and can reply, and the exchange stays attached to the record.

## Architecture

**Backend:** Node, Express, TypeScript (strict), Prisma, PostgreSQL.
**Frontend:** Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query, react-hook-form with zod. A PWA, mobile-first, desktop-enhanced at 1024px and above.

### Why PostgreSQL and not MongoDB

This was weighed rather than defaulted to.

The data is aggressively relational — an offering has many categories, each with many denomination counts; members connect to departments through a bridge; attendance ties members to services. Nearly every entity exists to reference another.

The decisive reason is the money. Finalizing an offering must write the offering, its categories and their denomination rows together or not at all, and PostgreSQL gives real multi-table transactions to guarantee it. "Weaker guarantees about money" is not an acceptable trade for financial data with audit requirements.

The second reason is reporting. "Diesel spend between March and June", "who hasn't attended in six weeks", "every category's deductions this quarter" — these are joins and aggregations. SQL does them natively; a document store would need denormalisation or application-side joins.

The honest counter-case is that MongoDB shines when records are self-contained documents, when the schema shifts shape often, and when horizontal scale matters more than relational integrity. None of those apply to a single church's interconnected, integrity-critical data.

### Why a PWA and not native

No workflow needs native device features. One codebase is the right call for a solo developer, and the app is reached mostly by tapping a WhatsApp link — so every screen has to work as a direct landing page anyway.

## Design

The interface aims for confidence rather than excitement: it should read as official church administration, not a startup product. A calm warm-grey base carries every screen, and the four colours of the church crest appear only as small accents — a status chip, a primary button — never as large fills.

Many of the people using this are over 50, and the usher is using it one-handed, standing, mid-conversation. So: generous type, 48px minimum touch targets, status always shown as an icon *and* a label rather than by colour alone, and tabular figures on every amount so columns of money line up.

Full tokens, component inventory and per-screen notes are in [`design/DESIGN-SPEC.md`](design/DESIGN-SPEC.md). The design frames themselves are the `.dc.html` files in [`design/`](design/).

## Repository layout

```
server/           Express + TypeScript API
  prisma/         schema and migrations
  src/            routes, middleware, domain logic
frontend/         Vite + React PWA
design/           design frames, tokens and the consolidated design spec
docs/             domain handbook, build spec and conventions (kept local)
```

## Out of scope

Multi-church or multi-branch support, member self-service, online giving or payment processing, payroll and budgets, accounting integrations, check-in kiosks, QR codes, event ticketing, native apps, CSV or Excel export.

## A note on data

This repository is public and contains **no real church data**. No member names, no real figures, no credentials, no `.env` files. Seed data and anything that appears in the design frames is fabricated. The domain handbook, build spec, conventions and build plan are kept out of the repository deliberately — this file carries what a reader needs.

## Known gaps

Tracked honestly rather than quietly:

- The Prisma schema currently represents money as a decimal; it is being brought in line with the integer-kobo rule above.
- The schema has no migrations yet, so nothing has been applied to a database.
- Four of the five design frame files were truncated in transfer at 256 KiB; `design/DESIGN-SPEC.md` records which file recovers each missing section.
- The church crest asset is not in the repository; screens use a documented four-square fallback until it is exported.
