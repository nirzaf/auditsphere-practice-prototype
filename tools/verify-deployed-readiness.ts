import { APPLICATION_SCHEMA_VERSION } from '../worker/versions.js';

const endpoint = 'https://auditsphere-visual-prototype.quadrate-lk.workers.dev/api/health/ready';
const maxAttempts = 12;
const deadline = Date.now() + 90_000;
let lastFailure = 'no response received';
let verified = false;

for (let attempt = 1; attempt <= maxAttempts && Date.now() < deadline; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(10_000, Math.max(1_000, deadline - Date.now())))
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      lastFailure = `readiness endpoint returned non-JSON content (HTTP ${response.status})`;
      payload = undefined;
    }

    if (typeof payload === 'object' && payload !== null) {
      const result = payload as {
        status?: unknown;
        schemaVersion?: unknown;
        dependencyCodes?: unknown;
      };
      if (
        response.ok &&
        result.status === 'ready' &&
        result.schemaVersion === APPLICATION_SCHEMA_VERSION &&
        Array.isArray(result.dependencyCodes) &&
        result.dependencyCodes.length === 0
      ) {
        console.log(`Worker readiness verified: status=ready schemaVersion=${APPLICATION_SCHEMA_VERSION} dependencyCodes=0`);
        verified = true;
        break;
      }

      const codes = Array.isArray(result.dependencyCodes)
        ? result.dependencyCodes.filter((code): code is string => typeof code === 'string')
        : [];
      lastFailure = `HTTP ${response.status}; status=${String(result.status ?? 'missing')}; schemaVersion=${String(result.schemaVersion ?? 'missing')}; dependencyCodes=${codes.join(',') || 'missing-or-empty'}`;
    }
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : 'request failed';
  }

  if (attempt < maxAttempts && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, Math.min(5_000, deadline - Date.now())));
  }
}

if (!verified) {
  console.error(`Worker readiness verification failed after bounded retries: ${lastFailure}`);
  process.exitCode = 1;
}
