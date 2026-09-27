/**
 * Generates docs/prototype/lifecycle-progress-matrix.md from the shipped code.
 *
 * The matrix is derived, never hand-written: routes come from the route registry,
 * step definitions from the declared lifecycle models, and the per-module
 * progress source from the registry PLUS a table in this file that names the
 * records each module derives its counts from. A unit test regenerates the table
 * and fails if the committed document has drifted, so the documentation cannot
 * claim a module reports progress it does not.
 *
 * Usage:  npx tsx tools/lifecycle-progress-matrix.ts [--check]
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_KEYS } from '../src/types/index.js';
import { ROUTE_REGISTRY, ROUTE_GROUP_ORDER } from '../src/services/routeRegistry.js';
import { LIFECYCLE_MODELS, MODULE_LIFECYCLE_MODEL } from '../src/services/lifecycle.js';
import { ENGAGEMENT_STEP_SECTION } from '../src/services/engagementJourney.js';
import { PACKAGE_STEP_SECTION } from '../src/services/packageJourney.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'docs', 'prototype', 'lifecycle-progress-matrix.md');

/**
 * How each module answers the progress questions.
 *
 * `source` names the record fields the module's counts come from, or states
 * plainly that the module has no workflow of its own. `runtime` records where
 * the tracker is rendered today:
 *   - `tracker`  — a derived WorkflowProgress tracker is rendered on the screen
 *   - `steps`    — the module's own step indicators are rendered, not yet the
 *                  shared tracker
 *   - `register` — no workflow to track; the module is a register or a
 *                  deterministic projection
 */
interface ProgressSource {
  readonly source: string;
  readonly runtime: 'tracker' | 'steps' | 'register';
  readonly note?: string;
}

