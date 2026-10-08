# STE Audit Management Tool
## Detailed User Stories, Acceptance Criteria & Implementation Specification

**Source authority:** Google Doc — **Audit Management Tool Specification**  
**Document version:** 2.1  
**Primary focus:** Business Logic, Functional Requirements, Task Sequences & Module Workflows  
**Standards context:** ISA & IFRS  
**Primary currency:** QAR  
**Purpose:** Convert the source requirements into implementation-ready user stories without adding unrelated product scope.

---

# 1. Product Epic

## EPIC-001 — Unified STE Audit Management Lifecycle

### Epic User Story

**As an audit firm,**  
I want one unified audit management platform that connects commercial intake, client acceptance, planning, fieldwork, review, reporting, archiving, and practice management,  
**so that** the full lifecycle of an audit engagement can be managed consistently without per-file licensing penalties and with standardized governance aligned to the source specification.

### Business Outcomes

The implementation shall:

1. Support an unlimited number of client entities, historical engagements, and working papers without subscription/per-file penalties being represented in product logic.
2. Centralize commercial sales, administrative governance, compliance clearance, audit fieldwork, multi-tier review, client deliverables, and internal practice management.
3. Represent the source standards context: ISA 210, ISA 220/ISQC 1, ISA 230, ISA 320, ISA 505, ISA 570, ISA 700 and ISA 705.
4. Use QAR as the primary currency.

---

# 2. Scope Boundary

## 2.1 Required Product Modules

The product shall expose exactly these five primary business modules:

1. **Module 1 — Commercial & CRM Pipeline**
2. **Module 2 — Administration, Governance & Planning**
3. **Module 3 — Technical Execution & Audit Fieldwork**
4. **Module 4 — Reporting & Final Deliverables**
5. **Module 5 — Practice Analytics & Internal Bookkeeping**

Supporting records may exist where required by the five modules, but they shall not create unrelated product scope.

## 2.2 Required Supporting Workspace

A client-facing **PBC Portal** is required as part of the engagement workflow.

## 2.3 Implementation Technology Boundary

The source document does not prescribe a specific backend, cloud provider, database, authentication provider, email provider, payment processor, digital-signature provider, or distributed locking technology. Those are implementation decisions, not additional business requirements.

---

# 3. Personas & Responsibility Model

## US-PER-001 — Preparer

**As an Audit Associate / Junior Auditor,**  
I want to execute assigned FSLI procedures, attach evidence, maintain physical references, submit work for review, and log daily time,  
**so that** my audit work can be reviewed and incorporated into the engagement file.

### Responsibilities

- Execute assigned FSLI audit procedures.
- Upload/link digital working papers.
- Record physical binder references such as `X-1, Box 3`.
- Submit completed testing packages for review.
- Rework items returned with comments.
- Log daily hours against engagement/FSLI work.

### Acceptance Criteria

- Given assigned work is complete with required evidence, when the Preparer submits it, then it enters managerial review.
- Given work is returned, when the Preparer reopens it, then mandatory comments remain visible and status is **Under Rework**.
- Given time is recorded, when saved, then it is linked to the exact engagement and FSLI/task.

---

## US-PER-002 — Reviewer

**As an Audit Senior / Audit Manager,**  
I want to review testing, issue mandatory comments, determine sampling/materiality inputs, prepare the SRM, and track engagement progress,  
**so that** incomplete work is corrected and only reviewed work advances.

### Responsibilities

- Verify substantive testing and recalculated schedules.
- Issue review notes and initiate rework.
- Determine sampling parameters.
- Calculate/prepare engagement materiality.
- Prepare the Summary Review Memorandum (SRM).
- Track budgets, team hours, and milestones.

### Acceptance Criteria

- Reviewer cannot return work without required comments.
- Returned work changes to **Under Rework**.
- SRM is prepared only after managerial review requirements are satisfied.

---

## US-PER-003 — Approver

**As an Engagement Partner,**  
I want exclusive authority over risk acceptance, planning sign-off, high-risk review, opinion selection, final authorization, and archive locking,  
**so that** key professional decisions remain under Partner control.

### Responsibilities

- Sign off the Dual-Key professional-risk clearance.
- Authorize commercial proposals.
- Execute Engagement Letters.
- Approve planning/materiality.
- Review Red-risk areas and SRM.
- Select the final opinion.
- Apply digital signature and firm seal.
- Authorize final deliverables.
- Enforce regulatory file locks.

---

## US-PER-004 — Client

**As a Client Coordinator / CFO / MD,**  
I want an isolated PBC portal where I can upload requested audit information and receive invoices, receipts, holding letters, and final deliverables,  
**so that** I can interact with the audit team without access to internal audit workspaces.

### Required Client Capabilities

- Access an isolated PBC portal.
- View requested documentation with review-status badges.
- Upload financial schedules, TBs, and voucher evidence.
- Receive invoices and receipts.
- Receive Holding Letters.
- Download released final deliverables.
- Lose upload permission after final report release.

---

# 4. Module 1 — Commercial & CRM Pipeline

## US-M1-001 — Multi-Channel Lead Capture

**As a relationship/commercial user,**  
I want to capture client leads from all required channels,  
**so that** opportunities are recorded consistently regardless of origin.

### Required Intake Channels

- Phone
- WhatsApp
- Email
- Web Forms
- Referrals

### Acceptance Criteria

- Minimum entity and primary-contact data are mandatory before progression.
- Valid lead data permits transition from `LEAD_INGESTION` to `PROPOSAL_GENERATION`.
- Intake channel is persisted.

---

## US-M1-002 — Organizational Client Hierarchy

**As a relationship user,**  
I want to maintain Holdings, Subsidiaries, and Affiliates,  
**so that** each legal entity and its historical engagements remain correctly organized.

### Acceptance Criteria

- Client entity records support hierarchy roles.
- Subsidiaries/affiliates reference the appropriate group/parent.
- Historical engagements remain linked to the correct legal entity.

