# ADR-0007 — R2 is the canonical file store; SharePoint is an optional mirror

- **Status:** Proposed
- **Date:** 2026-10-08

## Context
The spec does not mention SharePoint. An adapter exists (`worker/integrations/sharepoint.ts`) from an earlier M365 proposal; the live token request currently fails pending an owner credential action. Archive immutability (ISA 230) is implemented on R2 with retention-prefix lock rules.

## Decision
R2 + D1 metadata remain the system of record for every file and sealed archive. SharePoint, if enabled, is a one-way mirror for staff convenience and never a source for application reads or archive verification. No new SharePoint features are built in this backlog; E04-S04 only finishes credential configuration or disables the integration cleanly.

## Consequences
Disabling SharePoint has no functional impact. Readiness must report SharePoint as `NOT_CONFIGURED` rather than `FAILED` when intentionally disabled.
