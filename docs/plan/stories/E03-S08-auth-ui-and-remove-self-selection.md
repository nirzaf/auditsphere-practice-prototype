# E03-S08 — Auth UI; own-profile switcher; remove self-selection, setup/connect and actor headers

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S08 | E03 | Feature + Cleanup | P0 | L (split UI / API-removal if needed) | E03-S05, E03-S06 | §1.2; ADR-0005, ADR-0008; api-delta §2 final phase |

## Intent
Users see a real sign-in experience; the browser no longer chooses identity; the legacy compatibility surface is removed.

## Read first
- `src/App.tsx` (`ProductionWorkspaceLanding`), `src/components/business/BusinessWorkspace.tsx` (setup dialog L~130–200, persona select `business-active-persona`, `gradeAllowsPersona`), `src/services/businessWorkspace.ts` (preference storage, headers)
- Pattern — panel component: `src/components/business/BusinessPlanningPanel.tsx`
- `docs/architecture/nfr.md` UX-01…UX-03

## Scope
**In (UI):** `src/components/auth/` — `SignInPage` (two entry points: "Firm staff — sign in with Microsoft" → `/api/auth/staff/login`; "Client portal" email/password form), `ChangePasswordPage` (forced when `passwordMustChange`), `ResetRequestPage`, `ResetConfirmPage` (`/reset?token=`), session-expired banner, profile switcher listing only `Me.profiles` (hidden when one), sign-out; firm-admin `UsersPanel` (list, invite, grant/revoke, disable/enable, unlock) using E03-S06 commands. App boot: `GET /api/auth/me` → signed-out → `SignInPage`; signed-in → `BusinessWorkspaceConsole` with workspace from `Me`.
**In (removal):** `ProductionWorkspaceLanding`, `BusinessWorkspaceSetupDialog`, connect-by-ID, persona/actor `<select>`, `gradeAllowsPersona` UI logic, `localStorage` actor/persona preference (keep only non-identity UI prefs), `X-Actor-Id`/`X-Active-Persona` request headers, `envelope.actor` (schema + client), public `POST /api/workspaces` bootstrap and `BUSINESS_SETUP_ENABLED`, "self-selected personas" warning copy.
**Out:** any change to module panels' business behaviour.

## Acceptance criteria
1. Signed-out visit to any app path shows `SignInPage`; no business API call is made before `/me` succeeds (network log in E2E).
2. Client with `passwordMustChange` lands on `ChangePasswordPage` and cannot navigate elsewhere until success.
3. Staff with several grants is prompted to choose a profile on first sign-in; switching calls `/api/auth/active-profile` and reloads context; the switcher never lists profiles outside `Me.profiles`.
4. `rg -n "X-Actor-Id|X-Active-Persona|BUSINESS_SETUP_ENABLED|gradeAllowsPersona|BusinessWorkspaceSetupDialog" src worker tests` → no matches (tests updated to the session helper).
5. `businessCommandEnvelopeSchema` no longer has `actor`; a body containing `actor` → `400 BAD_REQUEST` (strict object).
6. `POST /api/workspaces` → `404` (route removed); `GET …/actor-profiles` firm-admin only.
7. Responsive at 390×844 and 1440×900; keyboard-only completion of sign-in, change password and reset; labelled inputs; error messages announced (`role="alert"`).
8. E2E: staff sign-in (session injected), client first login → forced change → PBC upload succeeds; client wrong password ×5 → lock message.
9. README/CLAUDE.md updated: no mention of self-selected personas.

## Verify with
```bash
npm run lint && npm run cloud:typecheck && npm run test:unit && npm run build && npm run test:e2e
```

## Implementation status — verified 2026-10-09

**Status: implemented.** The app now resolves `/api/auth/me` before mounting the business console; signed-out visitors receive the sign-in page, clients are held on mandatory password change, and profile choices and actor context come from the authenticated session. Removed the public workspace bootstrap and browser-supplied actor/persona fields and headers. Reporting provenance now describes attribution to the authenticated Partner approval record without claiming a certificate-backed signature or independent identity verification.

| Acceptance criterion | Evidence |
|---|---|
| 1. Signed-out routes load sign-in first; no business call precedes `/me` | `tests/e2e/businessWorkspace.test.ts` asserts the `/api/auth/me` request and absence of `/api/workspaces` while signed out. |
| 2. Forced password change gates workspace access | `tests/e2e/businessReporting.test.ts` verifies the first-login change page, blocks until update, then reaches client PBC. `tests/unit/authClientLogin.test.ts` covers the Worker gate. |
| 3. Profiles are grant-limited and switch through the session endpoint | Reporting browser journey verifies only granted Partner/Reviewer profiles appear, the CLIENT profile is omitted, and the server session changes on switch. |
| 4. Legacy identity claims/setup symbols are removed | `rg -n "X-Actor-Id|X-Active-Persona|BUSINESS_SETUP_ENABLED|gradeAllowsPersona|BusinessWorkspaceSetupDialog" src worker tests` returns no matches. |
| 5. Command envelope rejects browser actor data | `tests/unit/businessContracts.test.ts` verifies strict envelope parsing and unknown-field rejection. |
| 6. Public bootstrap is absent; actor directory is admin-only | Route tests cover bootstrap removal; `tests/unit/authAdmin.test.ts` asserts firm-admin success and non-admin `403 PERSONA_ACTION_DENIED` for `GET /actor-profiles`; the business workspace E2E covers authenticated profile access. |
| 7. Keyboard, labels, alerts and 390×844 / 1440×900 layouts | `tests/e2e/businessReporting.test.ts` auth journey enters and submits with keyboard, checks labelled fields and alert/status roles, and measures both viewport sizes. |
| 8. Client first login, PBC, five-failure lock and reset | The same browser journey verifies temporary login, forced change, successful PBC upload, five wrong passwords and lock, then reset confirmation. |
| 9. README/CLAUDE have no self-selected-persona warning | `rg -n -i "self-selected personas|self-selected persona" README.md CLAUDE.md` returns no matches; README describes Entra/client sign-in and granted profiles. |

Verification on 2026-10-09: `npm run lint` passed; `npm run cloud:typecheck` passed; `npm run test:unit` passed (185 passed, 1 opt-in stress test skipped); `npm run build` passed (Vite reports the existing 520.50 kB main-chunk advisory); `npm run test:e2e` passed (15/15). The browser E2E command was run with local Chrome CDP loopback access and uses isolated synthetic fixtures.

## Stop and ask if
- Removing `envelope.actor` breaks an external integration (none known at `54ec5a3`).
