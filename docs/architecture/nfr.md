# Non-Functional Requirements

> **Scope authority:** authentication/session requirements in this legacy NFR baseline conflict with the user-provided real-implementation epic. The epic explicitly selects no application authentication and freely selected personas. SEC-01–05, SEC-08, SEC-11–12, login performance, login-abuse monitoring, and login accessibility rows below are historical proposals, not requirements for this implementation. The public Worker must remain synthetic-data-only until a separately verified trusted perimeter is in place.

Every row is measurable. **P0** = go-live blocker, **P1** = required before first real client engagement closes, **P2** = within 90 days of go-live. "Verify" = the check that proves it; it must be automated unless marked *manual*.

## 1. Security & access

| ID | P | Requirement | Verify |
|---|---|---|---|
| SEC-01 | P0 | No application authentication is provided. Actor/persona/workspace context is caller supplied; it does not establish identity or confidentiality. The public Worker is synthetic-data-only until a trusted perimeter is verified. | Deployment/config review confirms restricted perimeter or synthetic-only data policy; see `docs/ops/environments.md` |
| SEC-02 | — | Session-derived actor is out of scope. Caller-selected actor/persona is workflow context, not an access control. | Retain workflow guard tests only |
| SEC-03 | — | Entra OIDC sign-in is out of scope. | No login routes or OIDC secrets in runtime config |
| SEC-04 | — | Application passwords, temporary credentials and password reset are out of scope. | No password routes or credential behavior in runtime |
| SEC-05 | — | Application session cookies and session lifecycle are out of scope. | No application session cookie in requests |
| SEC-06 | P0 | General API requests are rate limited; the public lead endpoint also enforces a durable five-per-hour HMAC-keyed D1 limit. | Unit tests and Worker configuration/readiness tests |
| SEC-07 | P0 | Every state-changing request passes `assertSameOrigin`. | Existing behaviour; route-inventory test extends to new routes |
| SEC-08 | P0 | Workflow persona checks (`SELF_APPROVAL`, `SELF_REVIEW_BLOCKED`, Partner workflow steps, RED Manager execution) remain enforced, but are not genuine identity or segregation-of-duties controls because personas are self-selected. | Existing workflow guard tests; report the identity limitation |
| SEC-09 | P0 | App-shell responses carry `Content-Security-Policy` (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`), `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY`, `Permissions-Policy` minimal. Inline styles are not permitted. | Unit test on asset response headers; manual check in browser console for CSP violations on every panel |
| SEC-10 | P0 | No secrets in the repository. `wrangler.jsonc` contains only non-secret vars; secrets via `wrangler secret put` / CI secrets. | `git grep` secret-pattern check in CI (gitleaks or a regex script — no new dependency without approval) |
| SEC-11 | — | Assignment metadata supports workflow planning; it does not provide authenticated access scoping. | No identity assurance claimed |
| SEC-12 | — | App-authentication events and admin-account lifecycle are out of scope. | Not applicable |
| SEC-13 | P1 | Record a security assessment for applicable validation, data protection, security-header and perimeter controls; exclude authentication/session controls and retain the no-auth limitation. | Manual checklist in `docs/quality/asvs-l2.md` |

## 2. Performance & capacity

Workload model: ≤ 40 staff, ≤ 300 active client contacts, ≤ 400 engagements/year, ≤ 50 concurrent workflow users (no app-auth sessions).

| ID | P | Requirement | Verify |
|---|---|---|---|
| PERF-01 | P1 | Read endpoints (`GET …/*-workspace`, `…/financial-statements`, `…/portal`) p95 < 400 ms, p99 < 1 s at 50 concurrent workflow users on an isolated environment. | Extend `npm run benchmark:local-api` workload to 50 users |
| PERF-02 | P1 | Command round-trip p95 < 800 ms at 50 concurrent workflow users (excluding async outbox work). | same |
| PERF-03 | P1 | Outbox document generation (EL, invoice, report bundle) completes p95 < 2 min from command commit. | Outbox metrics log (`outboxSnapshot`) over a 1-day staging soak |
| PERF-04 | P1 | TB import of 10,000 rows reaches `READY` < 3 min. | Staging run with synthetic TB |
| PERF-05 | — | Login performance is out of scope because application login/password authentication is not implemented. | Not applicable |
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
| CMP-03 | P1 | Personal data inventory (contacts, staff and self-selected workflow attribution) and processing basis documented per Qatar Law No. 13 of 2016 (PDPPL) and, where applicable, QFC Data Protection Regulations. | SP-04 output reviewed by firm |
| CMP-04 | P1 | Data location for D1/R2 chosen per SP-04 (location hint / jurisdiction) before production resources are created. | E02-S01 config review |
| CMP-05 | P0 | No confidential client data on the unrestricted public Worker. Real-record use requires documented approval and a verified trusted access perimeter. | Go-live checklist and perimeter evidence |

## 5. Observability

| ID | P | Requirement | Verify |
|---|---|---|---|
| OBS-01 | P0 | Every API response logs one structured line (`workspace.api.request`) with requestId, route pattern, status, duration; never tokens, file bytes, or full emails (hash or domain only). | Existing request-log tests |
| OBS-02 | P1 | Alerts for 5xx rate > 2 % over 10 min; outbox failures (REL-04); archive overdue (REL-05); readiness `FAILED`. | Staging fire-drill |
| OBS-03 | P2 | Weekly operational report for outbox backlog and archive status available to operators. | Out of scope unless requested — listed for completeness |

## 6. Usability, accessibility, i18n

| ID | P | Requirement | Verify |
|---|---|---|---|
| UX-01 | P1 | WCAG 2.2 AA on workspace setup, portal, and each module panel: zero critical/serious axe violations. There are no login/password screens. | axe-core run via existing CDP harness (inject script from file; no npm dependency) |
| UX-02 | P0 | Responsive at 390×844 and 1440×900 (existing E2E viewports) for all new screens. | E2E screenshots |
| UX-03 | P0 | English UI; QAR amounts formatted `QAR 1,234.56`; dates `DD Mon YYYY` in Asia/Qatar. Arabic/RTL out of scope. | Existing formatters reused |
| UX-04 | P1 | Supported browsers: current and previous major Chrome, Edge, Safari, Firefox. | *manual* smoke on staging |

## 7. Maintainability

| ID | P | Requirement | Verify |
|---|---|---|---|
| MNT-01 | P0 | Exact dependency versions in `package.json` (no `^`/`~`). | Config test |
| MNT-02 | P0 | `npm run lint`, `npm run cloud:typecheck`, `npm run test:unit`, `npm run build`, `npm run test:e2e` all green on every PR (existing CI). | CI |
| MNT-03 | P1 | No source file added by this backlog exceeds 800 lines. | Line-count check in CI script |