---

## US-M1-003 — Role-Based Client Contact Directory

**As the audit firm,**  
I want multiple client contacts with role-based communication routing,  
**so that** each communication reaches the designated recipient.

| Communication | Required Recipient |
|---|---|
| Proposals | Managing Director / General Manager |
| Engagement Letters | Managing Director / General Manager |
| Final Reports | Managing Director / General Manager |
| Commercial Invoices | CFO / Finance Director |
| Official Receipts | CFO / Finance Director |
| PBC Requests | Chief Accountant / Audit Liaison |

### Acceptance Criteria

- Multiple active contacts are supported.
- Dispatch uses the correct routed contact.
- Missing required contact produces an explicit blocker rather than silently choosing an unrelated contact.

---

## US-M1-004 — Brief Quotation

**As a commercial user,**  
I want to generate a 1–2 page brief quotation,  
**so that** simple RFQ/RFP responses can be issued quickly.

### Required Contents

- Engagement scope.
- Statutory/reporting year.
- Professional fee.
- 50/50 payment terms.
- Execution timeline.

### Acceptance Criteria

- Brief quotation remains distinct from Comprehensive Proposal.
- Revision presented to the client is identifiable and retained.

---

## US-M1-005 — Comprehensive Technical Proposal

**As a commercial user,**  
I want a comprehensive proposal assembled from firm and engagement information,  
**so that** formal tenders contain all required technical/commercial information.

### Required Sections

1. Firm Profile.
2. Firm History.
3. Commercial Registrations.
4. Engagement Partner & Audit Team CVs.
5. Industry Credentials and Portfolio Evidence.
6. ISA Methodology Overview.
7. Fee Schedule.
8. Deliverables Timeline.

### Acceptance Criteria

- Required sections are present before presentation.
- Presented/accepted revision is preserved.
- Later revisions do not overwrite previously presented content.

---

## US-M1-006 — Proposal Dispatch

**As a commercial user,**  
I want proposals dispatched by Email or WhatsApp,  
**so that** the current approved revision is formally presented to the client.

### Acceptance Criteria

- Allowed channels are Email and WhatsApp.
- Dispatch records recipient, channel, proposal revision, timestamp, and outcome.
- Proposal must be dispatched before `DUAL_KEY_PENDING` is considered reached.

---

## US-M1-007 — Client Commercial Approval

**As the audit firm,**  
I want recorded evidence that the client accepted the current proposal,  
**so that** Key 1 of the Dual-Key gate is satisfied.

### Acceptance Criteria

- Acceptance references exact presented proposal revision.
- Superseded revision cannot clear Key 1.
- Acceptance evidence is retained.

---

## US-M1-008 — Dual-Key Onboarding Gate

**As an Engagement Partner,**  
I want both client commercial acceptance and Partner risk clearance before Engagement Letter generation,  
**so that** onboarding cannot bypass professional acceptance.

### Key 1 — Commercial Approval

- Current proposal accepted by client.

### Key 2 — Risk Clearance

- Acceptance/continuance completed.
- Engagement Partner formally approves.

### Hard Gate

Before both keys are active:

- Engagement Letter generation is blocked.
- 50% Advance Invoice generation is blocked.

### Acceptance Criteria

- Key 1 alone is insufficient.
- Key 2 alone is insufficient.
- Both keys permit transition to `ADVANCE_BILLING`.

---

## US-M1-009 — Engagement Letter Generation

**As the Engagement Partner,**  
I want the correct standardized Engagement Letter generated,  
**so that** engagement terms are documented consistently.

### Required Templates

- External Statutory Audit.
- Internal Audit / Agreed-Upon Procedures (ISRS 4400).

### Required Inputs

- Client Legal Name.
- Period Covered.
- Agreed Fee.
- Submission Deadlines.

### Acceptance Criteria

- EL is blocked until Dual-Key clearance.
- EL is linked to current engagement/proposal/acceptance context.
- Partner digital signature/stamp is applied on generation.

---

## US-M1-010 — 50% Advance Invoice

**As the billing workflow,**  
I want the 50% advance invoice generated alongside the Engagement Letter,  
**so that** onboarding follows the agreed commercial milestone.

### Acceptance Criteria

- Invoice amount = 50% of agreed fee.
- Invoice is linked to the engagement.
- Invoice is created only after Dual-Key clearance.
- Workflow remains in `ADVANCE_BILLING` until payment is recorded.

---

## US-M1-011 — Advance Payment & Official Receipt

**As a billing user,**  
I want to record the advance payment with reference details and issue an official receipt,  
**so that** settlement is auditable.

### Required Payment Data

- Amount.
- Date.
- Method.
- Cheque / bank transfer / payment reference.

### Acceptance Criteria

- Payment links to the advance invoice.
- Receipt is generated upon payment recording.
- Receipt references engagement and payment.
- Settlement clears the gate to portal/planning.

---

## US-M1-012 — Client Portal Onboarding

**As a Client Audit Liaison,**  
I want temporary credentials and a mandatory first-login password reset,  
**so that** uploads begin through the designated client workspace.

### Acceptance Criteria

- Isolated client workspace is generated.
- Temporary credentials are provided to designated Audit Liaison.
- Uploads are blocked until password reset.
- Reset status is identity-specific.

---

## US-M1-013 — PBC Request Status Lifecycle

**As a client and auditor,**  
I want clear status labels for every requested item,  
**so that** both sides understand evidence status.

### Required Status Labels

- Pending Upload
- Under Review
- Approved
- Rejected / Re-upload Required

### Acceptance Criteria

- Rejection requires mandatory reason.
- Reason appears to client immediately.
- Rejected item can be re-uploaded.
- Client uploads freeze when final audit report is released.

---

# 5. Module 2 — Administration, Governance & Planning

## US-M2-001 — New Client Acceptance (Track A)

