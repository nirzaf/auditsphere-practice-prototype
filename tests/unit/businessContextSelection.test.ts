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
  actorId: 'actor-reviewer',
  persona: 'REVIEWER',
  clientId: 'client-a',
  engagementId: 'engagement-a'
};

it('hides permissions until the loaded context matches the exact selected identity and scope', () => {
  assert.equal(isBusinessContextCurrent(context, selected), true);
  assert.equal(isBusinessContextCurrent({ ...context, workspaceId: 'workspace-b' }, selected), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, actorId: 'actor-client' }), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, persona: 'CLIENT' }), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, clientId: 'client-b' }), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, engagementId: 'engagement-b' }), false);
  assert.equal(isBusinessContextCurrent(context, { ...selected, clientId: undefined, engagementId: undefined }), false);
  assert.equal(isBusinessContextCurrent(context, null), false);
  assert.equal(isBusinessContextCurrent(null, selected), false);
});
