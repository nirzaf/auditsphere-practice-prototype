// MOD-UX-01: static enterprise-UX harness.
//
// Every routed module must present the shared page anatomy, use only stylesheet
// classes that actually exist, describe its statuses with the shared vocabulary,
// and offer a real empty/no-result state. These checks read the shipped source
// and stylesheets, so they fail the moment a module drifts back to an
// inconsistent pattern — no browser or screenshot required.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_KEYS } from '../../src/types/index.js';
import { ROUTE_REGISTRY, WORKSPACE_ROUTES, ROUTE_GROUP_ORDER } from '../../src/services/routeRegistry.js';
import { statusSemantics } from '../../src/services/lifecycle.js';
import { resolveRouteHash, LEGACY_ROUTE_REDIRECTS } from '../../src/services/legacyRoutes.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const modulesDir = join(repoRoot, 'src', 'components', 'modules');

function read(relative: string): string {
  return readFileSync(join(repoRoot, relative), 'utf8');
}

const appSource = read(join('src', 'App.tsx'));
const moduleFiles = readdirSync(modulesDir).filter(name => name.endsWith('.tsx'));
const moduleSource = new Map(moduleFiles.map(name => [name.replace('.tsx', ''), readFileSync(join(modulesDir, name), 'utf8')]));

/** View component name -> source, for the modules App actually routes to. */
const routedViews = new Map<string, string>();
for (const match of appSource.matchAll(/<([A-Za-z0-9_]+)\s/g)) {
  const name = match[1];
  if (moduleSource.has(name)) routedViews.set(name, moduleSource.get(name)!);
}

