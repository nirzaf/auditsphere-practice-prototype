import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, it } from 'node:test';
import { unzipSync, zipSync } from 'fflate';
import { createBusinessRecoveryBundle, restoreBusinessRecoveryBundle } from '../helpers/businessBackupRestore.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

let server: BusinessE2eServer | undefined;

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

before(async () => { server = await startBusinessE2eServer(); });
after(async () => { await server?.close(); });

it('US-REP-007 restores isolated business records, financial totals, manifest and every committed original byte', async () => {
  assert.ok(server);
  const fixtureId = randomUUID();
  const now = new Date().toISOString();
  const workspaceResponse = await fetch(`${server.origin}/api/workspaces`, {
    method: 'POST',
    headers: { Origin: server.origin, 'Content-Type': 'application/json', 'Idempotency-Key': `restore-${fixtureId}` },
    body: JSON.stringify({
      name: `Recovery acceptance ${fixtureId.slice(0, 8)}`,
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'QA Recovery Partner', naturalPersonKey: `QA-RESTORE-${fixtureId}`, email: 'qa.restore@example.invalid' }
    })
  });
  assert.equal(workspaceResponse.status, 201, 'the real local Worker creates the isolated BUSINESS workspace');
  const workspace = await workspaceResponse.json() as { workspaceId: string; actorProfileId: string };
  const { workspaceId, actorProfileId } = workspace;
  const clientId = randomUUID();
  const standardsProfileId = randomUUID();
  const engagementId = randomUUID();
  const fileVersionId = randomUUID();
  const tbImportId = randomUUID();
  const tbVersionId = randomUUID();
  const objectKey = `e2e/recovery/${fixtureId}/accepted-tb.csv`;
  const originalBytes = new TextEncoder().encode('account_code,account_name,debit,credit\n1000,Cash,125000,0\n3000,Equity,0,125000\n');
  const originalHash = sha256(originalBytes);
  const insert = (sql: string, ...values: unknown[]) => server!.db.prepare(sql).bind(...values).run();

  insert(`INSERT INTO clients(id,workspace_id,version,code,legal_name,entity_type,industry,address,country_code,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'Synthetic Recovery Client WLL','STANDALONE','Professional services','Doha, Qatar','QA',1,?,?,?,?)`,
  clientId, workspaceId, `QA-RESTORE-${fixtureId.slice(0, 8)}`, now, now, actorProfileId, actorProfileId);
  insert(`INSERT INTO standards_profiles(id,workspace_id,version,name,effective_period_start,effective_period_end,isa_220_edition,isa_570_edition,
      reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,approved_at,content_sha256,created_at,updated_at)
    VALUES(?,?,1,'Synthetic recovery profile','2020-01-01',NULL,'ISA 220 QA','ISA 570 QA','IFRS for SMEs','IAS1',0,?,?,?,?,?)`,
  standardsProfileId, workspaceId, actorProfileId, now, sha256('qa-recovery-standards'), now, now);
  insert(`INSERT INTO engagements(id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,lifecycle_state,contract_fee_minor,
      standards_profile_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,'2025-01-01','2025-12-31','STATUTORY_AUDIT','PARTNER_APPROVAL',125000,?,?,?,?,?)`,
  engagementId, workspaceId, clientId, `QA-RECOVERY-${fixtureId.slice(0, 8)}`, standardsProfileId, now, now, actorProfileId, actorProfileId);
  server.putTestObject(objectKey, originalBytes);
  insert(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,?,'text/csv',?,?,?,'TB','COMMITTED',?,1,?,?,?,?)`,
  fileVersionId, workspaceId, clientId, engagementId, 'synthetic-trial-balance.csv', originalBytes.byteLength, originalHash, objectKey, now, now, now, actorProfileId, actorProfileId);
  insert(`INSERT INTO tb_imports(id,workspace_id,version,client_id,engagement_id,file_version_id,status,worksheet,column_map_json,row_count,source_sha256,
      current_debits_minor,current_credits_minor,prior_debits_minor,prior_credits_minor,error_count,errors_json,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?, ?,?,'ACTIVATED','Sheet1','{}',2,?,125000,125000,100000,100000,0,'[]',?,?,?)`,
  tbImportId, workspaceId, clientId, engagementId, fileVersionId, originalHash, actorProfileId, now, now);
  insert(`INSERT INTO tb_versions(id,workspace_id,client_id,engagement_id,revision,import_id,period_start,period_end,currency,current_debits_minor,current_credits_minor,
      prior_debits_minor,prior_credits_minor,prior_present,row_count,content_sha256,accepted_by_actor_id,accepted_at)
    VALUES(?,?,?,?,1,?,'2025-01-01','2025-12-31','QAR',125000,125000,100000,100000,1,2,?,?,?)`,
  tbVersionId, workspaceId, clientId, engagementId, tbImportId, originalHash, actorProfileId, now);
  insert(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json)
    VALUES(?,?,?,?,?,1,'1000','Synthetic cash',125000,100000,'{}')`,
  randomUUID(), workspaceId, clientId, engagementId, tbVersionId);
  insert(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json)
    VALUES(?,?,?,?,?,2,'3000','Synthetic equity',-125000,-100000,'{}')`,
  randomUUID(), workspaceId, clientId, engagementId, tbVersionId);

  const bundle = createBusinessRecoveryBundle(server.db, key => server!.getTestObject(key), now);
  assert.ok(bundle.byteLength > originalBytes.byteLength);
  const restoredDb = new SqliteD1();
  try {
    const recovered = restoreBusinessRecoveryBundle(bundle, restoredDb);
    assert.equal(recovered.manifest.recordCounts.workspaces, 1);
    assert.equal(recovered.manifest.recordCounts.clients, 1);
    assert.equal(recovered.manifest.recordCounts.engagements, 1);
    assert.equal(recovered.manifest.recordCounts.file_versions, 1);
    assert.equal(recovered.manifest.recordCounts.tb_lines, 2);
    assert.deepEqual(recovered.manifest.financialTotals, {
      currency: 'QAR',
      engagementContractFeeMinor: 125000,
      trialBalanceCurrentDebitsMinor: 125000,
      trialBalanceCurrentCreditsMinor: 125000,
      trialBalancePriorDebitsMinor: 100000,
      trialBalancePriorCreditsMinor: 100000
    });
    assert.deepEqual(recovered.objects.get(objectKey), originalBytes, 'recovery preserves the exact committed source bytes');
    assert.equal(sha256(recovered.objects.get(objectKey)!), originalHash);
    assert.deepEqual(restoredDb.prepare('PRAGMA foreign_key_check').all().results, [], 'the restored database has no FK violations');
    assert.equal(restoredDb.prepare('SELECT id FROM engagements WHERE id=?').bind(engagementId).first<{ id: string }>()?.id, engagementId);

    const missingFileEntries = unzipSync(bundle);
    const manifest = JSON.parse(new TextDecoder().decode(missingFileEntries['manifest.json'])) as { files: Array<{ archivePath: string }> };
    assert.ok(manifest.files[0], 'the fixture contains one committed original file');
    delete missingFileEntries[manifest.files[0].archivePath];
    const missingFileBundle = zipSync(missingFileEntries, { level: 0 });
    const missingFileDb = new SqliteD1();
    try {
      assert.throws(() => restoreBusinessRecoveryBundle(missingFileBundle, missingFileDb), /is missing; restore cannot be marked successful/,
        'an unresolved original file fails restore instead of producing a partial pass');
    } finally {
      missingFileDb.close();
    }

    const corruptDatabaseEntries = unzipSync(bundle);
    corruptDatabaseEntries['database.sqlite'][0] ^= 0xff;
    const corruptDatabaseBundle = zipSync(corruptDatabaseEntries, { level: 0 });
    const corruptDatabaseDb = new SqliteD1();
    try {
      assert.throws(() => restoreBusinessRecoveryBundle(corruptDatabaseBundle, corruptDatabaseDb), /does not match its manifest digest/,
        'a modified database image fails its independent digest check');
    } finally {
      corruptDatabaseDb.close();
    }
  } finally {
    restoredDb.close();
  }
});
