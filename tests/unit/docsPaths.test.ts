import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const documents = ['README.md', 'CLAUDE.md'];

function looksLikeRepositoryPath(value: string): boolean {
  return !value.includes('*')
    && (value.includes('/') || value.includes('\\') || /\.(md|json|tsx?|css|sql|lock)$/.test(value));
}

test('README and CLAUDE path references resolve to existing repository files', () => {
  const missing: string[] = [];

  for (const document of documents) {
    const contents = readFileSync(resolve(root, document), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      if (line.includes('[TARGET]') || line.includes('(new)')) continue;
      for (const [, candidate] of line.matchAll(/`([^`]+)`/g)) {
        if (looksLikeRepositoryPath(candidate) && !existsSync(resolve(root, candidate))) {
          missing.push(`${document}: ${candidate}`);
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});
