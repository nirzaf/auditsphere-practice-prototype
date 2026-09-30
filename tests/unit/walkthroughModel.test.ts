import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_GUIDES } from '../../historical/moduleGuideContent.js';
import { buildWalkthrough, clampPosition, lastPosition } from '../../src/components/walkthrough/walkthroughModel.js';

describe('guided walkthrough model', () => {
  it('builds a walkthrough for every module from its guide, with no backticks left in the text', () => {
    for (const guide of MODULE_GUIDES) {
      const walkthrough = buildWalkthrough(guide, false);
      assert.equal(walkthrough.steps.length, guide.steps.length, `${guide.id} keeps every step`);
      assert.ok(walkthrough.purpose && walkthrough.outcome && walkthrough.failure, `${guide.id} has purpose, outcome and failure path`);
      for (const text of [walkthrough.purpose, walkthrough.outcome, walkthrough.failure, ...walkthrough.steps]) assert.ok(!text.includes('`'), `${guide.id} text is plain`);
    }
  });

  it('chains modules in order and ends the chain at the last module', () => {
    assert.equal(buildWalkthrough(MODULE_GUIDES[0], false).nextModuleId, MODULE_GUIDES[1].id);
    assert.equal(buildWalkthrough(MODULE_GUIDES[MODULE_GUIDES.length - 1], false).nextModuleId, null);
  });

  it('hides steps of engagement-team workspaces from client personas but keeps the outcome', () => {
    const staffOnly = MODULE_GUIDES.find(guide => !['portal', 'client-detail', 'requirements', 'clients'].some(route => guide.route.includes(route)))!;
    const client = buildWalkthrough(staffOnly, true);
    assert.equal(client.stepsHidden, true);
    assert.deepEqual(client.steps, []);
    assert.ok(client.outcome.length > 0);
    assert.equal(buildWalkthrough(staffOnly, false).stepsHidden, false);
  });

  it('keeps the screen position within introduction..summary', () => {
    const walkthrough = buildWalkthrough(MODULE_GUIDES[0], false);
    assert.equal(lastPosition(walkthrough), walkthrough.steps.length + 1);
    assert.equal(clampPosition(walkthrough, -3), 0);
    assert.equal(clampPosition(walkthrough, 999), lastPosition(walkthrough));
    assert.equal(clampPosition(walkthrough, Number.NaN), 0);
  });
});
