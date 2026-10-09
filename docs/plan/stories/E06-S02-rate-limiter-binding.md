# E06-S02 — General API and public intake rate limiting

> **Scope correction:** authentication endpoints, login/reset buckets and auth-specific readiness are excluded by the current real-implementation epic. Only the general API Cloudflare binding and public-lead abuse limits are in scope.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S02 | E06 | Security | P0 | S | E02-S01 | NFR SEC-06 |

## Intent
The Worker uses the general Cloudflare rate-limit binding for its API buckets. Public web leads also use a durable, HMAC-keyed D1 hourly limit so the public form is bounded across Worker locations.

## Read first
- `worker/index.ts` `enforceRateLimit`, `clientKey`; `worker/env.ts` `RateLimiterBinding`
- Current Cloudflare Workers Rate Limiting binding docs (fetch; confirm `wrangler.jsonc` key name and period options)

## Acceptance criteria
1. Root `wrangler.jsonc` declares one general rate-limiting binding and documents its keys/limit in `docs/ops/environments.md`.
2. Public leads apply the durable five-per-hour HMAC-keyed D1 limit and fail closed if its key or database is unavailable.
3. Production readiness fails when the required general binding is missing; local development can run without it for offline tests.
4. Unit tests cover configured/missing general binding and public lead limit behavior.

## Implementation progress — 2026-10-09
- Root production config declares the general Cloudflare Worker Rate Limiting binding; `dev` and `preview` override only `ENVIRONMENT=local`.
- Public intake uses its durable five-per-hour D1 window with an HMAC-digested IP key.
- Production fails readiness on a missing general binding; local development remains unbound-compatible.
- Focused limiter, public-intake, readiness and migration tests pass (14 tests); Worker typecheck passes.
- Runtime deployment and Cloudflare-hosted counters remain pending until the approved environment is deployed.

## Verify with
```bash
npx tsx --test tests/unit/rateLimits.test.ts tests/unit/wranglerConfig.test.ts && npm run test:unit
```
