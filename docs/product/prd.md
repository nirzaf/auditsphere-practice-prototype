# PRD — AuditSphere: Production Completion of STE Audit Management Tool v2.1

| Field | Value |
|---|---|
| Source specification | *STE Audit Management Tool — Functional Requirements & End-to-End System Workflow Specification*, v2.1 |
| Story decomposition of the spec | `reference/STE_Audit_Management_Tool_Detailed_User_Stories_v2.1.md` (IDs `US-M1-001` … `US-PBC-006`) |
| Repository | `nirzaf/auditsphere-practice-prototype`, branch `main` |
| Baseline audited | commit `54ec5a3` (2026-10-08) |
| Baseline verification (this audit) | `npx tsc --noEmit` ✅ · `npm run cloud:typecheck` ✅ · `npm run test:unit` → 631 tests, 630 pass, 0 fail, 1 skipped (opt-in 4 GiB archive stress) |
| Document scope | **Remaining work only.** Completed behaviour is listed so agents do not rebuild it. |

---

## 1. Problem

The repository already implements almost the entire STE v2.1 business workflow in a Cloudflare Worker + D1 + R2 "BUSINESS workspace" (≈190 tables, ≈620 integrity triggers, 44 migrations, ~140 typed commands, UI panels for all five modules and a client PBC portal).

It is **not production-usable** for one dominant reason and several secondary ones:

1. **No authentication.** Identity is self-asserted. Every business request carries `X-Actor-Id` / `X-Active-Persona` headers chosen in the browser (`worker/business.ts` → `resolveBusinessContext`). `GET /api/workspaces/:id/actor-profiles` lists every profile, including Partners, without any credential. Every segregation-of-duties control that already exists (`SELF_APPROVAL`, `SELF_REVIEW_BLOCKED`, Partner-only opinion, client isolation) is therefore only as strong as the honesty of the person at the keyboard.
2. **Client portal onboarding is incomplete.** The portal activates on advance payment, but no client credentials are issued, emailed, or force-reset (spec §4.1.5, `US-M1-012`).
3. **Prototype residue.** Three parallel implementations live in one repo: the real BUSINESS workspace, a legacy browser-store prototype kept for a test harness, and an unrelated Next.js/Prisma demo (`ste-audit/`). Plus large volumes of demo evidence, screenshots and pinned-to-another-repo process packs. This confuses AI agents and humans.
4. **Single, prototype-named environment.** One Worker (`auditsphere-visual-prototype`), one D1 (`steaudit-prototype-demo`), one R2 bucket, `workers_dev: true`, no staging.
5. **Live integrations unproven.** Email provider is deployed but no real delivery accepted; rate limiter binding absent (limiter silently no-ops); no CSP on the app shell.
6. **A short list of functional partials** (public web-form intake, manual WhatsApp dispatch record, large-archive acceptance) plus items to *verify* (workprogram acceptance matrix, consolidated client document centre) and two optional P2 conveniences (suggested milestone schedule, going-concern UI polish).

## 2. Target users (unchanged from spec §1.2)

| Persona | System persona | Staff grade(s) allowed (enforced server-side today) |
|---|---|---|
| Audit Associate / Junior | `PREPARER` | any grade |
| Audit Senior / Manager | `REVIEWER` | `MANAGER`, `SENIOR` |
| Engagement Partner | `APPROVER` | `PARTNER` |
| Client Coordinator / CFO / MD | `CLIENT` | n/a (linked to a client `contact`) |
| **New:** Firm administrator | (capability, not a persona) | granted to a `PARTNER` account; see `E03-S06` |

## 3. Core workflows

All five spec flows (§3.1–§3.5) and the 11-state lifecycle (§5) are implemented. The remaining work changes **who can perform them** (real identity), **how clients get in** (credentialed portal), and **where it runs** (production environment). No workflow is redesigned.

## 4. In scope (remaining)

