# Non-Functional Requirements

Every row is measurable. **P0** = go-live blocker, **P1** = required before first real client engagement closes, **P2** = within 90 days of go-live. "Verify" = the check that proves it; it must be automated unless marked *manual*.

## 1. Security & access

| ID | P | Requirement | Verify |
|---|---|---|---|
| SEC-01 | P0 | 100 % of `/api/workspaces/**` routes reject requests without a valid `auth_sessions` row (`401 UNAUTHENTICATED`). Exempt list is exactly: `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/integrations/status`, `/api/internal/verification-runs` (token-auth), `/api/archive-download/:token` (ticket-auth), `/api/auth/*`, `/api/public/leads`. | `tests/unit/businessAuthSession.test.ts` iterates the workspace route inventory and asserts `401 UNAUTHENTICATED` without a cookie. |
| SEC-02 | P0 | The effective actor is never taken from a request header or body. | `tests/unit/businessAuthSession.test.ts`: a real Preparer session forging the actual Partner profile through either actor headers or `envelope.actor` receives `403`, with no command receipt or audit-event change. |
| SEC-03 | P0 | Staff authenticate via Entra ID OIDC (code + PKCE, `state`, `nonce`, issuer/audience/expiry/signature validated against JWKS). | Unit tests with a locally signed JWKS fixture: bad nonce, wrong `aud`, expired, wrong `iss`, unknown `oid` → `401` |
| SEC-04 | P0 | Client passwords hashed per ADR-0005 (PBKDF2-SHA256 ≥ 600k iterations or stronger); plaintext never logged or persisted; temp password ≥ 16 random chars from a CSPRNG. | Unit test on hash format; log-scrape test asserting no password in `console.*` output |
| SEC-05 | P0 | Session cookie `__Host-as_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`; idle timeout 30 min staff / 15 min client; absolute 12 h; rotation on login and on password change. | Cookie attribute assertions in unit tests; expiry tests with injected clock |
| SEC-06 | P0 | Account lockout after 5 failed client logins (15 min → doubling to 24 h). Login and reset endpoints rate-limited to 10/min per IP hash and 5/min per email. | Unit tests; `RATE_LIMITER` binding present in prod config (config test) |
| SEC-07 | P0 | Every state-changing request passes `assertSameOrigin`. | Existing behaviour; route-inventory test extends to new routes |
| SEC-08 | P0 | Segregation of duties remains server-enforced (`SELF_APPROVAL`, `SELF_REVIEW_BLOCKED`, Partner-only opinion/SRM clearance, RED Manager execution) and now keyed to authenticated users. | Existing tests re-run through session helper (E03-S03) |
| SEC-09 | P0 | App-shell responses carry `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` only if measured necessary; `img-src 'self' data: blob:`; `connect-src 'self'`; `frame-ancestors 'none'; base-uri 'none'; form-action 'self'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY`, `Permissions-Policy` minimal. | Unit test on asset response headers; manual check in browser console for CSP violations on every panel |
| SEC-10 | P0 | No secrets in the repository. `wrangler.jsonc` contains only non-secret vars; secrets via `wrangler secret put` / CI secrets. | `git grep` secret-pattern check in CI (gitleaks or a regex script — no new dependency without approval) |
| SEC-11 | P1 | Staff access scope per decision D3 (default: Partners firm-wide; others only engagements with an active `engagement_assignments` row). | Tests per persona/assignment matrix (E03-S07) |
| SEC-12 | P1 | `auth_events` retained ≥ 2 years; all admin actions in `audit_events`. | Retention config check |
| SEC-13 | P1 | OWASP ASVS 4.0.3 Level 2 chapters V2 (Authentication), V3 (Session), V4 (Access Control), V5 (Validation), V8 (Data Protection) self-assessment recorded with zero open "fail" items. | *manual* checklist in `docs/quality/asvs-l2.md` (E06-S01) |

## 2. Performance & capacity

Workload model: ≤ 40 staff, ≤ 300 active client contacts, ≤ 400 engagements/year, ≤ 50 concurrent sessions.

| ID | P | Requirement | Verify |
|---|---|---|---|
| PERF-01 | P1 | Read endpoints (`GET …/*-workspace`, `…/financial-statements`, `…/portal`) p95 < 400 ms, p99 < 1 s at 50 concurrent sessions on staging. | `tools/benchmark-local-worker-20-users.ts` extended to authenticated sessions and 50 users (E06-S05) |
| PERF-02 | P1 | Command round-trip p95 < 800 ms at 50 concurrent sessions (excluding async outbox work). | same |
| PERF-03 | P1 | Outbox document generation (EL, invoice, report bundle) completes p95 < 2 min from command commit. | Outbox metrics log (`outboxSnapshot`) over a 1-day staging soak |
| PERF-04 | P1 | TB import of 10,000 rows reaches `READY` < 3 min. | Staging run with synthetic TB |
| PERF-05 | P1 | Login (password) p95 < 1.5 s including hashing; hashing CPU < 50 % of the Worker CPU limit configured. | Benchmark in SP-01 |
| CAP-01 | P1 | Projected D1 size after 5 years of the workload model < 50 % of the D1 per-database limit current at go-live. | SP-02 report with measured bytes/engagement |
| CAP-02 | P0 | No count-based gates on clients, engagements, files or workpapers (spec §1.1). | Existing; the legacy `demo_creation_limits` table is removed by migration 0045 |

