import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  for (const name of readdirSync(join(repositoryRoot, 'worker', 'migrations')).filter(name => name.endsWith('.sql')).sort()) {
    database.exec(readFileSync(join(repositoryRoot, 'worker', 'migrations', name), 'utf8'));
  }
  database.exec('PRAGMA foreign_keys=OFF');
  return database;
}

function insertStaff(database: DatabaseSync, id: string, displayName: string): void {
  database.prepare(`INSERT INTO staff_members(id,workspace_id,natural_person_key,display_name,grade,active,created_at,updated_at)
    VALUES(?, 'workspace-1', ?, ?, 'PARTNER', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`).run(id, `person-${id}`, displayName);
}

function insertAsset(database: DatabaseSync, id: string, ownerId: string, ownerName: string): void {
  database.prepare(`INSERT INTO report_signature_assets(id,workspace_id,staff_member_id,owner_display_name,owner_grade,signature_file_id,seal_file_id,
      signature_sha256,seal_sha256,signature_width,signature_height,seal_width,seal_height,label,status,uploaded_at,uploaded_by_actor_id)
    VALUES(?, 'workspace-1', ?, ?, 'PARTNER', 'signature-file', 'seal-file', ?, ?, 400, 120, 300, 300, 'Partner assets', 'ACTIVE',
      '2026-10-01T00:00:00.000Z', 'actor-1')`).run(id, ownerId, ownerName, 'a'.repeat(64), 'b'.repeat(64));
}

function insertConsent(database: DatabaseSync, actorStaffMemberId: string | null, actorDisplayName: string | null, persona: string | null): void {
  database.prepare(`INSERT INTO report_signature_consents(id,workspace_id,client_id,engagement_id,actor_id,signature_asset_id,opinion_version_id,report_candidate_id,
      candidate_content_hash,proposed_report_date,consent_text,consented_at,attribution,actor_staff_member_id,actor_display_name,actor_persona)
    VALUES('consent-1','workspace-1','client-1','engagement-1','actor-1','asset-1','opinion-1','candidate-1',?,'2026-10-07',
      'The Partner reviewed and approved this exact candidate.', '2026-10-07T12:00:00.000Z','SELF_ASSERTED_PERSONA',?,?,?)`)
    .run('c'.repeat(64), actorStaffMemberId, actorDisplayName, persona);
}

describe('US-REP-002 immutable signature owner snapshots', () => {
  it('requires registration to snapshot the active Partner owner name and grade', () => {
    const database = migratedDatabase();
    try {
      insertStaff(database, 'partner-1', 'Partner One');
      insertAsset(database, 'asset-1', 'partner-1', 'Partner One');
      const asset = database.prepare('SELECT owner_display_name,owner_grade FROM report_signature_assets WHERE id=?').get('asset-1') as any;
      assert.equal(asset.owner_display_name, 'Partner One');
      assert.equal(asset.owner_grade, 'PARTNER');
      assert.throws(() => insertAsset(database, 'asset-2', 'partner-1', 'A different name'), /active Partner owner snapshot/);
    } finally { database.close(); }
  });

  it('accepts consent only when its immutable Partner identity snapshot matches the asset owner', () => {
    const database = migratedDatabase();
    try {
      insertStaff(database, 'partner-1', 'Partner One');
      insertStaff(database, 'partner-2', 'Partner Two');
      insertAsset(database, 'asset-1', 'partner-1', 'Partner One');
      insertConsent(database, 'partner-1', 'Partner One', 'APPROVER');
      assert.equal(database.prepare('SELECT actor_staff_member_id FROM report_signature_consents WHERE id=?').get('consent-1')?.actor_staff_member_id, 'partner-1');
      assert.throws(() => insertConsent(database, 'partner-2', 'Partner Two', 'APPROVER'), /active Partner owner snapshot/);
      assert.throws(() => insertConsent(database, null, null, 'APPROVER'), /active Partner owner snapshot/);
    } finally { database.close(); }
  });
});
