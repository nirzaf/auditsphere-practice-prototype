# E03-S05 — Client login, forced password change gate, password reset and lockout

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S05 | E03 | Feature | P0 | M | E03-S04 | §4.1.5 "Enforce mandatory password reset on first login before document submission features are unlocked"; US-PBC-001/002; NFR SEC-04, SEC-06 |

## Intent
Clients sign in with email + password; a temporary password only lets them change it; locked/expired accounts are handled; forgotten passwords are reset by emailed single-use link.

## Read first
- `docs/contracts/api-delta.md` §1 (`/client/login`, `/password`, `/password-reset/*`) and §2 (E03-S05 row)
- `worker/auth/*` from E03-S01; `worker/business.ts` `portalFrozenClientMutationError` (existing freeze gate, keep it)

## Acceptance criteria
1. `POST /api/auth/client/login` with correct credentials for an `ACTIVE` CLIENT account → `200 Me`, session cookie, `LOGIN_SUCCEEDED`. Wrong password / unknown email / STAFF email → identical `401` body and comparable timing (dummy hash on unknown).
2. Temporary password past its 7-day expiry → `401` with code `TEMP_PASSWORD_EXPIRED` (distinct code is acceptable to the account owner only after a correct password; for wrong password return the generic 401).
3. While `password_must_change=1`: every business route returns `403 PASSWORD_CHANGE_REQUIRED`; `GET /api/auth/me` returns `passwordMustChange:true`; `POST /api/auth/password` with the temp password as `currentPassword` and a policy-compliant new one → `204`, flag cleared, all **other** sessions revoked, `PASSWORD_CHANGED` event; the current session continues.
4. PBC upload reservation, content PUT, commit and `pbc.submit` are each rejected with `403 PASSWORD_CHANGE_REQUIRED` before the change (explicit tests — this is the spec's "before document submission features are unlocked").
5. Lockout: 5 consecutive failures → `LOCKED` until now+15 min (`423 ACCOUNT_LOCKED`, `retryAfterSeconds`), doubling per subsequent lock up to 24 h; success resets the counter; `user.unlock` (firm admin) clears it.
6. Reset request: always `202`; for an ACTIVE/LOCKED CLIENT account creates a `PASSWORD_RESET` token (30 min) and queues an email with a link `https://<origin>/reset?token=…`; at most 3 requests/hour/account (excess silently dropped, still `202`).
7. Reset confirm: valid token → password set, `password_must_change=0`, lock cleared, token consumed, all sessions revoked; reused/expired/unknown token → `400 INVALID_TOKEN`.
8. Rate limits on login/reset per api-delta §1 when `RATE_LIMITER` is bound; tests use an in-memory limiter stub.
9. Portal freeze (`423 PORTAL_FROZEN`) and password-change gate interact correctly: frozen + must-change → must-change wins (403) so the client can still set a password and download released deliverables afterwards.

## Constraints
- No password or token in logs, responses, `auth_events.detail_json`, or outbox payloads.
- Do not add a CAPTCHA dependency here (Turnstile is used only for the public lead form).

## Verify with
```bash
npx tsx --test tests/unit/authClientLogin.test.ts tests/unit/businessWorkspace.test.ts && npm run test:unit
```

## Stop and ask if
- The spec owner wants clients to also use Entra B2B instead of passwords (would supersede this story).