export const PROGRESS_SOURCES: Readonly<Record<string, ProgressSource>> = {
  overview: { source: 'Derived dashboard metrics; each metric opens the exact filtered record list it counts.', runtime: 'register' },
  clients: { source: 'ClientRecord.status and the open PBC requests for the client.', runtime: 'steps', note: 'Client 360 exposes the request loop; the shared tracker is not yet rendered here.' },
  'client-detail': { source: 'PbcRequestItem.status per request and the shared documents actually published.', runtime: 'steps' },
  acquisition: { source: 'LeadOpportunity.stage per opportunity.', runtime: 'steps' },
  proposals: { source: 'ProposalRecord.state, commercialReview and the pinned presented revision.', runtime: 'steps' },
  engagements: { source: 'professionalAcceptance, the approved audit plan, linked risks, cleared workpapers, finding dispositions, cleared review points, the four generation-bound sign-offs and the release records.', runtime: 'tracker' },
  onboarding: { source: 'AcceptanceCaseRecord screening evidence, decision and the linked continuance case.', runtime: 'steps' },
  jobs: { source: 'JobRecord.status and the completion of its subtasks.', runtime: 'steps' },
  'job-templates': { source: 'JobTemplateItem.status per template version.', runtime: 'steps' },
  documents: { source: 'DocumentItem.version, availability and whether a request response is outstanding.', runtime: 'steps' },
  communications: { source: 'CommunicationItem.status (simulated outcome) per message.', runtime: 'register' },
  'my-time': { source: 'TimeEntryItem.status per entry, excluding superseded correction revisions.', runtime: 'steps' },
  budgets: { source: 'BudgetRecord version against the engagement context it was saved under.', runtime: 'steps' },
  billing: { source: 'InvoiceRecord.status per invoice and CreditNoteRecord.status per credit note.', runtime: 'steps' },
  receivables: { source: 'ReceiptRecord allocations against each issued invoice, as of a selectable date.', runtime: 'steps' },
  'accounting-setup': { source: 'ClientAccountingProfile revision state.', runtime: 'steps' },
  'trial-balance': { source: 'Accepted source revision and whether a replacement preserved the predecessor.', runtime: 'steps' },
  'gl-transactions': { source: 'GLSourceRevision state and verifyGLCompleteness results.', runtime: 'steps' },
  'account-mappings': { source: 'AccountMappingRevision.status per revision.', runtime: 'steps' },
  adjustments: { source: 'AdjustmentJournalItem.status and reflectionStatus against a named source version.', runtime: 'steps' },
  reconciliations: { source: 'ReconciliationSchedule.status per revision and its residual.', runtime: 'steps' },
  'financial-statements': { source: 'StatementSetRevision.status with the source, mapping, layout and comparative revision it was saved against.', runtime: 'steps' },
  'financial-packages': { source: 'The saved revision, validation.passed, its source/mapping/generation lineage, the management decision, the generation-bound sign-offs and the release records.', runtime: 'tracker' },
  consolidation: { source: 'Perimeter revision, pinned component snapshots, FX rate versions, elimination review states and the output review.', runtime: 'steps' },
  'audit-planning': { source: 'AuditPlanRecord.status per plan revision.', runtime: 'steps' },
  'audit-risks': { source: 'AuditRiskItem revisions plus linkedProcedureIds coverage; template status per version.', runtime: 'steps' },
  'audit-fieldwork': { source: 'AuditProcedureItem.status and its revision history.', runtime: 'steps' },
  sampling: { source: 'SamplePopulationItem frame reconciliation, selection count and per-item test results.', runtime: 'steps' },
  audit: { source: 'WorkpaperItem.status per revision, excluding not-applicable items.', runtime: 'steps' },
  evidence: { source: 'EvidenceItem.adequacyStatus and the availability of the referenced document.', runtime: 'steps' },
  findings: { source: 'FindingItem.disposition plus the shared release-blocking rule and any reopened review point.', runtime: 'steps' },
  reviews: { source: 'ReviewNoteItem.status per note.', runtime: 'steps' },
  approvals: { source: 'engagement.approvals (manager, client, partner, EQR) bound to the current generation.', runtime: 'steps' },
  quality: { source: 'EQR assignment and the open/resolved state of each EQR concern.', runtime: 'steps' },
  delivery: { source: 'evaluateReleaseReadiness, the release candidate manifest and the issued release records.', runtime: 'steps' },
  records: { source: 'ArchiveRecord retention state and handover history.', runtime: 'register' },
  portal: { source: 'The states of the shared requests, documents, packages and invoices actually visible to the client.', runtime: 'register', note: 'The portal mirrors permitted records; it owns no workflow of its own.' },
  reports: { source: 'Deterministic report rows; each report states the scope it covers.', runtime: 'register' },
  administration: { source: 'Identity status, grant lifecycle and firm-settings revisions.', runtime: 'register' },
  'm365-setup': { source: 'Per-capability simulated configuration status and invitation states.', runtime: 'register' },
  requirements: { source: 'No workflow: the original backlog and module map are fixed reference data.', runtime: 'register' },
  'module-guide': { source: 'No workflow: presenter guidance over the shipped route registry.', runtime: 'register' },
  services: { source: 'Alias of administration.', runtime: 'register' },
  'role-guide': { source: 'Alias of requirements.', runtime: 'register' }
};

