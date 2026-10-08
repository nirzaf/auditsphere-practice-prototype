# Glossary / Domain Language

**Naming convention (existing):** singular code terms map to plural `snake_case` tables (`client` → `clients`, `contact_route` → `contact_routes`, `engagement_letter` → `engagement_letters`); command types are `entity.verb` in camelCase (`commercialAcceptance.record`).

**Rule:** use the *Code term* exactly in identifiers, table names, command types, API fields and UI copy keys. Never introduce a synonym. If a concept is missing, add it here in the same PR that introduces it.

## Identity & access

| Term | Code term | Meaning | Not to be confused with |
|---|---|---|---|
| Workspace | `workspace` (`workspaces` table) | The single firm's data partition. Production has exactly **one** `BUSINESS` workspace (ADR-0008). | A client's portal. |
| Data mode | `data_mode` = `BUSINESS` \| `TEST` | `BUSINESS` = real records. `TEST` = legacy snapshot demo; being removed (E01). | — |
| Staff member | `staff_member` | A natural person employed by the firm, with a `grade`. | User account (login). |
| Staff grade | `grade` = `PARTNER` \| `MANAGER` \| `SENIOR` \| `ASSOCIATE` | Seniority. Drives charge-out rate and which personas may be held. | Persona. |
| Persona | `persona` = `PREPARER` \| `REVIEWER` \| `APPROVER` \| `CLIENT` | The role a request acts under. `APPROVER` requires `PARTNER`; `REVIEWER` requires `MANAGER`/`SENIOR`. | Grade. |
| Actor profile | `actor_profile` | Binding of one persona to one staff member **or** one client contact. The thing every command is attributed to. | User account. |
| Natural person key | `natural_person_key` | Unique per person; segregation-of-duties checks compare it, not profile IDs. | Email. |
| **User account** *(new, E03)* | `user_account` | A login identity. Kind `STAFF` (linked to a staff member) or `CLIENT` (linked to a contact). Owns one or more actor profiles. | Actor profile. |
| **Auth session** *(new, E03)* | `auth_session` | Server-side session row keyed by SHA-256 of an opaque cookie token. Holds the *active actor profile*. Replaces `X-Actor-Id` headers. | Legacy `workspace_sessions` (removed). |
| **Active profile** *(new, E03)* | `active_actor_profile_id` | Which of the user's own actor profiles the session currently acts as. Switching is only among profiles the user owns. | "Persona switcher" (legacy, removed). |
| **Credential token** *(new, E03)* | `credential_token` | Single-use, hashed, expiring token for `INVITE`, `TEMP_PASSWORD`, `PASSWORD_RESET`. | Session token. |
| **Temporary password** *(new, E03)* | `password_must_change = 1` | Password emailed at portal provisioning; blocks every PBC action until changed (spec §4.1.5). | — |
| **Firm administrator** *(new, E03)* | capability `firm.admin` | Partner-held capability to invite/disable users and grant/revoke actor profiles. Not a persona. | `APPROVER`. |

## Commercial (Module 1)

| Term | Code term | Meaning | Not to be confused with |
|---|---|---|---|
| Lead | `lead` | Inbound inquiry with `source` ∈ `PHONE, WHATSAPP, EMAIL, WEB_FORM, REFERRAL`. Converts to a client. | Client. |
| Client | `client` | Audited entity. `entity_type` ∈ `HOLDING, SUBSIDIARY, STANDALONE`; subsidiaries require a parent. | Customer, account. |
| Affiliation / relationship group | `client_affiliation`, relationship group | Organisational tree links between clients. | — |
| Contact | `contact` | A person at a client (MD/GM, CFO, Audit Liaison …). | User account. |
| Contact route | `contact_route` | Which contact receives which document `purpose`: `PROPOSAL, EL, FINAL_REPORT, INVOICE, RECEIPT, PBC, HOLDING_LETTER`. | — |
| Brief quotation | artifact kind `QUOTE` | 1–2-page fee summary. | Comprehensive proposal. |
| Comprehensive proposal | artifact kind `FULL_PROPOSAL` | Multi-section proposal with team CVs, credentials, portfolio. | Engagement letter. |
| Commercial acceptance (Key 1) | `commercialAcceptance` | Client's recorded acceptance of the proposal fee. | Risk clearance. |
| Risk clearance (Key 2) | `risk.clear` | Partner sign-off of Track A/B acceptance (ISA 220). | Planning approval. |
| Dual-key gate | — | EL generation is blocked until Key 1 **and** Key 2 are active. | — |
| Engagement | `engagement` | One audit (or IA/AUP) for one client and period. Has `lifecycle_state`. | Job, project, file. |
| Service type | `STATUTORY_AUDIT, INTERNAL_AUDIT, AGREED_UPON_PROCEDURES` | Drives EL template and reporting form. | — |
| Engagement letter (EL) | `engagement_letter` | ISA 210 terms; issued with the advance invoice. | Proposal. |
| Advance invoice | `invoice.issueAdvance` | First 50 % of contracted fee. | Final balance fee note. |
| Final balance fee note | final invoice | Remaining 50 %, issued atomically on report release. | — |
| Receipt voucher | `receipt_voucher` | Official receipt generated on payment record. | Invoice. |

## Planning (Module 2)

