import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_GUIDES, CURRENT_WORKFLOW_ORDER } from '../../src/services/currentWorkflowGuides.js';
import { buildWalkthrough, clampPosition, lastPosition } from '../../src/components/walkthrough/walkthroughModel.js';

describe('guided walkthrough model', () => {
  it('builds a walkthrough for every current route from the shared guide model', () => {
    assert.deepEqual(TARGET_GUIDES.map(guide => guide.route), CURRENT_WORKFLOW_ORDER);
    for (const guide of TARGET_GUIDES) {
      const walkthrough = buildWalkthrough(guide, false);
      assert.equal(walkthrough.steps.length, guide.steps.length, `${guide.id} keeps every step`);
      assert.ok(walkthrough.route && walkthrough.purpose && walkthrough.outcome && walkthrough.failure, `${guide.id} has current route, purpose, outcome and failure path`);
      for (const text of [walkthrough.purpose, walkthrough.outcome, walkthrough.failure, ...walkthrough.steps]) assert.ok(!text.includes('`'), `${guide.id} text is plain`);
    }
  });

  it('chains current routes in the five-module order and ends at the last route', () => {
    assert.equal(buildWalkthrough(TARGET_GUIDES[0], false).nextRoute, TARGET_GUIDES[1].route);
    assert.equal(buildWalkthrough(TARGET_GUIDES[TARGET_GUIDES.length - 1], false).nextRoute, null);
  });

  it('hides staff-only steps from client personas but retains current client-facing guidance', () => {
    const staffOnly = TARGET_GUIDES.find(guide => guide.route === 'trial-balance')!;
    const client = buildWalkthrough(staffOnly, true);
    assert.equal(client.stepsHidden, true);
    assert.deepEqual(client.steps, []);
    assert.ok(client.outcome.length > 0);
    assert.equal(buildWalkthrough(staffOnly, false).stepsHidden, false);
    const portal = buildWalkthrough(TARGET_GUIDES.find(guide => guide.route === 'portal')!, true);
    assert.equal(portal.stepsHidden, false);
    assert.equal(portal.route, 'portal');
  });

  it('keeps the screen position within introduction..summary', () => {
    const walkthrough = buildWalkthrough(TARGET_GUIDES[0], false);
    assert.equal(lastPosition(walkthrough), walkthrough.steps.length + 1);
    assert.equal(clampPosition(walkthrough, -3), 0);
    assert.equal(clampPosition(walkthrough, 999), lastPosition(walkthrough));
    assert.equal(clampPosition(walkthrough, Number.NaN), 0);
  });
});
