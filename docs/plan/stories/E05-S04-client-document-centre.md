# E05-S04 — Client document centre (VERIFY FIRST)

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S04 | E05 | Verify → Feature | P1 | M | E03-S05 | §1.2 CLIENT "Receives invoices, receipts, holding letters, and final deliverables"; US-PBC-004, -005, -006 |

## Intent
A signed-in client sees, in one place per engagement, exactly the documents the spec says they receive — and nothing internal.

## Read first
- `worker/businessDelivery.ts` `getBusinessDeliveryWorkspace` (client branch `isInternal = persona !== 'CLIENT'`, L~612)
- `worker/business.ts` `getBusinessPbcPortal` (L~1720), `worker/businessFieldwork.ts` holding letters (L~436)
- `src/components/business/BusinessPbcPanel.tsx`, `BusinessDeliveryPanel.tsx`, `BusinessReportingPanel.tsx`

## Step 1 — Verify with a CLIENT session (test `tests/unit/clientDocumentProjection.test.ts`)
| Spec AC | Assertion |
|---|---|
| PBC-004.1 | Only invoices/receipts of the client's engagements, each tagged with its engagement |
| PBC-004.2 | Draft / `PENDING_DOCUMENT` / internal invoices not returned as issued documents |
| PBC-005.1 | Only generated/issued holding letters returned |
| PBC-005.2 | Each letter references the blocking confirmation(s) |
| PBC-005.3 | Once the blocker clears, the letter is not relabelled as "cleared" (history stays truthful) |
| PBC-006 | Only Partner-released bundle parts downloadable; drafts → `403`/`404` |
| Isolation | CLIENT of client A gets `403 FORBIDDEN_SCOPE` for every client-B document ID |

## Step 2 — Close gaps
If any item above is missing from the client projection, add it to the **existing** portal read model (prefer extending `GET …/engagements/:id/portal`) and render a "Documents" section in `BusinessPbcPanel.tsx` grouped: Engagement letter & invoices · Receipts · Holding letters · Final deliverables — each with issue date and download.

## Acceptance criteria
1. Step-1 test committed and green.
2. UI renders the four groups for a CLIENT session; empty groups show a neutral "None issued yet".
3. No internal fields (review notes, staff names beyond signatory, SRM, findings) in any client response (snapshot assertion on JSON keys).

## Verify with
```bash
npx tsx --test tests/unit/clientDocumentProjection.test.ts && npm run test:unit && npm run test:e2e
```