**As an acceptance/compliance user,**  
I want a mandatory new-client assessment,  
**so that** professional risks are evaluated before planning.

### Required Assessments

- UBO.
- AML background check.
- KYC documentation.
- Management integrity.
- Financial viability.
- Independence.
- Conflict of interest.

### Acceptance Criteria

- All mandatory items are deliberately assessed.
- Required evidence references are captured.
- Unresolved/prohibited conditions block Partner acceptance.
- Partner approval is mandatory before planning.

---

## US-M2-002 — Recurring Client Continuance (Track B)

**As an Audit Manager,**  
I want a fresh-period continuance assessment based on prior-year changes,  
**so that** recurring clients are not automatically accepted.

### Required Delta Review

- Prior-year fees settled.
- Management/shareholding changes.
- New credit facilities/loans.
- Litigation/legal notices.
- Fraud/regulatory investigations.

### Acceptance Criteria

- No question defaults silently to a favorable answer.
- All required delta items are assessed.
- Prior accepted engagement is referenced.
- Changed facts require explanation.
- Partner sign-off is mandatory.

---

## US-M2-003 — Partner Acceptance Gate

**As the Engagement Partner,**  
I want final authority over acceptance/continuance,  
**so that** planning cannot begin prematurely.

### Acceptance Criteria

- Final acceptance is Partner-only.
- Acceptance is bound to exact client, service, year, and engagement.
- Planning remains blocked until approval.

---

## US-M2-004 — Standard Five-Folder Directory

**As the engagement team,**  
I want the exact standard directory provisioned automatically,  
**so that** every engagement uses the same taxonomy.

### Exact Folder Names

1. `01_Administration & Planning`
2. `02_Trial Balance & Schedules`
3. `03_Fieldwork & Testing`
4. `04_Drafts & Deliverables`
5. `05_Final Signed Archive`

### Acceptance Criteria

- Folder names match exactly.
- Structure is engagement-scoped.
- Provisioning occurs after risk acceptance.
- Final archive becomes read-only after lock.

---

## US-M2-005 — Resource Scheduling

**As an Audit Manager,**  
I want to assign team members and track availability, leave, planned hours, and target utilization,  
**so that** engagement staffing is realistic.

### Required Roles

- Engagement Partner / Approver.
- Audit Manager/Senior / Reviewer.
- Associates / Preparers.

### Required Scheduling Data

- Availability.
- Leave.
- Planned hours.
- Target utilization.
- Phase.
- Start/end dates.

### Acceptance Criteria

- Scheduling data is saved, not decorative.
- Leave reduces available capacity.
- Utilization derives from saved capacity/allocation.
- Assigned users must have engagement access.

---

## US-M2-006 — Statutory Milestones

**As an Audit Manager,**  
I want engagement milestones relative to reporting cutoff,  
**so that** fieldwork and reporting deadlines can be tracked.

### Source Example

For December 31 year-end:

- Fieldwork begins January Week 1.
- Draft report February 15.
- Final signed report March 15.

### Acceptance Criteria

- Milestones are configurable per engagement.
- Example dates are not treated as universal fixed values.
- Current saved milestone dates are visible.

---

## US-M2-007 — Trial Balance Ingestion

**As the engagement team,**  
I want to import Excel/CSV Trial Balances,  
**so that** planning and fieldwork use current client financial data.

### Source Examples

- QuickBooks
- Tally
- Zoho

### Acceptance Criteria

- Source file/revision is identifiable.
- TB rows are tied to engagement.
- Mapping is required before downstream planning/fieldwork gates clear.

---

## US-M2-008 — Historical Mapping Memory

**As an auditor,**  
I want FSLI mapping suggestions based on prior confirmed mappings,  
**so that** recurring mapping is faster.

### Acceptance Criteria

- Suggestions use eligible historical context.
- Suggestions never become approved automatically.
- Auditor explicitly confirms current mapping.
- Mapping revision is retained.

---

## US-M2-009 — Materiality Benchmark Selection

**As an Audit Manager,**  
I want to select the appropriate benchmark from the ingested TB,  
**so that** PM is based on current engagement data.

| Benchmark | Permitted Rate |
|---|---:|
| Normalized Profit Before Tax | 5.0%–10.0% |
| Total Revenue | 0.5%–2.0% |
| Total Assets | 0.5%–1.0% |
| Equity / Net Assets | 1.0%–2.0% |

### Acceptance Criteria

- Out-of-band rate is rejected.
- Benchmark value references current TB/source.
- Rationale is captured.

---

## US-M2-010 — PM / TE / SAD Calculation

**As an Audit Manager,**  
I want PM, TE, and SAD calculated consistently,  
**so that** testing thresholds are standardized.

### Exact Calculations

- PM = Benchmark Base × selected percentage.
- TE / Performance Materiality = 50%–75% of PM.
- SAD Threshold = 3%–5% of PM.

### Acceptance Criteria

- TE outside 50%–75% is rejected.
- SAD outside 3%–5% is rejected.
- Saved threshold amounts reconcile mathematically.

---

## US-M2-011 — Practical Rounding

**As an Audit Manager,**  
I want to round materiality values within ±5%,  
**so that** practical thresholds can be used without exceeding governance limits.

### Acceptance Criteria

- ±5.0% or less is accepted.
- More than ±5.0% is rejected.
- Raw and rounded basis remain traceable.

---

## US-M2-012 — Risk Color Stratification

**As an audit team member,**  
I want FSLIs classified Green, Amber, or Red,  
**so that** execution and review responsibility are clear.

### Green

- Balance below TE.
- Low risk.
- Standard programs.
- Junior/Preparer execution permitted.

### Amber

- Balance between TE and PM.
- Moderate/low inherent risk.
- Senior substantive testing/sampling.

### Red

Any of:

- Balance exceeds PM.
- Critical accounting estimate.
- High inherent risk.

### Acceptance Criteria

