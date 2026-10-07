export type VerificationStatus = 'PASSED' | 'FAILED' | 'NOT_RUN';
export type VerificationEnvironment = 'LOCAL' | 'CI' | 'STAGING' | 'PRODUCTION' | 'UNKNOWN';

export interface VerificationRunMetadata {
  sourceCommit: string;
  schemaVersion: number;
  environment: VerificationEnvironment;
  startedAt: string;
  completedAt: string | null;
  status: VerificationStatus;
}

export interface VerificationSupportBundle {
  format: 'auditsphere-operational-support-v1';
  generatedAt: string;
  applicationSchemaVersion: number;
  installedSchemaVersion: number | null;
  readiness: 'ready' | 'degraded' | 'not_checked';
  dependencyCodes: string[];
  verificationRuns: VerificationRunMetadata[];
}

export interface VerificationRunRow {
  source_commit: unknown;
  schema_version: unknown;
  environment: unknown;
  started_at: unknown;
  completed_at: unknown;
  status: unknown;
}

const DEPENDENCY_CODES = new Set([
  'D1_UNAVAILABLE',
  'SCHEMA_VERSION_MISMATCH',
  'SCHEMA_VERSION_UNAVAILABLE',
  'R2_UNAVAILABLE',
  'VERIFICATION_RUNS_UNAVAILABLE'
]);

const normalizeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const normalizeRun = (row: VerificationRunRow): VerificationRunMetadata | null => {
  const sourceCommit = typeof row.source_commit === 'string' && /^[a-f0-9]{7,64}$/i.test(row.source_commit)
    ? row.source_commit.toLowerCase() : null;
  const schemaVersion = Number(row.schema_version);
  const environment = typeof row.environment === 'string' && ['LOCAL', 'CI', 'STAGING', 'PRODUCTION'].includes(row.environment.toUpperCase())
    ? row.environment.toUpperCase() as Exclude<VerificationEnvironment, 'UNKNOWN'> : null;
  const startedAt = normalizeTimestamp(row.started_at);
  const completedAt = row.completed_at === null ? null : normalizeTimestamp(row.completed_at);
  const status = row.status === 'PASSED' || row.status === 'FAILED' || row.status === 'NOT_RUN' ? row.status : null;

  if (!sourceCommit || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || !environment || !startedAt || !status) return null;
  if ((status === 'NOT_RUN' && row.completed_at !== null) || (status !== 'NOT_RUN' && !completedAt)) return null;
  if (completedAt && Date.parse(completedAt) < Date.parse(startedAt)) return null;

  return { sourceCommit, schemaVersion, environment, startedAt, completedAt, status };
};

/**
 * Creates an allowlisted operational export. Caller-provided rows are never
 * spread into the result, so workspace IDs, test output, error text and other
 * unexpected columns cannot escape into a support bundle.
 */
export function buildVerificationSupportBundle(input: {
  generatedAt: string;
  applicationSchemaVersion: number;
  installedSchemaVersion: number | null;
  readiness: 'ready' | 'degraded' | 'not_checked';
  dependencyCodes: unknown[];
  verificationRuns: VerificationRunRow[];
}): VerificationSupportBundle {
  const generatedAt = normalizeTimestamp(input.generatedAt);
  if (!generatedAt) throw new TypeError('A valid UTC generation timestamp is required.');
  if (!Number.isSafeInteger(input.applicationSchemaVersion) || input.applicationSchemaVersion < 1) {
    throw new TypeError('A valid application schema version is required.');
  }
  const installedSchemaVersion = input.installedSchemaVersion !== null
    && Number.isSafeInteger(input.installedSchemaVersion) && input.installedSchemaVersion > 0
    ? input.installedSchemaVersion : null;
  const dependencyCodes = [...new Set(input.dependencyCodes.filter((code): code is string =>
    typeof code === 'string' && DEPENDENCY_CODES.has(code)))].sort();
  const verificationRuns = input.verificationRuns.slice(0, 100)
    .map(normalizeRun).filter((run): run is VerificationRunMetadata => run !== null).slice(0, 20);

  return {
    format: 'auditsphere-operational-support-v1',
    generatedAt,
    applicationSchemaVersion: input.applicationSchemaVersion,
    installedSchemaVersion,
    readiness: dependencyCodes.length > 0 || input.readiness === 'degraded' ? 'degraded' : input.readiness,
    dependencyCodes,
    verificationRuns
  };
}
