# E02-S04 — Fail-closed production readiness checks

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E02-S04 | E02 | Feature | P0 | S | E02-S01 | NFR SEC-06, REL-01; api-delta §5 |

## Intent
`GET /api/health/ready` must fail in production when a security-critical binding or configuration is missing, so CI's post-deploy readiness step blocks a misconfigured release.

## Read first
- `worker/index.ts` `handleHealthReady`, `worker/integrations/status.ts`, `worker/env.ts`
- `docs/contracts/api-delta.md` §5

## Current state (verified)
`enforceRateLimit` returns silently when `env.RATE_LIMITER` is undefined; no `RATE_LIMITER` binding exists in `wrangler.jsonc`.

## Implementation progress — 2026-10-08
- `/api/health/ready` now includes machine-readable readiness checks for environment, rate limiter, email provider, Entra OIDC settings, Turnstile, and SharePoint. Missing SharePoint reports `NOT_CONFIGURED` and does not block readiness.
- Staging and production fail closed on missing rate limiting or a missing/unready `EMAIL_PROVIDER`. Production also fails for missing Entra OIDC settings or Turnstile; staging reports those checks without failing. With no `ENVIRONMENT` value, local behavior remains compatible.
- Verification ingestion now uses the separate `VERIFICATION_INGEST_ENABLED=true` flag and remains disabled in production.
- `tests/unit/workerReadiness.test.ts` covers local, staging, and production policy, including each production OIDC/Turnstile omission. CI's existing post-deploy curl uses `--fail`, so HTTP 503 fails the job.
- Status: **Worker policy implementation complete; deployment configuration and CI verification pending E02-S01 environment setup**. OIDC discovery health remains pending E03-S02.

## Acceptance criteria
1. `ENVIRONMENT` (already declared optional in `worker/env.ts`; today only `worker/verificationIngest.ts:68` reads it, expecting `verification-sandbox`) is set per env in `wrangler.jsonc` to `staging` / `production`; absent = `local`. If the verification-ingest feature is kept (removal-guideline §3), it must check a separate flag (`VERIFICATION_INGEST_ENABLED=true`) instead of overloading `ENVIRONMENT`.
2. When `ENVIRONMENT === 'production'`, readiness returns `503` with a machine-readable list if any of: `RATE_LIMITER` unbound; `EMAIL_PROVIDER` unbound or provider readiness ≠ `READY`; (after E03-S02) OIDC configuration missing; (after E04-S03) Turnstile secret missing. In `staging`, the same items are reported but only `RATE_LIMITER` and `EMAIL_PROVIDER` fail readiness.
3. SharePoint absent reports `NOT_CONFIGURED` and never fails readiness.
4. Unit tests cover each missing item per environment.
5. CI post-deploy readiness step already exists; confirm it treats `503` as failure.

## Verify with
```bash
npx tsx --test tests/unit/integrationStatus.test.ts tests/unit/workerObservability.test.ts
```
