// Current-only architecture regression tests.
//
// These fail if the active tree reintroduces the retired route layer, the
// retired snapshot Worker, whole-state cloud saves, or historical runtime
// imports. Scans use precise constructs — never broad domain words.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_CATALOG } from '../../src/services/routeCatalog.js';
import { TARGET_GUIDES, CURRENT_WORKFLOW_ORDER } from '../../src/services/currentWorkflowGuides.js';
import { LIFECYCLES } from '../../src/services/lifecycles.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const scannedRoots = ['src', 'worker', 'tools'].map(dir => join(repoRoot, dir));

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, out);
    else if (/\.(ts|tsx|mjs|py)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const sourceFiles = scannedRoots.filter(existsSync).flatMap(dir => walkFiles(dir));
const readSource = (path: string) => readFileSync(path, 'utf8');

describe('Worker-backed default runtime', () => {
  it('loads the browser-store prototype only when the isolated E2E harness opts in', () => {
    const app = readSource(join(repoRoot, 'src', 'App.tsx'));
    const lifecycleE2E = readSource(join(repoRoot, 'tests', 'e2e', 'targetLifecycle.test.ts'));
    assert.match(app, /import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_TEST_HARNESS\s*===\s*'true'/);
    assert.match(app, /import\('\.\/PrototypeApp'\)/);
    assert.match(lifecycleE2E, /VITE_TEST_HARNESS:\s*'true'/);
  });

  it('runs local development and preview through the configured Worker and local bindings', () => {
    const scripts = JSON.parse(readSource(join(repoRoot, 'package.json'))).scripts as Record<string, string>;
    assert.match(scripts.dev, /npm run build\s*&&\s*wrangler dev --config wrangler\.jsonc/);
    assert.match(scripts.preview, /wrangler dev --config wrangler\.jsonc/);
    assert.doesNotMatch(scripts.preview, /vite preview/);
    assert.equal(scripts['cloud:dev'], 'npm run dev');
  });
});

describe('current-only route architecture', () => {
  it('RouteKey literals and ROUTE_CATALOG keys are exactly the same set', () => {
    const typesSource = readSource(join(repoRoot, 'src', 'types', 'index.ts'));
    const block = typesSource.slice(typesSource.indexOf('export type RouteKey ='));
    const union = block.slice(0, block.indexOf(';'));
    const literals = [...union.matchAll(/'([a-z][a-z0-9-]*)'/g)].map(match => match[1]);
    assert.ok(literals.length > 20, 'the RouteKey union was found');
    const catalogKeys = Object.keys(ROUTE_CATALOG).sort();
    assert.deepEqual([...new Set(literals)].sort(), catalogKeys, 'RouteKey and ROUTE_CATALOG must agree exactly');
  });

  it('every workflow guide, lifecycle and navigation-order route is a current route', () => {
    for (const guide of TARGET_GUIDES) assert.ok(guide.route in ROUTE_CATALOG, `guide ${guide.id} route ${guide.route}`);
    for (const route of CURRENT_WORKFLOW_ORDER) assert.ok(route in ROUTE_CATALOG, `workflow order route ${route}`);
    for (const lifecycle of LIFECYCLES) {
      assert.ok(!lifecycle.route || lifecycle.route in ROUTE_CATALOG, `lifecycle ${lifecycle.id} route ${lifecycle.route} must be current`);
    }
  });
});

describe('no legacy route compatibility layer', () => {
  it('no active source imports legacyRoutes, legacyRouteCatalog or route canonicalization', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const text = readSource(file);
      if (/from\s+'[^']*legacy(Routes|RouteCatalog)'/.test(text)) violations.push(file);
      if (/\b(LegacyRouteId|RETIRED_ROUTE_REDIRECTS|LEGACY_ROUTE_REDIRECTS|canonicalRoute)\b/.test(text)) violations.push(file);
    }
    assert.deepEqual(violations, []);
  });

  it('the legacy route files no longer exist', () => {
    assert.equal(existsSync(join(repoRoot, 'src', 'services', 'legacyRoutes.ts')), false);
    assert.equal(existsSync(join(repoRoot, 'src', 'services', 'legacyRouteCatalog.ts')), false);
  });
});

describe('no legacy snapshot Worker usage', () => {
  it('no runtime or config reference to the retired Worker or its browser env var', () => {
    const violations: string[] = [];
    const configFiles = ['wrangler.jsonc', 'package.json', '.env.production', '.env.example'].map(f => join(repoRoot, f)).filter(existsSync);
    for (const file of [...sourceFiles, ...configFiles]) {
      const text = readSource(file);
      if (/VITE_DEMO_API_URL/.test(text)) violations.push(file);
      if (/steaudit-prototype-demo-api/.test(text)) violations.push(file);
      if (/worker[/\\]wrangler\.jsonc/.test(text)) violations.push(file);
      if (/[\\/]services[/\\]cloudDemo\.ts/.test(text) || /cloudDemo\./.test(text)) violations.push(file);
      if (/demo:seed|demo:typecheck|test:cloud:v2/.test(text) && file.endsWith('package.json')) violations.push(file);
    }
    assert.deepEqual(violations, [], 'retired snapshot Worker constructs must stay out of the active tree');
  });

  it('the retired Worker source and config are gone; one Wrangler config remains', () => {
    assert.equal(existsSync(join(repoRoot, 'worker', 'wrangler.jsonc')), false);
    assert.equal(existsSync(join(repoRoot, 'src', 'services', 'cloudDemo.ts')), false);
    assert.ok(existsSync(join(repoRoot, 'wrangler.jsonc')), 'the root Worker config is canonical');
    const config = readSource(join(repoRoot, 'wrangler.jsonc'));
    assert.match(config, /"main":\s*"worker\/index\.ts"/, 'the root config points at the canonical worker entry');
    assert.doesNotMatch(config, /worker\/v2/, 'no v2 path remains in the Worker config');
    assert.doesNotMatch(config, /TEST_SNAPSHOT_API_ENABLED/, 'production never opts into the retired demo/session API');
  });

  it('the browser holds no Bearer workspace token and sends no whole-state PUT', () => {
    const browserFiles = walkFiles(join(repoRoot, 'src'));
    for (const file of browserFiles) {
      const text = readSource(file);
      assert.doesNotMatch(text, /Authorization['"`]?\s*[,:=][^;\n]*Bearer/i, `${file} must not hold a Bearer token`);
    }
    for (const file of browserFiles.filter(path => path.includes('services'))) {
      const text = readSource(file);
      // The only permitted PUT is the two-phase file content upload (bytes to the
      // staged object endpoint); no PUT may target workspace state itself.
      for (const match of text.matchAll(/method:\s*'PUT'/g)) {
        const context = text.slice(Math.max(0, match.index ?? 0) - 220, (match.index ?? 0) + 220);
        assert.ok(/uploadUrl|\/content/.test(context), `${file} issues a PUT that is not a file content upload`);
      }
    }
  });
});

describe('no historical runtime imports', () => {
  it('nothing under src, worker or tools imports from historical/', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (/from\s+'[^']*historical\//.test(readSource(file))) violations.push(file);
    }
    assert.deepEqual(violations, []);
  });

  it('the historical tree is removed from the active repository', () => {
    assert.equal(existsSync(join(repoRoot, 'historical')), false);
  });
});
