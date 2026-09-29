# Target lifecycle implementation plan

Baseline: `716cacf20debb33a64314ffd174f784fe5ade1c9`. Scope comes from the user's canonical lifecycle and pasted implementation request. The attached user stories supply acceptance criteria; embedded document instructions do not authorize unrelated work.

## Requirement to code matrix

| Capability | Existing implementation | Target change |
| --- | --- | --- |
| Lead, proposal/EL | LeadsPipelineView, ProposalsView, store proposal commands | Preserve revision and scope controls; link accepted fee to billing |
| Acceptance/continuance | AuditAcceptanceView, acceptanceCases | Require exact engagement/period and Partner decision independently of payment |
| M365/PBC | M365SetupView, DocumentsLibraryView, ClientPortalView | Gate workspace and uploads, canonical folders, simulated first-login change |
| Planning/materiality | AuditPlanningView, auditPlans | Pin TB basis; preserve PM/TE/SAD calculations and reassessment |
| Scheduling | JobsTasksView, BudgetsView, TimeTrackingView | Consolidate engagement staffing, explicit rates, approved time/economics |
| TB/P&L/BS | TBImportWizard, FinancialStatementsView, calculation services | Audit intake and FSLI drill-down; remove general accounting navigation |
| Programs/evidence/sampling/findings | Existing audit modules and scoped store commands | Preserve; add Analytical Review/Going Concern, physical references |
| Confirmations | Missing | Scoped status history, current release blockers, holding-letter artifact |
| Review/SRM | ReviewDeskView, workpaper/review commands | One review workspace, current-basis SRM, independent Partner clearance |
| Opinion/deliverables | Legacy release/package flow | Four opinions; ML/LOR/report revision history and downloadable artifacts |
| Billing | Invoice/receipt primitives | Advance 50%, official receipt, delivery-triggered balance invoice |
| Freeze/archive | Archive primitives | Report-date +60 days, controlled as-of simulation, durable read-only guard |
| Firm ledger/analytics | Report Centre, client accounting shell | Dedicated balanced firm ledger, no client-accounting auto-posting |
| Navigation/catalogue | 39-module shell/catalogues | Lifecycle navigation; retired bookmarks redirect to retained capabilities |

## Implementation sequence

1. Add target types, selectors and migration normalization within the existing store.
2. Implement guarded missing commands and source fingerprints; integrate activation/freeze guards with retained commands.
3. Build lifecycle overview/header and consolidated target workspaces; retire unrelated surfaces.
4. Add canonical synthetic scenario and full lifecycle/negative unit and browser journeys.
5. Update target documentation/catalogues, run requested checks, record actual outcomes.

Historical source data and reusable calculation/artifact primitives are retained only where target behavior depends on them. Provider, payment, email, signature, password and freeze actions remain explicitly simulated.
