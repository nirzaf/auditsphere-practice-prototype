import assert from 'node:assert/strict';
import { it } from 'node:test';
import { resolveR2LockToken } from '../../tools/r2-lock-credentials.js';

it('prefers the dedicated R2 lock token when both Cloudflare tokens are present', () => {
  assert.equal(resolveR2LockToken({
    CLOUDFLARE_R2_LOCKS_TOKEN: 'r2-lock-token',
    CLOUDFLARE_API_TOKEN: 'worker-deploy-token'
  }), 'r2-lock-token');
});

it('keeps the Wrangler local deploy token as a fallback', () => {
  assert.equal(resolveR2LockToken({ CLOUDFLARE_API_TOKEN: 'local-deploy-token' }), 'local-deploy-token');
});

it('returns no token when neither Cloudflare credential is present', () => {
  assert.equal(resolveR2LockToken({}), undefined);
});
