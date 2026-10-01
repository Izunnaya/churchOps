# Church Operations Platform — Consolidated Design Spec

Imported from the claude.ai design project
`f2065995-4fb3-475c-832e-61e51453e576` ("Church Operations Platform Design").

Source files mirrored into this folder:

| File | Status |
| --- | --- |
| `Church Ops Screens.dc.html` | mobile screens (truncated at 256 KiB — batch 1 cut) |
| `Church Ops Journeys.dc.html` | mobile screens by role — **recovers batch 1** |
| `Church Ops Desktop.dc.html` | desktop screens (truncated — D1–D3 cut) |
| `Church Ops Desktop Journeys.dc.html` | desktop screens by role — **recovers D1–D3** |
| `Church Ops Deck.dc.html` | 8-slide deck, complete — **holds the Pastor dashboard** |
| `deck-stage.js`, `support.js` | design-doc viewer runtime (not app code) |
| `_screens-captured.txt` | union of every screen label recovered (88) |

`assets/foursquare-crest.png` could not be recovered: it exceeds the 256 KiB
read cap and comes back as truncated base64. Export it from the design project
directly, or use the SVG fallback described under *Branding*.

---

## 1. Product

An internal operations tool for **one** Foursquare Gospel Church in Lagos. It
digitizes what is done today on paper and WhatsApp: Sunday offering counts,
attendance, and department reports, with a reporting layer for leadership.

Out of scope, do not build: multi-church support, member self-service, online
giving, accounting integrations, native apps.

## 2. Design direction

Inspire **confidence, not excitement**. It should read as an official church
administrative system, not a startup SaaS product.

- **Avoid:** gradients, glassmorphism, oversized cards, floating elements, AI
  illustrations, animated backgrounds, decorative effects, neon palettes,
  chat-first patterns.
- **Prioritize:** clarity, readability, familiarity over novelty. Calm, fast,
  professional, unobtrusive.
- **Reference feel:** Linear (density, type), Stripe Dashboard (tables, financial
  layout), Notion (restraint), Google Forms (low-friction mobile entry).
- **Icons:** one outline set only (Lucide/Heroicons). No mixed or filled sets.
- **Charts:** plain line/bar/donut. No 3D, gradients, or animation.

### Device reality

**Mobile-first.** Primary device for every role is a mid-range Android phone.
The dashboard may be desktop-enhanced, but every core flow must be fully usable
one-handed on a phone.

The app is **notification-driven**: users arrive at a specific screen straight
from a WhatsApp message. Every core screen must work as a direct landing point,
not only as a destination reached by navigating menus.

## 3. Design tokens

Extracted verbatim from `desktop-kit.js` and the deck's Design Language slide.

### Palette

A calm warm-grey base carries every screen. The four crest colors appear only as
small accents — status chips, the primary button, chart fills — **never as
surface colors**.

```
/* Crest accents */
--red:        #A6342C   /* Cross  — destructive, returned, required */
--blue:       #2E5FA3   /* Cup    — primary action, focus, active nav */
--blue-dark:  #24497D   /* link hover */
--gold:       #B08A24   /* Dove   — deck swatch */
--purple:     #5D4487   /* Crown  — approved */

/* Neutral base */
--page:       #FAF9F7   /* app background */
--canvas:     #EFEDE8   /* design-doc backdrop */
--surface:    #FFFFFF   /* cards, sidebar, topbar */
--sunken:     #F5F3EF   /* table head, input prefix, inert role box */
--ink:        #211F1C   /* primary text */
--ink-2:      #4A463F   /* body text */
--ink-3:      #5F5B54   /* secondary text */
--ink-4:      #6B665E   /* uppercase labels */
--ink-5:      #8A857C   /* placeholder, trailing icons */
--ink-6:      #A29C90   /* inactive chevron */
--border:     #E4E1DB   /* card borders */
--border-2:   #EEECE7   /* row dividers */
--border-3:   #C9C5BC   /* input borders */
--border-4:   #D8D4CC   /* chip borders, menus */
--tint-blue:  #EDF2F9   /* active nav, info chip bg */
--tint-blue2: #C7D6EB   /* info chip border, chart low */
--row-sel:    #F1F4F9   /* selected list row */
--neutral-bg: #F1EFEA   /* draft chip, avatar */
```

