# Epics & Story Index

Story files: `docs/plan/stories/<ID>-<slug>.md`. Spikes: `docs/plan/spikes/`. Order and dependencies: `docs/plan/roadmap.md`.
Types: **Cleanup** (delete/move), **Feature**, **Refactor**, **Verify → Fix** (write the acceptance test first; change code only for reproduced gaps), **Infra/Ops**.

## E01 — Single implementation
Remove the legacy prototype, the Next.js demo and artefact sprawl so only the BUSINESS workspace remains. *Outcome:* agents cannot mistake prototype code for product code.

| ID | Story | P | Size |
|---|---|---|---|
| E01-S01 | Tag archive; delete non-runtime artefacts and `ste-audit/` | P0 | M |
| E01-S02 | Remove Worker TEST snapshot mode | P0 | M |
| E01-S03 | Remove legacy UI, services, domain, tests; consolidate CSS | P0 | L |
| E01-S04 | Rename prototype identifiers; rewrite README + CLAUDE.md | P1 | S |
| E01-S05 | Conditional: drop legacy tables + migration tooling | P2 | M |

## E02 — Environments
| ID | Story | P | Size |
|---|---|---|---|
| E02-S01 | Staging & production Wrangler environments | P0 | M |
| E02-S02 | Pin dependency versions | P0 | S |
| E02-S03 | Backup/restore runbook + drill | P0 | M |
| E02-S04 | Fail-closed production readiness | P0 | S |

## E03 — Identity & access
Make the existing authority and segregation-of-duties rules real by authenticating every request.

| ID | Story | P | Size |
|---|---|---|---|
| E03-S01 | Auth schema + core primitives | P0 | M |
| E03-S02 | Staff Entra OIDC login | P0 | M |
| E03-S03 | Session-derived actor; migrate test helpers | P0 | M |
| E03-S04 | Client portal credential provisioning | P0 | M |
| E03-S05 | Client login, forced reset, lockout | P0 | M |
| E03-S06 | Firm admin + first-Partner bootstrap | P0 | M |
| E03-S07 | Engagement-assignment scoping (verify-first) | P1 | M |
| E03-S08 | Auth UI; remove self-selection and actor headers | P0 | L |

## E04 — Communications & intake
| ID | Story | P | Size |
|---|---|---|---|
| E04-S01 | Production email delivery | P0 | M |
| E04-S02 | Manual WhatsApp / hand-delivery dispatch record | P2 | S |
| E04-S03 | Public web-form lead intake | P2 | M |
| E04-S04 | SharePoint finalise or disable | P2 | S |

## E05 — Functional completion
| ID | Story | P | Size |
|---|---|---|---|
| E05-S01 | (Optional) Suggested milestone schedule | P2 | S |
| E05-S02 | Verify workprogram acceptance matrix | P1 | M |
| E05-S03 | (P2) Going-concern no-forecast UI polish | P2 | S |
| E05-S04 | Client document centre (verify-first) | P1 | M |
| E05-S05 | Large-archive + retention-lock acceptance | P0 | M |
| E05-S06 | Bulk client/contact import | P1 | M |

## E06 — Hardening & go-live
| ID | Story | P | Size |
|---|---|---|---|
| E06-S01 | Security headers + ASVS L2 | P0 | M |
| E06-S02 | Rate limiter binding | P0 | S |
| E06-S03 | Alert routing | P1 | M |
| E06-S04 | Accessibility audit | P1 | M |
| E06-S05 | Load test | P1 | M |
| E06-S06 | UAT + go-live | P0 | M |
| E06-S07 | BUSINESS staged-upload sweep (verify-first) | P2 | S |

## Spikes
| ID | Question | Blocks |
|---|---|---|
| SP-01 | Identity provider & password-hashing parameters | E03-S01, E03-S02 |
| SP-02 | D1 / Worker capacity vs workload | E06-S05 |
| SP-03 | Incumbent platform export | E05-S06 |
| SP-04 | Data residency & regulatory regime | E02-S01 |

**Totals:** 34 stories (P0 × 19, P1 × 8, P2 × 7) + 4 spikes.
