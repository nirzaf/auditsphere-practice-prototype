import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { CLIENT_IMPORT_COLUMNS, parseClientImportCsv } from '../../worker/clientImportCsv.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const objects = new Map<string, Uint8Array>();
const files = {
  async put(key: string, body: BodyInit) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    objects.set(key, bytes);
    return { key, size: bytes.length, etag: 'client-import-test-etag', httpEtag: 'client-import-test-etag', uploaded: new Date() };
  },
  async get(key: string) {
    const bytes = objects.get(key);
    if (!bytes) return null;
    const copy = bytes.slice();
    return {
      key, size: copy.length, etag: 'client-import-test-etag', httpEtag: 'client-import-test-etag', uploaded: new Date(),
      body: new Response(copy).body, arrayBuffer: async () => copy.slice().buffer,
      text: async () => new TextDecoder().decode(copy), json: async () => JSON.parse(new TextDecoder().decode(copy)),
      httpMetadata: {}, customMetadata: {}
    };
  },
  async head(key: string) {
    const bytes = objects.get(key);
    return bytes ? { key, size: bytes.length, etag: 'client-import-test-etag', httpEtag: 'client-import-test-etag', uploaded: new Date(), httpMetadata: {}, customMetadata: {} } : null;
  }
};
const env = {
  DB: db, FILES: files as any, ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  BUSINESS_SETUP_ENABLED: 'true'
} as any;

after(() => db.close());

it('parses quoted CSV and reports physical source row numbers', () => {
  const header = CLIENT_IMPORT_COLUMNS.join(',');
  const csv = `\uFEFF${header}\r\n\r\nR-1,C-1,"Acme, Example",,STANDALONE,,,,,Technology,"Doha, Qatar",QA,"Sam ""Sami"" Example",sam@example.test,,Director,MD_GM,true,2026-01-01,PROPOSAL|EL\r\n`;
  const rows = parseClientImportCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sourceRow, 4);
  assert.equal(rows[0]?.legal_name, 'Acme, Example');
  assert.equal(rows[0]?.contact_name, 'Sam "Sami" Example');
  assert.equal(rows[0]?.address, 'Doha, Qatar');
  assert.throws(() => parseClientImportCsv(`${header},client_code\n`), /duplicate/i);
  assert.throws(() => parseClientImportCsv(`${header},unknown\n`), /unknown/i);
  assert.throws(() => parseClientImportCsv(`${header}\n"unterminated`), /inside a quoted field/i);
});