- A low-value item may still be Red if critical/high-risk.
- Red requires Manager-level execution and Partner review.
- Visual color and stored risk logic agree.

---

## US-M2-013 — Partner Planning & Materiality Approval

**As the Engagement Partner,**  
I want to approve the current planning/materiality revision,  
**so that** fieldwork cannot begin on an unapproved basis.

### Acceptance Criteria

- Final approval is Partner-only.
- Approval is tied to current TB/mapping/materiality basis.
- TB change stales dependent planning approval.
- Fieldwork remains blocked until current approval exists.

---

# 6. Module 3 — Technical Execution & Audit Fieldwork

## US-M3-001 — Split Financial Statement Dashboard

**As an auditor,**  
I want the dashboard split into P&L and Balance Sheet sections,  
**so that** testing follows the financial statements.

### Upper Half — P&L

Examples:

- Revenue / Sales.
- Cost of Goods Sold.
- Operating Expenses.

### Lower Half — Balance Sheet

Examples:

- PPE.
- Inventory.
- Accounts Receivable.
- Cash & Bank Equivalents.

### Required Row Data

- Current Year balance.
- Prior Year comparative.
- Variance amount.
- Variance percentage.
- Risk status.
- `[AR Test]` action.
- `[Audit Workprogram]` action.

---

## US-M3-002 — Analytical Review

**As an auditor,**  
I want an Analytical Review interface per FSLI,  
**so that** variances and plausibility can be documented.

### Required Functions

- Multi-period variance calculation.
- Ratio/plausibility assessment.
- Investigation notes.
- Source references.
- CY/PY values.
- Attributable sign-off.
- TB/mapping/plan revision references.

### Acceptance Criteria

- Sign-off requires analysis.
- Stale TB/mapping/plan invalidates prior review.
- Reopening restores saved content.

---

## US-M3-003 — ISA 570 Going Concern

**As an auditor,**  
I want a mandatory Going Concern assessment,  
**so that** the engagement includes source-required ISA 570 work.

### Acceptance Criteria

- Questions start unassessed.
- User deliberately records answers.
- Written conclusion is mandatory.
- Sign-off retains actor and timestamp.

---

## US-M3-004 — FSLI Workprograms

**As a Preparer,**  
I want preloaded standard workprograms per FSLI,  
**so that** standard audit procedures are consistently executed.

### Required Assertions

- Ownership
- Valuation
- Completeness
- Existence
- Cut-off

### Acceptance Criteria

- Applicable FSLIs expose the standard assertions.
- Procedure state is persisted.
- Procedures link to evidence.
- Completed procedures can be submitted for review.

---

## US-M3-005 — Ad-Hoc Audit Procedures

**As an auditor,**  
I want to insert custom procedures into active workprograms,  
**so that** unique engagement risks can be addressed.

### Acceptance Criteria

- Requires title, instructions, and insertion reason.
- Added step becomes part of active workprogram.
- History records the insertion.

---

## US-M3-006 — Sampling Engine

**As an auditor,**  
I want the required sampling methods built in,  
**so that** sample selection is controlled and reproducible.

### Required Methods

- Monetary Unit Sampling (MUS).
- Systematic Random Sampling.
- Stratified Attribute Sampling.

### Acceptance Criteria

- Sampling requires complete reconciled population.
- Sample size cannot exceed population.
- Parameters/seed are retained where applicable.
- Regeneration resets/stales prior test outcomes.
- Systematic method must not exclude population tail items.

---

## US-M3-007 — Hybrid Evidence Linking

**As a Preparer,**  
I want both digital and physical evidence references,  
**so that** audit support can be traced regardless of storage type.

### Digital Evidence

- Spreadsheets.
- PDFs.
- PBC uploads.

### Physical Evidence Example

`X-1, Box 3, Shelf B`

### Acceptance Criteria

- Evidence links to exact engagement/workpaper/procedure.
- Physical index uses a controlled format.
- Reviewer can inspect both forms of evidence.

---

## US-M3-008 — Row-Level Concurrency

**As an audit team,**  
I want different auditors to work on different FSLIs concurrently,  
**so that** there is no file-wide lockout.

### Acceptance Criteria

- Different rows can be edited by different users.
- Same-row conflicting edits are detected/resolved.
- One row edit cannot overwrite another.
- Current lock/revision status is visible.

---

## US-M3-009 — Preparer Submission

**As a Preparer,**  
I want to submit completed work for review,  
**so that** formal review can begin.

### Acceptance Criteria

- Required work/evidence exists before submission.
- Actor/timestamp and exact revision are retained.

---

## US-M3-010 — Reviewer Return & Rework

**As a Reviewer,**  
I want to return incomplete work with mandatory comments,  
**so that** corrections are explicit.

### Acceptance Criteria

- Return requires comments.
- Status becomes **Under Rework**.
- Work returns to Preparer.
- Comments remain in history.
- Corrected work can be resubmitted.

---

## US-M3-011 — Summary Review Memorandum (SRM)

**As the Audit Manager,**  
I want the SRM compiled after managerial clearance,  
**so that** the Partner receives a consolidated engagement summary.

### Required Contents

- High-level variances.
- AJEs.
- Unadjusted differences against SAD/PM.
- Significant accounting estimates.
- Relevant risks.
- Confirmation status.
- Manager recommendation.

### Acceptance Criteria

- SRM is versioned.
- SRM becomes stale when its underlying review basis changes.
- Managerial review precedes current SRM completion.

---

## US-M3-012 — Partner High-Risk Review

**As the Engagement Partner,**  
I want to review Red areas and the current SRM,  
**so that** reporting is not unlocked before high-risk matters are cleared.

### Acceptance Criteria

- Red areas requiring Partner review are identifiable.
- Partner clearance references current SRM/review basis.
- Reporting remains blocked until current clearance exists.

---

## US-M3-013 — Third-Party Confirmations

