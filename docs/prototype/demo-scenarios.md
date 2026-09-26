# AuditSphere Visual Prototype — Demo Scenarios & Fixed Arithmetic (VP-004)

`docs/prototype/demo-scenarios.md` · demo clock `asOfDate = 2026-09-23`

## Named scenario presets (presenter chooser in Shell)

- `full-practice` — complete lifecycle: audit engagement, jobs, PBC, reviews, receivables.
- `accounting-only` — ENG-26002 compilation focus (TB intake → statements).
- `audit-findings` — fieldwork with open review points + finding FND-01.
- `two-component-consolidation` — GRP-01 with QAR 50,000 intercompany elimination.
- `blocked-rework` — release gates blocked (approvals cleared) for gate demo.
- `empty-practice` — zero records; honest empty states; first-setup journey.

Negative-test fixtures (every scenario from the default seed): two engagements for
CL-001 (ENG-26001 + ENG-26003); similar-name CL-001 vs CL-005; two preparers
(Adam Khan, Nadia Rahman) + two reviewers (Sara Malik, Bilal Ahmed); multi-role
Adam Khan (preparer + billing — SoD still by person); disabled Tariq Aziz;
narrow group user Mona Khalil (ENG-26001 only); multi-grant Amal Nasser
(CL-001 + CL-003); and the reserved `superuser` testing identity in the
`System / Prototype Testing` group, which is a navigation shortcut whose
actor-restricted actions are logged as overrides rather than independent decisions.

## Fixed calculation examples (§8.1)

**Accounting:** cash 10,000; receivables 5,000; equipment 8,000; expenses 3,000;
payables −3,000; loan −7,000; opening equity −10,000; revenue −6,000 → signed total
0, assets 23,000, liabilities 10,000, profit 3,000. A 500 depreciation adjustment →
assets 22,500, profit 2,500. A replacement source already containing it leaves
results unchanged (unit-tested).

**Budget:** planned 600 min @ QAR 200/h → 2,000. Actual approved 660 min → 2,200,
variance +60 min. Cost @ 80/h → 880. Missing cost rate → cost/margin unavailable
(unit-tested).

**Receivables @ 2026-09-23:** issued QAR 1,000 due 2026-08-15 + QAR 100 effective
credit + QAR 300 allocated receipt → QAR 600 in 31–60. Post-as-of receipts ignored.
QAR 500 receipt with 300 allocated → 200 unallocated, never auto-applied
(unit-tested, incl. Current/1–30/31–60/61–90/90+ boundaries).

**Consolidation:** two same-currency components + QAR 1,000 intercompany
receivable/payable → elimination debits payable / credits receivable 1,000;
group assets/liabilities fall without touching components. Unmatched 100 stays
visible, never plugged (unit-tested).

## Presenter journeys (happy + failure/rework)

1. Empty practice → create client (duplicate-code + similar-name checks) → lead →
   proposal → manual acceptance → engagement → job from template → PBC →
   evidence → reviews → package → release → archive.
2. Failure/rework: blocked task needs reason; PBC replacement needs re-review;
   self-approval denied by person; stale revision rejected; TB error preview keeps
   old source; a journal whose pinned evidence, workpaper or finding moved is
   excluded from statements and packages with a reason until it is re-pinned and
   independently re-reviewed; GL replacement stales the pinned package lineage;
   mail failure fixture + retry; disconnect keeps local work.
3. These presenter steps are not all automated or fully accepted journeys.
   The current Chrome suite directly exercises shell/scope, M365 setup and
   recovery, identity mapping vs grant separation, staff route rendering, fresh
   annual continuance, generated package/release/amendment/archive, all 16 report
   views and their CSV headers, filtered report export scoping, the configured
   consolidation perimeter/elimination/balance, rejected and accepted CSV/XLSX
   trial-balance revisions, the PBC request/clarification/replacement/acceptance
   cycle, and browser storage recovery.
   It does not establish completion of the remaining journeys in §8 of
   `Gap_Closure_User_Stories.md`.
