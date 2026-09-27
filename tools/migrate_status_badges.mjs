/**
 * MOD-UX-01 status vocabulary migration (development tool, idempotent).
 *
 * Replaces plain JSX-child `{record.status}` / `{record.stage}` renders with the
 * shared <StatusBadge>, so every module shows the same tone, glyph and accessible
 * description for the same business state — and replaces any hand-rolled
 * `<span className="badge …">{x.status}</span>` wrapper with the same badge.
 *
 * Deliberately conservative. It refuses to touch a status that is:
 *   * inside a template literal (`Status: ${inv.status}`) — that is prose;
 *   * an attribute value or an <option> label — those must stay primitives;
 *   * part of a larger expression or a conditional;
 *   * already expressed through the shared badge.
 *
 * Usage:  node tools/migrate_status_badges.mjs [--write]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modulesDir = join(here, '..', 'src', 'components', 'modules');
const write = process.argv.includes('--write');

const IMPORT_LINE = "import { StatusBadge } from '../common/Enterprise';";

/** `<span className={`badge …`}>{expr.status}</span>` — the legacy wrapper. */
const WRAPPER = /<span className=(?:"|`)badge[^"`]*(?:"|`)>\{([a-zA-Z_$][\w$.?[\]]*\.(?:status|stage|state))\}<\/span>/g;

/** A bare `{expr.status}` JSX child expression. */
const BARE = /\{(?<expr>[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*\.(?:status|stage|state))\}/g;

const SKIP_FILES = new Set(['TBImportClientProfileModal.tsx', 'ClientProfileModal.tsx', 'TBImportWizard.tsx']);

/** True when the match sits inside a template literal, attribute or option. */
function unsafeContext(whole, offset, lineStart, lineEnd) {
  const prefix = whole.slice(lineStart, offset);
  // Inside a template literal: the character before `{` is `$`.
  if (/\$$/.test(prefix)) return true;
  // Inside an attribute value: the last `=` comes after the last tag/content boundary.
  const lastBoundary = Math.max(prefix.lastIndexOf('>'), prefix.lastIndexOf('}'));
  if (prefix.lastIndexOf('=') > lastBoundary) return true;
  // Inside an open tag (covers <option …>{x.status}</option> and similar).
  if (prefix.lastIndexOf('<') > prefix.lastIndexOf('>')) return true;
  // Inside a non-container element whose children must stay text.
  const segment = whole.slice(lineStart, lineEnd === -1 ? whole.length : lineEnd);
  const openTextOnly = Math.max(segment.lastIndexOf('<option'), segment.lastIndexOf('<textarea'));
  if (openTextOnly !== -1) {
    const closeOption = segment.indexOf('</option>', openTextOnly);
    const closeTextarea = segment.indexOf('</textarea>', openTextOnly);
    const close = [closeOption, closeTextarea].filter(index => index !== -1).sort((a, b) => a - b)[0] ?? Infinity;
    if (offset - lineStart > openTextOnly && offset - lineStart < close) return true;
  }
  // Inside a conditional or a longer expression: only when an expression is
  // still open at this point (unbalanced brace) or a ternary starts on the line.
  if ((prefix.match(/\{/g) ?? []).length > (prefix.match(/\}/g) ?? []).length) return true;
  if (/\?\s*[^:]*$/.test(prefix)) return true;
  return false;
}

let totalFiles = 0;
let totalReplacements = 0;
const report = [];

for (const name of readdirSync(modulesDir).filter(file => file.endsWith('.tsx')).sort()) {
  if (SKIP_FILES.has(name)) continue;
  const path = join(modulesDir, name);
  const source = readFileSync(path, 'utf8');
  let replaced = 0;

  // 1. Replace the legacy `badge` wrapper with the shared badge.
  let converted = source.replace(WRAPPER, (_match, expression) => {
    replaced += 1;
    return `<StatusBadge status={${expression}} />`;
  });

  // 2. Replace remaining bare JSX-child renders.
  converted = converted.replace(BARE, (match, expression, offset, whole) => {
    const lineStart = whole.lastIndexOf('\n', offset) + 1;
    const lineEnd = whole.indexOf('\n', offset);
    const line = whole.slice(lineStart, lineEnd === -1 ? whole.length : lineEnd);
    if (line.includes('StatusBadge') || line.includes('data-status-')) return match;
    if (unsafeContext(whole, offset, lineStart, lineEnd)) return match;
    replaced += 1;
    return `<StatusBadge status={${expression}} />`;
  });

  if (!replaced) continue;

  const shared = /import \{([^}]*)\} from '\.\.\/common\/Enterprise';/.exec(converted);
  if (shared) {
    const names = new Set(shared[1].split(',').map(part => part.trim()).filter(Boolean));
    if (!names.has('StatusBadge')) {
      names.add('StatusBadge');
      converted = converted.slice(0, shared.index)
        + `import { ${[...names].sort().join(', ')} } from '../common/Enterprise';`
        + converted.slice(shared.index + shared[0].length);
    }
  } else {
    const imports = [...converted.matchAll(/^import\s[^\n]*?from\s+'[^']+';\s*$/gm)];
    if (!imports.length) { report.push(`skipped ${name}: no import block`); continue; }
    const anchor = imports[imports.length - 1];
    const end = anchor.index + anchor[0].length;
    converted = converted.slice(0, end) + `\n${IMPORT_LINE}` + converted.slice(end);
  }

  totalFiles += 1;
  totalReplacements += replaced;
  report.push(`${write ? 'wrote' : 'would write'} ${name}: ${replaced}`);
  if (write) writeFileSync(path, converted, 'utf8');
}

console.log(report.join('\n'));
console.log(`\n${totalFiles} file(s), ${totalReplacements} status render(s).`);
