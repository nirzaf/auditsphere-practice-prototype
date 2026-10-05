// Generates docs/prototype/lifecycle-matrix.md from current route, guide and
// lifecycle metadata. There is no historical module catalog in this tool.
// Usage: npx tsx tools/current-workflow-matrix.ts [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_GUIDES } from '../src/services/currentWorkflowGuides.js';
import { ROUTE_CATALOG } from '../src/services/routeCatalog.js';
import { LIFECYCLES } from '../src/services/lifecycles.js';
import { canOpenRoute } from '../src/services/guards.js';
import type { RoleKey, RouteKey } from '../src/types/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'docs', 'prototype', 'lifecycle-matrix.md');
const roles: RoleKey[] = ['preparer','reviewer','partner','client'];
const cell = (value: unknown) => String(value ?? '').replaceAll('|', '/').replaceAll('\n', ' ').trim();

export function renderCurrentWorkflowMatrix(): string {
  const guideByRoute = new Map(TARGET_GUIDES.map(guide => [guide.route, guide]));
  const routes = Object.keys(ROUTE_CATALOG) as RouteKey[];
  const lines = [
    '# Current workflow and lifecycle matrix',
    '',
    'Generated from `src/services/routeCatalog.ts`, `src/services/currentWorkflowGuides.ts`, and `src/services/lifecycles.ts`.',
    'This matrix describes only the current five-module AuditSphere route surface; it does not enumerate retired product modules.',
    '',
    '| Module | Current route | Workflow / view | Current lifecycle records | Roles with route access | Guidance steps |',
    '|---|---|---|---|---|---|'
  ];
  for (const route of routes) {
    const info = ROUTE_CATALOG[route];
    const guide = guideByRoute.get(route);
    if (!guide) throw new Error(`Current route ${route} has no current workflow guide.`);
    const lifecycles = LIFECYCLES.filter(definition => definition.route === route).map(definition => definition.record);
    const readable = roles.filter(role => canOpenRoute(role, route)).join(', ') || 'No product persona';
    lines.push(`| ${cell(info.section)} | \`${route}\` | ${cell(info.label)} | ${cell(lifecycles.join(', ') || 'Projection / reference')} | ${cell(readable)} | ${cell(guide.steps.join(' '))} |`);
  }
  lines.push('', '## Lifecycle transitions', '');
  for (const definition of LIFECYCLES) {
    const routeInfo = ROUTE_CATALOG[definition.route];
    if (!routeInfo) throw new Error(`Lifecycle ${definition.id} refers to unknown route ${definition.route}.`);
    lines.push(`### ${cell(definition.record)} (\`${definition.id}\`) · ${routeInfo.label}`, '');
    lines.push(`Current route: \`${definition.route}\``, '');
    lines.push('| From | To | Store command | Actor | Rule enforced |', '|---|---|---|---|---|');
    for (const transition of definition.transitions) {
      lines.push(`| ${cell(transition.from)} | ${cell(transition.to)} | \`${cell(transition.command)}\` | ${cell(transition.actor)} | ${cell(transition.rule || '')} |`);
    }
    const notes = [
      definition.rework ? `**Rework:** ${definition.rework.note}` : '',
      definition.staleness ? `**Staleness:** ${definition.staleness}` : '',
      definition.amendPath ? `**Amend / reopen:** ${definition.amendPath}` : ''
    ].filter(Boolean);
    if (notes.length) lines.push('', ...notes);
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const generated = renderCurrentWorkflowMatrix();
  if (process.argv.includes('--check')) {
    const current = readFileSync(target, 'utf8');
    if (current !== generated) {
      console.error('lifecycle-matrix.md is out of date; run npx tsx tools/current-workflow-matrix.ts');
      process.exit(1);
    }
    console.log('lifecycle-matrix.md is current');
  } else {
    writeFileSync(target, generated);
    console.log(`wrote current route/lifecycle matrix (${Object.keys(ROUTE_CATALOG).length} routes, ${LIFECYCLES.length} record lifecycles)`);
  }
}
