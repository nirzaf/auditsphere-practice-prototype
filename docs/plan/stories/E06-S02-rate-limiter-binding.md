# E06-S02 — Rate limiter binding and auth-endpoint limits

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S02 | E06 | Security | P0 | S | E02-S01 | NFR SEC-06 |

## Intent
`enforceRateLimit` (`worker/index.ts:141`) silently returns when `env.RATE_LIMITER` is undefined, and no binding is configured. Bind it and apply limits to auth and public endpoints.

## Read first
- `worker/index.ts` `enforceRateLimit`, `clientKey`; `worker/env.ts` `RateLimiterBinding`
- Current Cloudflare Workers Rate Limiting binding docs (fetch; confirm `wrangler.jsonc` key name and period options)

## Acceptance criteria
1. Each env in `wrangler.jsonc` declares the rate-limiting binding(s) required: one general (`workspace.command` etc., existing buckets) and one strict for auth (`auth.login`, `auth.reset`, `public.leads`). Names/limits documented in `docs/ops/environments.md`.
2. Limits: login 10/min per IP hash + 5/min per normalised email; reset request 5/min per IP; public leads 5/hour per IP; existing command bucket unchanged.
3. In `ENVIRONMENT=production`, a missing binding makes readiness fail (E02-S04) **and** auth endpoints return `503 UNAVAILABLE` rather than running unlimited.
4. Unit tests with a stub limiter for each bucket, including the 503 fail-closed path.

## Verify with
```bash
npx tsx --test tests/unit/rateLimits.test.ts tests/unit/wranglerConfig.test.ts && npm run test:unit
```
