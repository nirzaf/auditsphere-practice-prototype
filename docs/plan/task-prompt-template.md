# Task Prompt Template (Layer 5 — written fresh per session)

Copy, fill the brackets, paste into Claude Code / Codex. Keep it under ~25 lines; everything else is in the repo.

```text
Implement Story [ID]: docs/plan/stories/[ID]-[slug].md

Read first (in this order, then stop reading):
  1. CLAUDE.md
  2. docs/plan/stories/[ID]-[slug].md
  3. [doc #1 named in the story's "Read first"]
  4. [doc/file #2]

Pattern to follow: [reference file from CLAUDE.md "Patterns" table]

Constraints:
  - Scope is exactly the story's "In" list. Anything in "Out" or not listed: do not touch.
  - [story-specific fence, e.g. "no change to BUSINESS response shapes"]
  - No new dependencies. No edits to applied migrations. No production commands.

Verify with:
  [commands from the story's "Verify with"]
  then: npm run lint && npm run cloud:typecheck && npm run test:unit && npm run build [&& npm run test:e2e]

Stop and ask if:
  - [story's "Stop and ask if" items]
  - an acceptance criterion contradicts the code you find
  - you need to change a file outside the story's scope

Report (in this order): AC-by-AC status with test names · files changed · commands run + results ·
assumptions · deviations · open questions · proposed follow-up stories.
```

## Filled example — E03-S03

```text
Implement Story E03-S03: docs/plan/stories/E03-S03-session-derived-actor.md

Read first:
  1. CLAUDE.md
  2. docs/plan/stories/E03-S03-session-derived-actor.md
  3. docs/contracts/api-delta.md §2
  4. worker/business.ts — resolveBusinessContext (L554+) and runBusinessDirectoryCommand (L3781+)

Pattern to follow: worker/auth/sessions.ts (from E03-S01) for session validation;
tests/unit/businessPracticeAging.test.ts for pure-unit style.

Constraints:
  - Do not change any business response shape or weaken any guard.
  - Keep X-Actor-Id / envelope.actor accepted when they match the session (removal is E03-S08).
  - Keep BUSINESS_SETUP_ENABLED bootstrap for tests.

Verify with:
  npx tsx --test tests/unit/routeInventory.test.ts tests/unit/businessWorkspace.test.ts
  npm run lint && npm run cloud:typecheck && npm run test:unit && npm run build && npm run test:e2e

Stop and ask if:
  - any handler resolves identity without resolveBusinessContext (list them first)
  - an existing test assertion (not just plumbing) must change

Report: AC-by-AC status with test names · files changed · commands + results · assumptions ·
deviations · open questions · follow-ups.
```

## Filled example — Verify-first story (E05-S04)

```text
Implement Story E05-S04 Step 1 ONLY: docs/plan/stories/E05-S04-client-document-centre.md
Read first: CLAUDE.md; the story; worker/businessDelivery.ts getBusinessDeliveryWorkspace; worker/business.ts getBusinessPbcPortal
Pattern: tests/unit/businessWorkspace.test.ts (worker.fetch + SqliteD1) with tests/helpers/authSession.ts
Constraints: write tests only; no production code changes in this session.
Verify with: npx tsx --test tests/unit/clientDocumentProjection.test.ts
Stop and ask if: a CLIENT response contains internal fields (report it; don't fix yet).
Report: table of each matrix row → PASS/FAIL with evidence; proposed minimal fixes for FAIL rows.
```