**As an audit team,**  
I want a centralized confirmations dashboard,  
**so that** external confirmations are tracked consistently.

### Required Categories

1. Bank
2. Accounts Receivable
3. Accounts Payable
4. Inventory
5. Legal

### Acceptance Criteria

- Confirmation is engagement/FSLI-scoped.
- Status and evidence are retained.
- Critical confirmation status participates in report-release blockers.

---

## US-M3-014 — Critical Confirmation Holding Letter

**As the audit team,**  
I want missing critical confirmations to block final release and generate a Holding Letter,  
**so that** unresolved external evidence cannot be bypassed.

### Acceptance Criteria

- Critical unreturned confirmation blocks final report release.
- System generates `Pending Confirmation / Holding Letter`.
- Holding Letter records source blockers.
- Holding Letter does not clear the critical-confirmation blocker.
- Letter is retained/versioned.

---

# 7. Module 4 — Reporting & Final Deliverables

## US-M4-001 — Partner-Only Opinion Selection

**As the Engagement Partner,**  
I want exclusive access to final opinion selection,  
**so that** only the Approver determines the audit opinion.

### Required Options

1. Clean / Unqualified.
2. Qualified.
3. Disclaimer.
4. Adverse.

### Acceptance Criteria

- Non-Partner users cannot finalize opinion selection.
- Opinion is attributable and revisioned.

---

## US-M4-002 — Modified Opinion Builder

**As the Engagement Partner,**  
I want mandatory FSLI and rationale inputs for a modified opinion,  
**so that** the reporting basis is documented.

### Applies To

- Qualified.
- Disclaimer.
- Adverse.

### Required Inputs

- Affected FSLI.
- Mandatory textual rationale.

### Acceptance Criteria

- Modified opinion cannot be saved without both fields.
- Rationale is injected into Basis for Qualified/Modified Opinion.

---

## US-M4-003 — Digital Partner Credentials

**As the Engagement Partner,**  
I want my digital signature and official firm seal on the final certified output,  
**so that** the report contains the required credentials.

### Acceptance Criteria

- Credentials belong to engagement Partner.
- Final report identifies the Partner.
- Credentials are applied after Partner approval.

---

## US-M4-004 — Mandatory Five-Part Deliverables Bundle

**As the Engagement Partner,**  
I want the exact required five-part package,  
**so that** final delivery is standardized.

### Exact Deliverables

1. **Independent Auditor's Report & Audited Financial Statements** — certified, sealed, digitally signed PDF.
2. **Management Letter** — Deficiency → Impact → Auditor Recommendation.
3. **Letter of Representation (LOR)** — engagement figures populated, client-letterhead ready, exportable for signature, signed by executive management, re-uploadable.
4. **Management Correspondences Audit Trail** — formal inquiries, confirmations, cleared queries.
5. **Final Balance Fee Note** — remaining 50% invoice.

### Acceptance Criteria

- Partner authorization precedes final release.
- Package contains exactly the five semantic deliverables.
- Deliverable 1 contains actual audited statement content, not merely statement names.
- Deliverable 5 uses actual persisted final-invoice identity.
- Historical revisions remain distinguishable.

---

## US-M4-005 — Final 50% Invoice

**As the billing process,**  
I want the final fee note generated for the remaining 50%,  
**so that** billing reconciles to the contracted fee.

### Acceptance Criteria

- Final balance = agreed fee less recognized advance.
- One persisted invoice identity is reused in bundle, billing, portal, and AR aging.

---

## US-M4-006 — Final Release to Client

**As the Engagement Partner,**  
I want to release the exact authorized bundle to the Client,  
**so that** only finalized documents become externally visible.

### Acceptance Criteria

- Only released bundle is downloadable by client.
- Generated-but-unreleased bundle remains internal.
- Release actor/date/time are retained.
- Released package retains its own opinion revision.
- Release freezes client uploads.

---

## US-M4-007 — 60-Day Compliance Countdown

**As the firm,**  
I want a 60-calendar-day file-completion countdown from Partner signature date,  
**so that** the archive becomes permanently read-only at the required point.

### Acceptance Criteria

- Countdown starts from Partner signature/report date.
- Due date = signature date + 60 calendar days.
- On expiry, read-only lock occurs automatically.
- Partner may trigger early manual lock.

---

## US-M4-008 — Permanent Read-Only Archive

**As the audit firm,**  
I want the entire engagement archive locked after compliance closure,  
**so that** no post-finalization alteration is possible.

### Blocked Operations

- Deletion.
- Modification.
- Overwrite.

### Applies To

- Source records.
- Workpapers.
- Evidence.
- Reviews.
- Approvals.
- Reports.
- Final artifacts.
- Audit history.

### Acceptance Criteria

- Every mutation command checks archive status.
- Archived engagement remains viewable/exportable.
- Archive cannot be reopened through normal workflow.

---

## US-M4-009 — Immutable Audit History

**As a reviewer/regulator,**  
I want timestamped history of actions, reviews, and sign-offs,  
**so that** the engagement has a complete traceable audit trail.

### Minimum Events

- Acceptance recommendation and Partner decision.
- Proposal approval/dispatch/client response.
- EL issue.
- Invoices and receipts.
- PBC status changes.
- Planning revisions/sign-off.
- Fieldwork submission/rework.
- Review notes.
- SRM generation.
- Partner clearance.
- Opinion selection.
- Deliverable generation/release.
- Archive lock.

---

# 8. Module 5 — Practice Analytics & Internal Bookkeeping

## US-M5-001 — Daily Engagement / FSLI Time

**As an audit staff member,**  
I want to record daily hours against an engagement and FSLI,  
**so that** utilization, budget variance, and profitability can be calculated.

### Required Data

- Staff member.
- Engagement.
- FSLI/task.
- Date.
- Duration/hours.
- Applicable role/rate.

---

## US-M5-002 — Standard Charge-Out Rates