### Status chips — icon + label, never color alone

| Key | Label | Background | Border | Text | Icon |
| --- | --- | --- | --- | --- | --- |
| `draft` | Draft | `#F1EFEA` | `#D8D4CC` | `#4A463F` | pencil |
| `fin` | Finalized | `#EDF2F9` | `#C7D6EB` | `#2E5FA3` | lock |
| `appr` | Approved | `#F2EEF8` | `#D9CFEA` | `#5D4487` | check-circle |
| `rev` | Revised | `#F8F2E2` | `#E5D6AB` | `#7A5E17` | history |
| `ret` | Returned | `#F9EDEC` | `#E8C9C5` | `#A6342C` | reply |
| `wait` | Waiting | `#EDF2F9` | `#C7D6EB` | `#2E5FA3` | clock |
| `due` / `warn` | Due / Warning | `#F8F2E2` | `#E5D6AB` | `#7A5E17` | clock / alert |
| `msg` | Comment | `#EDF2F9` | `#C7D6EB` | `#2E5FA3` | message |
| `none` | None | `#F1EFEA` | `#D8D4CC` | `#4A463F` | minus |

Chip: `inline-flex`, gap 6, padding `5px 11px` (small `3px 9px`), radius 999,
font 13px/600 (small 12.5px), icon 14px (small 12px).

### Typography

`IBM Plex Sans` (400/500/600/700), fallback `system-ui, sans-serif`.
**Tabular numerals on every money value** (`font-variant-numeric: tabular-nums`).

| Role | Size | Weight |
| --- | --- | --- |
| Page title (topbar) | 21px | 700 |
| Detail header | 18.5px | 700 |
| Section label (uppercase, `.05em`) | 13px | 700 |
| List row title | 16.5px | 600 |
| Body / input | 16.5–17px | 400 |
| Large input | 20px | 600 |
| Button | 16.5px | 600 |
| Stat value | 26px | 700 |
| KV value (big) | 22px | 700 |
| Secondary / hint | 13–14.5px | 400 |

Base body is 17px on device, inputs 18px.

### Metrics

- Touch targets **≥48px**; buttons 52px tall, inputs 54px, pills 44px.
- Radius: 8px (cards, inputs, buttons), 12px (modals), 999px (chips, pills).
- Borders: 1px for cards/dividers, 1.5px for inputs and buttons.
- Sidebar 248px; topbar 76px; desktop frame 1280×800.
- List pane 280px; side panel 300px; modal 520px default.
- Content padding 22px 28px; card rows 12–14px vertical.

### Component inventory (from `desktop-kit.js`)

`ic` icon · `chip` status · `tag` · `btn` (primary/secondary/blue/red/redFill) ·
`field` input (prefix, lead/trail icon, error, focus, hint) · `area` textarea ·
`kv` key–value row · `box` card · `lbl` uppercase label · `strip` inline notice ·
`saved` autosave indicator · `avatar` · `pill` filter · `stat` tile · `audit`
trail · `sidebar` · `shell` · `modal` · `listPane` · `detail` / `dHead` · `col` /
`panel` / `full` · `tableHead` / `tableRow` · `bars` chart.

### Branding fallback

The crest is a four-segment quartered mark. If the PNG is unavailable, render
four rounded squares in a 2×2 grid: red `#A6342C` (cross, top-left), blue
`#2E5FA3` (cup, top-right), gold `#B08A24` (dove, bottom-left), purple `#5D4487`
(crown, bottom-right) — the exact construction used by the deck's thumbnail.

