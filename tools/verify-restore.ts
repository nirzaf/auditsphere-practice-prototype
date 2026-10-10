import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

type MaybePromise<T> = T | Promise<T>;

interface QueryStatement {
  all<T>(): MaybePromise<{ results?: T[] }>;
}

interface QueryBuilder {
  bind(...values: unknown[]): QueryStatement;
}

export interface RestoreDatabase {
  prepare(sql: string): QueryBuilder;
}

export interface RestoreObjectStore {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

interface AuditEventRow {
  id: string;
  sequence: number;
  actor_assurance: string;
  source: string;
  event_type: string;
  actor_id: string | null;
  actor_persona: string | null;
  command_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details_json: string | null;
  created_at: number | string;
  chain_timestamp: string | null;
  previous_hash: string | null;
  event_hash: string | null;
}

interface AuditHeadRow {
  last_sequence: number;
  last_event_hash: string | null;
}

interface FileVersionRow {
  id: string;
  object_key: string;
  sha256: string | null;
}

interface TableCountRow {
  table_name: string;
  row_count: number;
}

export interface RestoreVerificationSummary {
  workspaceId: string;
  environment: 'staging' | 'production';
  auditEventsVerified: number;
  latestAuditSequence: number;
  latestAuditHash: string;
  committedFileVersions: number;
  fileVersionsSampled: number;
  workspaceTableCounts: Record<string, number>;
}

const hashJson = (value: unknown): string => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

function eventHashForTimestamp(workspaceId: string, row: AuditEventRow, timestamp: string): string {
  if (row.event_type === 'BOOTSTRAP') {
    return hashJson({
      id: row.id,
      workspaceId,
      sequence: Number(row.sequence),
      eventType: 'BOOTSTRAP',
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorAssurance: row.actor_assurance,
      source: row.source,
      details: row.details_json,
      timestamp
    });
  }

  return hashJson({
    id: row.id,
    workspaceId,
    sequence: Number(row.sequence),
    previousHash: row.previous_hash,
    actorId: row.actor_id,
    actorPersona: row.actor_persona,
    commandType: row.command_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details_json,
    timestamp
  });
}

function timestampCandidates(createdAt: number | string, chainTimestamp: string | null): string[] {
  if (chainTimestamp) {
    const parsed = new Date(chainTimestamp);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== chainTimestamp) {
      throw new Error('Audit event has an invalid chain timestamp.');
    }
    return [chainTimestamp];
  }
  const seconds = Number(createdAt);
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Audit event has an invalid stored timestamp.');
  const baseMs = seconds * 1000;
  // Current command events persist the exact second. Older outbox events hash
  // an ISO timestamp with milliseconds but persist only whole seconds. The
  // event is written after it is hashed, so allow that same second or the
  // immediately preceding second if the write crossed a second boundary.
  const candidates: string[] = [new Date(baseMs).toISOString()];
  for (let offset = 999; offset > 0; offset -= 1) candidates.push(new Date(baseMs + offset).toISOString());
  for (let offset = -1; offset >= -1000; offset -= 1) candidates.push(new Date(baseMs + offset).toISOString());
  return candidates;
}

function verifyAuditChain(workspaceId: string, events: AuditEventRow[], heads: AuditHeadRow[]): {
  count: number;
  sequence: number;
  hash: string;
} {
  if (heads.length !== 1) throw new Error('Expected exactly one workspace audit-chain head.');
  if (events.length === 0) throw new Error('Workspace audit chain contains no events.');

  let previousHash: string | null = null;
  let expectedSequence = 1;
  for (const row of events) {
    const sequence = Number(row.sequence);
    if (sequence !== expectedSequence) throw new Error(`Audit chain sequence gap at ${expectedSequence}.`);
    if (row.previous_hash !== previousHash) throw new Error(`Audit chain previous-hash mismatch at sequence ${sequence}.`);
    if (!row.event_hash || !/^[a-f0-9]{64}$/i.test(row.event_hash)) {
      throw new Error(`Audit event hash is missing or malformed at sequence ${sequence}.`);
    }

    const matches = timestampCandidates(row.created_at, row.chain_timestamp).some(timestamp =>
      eventHashForTimestamp(workspaceId, row, timestamp) === row.event_hash?.toLowerCase());
    if (!matches) throw new Error(`Audit event hash mismatch at sequence ${sequence}.`);
    previousHash = row.event_hash.toLowerCase();
    expectedSequence += 1;
  }

  const finalSequence = expectedSequence - 1;
  const head = heads[0];
  if (Number(head.last_sequence) !== finalSequence || head.last_event_hash?.toLowerCase() !== previousHash) {
    throw new Error('Workspace audit-chain head does not match the verified event chain.');
  }
  return { count: events.length, sequence: finalSequence, hash: previousHash };
}