| Role | QAR/hour |
|---|---:|
| Engagement Partner | 1,000 |
| Audit Manager | 750 |
| Audit Supervisor / Senior | 500 |
| Audit Associate / Junior | 200 |

---

## US-M5-003 — Engagement Profitability

### Exact Formula

```text
Total Engagement Cost
= Σ (Logged Hours per Role × Role Charge-Out Rate)

Engagement Profitability
= Contracted Engagement Fee - Total Engagement Cost
```

### Acceptance Criteria

- Internal staff cost rate must not replace the source-required charge-out rate.
- Missing charge-out rate produces an incomplete/Unknown metric rather than a fabricated value.
- Calculation reconciles to time entries.

---

## US-M5-004 — Budget vs Actual

**As an Audit Manager,**  
I want budgeted vs actual hours by engagement phase,  
**so that** realization and staff performance can be assessed.

### Acceptance Criteria

- Budget exists by phase.
- Actuals come from time logs.
- Phase variance and total variance reconcile.

---

## US-M5-005 — Practice Ledger

**As firm management,**  
I want a dedicated internal ledger separate from client TB data,  
**so that** operational transactions can be recorded.

### Required Categories

- Office Rent & Facility Costs.
- Staff Salaries & Benefits.
- Partner Withdrawals.
- Petty Cash Expenses.

### Acceptance Criteria

- Firm ledger is separate from client TB.
- Each entry retains date, description, amount, category/account, reference, and actor.

### Source Ambiguity Note

The source requires recording **Partner Withdrawals** but does not prescribe their exact accounting presentation in P&L/equity. Do not invent a definitive treatment without separate instruction.

---

## US-M5-006 — Internal Firm Trial Balance

**As firm management,**  
I want an internal Trial Balance,  
**so that** practice balances can be reviewed.

### Acceptance Criteria

- Debit/credit totals reconcile.
- Report is firm-level, not client-level.
- Currency is QAR unless specifically configured otherwise.

---

## US-M5-007 — Internal Monthly P&L

**As firm management,**  
I want a monthly P&L,  
**so that** practice financial performance can be reviewed.

### Acceptance Criteria

- Revenue/expenses reconcile to internal source records.
- Reporting period is explicit.
- Partner Withdrawals are not silently classified without an agreed policy.

---

## US-M5-008 — Client AR Aging

**As billing/management,**  
I want an AR Aging schedule,  
**so that** outstanding 50% advance and final balances can be monitored.

### Acceptance Criteria

- Advance and final invoices are distinguishable.
- Paid vs outstanding is clear.
- Aging is calculated consistently from due-date logic.

---

# 9. Client PBC Portal User Stories

## US-PBC-001 — Isolated Client Workspace

**As a client,**  
I want to see only authorized client/engagement content,  
**so that** other client/internal audit data is never exposed.

### Acceptance Criteria

- Client is scoped to permitted engagement(s).
- Internal workpapers/notes are excluded unless explicitly client-facing.
- Historical engagement access respects authorization.

---

## US-PBC-002 — PBC Upload

**As a Client Audit Liaison,**  
I want to upload requested schedules/evidence,  
**so that** the audit team can review PBC items.

### Acceptance Criteria

- Upload links to a specific request.
- Upload blocked before password reset.
- Upload blocked after final release.
- Re-upload permitted after rejection.

---

## US-PBC-003 — PBC Review Feedback

**As a client,**  
I want to see review status and rejection reasons,  
**so that** I can correct rejected evidence.

### Acceptance Criteria

- Required status vocabulary is used.
- Rejection reason is mandatory.
- Reason is visible to Client.

---

## US-PBC-004 — Client Finance Documents

**As an authorized client user,**  
I want engagement-specific invoices and receipts,  
**so that** I can track audit-fee payments.

### Acceptance Criteria

- Finance records are engagement-scoped where engagement IDs exist.
- Draft/internal-only invoices are not presented as issued client documents.

---

## US-PBC-005 — Holding Letters

**As client management,**  
I want issued Holding Letters visible when critical confirmations are outstanding,  
**so that** I understand why report release is blocked.

### Acceptance Criteria

- Only generated/issued letters are visible.
- Letter references blocking confirmations.
- Letter does not indicate blocker is cleared.

---

## US-PBC-006 — Final Deliverables

**As a client,**  
I want only Partner-released final deliverables downloadable,  
**so that** drafts cannot be exposed.

### Acceptance Criteria

- Only released/delivered revisions are visible.
- Each package displays its own opinion/revision.
- Uploads are frozen after final report release.

---

# 10. Canonical 11-State Lifecycle

```text
LEAD_INGESTION
    ↓
PROPOSAL_GENERATION
    ↓
DUAL_KEY_PENDING
    ↓
ADVANCE_BILLING
    ↓
PORTAL_ACTIVE_PLANNING
    ↓
FIELDWORK_EXECUTION
    ↓
MANAGERIAL_REVIEW
    ↓
PARTNER_APPROVAL
    ↓
DELIVERABLE_RELEASE
    ↓
COMPLIANCE_COUNTDOWN
    ↓
ARCHIVED_READ_ONLY
```

