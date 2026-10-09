# E04-S02 — Manual WhatsApp / hand-delivery proposal dispatch record

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E04-S02 | E04 | Feature | P2 | S | M3 | §5 `PROPOSAL_GENERATION` gate "Proposal dispatched via Email / WhatsApp"; ADR-0006 |

## Intent
Let staff record that an approved proposal PDF was sent outside email (WhatsApp or by hand) so the lifecycle advances exactly as after an email dispatch, with evidence.

## Read first
- `worker/business.ts` `proposal.dispatch` handler (route check at L3657)
- `worker/businessOutbox.ts` L800–830 (`PROPOSAL_GENERATION → DUAL_KEY_PENDING` transition after email acceptance)
- `docs/contracts/data-model-delta.md` §3, `docs/contracts/api-delta.md` §3 (`proposal.dispatch.recordManual`)

## Acceptance criteria
1. Migration `0050_manual_dispatch_records.sql` per data-model-delta §4, schema version bumped, append-only triggers tested.
2. `proposal.dispatch.recordManual` requires the engagement to be in `PROPOSAL_GENERATION`, except when the same approved proposal version has already advanced it to or beyond `DUAL_KEY_PENDING`; the referenced proposal version is current and Partner-approved; the persisted `file_version_id` is that version's committed generated PDF; `contactId` belongs to the engagement's client; `sentAt` ≤ now and ≥ proposal approval time; and the actor has `proposal.dispatch`.
3. On success, in one batch: record inserted, engagement → `DUAL_KEY_PENDING` with `active_proposal_version_id`, `state_transitions` row (reason names the manual channel), `audit_events`.
4. Email dispatch and manual dispatch for the same version are mutually idempotent: whichever lands first transitions; the second records history but does not transition again (no error).
5. UI: in the proposal section, a "Record WhatsApp / hand delivery" form (channel, recipient contact, date-time, optional already-committed engagement evidence file, note) visible only with `proposal.dispatch`.
6. Correspondence trail (deliverable 4) lists manual dispatches with channel label.

## Constraints
No WhatsApp API, links that auto-send, or phone-number scraping.

## Verify with
```bash
npx tsx --test --test-name-pattern="manual dispatch" tests/unit/businessWorkspace.test.ts && npm run test:unit && npm run test:e2e
```
