import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const token = 'local-first-partner-bootstrap-secret-0123456789';
const env = {
  DB: db,
  FILES: {},
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  BOOTSTRAP_TOKEN: token,
  PUBLIC_APP_URL: 'https://staging.auditsphere.test'
} as any;
after(() => db.close());

const input = {
  name: 'Bootstrap Acceptance Firm', currency: 'QAR', timezone: 'Asia/Qatar',
  initialPartner: { displayName: 'Acceptance Partner', naturalPersonKey: 'BOOTSTRAP-PARTNER-001', email: 'partner@auditsphere.test' }
};

function bootstrap(key: string, auth = token, body: unknown = input): Promise<Response> {
  return worker.fetch(new Request('https://staging.auditsphere.test/api/internal/bootstrap', {
    method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body)
  }), env, {} as any);
}

it('requires a secret and atomically bootstraps one Partner despite concurrent requests', async () => {
  const denied = await bootstrap('bootstrap-denied-01', 'not-the-bootstrap-token');
  assert.equal(denied.status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE data_mode='BUSINESS'").first<any>()?.count, 0);

  const [first, race] = await Promise.all([bootstrap('bootstrap-first-key-01'), bootstrap('bootstrap-race-key-02')]);
  const responsePairs = await Promise.all([first, race].map(async response => ({ response, body: await response.json() as any })));
  const created = responsePairs.find(item => item.response.status === 201);
  const blocked = responsePairs.find(item => item.response.status === 409);
  assert.ok(created, JSON.stringify(responsePairs.map(item => item.body)));
  assert.equal(blocked?.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workspaces WHERE data_mode='BUSINESS'").first<any>()?.count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM business_bootstrap_lock WHERE singleton=1').first<any>()?.count, 1);

  const result = created!.body as { workspaceId: string; staffMemberId: string; actorProfileId: string; userAccountId: string };
  assert.ok(result.workspaceId && result.staffMemberId && result.actorProfileId && result.userAccountId);
  const account = db.prepare(`SELECT kind,status,is_firm_admin,email_normalized FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(result.workspaceId, result.userAccountId).first<any>();
  assert.deepEqual({ ...account }, { kind: 'STAFF', status: 'INVITED', is_firm_admin: 1, email_normalized: input.initialPartner.email });
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_profile_grants WHERE workspace_id=? AND user_account_id=? AND actor_profile_id=? AND revoked_at IS NULL`)
    .bind(result.workspaceId, result.userAccountId, result.actorProfileId).first<any>()?.count, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM credential_tokens WHERE workspace_id=? AND user_account_id=? AND purpose='STAFF_INVITE'
      AND consumed_at IS NULL AND expires_at>? AND length(token_sha256)=64`)
    .bind(result.workspaceId, result.userAccountId, new Date().toISOString()).first<any>()?.count, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND kind='EMAIL' AND aggregate_id=?
      AND status='PENDING' AND json_extract(payload_json,'$.documentType')='STAFF_INVITE'`)
    .bind(result.workspaceId, result.userAccountId).first<any>()?.count, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND event_type='BOOTSTRAP'`)
    .bind(result.workspaceId).first<any>()?.count, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_events WHERE workspace_id=? AND user_account_id=? AND event='INVITE_ISSUED'`)
    .bind(result.workspaceId, result.userAccountId).first<any>()?.count, 1);

  const winnerKey = created!.response === first ? 'bootstrap-first-key-01' : 'bootstrap-race-key-02';
  const replay = await bootstrap(winnerKey);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as any).replayed, true);
  const mismatchedReplay = await bootstrap(winnerKey, token, { ...input, name: 'Different Firm' });
  assert.equal(mismatchedReplay.status, 409);
  assert.equal((await mismatchedReplay.json() as any).code, 'IDEMPOTENCY_MISMATCH');
  const newAttempt = await bootstrap(winnerKey === 'bootstrap-first-key-01' ? 'bootstrap-fresh-key-03' : 'bootstrap-first-key-01');
  assert.equal(newAttempt.status, 409);
  assert.equal((await newAttempt.json() as any).code, 'GATE_BLOCKED');
});
