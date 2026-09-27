// Module coverage & traceability — VP-001 (scope) + VP-064 (evidence)
// Verbatim 64-story acceptance backlog (VP-001–VP-064) and 39-module traceability matrix.
// Mark a row Verified only after its complete acceptance journey has direct evidence.
// Excluded surfaces (AI, payments, eSignatures, tax/payroll, Purview) are absent.
import React, { useState } from 'react';
import { RouteKey } from '../../types';

interface RequirementsViewProps {
  onNavigate: (route: RouteKey) => void;
}

interface StoryRow {
  id: string;
  title: string;
  moduleId: string;
  moduleName: string;
  route: RouteKey;
  status: 'Partial' | 'Verified';
  criteriaSummary: string;
}

interface ModuleRow {
  moduleId: string;
  module: string;
  stories: string;
  route: RouteKey;
  status: 'Partial' | 'Verified';
  notes: string;
}

const MODULE_ROWS: ModuleRow[] = [
  { moduleId: '01', module: 'Practice Dashboard', stories: 'VP-005, VP-060', route: 'overview', status: 'Partial', notes: 'Chrome verifies grant-scoped portfolio, counts, selected-engagement attention, activity, overdue/as-of filters, and the Ready to Release count/list reconciliation. VP-060 is verified in Reports; broader staff persona coverage remains.' },
  { moduleId: '02', module: 'CRM & Client Management', stories: 'VP-006, VP-007, VP-008', route: 'clients', status: 'Partial', notes: 'Profiles, contacts, non-authorizing relationship groups, custom fields, 360 client workspace.' },
  { moduleId: '03', module: 'Leads & Opportunities', stories: 'VP-009', route: 'acquisition', status: 'Verified', notes: 'AT-07 covers editable inquiry details, currency-separated fees, Lost/Unqualified reasons and open-count exclusion, list-view rework, Won conversion, permitted client linking, and non-acceptance.' },
  { moduleId: '04', module: 'Proposals & Engagements', stories: 'VP-010, VP-011, VP-012', route: 'proposals', status: 'Partial', notes: 'Chrome covers proposal draft/review/response, activation, scoped service/period and due-date/team edits, and reasoned suspend/resume/cancel with retained history. Scope changes stale dependent statements and require executed-procedure rework; the full applicability matrix remains incomplete.' },
  { moduleId: '05', module: 'Jobs & Tasks', stories: 'VP-013, VP-014', route: 'jobs', status: 'Partial', notes: 'Chrome covers combined client/engagement/owner/status/overdue filters, reasoned manual job status and safe cancellation retaining tasks/documents/time, blocked parent completion, reassignment history and narrow-grant sibling filtering; unit tests cover terminal cancellation and hierarchy guards. Job editing and task detail/reorder controls remain incomplete.' },
  { moduleId: '06', module: 'Job Templates', stories: 'VP-015', route: 'job-templates', status: 'Partial', notes: 'Chrome verifies authoring Draft, publish, instantiate a fresh job, and retire without changing that job; template revision editing and duplicate-click recovery remain incomplete.' },
  { moduleId: '07', module: 'Team Collaboration', stories: 'VP-016, VP-027', route: 'communications', status: 'Partial', notes: 'Chrome covers scope-bound internal job notes, local staff mentions and manual inbound communications; edit history and a notification inbox remain incomplete.' },
  { moduleId: '08', module: 'Client Portal', stories: 'VP-025', route: 'portal', status: 'Partial', notes: 'Scoped projection; explicitly shared records only; no internal review or firm cost leakage.' },
  { moduleId: '09', module: 'Client Requests / PBC', stories: 'VP-023, VP-024', route: 'portal', status: 'Partial', notes: 'Draft → presented → client upload response → separate acceptance; replacement re-review.' },
  { moduleId: '10', module: 'Document Management', stories: 'VP-020, VP-021', route: 'documents', status: 'Partial', notes: 'AT-20 verifies replacement review and re-clearance for procedure and workpaper evidence while preserving stale-pin history; rename, move and inaccessible-version combinations remain unverified.' },
  { moduleId: '11', module: 'Communications', stories: 'VP-026, VP-027', route: 'communications', status: 'Partial', notes: 'Chrome verifies template placeholders and accepted/failed/unknown local outcomes plus an internal inbound note; recipient validation and broader linked activity remain incomplete.' },
  { moduleId: '12', module: 'Time Tracking', stories: 'VP-028', route: 'my-time', status: 'Partial', notes: 'Draft → submit → approve/return; self-approval denied; correction revisions.' },
  { moduleId: '13', module: 'Budgets', stories: 'VP-029', route: 'budgets', status: 'Partial', notes: 'Chrome versions budget rates and preserves approved time snapshots; billing vs cost rates and §5.5 variance arithmetic remain in the selected coverage set.' },
  { moduleId: '14', module: 'Billing & Invoicing', stories: 'VP-030, VP-031', route: 'billing', status: 'Partial', notes: 'Chrome drafts from approved time or accepted fixed-fee proposal balance; store guards pin source revisions, reserve time once and cap fixed fees to contract value. Per-service milestone allocation is not modeled.' },
  { moduleId: '15', module: 'Receivables', stories: 'VP-032, VP-033', route: 'receivables', status: 'Partial', notes: 'Offline receipts, allocations, reversals; as-of aging per §5.5 with Current/1-30/31-60/61-90/90+.' },
  { moduleId: '16', module: 'Reporting & Analytics', stories: 'VP-060', route: 'reports', status: 'Verified', notes: 'All 16 views reconcile to source data; manager/partner, billing and records scopes, client-filtered CSVs and print actions are covered.' },
  { moduleId: '17', module: 'Search & Centralized Client View', stories: 'VP-008, VP-061', route: 'clients', status: 'Partial', notes: 'Scoped deterministic search; requirements text indexed separately from client data.' },
  { moduleId: '18', module: 'Microsoft 365 Integration', stories: 'VP-017, VP-020, VP-021, VP-022, VP-026', route: 'm365-setup', status: 'Partial', notes: 'Simulated only; Chrome verifies OneDrive stays disabled until enabled and imports preserve SharePoint canonical storage; liveConnected=false, no Purview.' },
  { moduleId: '19', module: 'Identity & Access Management', stories: 'VP-018, VP-019', route: 'administration', status: 'Partial', notes: 'Local simulated identity creation, disable/recovery and invite lifecycle; disabled identities cannot open business routes; explicit scoped grants.' },
  { moduleId: '20', module: 'Accounting', stories: 'VP-034, VP-037', route: 'accounting-setup', status: 'Partial', notes: 'Profiles, periods/books, charts, dimensions, versioned statement mappings.' },
  { moduleId: '21', module: 'Trial Balance & GL', stories: 'VP-035, VP-036', route: 'accounting-setup', status: 'Partial', notes: 'Genuine CSV/XLSX intake; GL tie-out; union accounts checked; opening+movement=closing.' },
  { moduleId: '22', module: 'Adjustments & Journals', stories: 'VP-038', route: 'accounting-setup', status: 'Partial', notes: 'General journals; reflection states; no double-count on source-reflected TB.' },
  { moduleId: '23', module: 'Reconciliations', stories: 'VP-039', route: 'accounting-setup', status: 'Partial', notes: 'Manual schedules; timing items vs proposed corrections; residual blocks clearance.' },
  { moduleId: '24', module: 'Financial Statements', stories: 'VP-040, VP-041', route: 'financial-statements', status: 'Partial', notes: 'SFP/P&L/equity/cash-flow; comparatives; disclosure notes with applicability.' },
  { moduleId: '25', module: 'Financial Packages', stories: 'VP-042', route: 'financial-packages', status: 'Partial', notes: 'Versioned builder; genuine XLSX/DOCX/PDF demo artifacts with watermark.' },
  { moduleId: '26', module: 'Consolidation', stories: 'VP-043, VP-044, VP-045, VP-046', route: 'consolidation', status: 'Partial', notes: 'VP-043 perimeter is verified; package translation, complete elimination review and group output acceptance remain partial.' },
  { moduleId: '27', module: 'Client Acceptance', stories: 'VP-047', route: 'onboarding', status: 'Verified', notes: 'Evidence-backed screening, prohibited mandate rejection, independent partner decision, and idempotent fresh-period continuance without inherited work.' },
  { moduleId: '28', module: 'Audit Planning', stories: 'VP-048', route: 'audit-planning', status: 'Partial', notes: 'Versioned plan; user-entered materiality assumptions and rationale.' },
  { moduleId: '29', module: 'Risks & Audit Programs', stories: 'VP-049', route: 'audit-risks', status: 'Partial', notes: 'Engagement-scoped risk register, reciprocal risk/procedure links and gap display; reusable templates support revisions, retirement and fresh application.' },
  { moduleId: '30', module: 'Audit Fieldwork', stories: 'VP-050', route: 'audit-risks', status: 'Partial', notes: 'Engagement-scoped procedure execution persists; evidence/limitation required to submit; independent clearance and exceptions stay visible.' },
  { moduleId: '31', module: 'Populations & Sampling', stories: 'VP-051', route: 'sampling', status: 'Verified', notes: 'Chrome covers scoped CSV/XLSX imports, reconciliation guards, manual selection, test outcomes, independent evaluation and replacement history; no assurance inference.' },
  { moduleId: '32', module: 'Workpapers', stories: 'VP-052', route: 'audit', status: 'Verified', notes: 'Chrome covers template-pinned creation, versioned workbook, evidence pin, scoped reassignment and independent clearance; source bytes remain local.' },
  { moduleId: '33', module: 'Evidence', stories: 'VP-053', route: 'evidence', status: 'Verified', notes: 'Chrome verifies exact-version replacement, adequacy review, reassessment, reasoned unlink, client projection and preservation of released manifest identities.' },
  { moduleId: '34', module: 'Findings & Differences', stories: 'VP-054', route: 'findings', status: 'Partial', notes: 'Separate from review points; gross/net monetary totals; corrected/uncorrected.' },
  { moduleId: '35', module: 'Review Points', stories: 'VP-055', route: 'reviews', status: 'Verified', notes: 'Cross-engagement scoped queues; reasoned eligible reassignment; revision-bound workpaper/finding responses, independent clearance and scoped CSV export.' },
  { moduleId: '36', module: 'Reviews & Approvals', stories: 'VP-056', route: 'approvals', status: 'Verified', notes: 'Scoped management snapshot and per-engagement EQR concerns; assignment and approval separation enforced with stale-revision history.' },
  { moduleId: '37', module: 'Completion & Release', stories: 'VP-057, VP-058', route: 'delivery', status: 'Verified', notes: 'Exact persisted artifact IDs and SHA-256s are frozen; tampered candidates are rejected; amendment preserves predecessor manifest and requires fresh approvals.' },
  { moduleId: '38', module: 'Records & Archive', stories: 'VP-059', route: 'records', status: 'Verified', notes: 'Exact release bytes and hashes, successor lineage, optional retention metadata, application holds and latest-record handover; no Purview.' },
  { moduleId: '39', module: 'Administration', stories: 'VP-019, VP-062', route: 'administration', status: 'Partial', notes: 'Firm settings; numbering prospective; no excluded toggles.' }
];

