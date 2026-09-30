import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WALKTHROUGHS, walkthroughsForRoute } from '../../src/services/walkthroughContent.js';
import { ROUTE_CATALOG } from '../../src/services/routeCatalog.js';

describe('module walkthroughs', () => {
  it('covers MOD-01..MOD-39 with short, complete steps', () => {
    assert.deepEqual(WALKTHROUGHS.map(w => w.id), Array.from({ length: 39 }, (_, i) => `MOD-${String(i + 1).padStart(2, '0')}`));
    for (const w of WALKTHROUGHS) {
      assert.ok(w.steps.length >= 3 && w.steps.length <= 5, `${w.id} keeps the tour short`);
      for (const s of w.steps) assert.ok(s.title && s.action && s.see, `${w.id} step is complete`);
      assert.ok(w.purpose && w.result, `${w.id} states purpose and outcome`);
    }
  });
  it('every operational route has a walkthrough; reference routes have none', () => {
    for (const [route, info] of Object.entries(ROUTE_CATALOG)) {
      const tours = walkthroughsForRoute(route as any);
      if (info.moduleId === 'REF') assert.equal(tours.length, 0, route);
      else { assert.ok(tours.length > 0, `${route} has a walkthrough`); assert.equal(tours[0].id, info.moduleId); }
    }
  });
});

import { JOURNEY, LIFECYCLE_STATES } from '../../src/services/walkthroughContent.js';
describe('journey placement (spec v2.1)', () => {
  it('uses the canonical 11-state lifecycle and only known routes', () => {
    assert.equal(LIFECYCLE_STATES.length, 11);
    for (const [route, placement] of Object.entries(JOURNEY)) {
      assert.ok(route in ROUTE_CATALOG, `${route} is a real route`);
      for (const state of placement!.states) assert.ok(LIFECYCLE_STATES.includes(state));
    }
  });
});