| State | Allowed Actions | Gate to Advance | Next State |
|---|---|---|---|
| `LEAD_INGESTION` | Log inquiry, company, contact | Minimum entity + primary contact valid | `PROPOSAL_GENERATION` |
| `PROPOSAL_GENERATION` | Build Brief/Comprehensive proposal; dispatch | Email/WhatsApp dispatch completed | `DUAL_KEY_PENDING` |
| `DUAL_KEY_PENDING` | Complete acceptance; record commercial approval | Client acceptance + Partner AML/risk approval | `ADVANCE_BILLING` |
| `ADVANCE_BILLING` | Generate EL + 50% invoice | 50% advance payment confirmed | `PORTAL_ACTIVE_PLANNING` |
| `PORTAL_ACTIVE_PLANNING` | Portal, staffing, TB, materiality | Partner planning sign-off + mapped TB | `FIELDWORK_EXECUTION` |
| `FIELDWORK_EXECUTION` | Workprograms, evidence, confirmations | Assigned FSLI procedures submitted | `MANAGERIAL_REVIEW` |
| `MANAGERIAL_REVIEW` | Review/rework, compile SRM | Zero open review notes + SRM + critical confirmations returned | `PARTNER_APPROVAL` |
| `PARTNER_APPROVAL` | Review SRM/Red areas, select opinion | Partner signature/seal applied | `DELIVERABLE_RELEASE` |
| `DELIVERABLE_RELEASE` | Five-part bundle, final 50% invoice, freeze client uploads | Final package delivered | `COMPLIANCE_COUNTDOWN` |
| `COMPLIANCE_COUNTDOWN` | Final archive review; optional Partner early lock | 60 days elapsed OR manual lock | `ARCHIVED_READ_ONLY` |
| `ARCHIVED_READ_ONLY` | Read-only viewing / regulator export | Permanently locked | Terminal |

### Lifecycle Acceptance Criteria

- No state can be skipped through direct command invocation.
- UI and command layer use identical gate logic.
- Historical revisions are distinguishable from the current basis.
- `ARCHIVED_READ_ONLY` blocks all engagement mutations.

---

# 11. End-to-End User Journeys

## E2E-001 — Lead to Portal Activation

1. Capture lead.
2. Create Brief or Comprehensive Proposal.
3. Dispatch by Email/WhatsApp.
4. Record client commercial approval.
5. Complete Partner risk clearance.
6. Generate EL + 50% advance invoice.
7. Record payment.
8. Generate official receipt.
9. Provision portal.
10. Enforce first-login password reset.

**Expected result:** engagement reaches `PORTAL_ACTIVE_PLANNING`.

---

## E2E-002 — Planning to Approved Materiality

1. Provision exact five folders.
2. Schedule team.
3. Record capacity/leave/utilization.
4. Import TB.
5. Confirm FSLI mapping.
6. Select benchmark and rates.
7. Calculate PM/TE/SAD.
8. Apply optional ±5% rounding.
9. Classify Green/Amber/Red.
10. Partner approves planning.

**Expected result:** engagement may enter `FIELDWORK_EXECUTION`.

---

## E2E-003 — Fieldwork to Partner Approval

1. Generate split dashboard.
2. Perform AR Test and ISA 570 assessment.
3. Execute standard workprograms.
4. Add ad-hoc procedures if needed.
5. Generate samples.
6. Link digital/physical evidence.
7. Submit work.
8. Reviewer returns deficiencies with mandatory comments.
9. Preparer reworks and resubmits.
10. Manager clears work.
11. SRM compiles.
12. Track confirmations.
13. Critical missing confirmation blocks release and generates Holding Letter.
14. Partner reviews Red areas and SRM.

**Expected result:** current review basis is ready for `PARTNER_APPROVAL`.

---

## E2E-004 — Opinion to Archive

1. Partner selects one of four opinions.
2. Modified opinion requires FSLI + rationale.
3. Partner applies credentials.
4. Generate exact five-part bundle.
5. Persist final 50% invoice.
6. Partner releases exact bundle.
7. Client uploads freeze.
8. Start 60-day countdown.
9. Expiry or early Partner lock freezes archive.

**Expected result:** `ARCHIVED_READ_ONLY`.

---

## E2E-005 — Time, Profitability & Practice Ledger

1. Staff logs hours.
2. Apply required role charge-out rates.
3. Calculate engagement cost/profitability.
4. Compare budget vs actual.
5. Record firm expenses.
6. Generate internal TB.
7. Generate monthly P&L.
8. Generate AR Aging.

**Expected result:** practice analytics reconcile to time, billing, and firm-ledger data.

---

# 12. Negative & Blocking Scenarios

## Commercial

- Missing lead contact data blocks progression.
- Undispatched proposal cannot clear proposal state.
- Acceptance of superseded proposal cannot clear Key 1.
- EL generation with only one Dual-Key approval is blocked.
- Unpaid advance keeps portal/planning gate closed.

## Acceptance / Planning

- Missing Track A mandatory checks/evidence blocks acceptance.
- Unassessed Track B deltas block continuance.
- Unrelated prior period cannot satisfy continuance.
- Materiality rate outside band is rejected.
- TE outside 50–75% rejected.
- SAD outside 3–5% rejected.
- Rounding over ±5% rejected.
- Non-Partner final planning approval rejected.
- TB change stales planning approval.

## Fieldwork

- Sampling from incomplete population rejected.
- Workpaper without required work/evidence cannot be submitted.
- Reviewer return without comments rejected.
- AR review becomes stale after TB/mapping/plan change.
- Critical confirmation blocks release.

## Reporting

- Non-Partner opinion selection rejected.
- Modified opinion without FSLI/rationale rejected.
- Generated but unreleased final bundle hidden from Client.
- Final invoice reconciles to remaining balance.
- Writes after archive freeze rejected.

---

# 13. Data & Revision Integrity

Every critical record should retain as applicable:

- Engagement ID.
- Client ID.
- Reporting year/period.
- Revision/version.
- Actor/user.
- Timestamp.
- Status.
- Source/basis references.

### Records Requiring Traceability

- Proposal and presented snapshot.
- Client response.
- Acceptance/continuance.
- Engagement Letter.
- Invoices/receipts.
- TB source.
- Mapping revision.
- Audit plan/materiality.
- Analytical Review.
- Workprogram/procedure.
- Workpaper.
- Sample.
- Confirmation.
- Review notes.
- SRM.
- Partner clearance.
- Audit opinion.
- Deliverables.
- Archive state.

---

# 14. UI/UX Requirements Derived from Functional Behavior

The source is primarily functional. UI must support the required workflow without creating extra product scope.

