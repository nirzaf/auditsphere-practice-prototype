# Gap Analysis — STE v2.1 vs. repository `main@54ec5a3`

> **Superseded baseline:** this matrix predates the no-application-auth real-implementation epic. Its E03 identity gaps, authentication-specific limiter claims, and `DONE-UNAUTH` statuses are not current requirements. The epic's self-selected-persona model governs. Use current implementation and acceptance evidence; do not add login/RBAC to close rows in this historical matrix.

**Purpose:** tell an agent, per requirement, whether to build, finish, verify, or leave alone.
**Method:** source inspection of the BUSINESS workspace path only (`worker/business*.ts`, `worker/migrations/0006…0044`, `src/components/business/*`, `src/shared/api/business.ts`), cross-checked with `docs/prototype/us-gap-completion-status.md` and a local run of the unit suite (630/631 pass). The legacy browser-store prototype (`src/PrototypeApp.tsx`, `src/store/**`) is **not** counted as implementation.

## Legend

| Status | Meaning | Agent action |
|---|---|---|
| ✅ DONE | Behaviour implemented on the BUSINESS path with server-side enforcement and tests | **Do not rebuild.** Touch only if a story says so. |
| 🔐 DONE-UNAUTH | Implemented, but the control depends on the self-asserted actor and is not trustworthy until E03 ships | No functional change; E03 makes it real. |
| 🟡 PARTIAL | Implemented core; named remainder open | Implement only the named remainder. |
| 🔎 VERIFY | Repository-reported, not confirmed by this audit | Run the verify story first; build only a reproduced gap. |
| ❌ MISSING | Not implemented | Build. |

Evidence column: confirmed = seen in source during this audit; *reported* = taken from repo status docs.

---

## Cross-cutting

| Requirement | Status | Evidence | Remaining → story |
|---|---|---|---|
| Real user identity for all four personas | ❌ MISSING | `resolveBusinessContext` trusts `X-Actor-Id`/`X-Active-Persona` (confirmed); actor list is public (`GET …/actor-profiles`, confirmed) | E03-S01…S05 |
| Authority rules (Preparer/Reviewer/Partner/Client) | 🔐 DONE-UNAUTH | `allowedActions` matrix per persona; `partner()`/`reviewer()` guards in `worker/businessReporting.ts:56-57`; RED execution Manager+ (`worker/businessFieldwork.ts:858,923`) | E03 |
| Segregation of duties (no self-review/self-approval) | 🔐 DONE-UNAUTH | `SELF_APPROVAL`, `SELF_REVIEW_BLOCKED` error codes; `staff_members.natural_person_key` unique | E03 |
| Engagement-assignment scoping for staff reads/writes | 🔎 VERIFY | Assignments drive planning readiness (`worker/businessTb.ts:1222`); context resolution does **not** check assignment (confirmed) | E03-S07 |
| Unlimited clients/engagements/files (no licence gate) | ✅ DONE | No count gates on BUSINESS path; `demo_creation_limits` is legacy only | Capacity spike SP-02 |
| QAR primary currency, minor units | ✅ DONE | `*_minor` integer columns; QAR-only TB currency column (*reported* US-FLD-001) | — |
| 11-state lifecycle + immutable transitions | ✅ DONE | `engagements.lifecycle_state` CHECK (0006:224); `state_transitions_no_update/no_delete` triggers | — |
| Immutable audit history (hash chain) | ✅ DONE | `audit_events_no_update/no_delete`, `audit_chain_heads` (0006) | — |
| Idempotent commands + optimistic concurrency | ✅ DONE | `Idempotency-Key` required; `expectedVersions`; `command_receipts` immutable | — |
| Rate limiting | ✅ DONE | Root Worker config binds separate general, auth-IP and auth-strict buckets; production/staging fail closed when required bindings are missing; login, password reset and public intake use hashed keys; public intake adds an atomic D1 five-per-hour window. Focused rate-limit and readiness tests pass. | E06-S02 |
| Security headers on app shell | 🟡 PARTIAL | Asset responses now set CSP (including `frame-ancestors 'none'` and blob previews), production-only HSTS, `X-Frame-Options`, COOP, minimal Permissions-Policy, and existing headers; the API response boundary enforces `no-store` + `nosniff`. Focused `securityHeaders.test.ts` passes; the all-panels CSP browser sweep and ASVS L2 assessment remain open. | E06-S01 |

