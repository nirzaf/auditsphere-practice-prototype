import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildMigrationAuditReport, type MigrationAuditSnapshot, type VerifiedR2Object } from './business-migration-audit-core';
import { buildMigrationAuditSnapshotQuery } from './business-migration-audit-query';
import { buildMigrationApplyPlan } from './business-migration-apply';
import { APPLICATION_SCHEMA_VERSION } from '../worker/versions';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WRANGLER = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const CONFIG = resolve(ROOT, 'wrangler.jsonc');
const DATABASE = 'steaudit-prototype-demo';
const BUCKET = 'auditsphere-prototype-files';
// Use the same version that gates Worker schema compatibility and apply guards.
const MIGRATION_TARGET_SCHEMA_VERSION = APPLICATION_SCHEMA_VERSION;
const MAX_D1_OUTPUT_BYTES = 96 * 1024 * 1024;

function usage(): string {
  return [
    'Usage: npm run migration:audit -- --workspace <uuid> (--dry-run | --apply) [--remote]',
    '',
    'Reads one D1 workspace and verifies its committed R2 file bytes.',
    'Dry-run is read-only apart from its MigrationRun metadata. Apply is deployment-only and requires --remote.',
    'Apply currently accepts explicitly mapped clients, contacts and verified committed files; other source entities block it.'
  ].join('\n');
}

function parseArgs(argv: string[]): { workspaceId: string; remote: boolean; operation: 'dry-run' | 'apply' } {
  let workspaceId = '';
  let remote = false;
  let dryRun = false;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--workspace') workspaceId = argv[++index] ?? '';
    else if (value === '--remote') remote = true;
    else if (value === '--local') remote = false;
    else if (value === '--dry-run') dryRun = true;
    else if (value === '--apply') apply = true;
    else if (value === '--help' || value === '-h') {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`Unsupported argument: ${value}`);
  }
  if (dryRun === apply) throw new Error('Choose exactly one of --dry-run or --apply.');
  if (apply && !remote) throw new Error('--apply is a deployment operation and requires explicit --remote.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error('--workspace must be a valid UUID.');
  }
  if (!existsSync(WRANGLER)) throw new Error('Wrangler is not installed. Run npm install before using the migration audit.');
  return { workspaceId, remote, operation: apply ? 'apply' : 'dry-run' };
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
  const { workspaceId, remote, operation } = parseArgs(process.argv.slice(2));
  const scopeFlag = remote ? '--remote' : '--local';
  const command = buildMigrationAuditSnapshotQuery(workspaceId);
  const result = await runWrangler(['d1', 'execute', DATABASE, '--json', '--command', command, '--config', CONFIG, scopeFlag], { maxOutputBytes: MAX_D1_OUTPUT_BYTES });
  const snapshot = parseD1Snapshot(result.stdout);
  if (!snapshot) throw new Error('Workspace not found; no migration audit was run.');
  const installedVersion = await readSchemaVersion(remote);
  const verifiedObjects = await verifyR2Objects(snapshot, remote);
  const report = buildMigrationAuditReport(snapshot, verifiedObjects, MIGRATION_TARGET_SCHEMA_VERSION, installedVersion);
  if (operation === 'apply') {
    const appliedAt = new Date().toISOString();
    const plan = buildMigrationApplyPlan(snapshot, report, installedVersion, appliedAt);
    const tempDirectory = mkdtempSync(join(tmpdir(), 'auditsphere-migration-apply-'));
    const sqlPath = join(tempDirectory, 'migration.sql');
    try {
      writeFileSync(sqlPath, plan.sql, { encoding: 'utf8', flag: 'wx' });
      await runWrangler(['d1', 'execute', DATABASE, '--file', sqlPath, '--config', CONFIG, '--remote'], { maxOutputBytes: 1024 * 1024 });
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
    const afterResult = await runWrangler(['d1', 'execute', DATABASE, '--json', '--command', command, '--config', CONFIG, '--remote'], { maxOutputBytes: MAX_D1_OUTPUT_BYTES });
    const afterSnapshot = parseD1Snapshot(afterResult.stdout);
    if (!afterSnapshot) throw new Error('Workspace disappeared after the migration batch.');
    const afterObjects = await verifyR2Objects(afterSnapshot, true);
    const verified = buildMigrationAuditReport(afterSnapshot, afterObjects, MIGRATION_TARGET_SCHEMA_VERSION, installedVersion, report.runId);
    if (verified.validationStatus !== 'VALIDATED' || verified.sourceSha256 !== report.sourceSha256) {
      throw new Error('Atomic migration committed, but the follow-up reconciliation did not validate. Review the APPLIED run before cutover.');
    }
    console.log(JSON.stringify({ ...verified, status: 'APPLIED', businessRecordsChanged: true, auditMetadataRecorded: true, applyProfile: 'clients-contacts-files-v2' }, null, 2));
    return;
  }
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
