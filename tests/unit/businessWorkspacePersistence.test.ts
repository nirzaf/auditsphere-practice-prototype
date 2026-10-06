import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

it('BUSINESS records survive a Worker restart and scheduled maintenance after eight days', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auditsphere-business-restart-'));
  const databasePath = join(directory, 'workspace.sqlite');
  const r2 = {
    async delete() {},
    async head() { return null; },
    async get() { return null; },
    async put() { throw new Error('This persistence journey does not upload files.'); }
  } as any;
  const assets = { fetch: async () => new Response('not found', { status: 404 }) } as any;
  let db: SqliteD1 | null = new SqliteD1(databasePath);

  const invoke = async (method: string, path: string, options: {
    body?: unknown;
    actorId?: string;
    persona?: string;
    idempotencyKey?: string;
  } = {}) => {
    const headers = new Headers({ Origin: 'https://restart.auditsphere.test' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.actorId) headers.set('X-Actor-Id', options.actorId);
    if (options.persona) headers.set('X-Active-Persona', options.persona);
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    const request = new Request(`https://restart.auditsphere.test${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    const response = await worker.fetch(request, {
      DB: db!, FILES: r2, ASSETS: assets, BUSINESS_SETUP_ENABLED: 'true'
    } as any, {} as any);
    return { response, body: await response.json() as any };
  };

  try {
    assert.ok(db);
    db.migrate(repositoryRoot);
    const createdWorkspace = await invoke('POST', '/api/workspaces', {
      body: {
        name: 'Restart persistence test', currency: 'QAR', timezone: 'Asia/Qatar',
        initialPartner: {
          displayName: 'Restart Partner', naturalPersonKey: 'TEST-RESTART-PARTNER',
          email: 'restart.partner@example.invalid'
        }
      },
      idempotencyKey: crypto.randomUUID()
    });
    assert.equal(createdWorkspace.response.status, 201, JSON.stringify(createdWorkspace.body));

    const workspaceId = createdWorkspace.body.workspaceId as string;
    const actorId = createdWorkspace.body.actorProfileId as string;
    const client = {
      code: 'RESTART-CLIENT', legalName: 'Restart Client LLC', entityType: 'STANDALONE',
      industry: 'Professional services', address: 'Doha, Qatar', countryCode: 'QA',
      primaryContact: {
        fullName: 'Finance Contact', email: 'finance@example.invalid',
        title: 'Finance Director', role: 'CFO_FINANCE_DIRECTOR', effectiveFrom: '2026-10-01'
      }
    };
    const savedClient = await invoke('POST', `/api/workspaces/${workspaceId}/commands`, {
      actorId, persona: 'APPROVER', idempotencyKey: crypto.randomUUID(),
      body: {
        actor: { actorId, persona: 'APPROVER' }, context: {}, expectedVersions: [],
        command: { type: 'client.create', payload: client }
      }
    });
    assert.equal(savedClient.response.status, 200, JSON.stringify(savedClient.body));
    const clientId = savedClient.body.result.clientId as string;

    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    db.prepare(`UPDATE workspaces SET created_at=?,updated_at=?,created_at_utc=?,updated_at_utc=? WHERE id=?`)
      .bind(eightDaysAgo, eightDaysAgo, new Date(eightDaysAgo * 1000).toISOString(),
        new Date(eightDaysAgo * 1000).toISOString(), workspaceId).run();
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM test_workspace_expiry WHERE workspace_id=?')
      .bind(workspaceId).first<{ count: number }>()?.count, 0);

    db.close();
    db = new SqliteD1(databasePath);
    const beforeMaintenance = await invoke('GET', `/api/workspaces/${workspaceId}/clients`, {
      actorId, persona: 'APPROVER'
    });
    assert.equal(beforeMaintenance.response.status, 200, JSON.stringify(beforeMaintenance.body));
    assert.ok(beforeMaintenance.body.items.some((item: { id: string; legalName: string }) =>
      item.id === clientId && item.legalName === 'Restart Client LLC'));

    await worker.scheduled({ scheduledTime: Date.now(), cron: '* * * * *' } as any, {
      DB: db, FILES: r2, ASSETS: assets, BUSINESS_SETUP_ENABLED: 'true'
    } as any);

    const afterMaintenance = await invoke('GET', `/api/workspaces/${workspaceId}/clients`, {
      actorId, persona: 'APPROVER'
    });
    assert.equal(afterMaintenance.response.status, 200, JSON.stringify(afterMaintenance.body));
    assert.ok(afterMaintenance.body.items.some((item: { id: string }) => item.id === clientId));
    assert.equal(db.prepare('SELECT business_status FROM workspaces WHERE id=?')
      .bind(workspaceId).first<{ business_status: string }>()?.business_status, 'ACTIVE');
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
