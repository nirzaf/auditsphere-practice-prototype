# US-UIUX-001 — Requirements-Only AuditSphere Prototype with AuditSphere Visual Parity

## Status
Proposed

## Baselines
- Functional authority: **STE Audit Management Tool — Functional Requirements & End-to-End System Workflow Specification v2.1**
- Prototype: `nirzaf/auditsphere-visual-prototype` at `654c61f1f490618de020ddbfdeccfb778f63ffc6`
- Visual reference: `nirzaf/AuditSphere` at `5d1009dd59d9f888cf9b626bb5823f1578493521`
- Visual source files:
  - `src/AuditSphereOps.Web/Components/Theme/AuditSphereTheme.cs`
  - `src/AuditSphereOps.Web/wwwroot/enterprise-ui.css`
  - `src/AuditSphereOps.Web/Components/Layout/MainLayout.razor`

## User Story
**As an STE Audit user reviewing the prototype, I want the prototype to implement only the capabilities and workflow explicitly defined by STE Functional Requirements v2.1, while matching the current AuditSphere application’s visual system, colors, shell geometry, typography, spacing, responsive behavior, and component styling, so that the prototype accurately demonstrates the target audit lifecycle without implying additional product scope.**

---

## 1. Strict Functional Scope

The visible prototype shall expose only these five business modules:

1. **Module 1 — Commercial & CRM Pipeline**
2. **Module 2 — Administration, Governance & Planning**
3. **Module 3 — Technical Execution & Audit Fieldwork**
4. **Module 4 — Reporting & Final Deliverables**
5. **Module 5 — Practice Analytics & Internal Bookkeeping**

The only additional visible surfaces may be:
- Client PBC Portal.
- Requirements Presentation / Reference, clearly outside the five operational modules.

The canonical lifecycle shall contain exactly these 11 states:

`LEAD_INGESTION → PROPOSAL_GENERATION → DUAL_KEY_PENDING → ADVANCE_BILLING → PORTAL_ACTIVE_PLANNING → FIELDWORK_EXECUTION → MANAGERIAL_REVIEW → PARTNER_APPROVAL → DELIVERABLE_RELEASE → COMPLIANCE_COUNTDOWN → ARCHIVED_READ_ONLY`

Do not expose another 19-stage or 39-module model as a second canonical lifecycle.

Supporting records such as AJEs, findings, evidence, workpapers, review notes, materiality revisions, confirmations, invoices, receipts, time entries and firm-ledger entries are permitted only when they support the five required modules.

---

## 2. Remove or Hide Out-of-Scope Product Surfaces

Normal user navigation must not expose:
- Generic jobs/job-template management.
- Generic communications centre.
- Standalone budget product separate from resource scheduling.
- Generic receivables product beyond required advance/final billing and AR aging.
- Generic accounting-workbench product.
- Generic GL transaction-entry product.
- Generic reconciliation product.
- Generic financial-package product outside the required audit deliverables.
- Consolidation/group reporting.
- Generic EQR/quality centre.
- Generic approvals centre.
- Technical/service catalogue unrelated to the required proposal flow.
- Full Microsoft 365 tenant-administration UI.
- Historical “39 modules” coverage.
- Legacy VP/MOD identifiers as client-facing IA.
- Generic global search as a required business feature.

Prototype/presenter utilities such as scenario selection, reset state, import/export state, simulated identity switching, superuser override, and debug tools must be moved behind a clearly separated **Presenter / Demo Controls** mode and hidden in the normal product experience.

Remove root-level development residue such as `debug_acceptance.ts`.

---

## 3. Requirements-Only Navigation

### Module 1 — Commercial & CRM
- Lifecycle Overview
- Lead Ingestion
- Client Profiles
- Quotes & Proposals
- Engagement Letter
- 50% Advance Invoice & Receipt

### Module 2 — Governance & Planning
- Acceptance / Continuance
- Engagement Directory / PBC Workspace
- Resource Scheduling
- Trial Balance Ingestion & Mapping
- Materiality & Planning

### Module 3 — Technical Fieldwork
- Split P&L / Balance Sheet Dashboard
- Workprograms & Evidence
- Sampling
- External Confirmations
- Review / SRM

### Module 4 — Reporting & Archive
- Audit Opinion & 5-Part Bundle
- Final 50% Fee
- 60-Day File Completion / Archive Lock

### Module 5 — Practice Management
- Daily Engagement / FSLI Time
- Profitability & Utilization
- Internal Firm Ledger / TB / P&L / AR Aging

### Client Portal
- PBC Requests & Uploads
- Invoices & Receipts
- Holding Letters
- Released Final Deliverables

Requirements Presentation must be under a **Reference / Specification** area, not inside Module 5.

---