describe('MOD-UX-01 static enterprise UX harness', () => {
  it('exposes one registered, labelled module for every supported route', () => {
    const unregistered = ROUTE_KEYS.filter(route => !ROUTE_REGISTRY[route]);
    assert.deepEqual(unregistered, [], `routes without registry metadata: ${unregistered.join(', ')}`);
    for (const route of ROUTE_KEYS) {
      const entry = ROUTE_REGISTRY[route];
      assert.ok(entry.label.length > 3, `${route} needs a human-readable label`);
      assert.ok(entry.nextStep.length > 10, `${route} must state its primary next step`);
      assert.ok(ROUTE_GROUP_ORDER.includes(entry.group), `${route} is in an unknown navigation group: ${entry.group}`);
      if (entry.kind === 'alias') {
        assert.ok(entry.aliasOf, `${route} is an alias and must name the route it resolves to`);
        assert.notEqual(entry.aliasOf, route, `${route} cannot alias itself`);
        assert.equal(ROUTE_REGISTRY[entry.aliasOf!].kind === 'alias', false, `${route} must alias a first-class route`);
      }
      for (const next of entry.continuesTo ?? []) {
        assert.ok(ROUTE_KEYS.includes(next), `${route} continues to an unknown route: ${next}`);
      }
    }
  });

  it('renders every routed module through the shared page header anatomy', () => {
    const offenders: string[] = [];
    for (const [view, source] of routedViews) {
      if (view === 'ClientProfileModal') continue; // modal, not a routed page
      const hasPageHeader = source.includes('<PageHeader') || source.includes('<ModulePageHeader');
      const hasPageheadClass = /className="[^"]*\bpagehead\b/.test(source);
      if (!hasPageHeader && !hasPageheadClass) {
        offenders.push(`${view} has no page header`);
        continue;
      }
      // A page header must carry exactly one accessible top-level heading per
      // rendered branch (a view may legitimately have a denial branch as well).
      const branches = source.split(/\breturn\s*\(/).slice(1);
      for (const branch of branches) {
        const h1Count = (branch.match(/<h1[\s>]/g) ?? []).length;
        if (h1Count > 1) offenders.push(`${view} renders ${h1Count} <h1> headings in one branch`);
      }
      if (hasPageHeader) {
        // PageHeader owns the heading, so the view must pass a title.
        if (!/<PageHeader[\s\S]{0,200}?title=/.test(source)) offenders.push(`${view} uses PageHeader without a title`);
      } else if ((source.match(/<h1[\s>]/g) ?? []).length === 0) {
        offenders.push(`${view} has no <h1>`);
      }
    }
    assert.deepEqual(offenders, [], `shared page anatomy violations:\n  ${offenders.join('\n  ')}`);
  });

  it('describes business statuses with the shared vocabulary instead of raw strings', () => {
    const offenders: string[] = [];
    for (const [view, source] of moduleSource) {
      for (const match of source.matchAll(/\{([a-zA-Z_$][\w.$?]*(?:\.status|\.stage|\.state))\}/g)) {
        const expression = match[1];
        const index = match.index!;
        const lineStart = source.lastIndexOf('\n', index) + 1;
        const lineEnd = source.indexOf('\n', index);
        const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
        // 1. Statuses inside a template literal carry their own sentence.
        if (source.slice(lineStart, index).endsWith('$')) continue;
        // 2. Attribute values and <option> labels must stay primitives.
        const prefix = source.slice(lineStart, index);
        if (prefix.lastIndexOf('=') > Math.max(prefix.lastIndexOf('>'), prefix.lastIndexOf('}'))) continue;
        if (line.includes('<option')) continue;
        // 3. A badge rendered anywhere on the same line covers that line: the
        //    renderers are one-liners, so this is the readable unit of review.
        if (line.includes('StatusBadge') || line.includes('statusSemantics')) continue;
        const lineNumber = source.slice(0, index).split('\n').length;
        offenders.push(`${view}:${lineNumber} ${expression} is rendered without StatusBadge`);
      }
    }
    assert.deepEqual(offenders, [], `statuses must use the shared vocabulary:\n  ${offenders.join('\n  ')}`);
  });

  it('only uses stylesheet classes that are actually defined', () => {
    const stylesheets = ['styles.css', 'roles.css', join('src', 'enterprise.css'), join('src', 'host.css')]
      .map(read).join('\n');
    const defined = new Set([...stylesheets.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]));
    const offenders: string[] = [];
    const scan = (source: string, label: string) => {
      for (const match of source.matchAll(/className="([^"]+)"/g)) {
        for (const token of match[1].split(/\s+/).filter(Boolean)) {
          // Dynamic template fragments are checked by their static halves only.
          if (token.includes('{') || token.includes('$')) continue;
          if (!defined.has(token)) offenders.push(`${label}: undefined class "${token}"`);
        }
      }
    };
    for (const [view, source] of moduleSource) scan(source, view);
    scan(read(join('src', 'components', 'layout', 'Shell.tsx')), 'Shell');
    scan(read(join('src', 'components', 'common', 'Enterprise.tsx')), 'Enterprise');
    scan(read(join('src', 'App.tsx')), 'App');
    assert.deepEqual([...new Set(offenders)], [], `stylesheet coverage violations:\n  ${[...new Set(offenders)].join('\n  ')}`);
  });

  it('gives every workspace list a distinguishable no-records and no-match state', () => {
    // "Nothing exists yet" and "nothing matches these filters" are different
    // answers and must never share one message. The no-match answer is only
    // required where the module actually offers a search or filter control.
    const nothingExists = /No [^<>"{}]{0,60}(yet|have been recorded|have not been created|are available under|in this scope|recorded|available|exists|configured|registered|created|found|selected|raised|stored)/i;
    const nothingMatches = /No [^<>"{}]{0,60}(match|matches)|No matching records|nothing matching|no-match/i;
    const hasFilterControl = /aria-label="(?:Filter|Search)[^"]*"|type="search"|className="input-search"|Filter by |placeholder="Filter |placeholder="Search /i;
    const offenders: string[] = [];
    for (const [view, source] of routedViews) {
      if (view === 'ClientProfileModal') continue;
      const shared = source.match(/<StateBlock|<ListState/g) ?? [];
      const covered = (pattern: RegExp) => pattern.test(source) || shared.length >= 2;
      if (!covered(nothingExists)) offenders.push(`${view} has no "nothing exists yet" state`);
      // Comments describe filtering; only real markup counts as a filter control.
      const markup = source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
      if (hasFilterControl.test(markup) && !covered(nothingMatches)) {
        offenders.push(`${view} offers filtering but has no "nothing matches these filters" state`);
      }
    }
    assert.deepEqual(offenders, [], `empty-state coverage violations:\n  ${offenders.join('\n  ')}`);
  });

  it('keeps the module catalogue in step with the routed workspace list', () => {
    // Every workspace route must be reachable from the module guide so a demo
    // presenter can find it, and no guide entry may name a removed route.
    const guide = read(join('src', 'components', 'modules', 'ModuleCatalogueView.tsx'));
    const guides = read(join('src', 'services', 'moduleGuideContent.ts'));
    const registry = read(join('src', 'services', 'routeRegistry.ts'));
    const combined = `${guide}\n${guides}\n${registry}`;
    const missing = WORKSPACE_ROUTES.filter(route => !combined.includes(route));
    assert.deepEqual(missing, [], `workspace routes absent from the module guide: ${missing.join(', ')}`);
  });

  it('keeps legacy redirect targets inside the supported route catalogue', () => {
    for (const [from, to] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
      assert.ok(ROUTE_KEYS.includes(to as any), `legacy #${from} redirects to unsupported route ${to}`);
      assert.equal(resolveRouteHash(`#${from}`)?.route, to, `#${from} must resolve to ${to}`);
    }
  });

  it('renders every status vocabulary value with a tone and an accessible reading', () => {
    const tones = new Set<string>();
    for (const status of ['Draft', 'Requested', 'Under review', 'Returned', 'Blocked', 'Stale', 'Approved', 'Completed', 'Cancelled', 'Simulated accepted']) {
      tones.add(statusSemantics(status).tone);
    }
    assert.ok(tones.size >= 7, `the shared vocabulary must cover distinct lifecycle tones, got ${tones.size}`);
    const enterprise = read(join('src', 'components', 'common', 'Enterprise.tsx'));
    // Inspect the badge implementation itself, not the whole shared module.
    const badge = enterprise.slice(enterprise.indexOf('export const StatusBadge'), enterprise.indexOf('export interface LifecycleStepperProps'));
    assert.match(badge, /title=\{description\}/, 'the badge must expose a plain-language description');
    assert.match(badge, /aria-label=\{description\}/, 'the badge must expose an accessible name');
    assert.match(badge, /data-status-tone=\{appliedTone\}/, 'the badge must publish its tone for styling and tests');
    assert.ok(!/status-glyph/.test(badge), 'the badge must not add a separator glyph that changes neighbouring text');
    assert.ok(!/sr-only/.test(badge), 'the badge must not add hidden text nodes that change rendered innerText');
    assert.match(badge, /\{semantic\.label\}/, 'the badge must render the literal status as its only text node');
    // Every tone the vocabulary can produce must have a matching style rule.
    const css = read(join('src', 'enterprise.css'));
    const missing = [...tones].filter(tone => !css.includes(`.status-badge.tone-${tone}`));
    assert.deepEqual(missing, [], `tones without a style rule: ${missing.join(', ')}`);
    // Colour alone is not enough: the tone also changes the border shape.
    assert.match(css, /\.status-badge\.tone-approved \{[^}]*border-left-color/, 'tone must change shape as well as colour');
  });
});