function evenlySpacedSample<T>(rows: T[], requested: number): T[] {
  if (rows.length <= requested) return rows;
  if (requested === 1) return [rows[rows.length - 1]];
  return Array.from({ length: requested }, (_, index) => rows[Math.floor(index * (rows.length - 1) / (requested - 1))]);
}

function workspaceScopedTables(): string[] {
  const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../worker/migrations');
  const tables = new Set<string>();
  for (const migration of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationDirectory, migration), 'utf8');
    const statements = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`\[]?([A-Za-z0-9_]+)["`\]]?\s*\(([\s\S]*?)^\s*\);|DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`\[]?([A-Za-z0-9_]+)["`\]]?|ALTER\s+TABLE\s+["`\[]?([A-Za-z0-9_]+)["`\]]?\s+RENAME\s+TO\s+["`\[]?([A-Za-z0-9_]+)["`\]]?|ALTER\s+TABLE\s+["`\[]?([A-Za-z0-9_]+)["`\]]?\s+ADD\s+COLUMN\s+workspace_id\b/gim;
    for (const match of sql.matchAll(statements)) {
      if (match[1] && /^\s*workspace_id\s+(?:TEXT|INTEGER|BLOB)\b/im.test(match[2])) tables.add(match[1]);
      else if (match[3]) tables.delete(match[3]);
      else if (match[4] && match[5] && tables.has(match[4])) {
        tables.delete(match[4]);
        tables.add(match[5]);
      } else if (match[6]) tables.add(match[6]);
    }
  }
  return [...tables].sort();
}

const tableCounts = workspaceScopedTables();

function countRowsQuery(workspaceId: string): { sql: string; bindings: unknown[] } {
  const parts = [`SELECT 'workspaces' AS table_name,COUNT(*) AS row_count FROM workspaces WHERE id=?`];
  const bindings: unknown[] = [workspaceId];
  for (const table of tableCounts) {
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error('Migration contains an invalid workspace table name.');
    parts.push(`SELECT '${table}' AS table_name,COUNT(*) AS row_count FROM "${table}" WHERE workspace_id=?`);
    bindings.push(workspaceId);
  }
  return { sql: parts.join(' UNION ALL '), bindings };
}