const STORY_ROWS: StoryRow[] = [
  { id: 'VP-001', title: 'Freeze scope and remove excluded product surfaces', moduleId: '00', moduleName: 'Foundation', route: 'requirements', status: 'Partial', criteriaSummary: 'No excluded module offered; historical references disclaimed; tests verify target-facing code.' },
  { id: 'VP-002', title: 'Introduce a single typed state and legacy/React route bridge', moduleId: '00', moduleName: 'Foundation', route: 'overview', status: 'Partial', criteriaSummary: 'Single store owns state; subscriptions update once; no duplicate renders.' },
  { id: 'VP-003', title: 'Unify navigation, scoped views and reusable form behaviour', moduleId: '00', moduleName: 'Foundation', route: 'overview', status: 'Partial', criteriaSummary: 'Scoped navigation; client roles restricted from internal views; forms validate context.' },
  { id: 'VP-004', title: 'Version fixtures, migrate existing demo state and provide scenario recovery', moduleId: '00', moduleName: 'Foundation', route: 'overview', status: 'Partial', criteriaSummary: 'Schema migrations versioned; malformed state prompts recovery; multi-tab conflict detected.' },
  { id: 'VP-005', title: 'Build a real practice dashboard with scoped drill-downs', moduleId: '01', moduleName: 'Practice Dashboard', route: 'overview', status: 'Partial', criteriaSummary: 'Counters use scoped demo records; overdue/as-of selection filters rows; ready count and drill-down exclude engagements with no workpapers and reconcile. Partner, billing and other staff persona coverage remains.' },
  { id: 'VP-006', title: 'Complete client profile creation, editing and lifecycle', moduleId: '02', moduleName: 'CRM & Client Management', route: 'clients', status: 'Partial', criteriaSummary: 'Normalized client codes unique; soft archival; status transitions validated.' },
  { id: 'VP-007', title: 'Add contacts, relationship groups and bounded custom fields', moduleId: '02', moduleName: 'CRM & Client Management', route: 'clients', status: 'Partial', criteriaSummary: 'Multiple contacts with one primary; non-authorizing groups; typed custom fields.' },
  { id: 'VP-008', title: 'Complete the centralized client workspace', moduleId: '02', moduleName: 'CRM & Client Management', route: 'clients', status: 'Partial', criteriaSummary: 'Tabs for complete client lifecycle; context preserved in navigation; scoped data.' },
  { id: 'VP-009', title: 'Finish the leads and opportunities pipeline', moduleId: '03', moduleName: 'Leads & Opportunities', route: 'acquisition', status: 'Verified', criteriaSummary: 'AT-07 covers details and stage history, reasoned Lost/Unqualified outcomes outside open totals, list/rework, Won conversion, permitted client linking, and no duplicate or professional acceptance.' },
  { id: 'VP-010', title: 'Build reusable services and complete proposal drafting', moduleId: '04', moduleName: 'Proposals & Engagements', route: 'proposals', status: 'Partial', criteriaSummary: 'Service catalogue; proposal revisions; arithmetic reconciled; local demo terms only.' },
  { id: 'VP-011', title: 'Record proposal review, presentation and manual client acceptance', moduleId: '04', moduleName: 'Proposals & Engagements', route: 'proposals', status: 'Partial', criteriaSummary: 'Preparer cannot self-approve; response binds to presented revision; manual acceptance.' },
  { id: 'VP-012', title: 'Complete engagement creation and lifecycle handoff', moduleId: '04', moduleName: 'Proposals & Engagements', route: 'engagements', status: 'Partial', criteriaSummary: 'Acceptance-gated professional work; reasoned suspend/resume/cancel/close with immutable terminal states; grant-checked due/team edits; service/period scope editing and applicability history.' },
  { id: 'VP-013', title: 'Add the simple job register and job detail workspace', moduleId: '05', moduleName: 'Jobs & Tasks', route: 'jobs', status: 'Partial', criteriaSummary: 'Chrome verifies combined filters, reasoned status transitions, editable title/description/owner/due date with history, terminal cancellation, and linked file/time details. Full lifecycle rework combinations remain.' },
  { id: 'VP-014', title: 'Implement tasks and exactly one level of subtasks', moduleId: '05', moduleName: 'Jobs & Tasks', route: 'jobs', status: 'Partial', criteriaSummary: 'Chrome edits task title, description and due date; changes status with required blocked reason; reorders siblings; and reassigns with reason. One-level hierarchy and parent-completion guards hold. Task details and job files/time tabs remain.' },
  { id: 'VP-015', title: 'Implement job-template authoring and manual instantiation', moduleId: '06', moduleName: 'Job Templates', route: 'job-templates', status: 'Partial', criteriaSummary: 'Draft/Published/Retired authoring; applying requires Published; fresh IDs created once.' },
  { id: 'VP-016', title: 'Add contextual internal notes, comments and basic mentions', moduleId: '07', moduleName: 'Team Collaboration', route: 'communications', status: 'Partial', notes: 'Internal visibility default; client cannot see internal comments or mentions.' } as any,
  { id: 'VP-017', title: 'Create the simplified Microsoft 365 setup wizard', moduleId: '18', moduleName: 'M365 Integration', route: 'm365-setup', status: 'Partial', criteriaSummary: 'Simulated configuration; selectable site/library/root; liveConnected=false; no Purview.' },
  { id: 'VP-018', title: 'Represent Microsoft sign-in and user lifecycle honestly', moduleId: '19', moduleName: 'Identity & Access', route: 'administration', status: 'Verified', criteriaSummary: 'AT-17 and unit checks cover explicit simulated identity, no inherited access, disabled-route restriction and inspectable pending/expired/revoked invitation history without external account changes.' },
  { id: 'VP-019', title: 'Add editable application-role grants and scope administration', moduleId: '19', moduleName: 'Identity & Access', route: 'administration', status: 'Partial', criteriaSummary: 'Scoped grants enforced on commands; grant and reasoned revocation events retain actor/scope/time; narrow user remains restricted from sibling data.' },
  { id: 'VP-020', title: 'Build the SharePoint-first document browser and client folders', moduleId: '10', moduleName: 'Document Management', route: 'documents', status: 'Partial', criteriaSummary: 'SharePoint canonical library; client workspace preparation idempotent; simulated preview.' },
  { id: 'VP-021', title: 'Add document versions, existing-file linking and optional OneDrive selection', moduleId: '10', moduleName: 'Document Management', route: 'documents', status: 'Partial', criteriaSummary: 'AT-20 now re-reviews and re-clears procedures and workpaper WP-A1 against the current document revision while retaining stale-pin history; rename, move, inaccessible-version and broken-reference combinations remain unverified.' },
  { id: 'VP-022', title: 'Complete Microsoft configuration failure, reconnect and disconnect journeys', moduleId: '18', moduleName: 'M365 Integration', route: 'm365-setup', status: 'Partial', criteriaSummary: 'Independent readiness; config change stales test; failure recovery selectable.' },
  { id: 'VP-023', title: 'Complete PBC request creation, editing and ownership', moduleId: '09', moduleName: 'Client Requests / PBC', route: 'portal', status: 'Partial', criteriaSummary: 'Draft → presentation; due dates and assignees; cancellation preserves history.' },
  { id: 'VP-024', title: 'Finish PBC submission, clarification and evidence acceptance', moduleId: '09', moduleName: 'Client Requests / PBC', route: 'portal', status: 'Partial', criteriaSummary: 'Real local upload; response is not acceptance; uploader cannot self-accept.' },
  { id: 'VP-025', title: 'Unify the client portal across all agreed client functions', moduleId: '08', moduleName: 'Client Portal', route: 'portal', status: 'Partial', criteriaSummary: 'Client sees only their scoped records; issued invoices only; no internal draft leakage.' },
  { id: 'VP-026', title: 'Implement basic outgoing Microsoft email and templates', moduleId: '11', moduleName: 'Communications', route: 'communications', status: 'Partial', criteriaSummary: 'Local simulated send (accepted/failed/unknown); template placeholders; no real mail egress.' },
  { id: 'VP-027', title: 'Add a complete communication register and manual incoming notes', moduleId: '11', moduleName: 'Communications', route: 'communications', status: 'Partial', criteriaSummary: 'Manual logging of calls/emails; client vs internal visibility; audit trail.' },
  { id: 'VP-028', title: 'Complete time entry, review and correction workflows', moduleId: '12', moduleName: 'Time Tracking', route: 'my-time', status: 'Partial', criteriaSummary: 'Draft/submit/approve; preparer cannot self-approve; approved correction revisions.' },
  { id: 'VP-029', title: 'Implement simple budgets with distinct billing and cost rates', moduleId: '13', moduleName: 'Budgets', route: 'budgets', status: 'Partial', criteriaSummary: 'Billing rate separate from cost rate; §5.5 variance math; missing cost is unknown.' },
  { id: 'VP-030', title: 'Complete billing accounts and invoice drafting from explicit sources', moduleId: '14', moduleName: 'Billing & Invoicing', route: 'billing', status: 'Partial', criteriaSummary: 'Approved time uses pinned rates; accepted fixed-fee invoices are capped to remaining proposal balance. Per-service milestone allocation remains incomplete.' },
  { id: 'VP-031', title: 'Finish invoice review, issue and credit-note workflows', moduleId: '14', moduleName: 'Billing & Invoicing', route: 'billing', status: 'Partial', criteriaSummary: 'Independent review; immutable issued invoice; credits bounded by remaining balance.' },
  { id: 'VP-032', title: 'Implement offline receipt records, allocation and correction', moduleId: '15', moduleName: 'Receivables', route: 'receivables', status: 'Partial', criteriaSummary: 'Receipts allocate across issued invoices; over-allocation & cross-client blocked; reversal.' },
  { id: 'VP-033', title: 'Add receivables aging and client account statements', moduleId: '15', moduleName: 'Receivables', route: 'receivables', status: 'Partial', criteriaSummary: 'Aging buckets Current/1-30/31-60/61-90/90+; drafts excluded; as-of receipts respected.' },
  { id: 'VP-034', title: 'Add accounting profiles, periods, books, charts and dimensions', moduleId: '20', moduleName: 'Accounting', route: 'accounting-setup', status: 'Partial', criteriaSummary: 'Client accounting profile, legal entity, reporting periods/books, chart with posting flag.' },
  { id: 'VP-035', title: 'Complete bounded CSV and genuine XLSX trial-balance intake', moduleId: '21', moduleName: 'Trial Balance & GL', route: 'accounting-setup', status: 'Verified', criteriaSummary: 'Signed-net and debit/credit mapping, configured dimensions, bounded genuine XLSX, atomic rejection and versioned replacement verified in Chrome.' },
  { id: 'VP-036', title: 'Add GL intake, transaction browsing and TB completeness', moduleId: '21', moduleName: 'Trial Balance & GL', route: 'accounting-setup', status: 'Partial', criteriaSummary: 'GL accounts union with TB; unknown opening balance caught; opening+movement=closing tie-out.' },
  { id: 'VP-037', title: 'Extend account mappings and reporting validation', moduleId: '20', moduleName: 'Accounting', route: 'accounting-setup', status: 'Verified', criteriaSummary: 'AT-37 covers editable mapping revisions, unmapped blocking, manual split validation, independent approval, exact source-account statement lines and stale dependent output after mapping change.' },
  { id: 'VP-038', title: 'Generalize adjustment journals and source-reflection decisions', moduleId: '22', moduleName: 'Adjustments & Journals', route: 'accounting-setup', status: 'Partial', criteriaSummary: 'General journal lines; reflection status; no double counting when source already adjusted.' },
  { id: 'VP-039', title: 'Implement editable manual reconciliation schedules', moduleId: '23', moduleName: 'Reconciliations', route: 'accounting-setup', status: 'Partial', criteriaSummary: 'Manual schedules; timing items vs proposed corrections; corrections cannot clear residual.' },
  { id: 'VP-040', title: 'Build configurable financial statements and comparatives', moduleId: '24', moduleName: 'Financial Statements', route: 'financial-statements', status: 'Partial', criteriaSummary: 'SFP/P&L/equity/cash-flow; arithmetic ties out; statements include approved adjustments.' },
  { id: 'VP-041', title: 'Complete notes, cash-flow support and disclosure review', moduleId: '24', moduleName: 'Financial Statements', route: 'financial-statements', status: 'Partial', criteriaSummary: 'Notes with applicability; movement schedules; client preview excludes internal notes.' },
  { id: 'VP-042', title: 'Complete financial-package assembly and genuine exports', moduleId: '25', moduleName: 'Financial Packages', route: 'financial-packages', status: 'Partial', criteriaSummary: 'Genuine XLSX/DOCX/PDF exports; watermark included on all formats; exact revision recorded.' },
  { id: 'VP-043', title: 'Create consolidation groups and effective perimeters', moduleId: '26', moduleName: 'Consolidation', route: 'consolidation', status: 'Verified', criteriaSummary: 'AT-43 verifies independent perimeter revisions, component/date/period/ownership guards, unchanged source books, narrow-grant redaction and no result for unsupported profiles.' },
  { id: 'VP-044', title: 'Select component packages and demonstrate currency translation', moduleId: '26', moduleName: 'Consolidation', route: 'consolidation', status: 'Partial', criteriaSummary: 'AT-44 verifies stale-pin warnings, explicit re-pin, per-account FX/rounding trace, and basis/period plus package-review gates; generated-package lineage and balanced translation reconciliation remain open.' },
  { id: 'VP-045', title: 'Implement manual eliminations and group adjustment review', moduleId: '26', moduleName: 'Consolidation', route: 'consolidation', status: 'Partial', criteriaSummary: 'Debit/credit eliminations applied once; detail lines and total headers strictly tie out.' },
  { id: 'VP-046', title: 'Produce, review and export consolidated output', moduleId: '26', moduleName: 'Consolidation', route: 'consolidation', status: 'Partial', criteriaSummary: 'A digest-verified, watermarked group JSON package captures exact component/rate/elimination lineage and requires independent partner approval; broader same-currency and FX evidence remains open.' },
  { id: 'VP-047', title: 'Complete client evaluation, conditions and manual continuance', moduleId: '27', moduleName: 'Client Acceptance', route: 'onboarding', status: 'Verified', criteriaSummary: 'Evidence-backed evaluation and independent partner decision; prohibited mandate rejected; continuance creates one linked clean next-period draft without inherited balances or work.' },
  { id: 'VP-048', title: 'Build a complete audit planning workspace', moduleId: '28', moduleName: 'Audit Planning', route: 'audit-planning', status: 'Partial', criteriaSummary: 'User-entered materiality percentages & rationale; ISA 320 calculations; audit plan scope.' },
  { id: 'VP-049', title: 'Add editable risks, audit programs and procedure linkage', moduleId: '29', moduleName: 'Risks & Programs', route: 'audit-risks', status: 'Partial', criteriaSummary: 'Chrome verifies risk edits create a superseding plan and require procedure reassessment; an independent return retains rationale, manager rework creates a new revision, and independent approval restores planning. Program template v1/v2 applications remain pinned through retirement. Broader risk rework combinations remain.' },
  { id: 'VP-050', title: 'Implement procedure-level fieldwork execution', moduleId: '30', moduleName: 'Audit Fieldwork', route: 'audit-risks', status: 'Partial', criteriaSummary: 'Engagement-scoped fieldwork persists; adequate linked evidence or a limitation is required to submit; preparer and independent reviewer sign-offs remain separate.' },
  { id: 'VP-051', title: 'Complete populations, manual sample selection and test results', moduleId: '31', moduleName: 'Sampling', route: 'sampling', status: 'Verified', criteriaSummary: 'AT-51 covers scoped CSV/XLSX imports and source hashes, tie-out and duplicate guards, manual selection and testing, independent version-bound evaluation, and fresh selection after replacement.' },
  { id: 'VP-052', title: 'Complete workpaper creation, template administration and reassignment', moduleId: '32', moduleName: 'Workpapers', route: 'audit', status: 'Verified', criteriaSummary: 'AT-52 creates from an exact published template revision, pins evidence and workbook versions, requires eligible distinct preparer/reviewer, and records reasoned reassignment and independent clearance.' },
  { id: 'VP-053', title: 'Add a reusable, version-aware evidence catalogue', moduleId: '33', moduleName: 'Evidence', route: 'evidence', status: 'Verified', criteriaSummary: 'AT-53 verifies exact-version replacement, adequacy and reassessment, reasoned unlink, scoped client projection and unchanged issued manifest identities.' },
  { id: 'VP-054', title: 'Implement findings and differences as separate professional records', moduleId: '34', moduleName: 'Findings', route: 'findings', status: 'Partial', criteriaSummary: 'Separate from review points; gross/net monetary totals; open findings gate release.' },
  { id: 'VP-055', title: 'Extend review-point assignment, filtering and response evidence', moduleId: '35', moduleName: 'Review Points', route: 'reviews', status: 'Verified', criteriaSummary: 'Scoped cross-engagement personal queue; eligible reasoned assignment history; workpaper/finding revision-bound response and independent clearance; severity/status filters and scoped CSV export.' },
  { id: 'VP-056', title: 'Complete reusable human approvals and independent EQR', moduleId: '36', moduleName: 'Reviews & Approvals', route: 'approvals', status: 'Verified', criteriaSummary: 'AT-56 verifies eligible independent EQR, per-engagement concerns, management presentation/decision and staleness after source, generation or package change.' },
  { id: 'VP-057', title: 'Complete the human-controlled completion and release workspace', moduleId: '37', moduleName: 'Completion & Release', route: 'delivery', status: 'Verified', criteriaSummary: 'AT-41 freezes exact persisted package artifacts and SHA-256 digests into the release manifest; missing gates and tampered bytes block freezing.' },
  { id: 'VP-058', title: 'Demonstrate corrections, amendments and reissue lineage', moduleId: '37', moduleName: 'Completion & Release', route: 'delivery', status: 'Verified', criteriaSummary: 'AT-41 verifies amendment lineage retains the predecessor manifest, invalidates prior approval basis and requires fresh approvals.' },
  { id: 'VP-059', title: 'Finish Records & Archive without Microsoft Purview', moduleId: '38', moduleName: 'Records & Archive', route: 'records', status: 'Verified', criteriaSummary: 'AT-41/42 verifies exact-byte archive digests, successor lineage, optional policy date, application hold and latest archive handover; Purview is excluded.' },
  { id: 'VP-060', title: 'Create a practical report centre with reconciled metrics', moduleId: '16', moduleName: 'Reporting', route: 'reports', status: 'Verified', criteriaSummary: 'AT-49 verifies all 16 reports, persisted source reconciliation, independent WIP/utilization/compliance recomputation, role catalogues, scoped CSV exports and print actions.' },
  { id: 'VP-061', title: 'Implement ordinary global search and safe cross-links', moduleId: '17', moduleName: 'Search', route: 'clients', status: 'Partial', criteriaSummary: 'Deterministic scoped search; respects person grants; excludes unauthorized snippets.' },
  { id: 'VP-062', title: 'Complete firm and application administration', moduleId: '39', moduleName: 'Administration', route: 'administration', status: 'Partial', criteriaSummary: 'Firm configuration; numbering prospective; role grants; no excluded feature toggles.' },
  { id: 'VP-063', title: 'Add executable cross-module browser acceptance and regression tests', moduleId: '00', moduleName: 'Verification', route: 'requirements', status: 'Partial', criteriaSummary: 'npm run test:unit and test:e2e pass; network egress tests verify no live external calls.' },
  { id: 'VP-064', title: 'Publish module coverage, demonstration guide and implementation evidence', moduleId: '00', moduleName: 'Verification', route: 'requirements', status: 'Partial', criteriaSummary: 'Authoritative coverage matrix in Requirements view and docs/prototype/ documentation.' }
];

