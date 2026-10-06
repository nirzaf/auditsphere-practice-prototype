# AuditSphere production architecture

Status: the production entry point uses the normalized business workspace and
the same-origin Cloudflare Worker API. The legacy prototype remains available
only in development and test builds. This document describes the implementation
boundary; the epic's per-story and release-gate evidence remains authoritative.

## Runtime and trust boundary

The app uses React, TypeScript and Vite. Workers Static Assets serves the
production bundle and `worker/index.ts` serves `/api/*` from the same origin.
Production builds do not include the seeded prototype state or fixture loader.
The browser stores only its selected workspace and persona; business records
are read from and written to D1 through typed Worker commands.

The requested operating profile has no authentication. Four selectable personas
control workflow behavior, but do not verify a human's identity or provide
security-grade segregation of duties. Run it only in a trusted environment and
do not put confidential client data on an unrestricted public deployment.

## Services and data ownership

| Service | Responsibility |
| --- | --- |
| Cloudflare Workers + Static Assets | Same-origin React app and JSON API |
| D1 | Normalized business rows, command receipts, approvals, audit events, migration metadata and workflow projections |
| R2 | Private original and generated file bytes; D1 retains metadata, SHA-256 and lifecycle state |
| Worker Cron | Outbox processing, due archive work and cleanup restricted to staged files or expired test-only state |
| Optional rate-limit binding | Limits request bursts when configured |

Business workspaces have no expiry gate. Synthetic seed workspaces are marked
`TEST`; their expiry policy does not apply to `BUSINESS` records.

## Worker and persistence

`worker/index.ts` is the canonical entry point. `worker/migrations/` contains
forward-only SQL migrations; the installed relational schema marker is version
27. The business schema is split across commercial, governance, planning,
fieldwork, review, reporting, release/archive, practice and bookkeeping modules.
The older `workspace_entities` and `workspace_root_documents` tables remain for
legacy and test snapshots; they are not the production business write model.

Business commands use closed runtime-validated envelopes. D1 batches keep each
command's guard, domain writes, audit event and idempotency receipt together.
Approval decisions capture content dependencies and provenance; stale data
blocks later gates. Retried command keys replay the original response, while
key reuse with different content is rejected. Reports and lifecycle readiness
are projections of current normalized rows, not manually set completion flags.

`/api/health/live` reports process liveness. `/api/health/ready` checks D1,
the exact installed schema version and R2 binding availability. Readiness errors
return stable dependency codes. `GET /api/workspaces/{w}/migration-status`
returns installed schema and the most recent operator audit status.

## File lifecycle

R2 keys are workspace-scoped and use opaque file IDs. Browser uploads stream to
R2; the Worker verifies size and SHA-256 before a domain record may reference a
committed object. Normalized `file_versions` retain purpose, scope, immutable
state, version lineage and digest. Missing or altered bytes produce an explicit
failure; the service never fabricates a replacement.

## Lifecycle coverage

The normalized workspace implements the eleven lifecycle states in the epic:

`LEAD_INGESTION` → `PROPOSAL_GENERATION` → `DUAL_KEY_PENDING` →
`ADVANCE_BILLING` → `PORTAL_ACTIVE_PLANNING` → `FIELDWORK_EXECUTION` →
`MANAGERIAL_REVIEW` → `PARTNER_APPROVAL` → `DELIVERABLE_RELEASE` →
`COMPLIANCE_COUNTDOWN` → `ARCHIVED_READ_ONLY`.

The eight business workspace panels cover commercial pipeline, acceptance,
planning, fieldwork, review, reporting/release and practice/bookkeeping. Server
commands enforce workflow prerequisites and explicit rework paths; self-selected
personas are workflow controls only.

## Migration audit and cutover

Run the operator audit with `npm run migration:audit -- --workspace <uuid>
--dry-run`; add `--remote` only when auditing the configured remote account.
The tool checks entity/root-document counts, explicit source-to-target ID maps,
normalized target counts, known relationships, monetary totals, R2 byte size and
SHA-256. It records a compact `MigrationRun` status row but does not modify
business records, source snapshots or file objects. Details are in
`business-data-migration-audit.md`.

Cutover remains blocked until every source row has a reviewed mapping, all
target fields, counts and monetary totals reconcile, referenced bytes are
present and hashes match, and no orphan is reported. The current tool does not
compare every target field or apply transformed records; any non-empty source
is marked `TARGET_FIELD_RECONCILIATION_NOT_VERIFIED`. It intentionally has no
persona-accessible migration API or automatic data-apply mode. Retaining the
old snapshot tables and files is the safe state until a reviewed deployment
operation performs and verifies any needed transformation.

## Operational boundaries

- Cloud migrations are forward-only. Dropping historical tables, deleting
  source snapshots or changing remote data retention requires a separate
  explicitly reviewed operation.
- R2 and D1 cannot share a transaction. The file state machine and command
  reservation/verification steps expose that boundary instead of claiming a
  cross-service atomic commit.
- External mail, banking and confirmation providers are not represented as
  successful when they are unavailable. Outbox jobs retain retryable or
  blocked status and expose stable failure codes.
- A successful local build or unit suite does not establish a remote migration,
  browser-wide acceptance, deployment, professional-standard compliance or
  certification.