## 4. Roles and navigation

Navigation is **role-aware**; users see only what their role covers. Treasurer
and Department Leader can hold multiple roles and get a role switcher.

| Role | Nav items |
| --- | --- |
| **Treasurer** | Overview · Offering · Weekly report · Expenses · Bucket rates · Notifications |
| **Senior Pastor** | Overview · Weekly report · Expenses · Department reports · Notifications |
| **Church Secretary** | Overview · Members · Visitors · Attendance · Reports · Leader approvals · Services & events · Departments · Search · Notifications |
| **Department Leader** | Overview · My reports · Notifications |
| **Usher** | Attendance · Notifications |

### Permissions

- **Treasurer** — enters and edits offerings (edits create audited revisions),
  generates financial reports.
- **Secretary** — enters Sunday attendance, manages members, approves department
  leader accounts, approves department reports, **views but never edits** finance.
- **Senior Pastor** — views everything, approves the weekly financial report,
  **edits nothing**. His screens must never offer an edit affordance.
- **Department Leader** — submits own weekly/quarterly reports. Account is
  self-created but inactive until the Secretary approves it.
- **Usher** — marks members present, adds first-timers. Nothing else.

Creating the Secretary, Treasurer and Pastor accounts is **not a screen** —
there is only ever one of each, set up directly.

## 5. Core domain rules

### Offering entry — category-first (corrected)

This supersedes the original one-breakdown-per-service design.

- The treasurer adds a **category** (Tithe, Worship Offering, Building Offering…).
- **Inside that category** she enters its own denomination count
  (₦1,000 × count, ₦500 × count …), computing that category's cash total live.
- Categories that are transfers with no physical cash — Seed Faith, Special
  Offering, Donations are almost always this type — need only a name and an
  amount, no breakdown.
- Offering-level cash total and categories total both compute automatically from
  the sum of the categories underneath.

**The treasurer never types a total, at any level.**

Cash and category totals can legitimately differ because transfers have no cash
behind them. **This difference is normal and must never be presented as an error.**

### Offering states

`draft` → `finalized` → `approved` (by Pastor), plus `revised`.

A late transfer after finalization creates a **revision, never an overwrite**.
The screen must show original total and revised total distinctly, with who
changed it, when, and why.

### Bucket account deductions

After each Sunday, a fixed percentage of specific categories is set aside into a
contingency "bucket" before the rest counts as usable income. Each category has
its own rate — e.g. Tithes and Offering 10%, Missionary Offering 40%, Sunday
School Offering 30%.

- Treasurer-maintainable rate table: category name paired with its percentage.
- The deduction is **never typed or stored** — computed live as
  `category amount × rate`.
- Shown on Offering Entry and the Full Financial Report as deduction + resulting
  net per applicable category. **Calm presentation, not styled as a warning.**

### Approvals with comment

Both Pastor approval screens (weekly financial report, weekly expenses) offer
**Approve**, **Not yet**, and a **comment** action, so he can raise a question
without it counting as approval or rejection. The comment is visible to whoever
submitted the report.

### Department report states

Editable after submission only until the Secretary begins review. Once under
review or approved, editing requires the Secretary to return it for correction.
**State must be visible to the leader at a glance.**

### Weekly financial report contents

Totals by category · cash vs transfer split · a **notes/narrative section** (the
current WhatsApp report carries explanations and an approval request, so the
generated report must support prose, not just tables) · where revised, both
original and revised figures.

## 6. Screen inventory

88 screens recovered. `(*)` marks the four approved in the first batch.

### Authentication (8)
`AUTH-001` Login (*) · `AUTH-002` Create Account · `AUTH-003` Verify Email ·
`AUTH-004` Forgot Password · `AUTH-005` Reset Password · `AUTH-006` Account
Pending Approval · `AUTH-007` Account Disabled · `AUTH-008` My Profile / Change
Password

