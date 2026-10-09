# E03-S08 — Auth UI; own-profile switcher; remove self-selection, setup/connect and actor headers

> **Retired scope:** the current user-provided real-implementation epic explicitly excludes application authentication, accounts, passwords, sessions, and RBAC. This historical E03 story is not an active requirement. Do not implement it unless the user authorizes a new scope.

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

## Stop and ask if
- Removing `envelope.actor` breaks an external integration (none known at `54ec5a3`).