## Module 1 — Commercial & CRM

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-M1-001 Multi-channel lead capture | ✅ DONE | `leads.source IN (PHONE,WHATSAPP,EMAIL,WEB_FORM,REFERRAL)`; `POST /api/public/leads` verifies Turnstile, applies hashed-IP limits, detects duplicates, redacts stored IPs and feeds the staff Web inquiries queue; triage creates `WEB_FORM` leads with receipt timestamps. Focused E04-S03 tests pass. | — |
| US-M1-002 Organisational hierarchy | ✅ DONE | `client.affiliation.add`, relationship groups, `HOLDING/SUBSIDIARY/STANDALONE` with parent rules | — |
| US-M1-003 Role-based contact directory | ✅ DONE | `contact.route` purposes `PROPOSAL, EL, FINAL_REPORT, INVOICE, RECEIPT, PBC, HOLDING_LETTER`; MD/GM default routing (`worker/business.ts:2638`) | — |
| US-M1-004 Brief quotation | ✅ DONE | `worker/proposalDocument.ts`; *reported* 1–2-page enforcement | — |
| US-M1-005 Comprehensive proposal | ✅ DONE | CVs, credentials, portfolio, evidence files (migrations 0036–0037) | — |
| US-M1-006 Proposal dispatch | 🟡 PARTIAL | Email uses the provider outbox; E04-S02 records manual WhatsApp/hand delivery against the current Partner-approved PDF in an append-only correspondence trail. No WhatsApp API is used. | Live email acceptance → E04-S01 |
| US-M1-007 Client commercial approval | 🔐 DONE-UNAUTH | `commercialAcceptance.record/revoke` (CLIENT action) | E03 |
| US-M1-008 Dual-key gate | ✅ DONE | acceptance + `risk.clear`; EL generation blocked otherwise | — |
| US-M1-009 Engagement Letter (statutory / IA / AUP) | ✅ DONE | `serviceType` enum incl. `AGREED_UPON_PROCEDURES`; `engagementLetter.generate/issue` | — |
| US-M1-010 50 % advance invoice | ✅ DONE | `invoice.issueAdvance`; issued atomically with EL (*reported* US-GAP-04) | — |
| US-M1-011 Payment & official receipt | ✅ DONE | `payment.record/allocate/reverse`; `receipt_vouchers`; `RECEIPT` outbox doc | — |
| US-M1-012 Client portal onboarding | 🟡 PARTIAL | Portal activates on payment (`worker/businessOutbox.ts:664`). **No** credential issue, email, or forced reset (confirmed: no password/credential code) | E03-S04, E03-S05 |
| US-M1-013 PBC status lifecycle + rejection reason | ✅ DONE | `pbc_requests.status` 4 values; reject needs ≥ 10-char reason (`parseBusinessCommandEnvelope`) | — |

