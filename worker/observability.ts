export interface ApiRequestMetricInput {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
}

/** Structured request telemetry deliberately accepts a route template, never a raw URL. */
export function apiRequestMetric(input: ApiRequestMetricInput): Record<string, string | number> {
  const status = Math.trunc(input.status);
  return {
    event: 'workspace.api.request',
    requestId: input.requestId,
    route: input.route,
    method: input.method.toUpperCase(),
    status,
    outcome: status >= 500 ? 'error' : status >= 400 ? 'rejected' : 'success',
    durationMs: Math.max(0, Math.round(input.durationMs * 100) / 100)
  };
}

/** Error class names are useful for diagnosis; exception messages may contain user data. */
export function safeErrorKind(error: unknown): string {
  if (!(error instanceof Error)) return 'NonErrorThrow';
  return /^[A-Za-z][A-Za-z0-9]{0,49}$/.test(error.name) ? error.name : 'Error';
}

export interface OutboxMetricRow {
  kind: string;
  status: string;
  count: number;
  oldest_created_at: string | null;
  max_attempts: number;
}

export function outboxSnapshot(
  rows: OutboxMetricRow[],
  at: string,
  processedJobs: number,
  archiveJobsQueued: number
): Record<string, unknown> {
  const unfinishedJobs = rows.reduce((total, row) => total + Number(row.count || 0), 0);
  const oldestCreatedAt = rows.map(row => row.oldest_created_at).filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
  const ageSeconds = oldestCreatedAt ? Math.max(0, Math.floor((Date.parse(at) - Date.parse(oldestCreatedAt)) / 1000)) : null;
  return {
    event: 'workspace.scheduled.metrics',
    at,
    processedJobs,
    archiveJobsQueued,
    outbox: {
      unfinishedJobs,
      oldestUnfinishedAgeSeconds: ageSeconds,
      maxAttempts: rows.reduce((maximum, row) => Math.max(maximum, Number(row.max_attempts || 0)), 0),
      byKindAndStatus: rows.map(row => ({ kind: row.kind, status: row.status, count: Number(row.count || 0) }))
    }
  };
}