## 3. Reliability, backup & recovery

| ID | P | Requirement | Verify |
|---|---|---|---|
| REL-01 | P0 | Separate staging and production Workers, D1 databases, R2 buckets and email providers; no shared resources. | `wrangler.jsonc` `env.staging` / `env.production` config test |
| REL-02 | P0 | RPO ≤ 24 h, RTO ≤ 8 h for D1; R2 objects never deleted by the app (existing triggers + retention rules). | Restore drill on staging recorded in `docs/ops/restore-drill.md` (E02-S03) |
| REL-03 | P1 | Availability ≥ 99.5 % monthly during 07:00–20:00 Asia/Qatar, Sun–Thu. | External uptime probe on `/api/health/live` |
| REL-04 | P1 | Outbox jobs: bounded retries with backoff; a job failing ≥ 5 attempts raises an alert. | Alert rule test in staging (E06-S03) |
| REL-05 | P0 | Archive overdue (`archive_due_at` passed, not sealed) raises an alert within 15 min. | Existing `workspace.archive.overdue` log + alert rule (E06-S03) |

## 4. Compliance & data handling

| ID | P | Requirement | Verify |
|---|---|---|---|
| CMP-01 | P0 | ISA 230: engagement read-only 60 days after signature or earlier Partner lock; sealed archive bytes verified by SHA-256 on export. | Existing tests + staging large-archive acceptance (E05-S05) |
| CMP-02 | P0 | Retention term per engagement from `retention_policies`; firm confirms the default term in writing before go-live (Qatar commercial record-keeping and any QFC obligations). | *manual* sign-off recorded in `docs/ops/go-live-checklist.md` |
| CMP-03 | P1 | Personal data inventory (contacts, staff, users, auth events) and processing basis documented per Qatar Law No. 13 of 2016 (PDPPL) and, where applicable, QFC Data Protection Regulations. | SP-04 output reviewed by firm |
| CMP-04 | P1 | Data location for D1/R2 chosen per SP-04 (location hint / jurisdiction) before production resources are created. | E02-S01 config review |
| CMP-05 | P0 | Real client data only in production after SEC-01…SEC-10 pass. | Go-live checklist gate |

## 5. Observability

| ID | P | Requirement | Verify |
|---|---|---|---|
| OBS-01 | P0 | Every API response logs one structured line (`workspace.api.request`) with requestId, route pattern, status, duration; never tokens, passwords, file bytes, or full emails (hash or domain only). | Existing + log-scrape test extended to auth routes |
| OBS-02 | P1 | Alerts (email to firm IT) for: 5xx rate > 2 % over 10 min; outbox failures (REL-04); archive overdue (REL-05); `auth_events` LOGIN_FAILED > 50/10 min; readiness `FAILED`. | Staging fire-drill (E06-S03) |
| OBS-03 | P2 | Weekly operational report (outbox backlog, sessions, failed logins) available to Partners. | Out of scope unless requested — listed for completeness |

## 6. Usability, accessibility, i18n

| ID | P | Requirement | Verify |
|---|---|---|---|
| UX-01 | P1 | WCAG 2.2 AA on login, password change/reset, portal, and each module panel: zero critical/serious axe violations. | axe-core run via existing CDP harness (inject script from file; no npm dependency) (E06-S04) |
| UX-02 | P0 | Responsive at 390×844 and 1440×900 (existing E2E viewports) for all new screens. | E2E screenshots |
| UX-03 | P0 | English UI; QAR amounts formatted `QAR 1,234.56`; dates `DD Mon YYYY` in Asia/Qatar. Arabic/RTL out of scope. | Existing formatters reused |
| UX-04 | P1 | Supported browsers: current and previous major Chrome, Edge, Safari, Firefox. | *manual* smoke on staging |

## 7. Maintainability

| ID | P | Requirement | Verify |
|---|---|---|---|
| MNT-01 | P0 | Exact dependency versions in `package.json` (no `^`/`~`). | Config test |
| MNT-02 | P0 | `npm run lint`, `npm run cloud:typecheck`, `npm run test:unit`, `npm run build`, `npm run test:e2e` all green on every PR (existing CI). | CI |
| MNT-03 | P1 | No source file added by this backlog exceeds 800 lines; new auth code lives in `worker/auth/`. | Line-count check in CI script |