## Module 2 — Governance & Planning

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-M2-001 Track A acceptance (UBO/AML/KYC/integrity/viability/independence/conflicts) | ✅ DONE | check codes in 0010:76 | — |
| US-M2-002 Track B continuance delta | ✅ DONE | `riskAssessment.startContinuance/recordDelta`; topics in 0012 | — |
| US-M2-003 Partner acceptance gate | 🔐 DONE-UNAUTH | `risk.clear` Partner-only | E03 |
| US-M2-004 Five-folder directory | ✅ DONE | `provisionEngagementFolders` exact names (`worker/businessPlanning.ts:394`) | — |
| US-M2-005 Resource scheduling + capacity calendar | ✅ DONE | `staffing.*` commands; capacity calendar (*reported* US-GAP-07) | — |
| US-M2-006 Statutory milestones | ✅ DONE | `milestone.set` per engagement for 4 codes — meets the story ACs (configurable per engagement; example dates *not* universal; saved dates visible); E05-S01 adds editable suggestions from the period end while retaining the statutory-cutoff gate | — |
| US-M2-007 TB ingestion (XLSX/CSV) | ✅ DONE | `tb.import` staged chunks, macro/encrypted/external-link rejection (*reported* US-FLD-001) | Staging acceptance only (E05-S05) |
| US-M2-008 Historical mapping memory | ✅ DONE | prior-period-only suggestions, name similarity (migrations 0038, 0043, 0044) | — |
| US-M2-009 Benchmarks PBT/Revenue/Assets/Equity | ✅ DONE | `worker/businessTb.ts:701` ranges | — |
| US-M2-010 PM/TE/SAD | ✅ DONE | TE 50–75 %, SAD 3–5 % inputs (*reported* US-GAP-09) | — |
| US-M2-011 ±5 % rounding | ✅ DONE | `materiality.adjust`; boundary test (commit `2a815c7`) | — |
| US-M2-012 RAG stratification | ✅ DONE | `fsli.risk.set`, `risk_band` | — |
| US-M2-013 Partner planning approval | 🔐 DONE-UNAUTH | `planning.approve` | E03 |

## Module 3 — Fieldwork

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-M3-001 Split P&L / BS dashboard | ✅ DONE | `GET …/financial-statements`, source-line drill-down | — |
| US-M3-002 Analytical review | ✅ DONE | *reported* US-FLD-004 validation | — |
| US-M3-003 ISA 570 going concern | ✅ DONE | starts `UNASSESSED`; explicit conclusions incl. `MATERIAL_UNCERTAINTY`; mandatory rationale (`worker/businessFieldwork.ts:815-816`); report section (`worker/reportingOpinion.ts:90`); E05-S03 browser assertions at 1440×900 and 390×844 | — |
| US-M3-004 FSLI workprograms | ✅ DONE | `tests/unit/fieldworkAcceptance.test.ts` (M3-004.1–.4), registered in `tests/unit/businessWorkspace.test.ts`; required assertions, persisted projection, evidence invalidation and submission outcomes pass | — |
| US-M3-005 Ad-hoc procedures | ✅ DONE | `tests/unit/fieldworkAcceptance.test.ts` (M3-005.1–.3), registered in `tests/unit/businessWorkspace.test.ts`; required inputs, mandatory submission snapshot, actor/reason revision, audit and change feed pass | — |
| US-M3-006 Sampling (MUS / systematic / stratified attribute) | ✅ DONE | method CHECK in 0016:277 | — |
| US-M3-007 Hybrid evidence (digital + physical index) | ✅ DONE | evidence modes (*reported* R12) | — |
| US-M3-008 Row-level concurrency | ✅ DONE | per-entity versions, change feed `GET …/changes` | — |
| US-M3-009 Preparer submission | ✅ DONE | `procedure.submit`, `review.submit` exact missing-field errors | — |
| US-M3-010 Reviewer return & rework | ✅ DONE | `review.decide` / `review.respond` | — |
| US-M3-011 SRM | ✅ DONE | `srm.compile` | — |
| US-M3-012 Partner high-risk review | 🔐 DONE-UNAUTH | `srm.clear` → `requirePartner` (`worker/businessFieldwork.ts:2495`) | E03 |
| US-M3-013 Confirmations (Bank/AR/AP/Inventory/Legal) | ✅ DONE | type CHECK in 0019:42 | — |
| US-M3-014 Holding letter blocker | ✅ DONE | `holding_letters`, `queueHoldingLetterForBlockers` | — |

