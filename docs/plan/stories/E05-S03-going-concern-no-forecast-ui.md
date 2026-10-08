# E05-S03 — (P2) Going-concern no-forecast UI polish (VERIFY FIRST)

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S03 | E05 | Verify → UI | P2 | S | M3 | §4.3.2 ISA 570; US-M3-003 (ACs already met server-side) |

## Intent
Repository status lists "visual no-forecast state" as open for US-FLD-004. Server rules exist (`worker/businessFieldwork.ts:815` requires an explanation when no cash-flow forecast supports `NO_MATERIAL_UNCERTAINTY`). Make the UI state explicit so preparers understand the requirement before submission.

## Acceptance criteria
1. Verify: in `BusinessFieldworkPanel.tsx` the going-concern form shows (a) `UNASSESSED` as the initial visible state, (b) when "cash-flow forecasts available" is unchecked, an inline required-explanation hint before submit, (c) when `MATERIAL_UNCERTAINTY` is chosen, the hint that reporting will include the "Material Uncertainty Related to Going Concern" section. Record which already exist.
2. Implement only missing (a)–(c); server validation unchanged.
3. E2E at 390 and 1440 px covering the three states.

## Verify with
```bash
npm run test:e2e && npm run test:unit
```