export async function verifyRestore(
  workspaceId: string,
  environment: 'staging' | 'production',
  db: RestoreDatabase,
  files: RestoreObjectStore,
  sampleSize = 10
): Promise<RestoreVerificationSummary> {
  if (!workspaceId.trim()) throw new Error('Workspace ID is required.');
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) {
    throw new Error('Sample size must be an integer from 1 to 1000.');
  }

  const countsQuery = countRowsQuery(workspaceId);
  const [eventResult, headResult, fileResult, countResult] = await Promise.all([
    db.prepare(`SELECT id,sequence,actor_assurance,source,event_type,actor_id,actor_persona,command_type,
        entity_type,entity_id,details_json,created_at,chain_timestamp,previous_hash,event_hash
      FROM audit_events WHERE workspace_id=? AND chain_scope_kind='WORKSPACE' AND chain_scope_id=? ORDER BY sequence`)
      .bind(workspaceId, workspaceId).all<AuditEventRow>(),
    db.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`)
      .bind(workspaceId, workspaceId).all<AuditHeadRow>(),
    db.prepare(`SELECT id,object_key,sha256 FROM file_versions
      WHERE workspace_id=? AND state='COMMITTED' ORDER BY id`)
      .bind(workspaceId).all<FileVersionRow>(),
    db.prepare(countsQuery.sql).bind(...countsQuery.bindings).all<TableCountRow>()
  ]);

  const events = eventResult.results ?? [];
  const chain = verifyAuditChain(workspaceId, events, headResult.results ?? []);
  const versions = fileResult.results ?? [];
  const sample = evenlySpacedSample(versions, sampleSize);

  for (const version of sample) {
    if (!version.sha256 || !/^[a-f0-9]{64}$/i.test(version.sha256)) {
      throw new Error(`Committed file version ${version.id} has no valid stored SHA-256.`);
    }
    const object = await files.get(version.object_key);
    if (!object) throw new Error(`R2 object is missing for committed file version ${version.id}.`);
    const bytes = new Uint8Array(await object.arrayBuffer());
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== version.sha256.toLowerCase()) {
      throw new Error(`R2 object SHA-256 mismatch for committed file version ${version.id}.`);
    }
  }

  return {
    workspaceId,
    environment,
    auditEventsVerified: chain.count,
    latestAuditSequence: chain.sequence,
    latestAuditHash: chain.hash,
    committedFileVersions: versions.length,
    fileVersionsSampled: sample.length,
    workspaceTableCounts: Object.fromEntries((countResult.results ?? []).map(row => [row.table_name, Number(row.row_count)]))
  };
}

const environmentBindings = {
  staging: { database: 'auditsphere-staging', bucket: 'auditsphere-staging-files' },
  production: { database: 'auditsphere-production', bucket: 'auditsphere-production-files' }
} as const;

function parseQueryRows<T>(json: string): T[] {
  const parsed: unknown = JSON.parse(json);
  const resultsFrom = (value: unknown): T[] | null => {
    if (value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results)) {
      return (value as { results: T[] }).results;
    }
    if (Array.isArray(value)) {
      const nested = value.find(item => item && typeof item === 'object' && Array.isArray((item as { results?: unknown }).results));
      if (nested) return (nested as { results: T[] }).results;
      return value as T[];
    }
    return null;
  };
  const direct = resultsFrom(parsed);
  if (direct) return direct;
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const rows = resultsFrom(item);
      if (rows) return rows;
    }
  }
  throw new Error('Wrangler returned an unexpected D1 query result.');
}

function runWrangler(args: string[], options: { cwd: string }): string {
  const wranglerEntrypoint = resolve(options.cwd, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [wranglerEntrypoint, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error('A read-only Wrangler command failed; check Wrangler authentication and the selected environment.');
  return result.stdout;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const valueFor = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const workspaceId = valueFor('--workspace-id');
  const environment = valueFor('--environment');
  const sampleArg = valueFor('--sample-size');
  if (args.some((argument, index) => argument.startsWith('--') && !['--workspace-id', '--environment', '--sample-size'].includes(argument)) ||
      args.filter(argument => ['--workspace-id', '--environment', '--sample-size'].includes(argument)).some(flag => !valueFor(flag))) {
    throw new Error('Usage: npx tsx tools/verify-restore.ts --workspace-id <UUID> --environment staging|production [--sample-size 10]');
  }
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error('Workspace ID must be a UUID.');
  if (environment !== 'staging' && environment !== 'production') throw new Error('Environment must be staging or production.');
  const sampleSize = sampleArg === undefined ? 10 : Number(sampleArg);
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) throw new Error('Sample size must be an integer from 1 to 1000.');

  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const bindings = environmentBindings[environment];
  const wranglerArgs = ['--config', resolve(repositoryRoot, 'wrangler.jsonc'), '--env', environment];
  const query = async <T>(sql: string): Promise<T[]> => parseQueryRows<T>(runWrangler([
    'd1', 'execute', bindings.database, '--remote', ...wranglerArgs, '--json', '--command', sql
  ], { cwd: repositoryRoot }));

  const db: RestoreDatabase = {
    prepare(sql: string): QueryBuilder {
      return {
        bind(...values: unknown[]): QueryStatement {
          let index = 0;
          const command = sql.replace(/\?/g, () => sqlText(String(values[index++])));
          return { all: () => query(command).then(results => ({ results })) };
        }
      };
    }
  };

  const tempDirectory = mkdtempSync(join(tmpdir(), 'auditsphere-restore-check-'));
  const files: RestoreObjectStore = {
    async get(key: string) {
      if (!key || key.includes('\0')) throw new Error('R2 object key is invalid.');
      const output = join(tempDirectory, `${createHash('sha256').update(key).digest('hex')}.object`);
      runWrangler([
        'r2', 'object', 'get', `${bindings.bucket}/${key}`, '--remote', ...wranglerArgs, '--file', output
      ], { cwd: repositoryRoot });
      try {
        const bytes = readFileSync(output);
        return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
      } catch {
        throw new Error('Wrangler did not return the requested R2 object.');
      }
    }
  };

  try {
    const summary = await verifyRestore(workspaceId, environment, db, files, sampleSize);
    process.stdout.write(`${JSON.stringify({
      workspaceId: summary.workspaceId,
      environment: summary.environment,
      auditEventsVerified: summary.auditEventsVerified,
        latestAuditSequence: summary.latestAuditSequence,
      latestAuditHash: summary.latestAuditHash,
      committedFileVersions: summary.committedFileVersions,
      fileVersionsSampled: summary.fileVersionsSampled,
      workspaceTableCounts: summary.workspaceTableCounts
    }, null, 2)}\n`);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  runCli().catch(error => {
    process.stderr.write(`Restore verification failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
