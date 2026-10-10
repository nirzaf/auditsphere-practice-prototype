import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { verifyRestore } from '../../tools/verify-restore.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceId = '11111111-2222-4333-8444-555555555555';
const openDatabases: SqliteD1[] = [];
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

function fixture(options: { corruptAudit?: boolean; corruptFile?: boolean; omitFile?: boolean; persistTimestamp?: boolean } = {}) {
  const db = new SqliteD1();
  openDatabases.push(db);
  db.migrate(repositoryRoot);
  db.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode)
    VALUES (?,NULL,'Restore verification workspace',10,1,'active',1,1,'BUSINESS')`).bind(workspaceId).run();

  const details = JSON.stringify({ provenance: 'SYSTEM/BOOTSTRAP', dataMode: 'BUSINESS' });
  const createdAt = 1_800_000_000;
  const timestamp = new Date(createdAt * 1000).toISOString();
  const bootstrapHash = digest(JSON.stringify({
    id: 'event-bootstrap', workspaceId, sequence: 1, eventType: 'BOOTSTRAP', entityType: 'WORKSPACE',
    entityId: workspaceId, actorAssurance: 'SYSTEM', source: 'JOB', details, timestamp
  }));
  const commandDetails = JSON.stringify({ commandId: 'command-1', result: { ok: true } });
  const commandHash = digest(JSON.stringify({
    id: 'event-command', workspaceId, sequence: 2, previousHash: bootstrapHash,
    actorId: 'actor-1', actorPersona: 'APPROVER', commandType: 'test.command',
    entityType: 'TEST', entityId: 'row-1', details: commandDetails, timestamp
  }));
  db.prepare(`INSERT INTO audit_chain_heads(id,workspace_id,version,scope_kind,scope_id,last_sequence,last_event_hash,created_at,updated_at)
    VALUES('head',?,1,'WORKSPACE',?,2,?,'test','test')`).bind(workspaceId, workspaceId, commandHash).run();

  db.prepare(`INSERT INTO audit_events(id,workspace_id,sequence,command_type,entity_kind,entity_id,details_json,created_at,
      actor_assurance,source,chain_scope_kind,chain_scope_id,previous_hash,event_hash,actor_id,event_type,entity_type,actor_persona,chain_timestamp)
    VALUES('event-bootstrap',?,1,'workspace.bootstrap','workspace',?,?,?,'SYSTEM','JOB','WORKSPACE',?,NULL,?,NULL,'BOOTSTRAP','WORKSPACE',NULL,?)`)
    .bind(workspaceId, workspaceId, details, createdAt, workspaceId, options.corruptAudit ? '0'.repeat(64) : bootstrapHash,
      options.persistTimestamp ? timestamp : null).run();
  db.prepare(`INSERT INTO audit_events(id,workspace_id,sequence,command_type,entity_kind,entity_id,details_json,created_at,
      actor_assurance,source,chain_scope_kind,chain_scope_id,previous_hash,event_hash,actor_id,event_type,entity_type,actor_persona,chain_timestamp)
    VALUES('event-command',?,2,'test.command','test','row-1',?,?,'SELF_ASSERTED','USER','WORKSPACE',?,?,?,'actor-1','test.command','TEST','APPROVER',?)`)
    .bind(workspaceId, commandDetails, createdAt, workspaceId, bootstrapHash, commandHash, options.persistTimestamp ? timestamp : null).run();

  const bytes = new TextEncoder().encode('restored R2 sample bytes');
  const sha256 = digest(options.corruptFile ? new TextEncoder().encode('different bytes') : bytes);
  db.prepare(`INSERT INTO file_versions(id,workspace_id,version,original_name,media_type,size_bytes,sha256,object_key,purpose,state,
      committed_at,created_at,updated_at)
    VALUES('file-1',?,1,'sample.txt','text/plain',?,?,'workspace/sample.txt','EVIDENCE','COMMITTED','test','test','test')`)
    .bind(workspaceId, bytes.length, sha256).run();
  const objects = new Map<string, Uint8Array>();
  if (!options.omitFile) objects.set('workspace/sample.txt', bytes);
  const files = {
    get: async (key: string) => {
      const object = objects.get(key);
      return object ? { arrayBuffer: async () => object.buffer.slice(object.byteOffset, object.byteOffset + object.byteLength) as ArrayBuffer } : null;
    }
  };
  return { db, files };
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
});

it('recomputes the bootstrap and command chain and verifies sampled R2 bytes', async () => {
  const { db, files } = fixture();
  const result = await verifyRestore(workspaceId, 'staging', db, files, 10);
  assert.equal(result.auditEventsVerified, 2);
  assert.equal(result.latestAuditSequence, 2);
  assert.equal(result.committedFileVersions, 1);
  assert.equal(result.fileVersionsSampled, 1);
  assert.equal(result.workspaceTableCounts.workspaces, 1);
  assert.equal(result.workspaceTableCounts.file_versions, 1);
  assert.match(result.latestAuditHash, /^[a-f0-9]{64}$/);
});

it('uses a future audit event exact chain timestamp when present', async () => {
  const { db, files } = fixture({ persistTimestamp: true });
  const result = await verifyRestore(workspaceId, 'staging', db, files);
  assert.equal(result.auditEventsVerified, 2);
});

it('fails when an audit event hash differs from the recorded chain', async () => {
  const { db, files } = fixture({ corruptAudit: true });
  await assert.rejects(verifyRestore(workspaceId, 'staging', db, files), /previous-hash mismatch|event hash mismatch/);
});

it('fails when a committed R2 object is missing or has different bytes', async () => {
  const missing = fixture({ omitFile: true });
  await assert.rejects(verifyRestore(workspaceId, 'staging', missing.db, missing.files), /R2 object is missing/);
  const mismatched = fixture({ corruptFile: true });
  await assert.rejects(verifyRestore(workspaceId, 'staging', mismatched.db, mismatched.files), /SHA-256 mismatch/);
});

it('rejects invalid sample sizes', async () => {
  const { db, files } = fixture();
  await assert.rejects(verifyRestore(workspaceId, 'staging', db, files, 0), /Sample size/);
});
