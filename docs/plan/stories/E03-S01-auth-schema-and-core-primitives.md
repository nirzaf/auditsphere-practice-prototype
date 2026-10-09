# E03-S01 — Auth schema (0045) and `worker/auth` core primitives

> **Retired scope:** the current user-provided real-implementation epic explicitly excludes application authentication, accounts, passwords, sessions, and RBAC. This historical E03 story is not an active requirement. Do not implement it unless the user authorizes a new scope.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S01 | E03 Identity & access | Feature | P0 | M | SP-01 complete; ADR-0005 Accepted | §1.2; NFR SEC-04, SEC-05 |

## Intent
Create the identity tables and pure, well-tested primitives (token generation, hashing, password hashing/verification, session create/validate/revoke) that later stories wire into routes. **No HTTP routes and no behaviour change in this story.**

## Read first
- `docs/architecture/adr/0005-authentication-model.md`, `docs/plan/spikes/SP-01-identity-provider-and-password-hashing.md` (its result section)
- `docs/contracts/data-model-delta.md` §1
- Pattern — migration with append-only triggers: `worker/migrations/0006_business_foundation.sql` (L283–304)
- Pattern — hashing helper: `worker/http.ts` (`sha256Hex`, `randomToken`)

## Scope
**In:**
- `worker/migrations/0045_auth_accounts_sessions.sql` exactly as data-model-delta §1 (adjust only if SP-01 changed the hash format), schema version bump.
- `worker/auth/tokens.ts`: `newOpaqueToken(): string` (32 random bytes, base64url), `tokenHash(token): Promise<string>` (SHA-256 hex).
- `worker/auth/passwords.ts`: `hashPassword(pw, params?)`, `verifyPassword(pw, stored)` (constant-time compare), `needsRehash(stored)`, `generateTemporaryPassword()` (≥ 16 chars, CSPRNG, unambiguous alphabet), `checkPasswordPolicy(pw, { email })` per api-delta §1.
- `worker/auth/sessions.ts`: `createAuthSession(env, { workspaceId, userAccountId, authMethod, activeActorProfileId, now })` → `{ token, row }`; `validateAuthSession(env, token, now)` (idle + absolute expiry, revoked, user ACTIVE, profile grant still active) → session context or typed error; `touchSession` (sliding idle, at most one write per 60 s); `revokeSession(s)`; `revokeAllForUser(userId, reason)`.
- `worker/auth/events.ts`: `authEventStatement(...)` returning a `D1PreparedStatement` for `auth_events`.
- `worker/auth/cookies.ts`: `sessionCookie(token, maxAge)`, `clearedSessionCookie()` using `__Host-as_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Breached-password list: `worker/auth/breached-top10k.sha1.txt` (static, SHA-1 hex, one per line) loaded as a text module or inlined; document the source in a comment.

**Out:** routes, UI, OIDC (E03-S02), changes to `resolveBusinessContext` (E03-S03).

## Acceptance criteria
1. Migration applies from empty; `tests/unit/workerMigrations.test.ts` asserts the new version and that `UPDATE`/`DELETE` on `auth_events`, `DELETE` on `credential_tokens`/`user_profile_grants`, second consume of a token, and re-revoke of a grant all abort.
2. CHECK constraints reject: STAFF account with password hash; CLIENT account with `external_subject`; firm admin on CLIENT; non-normalised email.
3. `hashPassword` output encodes algorithm + parameters + salt; `verifyPassword` accepts the right password, rejects wrong ones, and runs a dummy hash for unknown users (timing parity helper `verifyAgainstDummy()`).
4. `generateTemporaryPassword()` 10,000 samples: all ≥ 16 chars, no duplicates, all pass `checkPasswordPolicy`.
5. `validateAuthSession`: covers valid; idle-expired; absolute-expired; revoked; user `LOCKED`/`DISABLED`; active profile grant revoked → each returns a distinct internal reason and maps to `401 UNAUTHENTICATED` (or `SESSION_EXPIRED` for expiry).
6. Cookie helper output exactly matches `__Host-as_session=<token>; Max-Age=<n>; Path=/; HttpOnly; Secure; SameSite=Lax`.
7. Line coverage of `worker/auth/**` ≥ 90 % (record the exact command used).
8. No other suite changes behaviour.

## Implementation notes
- WebCrypto only (`crypto.subtle`, `crypto.getRandomValues`); `@noble/hashes` is already a dependency if SP-01 picks scrypt/argon2id.
- Inject `now: string` everywhere; never call `Date.now()` inside these modules.
- Keep each file < 300 lines.

## Constraints
No new npm dependencies. Do not modify any existing table. Do not log tokens, passwords or hashes.

## Verify with
```bash
npm run cloud:typecheck && npx tsx --test tests/unit/authPrimitives.test.ts tests/unit/workerMigrations.test.ts && npm run test:unit
```

## Stop and ask if
- SP-01's chosen hash parameters exceed the Worker CPU budget measured in SP-01.