const RUNTIME_LABEL: Record<ProgressSource['runtime'], string> = {
  tracker: 'Derived tracker rendered',
  steps: 'Module step indicators',
  register: 'No workflow'
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

export function renderMatrix(): string {
  const lines: string[] = [];
  lines.push('# AuditSphere Visual Prototype — Lifecycle & Progress Matrix (MOD-UX-02)');
  lines.push('');
  lines.push('Generated from the shipped code by `tools/lifecycle-progress-matrix.ts`.');
  lines.push('Regenerate with `npx tsx tools/lifecycle-progress-matrix.ts`; the unit suite fails if this');
  lines.push('file and the code disagree.');
  lines.push('');
  lines.push('Reading the columns:');
  lines.push('');
  lines.push('- **Steps** — the declared lifecycle model for the route (`src/services/lifecycle.ts`).');
  lines.push('- **Progress source** — the record fields the module derives its completed/pending/blocked counts from. A module with no workflow says so instead of inventing one.');
  lines.push('- **Runtime** — whether the shared derived tracker is rendered on that screen today, the module\'s own step indicators are shown, or the screen has no workflow to track.');
  lines.push('- **Entry / terminal** — the first and last step of the declared model, so a reader knows where the journey starts and ends.');
  lines.push('');
  lines.push('A step can be reported as **completed**, **current**, **pending**, **blocked**, **returned**, **stale**, or **not applicable**. Blocked, returned and stale steps always carry the reason and the required next action; a step with no explanation is a defect, not an empty state.');
  lines.push('');

  const counted = { tracker: 0, steps: 0, register: 0, missing: 0 };
  const missing: string[] = [];

  for (const group of ROUTE_GROUP_ORDER) {
    const routes = ROUTE_KEYS.filter(route => ROUTE_REGISTRY[route].group === group);
    if (!routes.length) continue;
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const route of routes) {
      const entry = ROUTE_REGISTRY[route];
      const model = LIFECYCLE_MODELS[MODULE_LIFECYCLE_MODEL[route]];
      const source = PROGRESS_SOURCES[route];
      if (!source) { counted.missing += 1; missing.push(route); }
      const runtime = source?.runtime ?? 'register';
      counted[runtime] += 1;
      lines.push([
        escapeCell(entry.label),
        `\`${route}\``,
        escapeCell(model.steps.join(' → ')),
        escapeCell(source?.source ?? 'UNDECLARED — add this route to PROGRESS_SOURCES'),
        RUNTIME_LABEL[runtime] + (source?.note ? ` — ${escapeCell(source.note)}` : ''),
        `${model.steps[0]} → ${model.steps[model.steps.length - 1]}`,
        escapeCell(entry.nextStep)
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push('');
  }

  lines.push('## Coverage');
  lines.push('');
  lines.push(`- Routes registered: ${ROUTE_KEYS.length}`);
  lines.push(`- Declared lifecycle models: ${Object.keys(LIFECYCLE_MODELS).length}`);
  lines.push(`- Screens rendering the shared derived tracker: ${counted.tracker}`);
  lines.push(`- Screens showing the module's own step indicators: ${counted.steps}`);
  lines.push(`- Screens with no workflow to track: ${counted.register}`);
  lines.push(`- Routes with no declared progress source: ${counted.missing}${missing.length ? ` (${missing.join(', ')})` : ''}`);
  lines.push('');
  lines.push('## Where the tracker is rendered today');
  lines.push('');
  lines.push('The shared `WorkflowProgressTracker` is rendered where a module can derive every step from');
  lines.push('records it already owns:');
  lines.push('');
  lines.push('| Screen | Steps | Section each step opens |');
  lines.push('|---|---|---|');
  lines.push(`| Engagements | ${LIFECYCLE_MODELS['audit-engagement'].steps.length} — ${LIFECYCLE_MODELS['audit-engagement'].steps.join(' → ')} | ${Object.entries(ENGAGEMENT_STEP_SECTION).map(([step, route]) => `${step} → \`#${route}\``).join('; ')} |`);
  lines.push(`| Financial Packages | ${LIFECYCLE_MODELS['financial-package'].steps.length} — ${LIFECYCLE_MODELS['financial-package'].steps.join(' → ')} | ${Object.entries(PACKAGE_STEP_SECTION).map(([step, route]) => `${step} → \`#${route}\``).join('; ')} |`);
  lines.push('');
  lines.push('Every other stateful module already renders its own step or status indicators, which the');
  lines.push('shared status vocabulary now tones consistently; moving those onto the shared tracker is');
  lines.push('the remaining work recorded in `enterprise-ux-audit.md` as Partial.');
  lines.push('');
  return lines.join('\n');
}

const check = process.argv.includes('--check');
const rendered = renderMatrix();
if (check) {
  const existing = readFileSync(target, 'utf8');
  if (existing !== rendered) {
    console.error('lifecycle-progress-matrix.md is out of date. Regenerate with: npx tsx tools/lifecycle-progress-matrix.ts');
    process.exit(1);
  }
  console.log('lifecycle-progress-matrix.md matches the code.');
} else {
  writeFileSync(target, rendered, 'utf8');
  console.log(`Wrote ${target}`);
}
