# AuditSphere Visual Prototype — Design System Summary (MOD-UX-01)

Recorded 2026-09-27 · `docs/prototype/design-system.md`

This is a **summary of the vocabulary that already exists plus the shared layer
added by MOD-UX-01**, not a new component framework. The prototype ships two
stylesheets of design tokens and utility classes (`styles.css`, `roles.css`) and
one additive layer (`src/enterprise.css`). There is no CSS-in-JS runtime, no
design-system dependency and no build-time token pipeline.

Everything here is implementable today with the files listed at the end.

## 1. Spacing

The established utility scale, unchanged:

| Token | Value | Class |
|---|---|---|
| space 1 | 4 px | `mt4`, `gap6` (6 px), `gap8` |
| space 2 | 8 px | `mt8`, `mb8`, `ml8` |
| space 3 | 12 px | `mt12`, `mb12`, `gap12` |
| space 4 | 16 px | `mt16`, `mb16`, `gap-grid` |
| space 5 | 20 px | `mt20` |
| space 6 | 24 px | `mt24`, `mt32` |

MOD-UX-01 adds numeric tokens for the new primitives only, so future work has one
place to change rhythm: `--sp-1` … `--sp-6` (4/8/12/16/20/24 px).

**Rules used by the shared primitives:** stack gaps are 20 px between page
sections and 10–14 px inside a panel; panel padding is 20 px (`panel-pad`), 16 px
below 760 px; table cell padding is 15 px/17 px (13 px under 1250 px).

## 2. Typography

| Role | Size / weight | Where |
|---|---|---|
| Page title | 29 px / 650, `-1px` tracking | one `h1` per routed page |
| Panel title | 15 px / 650 | `panel-head h2`, `h3` in panels |
| Body | 15 px / 400, 1.55 line-height | `body` |
| Data | 12 px | tables, inputs |
| Secondary | 11–12 px, `--muted` | `.sub`, `.caption`, `.cell-sub` |
| Eyebrow | 11 px / 750, 1.7 px tracking, uppercase | `.eyebrow` |
| Identifier | monospace 12 px | `.mono` |
| Numerals | tabular | `.num`, `.tabular`, `.metric-value` |

Long-form help text is capped at 75–80 characters (`.sub`, `.page-subtitle`).

## 3. Status semantics

One mapping from every stored status value to one of eleven tones, in
`src/services/lifecycle.ts` (`statusSemantics`). A tone carries a colour **and** a
shaped left border **and** an accessible description, so meaning never depends on
colour alone.

| Tone | Means | Example values |
|---|---|---|
| `neutral` | nothing started, informational | Draft, Not started, Not configured, Recorded manually |
| `progress` | work happening and owned | In progress, Active, Submitted, Received, Ready, Open |
| `waiting` | waiting on someone else, not an error | Requested, Pending, Needs clarification, Not reflected, Outcome unknown |
| `review` | awaiting an independent decision | In review, Under review, Pending review, Technical review |
| `returned` | sent back for rework | Returned, Reopened, Changes required, Differences noted, Exceptions noted |
| `blocked` | a named predecessor must be resolved | Blocked, Overdue |
| `stale` | derived output no longer matches its source | Stale |
| `approved` | a human decision is recorded | Approved, Cleared, Accepted, Adequate, Reporting included |
| `complete` | good terminal state | Completed, Closed, Archived, Retired, Published, Not applicable |
| `terminal-bad` | journey ended without delivery | Cancelled, Rejected, Withdrawn, Expired, Revoked, Declined, Lost, Unqualified |
| `simulated` | prototype simulation surface | Simulated accepted / failed / verified / error |

Rendering: `<StatusBadge status="…" />` emits the literal status text as its only
text node, `data-status-tone` for styling and tests, and `aria-label`/`title` with
the plain-language meaning. Terminal tones are never marked actionable
(`isActionableStatus`), which is what lets a module grey out or omit a next action
correctly.

## 4. Layout patterns

**Page anatomy** (`PageHeader`, `ModulePageHeader`):

```
identity (breadcrumb-ish context line)
Module title                         status · actions
Client · Engagement · Period · Currency · Lifecycle · Manager · Revision
───────────────────────────────────────────────────────────────────────
lifecycle hint strip (how this module's work moves)
sections: panels, grids, tables
```

- Exactly one `h1` per rendered page; asserted on every route in Chrome.
- The identity line is derived from the store through the same scope guards the
  module uses, so it cannot advertise an unreachable client or engagement.
- Grids: `.grid-main` (2.4:1 working area + side panel), `.grid2`/`.grid-2`/`.grid-3`/`.grid4`,
  `.metric-grid` (4 across, 2 under 1000 px).
- Every grid child carries `min-width: 0` so a wide table can never widen the page.

## 5. Table patterns

- Always inside `.tablewrap` (`overflow-x: auto`) so a wide table scrolls instead
  of pushing the page: the 1024 px Proposals overflow found during this work was
  exactly this failure mode.
