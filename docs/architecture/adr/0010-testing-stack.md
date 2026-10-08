# ADR-0010 — Testing stack: node:test + in-process SQLite D1 + CDP Chrome

- **Status:** Accepted (records existing stack)
- **Date:** 2026-10-08

## Decision
- Unit and Worker-integration tests: `node:test` + `node:assert/strict`, run by `tsx --test --test-concurrency=1 tests/unit/*.test.ts`.
- D1 emulation in tests: `tests/helpers/sqliteD1.ts` (Node 24 `node:sqlite`) applying the real `worker/migrations/*.sql`.
- Browser E2E: `tests/e2e/*.test.ts` driving system Chrome via CDP (`tests/helpers/headlessChrome.ts`, `tests/helpers/cdp.ts`) against `tests/helpers/businessE2eServer.ts`, which runs `worker/index.ts` in-process.

## Alternatives
Vitest, Jest, Playwright, Miniflare test pools — rejected to avoid a second harness.

## Agent guardrails
Do not add a test framework or browser automation dependency. New tests follow `docs/quality/testing.md`.
