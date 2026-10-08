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

## Implementation progress — 2026-10-08
- The form already initialized its conclusion to `UNASSESSED` and exposed the cash-flow forecasts checkbox.
- Added a conditional, announced explanation when forecasts are unavailable and the preparer selects `NO_MATERIAL_UNCERTAINTY`; it describes the required mitigating-plans support already enforced by the Worker.
- Added an announced reporting consequence for `MATERIAL_UNCERTAINTY`. Server rules and validation are unchanged.
- Added `E05-S03 explains the going-concern forecast and material-uncertainty states at desktop and mobile widths` to the CDP E2E suite. It checks the initial, no-forecast, and material-uncertainty states at 1440×900 and 390×844 and asserts no browser exceptions.
- Verification: `npm run build` passed; the targeted CDP browser case passed (1/1) with isolated Worker fixtures and no external requests.
- Status: **complete**.