- Header row: uppercase 11 px on `#f8fafa`, no wrap.
- First column identifies the record (`<b>` + `.cell-sub` for the id).
- Row actions are small buttons; the row itself is not clickable, so keyboard
  users get a single, predictable target.
- Empty and no-match answers render through `ListState` with `colSpan`, so an
  empty table explains itself instead of showing a blank body.
- Long identifiers use `.mono`; amounts use `.tabular`/`.num`.

## 6. Form patterns

- `.field` (label + control + helper) and `.field-grid` (2 columns, collapsing to
  1 below 760 px); `.field-grid .full` spans both.
- Required inputs use the native `required` attribute; helper text sits in
  `<small>` inside the field, and every control carries an `aria-label` or a
  `<label>`.
- Validation messages are `role="alert"` next to the control that failed, and
  cross-field rules state the consequence before saving (for example an engagement
  scope change lists what it will invalidate).
- Draft protection is app-wide: `UnsavedFormGuard` plus the shell's dialog guard
  means no route, persona or context change silently drops an edit
  (`tests/e2e/app.test.ts` VP-003 family).
- Progressive disclosure uses `<details>` for history, prior revisions and
  advanced tables rather than hiding critical state behind a tab.

## 7. Dialog, drawer and page rules

| Use | Surface | Rule |
|---|---|---|
| Confirmation, small edit, return reason, status transition, simple creation | dialog (`.modal-backdrop .modal`, or `.modal-overlay .modal-card`) | bounded task, focus trapped, Escape/backdrop never silently discards edits |
| Record preview, activity, related information, quick review | side panel / `<details>` | read-mostly |
| Workpapers, statements, packages, consolidation, multi-section configuration | full page | complex work stays on a page, not in a modal |

The shared dialog runtime keeps `role="dialog"`, `aria-modal`, an accessible name,
focus trapping, focus restoration and an unsaved-changes prompt. New dialogs must
not opt out (`data-dismiss-guard`) unless they confirm through their own handler.

## 8. Lifecycle, review and staleness patterns

- **`LifecycleStepper`** — declare the model's steps and each step's state
  (`done` / `current` / `blocked` / `pending` / `skipped` / `not-applicable`), with
  the owner or the blocking reason. `LIFECYCLE_MODELS` holds the seven declared
  models; `MODULE_LIFECYCLE_MODEL` says which one each route reports.
- **`ModuleLifecycleHint`** — the one-line strip naming the module's journey and
  its steps.
- **`BlockerNotice`** / **`StaleNotice`** — answer four questions in a fixed order:
  *Why* · *Affected* · *Preserved* · *Required*. Never a bare "Error" or
  "Cannot continue".
- **`ProvenancePanel`** / **`ReviewPanel`** — prepared by, prepared date,
  submitted revision, reviewer, review status, return reason, approval actor,
  exact revision approved.
- **`ActivityTimeline`** — created / edited / submitted / reviewed / returned /
  resubmitted / approved / staled / reopened / issued / archived events with actor,
  role, time, revision, reason and previous → new state.
- **`StateBlock`** and **`ListState`** — the four different empties: nothing
  exists, nothing matches the filters, everything is outside your scope, and the
  list failed to load. Counts of records outside the reader's scope are never
  disclosed.
- **`HandoffLinks`** — contextual "open the source TB / view evidence / open the
  journal / view the package" navigation, so work continues without duplicating
  records.

## 9. Accessibility rules the shared layer enforces

- One `h1` per page; panels use `h2`/`h3` in order.
- Status: visible text + tone + `aria-label`; nothing is conveyed by colour alone.
- Lists and notices announce themselves (`role="status"`, `role="alert"` for
  failures).
- Disabled actions are either not rendered for a role that may not act, or
  accompanied by a plain reason; they are never rendered as an enabled no-op.
- Focus: a visible 3 px outline on every interactive element, a skip link, focus
  trapping and restoration in dialogs, and a mobile drawer that stays out of
  keyboard order while off-canvas.
- Responsive: the shared primitives stack at 1000 px and 760 px; the route sweep
  asserts no page-level horizontal scroll at 1440, 1024 and 390 px.

## 10. Files that define the system

| File | Contents |
|---|---|
| `styles.css`, `roles.css` | existing tokens, utilities, chrome and legacy role views |
| `src/enterprise.css` | the additive layer: tokens for the new primitives, the previously missing utility classes, status badges, page anatomy, lifecycle, notices, list states, provenance, review and timeline styling, responsive rules |
| `src/services/lifecycle.ts` | status → tone/meaning/terminal mapping, lifecycle models, blocker descriptions |
| `src/services/routeRegistry.ts` | one registration per route: label, group, kind, record, lifecycle, next step, handoffs |
| `src/components/common/Enterprise.tsx` | the shared components listed above |
| `src/components/common/Icons.tsx` | the 30 inline SVG icons (no icon font, no external asset) |

## Deliberate non-goals

- No theme system, no design tokens package, no component library publication.
- No dark mode: the prototype demonstrates one professional light theme.
- No animation beyond a 0.16–0.2 s transition, and `prefers-reduced-motion`
  disables even that.
- No decorative illustration set; empty states use the existing icon set and text.
