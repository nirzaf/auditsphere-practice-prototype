# D1 and Worker capacity

**Status:** local model completed; staging CPU and load acceptance remain open. Reviewed 2026-10-08.

## Workload model

The model uses the NFR workload of 400 new engagements/year. It scales the full BUSINESS `SqliteD1` journey fixture's database image across engagements, including `audit_events` and `fieldwork_change_feed`. Each run currently ends with six engagements and one workspace. After `VACUUM`, the database image was 6,729,728 bytes (1,643 pages × 4,096 bytes), or 1,121,621 bytes per fixture engagement. The database held 4,325 rows across 190 tables, or 721 rows/engagement rounded. It contained 478 `audit_events` and 145 `fieldwork_change_feed` rows.

This is a synthetic local SQLite measurement, not a Cloudflare D1 measurement. Dividing the whole database by six assigns firm/workspace-wide rows to each engagement and is therefore conservative for some shared records, but the fixture does not include a calibrated production data mix, ten years of changes, the large-archive payload, or production indexes/storage overhead. R2 file bytes are outside this D1 estimate. Re-run the same measurement on representative staging data before relying on this projection for go-live.

| Horizon | Engagements | Projected D1 bytes | Paid 10 GB limit | Paid headroom | Free 500 MB limit |
|---|---:|---:|---:|---:|---:|
| 5 years | 2,000 | 2.24 GB | 22.4% | 7.76 GB | 449% (exceeds) |
| 10 years | 4,000 | 4.49 GB | 44.9% | 5.51 GB | 897% (exceeds) |

At the same linear rate, five years projects about 159,333 audit events and 48,333 change-feed rows; ten years about 318,667 and 96,667 respectively. These row counts are not standalone D1 limits: D1 documents table row counts as unlimited subject to database storage.

## Platform limits and implications

Cloudflare's live documentation was checked 2026-10-08. Plan-dependent figures below distinguish Free from Workers Paid; the deployment account's exact plan was not confirmed as part of this local spike.

| Area | Current documented limit | Measured / projected | Headroom and action |
|---|---|---|---|
| D1 database size | 500 MB Free; 10 GB Paid, per database | 1.12 MB/fixture engagement; 2.24 GB at 5 years and 4.49 GB at 10 years | Paid projection is below the 50% CAP-01 threshold at both horizons; Free is insufficient. Confirm paid plan and measure representative staging data before go-live. |
| D1 rows and row size | Unlimited rows/table subject to storage; maximum row 2,000,000 bytes | 721 total rows/engagement averaged over the fixture; no single-row size scan recorded | No count-based concern shown. Add a max-row-size audit if representative staging data includes large inline payloads; keep file bytes in R2. |
| D1 SQL / batching | SQL statement 100 KB; up to 100 bound parameters/query; approximately 5,000 bindings/Worker; each query 30 seconds and whole batch call 30 seconds | Business command batches were not instrumented for statement count, duration, or parameter ceiling in this spike | Keep command batches below per-query limits and bounded in duration; large migrations must chunk writes. Cloudflare publishes no separate maximum statement-count per batch on the limits page. |
| D1 concurrency | A database processes queries serially; paid/free Worker invocation query caps are 1,000/50; up to six simultaneous D1 connections per invocation | No 50-session staging test | D1 throughput depends on SQL duration. E06-S05 must test queueing and endpoint latency at 50 authenticated sessions. |
| Worker CPU | Free HTTP 10 ms and Cron 10 ms; Paid HTTP default 30 s (configurable up to 5 min), Cron 30 s for triggers under 1-hour intervals; 128 MB isolate memory | PDF generation, TB parsing, and archive streaming were not timed on a deployed Worker | Test CPU and memory on staging. The app's every-minute Cron has a 30 s Paid CPU budget and 15 min wall-time maximum. |
| R2 object size | 5 TiB/object; 5 GiB single-part upload; multipart upload up to 4.995 TiB and 10,000 parts | No large archive object measured | Existing streaming and multipart behavior still needs E05-S05 staging acceptance. |
| Workers Static Assets | 20,000 files Free / 100,000 Paid; individual file 25 MiB | Current build has one main JS bundle around 505 kB plus smaller assets | Ample observed headroom; retain build-size review if assets grow. |
| Rate Limiting binding | Per-key counter with a 10- or 60-second window; counters are locally cached per Cloudflare location, permissive/eventually consistent, and not accurate accounting | Not a capacity-accounting mechanism | Use for abuse reduction only, never business quotas or exact billing. Choose stable user/route keys and verify actual enforcement in E06-S02. |

## Capacity verdict

**CAP-01 (model only):** The linear synthetic-data estimate is 22.4% of the Workers Paid 10 GB D1 limit after five years, below the NFR's 50% threshold. At ten years it is 44.9%; no archive/database-sharding ADR is indicated by this local estimate. Workers Free cannot meet even the five-year projection. This is not a go-live capacity sign-off because the plan, production data mix, deployed CPU timings, archive workload, and authenticated 50-session latency remain unmeasured.

**Open acceptance:** run the same database-size query against representative staging records; record the Cloudflare plan; time `worker/reportingDocument.ts`, `worker/proposalDocument.ts`, `worker/businessTb.ts`, and `worker/streamingArchive.ts` on the deployed Worker; and complete E06-S05's 50-session test. Revisit the model if measured average exceeds 2.5 MB/engagement (the five-year 50% ceiling on Paid, leaving roughly 2.2x growth from this fixture baseline).

## Sources

- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/ (checked 2026-10-08)
- Workers platform limits: https://developers.cloudflare.com/workers/platform/limits/ (checked 2026-10-08)
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/ (checked 2026-10-08)
- Rate Limiting binding semantics: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (checked 2026-10-08)
