// MOD-UX-02: the lifecycle/progress matrix must match the shipped code.
//
// The matrix is generated, so it can never quietly describe a module the code no
// longer has. This suite regenerates it and compares, and separately checks the
// claims the document makes about each route.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_KEYS } from '../../src/types/index.js';
import { ROUTE_REGISTRY } from '../../src/services/routeRegistry.js';
import { LIFECYCLE_MODELS, MODULE_LIFECYCLE_MODEL } from '../../src/services/lifecycle.js';
import { PROGRESS_SOURCES, renderMatrix } from '../../tools/lifecycle-progress-matrix.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', 'docs', 'prototype', 'lifecycle-progress-matrix.md');

describe('MOD-UX-02 lifecycle and progress matrix', () => {
  it('matches the generated matrix for every registered route', () => {
    const committed = readFileSync(target, 'utf8');
    assert.equal(
      committed,
      renderMatrix(),
      'docs/prototype/lifecycle-progress-matrix.md is out of date. Regenerate with: npx tsx tools/lifecycle-progress-matrix.ts'
    );
  });

  it('declares a progress source for every supported route', () => {
    const missing = ROUTE_KEYS.filter(route => !PROGRESS_SOURCES[route]);
    assert.deepEqual(missing, [], `routes with no declared progress source: ${missing.join(', ')}`);
    const unknown = Object.keys(PROGRESS_SOURCES).filter(route => !ROUTE_KEYS.includes(route as any));
    assert.deepEqual(unknown, [], `progress sources declared for unknown routes: ${unknown.join(', ')}`);
  });

  it('states the record fields a module counts, or says it has no workflow', () => {
    for (const route of ROUTE_KEYS) {
      const source = PROGRESS_SOURCES[route];
      assert.ok(source.source.length > 20, `${route} must describe its progress source or state that it has none`);
      if (source.runtime === 'register') {
        // A register must not imply a journey it does not have. The real check is
        // that it documents records rather than a step sequence.
        assert.ok(
          !/→/.test(source.source),
          `${route} is a register and must not document a step sequence: ${source.source}`
        );
      }
      if (source.runtime === 'tracker') {
        // A module that renders the derived tracker must have a real model.
        const model = LIFECYCLE_MODELS[MODULE_LIFECYCLE_MODEL[route]];
        assert.ok(model.steps.length >= 5, `${route} renders a tracker, so its model must have real steps`);
      }
    }
  });

  it('names the next action for every route in the registry', () => {
    for (const route of ROUTE_KEYS) {
      assert.ok(ROUTE_REGISTRY[route].nextStep.length > 10, `${route} must state its primary next step`);
    }
  });

  it('records how many screens render the derived tracker, so the claim stays honest', () => {
    const tracked = ROUTE_KEYS.filter(route => PROGRESS_SOURCES[route].runtime === 'tracker');
    assert.ok(tracked.length >= 2, `the derived tracker must be applied to real screens, found ${tracked.length}`);
    // The two flagship journeys named in the task.
    assert.ok(tracked.includes('engagements'), 'the engagement journey must render a derived tracker');
    assert.ok(tracked.includes('financial-packages'), 'the package journey must render a derived tracker');
    const document = readFileSync(target, 'utf8');
    assert.match(document, new RegExp(`Screens rendering the shared derived tracker: ${tracked.length}`),
      'the matrix must state how many screens render the tracker');
  });
});