## Module 4 — Reporting & Deliverables

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-M4-001 Partner-only opinion | 🔐 DONE-UNAUTH | `partner()` guard | E03 |
| US-M4-002 Modified-opinion builder | ✅ DONE | discriminated union in `worker/businessReporting.ts:26` | — |
| US-M4-003 Signature PNG + seal | ✅ DONE | `signature_asset_decisions`, `seal_asset_approvals`, `worker/reportingPng.ts` | — |
| US-M4-004 Five-part bundle | ✅ DONE | `bundle.prepare`, `report.release` | — |
| US-M4-005 Final 50 % invoice | ✅ DONE | issued on release (*reported* R02) | — |
| US-M4-006 Release + portal freeze | ✅ DONE | `PORTAL_FROZEN` 423 on all upload phases (*reported* US-REP-006) | — |
| US-M4-007 60-day countdown | ✅ DONE | `archive_due_at`; minute cron `queueDueBusinessArchives` | — |
| US-M4-008 Permanent read-only archive | 🟡 PARTIAL | app-level seal + R2 prefix retention rules applied (101 rules, *reported*) | Live overwrite/delete canary + large-archive acceptance → E05-S05 |
| US-M4-009 Immutable audit history | ✅ DONE | see cross-cutting | — |

## Module 5 — Practice

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-M5-001 Daily time per engagement/FSLI | ✅ DONE | `time.create/submit/approve/return/correct` | — |
| US-M5-002 Charge-out rates 1000/750/500/200 | ✅ DONE | defaults `worker/businessPractice.ts:97` | — |
| US-M5-003 Profitability | ✅ DONE | `GET …/practice/engagements/:id/profitability` | — |
| US-M5-004 Budget vs actual | ✅ DONE | `budget.approve`, multi-phase (*reported* US-GAP-22) | — |
| US-M5-005 Practice ledger (rent, salaries, withdrawals, petty cash) | ✅ DONE | *reported* US-GAP-24 | — |
| US-M5-006 Firm TB | ✅ DONE | `GET …/practice/reports/trial-balance` | — |
| US-M5-007 Monthly P&L | ✅ DONE | `GET …/practice/reports/profit-loss` | — |
| US-M5-008 AR ageing | ✅ DONE | `tests/unit/businessPracticeAging.test.ts` | — |

## Client PBC Portal

| Story | Status | Evidence | Remaining → story |
|---|---|---|---|
| US-PBC-001 Isolated client workspace | 🔐 DONE-UNAUTH | CLIENT profile bound to `client_id`; scope checks | E03-S03…S05 |
| US-PBC-002 Upload | ✅ DONE | file reserve/content/commit + SHA-256 | Forced-reset gate → E03-S05 |
| US-PBC-003 Review feedback | ✅ DONE | `pbc.review` | — |
| US-PBC-004 Finance documents (invoices, receipts) | 🟡 PARTIAL | E05-S04 now projects only issued invoices and receipts in the CLIENT document centre; API integration coverage passes. Full browser/download acceptance remains open. | E05-S04 |
| US-PBC-005 Holding letters | 🟡 PARTIAL | E05-S04 exposes only accepted/delivered Holding Letters and preserves their saved blocker snapshot in the CLIENT document centre; API integration coverage passes. Full browser/download acceptance remains open. | E05-S04 |
| US-PBC-006 Final deliverables | ✅ DONE | released bundle downloads remain after freeze (*reported*) | — |

## Not in spec but required for production (NFR-driven)

| Item | Status | Story |
|---|---|---|
| Staging/production split, renamed resources, `workers_dev:false` | ❌ | E02-S01 |
| Exact dependency pins (currently `^` ranges) | ❌ | E02-S02 |
| Backup/restore runbook and drill | ❌ | E02-S03 |
| Alert routing for outbox failures / overdue archives (logs exist, no alerts) | ❌ | E06-S03 |
| Accessibility WCAG 2.2 AA audit | ❌ | E06-S04 |
| Load test at target concurrency | ❌ | E06-S05 |
| Go-live runbook + UAT sign-off | ❌ | E06-S06 |