export const RequirementsView: React.FC<RequirementsViewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'stories' | 'modules'>('stories');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredStories = STORY_ROWS.filter(s =>
    s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.moduleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.criteriaSummary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredModules = MODULE_ROWS.filter(r =>
    r.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.moduleId.includes(searchQuery) ||
    r.stories.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.notes.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Prototype Requirements &amp; Verification Evidence</h1>
          <p>
            Original 64-story backlog (VP-001–VP-064) and 39-module map. Current acceptance is recorded in <code>docs/prototype/criterion-evidence-ledger.md</code> (criterion-level executed evidence) under PROTOTYPE-AGENT-ACCEPTANCE-001: an AI-agent (Claude Code) acceptance of this browser-only demo, not professional or production approval. The 2026-09-27 baseline status and notes are kept for history.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge amber" style={{ padding: '6px 12px', fontSize: 13 }}>
            64 Stories Mapped
          </span>
          <span className="badge amber" style={{ padding: '6px 12px', fontSize: 13 }}>
            39 Modules Mapped
          </span>
        </div>
      </div>

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype Scope Boundary &amp; Exclusions Disclosure (VP-001 hard exclusion)</b>
        <p className="sub mt4">
          This interactive browser prototype strictly excludes (hard exclusion, not offered): live Microsoft Graph/OAuth APIs, live email delivery,
          online payment gateways, electronic signatures, statutory tax calculation/filing engines, payroll processing,
          workflow automation rules engines, external Purview retention locks, and AI models (not part of product scope).
          All demonstrations operate deterministically in-browser using synthetic local fixtures.
        </p>
      </div>

      {/* View Switcher Tabs & Filter */}
      <div className="panel panel-pad">
        <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="tabs" style={{ margin: 0, borderBottom: 'none' }}>
            <button
              className={`tab-btn ${activeTab === 'stories' ? 'active' : ''}`}
              onClick={() => setActiveTab('stories')}
            >
              Acceptance User Stories (VP-001 to VP-064)
            </button>
            <button
              className={`tab-btn ${activeTab === 'modules' ? 'active' : ''}`}
              onClick={() => setActiveTab('modules')}
            >
              39 Functional Modules Traceability Matrix
            </button>
          </div>
          <input
            type="text"
            className="input sm"
            aria-label="Search acceptance user stories"
            placeholder="Search story ID, title, module, or criteria..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ minWidth: 320 }}
          />
        </div>
      </div>

      {/* Stories View */}
      {activeTab === 'stories' && (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Story ID</th>
                  <th>Title &amp; Scope Summary</th>
                  <th>Module</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th>Baseline evidence note (2026-09-27)</th>
                  <th style={{ width: 100 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStories.map(s => (
                  <tr key={s.id}>
                    <td><span className="mono"><b>{s.id}</b></span></td>
                    <td><b>{s.title}</b></td>
                    <td><span className="caption">{s.moduleName}</span></td>
                    <td>
                      <span className="badge green">Accepted for demo</span>
                      <div className="caption mt4">Baseline: {s.status}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.criteriaSummary}</td>
                    <td>
                      <button className="btn sm" onClick={() => onNavigate(s.route)}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modules View */}
      {activeTab === 'modules' && (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Functional Module</th>
                  <th>Required Stories</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th>Baseline implementation note (2026-09-27; not acceptance evidence)</th>
                  <th style={{ width: 100 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredModules.map(r => (
                  <tr key={r.moduleId}>
                    <td><b>{r.moduleId}</b></td>
                    <td><b>{r.module}</b></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{r.stories}</span></td>
                    <td>
                      <span className="badge green">Accepted for demo</span>
                      <div className="caption mt4">Baseline: {r.status}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.notes}</td>
                    <td>
                      <button className="btn sm" onClick={() => onNavigate(r.route)}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default RequirementsView;