| Term | Code term | Meaning |
|---|---|---|
| Track A / Track B | acceptance vs `riskAssessment.startContinuance` | New-client acceptance vs recurring-client continuance delta review. |
| Engagement folder | `engagement_folder` | One of exactly five: `01_Administration & Planning`, `02_Trial Balance & Schedules`, `03_Fieldwork & Testing`, `04_Drafts & Deliverables`, `05_Final Signed Archive`. |
| Assignment | `engagement_assignment` | Staff member + persona + phase + days on an engagement. |
| Milestone | `milestone` code ∈ `FIELDWORK_START, DRAFT_REPORT, FINAL_REPORT, STATUTORY_CUTOFF` | Target/actual dates. |
| Trial balance version | `tb_versions` | Immutable imported TB; one is *active*. |
| Mapping version | `mapping_versions` | Approved account→FSLI mapping for a TB version. |
| FSLI | `fsli_catalog` | Financial Statement Line Item (Revenue, PPE, Cash …). |
| Planning materiality (PM) | `planning_minor` (rate `benchmark_rate_bps`) | Benchmark base × chosen %. |
| Tolerable error (TE) | `performance_minor` (rate `performance_rate_bps`) | 50–75 % of PM (performance materiality). |
| SAD threshold | `sad_minor` (rate `sad_rate_bps`) | 3–5 % of PM; clearly trivial cutoff. |
| Risk band | `fsli_risks`, `workprograms.risk_band` = `GREEN, AMBER, RED` | FSLI stratification; RED requires Manager execution + Partner review. |

## Fieldwork (Module 3)

| Term | Code term | Meaning |
|---|---|---|
| Workprogram | `workprograms` | Template-pinned procedure set for one FSLI. |
| Procedure | `procedures`, `procedure_revisions` | One step (assertion: ownership, valuation, completeness, existence, cut-off). |
| Ad-hoc procedure | `procedure.insert` | Engagement-specific step inserted into an active workprogram. |
| Evidence | `evidence_records`, `evidence_links` | Digital file link and/or physical index code (e.g. `X-1, Box 3, Shelf B`). |
| Sampling plan | `sampling_plans.method` ∈ `MUS_BINOMIAL_PPS, SYSTEMATIC, STRATIFIED_ATTRIBUTE` | Reproducible selection with seed. |
| Review note / decision | `review_notes`, `review_decisions` / `review.submit`, `review.decide`, `review.respond` | Reviewer feedback loop; return sets *Under Rework*. |
| Adjustment (AJE) | `audit_adjustments` / `adjustment.*` | Proposed/approved journal against the TB. |
| Difference | `audit_differences` / `difference.create` | Unadjusted misstatement compared to SAD/PM. |
| SRM | `srm_versions`, `srm_clearances` | Summary Review Memorandum compiled after all workprograms are reviewed. |
| Confirmation | `confirmations.type` ∈ `BANK, AR, AP, INVENTORY, LEGAL` | ISA 505 external confirmation; may be *critical*. |
| Holding letter | `holding_letters` | Auto-generated letter when a critical confirmation is outstanding; blocks release. |

## Reporting (Module 4)

| Term | Code term | Meaning |
|---|---|---|
| Opinion category | `opinion_versions` / `opinion.select` category ∈ unqualified, qualified, disclaimer, adverse | Partner-only during `PARTNER_APPROVAL`. |
| Basis for modified opinion | `basisText`, `affectedFslis` | Mandatory for non-clean opinions. |
| Signature asset / seal asset | `report_signature_assets`, `signature_asset_decisions`, `seal_asset_approvals` | Approved PNGs embedded in the report. |
| Deliverables bundle | `deliverable_bundles`, `deliverable_parts` / `bundle.prepare` | Exactly five parts: auditor's report + FS, management letter, LOR, correspondence trail, final fee note. |
| Release | `report.release` | Atomic: sign, issue final invoice, publish downloads, freeze portal. |
| Portal freeze | `portal_freezes` | Client uploads blocked (`423 PORTAL_FROZEN`); downloads remain. |
| Compliance countdown | `archive_due_at` | Signature date + 60 days (ISA 230). |
| Archive seal | `archive_runs`, `archive_seals` | Read-only engagement; R2 objects under retention-locked prefixes. |

## Practice (Module 5)

| Term | Code term | Meaning |
|---|---|---|
| Time entry | `firm_time_entries` / `time.*` | Hours per engagement + FSLI + phase; submit/approve/return. |
| Charge-out rate | `firm_charge_out_rates` | Per grade: Partner 1,000; Manager 750; Senior 500; Associate 200 QAR/h. |
| Engagement profitability | profitability endpoint | Contracted fee − Σ(hours × rate). |
| Firm ledger | `firm_accounts`, `firm_journals`, `firm_journal_lines` / `ledger.*` | Internal double-entry ledger (rent, salaries, withdrawals, petty cash). |
| AR ageing | AR ageing report | Buckets `CURRENT, 1–30, 31–60, 61–90, 91+` at a Qatar as-of date. |

## Platform

| Term | Code term | Meaning |
|---|---|---|
| Command | `{ type, payload }` | The only way to mutate business state. `POST /api/workspaces/:id/commands`. |
| Command envelope | `businessCommandEnvelopeSchema` | `{ actor, context, expectedVersions, command }` + `Idempotency-Key` header. **E03 removes `actor` from the trust path.** |
| Expected version | `expectedVersions[]` | Optimistic concurrency per entity. |
| Outbox job | `outbox_jobs.kind` ∈ `EMAIL, GENERATE_DOCUMENT, IMPORT_TB, SEAL_ARCHIVE, VERIFY_FILE` | Durable async work processed by the minute cron. |
| Change feed | `GET …/changes` | Sequence-ordered change events for concurrency refresh. |
| Audit event | `audit_events` | Append-only, hash-chained, per workspace or engagement scope. |
| Standards profile | `standards_profile` | Pinned ISA/IFRS edition set for an engagement. |
| Minor units | `*_minor` | Integer QAR dirhams (1 QAR = 100). Never floats. |
