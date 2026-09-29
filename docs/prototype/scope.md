# Current target scope

The target lifecycle supersedes the old 39-module demo surfaces. [Current plan](target-lifecycle-plan.md) · [Rehearsal](target-lifecycle-demo.md) · [Executed report](target-lifecycle-report.md). Browser-only storage and simulation boundaries remain in force. Historical scope records below are retained for traceability.

---

# AuditSphere Visual Prototype — Current Supported Scope (VP-001)

Version 1.1 · recorded 2026-09-23 · revised 2026-09-26 for GL intake fields, the
per-feature storage wording and the reserved prototype testing identity ·
`docs/prototype/scope.md`

This is the single visible supported-product scope. Anything outside it is not
offered in navigation, setup, gates, catalogues, templates or release prerequisites.

## In scope (browser-only interactive prototype)

Practice dashboard · CRM & client management · leads & opportunities · proposals &
engagements · jobs, one-level tasks/subtasks, manually applied job templates ·
internal notes/mentions (in-app notices only) · SharePoint-first document library
(canonical) · optional bounded OneDrive selection/import · basic outgoing mail
simulation + manual incoming-call/meeting/email notes · client portal (explicitly
shared records only) · PBC request/response/acceptance loop · time, versioned
budgets, invoice drafts from explicit sources, independent review, local issue,
credit notes, offline receipts/allocations, as-of aging · import-first accounting
(TB/GL intake with bounded column mapping plus optional service-date and
Department/Cost centre/Project dimension values, mappings, journals that can pin
supporting evidence/workpaper/finding revisions, reconciliations, statements,
packages that record the exact TB and GL source lineage) ·
bounded group consolidation (perimeter, pinned packages, FX table, eliminations) ·
acceptance, planning/materiality, risks/programs, fieldwork, populations/sampling,
workpapers, evidence catalogue, findings, review points, revision-bound approvals
with per-engagement EQR, completion/release candidate + dispatch simulation,
amendment lineage, logical archive index · deterministic reports · scoped search ·
firm administration · simulated M365 setup (Entra concept, Graph transport concept,
SharePoint, Exchange basic mail, optional OneDrive).

Fixed demo clock: `asOfDate = 2026-09-23`. Money in integer minor units per record
with currency retained; time in integer minutes; line-level rounding then sum.

## Hard exclusions (never offered, never gated)

All application AI/agents/integrations/Copilot/summaries/semantic-vector search ·
mobile apps · online payments/gateways/bank feeds · eSignatures/signature capture ·
tax preparation/filing/organisers · payroll execution/administration ·
workflow/close automation (rules engines, schedulers, reminders, recurring
tasks/jobs/invoices, auto-renewals) · advanced email (inbox/Triage, sync, routing,
email-to-task, polling, Outlook add-in) · non-M365 business integrations (Google,
Dropbox, Xero/QBO, Slack, Zapier, SMTP/Resend, etc.) · Microsoft Purview in any
form (no adapter, no gate, no prerequisite) · SOC 2 certification / bespoke
encryption feature work.

Allowed ordinary behaviour: deterministic calculations, text search, validation,
arithmetic, content hashes, HTTPS hosting, escaping, access-view checks.

## Simulation honesty rules

- Microsoft surfaces are simulations: `liveConnected` is always false. No OAuth,
  credentials, tokens, tenant provisioning, or external calls.
- Issued invoices change local demo records; nothing sends a demand for payment.
- Approvals record human decisions; nothing is an electronic signature.
- Uploads differ by feature: accepted PBC response bytes and their digests persist
  in browser-local IndexedDB across reload, while library document registrations and
  workpaper/evidence attachments keep metadata + hash only and the original bytes
  stay in-session (reselect after reload). Synthetic fixtures are downloadable and
  labelled.
- Client projections show explicitly shared records only.
- The seeded `superuser` identity is a presenter/test tool, not a product role: it
  reaches every supported route and records a labelled `Prototype Superuser Override`
  event whenever it acts against its own work. It never relaxes validation, revision
  staleness or client-portal disclosure filters, and it is not an independent approval.

## Amendment PROTOTYPE-AGENT-ACCEPTANCE-001 (recorded 2026-09-27)

The repository owner authorized Claude Code to implement, review and approve this
**synthetic browser-only prototype** for demonstration. This replaces the human-only
software/product-owner acceptance and presenter-sign-off prerequisites for prototype
delivery (including VP-063/VP-064 and the module rehearsal sheet). It does not claim
that any earlier human review took place, and earlier wording above is kept as history.

| Topic | Handling |
|---|---|
| Acceptance actor | Claude Code, after implementation, executed tests and a documented review pass. Provenance fields: `reviewer_kind=AI_AGENT`, `acceptance_scope=BROWSER_ONLY_PROTOTYPE`, `decision=APPROVED_FOR_DEMO` (or `CHANGES_REQUIRED`). |
| Review honesty | A review in the same session is disclosed as AI self-review, not independent human assurance. |
| Unchanged | Original MOD/VP/AC/AT identities and wording; tests; history; exclusions; simulated preparer, reviewer, manager, client signatory, partner and EQR separation. The superuser never counts as independence evidence. |
| Not approved | Professional methodology or opinions, real postings, live providers, production security/retention, the separate AuditSphere repository, deployment. |
| Still blocking | A failed or missing in-scope behaviour, an unexecuted required test, corrupt output or an unresolved regression — never the absence of a human demo signature. |

Using Claude Code as a development/review tool is not an application AI feature; the
product exclusions above are unchanged.

## Historical source

Predecessor artefacts (`base-app.js`, `role-views.js`, `AuditSphere_All_Role_Portals_v2.html`,
old standalone builds, old test counts) may mention excluded products. Where shown
deliberately they carry the label “Historical source — not current product scope”
and enable no business action. The current-scope views above are the default.
