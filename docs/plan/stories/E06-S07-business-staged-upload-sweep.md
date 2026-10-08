# E06-S07 — BUSINESS staged-upload sweep (VERIFY FIRST)

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S07 | E06 | Verify → Feature | P2 | S | M1 | NFR REL; cost control |

## Intent
The only staged-file cleanup today (`cleanupStagedFiles` in `worker/files.ts`) sweeps the legacy `file_objects` table and is deleted in E01-S02. BUSINESS uploads (`file_versions`, `file.reserve` → `PUT content` → `file.commit`) may leave reserved/staged rows and R2 objects when a user abandons an upload.

## Step 1 — Verify
Write a test that reserves and stages a file, never commits, advances the clock 48 h, runs `scheduled()`, and reports what remains in D1 and R2. Also check whether `rejected_upload_attempts` or any outbox `VERIFY_FILE` job already handles this.

## Step 2 — If orphans remain
Add a bounded sweep (≤ 200 per run) in `scheduled()` that, for `file_versions` in non-committed states older than 24 h: deletes the R2 object under the staging key and marks the row with a terminal state permitted by its CHECK constraint (add a forward migration if a new state is required). Never touches committed or sealed files (assert with the existing `committed_files_no_delete` trigger).

## Acceptance criteria
1. Step-1 finding recorded in the PR.
2. If implemented: orphan count returns to 0 after one sweep; committed/sealed files untouched; operation logged as `workspace.file_sweep` with counts only.
