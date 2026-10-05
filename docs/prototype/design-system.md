# AuditSphere Visual Prototype — Enterprise UX Design System (summary)

`docs/prototype/design-system.md` · recorded 2026-09-27 · scope: the browser-only synthetic prototype
defined in [`scope.md`](scope.md). This is a vocabulary for consistent screens, not a component
framework: every primitive below is a small React component or CSS rule that already exists in the
repository and is reused by modules. Direction: *minimal Swiss / dense-but-readable professional
workflow* (UI/UX Pro Max `--design-system` for "enterprise audit accounting SaaS", density 8, motion 2),
using the steaudit.com colour palette (navy/blue/teal, see *Colour* below) and the existing system font stack
(the CSP allows no web-font hosts).

## 1. Foundations

| Token | Values | Where |
|---|---|---|
| Spacing | 4 · 8 · 12 · 16 · 20 · 24 px (`--space-1`…`--space-6`) | `src/enterprise.css` |
| Radius | 6 px controls/badges, 10 px cards/notices, 15 px dialogs | `--radius-sm`, `--radius-md`, `.modal` |
| Type scale | h1 24 px · h2 18 px · h3 15 px · h4 13 px · body 15 px (16 px ≤760 px) · caption 11–12 px | `styles.css` + `enterprise.css` |
| Numbers | `font-variant-numeric: tabular-nums` in every table cell; amounts `nowrap` (`td.num`) | `enterprise.css` |
| Colour | Source palette defined once in the first `:root` of `styles.css` (exact steaudit.com `app/globals.css` values): `--color-brand-primary` #0F172A navy (sidebar/dark chrome, headings, body text), `--color-brand-primary-dark` #0B1220, `--color-brand-secondary` #2B6CB0 blue (primary actions with white labels, links, active tabs, current workflow step), `--color-brand-accent` #38B2AC / `--color-brand-accent-alt` #6EE7E0 teal (accents on dark chrome only; teal fills carry navy labels), `--color-brand-neutral` #E2E8F0 (subtle dividers), `--color-site-bg` #F8FAFC (app background), `--color-white`, `--color-black`. Derived UI adaptations (not steaudit.com colours): `--action-hover` navy / `--action-active` deeper navy, `--action-tint` #EEF3F9 and `--action-tint-strong` #BFD3E7 (selection/hover tints), `--muted` #526176, `--ui-control-border` #7E8A9C (≥3:1 input/select boundary), `--ui-border` #CBD5E1, `--ui-subtle` #F1F5F9, `--chrome-text` #CBD5E1 / `--chrome-text-strong` #F1F5F9 (sidebar menu items, weight 600; active item white, 700) / `--chrome-muted` #94A3B8 / `--chrome-raised` #1E293B on dark chrome. `--teal`, `--teal2`, `--tealsoft` are brand-action compatibility aliases (blue, navy, blue tint); success uses the semantic `--st-green-*` tokens | `styles.css` |
| Focus | 3 px `--focus-ring` (#2B6CB0) outline, 3 px offset, on every interactive element; on dark chrome (sidebar, portal/role banners, `.chrome-dark`) the ring is `--focus-ring-dark` (#6EE7E0) | `styles.css` |
| Motion | 150–200 ms colour/border transitions only; `prefers-reduced-motion` disables them | `styles.css`, `enterprise.css` |

## 2. Status semantics (single source: `src/services/statusSemantics.ts`)

Every status literal in `src/types/index.ts` maps to one semantic kind (unit-tested). A status is always
**text + glyph + tone** (`StatusBadge`), never colour alone; the tooltip carries the meaning.

| Kind | Meaning | Tone | Glyph | Examples |
|---|---|---|---|---|
| draft | Not yet submitted | gray | dot | Draft, Not started, Planned, Inquiry |
| progress | In progress | blue | half circle | In progress, Open, Active, Planning |
| waiting | Waiting on another party | amber | clock | Requested, Presented, Pending verification |
| submitted | Submitted, awaiting review | blue | arrow up | Submitted, Received, Responded |
| review | In review | purple | eye | In review, Under review, Internal review, Technical review |
| returned | Returned — changes required | orange | undo | Returned, Changes required, Needs clarification, Reopened |
| blocked | Cannot proceed | red | stop | Blocked, Deficient, Suspended, Uncorrected, Overdue |
| stale | Source changed after preparation | orange, dashed | alert | Stale |
| approved | Approved | green | check | Approved, Reviewed, Published, Adequate |
| complete | Completed | green | check circle | Completed, Cleared, Accepted, Paid |
| issued | Issued / released | teal | send | Issued, Released |
| closed / cancelled / archived / superseded | Terminal | gray (cancelled and superseded struck through) | lock / x / box / layers | Closed, Cancelled, Archived, Superseded, Retired |
| failed | Rejected / declined | red | x | Rejected, Declined, Lost |
| simulation | Simulated — no external system contacted | indigo, dashed | flask | Simulated accepted, Simulated verified |

Legacy `.badge` call sites share the same tones and add a CSS glyph (✓ / ! / •) that is not part of the
accessible text.

## 3. Page anatomy

```
Breadcrumb: Section / Module  [ROUTE CODE]            (shell topbar)
Context bar: Client · Engagement · Period · Mode · Package revision
[How this module works ▸]  collapsed guide: steps, outcome, failure path, record lifecycles
Page head: h1 title · one-line purpose · primary action(s)
Lifecycle panel (stateful records): stepper · state · facts · blockers · next action · downstream impact
Stale banner (when an upstream source moved)
Working area: registers, forms, tabs
Record detail: lifecycle + history timeline + related-module handoff bar
```

Not forced where it hurts usability: catalogue/reference routes (Requirements, Module Guide) keep their
document layout, and client-portal personas do not see presenter guidance.

## 4. Shared primitives (`src/components/common/`)

| Primitive | File | Rule |
|---|---|---|
| `StatusBadge` | `StatusBadge.tsx` | Status text + glyph + tone; optional qualifier rendered in the same text node (`Draft · r2`). |
| `Notice` | `Feedback.tsx` | Outcome message. Errors/warnings are `role="alert"`, success/info `role="status"`; dismissible. |
| `EmptyState` / `EmptyTableRow` | `Feedback.tsx` | Three distinct variants: **none** (nothing exists), **filtered** (filters exclude records), **scope** (nothing permitted — never reveals restricted counts). Create actions only when the role can create. |
| `StaleBanner` | `Feedback.tsx` | Source changed (from → to), affected items, historical decision preserved, required action. |
| `GateList` | `Feedback.tsx` | Readiness gates with explicit PASSED / BLOCKED text and the precise reason. |
| `ActionReason` | `Feedback.tsx` | Why an action is unavailable or will be refused (e.g. "You prepared this draft; another person must approve it"). The store remains the authority: SoD-protected buttons stay clickable so the enforced denial is demonstrable. |
| `LifecyclePanel` / `LifecycleStepper` | `Lifecycle.tsx` | Driven by `src/services/lifecycles.ts`; shows done / current / returned / blocked / stale / terminal steps with `aria-current="step"`. |
| `ActivityTimeline` | `ActivityTimeline.tsx` | Actor · timestamp · revision · reason · from → to, labelled "Browser-local demo history — not a tamper-evident audit trail". |
| `ModuleGuideStrip` | `ModuleGuideStrip.tsx` | Collapsed "How this module works" from `moduleGuideContent.ts` + lifecycle paths. |
| Work queues | `services/workQueues.ts` | Deterministic, scope-filtered projections (My work, Waiting for my review, Returned to me, Waiting on client, Blocked or stale, Ready for release); counts equal list lengths by construction. |

## 5. Tables and lists

* Header row with muted uppercase labels; tabular numbers; amounts and dates never wrap.
* Status column always uses `StatusBadge`; rework flags (Returned, Overdue) stack under the status.
* Selected master/detail row: `--action-tint` background + 3 px brand-blue left rule (`tr.selected-row`, `tr.row-selected`).
* Record identifiers that open a detail view are `tablelink` buttons with an explicit `aria-label`.
* Empty rows use `EmptyTableRow` so the header context stays visible.
* Wide registers scroll inside `.tablewrap`; the page body never scrolls horizontally (390/1024/1440 px tested).

## 6. Forms

* Visible labels above inputs (never placeholder-only); helper text in `.caption`.
* Dense filter bars use `.filter-grid` (auto-fit, labelled controls).
* Validation messages come from the store's guard errors and are shown next to the action that failed
  (inline `Notice` inside the dialog for dialog forms, page `Notice` otherwise).
* Unsaved-change protection: every draft registers an `UnsavedFormGuard`; route, persona, engagement,
  scenario and search changes ask to save, discard or stay (unchanged from VP-003).

## 7. Dialog vs drawer vs page

| Use | Pattern |
|---|---|
| Confirmation, small edit, return reason, status transition, simple creation | Dialog (`.modal-backdrop .modal` or `.modal-overlay .modal-card`) with focus trap, Escape/backdrop dismissal guard and focus restoration (App-level). |
| Record preview, lifecycle, history, related records | Inline detail panel below the register (invoice, workpaper, package). |
| Complex work (workpapers, statements, packages, consolidation, multi-section configuration) | Full page with tabs (`.tabs .tab-btn`, `aria-pressed`). |

Destructive and terminal actions state **impact, what is kept, and reversibility** before asking for the
required reason (`src/services/terminalActions.ts`). They currently use the browser's native prompt for
the reason text (see remaining limitations).

## 8. Lifecycle and review patterns

* Lifecycles are defined once in `src/services/lifecycles.ts` and generated into
  [`lifecycle-matrix.md`](lifecycle-matrix.md); nothing invents transitions the store lacks.
* Returned work is a first-class rework state (orange, undo glyph) with the reason, who returned it and the
  resubmission path — never styled as an error.
* "What changed since last review" (`src/services/reviewDiff.ts`) lists deterministic field differences
  against the last clearance or submission (revision, workbook, evidence events, assignments, source).
* Stale items keep their historical approval visible and say exactly which upstream revision moved.
* Superuser actions remain labelled `Prototype Superuser Override` and never count as independence.
