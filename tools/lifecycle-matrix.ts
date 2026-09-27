// Generates docs/prototype/lifecycle-matrix.md from src/services/lifecycles.ts.
// Usage: npx tsx tools/lifecycle-matrix.ts [--check]
// --check exits non-zero when the committed document differs (used by the unit suite).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIFECYCLES, lifecycleById } from '../src/services/lifecycles.js';
import { MODULE_GUIDES } from '../src/services/moduleGuideContent.js';
import { canOpenRoute } from '../src/services/guards.js';
import type { RoleKey, RouteKey } from '../src/types/index.js';

/** Module → record lifecycles it owns (empty = stateless projection over other modules' records). */
const MODULE_LIFECYCLES: Record<string, string[]> = {
  'MOD-01': [], 'MOD-02': ['client'], 'MOD-03': ['lead'], 'MOD-04': ['proposal', 'engagement'], 'MOD-05': ['job'],
  'MOD-06': ['job-template'], 'MOD-07': [], 'MOD-08': [], 'MOD-09': ['pbc'], 'MOD-10': [], 'MOD-11': [],
  'MOD-12': ['time'], 'MOD-13': ['budget'], 'MOD-14': ['invoice', 'credit-note'], 'MOD-15': [], 'MOD-16': [], 'MOD-17': [],
  'MOD-18': ['m365'], 'MOD-19': ['invitation'], 'MOD-20': ['mapping'], 'MOD-21': ['mapping'], 'MOD-22': ['adjustment'],
  'MOD-23': ['reconciliation'], 'MOD-24': ['statement-set'], 'MOD-25': ['package', 'disclosure'],
  'MOD-26': ['consolidation-elimination', 'consolidation-output'], 'MOD-27': ['acceptance'], 'MOD-28': ['audit-plan'],
  'MOD-29': ['audit-procedure', 'audit-program-template'], 'MOD-30': ['audit-procedure'], 'MOD-31': ['sample'],
  'MOD-32': ['workpaper'], 'MOD-33': ['evidence'], 'MOD-34': ['finding'], 'MOD-35': ['review-note'], 'MOD-36': ['approval'],
  'MOD-37': ['release'], 'MOD-38': ['archive'], 'MOD-39': ['invitation']
};
/** Upstream records each module depends on (read from the store; never duplicated). */
const MODULE_DEPENDENCIES: Record<string, string> = {
  'MOD-01': 'Engagements, jobs, tasks, PBC, reviews, invoices (scoped projections)', 'MOD-02': 'Contacts, relationship groups, custom fields',
  'MOD-03': 'Client (on Won conversion)', 'MOD-04': 'Lead, client, service catalogue; accepted proposal → engagement', 'MOD-05': 'Engagement, job templates, staff grants',
  'MOD-06': 'Engagement (on apply)', 'MOD-07': 'Jobs, comments, staff grants', 'MOD-08': 'Explicitly shared documents, issued invoices, presented proposals/packages',
  'MOD-09': 'Engagement, client contacts, portal uploads (IndexedDB)', 'MOD-10': 'Engagement folders, PBC, evidence links', 'MOD-11': 'Client, engagement, email templates',
  'MOD-12': 'Jobs/tasks, budget rates', 'MOD-13': 'Approved time', 'MOD-14': 'Approved billable time or accepted fixed-fee proposal', 'MOD-15': 'Issued invoices, credit notes, receipts',
  'MOD-16': 'All scoped registers', 'MOD-17': 'All scoped registers', 'MOD-18': 'Firm settings', 'MOD-19': 'Users, role grants, invitations',
  'MOD-20': 'Accounting profile, period book', 'MOD-21': 'TB/GL source revisions, chart of accounts', 'MOD-22': 'TB source, evidence/workpaper/finding revisions',
  'MOD-23': 'TB source, GL, evidence', 'MOD-24': 'TB source, approved mapping, layout, accepted adjustments', 'MOD-25': 'Statements, mapping, GL, workpapers, reviews, findings, disclosures',
  'MOD-26': 'Pinned component packages, FX rates, perimeter', 'MOD-27': 'Client, prior-year engagement', 'MOD-28': 'Engagement, TB benchmark, risks',
  'MOD-29': 'Audit plan, program templates', 'MOD-30': 'Procedures, evidence', 'MOD-31': 'Population source, GL account, materiality', 'MOD-32': 'Templates, evidence, documents',
  'MOD-33': 'Documents, procedures', 'MOD-34': 'Procedures, workpapers, samples, journals', 'MOD-35': 'Workpapers, findings', 'MOD-36': 'Package, workpapers, reviews, EQR assignment',
  'MOD-37': 'Workpapers, reviews, findings, current sign-offs, package', 'MOD-38': 'Released artifacts', 'MOD-39': 'Users, grants, firm settings'
};
const PRODUCT_ROLES: RoleKey[] = ['relationship', 'onboarding', 'compliance', 'partner', 'manager', 'preparer', 'reviewer', 'eqr', 'billing', 'records', 'admin', 'client_admin', 'client_finance', 'client'];


