# SP-03 — Incumbent platform export format

| Field | Value |
|---|---|
| Time box | 0.5 agent session + owner input |
| Blocks | E05-S06 |
| Output | Field mapping table + sample (anonymised) export committed under `tests/fixtures/import/` |

## Questions (decision D4)
1. Which commercial platform does the firm use today (the one with the 130-client-file licence tier)?
2. What can it export: clients, group structure, contacts, prior-year engagements, working papers? In which formats (CSV, XLSX, API)?
3. Which data must move on day one: client master + contacts only (recommended), or also historical engagements/TBs for prior-year comparatives?
4. Data quality: duplicates, missing emails, inconsistent group links — rough counts.

## Method
Owner provides an **anonymised** sample export (replace names/emails; keep structure). Agent maps each column to `clients`, `client_affiliations`, `contacts`, `contact_routes` fields and lists unmapped columns with a recommendation.

## Exit criteria
- Mapping table approved by owner.
- E05-S06 ACs updated with the real column set.
- If historical engagements are required: a new story draft (prior-year TB import as comparative, reusing `tb.import` + mapping memory), **not** an expansion of E05-S06.

## Result
*(fill in)*
