import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { BusinessContextResponse, BusinessWorkspacePreference } from '../../src/shared/api/business';
import { isBusinessContextCurrent, type LoadedBusinessContext } from '../../src/services/businessWorkspace';

const response: BusinessContextResponse = {
  actor: { id: 'actor-reviewer', persona: 'REVIEWER', displayName: 'Reviewer', staffGrade: 'MANAGER' },
  scope: { clientId: 'client-a', engagementId: 'engagement-a' },
  allowedActions: ['fieldwork.review'],
  readOnlyReasons: []
};

const context: LoadedBusinessContext = { workspaceId: 'workspace-a', response };

const selected: BusinessWorkspacePreference = {
  version: 1,
  workspaceId: 'workspace-a',
  clientId: 'client-a',
  engagementId: 'engagement-a'
};

it('hides permissions until the loaded context matches the authenticated profile and selected scope', () => {
  assert.equal(isBusinessContextCurrent(context, selected, 'actor-reviewer'), true);
  assert.equal(isBusinessContextCurrent({ ...context, workspaceId: 'workspace-b' }, selected, 'actor-reviewer'), false);
  assert.equal(isBusinessContextCurrent(context, selected, 'actor-client'), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, clientId: 'client-b' }, 'actor-reviewer'), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, engagementId: 'engagement-b' }, 'actor-reviewer'), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, clientId: undefined, engagementId: undefined }, 'actor-reviewer'), false);
  assert.equal(isBusinessContextCurrent(context, null, 'actor-reviewer'), false);
  assert.equal(isBusinessContextCurrent(null, selected, 'actor-reviewer'), false);
});