| # | Capability | Spec trace | Epic |
|---|---|---|---|
| 1 | Remove legacy prototype, Next.js demo, demo-workspace API and artefact sprawl | §1.1 (single cohesive platform) | E01 |
| 2 | Staging + production environments, renamed resources, pinned dependencies, secrets, backups | NFR | E02 |
| 3 | Staff authentication (SSO), server sessions, session-derived actor, persona switching only within own grants | §1.2, US-PER-001…004, §15 of story doc | E03 |
| 4 | Client portal accounts: temporary credentials emailed to Audit Liaison route, mandatory password reset before upload, password reset, lockout | §4.1.5, US-M1-012, US-PBC-001 | E03 |
| 5 | Firm user administration (invite, grant/revoke personas, disable) and first-Partner bootstrap | §1.2 | E03 |
| 6 | Engagement-assignment scoping for staff (verify-first) | §1.2, ISA 220 | E03 |
| 7 | Production email delivery with recipients bound to verified contact routes | §3.1, §4.1.1, §4.1.5 | E04 |
| 8 | Manual WhatsApp dispatch record for proposals | §5 (`PROPOSAL_GENERATION` gate) | E04 |
| 9 | Public web-form lead intake | §4.1.1 | E04 |
| 10 | *(Optional, P2)* Suggested milestone schedule from period end — current manual milestones already meet US-M2-006 | §4.2.2 | E05 |
| 11 | Verify workprogram / ad-hoc procedure acceptance (US-M3-004/005); fix only reproduced gaps | §4.3.2 | E05 |
| 12 | *(P2)* Going-concern no-forecast UI polish | §4.3.2 | E05 |
| 13 | Consolidated client document centre (invoices, receipts, holding letters, deliverables) — verify, then close gaps | §1.2 CLIENT, US-PBC-004…006 | E05 |
| 14 | Large-archive and R2 retention-lock acceptance in staging | §4.4.3 | E05 |
| 15 | Bulk import of existing clients/contacts from the incumbent platform | §1.1 (eliminate per-file licensing → migration) | E05 (after SP-03) |
| 16 | Security headers, rate limiting, alerting, accessibility, load test, go-live runbook | NFR | E06 |

## 5. Out of scope (explicit non-goals — do not build)

- Any change to audit methodology, calculations, thresholds or state machine already implemented (materiality bands, TE/SAD, ±5 % rounding, RAG bands, sampling algorithms, 60-day lock, 50/50 billing, charge-out rates).
- WhatsApp Business API / automated WhatsApp messaging (ADR-0006).
- Online payments, bank feeds, payment gateways.
- Qualified electronic signatures / eSignature providers. The spec requires an embedded Partner signature PNG and firm seal — already implemented.
- SharePoint as system of record. R2 is canonical; SharePoint stays an optional mirror (ADR-0007). No new SharePoint features.
- Multi-firm SaaS tenancy, billing, self-serve sign-up (ADR-0008).
- Native mobile apps; Arabic/RTL localisation (unless the firm requests it — then raise a new story).
- AI features, semantic search, workflow automation beyond what the spec names.
- Tax, payroll, consolidation beyond what already exists.
- Rewriting the Worker into Next.js, Postgres, Prisma, or any other framework (ADR-0001, ADR-0002).

## 6. Success metrics (go-live gate)

| Metric | Target |
|---|---|
| Unauthenticated access to any `/api/workspaces/**` business route | 0 routes (automated route-inventory test) |
| Requests carrying a client-chosen actor/persona header that changes the effective actor | 0 (header ignored or rejected; test) |
| Client portal activation → credential email sent | ≤ 5 min p95 after payment record commits (outbox) |
| Client must reset temporary password before any upload | 100 % (server-enforced, test) |
| Legacy code removed | `src/PrototypeApp.tsx`, `src/store/`, `ste-audit/` absent; `TEST_SNAPSHOT_API_ENABLED` absent from code |
| Full UAT journey E2E-001…E2E-005 (story doc §11) on staging with real logins | Pass, signed by firm Partner |
| Existing regression suite | 100 % pass (minus explicitly retired legacy tests) |
| NFR targets | All P0/P1 rows in `docs/architecture/nfr.md` met |

## 7. Completed baseline — DO NOT REBUILD

See `docs/product/gap-analysis.md` for the requirement-by-requirement matrix with evidence pointers. In short: Modules 1–5, the PBC portal projection, the 11-state lifecycle, immutable audit history, document generation (proposal, EL, invoice, receipt, holding letter, SRM, opinion report, management letter, LOR, correspondence trail, fee note), ISA 230 archive sealing with R2 retention rules, firm ledger/TB/P&L/AR ageing, and the outbox are implemented and covered by tests.

## 8. Open decisions for the firm (block specific stories)

| ID | Decision | Blocks | Default if unanswered |
|---|---|---|---|
| D1 | Staff identity provider: Microsoft Entra ID (OIDC) vs app-native email+password+TOTP | E03-S02 | Entra ID OIDC (firm already has a tenant and app registration) — via SP-01 |
| D2 | Confirm no real business data exists in legacy `TEST` workspaces | E01-S05 | Assume none → delete migration tooling |
| D3 | Staff access scope: firm-wide read vs assigned-engagement only | E03-S07 | Partners firm-wide; Managers/Seniors/Associates assigned-only |
| D4 | Incumbent platform name and export format | E05-S06 | Generic CSV template |
| D5 | Data residency / regulatory regime (Qatar PDPPL, QFC DP Regulations) | E02-S01 location settings | Spike SP-04 |
| D6 | Production domain name and sender email domain | E02-S01, E04-S01 | `app.<firm-domain>`, `no-reply@<firm-domain>` |
