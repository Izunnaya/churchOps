# Domain

What a church actually does on a Sunday, and the rules the code is held to.

## Churches

The platform serves several independent churches from one application and one
database. Foursquare TBC in Lagos is the first; it is not the parent of the
others and has no visibility into them.

A `Church` owns its name, logo, accent colours, giving categories, bucket rates
and expense labels. Those are settings, not constants in the code, and one
church's settings are never a fallback for another — including in PDFs and
notifications. Two churches independently using the category name "Tithe" is
coincidence, not a shared record.

Every row that holds church data belongs to exactly one church. The rules that
follow from that:

- Search, autocomplete, duplicate checks, import matching, reports, counters,
  history and notifications cover only the signed-in user's church.
- **A record in another church is indistinguishable from one that does not
  exist** — same response, same wording, no owner, no hint. A refusal that
  differs from a "not found" confirms that someone else's record is there.
- There is no shared member directory, and the app never says that a person or
  an email belongs to another church. Outside your church, a collision is not a
  collision.
- Nothing in the interface reveals that other churches exist: no church search,
  dropdown, count or list.
- An export carries one church's data and one church's branding.

Roles are granted per church, and a role switcher only lists roles already held
in the current church. Platform administration is a separate concern from
church-facing permissions: operating the platform does not imply permission to
read a church's members or finances.

Creating churches, assigning the first administrator and managing church status
are deliberately not built yet. Provisioning is manual.

## The process being replaced

Money arrives in separate envelopes. Tithe and Worship Offering are each
counted on their own, note by note; everything else goes into the offering box
and is counted as one pool. Transfers arrive with no cash behind them at all.
The treasurer writes totals on a paper form, photographs it, and sends it to
the pastor on WhatsApp with a note asking for approval.

That process works. The software's job is to be faster than the paper form
without changing how the church operates — not to impose a tidier process on
people who already have one.

## Roles

| Role | What they do |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Treasurer | Records offerings and weekly expenses, submits the weekly financial report |
| Usher | Marks named attendance during the service, adds first-time visitors |
| Church Secretary | Maintains the members register, follows up visitors, approves leader accounts, reviews reports, manages the calendar |
| Department Leader | Submits weekly and quarterly department reports |
| Senior Pastor | Reads, questions and approves. Never edits anything. |

One person can hold two roles — Treasurer and Department Leader is a real
combination — and switches between them from the menu. A user switches only
among roles already granted to their account **in the church they are signed in
to**, enforcement is on the server, and every state change records which role the
actor was using at the time. Switching never adds permission, and there is no
church switcher.

Whether one person can hold accounts at two churches, and how signing in
resolves that, is an open decision. Today an email address is unique across the
whole platform, which would forbid it.

## Entities

**Finance.** `Offering` is a thin wrapper keyed on a service; the money detail
lives in its children. `OfferingCategory` is one giving category within a
service, referencing `OfferingCategoryType` from a list the treasurer
maintains. `DenominationCount` is the note-by-note breakdown for one category —
it belongs to the category, not to the offering. `OfferingRevision` records a
late adjustment. `BucketRate` holds a percentage per category type, with an
`effective_from` date. `WeeklyFinancialReport`, `WeeklyExpense` and
`ExpenseLine` cover the week's reporting and spend.

**People.** `Member` is a person known to the church; sex and date of birth are
required, because the attendance split is computed from them. `Visitor` is a
first-timer an usher added, who may later convert to a member. `AttendanceMark`
is one row per person per service — there is no "present" field, because the
row existing is the presence. `Service` is the spine: offerings and attendance
both hang off it. `Department`, `User`, `DeptReport`.

**Supporting.** `MemberImport` and `ImportRow` stage the launch spreadsheet.
`ApprovalComment`, `Notification`, `AuditLog`.

**Church.** Name, slug, status, logo, accent set, enabled modules, timezone.
Every entity above carries its church, required, and the value is set on the
server from the session — never accepted from a request. Names that read as
globally unique are unique per church instead: a department, a category, a
service, a week.

## Rules the code is held to

These are what make the system more interesting than CRUD, and what the code is
organised around.

**Money is integer kobo.** Never a float, never a decimal that rounds somewhere
unexamined. Naira formatting happens in the interface, for display only.

**Nobody ever types a total.** Counts go in; every total is computed — per
category, per offering, per week, per expense line. A total arriving from a
client is not trusted.

**Counting is category-first.** Each giving category carries its own
denomination breakdown, because the church physically separates the money into
envelopes before anyone counts it. Categories that arrive as transfers have no
breakdown, only an amount.

**Cash and category totals legitimately differ.** Transfers have no cash behind
them, so the two figures disagree on a normal Sunday. The interface explains
this; it never flags it as an error.

**Finalized offerings are revised, never overwritten.** A transfer arriving
after the sheet is finalized creates a revision carrying the original figure,
the adjustment, who recorded it, when, and why. Both figures stay visible.

**Don't store what you can compute — but compute history from historically
correct inputs.** Totals, attendance splits and bucket deductions are derived
on read, so they cannot go stale. The exception is the input: a deduction uses
the percentage that applied when the offering was finalized, not today's, so
changing a rate never rewrites last month's books. An age bracket uses age on
the service date, not age now.

**Multi-table money writes are transactional.** An offering, its categories and
their denomination counts save together or not at all. Orphaned cash rows would
make the system lie about money, which is the failure mode that matters most.

**Attendance has one source of truth.** Ushers mark named members individually;
that record *is* the count. The Men / Women / Children split is derived from
each member's sex and date of birth, with visitors counted separately because
theirs are not captured. There is no manual headcount to disagree with it.

**Approval and questioning are different actions.** The pastor can comment
without deciding. The record stays awaiting approval, the submitter sees the
comment and can reply, and the exchange stays attached to the record.

## Lifecycles

```
Offering      draft ──finalize──▶ finalized ──(weekly report approved)──▶ approved
Report/expense  draft ──submit──▶ awaiting_approval ──approve──▶ approved
                                   └── comment / reply, status unchanged
DeptReport    draft ──submit──▶ submitted ──(Secretary opens)──▶ under_review ──▶ approved
                                   └──────── returned ◀── return, reason required
Account       pending_verification ──▶ pending_approval ──▶ active ◀──▶ disabled
```

Finalizing snapshots the bucket rates and locks the counts. After that, change
is only possible as a revision.

## Out of scope

Branches or sub-churches beneath a church, member self-service, online giving or
payment processing, payroll and budgets, accounting integrations, check-in
kiosks, QR codes, event ticketing, native apps, CSV or Excel export.

Deferred rather than ruled out: the screens for creating and provisioning a
church, assigning its first administrator, managing church status, configuring
which modules it has, church settings, invitations, church switching, and
platform operator tooling. Deferring the screens does not defer the isolation
work underneath them.
