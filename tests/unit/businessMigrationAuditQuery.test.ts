import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { it } from 'node:test';
import { unstable_splitSqlQuery } from 'wrangler';
import { buildMigrationAuditSnapshotQuery } from '../../tools/business-migration-audit-query.js';

it('snapshots receipt totals from linked payments against the current normalized schema', () => {
  const database = new DatabaseSync(':memory:');
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  try {
    database.exec('PRAGMA foreign_keys=OFF');
    const directory = resolve(process.cwd(), 'worker', 'migrations');
    const migrations = readdirSync(directory).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
    for (const migration of migrations) {
      const source = readFileSync(join(directory, migration), 'utf8');
      for (const statement of unstable_splitSqlQuery(source)) database.prepare(statement).run();
    }

    database.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode)
      VALUES(?,NULL,'Migration audit fixture',30,1,'active',1,1,'BUSINESS')`).run(workspaceId);
    database.prepare(`INSERT INTO payments(id,workspace_id,client_id,engagement_id,amount_minor,received_on,method,reference,
      evidence_file_id,verified_by_actor_id,created_at)
      VALUES('payment-1',?,'client-1','engagement-1',1275,'2026-01-02','BANK_TRANSFER','REF-1','file-1','actor-1','2026-01-02T00:00:00.000Z')`)
      .run(workspaceId);
    database.prepare(`INSERT INTO receipt_vouchers(id,workspace_id,client_id,engagement_id,payment_id,number,contact_route_id,
      recipient_snapshot_json,status,created_at)
      VALUES('receipt-1',?,'client-1','engagement-1','payment-1','RV-1','route-1','{}','PENDING','2026-01-02T00:00:00.000Z')`)
      .run(workspaceId);

    const raw = database.prepare(buildMigrationAuditSnapshotQuery(workspaceId)).get() as { snapshot_json: string };
    const snapshot = JSON.parse(raw.snapshot_json) as {
      targetRows: Array<{ kind: string; id: string }>;
      targetMoneyTotals: Array<{ kind: string; row_count: string; amount_minor: string }>;
    };
    assert.ok(snapshot.targetRows.some(row => row.kind === 'payments' && row.id === 'payment-1'));
    assert.deepEqual(snapshot.targetMoneyTotals.find(row => row.kind === 'receipt_vouchers'), {
      kind: 'receipt_vouchers', row_count: '1', amount_minor: '1275'
    });
    assert.deepEqual(snapshot.targetMoneyTotals.find(row => row.kind === 'payments'), {
      kind: 'payments', row_count: '1', amount_minor: '1275'
    });
  } finally {
    database.close();
  }
});

it('rejects workspace IDs outside the UUID grammar before building SQL', () => {
  assert.throws(() => buildMigrationAuditSnapshotQuery("' OR 1=1 --"), /valid UUID/);
});
