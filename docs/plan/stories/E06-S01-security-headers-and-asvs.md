# E06-S01 — Security headers (CSP/HSTS) and ASVS L2 self-assessment

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S01 | E06 Hardening | Security | P0 | M | M3 | NFR SEC-09, SEC-13 |

## Intent
Harden the app shell against XSS/clickjacking and record a structured security self-assessment before real data.

## Read first
- `worker/index.ts` static-asset branch (sets only `X-Content-Type-Options`, `Referrer-Policy`)
- `worker/http.ts` `baseHeaders` (API responses), `worker/business.ts:2605` (file download CSP `default-src 'none'; sandbox` — keep)
- `index.html`, Vite build output in `dist/` (inline scripts/styles?)

## Acceptance criteria
1. Asset responses carry: `Content-Security-Policy` (start from NFR SEC-09; remove `'unsafe-inline'` for styles if the build allows — measure), `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production only), `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, existing two headers kept.
2. API JSON responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` (verify `baseHeaders`; add if missing).
3. Unit test asserts headers on `/`, a hashed asset, and an API route.
4. E2E run with CDP `Log`/`Runtime` listening asserts zero CSP violation reports across all panels and the auth pages.
5. `docs/quality/asvs-l2.md`: OWASP ASVS 4.0.3 L2 checklist for chapters V2, V3, V4, V5, V7 (logging), V8, V12 (files), V13 (API) — each item Pass / Fail / N/A with evidence pointer (test name or file). Zero Fail at completion, or each Fail has a linked follow-up story approved by the owner.

## Verify with
```bash
npx tsx --test tests/unit/securityHeaders.test.ts && npm run test:e2e
```
