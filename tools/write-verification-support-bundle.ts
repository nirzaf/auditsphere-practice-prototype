import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { APPLICATION_SCHEMA_VERSION } from '../worker/versions.js';
import { buildVerificationSupportBundle } from '../worker/verificationSupportBundle.js';

const outcomes = (process.env.AUDITSPHERE_VERIFICATION_GATES ?? '').split(',').filter(Boolean);
const status = outcomes.length === 0 || outcomes.every(outcome => outcome === 'skipped')
  ? 'NOT_RUN'
  : outcomes.every(outcome => outcome === 'success') ? 'PASSED' : 'FAILED';
const generatedAt = new Date().toISOString();
const outputPath = resolve(process.argv[2] ?? 'verification-support-bundle.json');

const bundle = buildVerificationSupportBundle({
  generatedAt,
  applicationSchemaVersion: APPLICATION_SCHEMA_VERSION,
  installedSchemaVersion: null,
  readiness: 'not_checked',
  dependencyCodes: [],
  verificationRuns: [{
    source_commit: process.env.GITHUB_SHA,
    schema_version: APPLICATION_SCHEMA_VERSION,
    environment: 'CI',
    started_at: process.env.AUDITSPHERE_VERIFICATION_STARTED_AT,
    completed_at: status === 'NOT_RUN' ? null : generatedAt,
    status
  }]
});
if (bundle.verificationRuns.length !== 1) {
  throw new Error('CI verification metadata is incomplete; no support bundle was written.');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(`Wrote redacted verification metadata to ${outputPath}\n`);
