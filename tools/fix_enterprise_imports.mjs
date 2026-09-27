/**
 * Development tool: rebuilds each module's shared-component import from the names
 * the file actually uses, so a mangled import line cannot leave a view referencing
 * an undefined component.
 *
 * Usage: node tools/fix_enterprise_imports.mjs [--write]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modulesDir = join(here, '..', 'src', 'components', 'modules');
const write = process.argv.includes('--write');

/** Every component the shared module exports. */
const EXPORTS = [
  'ActionReason', 'ActivityTimeline', 'BlockerNotice', 'HandoffLinks', 'LifecycleHint',
  'LifecycleStepper', 'ListState', 'LIST_STATE_TEXT', 'MetricCard', 'ModuleIdentityLine',
  'ModuleLifecycleHint', 'ModuleLifecycleStepper', 'ModulePageHeader', 'PageHeader',
  'ProvenancePanel', 'ReviewPanel', 'SectionCard', 'StaleNotice', 'StateBlock', 'StatusBadge',
  'TONE_MEANING', 'moduleIdentity', 'useModuleContext', 'useModuleIdentity', 'useModuleLifecycle'
];

let changed = 0;
for (const name of readdirSync(modulesDir).filter(file => file.endsWith('.tsx')).sort()) {
  const path = join(modulesDir, name);
  const source = readFileSync(path, 'utf8');
  const current = /import \{([^}]*)\} from '\.\.\/common\/Enterprise';/.exec(source);
  if (!current) continue;

  // A name is used if it appears as JSX (<Name) or as a call/identifier (Name( or Name=).
  const used = EXPORTS.filter(component => {
    const escaped = component.replace(/[$]/g, '\\$');
    return new RegExp(`<${escaped}[\\s/>]|\\b${escaped}\\s*\\(|\\b${escaped}\\.`).test(source);
  });
  const declared = current[1].split(/[\s,]+/).filter(Boolean);
  const correct = [...new Set(used)].sort();
  if (declared.length === correct.length && declared.every(item => correct.includes(item))) continue;

  const next = source.slice(0, current.index)
    + `import { ${correct.join(', ')} } from '../common/Enterprise';`
    + source.slice(current.index + current[0].length);
  if (correct.length === 0) {
    // Remove the now-unused import line entirely.
    const withoutImport = next.replace(/import \{[^}]*\} from '\.\.\/common\/Enterprise';\n?/, '');
    if (write) writeFileSync(path, withoutImport, 'utf8');
    console.log(`${write ? 'wrote' : 'would write'} ${name}: removed unused import`);
  } else {
    if (write) writeFileSync(path, next, 'utf8');
    console.log(`${write ? 'wrote' : 'would write'} ${name}: { ${correct.join(', ')} }`);
  }
  changed += 1;
}
console.log(`\n${changed} file(s).`);
