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
