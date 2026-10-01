# Domain

What the church actually does on a Sunday, and the rules the code is held to.

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
among roles already granted to their account, enforcement is on the server, and
every state change records which role the actor was using at the time.

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

Multi-church or multi-branch support, member self-service, online giving or
payment processing, payroll and budgets, accounting integrations, check-in
kiosks, QR codes, event ticketing, native apps, CSV or Excel export.
