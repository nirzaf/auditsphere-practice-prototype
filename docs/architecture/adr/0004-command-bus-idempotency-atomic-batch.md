# ADR-0004 — Command bus with idempotency, expected versions and atomic D1 batch

- **Status:** Accepted (records existing pattern)
- **Date:** 2026-10-08

## Context
Audit records need exactly-once effects, per-row concurrency (spec §4.3.1 row-level concurrency) and an immutable trail.

## Decision
All business mutations go through `POST /api/workspaces/:workspaceId/commands` with an `Idempotency-Key` header and an envelope validated by `businessCommandEnvelopeSchema` (`worker/business.ts:1254`). Each command builder returns `D1PreparedStatement[]`; `runBusinessDirectoryCommand` executes them plus receipt/audit/change-feed rows in a single `env.DB.batch(...)`. Stale `expectedVersions` → `VERSION_CONFLICT`. Long work is queued to `outbox_jobs`.

## Alternatives
REST resource endpoints per entity — rejected (would duplicate guard logic, lose atomic audit rows).

## Agent guardrails
- New mutations = new command `type` in the relevant module's zod union + builder + test. Never add a mutating REST route (exceptions: auth endpoints in E03 and file byte upload, which already exists).
- Never perform two `DB.batch` calls for one logical command.
- Never write to `audit_events` outside the command path.
