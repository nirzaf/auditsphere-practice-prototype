# E03-S02 — Staff Entra ID OIDC login, callback, logout and `/api/auth/me`

> **Retired scope:** the current user-provided real-implementation epic explicitly excludes application authentication, accounts, passwords, sessions, and RBAC. This historical E03 story is not an active requirement. Do not implement it unless the user authorizes a new scope.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S02 | E03 | Feature | P0 | M | E03-S01 | §1.2 Preparer/Reviewer/Approver; NFR SEC-03, SEC-05 |

## Intent
Staff sign in with the firm's Microsoft Entra ID; the Worker creates a server session bound to the matching `user_accounts` row and its granted actor profiles.

## Read first
- `docs/contracts/api-delta.md` §1 (`/api/auth/staff/*`, `/me`, `/active-profile`, `/logout`)
- `docs/architecture/adr/0005-authentication-model.md`
- `worker/index.ts` router, `assertSameOrigin` in `worker/http.ts`
- SP-01 result (tenant, redirect URIs, required claims)

## Scope
**In:** `worker/auth/oidc.ts` (discovery fetch with caching, PKCE S256, state/nonce, token exchange, ID-token verification via JWKS with `crypto.subtle` RS256, claim checks `iss`, `aud`, `exp`, `nbf`, `iat` skew ±5 min, `nonce`, `tid`), routes `GET /api/auth/staff/login`, `GET /api/auth/staff/callback`, `GET /api/auth/me`, `POST /api/auth/active-profile`, `POST /api/auth/logout`; env vars `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, secret `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`; first-login activation of an `INVITED` STAFF account when the verified email matches and `external_subject` is null (bind `oid`).
**Out:** client password login (E03-S05), UI (E03-S08), changing business route auth (E03-S03).

## Acceptance criteria
1. `GET /api/auth/staff/login` → 302 to `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` with `response_type=code`, `code_challenge_method=S256`, `scope=openid profile email`, random `state` + `nonce`; sets `__Host-as_oidc` (HttpOnly, Secure, SameSite=Lax, Max-Age 600) holding an encrypted-or-signed `{state, nonce, verifier, returnTo}`. `returnTo` must be a same-origin path, else ignored.
2. Callback with valid code (token endpoint stubbed via injected fetch in tests) and an ID token signed by the fixture key → session created, `auth_events` `LOGIN_SUCCEEDED`, `__Host-as_session` set, `__Host-as_oidc` cleared, 302 to `returnTo` or `/`.
3. Callback rejects (401, `LOGIN_FAILED` event with reason code, no session): state mismatch; missing/expired `__Host-as_oidc`; nonce mismatch; wrong `aud`; wrong `iss`/`tid`; expired token; bad signature; unknown `kid`; no ACTIVE/INVITED STAFF account for the `oid`/email; account `DISABLED`/`LOCKED`; account has zero active grants.
4. Active profile on login = the user's single grant, or the most recently used one (`auth_sessions` history), or `null` if several and none used → `/me` returns `activeProfileId:null` and the UI must ask.
5. `POST /api/auth/active-profile` accepts only a profile with an active grant for the session's user; writes `PROFILE_SWITCHED`; otherwise `403 PERSONA_ACTION_DENIED`.
6. `POST /api/auth/logout` revokes the session (`LOGOUT`), clears the cookie, `204`; requires same-origin `Origin`.
7. `GET /api/auth/me` matches the `Me` schema; never returns token/hash fields.
8. JWKS and discovery responses cached ≤ 24 h in module scope with refetch on unknown `kid` (max once per 5 min).
9. Route-inventory test lists the new routes under the auth exemption set.

## Implementation notes
- Test seam: `createAuthDeps(env)` returning `{ fetch, now, randomBytes }` so tests inject a fixture JWKS/token endpoint (see `docs/quality/testing.md` §2.2 `oidcFixture`).
- Use `SameSite=Lax` because the IdP redirect is a top-level cross-site GET.
- Entra `email` claim may be absent; fall back to `preferred_username` only for matching an `INVITED` account; never as identity once `oid` is bound.

## Constraints
No OIDC/JWT library dependency. Do not store ID/access tokens. Do not request `offline_access`.

## Verify with
```bash
npm run cloud:typecheck && npx tsx --test tests/unit/authOidc.test.ts tests/unit/routeInventory.test.ts && npm run test:unit
```

## Stop and ask if
- The firm's Entra app registration cannot be configured with the staging/production redirect URIs (owner action).
- Entra tokens for the tenant are not RS256.
