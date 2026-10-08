# ADR-0001 — Cloudflare Worker + D1 + R2 is the system of record

- **Status:** Accepted (records the existing architecture)
- **Date:** 2026-10-08

## Context
The spec (§2.3 of the story doc) prescribes no backend. The repository contains a mature Worker/D1/R2 implementation (44 migrations, ≈190 tables, ≈620 triggers, ~140 commands, 630 passing unit tests) and, separately, a one-commit Next.js 16 + Prisma 7 + Postgres demo in `ste-audit/` whose UI holds state in React `useState` and has no API routes.

## Decision
The single production backend is the Cloudflare Worker in `worker/`, with D1 for structured data and R2 for bytes, served same-origin with the React SPA via Workers Static Assets.

## Alternatives considered
- **Next.js + Prisma + Postgres (`ste-audit/`)** — rejected: would discard the verified domain layer and its integrity triggers for a demo with no persistence path.
- **Frappe/ERPNext + custom app** (earlier firm proposal) — rejected: the audit-specific domain is already built; ERPNext would add a second data model.
- **Worker + Hyperdrive + Postgres** — deferred; revisit only if SP-02 shows D1 limits are binding.

## Consequences
- All new persistence is a forward-only SQL migration in `worker/migrations/NNNN_*.sql`.
- D1 per-database size and Worker CPU limits become explicit NFR constraints (SP-02).
- No ORM. SQL lives next to the command builder that uses it.

## Agent guardrails
Never introduce another backend, ORM, database or framework. Never "simplify" by moving logic into the browser.
