# SP-02 — D1 and Worker capacity limits vs. the workload model

| Field | Value |
|---|---|
| Time box | 1 agent session |
| Blocks | E06-S05 thresholds; informs ADR-0001 "revisit" clause |
| Output | `docs/architecture/capacity.md` + NFR CAP-01 verdict |

## Questions
1. Current Cloudflare limits (fetch docs; do not use memory) for: D1 max database size, max rows read/written per query/batch, max batch statements, max SQL statement size; Worker CPU time per request and per cron invocation on the firm's plan; R2 object size; Workers Static Assets size; Rate Limiting binding semantics.
2. Measured footprint: using the full synthetic journey in `tests/unit/businessWorkspace.test.ts` against `SqliteD1`, measure bytes per engagement (page count × page size after `VACUUM`) and rows per engagement by table family.
3. Projection: workload model in `docs/architecture/nfr.md` §2 (400 engagements/year) for 5 and 10 years → % of D1 limit. Include `audit_events` and `fieldwork_change_feed` growth.
4. CPU hot spots: time PDF generation (`worker/reportingDocument.ts`, `worker/proposalDocument.ts`), TB import parsing (`worker/businessTb.ts`), archive streaming (`worker/streamingArchive.ts`) on staging; compare to CPU limits.

## Exit criteria
- Table: limit · measured · projected · headroom · action.
- If projected D1 usage at 10 years > 50 %: propose (as a new ADR draft) archival of sealed engagements' high-volume tables to R2 JSON, or per-year databases — **do not implement** in the spike.

## Result
*(fill in)*
