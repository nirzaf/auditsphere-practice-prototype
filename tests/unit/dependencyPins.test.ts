import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>;
};

test('all direct dependencies are exactly pinned to their lockfile versions', () => {
  for (const group of ['dependencies', 'devDependencies'] as const) {
    for (const [name, version] of Object.entries(manifest[group])) {
      assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${group}.${name} must be an exact version`);
      assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} must match the lockfile`);
    }
  }
});