const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'docs', 'prototype', 'lifecycle-matrix.md');
const cell = (value: string | undefined) => (value || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderLifecycleMatrix(): string {
  const lines: string[] = [
    '# AuditSphere Visual Prototype — Lifecycle Matrix',
    '',
    '`docs/prototype/lifecycle-matrix.md` · **generated** by `npx tsx tools/lifecycle-matrix.ts` from',
    '`src/services/lifecycles.ts` — do not edit by hand. `tests/unit/enterpriseUx.test.ts` verifies that every',
    'named command exists on `prototypeStore` and that every status literal of each typed record is placed in its',
    'lifecycle; `tests/unit/docsContract.test.ts` fails if this file is out of date.',
    '',
    'Scope: browser-only synthetic prototype. Transitions are the store commands that exist today; nothing here',
    'describes production workflow, automation or scheduling. Segregation-of-duties rules are enforced by',
    '`src/services/guards.ts` (`requireIndependentActor`), and the reserved superuser only records',
    '`Prototype Superuser Override` events — it is never independence evidence.',
    '',
    '## Summary',
    '',
    '| Lifecycle | Record | Module / route | Main path | Rework | Blocked / stale | Terminal |',
    '|---|---|---|---|---|---|---|'
  ];
  for (const def of LIFECYCLES) {
    lines.push(`| \`${def.id}\` | ${cell(def.record)} | ${cell(def.module)} · \`${def.route}\` | ${cell(def.path.map(step => step.step).join(' → '))} | ${cell(def.rework ? `${def.rework.statuses.join(', ') || '(Draft + return note)'} → ${def.rework.returnsTo}` : '')} | ${cell([...(def.blocked || []), ...(def.stale || [])].join(', '))} | ${cell((def.terminal || []).join(', '))} |`);
  }
  lines.push('', '## Module matrix (all 39 modules)', '',
    'Role/Scope lists the product roles that can open the module route (`canOpenRoute`; the superuser is excluded because it is not a product role). Every record is additionally filtered by the persona\'s client/engagement/group grants. Happy and negative paths come from the module rehearsal guides (`src/services/moduleGuideContent.ts`).', '',
    '| Module | Steps | Current State | Completed | Pending | Blocked | Review/Rework | Role/Scope | Dependencies | Next Action |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const guide of MODULE_GUIDES) {
    const ids = MODULE_LIFECYCLES[guide.id];
    if (!ids) throw new Error(`No lifecycle mapping for ${guide.id}`);
    const defs = ids.map(id => lifecycleById(id));
    const route = guide.route.replace(/`/g, '').split(/[^a-z0-9-]+/i).find(token => token && token !== 'Shell') as RouteKey | undefined;
    const roles = route && route !== ('search' as RouteKey) ? PRODUCT_ROLES.filter(role => canOpenRoute(role, route)) : PRODUCT_ROLES;
    const steps = defs.length ? defs.map(d => d.path.map(s => s.step).join(' → ')).join('; ') : 'Context & Queue Monitoring';
    const states = defs.length ? [...new Set(defs.flatMap(def => [...def.path.flatMap(step => step.statuses), ...(def.rework?.statuses || []), ...(def.blocked || []), ...(def.stale || [])]))].join(', ') : 'Active portfolio projection';
    const completed = guide.outcome;
    const pending = defs.length ? [...new Set(defs.flatMap(def => def.path.slice(0, -1).flatMap(s => s.statuses)))].join(', ') : 'Open queue tasks and unreviewed items';
    const blocked = defs.length ? [...new Set(defs.flatMap(def => def.blocked || []))].join(', ') || 'Downstream holds / restrictions' : 'Scope or grant boundary';
    const rework = defs.map(def => def.rework?.note || def.transitions.filter(t => /return|reject|reopen/i.test(`${t.to} ${t.rule || ''}`)).map(t => `${t.command}: ${t.to}`).join('; ')).filter(Boolean).join(' ') || '—';
    const nextAction = defs.length ? [...new Set(defs.flatMap(def => def.transitions.map(t => `\`${t.command}\``)))].slice(0, 3).join(', ') : 'Inspect scoped records, drill down or filter';
    lines.push(`| ${guide.id} ${cell(guide.name)} | ${cell(steps)} | ${cell(states)} | ${cell(completed)} | ${cell(pending)} | ${cell(blocked)} | ${cell(rework)} | ${cell(roles.join(', '))} + grant scope | ${cell(MODULE_DEPENDENCIES[guide.id])} | ${cell(nextAction)} |`);
  }
  if (MODULE_GUIDES.length !== 39) throw new Error(`Expected 39 module guides, found ${MODULE_GUIDES.length}`);
  lines.push('', '## Transitions by lifecycle', '');
  for (const def of LIFECYCLES) {
    lines.push(`### ${def.record} (\`${def.id}\`)`, '');
    lines.push(`Module: ${def.module} · route \`${def.route}\``, '');
    lines.push('| From | To | Store command | Actor | Rule enforced |', '|---|---|---|---|---|');
    for (const t of def.transitions) lines.push(`| ${cell(t.from)} | ${cell(t.to)} | \`${t.command}\` | ${cell(t.actor)} | ${cell(t.rule)} |`);
    const notes = [def.rework ? `**Rework:** ${def.rework.note}` : '', def.staleness ? `**Staleness:** ${def.staleness}` : '', def.amendPath ? `**Amend / reopen:** ${def.amendPath}` : ''].filter(Boolean);
    if (notes.length) lines.push('', ...notes);
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const next = renderLifecycleMatrix();
  if (process.argv.includes('--check')) {
    const current = readFileSync(target, 'utf8');
    if (current !== next) { console.error('lifecycle-matrix.md is out of date; run npx tsx tools/lifecycle-matrix.ts'); process.exit(1); }
    console.log('lifecycle-matrix.md is current');
  } else {
    writeFileSync(target, next);
    console.log(`wrote ${target} (${LIFECYCLES.length} lifecycles)`);
  }
}
