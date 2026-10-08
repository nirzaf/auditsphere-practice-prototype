# ADR-0006 — Email is the only automated dispatch channel; WhatsApp is a manual record

- **Status:** Proposed
- **Date:** 2026-10-08

## Context
Spec §3.1 says proposals are "Dispatched via Email"; the §5 state table says "Email / WhatsApp". The code rejects WhatsApp as a provider (`worker/business.ts:3657`). WhatsApp Business API requires Meta business verification, template approval and a BSP contract — out of scope (PRD §5).

## Decision
Automated delivery uses only the `EMAIL_PROVIDER` binding. Add a `proposal.dispatch.recordManual` command that records an out-of-band WhatsApp (or hand-delivered) dispatch with channel, recipient contact, timestamp, sender and optional screenshot evidence file, which satisfies the `PROPOSAL_GENERATION → DUAL_KEY_PENDING` gate exactly as an email dispatch does (E04-S02).

## Consequences
No WhatsApp API keys, webhooks or SDKs. The audit trail distinguishes `EMAIL` vs `MANUAL_WHATSAPP`.