## 4. Exact AuditSphere Visual Tokens

Use the current AuditSphere theme as the visual authority.

| Token | Exact value |
|---|---|
| Primary | `#2B6CB0` |
| Secondary / dark teal | `#0B6B65` |
| Tertiary / navy | `#0F172A` |
| Info | `#2B6CB0` |
| Success | `#15803D` |
| Warning | `#B45309` |
| Error | `#B91C1C` |
| Text Primary | `#17212B` |
| Text Secondary | `#526176` |
| Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Drawer Background | `#0F172A` |
| Drawer Text | `#E2E8F0` |
| App Bar Background | `#FFFFFF` |
| App Bar Text | `#17212B` |
| Border | `#E2E8F0` |
| Control Border | `#7E8A9C` |
| Decorative Teal Accent | `#38B2AC` |
| Deep Navy | `#0B1220` |

Remove any claim that the prototype palette is sourced from `steaudit.com`; the visual source is the current `AuditSphere` repository.

Semantic use:
- Blue = primary action / information.
- Dark teal = secondary contrast-safe interaction.
- `#38B2AC` = decorative/active-navigation accent.
- Green = success.
- Amber = warning.
- Red = error/danger.
- Navy = application chrome.

---

## 5. Typography

Use:
```css
font-family: system-ui, sans-serif;
font-size: 0.875rem;
```

Theme typography:
- H1: `1.75rem`, weight `700`
- H2: `1.25rem`, weight `700`
- H3: `1.15rem`, weight `700`
- Buttons: no uppercase transformation, weight `700`
- Sidebar links: `13px`, approximately weight `550`
- Sidebar group label: `11px`, weight `700`, `.09em`, uppercase

AuditSphere responsive workspace H1:
```css
font-size: clamp(1.5rem, 2.2vw, 1.9rem);
line-height: 1.2;
letter-spacing: -0.025em;
```

Remove the prototype’s `Inter`-first font stack.

---

## 6. Shell Geometry

### Top App Bar
Match AuditSphere:
```css
min-height: 73px;
background: #FFFFFF;
color: #17212B;
border-bottom: 1px solid #E2E8F0;
box-shadow: none;
```

Do not use translucent app-bar backgrounds or backdrop blur.

### Sidebar
```css
width: 232px;
background: #0F172A;
color: #DCE7F4;
border-right: 1px solid #0B1220;
```

Nav container:
```css
padding: 16px 12px 24px;
```

Group label:
```css
margin: 20px 12px 7px;
color: #9AAEC6;
font-size: 11px;
font-weight: 700;
letter-spacing: .09em;
text-transform: uppercase;
```

Nav link:
```css
color: #DCE7F4;
border-radius: 6px;
min-height: 39px;
font-size: 13px;
font-weight: 550;
```

Hover:
```css
background: #1E304E;
color: #FFFFFF;
```

Active:
```css
background: #233B59;
color: #FFFFFF;
box-shadow: inset 3px 0 #38B2AC;
```

Current parent section:
```css
background: #1B2E48;
color: #FFFFFF;
box-shadow: inset 3px 0 #2F7D86;
```

### Workspace
```css
padding: 28px 30px 40px;
max-width: 1600px;
min-width: 0;
```

---

## 7. Panels, Forms, Metrics and Tables

### Panels
```css
background: #FFFFFF;
border: 1px solid #E2E8F0;
border-radius: 10px;
box-shadow: 0 2px 8px #0F172A08;
```

Theme default control radius is `6px`. Remove the prototype’s generic `14px` panel radius.

### Form Controls
- Use `#7E8A9C` normal border.
- Use AuditSphere primary/focus treatment.
- `width: 100%`, `min-width: 0`, `max-width: 100%`.
- Selects must not size the page to their longest option.
- Labels/help text use `#526176`.

### Tables
- White surface.
- `#E2E8F0` separators.
- Numeric values right-aligned with tabular numerals.
- Wide tables scroll inside their container.
- No document-level horizontal overflow.
- Total rows use a top divider and bold text.

### Metric Cards
- White surface.
- Thin line border.
- Approximately `104px` minimum height.
- Compact overline/label.
- Large tabular numeric value.
- No decorative gradient.

---

## 8. Consistent Page Header

Every operational route should use:
1. Optional module overline.
2. Page title.
3. One concise description.
4. Consistent action area.

Overline:
```css
color: #075F57;
font-size: 11px;
font-weight: 700;
letter-spacing: .09em;
```

Description:
```css
color: #526176;
max-width: 75ch;
line-height: 1.5;
```

---

## 9. Responsive UX

Mirror AuditSphere’s responsive drawer behavior:
- Desktop (`md` and above): drawer open by default.
- Smaller viewport: responsive/collapsible drawer through menu button.
- No fixed desktop sidebar that makes small-screen content inaccessible.

