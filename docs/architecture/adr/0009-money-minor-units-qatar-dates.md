# ADR-0009 — Money as integer minor units; calendar dates in Asia/Qatar

- **Status:** Accepted (records existing convention)
- **Date:** 2026-10-08

## Decision
- Monetary values are stored and transported as integer QAR minor units (`*_minor`, 1 QAR = 100), serialised as strings where they may exceed 2^53 (`hourlyMinor: '100000'`), computed with `BigInt` where products/sums can overflow. Rates are basis points (`*_bps`).
- Business calendar dates (`YYYY-MM-DD`) are interpreted in `Asia/Qatar` (UTC+3, no DST). Timestamps are ISO-8601 UTC strings.

## Agent guardrails
Never use floating-point for money. Never derive a business date from `new Date()` in UTC without converting to Asia/Qatar.
