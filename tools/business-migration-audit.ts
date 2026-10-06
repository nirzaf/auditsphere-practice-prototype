import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildMigrationAuditReport, type MigrationAuditSnapshot, type VerifiedR2Object } from './business-migration-audit-core';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const CONFIG = resolve(ROOT, 'wrangler.jsonc');
const DATABASE = 'steaudit-prototype-demo';
const BUCKET = 'auditsphere-prototype-files';
// Current fixture-compatible source state is schema 30; normalized cutover uses
// schema 31. The Worker SQL migration marker is reported separately below.
const MIGRATION_TARGET_SCHEMA_VERSION = 31;
const MAX_D1_OUTPUT_BYTES = 96 * 1024 * 1024;
const TARGET_TABLES = [
  'clients', 'contacts', 'leads', 'proposals', 'engagements', 'invoices', 'firm_credit_notes',
  'receipt_vouchers', 'firm_time_entries', 'engagement_budgets', 'risk_assessments', 'procedures',
  'sample_populations', 'evidence_records', 'findings', 'audit_adjustments', 'confirmations',
  'file_versions', 'firm_profiles'
] as const;

function usage(): string {
  return [
    'Usage: npm run migration:audit -- --workspace <uuid> --dry-run [--remote]',
    '',
    'Reads one D1 workspace and verifies its committed R2 file bytes. No business rows are written.',
    'Local Wrangler storage is used by default. Pass --remote to explicitly read the configured remote D1/R2.'
  ].join('\n');
}

function parseArgs(argv: string[]): { workspaceId: string; remote: boolean } {
  let workspaceId = '';
  let remote = false;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--workspace') workspaceId = argv[++index] ?? '';
    else if (value === '--remote') remote = true;
    else if (value === '--local') remote = false;
    else if (value === '--dry-run') dryRun = true;
    else if (value === '--help' || value === '-h') {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`Unsupported argument: ${value}`);
  }
  if (!dryRun) throw new Error('This operator command supports read-only --dry-run only.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error('--workspace must be a valid UUID.');
  }
  if (!existsSync(WRANGLER)) throw new Error('Wrangler is not installed. Run npm install before using the migration audit.');
  return { workspaceId, remote };
}

function runWrangler(args: string[], options: { maxOutputBytes?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [WRANGLER, ...args], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputSize = 0;
    let exceeded = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      outputSize += Buffer.byteLength(chunk);
      if (outputSize > (options.maxOutputBytes ?? 1024 * 1024)) {
        exceeded = true;
        child.kill();
        return;
      }
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', () => reject(new Error('Wrangler could not be started.')));
    child.on('close', code => {
      if (exceeded) return reject(new Error('The D1 workspace snapshot exceeds the 96 MiB audit limit.'));
      if (code !== 0) {
        const failure = new Error('Wrangler read failed. Check local database setup or remote Cloudflare access, then retry.') as Error & { stderr?: string };
        failure.stderr = stderr;
        return reject(failure);
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

function findD1Rows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = findD1Rows(item);
      if (rows) return rows;
    }
  } else if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (Array.isArray(row.results)) return row.results as Array<Record<string, unknown>>;
    for (const nested of Object.values(row)) {
      const rows = findD1Rows(nested);
      if (rows) return rows;
    }
  }
  return undefined;
}

function parseD1Snapshot(stdout: string): MigrationAuditSnapshot | null {
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); }
  catch { throw new Error('Wrangler returned a non-JSON D1 response; no audit report was produced.'); }
  const rows = findD1Rows(parsed);
  if (!rows?.length) return null;
  const snapshotJson = rows[0].snapshot_json;
  if (typeof snapshotJson !== 'string') throw new Error('D1 did not return the migration snapshot.');
  return JSON.parse(snapshotJson) as MigrationAuditSnapshot;
}