Validate at:
`320`, `390`, `760`, `1024`, `1440`, `1920` px.

Acceptance:
- No document-level horizontal overflow.
- Tables scroll locally.
- Actions wrap.
- Form grids collapse cleanly.
- Presentation controls remain usable.
- Dialogs fit small screens.

---

## 10. Accessibility

Preserve or improve:
- Skip link to main content.
- Visible keyboard focus.
- Keyboard-operable drawer.
- Proper headings.
- Form label association.
- Active-navigation indication (`aria-current` or equivalent).
- Dialog focus trap and focus restoration.
- No silent discard of edited forms through Escape/backdrop/navigation.
- WCAG-appropriate contrast.
- No color-only meaning.

---

## 11. Requirements Presentation

The React deck and standalone presentation must use the same requirements-only content source.

Remove presentation slides for:
- Generic practice search.
- Jobs/templates.
- Generic communications.
- Generic accounting/reconciliation products.
- Consolidation.
- Generic M365 administration.
- Generic firm administration.
- Historical 39-module coverage.
- Any discovery module not in STE v2.1.

Recommended deck:
1. Cover / v2.1 context
2. Business objectives and ISA context
3. Four personas
4. Five-module connectivity
5. Exact 11-state lifecycle
6. Flow 1
7. Module 1 detail
8. Flow 2
9. Module 2 detail
10. Flow 3
11. Module 3 detail
12. Flow 4
13. Module 4 detail
14. Flow 5
15. Module 5 detail
16. Client PBC experience
17. Traceability / client sign-off summary

Never present “39 modules” as target product scope.

---

## 12. Functional Corrections Required Before Visual Sign-Off

### Acceptance / Continuance
- Track A management integrity and financial viability must be mandatory.
- Track B answers must not default to successful values.
- Track B checklist, assessment type and prior-period reference must persist/reload.
- New fields must participate in dirty-form save/discard.
- Case selection must bind exact engagement/client/service/period.

### Materiality
- Use one shared UI/store validator.
- Store must enforce benchmark bands, TE 50–75%, SAD 3–5%.
- ±5% manager rounding must persist.
- Direct store commands must not bypass Partner-only final planning approval.
- TB changes stale current approval.

### Analytical Review / Going Concern
- Checklist must not default to passed.
- Sign-off must persist analysis, checklist, source revisions, actor and timestamp.
- Sign-off must update the applicable procedure/review state.
- Changes to TB/mapping/plan must stale prior sign-off.

### Confirmations
- Persist generated Holding Letters with source blockers, revision, recipient and simulated issue state.
- Holding Letter must never clear the critical-confirmation release blocker.
- Portal shows only actually generated/issued letters.

### Sampling
- Correct Systematic Random so non-integer intervals do not exclude the population tail.
- Keep Stratified Attribute distinct and explicitly documented.

### Profitability
Use the exact v2.1 formula:
```text
Total Engagement Cost = Σ(Logged Hours × Role Charge-Out Rate)
Engagement Profitability = Contracted Audit Fee - Total Engagement Cost
```
Do not substitute internal staff cost rate for charge-out rate. Missing rate inputs display `Unknown`, not full-fee profit or `100%`.

---

## 13. Definition of Done

Complete only when:
- Normal UI exposes only the five STE v2.1 modules plus portal/reference.
- Canonical lifecycle is exactly 11 states.
- No visible 39-module/legacy product scope remains.
- Requirements deck is v2.1-only.
- `debug_acceptance.ts` and other debug residue are removed.
- Presenter utilities are hidden outside normal product navigation.
- Required supporting records remain available inside their owning v2.1 modules.
- Prototype colors, typography, sidebar, app bar, spacing, panels and responsive behavior match the AuditSphere reference.
- Functional state and visual state agree.
- Type-check/build succeeds.
- Focused unit tests cover corrected business rules.
- Browser/E2E tests cover the five end-to-end flows and PBC client flow.
- Visual checks capture at least Lifecycle Overview, Proposal, Acceptance, Materiality, Split Dashboard, Fieldwork, SRM, Deliverables, Archive, Practice Analytics, PBC Portal and Requirements Presentation at desktop/mobile widths.
- Simulated email, M365 provisioning, authentication, digital signature, immutable storage and payment are clearly labelled simulations.

## Verification Handover

Record:
- Final prototype SHA.
- AuditSphere reference SHA.
- Changed files.
- Removed/retained routes.
- Exact design tokens used.
- Test commands/results.
- Responsive viewport results.
- Visual evidence/screenshots.
- Any remaining production-only limitations.

Do not call the prototype “100% compliant” unless the functional requirement, persisted behavior, command guard, downstream output and matching presentation all have executed evidence.
