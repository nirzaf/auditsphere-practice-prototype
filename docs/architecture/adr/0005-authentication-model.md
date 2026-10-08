# ADR-0005 — Authentication and session model

- **Status:** Proposed — finalise after spike SP-01 (decision D1 in PRD)
- **Date:** 2026-10-08

## Context
Identity is currently self-asserted (`X-Actor-Id`, `X-Active-Persona`). The spec requires: staff personas with distinct authority; an isolated client workspace; temporary client credentials emailed at portal provisioning; mandatory password reset on first login before uploads (§4.1.5). The firm already has a Microsoft Entra tenant and an app registration (used for SharePoint).

## Decision (proposed)
1. **Staff:** OpenID Connect authorization-code flow with PKCE against Microsoft Entra ID (single tenant). Map the verified `oid` claim to `user_accounts.external_subject`. No staff passwords stored. MFA enforced by Entra Conditional Access.
2. **Clients:** app-native email + password. Password hash: PBKDF2-HMAC-SHA256 via WebCrypto with ≥ 600,000 iterations and 16-byte random salt, parameters stored per hash (verify against current OWASP Password Storage Cheat Sheet during SP-01; if Worker CPU budget allows, prefer `argon2id`/`scrypt` from the already-installed `@noble/hashes`). Temporary password + `password_must_change=1` at provisioning; reset via single-use emailed token.
3. **Sessions:** opaque 256-bit token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie (`__Host-` prefix), stored server-side as SHA-256 in `auth_sessions` with idle (30 min staff / 15 min client) and absolute (12 h) expiry. Lax is required for the OIDC redirect; CSRF protection keeps the existing same-origin `Origin` check on every state-changing request.
4. **Actor derivation:** `resolveBusinessContext` reads `auth_sessions.active_actor_profile_id`; the profile must belong to the session's user. Switching active profile is an authenticated endpoint limited to the user's own profiles.
5. **Bootstrap:** the first Partner account is created by an operator CLI (`tools/bootstrap-first-partner.ts`) using a one-time secret, never by a public route. `BUSINESS_SETUP_ENABLED` public bootstrap is removed.

## Alternatives
- **Cloudflare Access in front of the app** — viable for staff (zero code) but cannot satisfy the client temporary-password/forced-reset requirement and gives the app no per-user identity without JWT parsing; may be added *in addition* as perimeter for staging.
- **App-native passwords for staff** — more code, weaker than Entra MFA; fallback if D1 decision says no Entra.
- **Third-party IdP (Auth0/Clerk)** — adds a vendor and data processor; not needed.

## Consequences
New tables (`docs/contracts/data-model-delta.md` §1), new `/api/auth/*` endpoints (`docs/contracts/api-delta.md` §1), removal of persona self-selection from the UI, and every existing test helper that sets `X-Actor-Id` must move to a session helper (E03-S03).
