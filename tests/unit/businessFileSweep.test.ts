import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index';
import { SqliteD1 } from '../helpers/sqliteD1';
import { authSessionCookie } from '../helpers/authSession';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

it('expires an abandoned staged upload after 24 hours and preserves committed files', async () => {
  const db = new SqliteD1();
  const objects = new Map<string, Uint8Array>();
  const r2 = {
    async put(key: string, body: BodyInit) {
      objects.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
      return { key, size: objects.get(key)!.length };
    },
    async get(key: string) {
      const bytes = objects.get(key);
      return bytes ? { arrayBuffer: async () => bytes.slice().buffer } : null;
    },
    async list({ prefix, limit }: { prefix: string; limit: number }) {
      return { objects: [...objects.keys()].filter(key => key.startsWith(prefix)).slice(0, limit).map(key => ({ key })) };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    }
  } as any;
  const env = { DB: db, FILES: r2, ASSETS: { fetch: async () => new Response('not found', { status: 404 }) }, BUSINESS_SETUP_ENABLED: 'true' } as any;
  const origin = 'https://file-sweep.auditsphere.test';
  const request = async (method: string, path: string, options: { body?: unknown; raw?: Uint8Array; headers?: Record<string, string> } = {}) => {
    const headers = new Headers({ Origin: origin, ...options.headers });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await worker.fetch(new Request(`${origin}${path}`, {
      method, headers,
      ...(options.raw ? { body: options.raw } : options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    }), env, {} as any);
    return { response, body: await response.json() as any };
  };

  try {
    db.migrate(repositoryRoot);
    const created = await request('POST', '/api/workspaces', { headers: { 'Idempotency-Key': crypto.randomUUID() }, body: {
      name: 'File sweep acceptance', currency: 'QAR', timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'Sweep Partner', naturalPersonKey: 'FILE-SWEEP-PARTNER', email: 'sweep@example.invalid' }
    } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const workspaceId = created.body.workspaceId as string;
    const actorId = created.body.actorProfileId as string;
    const actorHeaders = {
      Cookie: await authSessionCookie(db as any, workspaceId, actorId),
      'X-Actor-Id': actorId,
      'X-Active-Persona': 'APPROVER'
    };
    const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const reserve = async (originalName: string) => {
      const result = await request('POST', `/api/workspaces/${workspaceId}/files`, {
        headers: { ...actorHeaders, 'Idempotency-Key': crypto.randomUUID() },
        body: { purpose: 'TEMPLATE', originalName, mediaType: 'application/pdf', sizeBytes: bytes.length }
      });
      assert.equal(result.response.status, 201, JSON.stringify(result.body));
      return result.body.fileId as string;
    };
    const stage = async (fileId: string) => request('PUT', `/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      headers: { ...actorHeaders, 'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'application/pdf' },
      raw: bytes
    });

    const abandonedId = await reserve('abandoned.pdf');
    const staged = await stage(abandonedId);
    assert.equal(staged.response.status, 200, JSON.stringify(staged.body));
    assert.equal(staged.body.state, 'STAGED');
    const abandonedKey = String(db.prepare('SELECT object_key FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, abandonedId).first<any>()?.object_key);
    assert.ok(objects.has(abandonedKey));

    const committedId = await reserve('committed.pdf');
    const committedStage = await stage(committedId);
    assert.equal(committedStage.response.status, 200, JSON.stringify(committedStage.body));
    const digest = createHash('sha256').update(bytes).digest('hex');
    const committed = await request('POST', `/api/workspaces/${workspaceId}/files/${committedId}/complete`, {
      headers: { ...actorHeaders, 'Idempotency-Key': crypto.randomUUID() },
      body: { expectedVersion: 2, sizeBytes: bytes.length, sha256: digest }
    });
    assert.equal(committed.response.status, 200, JSON.stringify(committed.body));
    assert.equal(committed.body.state, 'COMMITTED');
    const committedKey = String(db.prepare('SELECT object_key FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, committedId).first<any>()?.object_key);
    assert.ok(objects.has(committedKey));

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE file_versions SET updated_at=? WHERE workspace_id=? AND id=? AND state='STAGED'`)
      .bind(fortyEightHoursAgo, workspaceId, abandonedId).run();
    const sealedId = 'sealed-file-sweep-fixture';
    const sealedEngagementId = 'sealed-engagement-sweep-fixture';
    const sealedKey = `workspaces/${workspaceId}/files/${sealedId}/sealed-digest`;
    db.prepare('PRAGMA foreign_keys=OFF').run();
    db.prepare(`INSERT INTO file_versions(id,workspace_id,engagement_id,original_name,media_type,size_bytes,object_key,purpose,state,created_at,updated_at)
      VALUES(?,?,?,'sealed.pdf','application/pdf',? ,?,'EVIDENCE','STAGED',?,?)`)
      .bind(sealedId, workspaceId, sealedEngagementId, bytes.length, sealedKey, fortyEightHoursAgo, fortyEightHoursAgo).run();
    db.prepare(`INSERT INTO archive_seals(id,workspace_id,client_id,engagement_id,bundle_id,sealed_at,reason,manifest_file_id,archive_file_id,
      audit_chain_head,manifest_sha256,archive_sha256,record_count,file_count,retention_policy_id)
      VALUES(?,?,'sealed-client-fixture',?,? ,?,'DEADLINE',?,?,?, ?, ?,0,1,'sealed-retention-fixture')`)
      .bind('sealed-archive-fixture', workspaceId, sealedEngagementId, 'sealed-bundle-fixture', fortyEightHoursAgo,
        sealedId, sealedId, 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)).run();
    db.prepare('PRAGMA foreign_keys=ON').run();
    objects.set(sealedKey, bytes.slice());
    const sweepLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { sweepLogs.push(args.map(String).join(' ')); };
    try {
      await worker.scheduled({ scheduledTime: Date.now(), cron: '* * * * *' } as any, env);
    } finally {
      console.log = originalLog;
    }

    const abandoned = db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, abandonedId).first<any>();
    const stillCommitted = db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, committedId).first<any>();
    const stillSealed = db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, sealedId).first<any>();
    assert.equal(abandoned?.state, 'REJECTED');
    assert.equal(objects.has(abandonedKey), false);
    assert.equal(stillCommitted?.state, 'COMMITTED');
    assert.equal(objects.has(committedKey), true);
    assert.equal(stillSealed?.state, 'STAGED');
    assert.equal(objects.has(sealedKey), true);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM rejected_upload_attempts WHERE workspace_id=?')
      .bind(workspaceId).first<any>()?.count), 0);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND kind='VERIFY_FILE'")
      .bind(workspaceId).first<any>()?.count), 0);

    const fileSweep = sweepLogs.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).find(entry => entry?.event === 'workspace.file_sweep');
    assert.deepEqual(Object.keys(fileSweep ?? {}).sort(), ['errors', 'event', 'examined', 'objectsDeleted', 'rejected']);
    assert.equal(fileSweep.examined, 1);
    assert.equal(fileSweep.rejected, 1);
    assert.equal(fileSweep.objectsDeleted, 1);
    assert.equal(fileSweep.errors, 0);
  } finally {
    db.close();
  }
});