### Church Secretary (14)
`SEC-001` Dashboard · `SEC-002` Members · `SEC-003` Member Profile (with
attendance timeline — answers "who hasn't come in six weeks") · `SEC-004`
Visitors · `SEC-005` Attendance · `SEC-006` Weekly Department Reports ·
`SEC-007` Quarterly Department Reports · `SEC-008` Department Leader Approvals ·
`SEC-009` Weekly Financial Report (view) · `SEC-010` Full Financial Report ·
`SEC-011` Search · `SEC-012` Manage Services/Events · `SEC-013` Manage
Departments · `SEC-014` Review Department Report

Plus the member-launch flow: Members empty · Add chooser · Add member · Import
register · Import complete · Set-aside rows · Resolve duplicate · Set-aside
resolved · Attendance compiled.

### Treasurer (6)
`TRE-001` Dashboard · `TRE-002` Offering Entry (*) · `TRE-003` Offering History
(filter by draft/pending/approved) · `TRE-004` View Offering (read-only) ·
`TRE-005` Weekly Financial Report · `TRE-006` Record Revision

Plus: Bucket rates · Weekly expenses · Expense history · Comment received.

### Senior Pastor (4)
`PAS-001` Dashboard (*) · `PAS-002` Weekly Financial Approval (*) · `PAS-003`
Full Financial Report · `PAS-004` Department Reports

Plus: Approve with comment · Expense approval · No pending approvals.

### Department Leader (4)
`DEP-001` My Reports (this *is* the leader's dashboard) · `DEP-002` Weekly
Report (*) · `DEP-003` Quarterly Report (achievements and projections, a
different shape entirely) · `DEP-004` View Report — one screen across submitted,
under review and approved.

### Usher (1)
`USH-001` Attendance (*) — member search and add-first-timer both live **inside
this one screen**, a search box and a modal, not separate screens.

### Shared (4)
`SHR-001` View Member · `SHR-002` Download Report · `SHR-003` Notifications
(in-app record of what the WhatsApp reminders already sent) · `SHR-004` My
Profile.

## 7. Cross-cutting requirements

### Principles
Every important task completable in **three taps or fewer** where practical ·
one obvious primary action per screen · forms faster than the paper equivalent ·
show only what the role needs · minimize typing through search, selection,
auto-complete, computed values and defaults · approval/finalization/deletion
must clearly communicate consequences.

### Accessibility (many users are 50+)
Generous font sizes · high contrast · no decorative typography · large touch
targets · tables and forms readable first · **never rely on color alone** for
status.

### Required states
Every screen that performs an action needs **loading, validation, success, error**
and an empty state where applicable.

**Offline only where confirmed: attendance capture.**

### Empty states
No attendance yet · no offering recorded · no department reports · no pending
approvals · no revisions. Each must guide toward the next action.

### Error and recovery
Design for interrupted workflows: temporary network loss, autosave where
appropriate, unsaved-change indicators, safe recovery after interruption.
Prevent accidental loss of attendance or finance data.

### Confirmation required for
Finalizing an offering · approving the weekly financial report · returning a
report for correction · deleting records · any irreversible admin action.

### Report downloads
**PDF only.** Weekly Financial Report, Full Financial Report, Weekly Department
Report, Quarterly Department Report.

### WhatsApp reminders
Automated outbound reminders (leader nudged to submit, Pastor asked to approve)
need **no new screens**. Everyone who can receive a message already has a phone
number on their profile; the church's outbound number is one-time setup.

## 8. Success metrics

| Flow | Target |
| --- | --- |
| Offering entry | A typical Sunday entered in **under 3 minutes**, zero manual total calculation |
| Attendance capture | A known member found and marked present in **under 5 seconds**, one-handed |
| Department report | Completed and submitted in **under 3 minutes**, status visible without tapping in |
| Leadership dashboard | Anything needing the Pastor's attention visible **without scrolling** on first load |
