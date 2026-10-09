# AuditSphere UAT plan

## Release boundary

This is a preparation document, not a UAT pass or production approval. Run it only
against a dedicated staging Worker, D1 database and R2 bucket after the residency
and transfer decision in SP-04 is recorded. The current public production Worker
is not a staging target and must not receive synthetic load, failure drills, or
confidential client data.

The active implementation epic has no application authentication. Test personas
are self-selected workflow context and do not identify or authenticate a person.
Do not enter real client records or claim that persona checks provide access
control. The old login and password-reset steps in the source journeys are outside
this profile and must not be simulated as completed.

## Entry criteria

- [ ] Applicable data-protection regime, cross-border transfer decision, approved
  D1/R2 location, and retention term are recorded by the firm/legal adviser.
- [ ] A trusted staging perimeter is verified. The public production Worker is
  excluded.
- [ ] Staging readiness reports `environment=staging`; its D1/R2/Worker bindings
  are isolated from production.
- [ ] Deployed build identity and staging resource IDs are recorded in the UAT log.
- [ ] An owner-approved synthetic dataset and cleanup/reset procedure are ready.
- [ ] Test mailbox and recipient are verified and approved for non-production
  messages. Until then, exercise dispatch with a non-delivery test double only.
- [ ] Required local regression suite and focused journey tests pass for the
  deployed build.

## Operators and synthetic workflow profiles

The firm must fill in named operators after the data-protection and staging gates
are met. Do not invent names or store login credentials here. The current product
does not authenticate these people; profile IDs only select workflow behavior.

| Operator name / approval | Workflow profile | Synthetic profile ID | Notes |
|---|---|---|---|
| TODO | PREPARER | TODO | Executes assigned preparation and evidence steps |
| TODO | REVIEWER | TODO | Records review and rework decisions |
| TODO | APPROVER | TODO | Records Partner-level approval/release actions |
| TODO | CLIENT | TODO | Sees client-facing requests and released files only |

## End-to-end journeys

All rows start as **Not run**. Record only synthetic workspace, client,
engagement, command, and dispatch identifiers in `uat-log.md`; never copy mail
bodies, document contents, addresses, secrets, or client information.

### E2E-001 — Lead to portal activation

1. As staff, submit a synthetic lead with the required contact fields.
2. Create a brief or comprehensive proposal and record dispatch using the
   verified non-production email destination or a test double.
3. Record the synthetic CLIENT response and the required risk/acceptance decisions
   using the approved workflow profiles.
4. Generate the engagement letter and 50% advance invoice.
5. Record a synthetic offline payment and official receipt; do not initiate a
   real payment.
6. Open the client-facing projection using the synthetic CLIENT profile.
7. Verify the expected planning-portal lifecycle state and that the portal exposes
   only that client's allowed files.

**Expected:** portal reaches `PORTAL_ACTIVE_PLANNING` only after the commercial,
risk, advance and receipt gates are complete. Password reset is not applicable in
the no-auth profile. Capture gate responses, lifecycle transition, and client
projection IDs.

### E2E-002 — Planning to approved materiality

1. Provision the exact five engagement folders in isolated staging storage.
2. Schedule synthetic staff and record capacity, leave, and utilization.
3. Import the approved synthetic trial balance and confirm each FSLI mapping.
4. Select the benchmark and rates; calculate PM, TE, and SAD.
5. Exercise the optional rounding boundary and classify Green/Amber/Red risk.
6. Record the Partner-level planning approval with its required rationale.

**Expected:** approved planning reflects the current trial-balance and mapping
revision and permits fieldwork only when statutory and readiness gates pass.
Capture source file hash, revision IDs, calculation basis, and approval record.

### E2E-003 — Fieldwork to Partner approval

1. Generate the split financial-statement dashboard and reconcile its source lines.
2. Perform AR testing and ISA 570 assessment using synthetic balances.
3. Execute standard workprograms and, where needed, a required ad-hoc procedure.
4. Generate samples and link synthetic digital/physical-index evidence.
5. Submit preparation; have REVIEWER return an intentional deficiency with a
   comment, then verify assigned rework and resubmit a new revision.
6. Clear work, compile the SRM, and track synthetic confirmations.
7. Leave one critical confirmation missing and verify the holding-letter and
   release blockers. Complete it, then obtain APPROVER clearance for Red areas.

