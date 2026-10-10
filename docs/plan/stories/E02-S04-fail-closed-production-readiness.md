# E02-S04 — Fail-closed production readiness checks

> **Scope superseded:** historical E02 acceptance text below assumes Entra OIDC and auth-specific limiters. The current real-implementation epic explicitly excludes application authentication. Runtime readiness must not require OIDC; see `docs/ops/environments.md` for the current trust boundary and rate-limit contract.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E02-S04 | E02 | Feature | P0 | S | E02-S01 | NFR SEC-06, REL-01; api-delta §5 |

## Intent
`GET /api/health/ready` must fail in production when a security-critical binding or configuration is missing, so CI's post-deploy readiness step blocks a misconfigured release.

## Read first
- `worker/index.ts` `handleHealthReady`, `worker/integrations/status.ts`, `worker/env.ts`
- `docs/contracts/api-delta.md` §5

## Current state (verified)
The root `wrangler.jsonc` is the production app Worker config and declares the three limiter bindings. The `dev` and `preview` npm scripts explicitly override `ENVIRONMENT=local`. No named staging app Worker environment is present yet; that remains in E02-S01.

## Implementation progress — 2026-10-08
- `/api/health/ready` reports environment, general rate limiter, email provider, Turnstile, public-lead configuration, SharePoint, storage, and schema health. Missing SharePoint reports `NOT_CONFIGURED` and does not block readiness.
- The current epic excludes Entra OIDC and app-auth readiness. Production fails closed on required general rate limiting, email provider, Turnstile, public-lead settings, D1/R2, and schema; there is no named staging app Worker config.
- Verification ingestion now uses the separate `VERIFICATION_INGEST_ENABLED=true` flag and remains disabled in production.
- `tests/unit/workerReadiness.test.ts` covers local, staging, and production policy, including each production OIDC/Turnstile omission. CI's existing post-deploy curl uses `--fail`, so HTTP 503 fails the job.
- Status: **Worker policy implementation complete; deployment configuration and CI verification pending E02-S01 environment setup**. OIDC discovery health remains pending E03-S02.

## Implementation progress — 2026-10-09
- Readiness now also reports public-lead IP hash key, default country, optional notification and allowed-origin settings. Production/staging fail when the required IP hash key (32+ characters) or default country is absent; production also requires Turnstile and Entra OIDC.
- Focused readiness tests cover local, staging and production with missing and configured values; Worker typecheck passes.
- A production root config is present, but a named staging app Worker and deployed readiness probe remain pending E02-S01 and the authorized deployment gate.

## Acceptance criteria
1. `ENVIRONMENT` (already declared optional in `worker/env.ts`; today only `worker/verificationIngest.ts:68` reads it, expecting `verification-sandbox`) is set per env in `wrangler.jsonc` to `staging` / `production`; absent = `local`. If the verification-ingest feature is kept (removal-guideline §3), it must check a separate flag (`VERIFICATION_INGEST_ENABLED=true`) instead of overloading `ENVIRONMENT`.
2. In production, readiness returns `503` with machine-readable dependency codes for missing general limiter binding; `EMAIL_PROVIDER` unbound or not ready; missing Turnstile; missing public-lead HMAC key or default country; and unavailable D1, R2 or schema. No auth/OIDC readiness check is required. Named staging app readiness is not claimed until that environment exists.
3. SharePoint absent reports `NOT_CONFIGURED` and never fails readiness.
4. Unit tests cover each missing item per environment.
5. CI post-deploy readiness step already exists; confirm it treats `503` as failure.

## Verify with
```bash
npx tsx --test tests/unit/integrationStatus.test.ts tests/unit/workerObservability.test.ts
```

## Implementation progress — 2026-10-10

**Readiness policy and CI guard are implemented; live post-deploy acceptance is
pending deployment.** `/api/health/ready` defaults an absent `ENVIRONMENT` to
`local`. Staging and production require the general rate-limit binding, a ready
email provider, public-lead key and country; production also requires Turnstile
and its allowed hostname. D1, schema-version and R2 failures always degrade
readiness with machine-readable codes. SharePoint remains optional and reports
`NOT_CONFIGURED` without blocking readiness. The current product excludes app
authentication, so readiness does not require OIDC.

The post-deploy `tools/verify-deployed-readiness.ts` accepts only a 2xx HTTP
response whose JSON says `ready`, has the exact application schema version and
an empty dependency-code list. HTTP 503 and every other failure retry a
bounded number of times, then set a nonzero process exit code; both staging and
production workflow jobs run that checker through their configured Access
service-token headers.

**Verification — 2026-10-10:** `tests/unit/workerReadiness.test.ts` passed
(4/4), including missing D1, absent/mismatched schema and missing R2 across
local, staging and production. The story's specified
`integrationStatus.test.ts` and `workerObservability.test.ts` passed (6/6), as
did `npm run cloud:typecheck`. Existing readiness tests also cover missing
limiting, email, Turnstile, public-lead settings, and successful configuration.

The staging and production D1 IDs remain placeholders and the readiness URL,
Access credentials, worker secrets, and deployed build are not available as
verified environment evidence. No remote deployment or readiness probe was
performed. Therefore this story's **runtime policy code is complete**, while
deployed staging/production readiness remains unverified under E02-S01's
provisioning and trusted-boundary gates.