1. Primary navigation reflects the five modules.
2. Role-specific actions reflect Preparer, Reviewer, Approver, and Client responsibilities.
3. Blocked actions explain the missing gate.
4. Current vs historical revisions are visually distinguishable.
5. PBC/review/lifecycle/archive statuses match persisted state.
6. Audit dashboard shows P&L upper section and B/S lower section with CY/PY/variance and action buttons.
7. Green/Amber/Red risk is accompanied by text, not color alone.
8. Client workspace shows only client-facing scope.
9. Frozen engagement hides/disables edits and command layer also blocks writes.

---

# 15. Authority & Access Rules

### Preparer

- Execute assigned work.
- Attach evidence.
- Submit work.
- Log time.

### Reviewer

- Review/return work.
- Enter mandatory comments.
- Prepare SRM.
- Manage scheduling/materiality inputs according to source workflow.

### Partner

- Client acceptance/continuance final sign-off.
- Planning/materiality approval.
- Red-area and SRM clearance.
- Opinion selection.
- Final release.
- Manual archive lock.

### Client

- PBC portal only.
- Upload requests while upload window is open.
- View relevant invoices/receipts/Holding Letters/released final deliverables.

### Acceptance Criteria

- Role restrictions are enforced at command/business-rule layer, not only UI.
- Client cannot access internal audit workpapers/notes outside client-facing scope.
- Frozen engagements reject writes regardless of page/UI state.

---

# 16. Required Test Matrix

## Module 1

- All intake channels.
- Hierarchy.
- Contact routing.
- Brief vs Comprehensive proposal.
- Email/WhatsApp dispatch.
- Dual-Key positive and negative cases.
- EL and advance invoice.
- Payment/receipt.
- Password reset.
- PBC statuses/rejection reason.

## Module 2

- Track A and Track B.
- Partner acceptance gate.
- Exact five folders.
- Scheduling capacity/leave.
- Configurable milestones.
- TB import and mapping memory.
- PM/TE/SAD.
- ±5% rounding.
- Red risk override.
- Partner planning approval.

## Module 3

- Split dashboard.
- CY/PY/variance.
- AR Test + ISA 570.
- Five assertions.
- Ad-hoc steps.
- MUS/Systematic Random/Stratified Attribute.
- Digital/physical evidence.
- Row concurrency.
- Preparer→Reviewer→Partner.
- Mandatory rework comments.
- SRM.
- Five confirmation categories.
- Holding Letter blocker.

## Module 4

- Four opinions.
- Modified opinion builder.
- Partner-only opinion/release authority.
- Exact five deliverables.
- Actual audited FS content.
- LOR workflow.
- Final 50% invoice.
- Client release filtering.
- 60-day expiry.
- Partner early lock.
- Post-lock write rejection.

## Module 5

- Exact charge-out rates.
- Time by engagement/FSLI.
- Profitability formula.
- Budget/actual variance.
- Practice ledger categories.
- Internal TB/P&L/AR Aging.

---

# 17. Definition of Done

The implementation is complete only when:

1. All five modules are connected.
2. Four source personas are represented in responsibility/authority mapping.
3. The exact 11-state lifecycle is canonical.
4. All five end-to-end flows can be demonstrated.
5. UI and command/business-rule gates are identical.
6. Dual-Key gate is enforced.
7. EL + 50% advance invoice occur only after Dual-Key clearance.
8. Portal/planning does not activate before advance settlement.
9. Exact five-folder taxonomy is provisioned.
10. Materiality benchmark bands, TE, SAD, ±5% rounding, and risk colors are enforced.
11. Partner planning approval is current and source-pinned.
12. Split P&L/BS dashboard exposes AR and Workprogram actions.
13. Analytical Review and ISA 570 persist and can be reviewed.
14. Standard assertions and all three required sampling methods are implemented.
15. Three-tier review/rework is enforced.
16. SRM contains source-required summary content.
17. Five required confirmation categories exist.
18. Critical confirmation blocks final report and produces Holding Letter.
19. Partner controls opinion and final release.
20. Exact five-part bundle is produced.
21. Final 50% invoice identity is consistent across all product surfaces.
22. Client sees only released deliverables.
23. Client uploads freeze on final report release.
24. 60-day expiry or Partner early lock makes the entire engagement read-only.
25. Audit history remains timestamped and attributable.
26. Daily time drives profitability using exact source charge-out rates.
27. Practice ledger produces TB, monthly P&L, and AR Aging.
28. No unrelated modules/features are presented as source requirements without separate approval.
29. Positive and negative tests pass for every workflow gate.
30. Every source requirement can be traced to demonstrable product behavior.

---

# 18. Requirement Traceability Summary

| Source Area | User Stories |
|---|---|
| Business Objectives | EPIC-001 |
| Personas | US-PER-001 to US-PER-004 |
| Commercial / CRM | US-M1-001 to US-M1-013 |
| Governance / Planning | US-M2-001 to US-M2-013 |
| Technical Fieldwork | US-M3-001 to US-M3-014 |
| Reporting / Deliverables | US-M4-001 to US-M4-009 |
| Practice Management | US-M5-001 to US-M5-008 |
| Client PBC | US-PBC-001 to US-PBC-006 |
| Flow 1 | E2E-001 |
| Flow 2 | E2E-002 |
| Flow 3 | E2E-003 |
| Flow 4 | E2E-004 |
| Flow 5 | E2E-005 |
| State Machine | Section 10 |
| Negative Paths | Section 12 |
| Definition of Done | Section 17 |

---

# 19. Final Implementation Constraint

This specification is intentionally bounded to **Audit Management Tool Specification v2.1**.

Do not introduce unrelated product modules, infrastructure-driven business features, additional lifecycle states, unrelated confirmation categories, or broader accounting/administration products and present them as requirements unless separately approved.

Where the source document is silent on implementation technology, preserve the functional requirement and treat the technical mechanism as an implementation decision rather than a new business requirement.