function buildSnapshotQuery(workspaceId: string): string {
  // workspaceId is constrained to the UUID grammar before it reaches SQL.
  const id = `'${workspaceId}'`;
  const targetUnion = TARGET_TABLES.map(table => `SELECT '${table}' AS kind,id FROM ${table} WHERE workspace_id=${id}`).join(' UNION ALL ');
  const targetMoneyUnion = [
    `SELECT 'invoices' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(total_minor),0) AS TEXT) AS amount_minor FROM invoices WHERE workspace_id=${id}`,
    `SELECT 'payments' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) AS amount_minor FROM payments WHERE workspace_id=${id}`,
    `SELECT 'receipt_vouchers' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) AS amount_minor FROM receipt_vouchers WHERE workspace_id=${id}`,
    `SELECT 'firm_credit_notes' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) AS amount_minor FROM firm_credit_notes WHERE workspace_id=${id}`
  ].join(' UNION ALL ');
  return `SELECT json_object(
    'workspace',json_object('id',w.id,'schema_version',w.schema_version,'data_mode',w.data_mode),
    'entities',json(COALESCE((SELECT json_group_array(json_object('entity_kind',e.entity_kind,'entity_id',e.entity_id,'payload_json',e.payload_json)) FROM workspace_entities e WHERE e.workspace_id=w.id AND e.deleted_at IS NULL),'[]')),
    'rootDocuments',json(COALESCE((SELECT json_group_array(json_object('document_key',d.document_key,'payload_json',d.payload_json)) FROM workspace_root_documents d WHERE d.workspace_id=w.id),'[]')),
    'files',json(COALESCE((SELECT json_group_array(json_object('id',f.id,'r2_key',f.r2_key,'original_name',f.original_name,'size_bytes',f.size_bytes,'sha256',f.sha256,'state',f.state)) FROM file_objects f WHERE f.workspace_id=w.id AND f.deleted_at IS NULL),'[]')),
    'idMaps',json(COALESCE((SELECT json_group_array(json_object('source_kind',m.source_kind,'source_id',m.source_id,'target_kind',m.target_kind,'target_id',m.target_id)) FROM migration_id_map m WHERE m.workspace_id=w.id),'[]')),
    'targetRows',json(COALESCE((SELECT json_group_array(json_object('kind',t.kind,'id',t.id)) FROM (${targetUnion}) t),'[]')),
    'targetMoneyTotals',json(COALESCE((SELECT json_group_array(json_object('kind',t.kind,'row_count',t.row_count,'amount_minor',t.amount_minor)) FROM (${targetMoneyUnion}) t),'[]'))
  ) AS snapshot_json FROM workspaces w WHERE w.id=${id}`;
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

function isMissingR2(stderr: string): boolean {
  return /(?:status\s*[:=]?\s*404|\b404\b|NoSuchKey|object does not exist|object not found)/i.test(stderr);
}

async function verifyR2Objects(snapshot: MigrationAuditSnapshot, remote: boolean): Promise<Map<string, VerifiedR2Object>> {
  const verified = new Map<string, VerifiedR2Object>();
  const tempDirectory = mkdtempSync(join(tmpdir(), 'auditsphere-migration-audit-'));
  try {
    for (const [index, file] of snapshot.files.entries()) {
      if (file.state !== 'COMMITTED') continue;
      const localPath = join(tempDirectory, `${index}-${basename(file.id)}.bin`);
      const args = ['r2', 'object', 'get', `${BUCKET}/${file.r2_key}`, '--file', localPath, '--config', CONFIG, remote ? '--remote' : '--local'];
      try {
        await runWrangler(args);
        if (!existsSync(localPath)) {
          verified.set(file.id, { found: false });
          continue;
        }
        verified.set(file.id, { found: true, sizeBytes: statSync(localPath).size, sha256: await sha256File(localPath) });
      } catch (error) {
        const stderr = (error as Error & { stderr?: string }).stderr ?? '';
        if (isMissingR2(stderr)) { verified.set(file.id, { found: false }); continue; }
        throw new Error('An R2 read failed during migration audit. Check the configured bucket and access, then retry.');
      } finally {
        if (existsSync(localPath)) rmSync(localPath, { force: true });
      }
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
  return verified;
}

async function main(): Promise<void> {
  const { workspaceId, remote } = parseArgs(process.argv.slice(2));
  const scopeFlag = remote ? '--remote' : '--local';
  const command = buildSnapshotQuery(workspaceId);
  const result = await runWrangler(['d1', 'execute', DATABASE, '--json', '--command', command, '--config', CONFIG, scopeFlag], { maxOutputBytes: MAX_D1_OUTPUT_BYTES });
  const snapshot = parseD1Snapshot(result.stdout);
  if (!snapshot) throw new Error('Workspace not found; no migration audit was run.');
  const installedVersion = await readSchemaVersion(remote);
  const verifiedObjects = await verifyR2Objects(snapshot, remote);
  const report = buildMigrationAuditReport(snapshot, verifiedObjects, MIGRATION_TARGET_SCHEMA_VERSION, installedVersion);
  if (snapshot.workspace.schema_version < MIGRATION_TARGET_SCHEMA_VERSION) {
    await recordMigrationRun(report, remote);
    report.auditMetadataRecorded = true;
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.validationStatus !== 'VALIDATED') process.exitCode = 2;
}

const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;

async function recordMigrationRun(report: ReturnType<typeof buildMigrationAuditReport>, remote: boolean): Promise<void> {
  const timestamp = new Date().toISOString();
  const status = report.validationStatus === 'VALIDATED' ? 'VALIDATED' : 'DRY_RUN';
  const reconciliation = JSON.stringify({
    runId: report.runId,
    sourceSha256: report.sourceSha256,
    sourceCount: report.sourceCount,
    targetCount: report.targetCount,
    validationStatus: report.validationStatus,
    blockerCount: report.blockers,
    targetFieldReconciliationIssueCount: report.reconciliationIssues.length,
    reconciliationByTarget: report.reconciliationByTarget,
    counts: report.counts,
    moneyTotals: report.moneyTotals,
    missingFileCount: report.missingFiles.length,
    orphanRowCount: report.orphanRows.length,
    unmappedRowCount: report.unmappedRows.length
  });
  const command = `INSERT INTO migration_runs(id,workspace_id,source_schema_version,target_schema_version,source_sha256,status,started_at,completed_at,source_count,target_count,reconciliation_json,error_code) VALUES(${sqlText(report.runId)},${sqlText(report.workspaceId)},${report.sourceSchemaVersion},${report.targetSchemaVersion},${sqlText(report.sourceSha256)},${sqlText(status)},${sqlText(timestamp)},${sqlText(timestamp)},${report.sourceCount},${report.targetCount},${sqlText(reconciliation)},${report.validationStatus === 'VALIDATED' ? 'NULL' : sqlText('MIGRATION_AUDIT_BLOCKED')})`;
  await runWrangler(['d1', 'execute', DATABASE, '--command', command, '--config', CONFIG, remote ? '--remote' : '--local']);
}

async function readSchemaVersion(remote: boolean): Promise<number> {
  const flag = remote ? '--remote' : '--local';
  const result = await runWrangler(['d1', 'execute', DATABASE, '--json', '--command', 'SELECT version FROM application_schema_version WHERE singleton=1', '--config', CONFIG, flag]);
  const rows = findD1Rows(JSON.parse(result.stdout));
  const version = rows?.[0]?.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) throw new Error('Installed application schema version could not be read.');
  return version;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration audit failed.');
  console.error(usage());
  process.exitCode = 1;
}