it('validates without business writes, applies parent-first in resumable batches, and audits every created entity', async () => {
  const origin = 'https://local.auditsphere.test';
  async function call(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const headers = new Headers({ Origin: origin, ...options.headers });
    if (options.body !== undefined && !(options.body instanceof Uint8Array)) headers.set('Content-Type', 'application/json');
    const request = new Request(`${origin}${path}`, {
      method: options.method ?? 'GET', headers,
      ...(options.body === undefined ? {} : { body: options.body instanceof Uint8Array ? options.body : JSON.stringify(options.body) })
    });
    const response = await worker.fetch(request, env, {} as any);
    return { response, body: await response.json() as any };
  }
  async function command(workspaceId: string, actorId: string, type: string, payload: unknown, idempotencyKey = crypto.randomUUID()) {
    return call(`/api/workspaces/${workspaceId}/commands`, {
      method: 'POST',
      headers: { 'X-Actor-Id': actorId, 'X-Active-Persona': 'APPROVER', 'Idempotency-Key': idempotencyKey },
      body: { actor: { actorId, persona: 'APPROVER' }, context: {}, expectedVersions: [], command: { type, payload } }
    });
  }
  async function commitCsv(workspaceId: string, actorId: string, name: string, csv: string) {
    const bytes = new TextEncoder().encode(csv);
    const headers = { 'X-Actor-Id': actorId, 'X-Active-Persona': 'APPROVER' };
    const reservation = await call(`/api/workspaces/${workspaceId}/files`, {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: { purpose: 'TEMPLATE', originalName: name, mediaType: 'text/csv', sizeBytes: bytes.length }
    });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.body));
    const fileId = reservation.body.fileId as string;
    const staged = await call(`/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      method: 'PUT', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'text/csv' }, body: bytes
    });
    assert.equal(staged.response.status, 200, JSON.stringify(staged.body));
    const committed = await call(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: { expectedVersion: 2, sizeBytes: bytes.length, sha256: staged.body.sha256 }
    });
    assert.equal(committed.response.status, 200, JSON.stringify(committed.body));
    return { fileId, sha256: staged.body.sha256 as string };
  }

  const bootstrap = await call('/api/workspaces', {
    method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: {
      name: 'Client import acceptance', currency: 'QAR', timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'Import Test Partner', naturalPersonKey: `IMPORT-${crypto.randomUUID()}`, email: 'import.partner@example.test' }
    }
  });
  assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.body));
  const workspaceId = bootstrap.body.workspaceId as string;
  const actorId = bootstrap.body.actorProfileId as string;

  const invalidRows = [
    ['BAD-1', 'DUP-CODE', '', '', 'SUBSIDIARY', 'MISSING', '', '', '', 'Technology', 'Doha', 'QA', 'Bad Name', 'not-an-email', '', 'Director', 'OTHER', 'false', '2026-01-01', 'PROPOSAL|UNKNOWN'],
    ['BAD-2', 'DUP-CODE', 'Cycle A', '', 'SUBSIDIARY', 'BAD-3', 'Subsidiary', '', '', 'Technology', 'Doha', 'QA', 'A', 'a@example.test', '', 'Director', 'OTHER', 'false', '2026-01-01', ''],
    ['BAD-3', 'DUP-CODE', 'Cycle B', '', 'SUBSIDIARY', 'BAD-2', 'Subsidiary', '', '', 'Technology', 'Doha', 'QA', 'B', 'b@example.test', '', 'Director', 'OTHER', 'false', '2026-01-01', '']
  ];
  const invalidCsv = [CLIENT_IMPORT_COLUMNS.join(','), ...invalidRows.map(row => row.join(','))].join('\n');
  const invalidFile = await commitCsv(workspaceId, actorId, 'invalid-client-import.csv', invalidCsv);
  const beforeValidationClients = Number(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0);
  const invalidValidation = await command(workspaceId, actorId, 'clientImport.validate', { fileVersionId: invalidFile.fileId });
  assert.equal(invalidValidation.response.status, 200, JSON.stringify(invalidValidation.body));
  assert.equal(invalidValidation.body.result.status, 'REJECTED');
  assert.equal(invalidValidation.body.result.errorCount, 3);
  assert.ok(invalidValidation.body.result.report.errors.some((row: any) => row.issues.some((issue: any) => issue.field === 'contact_email')));
  assert.ok(invalidValidation.body.result.report.errors.some((row: any) => row.issues.some((issue: any) => issue.field === 'parent_external_ref' && /cycle/i.test(issue.message))));
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0), beforeValidationClients,
    'validation must not create client data');
  const rejectedApply = await command(workspaceId, actorId, 'clientImport.apply', { runId: invalidValidation.body.result.runId });
  assert.equal(rejectedApply.response.status, 409);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0), beforeValidationClients);

  const validRows: string[][] = [
    ['CHILD-1', 'IMPORT-CHILD', 'Example Subsidiary', '', 'SUBSIDIARY', 'PARENT-1', 'Wholly owned subsidiary', '', '', 'Technology', 'Doha', 'QA', 'Child Contact', 'child@example.test', '', 'Finance Director', 'OTHER', 'false', '2026-01-01', 'INVOICE|RECEIPT'],
    ['GRAND-1', 'IMPORT-GRAND', 'Example Grandchild', '', 'SUBSIDIARY', 'CHILD-1', 'Operating subsidiary', '', '', 'Technology', 'Doha', 'QA', 'Grandchild Contact', 'grand@example.test', '', 'Accountant', 'OTHER', 'false', '2026-01-01', '']
  ];
  for (let index = 0; index < 39; index += 1) {
    const code = `IMPORT-${String(index + 1).padStart(3, '0')}`;
    validRows.push([`REF-${index + 1}`, code, `Example Entity ${index + 1}`, '', 'STANDALONE', '', '', '', '', 'Technology', 'Doha', 'QA', `Contact ${index + 1}`, `contact${index + 1}@example.test`, '', 'Director', 'OTHER', 'false', '2026-01-01', '']);
  }
  validRows.push(['PARENT-1', 'IMPORT-PARENT', 'Example Holding', '', 'HOLDING', '', '', '', '', 'Technology', 'Doha', 'QA', 'Parent Contact', 'parent@example.test', '', 'Managing Director', 'OTHER', 'false', '2026-01-01', '']);
  const validCsv = [CLIENT_IMPORT_COLUMNS.join(','), ...validRows.map(row => row.join(','))].join('\r\n');
  const validFile = await commitCsv(workspaceId, actorId, 'valid-client-import.csv', validCsv);
  const validValidation = await command(workspaceId, actorId, 'clientImport.validate', { fileVersionId: validFile.fileId });
  assert.equal(validValidation.response.status, 200, JSON.stringify(validValidation.body));
  assert.equal(validValidation.body.result.status, 'VALIDATED');
  assert.equal(validValidation.body.result.rowCount, 42);
  assert.equal(validValidation.body.result.errorCount, 0);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0), beforeValidationClients,
    'an error-free validation still creates no business records');

  const duplicateValidation = await command(workspaceId, actorId, 'clientImport.validate', { fileVersionId: validFile.fileId });
  assert.equal(duplicateValidation.response.status, 409);
  assert.match(duplicateValidation.body.message, /same file|SHA-256/i);

  const auditBeforeApply = Number(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0);
  const firstApply = await command(workspaceId, actorId, 'clientImport.apply', { runId: validValidation.body.result.runId });
  assert.equal(firstApply.response.status, 200, JSON.stringify(firstApply.body));
  assert.equal(firstApply.body.result.status, 'VALIDATED');
  assert.equal(firstApply.body.result.appliedCount, 40);
  const firstParent = db.prepare('SELECT id FROM clients WHERE workspace_id=? AND code=?').bind(workspaceId, 'IMPORT-PARENT').first<any>()?.id;
  assert.ok(firstParent, 'the top-level holding is in the first committed batch');

  const secondApply = await command(workspaceId, actorId, 'clientImport.apply', { runId: validValidation.body.result.runId });
  assert.equal(secondApply.response.status, 200, JSON.stringify(secondApply.body));
  assert.equal(secondApply.body.result.status, 'APPLIED');
  assert.equal(secondApply.body.result.appliedCount, 42);
  const imported = db.prepare('SELECT id,entity_type,parent_client_id FROM clients WHERE workspace_id=? AND code IN (?,?,?) ORDER BY code')
    .bind(workspaceId, 'IMPORT-PARENT', 'IMPORT-CHILD', 'IMPORT-GRAND').all<any>().results;
  const idsByTypeAndCode = new Map(db.prepare('SELECT id,code,parent_client_id FROM clients WHERE workspace_id=? AND code IN (?,?,?)')
    .bind(workspaceId, 'IMPORT-PARENT', 'IMPORT-CHILD', 'IMPORT-GRAND').all<any>().results.map(row => [row.code, row]));
  const parent = idsByTypeAndCode.get('IMPORT-PARENT');
  const child = idsByTypeAndCode.get('IMPORT-CHILD');
  const grandchild = idsByTypeAndCode.get('IMPORT-GRAND');
  assert.ok(parent && child && grandchild);
  assert.equal(child.parent_client_id, parent.id);
  assert.equal(grandchild.parent_client_id, child.id);
  assert.equal(imported.length, 3);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM client_import_row_map WHERE workspace_id=? AND run_id=?')
    .bind(workspaceId, validValidation.body.result.runId).first<any>()?.count), 42);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=? AND client_id IN (SELECT id FROM clients WHERE workspace_id=? AND code LIKE ?)')
    .bind(workspaceId, workspaceId, 'IMPORT-%').first<any>()?.count), 42);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM contact_routes WHERE workspace_id=? AND client_id IN (SELECT id FROM clients WHERE workspace_id=? AND code LIKE ?)')
    .bind(workspaceId, workspaceId, 'IMPORT-%').first<any>()?.count), 2);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM client_affiliations WHERE workspace_id=? AND client_id IN (?,?)')
    .bind(workspaceId, child.id, grandchild.id).first<any>()?.count), 2);
  const auditAfterApply = Number(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<any>()?.count ?? 0);
  assert.equal(auditAfterApply - auditBeforeApply, 88, 'client import writes one chained event for each created client, contact, route and affiliation');
  const auditHead = db.prepare(`SELECT last_sequence FROM audit_chain_heads WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`)
    .bind(workspaceId, workspaceId).first<any>();
  const latestEvent = db.prepare('SELECT sequence,previous_hash,event_hash FROM audit_events WHERE workspace_id=? ORDER BY sequence DESC LIMIT 1')
    .bind(workspaceId).first<any>();
  assert.equal(latestEvent.sequence, auditHead.last_sequence);
  assert.equal(latestEvent.event_hash?.length, 64);
  assert.ok(latestEvent.previous_hash);
});
