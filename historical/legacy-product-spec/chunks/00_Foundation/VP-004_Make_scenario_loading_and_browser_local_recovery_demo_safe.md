---
id: "VP-004"
title: "Make scenario loading and browser-local recovery demo-safe"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-004"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["VP-002"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:20+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-004 — Make scenario loading and browser-local recovery demo-safe

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Six existing scenario factories, backup/recovery UI, versioned metadata and different blob-storage classes.

## Bounded implementation / verification steps

1. Exercise corrupt-but-valid JSON, future schema, ambiguous historical references, denied storage and quota/conflict recovery using existing fixtures.
2. Verify recovery/export/import/reset choices preserve recoverable payloads and report exactly what is restored; do not silently clear browser work.
3. Inspect downloaded recovery bytes and compare scenario metadata/blob references. Keep a presenter-controlled reset and no automatic background recovery.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-004, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-004)

Source action locators: `VP-004-E01`, `VP-004-E02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/store/scenarios.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/scenarios.ts)
- [`src/components/layout/Shell.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Invalid/future data is preserved for export and cannot silently overwrite the last valid state.
- [x] Import rejects wrong-scope/broken references without partial state changes.
- [x] Scenario switching warns about unsaved work and produces coherent empty/blocked/full-practice fixtures.
- [x] Metadata exports never falsely promise recovery of source bytes absent from that storage class.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`) |
| Browser / viewport / build | Suite run (headless Chrome E2E, Windows) + code inspection |
| Persona and client/engagement / fixture | Six scenario presets (`full-practice`, `accounting-only`, `audit-findings`, `two-component-consolidation`, `blocked-rework`, `empty-practice`) produce coherent fixtures (`scenarios.ts:22-105`) |
| Exact original criterion and assertion | Load path preserves payloads in every failure branch (corrupt JSON, future schema, migration/integrity failure, ambiguous state) with backup written and a recovery message (`prototypeStore.ts:88-113`); `importStateJSON` is atomic — rejects before any state change, backs up before commit, reports "Prior payload preserved" (`prototypeStore.ts:4424-4451`); scenario switching warns through the shared dirty-form guard (extended 2026-09-25 to planning/risks/workbench drafts); reset is presenter-controlled with confirm and backup notice; no automatic background recovery; storage classes documented (uploads = metadata + SHA-256, bytes in-session; generated artifacts = IndexedDB bytes re-verified against SHA-256) |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 172/172 PASS (guards.test.ts fixture-validation FK/date/PII/imbalance, migrations 0–22, expired-import rejection, cash-flow reference validation); `npm run test:e2e` 74/74 PASS including the AT-02/AT-54 storage-conflict journey (malformed/preserved payload, future-schema backup, ambiguous-import rejection) |
| Output or screenshot / hash | `e2e-final.log` (74/74); `docs/prototype/verification.md` 2026-09-25 (2) row; `tracking/ACCEPTANCE_EVIDENCE.md`; tracker VP-004-E01/E02 checked |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment; downloaded-recovery-bytes inspection covered by the existing AT-41/AT-42 artifact SHA-256 checks in the suite |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

**Storage clarification (2026-09-26):** “Uploads” in the historical criterion above means registered library/evidence originals: only metadata and SHA-256 persist, while original bytes remain in-session. Accepted PBC response bytes are a separate class and persist in browser-local IndexedDB; generated artifacts also use IndexedDB with SHA-256 verification. The current [scope/storage guidance](../../reference/SCOPE_AND_STORAGE_BOUNDARIES.md) and README describe these distinctions.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
