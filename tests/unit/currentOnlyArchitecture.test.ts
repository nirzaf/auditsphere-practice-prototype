import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('the app entry contains only the BUSINESS workspace and excludes the browser store', () => {
  assert.equal(existsSync(resolve(root, 'src/PrototypeApp.tsx')), false);
  assert.equal(existsSync(resolve(root, 'src/store')), false);
  const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const localImports = [...app.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(match => match[1]);
  assert.ok(localImports.includes('./components/business/BusinessWorkspace'));
  assert.ok(localImports.includes('./components/auth/AuthPages'));
  assert.ok(localImports.includes('./services/auth'));
  const removedSurfaceMarkers = [
    'ProductionWorkspaceLanding',
    ['BusinessWorkspace', 'SetupDialog'].join(''),
    ['business-active', 'persona'].join('-')
  ].join('|');
  assert.doesNotMatch(app, new RegExp(removedSurfaceMarkers));
});
