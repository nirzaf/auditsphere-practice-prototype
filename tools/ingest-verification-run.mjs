import { readFile } from 'node:fs/promises';

const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};

const inputPath = process.argv[2] ?? 'verification-support-bundle.json';
const apiBase = process.env.AUDITSPHERE_VERIFICATION_INGEST_URL;
const token = process.env.AUDITSPHERE_VERIFICATION_INGEST_TOKEN;
const workflowRunId = process.env.GITHUB_RUN_ID;
const workflowAttempt = process.env.GITHUB_RUN_ATTEMPT;

if (!apiBase || !token || token.length < 32 || !/^\d{1,20}$/.test(workflowRunId ?? '')
  || !/^\d{1,10}$/.test(workflowAttempt ?? '')) {
  fail('Sandbox verification ingestion is missing required CI configuration.');
} else {
  let bundle;
  try {
    bundle = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch {
    fail('The redacted verification support bundle could not be read.');
  }

  const run = bundle?.format === 'auditsphere-operational-support-v1'
    && Array.isArray(bundle.verificationRuns)
    && bundle.verificationRuns.length === 1
    ? bundle.verificationRuns[0] : null;
  const validRun = run
    && /^[a-f0-9]{7,64}$/i.test(run.sourceCommit ?? '')
    && Number.isSafeInteger(run.schemaVersion) && run.schemaVersion > 0
    && run.environment === 'CI'
    && typeof run.startedAt === 'string'
    && (run.status === 'NOT_RUN' ? run.completedAt === null
      : (run.status === 'PASSED' || run.status === 'FAILED') && typeof run.completedAt === 'string');
  if (!validRun) {
    fail('The support bundle does not contain one valid, redacted CI verification record.');
  } else {
    let target;
    try {
      const origin = new URL(apiBase);
      if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash
        || origin.username || origin.password
        || (origin.hostname !== 'workers.dev' && !origin.hostname.endsWith('.workers.dev'))) throw new Error('url');
      target = new URL('/api/internal/verification-runs', origin);
    } catch {
      fail('The sandbox verification API URL must be an HTTPS Cloudflare workers.dev origin.');
    }

    if (target) {
      const payload = {
        runId: `GHA-${workflowRunId}-${workflowAttempt}`,
        sourceCommit: run.sourceCommit.toLowerCase(),
        schemaVersion: run.schemaVersion,
        environment: 'CI',
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        status: run.status
      };
      try {
        const response = await fetch(target, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000)
        });
        let result = null;
        try { result = await response.json(); } catch { /* Do not print a raw error body. */ }
        if (!response.ok || result?.accepted !== true || result.runId !== payload.runId) {
          const code = typeof result?.code === 'string' && /^[A-Z_]{1,64}$/.test(result.code)
            ? result.code : `HTTP_${response.status}`;
          throw new Error(code);
        }
        process.stdout.write('Redacted verification metadata was accepted by the Cloudflare sandbox.\n');
      } catch (error) {
        const detail = error instanceof Error && /^[A-Z_0-9]{1,64}$/.test(error.message)
          ? ` (${error.message})` : '';
        fail(`Sandbox verification metadata ingestion failed${detail}.`);
      }
    }
  }
}
