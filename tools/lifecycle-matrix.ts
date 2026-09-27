// Generates docs/prototype/lifecycle-matrix.md from src/services/lifecycles.ts.
// Usage: npx tsx tools/lifecycle-matrix.ts [--check]
// --check exits non-zero when the committed document differs (used by the unit suite).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIFECYCLES } from '../src/services/lifecycles.js';

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
