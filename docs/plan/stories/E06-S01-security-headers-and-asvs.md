# E06-S01 — Security headers (CSP/HSTS) and ASVS L2 self-assessment

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S01 | E06 Hardening | Security | P0 | M | M3 | NFR SEC-09, SEC-13 |

## Intent
Harden the app shell against XSS/clickjacking and record a structured security self-assessment before real data.

## Implementation progress
- App-shell and asset responses now set the CSP, production-only HSTS, frame denial, COOP, and minimal Permissions-Policy. The reporting paragraph's `whiteSpace` style now uses a stylesheet class, so `style-src` is restricted to `'self'`; blob frames remain allowed for the hash-verified report preview.
- API response finalization enforces `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`, including directly constructed auth responses.
- `tests/unit/securityHeaders.test.ts` covers `/`, a hashed asset URL, production-only HSTS, and `/api/health/live`.
- Verification — 2026-10-09: focused security-header tests pass (2/2), `npm run build` passes, and `npm run cloud:typecheck` passes. There are no remaining JSX inline-style props.
- The HTML meta CSP now also uses style-src self, matching the Worker response header. docs/quality/asvs-l2.md inventories all 126 Level 2 controls in the requested chapters: 28 Pass, 49 Fail/open, and 49 N/A for the explicitly scoped no-auth profile. No separate owner-approved follow-up stories exist for the open findings.
- Remaining acceptance: E2E CSP-violation sweep across business panels and retained public surfaces, resolve or obtain owner-approved follow-up stories for all 49 open ASVS findings, and complete operational evidence review. This story is not complete. A local browser sweep remains blocked because the local Wrangler runtime exits with Windows CreateDirectory: Access is denied for miniflare-email-store; the production Worker is not an approved UI test target. Tests were not run during this update.

## Read first
- `worker/index.ts` static-asset branch (sets only `X-Content-Type-Options`, `Referrer-Policy`)
- `worker/http.ts` `baseHeaders` (API responses), `worker/business.ts:2605` (file download CSP `default-src 'none'; sandbox` — keep)
- `index.html`, Vite build output in `dist/` (inline scripts/styles?)

## Acceptance criteria
1. Asset responses carry: `Content-Security-Policy` (start from NFR SEC-09; remove `'unsafe-inline'` for styles if the build allows — measure), `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production only), `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, existing two headers kept.
2. API JSON responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` (verify `baseHeaders`; add if missing).
3. Unit test asserts headers on `/`, a hashed asset, and an API route.
4. E2E run with CDP `Log`/`Runtime` listening asserts zero CSP violation reports across all active business panels and retained public surfaces. Authentication pages are N/A because the authorized no-auth epic excludes them.
5. `docs/quality/asvs-l2.md`: OWASP ASVS 4.0.3 L2 checklist for chapters V2, V3, V4, V5, V7 (logging), V8, V12 (files), V13 (API) — each item Pass / Fail / N/A with evidence pointer (test name or file). Zero Fail at completion, or each Fail has a linked follow-up story approved by the owner.

## Verify with
```bash
npx tsx --test tests/unit/securityHeaders.test.ts && npm run test:e2e
```