**Expected:** stale evidence and incomplete work are blocked, review rework is
versioned, and the current review basis becomes ready for Partner approval only
after critical blockers are cleared. Capture revisions, audit event IDs, and
blocker codes.

### E2E-004 — Opinion to archive

1. Select an unmodified opinion; separately verify a modified opinion requires
   both an FSLI and rationale.
2. Apply approved synthetic professional qualification data/assets and generate the exact five-part
   deliverable bundle.
3. Verify the final 50% invoice and release the exact current bundle.
4. Confirm client uploads freeze and the archive countdown begins.
5. In isolated staging, exercise the expiry path and the Partner early-lock path;
   verify reads remain available and writes are rejected.

**Expected:** only released deliverables are visible to CLIENT; the archived
engagement is `ARCHIVED_READ_ONLY`. Capture the bundle manifest, hashes, lifecycle
timestamps, and denied write result. R2 retention-lock claims require the separate
staging canary in E05-S05.

### E2E-005 — Time, profitability, and practice ledger

1. Log synthetic hours against an engagement and FSLI.
2. Apply the approved role rates and reconcile engagement cost/profitability.
3. Compare budget to actual.
4. Record synthetic firm expenses and generate firm trial balance, monthly P&L,
   and AR aging.

**Expected:** practice reports reconcile to time, billing, and firm-ledger records;
client accounting data remains separate. Capture report IDs, date range, and
reconciliation totals.

## Negative and blocking scenarios

Run these against synthetic staging data. For each, record the operation, expected
safe rejection, actual status/error code, and audit evidence. No rejected case may
create a partial business transition.

| Area | Scenario | Expected result | Status / evidence |
|---|---|---|---|
| Commercial | Lead lacks required contact data | Validation blocks progression | Not run / TODO |
| Commercial | Proposal has not been dispatched | Acceptance transition is blocked | Not run / TODO |
| Commercial | Response targets a superseded proposal | Key 1 remains uncleared | Not run / TODO |
| Commercial | Engagement letter has only one Dual-Key approval | Generation is blocked | Not run / TODO |
| Commercial | Advance is unpaid or lacks committed receipt evidence | Portal/planning gate stays closed | Not run / TODO |
| Planning | Mandatory Track A evidence is absent | Acceptance is blocked with missing items | Not run / TODO |
| Planning | Track B continuance delta is unassessed | Continuance is blocked | Not run / TODO |
| Planning | Prior period is unrelated | It cannot satisfy continuance | Not run / TODO |
| Planning | Materiality rate is outside its allowed band | Input is rejected | Not run / TODO |
| Planning | TE is outside 50–75% | Input is rejected | Not run / TODO |
| Planning | SAD is outside 3–5% | Input is rejected | Not run / TODO |
| Planning | Rounding exceeds ±5% | Input is rejected | Not run / TODO |
| Planning | Non-Partner profile approves final planning | Command is denied | Not run / TODO |
| Planning | TB changes after planning approval | Approval is stale and fieldwork is blocked | Not run / TODO |
| Fieldwork | Sample request uses incomplete population | Request is rejected | Not run / TODO |
| Fieldwork | Workpaper lacks required work/evidence | Submission is rejected | Not run / TODO |
| Fieldwork | Review return has no comments | Return is rejected | Not run / TODO |
| Fieldwork | TB, mapping, or plan changes after AR review | Review is marked stale | Not run / TODO |
| Fieldwork | Critical confirmation is missing | Release is blocked | Not run / TODO |
| Reporting | Non-Partner selects an opinion | Command is denied | Not run / TODO |
| Reporting | Modified opinion omits FSLI or rationale | Command is rejected | Not run / TODO |
| Reporting | Generated final bundle is unreleased | CLIENT cannot see it | Not run / TODO |
| Reporting | Final invoice differs from remaining balance | Release is rejected or reconciled before release | Not run / TODO |
| Reporting | Write is attempted after archive freeze | Command is denied; archive remains intact | Not run / TODO |

## Execution record

Do not mark a row Passed until the exact deployed staging build, sanitized
evidence, and operator are recorded in `uat-log.md`. Current state: **Blocked / not
run** because there is no isolated staging environment and the data-residency
decision is open. This plan does not authorize a production test or deployment.
