# ADR-0008 — Single-firm tenancy: one BUSINESS workspace per deployment

- **Status:** Proposed
- **Date:** 2026-10-08

## Context
`workspaces` was designed for disposable demo sandboxes (7-day TTL, seeds, access codes). The product serves one audit firm.

## Decision
Each environment (staging, production) hosts exactly one `BUSINESS` workspace, created by the bootstrap CLI (ADR-0005 §5). The `workspace_id` column and scoping stay (they are woven through ≈190 tables and FKs) but the UI no longer offers "create or connect workspace"; the SPA discovers the workspace from `GET /api/auth/me`.

## Alternatives
Multi-firm SaaS — out of scope (PRD §5). Dropping `workspace_id` — rejected: high-risk schema churn for no benefit.

## Consequences
Remove workspace setup dialog and connect-by-ID UI (E03-S08). A future multi-firm product would add tenancy on top of the existing column.
