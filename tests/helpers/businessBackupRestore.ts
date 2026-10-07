import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import type { SqliteD1 } from './sqliteD1.js';

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

interface CommittedFile {
  id: string;
  originalName: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  archivePath: string;
}

interface RecoveryManifest {
  format: 'AuditSphere isolated recovery bundle v1';
  createdAt: string;
  database: { archivePath: 'database.sqlite'; sha256: string; sizeBytes: number };
  recordCounts: Record<string, number>;
  financialTotals: {
    currency: 'QAR';
    engagementContractFeeMinor: number;
    trialBalanceCurrentDebitsMinor: number;
    trialBalanceCurrentCreditsMinor: number;
    trialBalancePriorDebitsMinor: number;
    trialBalancePriorCreditsMinor: number;
  };
  files: CommittedFile[];
}

function countRecords(db: SqliteD1): Record<string, number> {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all<{ name: string }>().results;
  return Object.fromEntries(tables.map(({ name }) => {
    const quotedName = `"${name.replace(/"/g, '""')}"`;
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quotedName}`).first<{ count: number }>();
    return [name, Number(row?.count ?? 0)];
  }));
}

function financialTotals(db: SqliteD1): RecoveryManifest['financialTotals'] {
  const row = db.prepare(`SELECT
    COALESCE((SELECT SUM(contract_fee_minor) FROM engagements),0) AS engagement_fees,
    COALESCE((SELECT SUM(current_debits_minor) FROM tb_versions),0) AS current_debits,
    COALESCE((SELECT SUM(current_credits_minor) FROM tb_versions),0) AS current_credits,
    COALESCE((SELECT SUM(prior_debits_minor) FROM tb_versions),0) AS prior_debits,
    COALESCE((SELECT SUM(prior_credits_minor) FROM tb_versions),0) AS prior_credits`).first<{
      engagement_fees: number; current_debits: number; current_credits: number; prior_debits: number; prior_credits: number;
    }>();
  return {
    currency: 'QAR',
    engagementContractFeeMinor: Number(row?.engagement_fees ?? 0),
    trialBalanceCurrentDebitsMinor: Number(row?.current_debits ?? 0),
    trialBalanceCurrentCreditsMinor: Number(row?.current_credits ?? 0),
    trialBalancePriorDebitsMinor: Number(row?.prior_debits ?? 0),
    trialBalancePriorCreditsMinor: Number(row?.prior_credits ?? 0)
  };
}

/**
 * Builds a self-contained local acceptance bundle from the real Worker SQLite
 * adapter and its committed file references. This deliberately does not call
 * or imply a Cloudflare production backup operation.
 */
export function createBusinessRecoveryBundle(
  db: SqliteD1,
  readObject: (key: string) => Uint8Array | null,
  createdAt = new Date().toISOString()
): Uint8Array {
  const database = db.serialize();
  const fileRows = db.prepare(`SELECT id,original_name,object_key,sha256,size_bytes
    FROM file_versions WHERE state='COMMITTED' ORDER BY id`).all<{
      id: string; original_name: string; object_key: string; sha256: string; size_bytes: number;
    }>().results;
  const entries: Record<string, Uint8Array> = { 'database.sqlite': database };
  const files = fileRows.map(row => {
    const bytes = readObject(row.object_key);
    if (!bytes) throw new Error(`Committed file ${row.id} is missing from the source object store.`);
    if (bytes.byteLength !== Number(row.size_bytes) || sha256(bytes) !== row.sha256) {
      throw new Error(`Committed file ${row.id} does not match its database size and digest.`);
    }
    const archivePath = `objects/${sha256(row.object_key)}.bin`;
    if (entries[archivePath]) throw new Error('Two committed file keys map to the same recovery path.');
    entries[archivePath] = bytes;
    return {
      id: row.id,
      originalName: row.original_name,
      objectKey: row.object_key,
      sha256: row.sha256,
      sizeBytes: Number(row.size_bytes),
      archivePath
    };
  });
  const manifest: RecoveryManifest = {
    format: 'AuditSphere isolated recovery bundle v1',
    createdAt,
    database: { archivePath: 'database.sqlite', sha256: sha256(database), sizeBytes: database.byteLength },
    recordCounts: countRecords(db),
    financialTotals: financialTotals(db),
    files
  };
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  return zipSync(entries, { level: 0 });
}

/** Restores and reconciles a bundle into a fresh isolated database and object map. */
export function restoreBusinessRecoveryBundle(
  bundle: Uint8Array,
  targetDb: SqliteD1
): { manifest: RecoveryManifest; objects: Map<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bundle);
  } catch {
    throw new Error('Recovery bundle is not a readable ZIP archive.');
  }
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) throw new Error('Recovery bundle manifest is missing.');
  let manifest: RecoveryManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as RecoveryManifest;
  } catch {
    throw new Error('Recovery bundle manifest is invalid JSON.');
  }
  if (manifest.format !== 'AuditSphere isolated recovery bundle v1' || manifest.database?.archivePath !== 'database.sqlite') {
    throw new Error('Recovery bundle manifest format is unsupported.');
  }
  const database = entries[manifest.database.archivePath];
  if (!database || database.byteLength !== manifest.database.sizeBytes || sha256(database) !== manifest.database.sha256) {
    throw new Error('Recovery database image is missing or does not match its manifest digest.');
  }

  const declaredPaths = new Set(['database.sqlite', 'manifest.json']);
  const restoredObjects = new Map<string, Uint8Array>();
  for (const file of manifest.files) {
    if (!file.id || !file.objectKey || !file.archivePath.startsWith('objects/')) throw new Error('Recovery file manifest entry is invalid.');
    if (declaredPaths.has(file.archivePath)) throw new Error('Recovery file manifest contains a duplicate archive path.');
    declaredPaths.add(file.archivePath);
    const bytes = entries[file.archivePath];
    if (!bytes) throw new Error(`Recovery file ${file.id} is missing; restore cannot be marked successful.`);
    if (bytes.byteLength !== file.sizeBytes || sha256(bytes) !== file.sha256) {
      throw new Error(`Recovery file ${file.id} does not match its manifest size and digest.`);
    }
    restoredObjects.set(file.objectKey, bytes.slice());
  }
  if (Object.keys(entries).some(path => !declaredPaths.has(path))) throw new Error('Recovery bundle contains an undeclared file.');

  targetDb.restore(database);
  const foreignKeyFailures = targetDb.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>().results;
  if (foreignKeyFailures.length) throw new Error(`Restored database has ${foreignKeyFailures.length} foreign-key violations.`);
  const actualCounts = countRecords(targetDb);
  if (JSON.stringify(actualCounts) !== JSON.stringify(manifest.recordCounts)) throw new Error('Restored business record counts do not reconcile.');
  const actualFinancialTotals = financialTotals(targetDb);
  if (manifest.financialTotals.currency !== 'QAR' || JSON.stringify(actualFinancialTotals) !== JSON.stringify(manifest.financialTotals)) {
    throw new Error('Restored engagement financial totals do not reconcile.');
  }

  const restoredRows = targetDb.prepare(`SELECT id,original_name,object_key,sha256,size_bytes
    FROM file_versions WHERE state='COMMITTED' ORDER BY id`).all<{
      id: string; original_name: string; object_key: string; sha256: string; size_bytes: number;
    }>().results;
  if (restoredRows.length !== manifest.files.length) throw new Error('Restored committed-file manifest count does not reconcile.');
  for (let index = 0; index < restoredRows.length; index++) {
    const row = restoredRows[index];
    const file = manifest.files[index];
    if (row.id !== file.id || row.original_name !== file.originalName || row.object_key !== file.objectKey ||
        row.sha256 !== file.sha256 || Number(row.size_bytes) !== file.sizeBytes) {
      throw new Error(`Restored committed-file database row ${row.id} does not match its recovery manifest.`);
    }
    const bytes = restoredObjects.get(row.object_key);
    if (!bytes || bytes.byteLength !== Number(row.size_bytes) || sha256(bytes) !== row.sha256) {
      throw new Error(`Restored original object bytes for ${row.id} do not reconcile.`);
    }
  }
  return { manifest, objects: restoredObjects };
}
