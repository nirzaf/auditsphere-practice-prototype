# E03-S04 — Client portal credential provisioning on advance payment

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S04 | E03 | Feature | P0 | M | E03-S03; email provider (staging) for live check | §3.1 "Provision Client Portal • System emails credentials • Mandatory password reset"; §4.1.5; US-M1-012 |

## Intent
When the advance invoice is fully settled and the engagement moves to `PORTAL_ACTIVE_PLANNING`, automatically create (or reuse) the Audit Liaison's CLIENT account and email them temporary credentials that force a password change on first login.

## Read first
- `worker/businessOutbox.ts` L620–690 — receipt job settles the advance and emits the `ADVANCE_BILLING → PORTAL_ACTIVE_PLANNING` transition (`lifecycleTransition` statements)
- `worker/business.ts` contact routes (`contact.route`, purposes incl. `PBC`), actor-profile creation (L1505–1545)
- `docs/contracts/data-model-delta.md` §2; `docs/contracts/api-delta.md` §3 (`portal.credentials.reissue`)

## Current state (verified)
Portal activation sets `engagements.portal_activated_at`; no account, credential or email is produced.

## Design (must follow)
- **Never persist a plaintext temporary password.** In the same batch as the lifecycle transition, the receipt job inserts: the CLIENT `user_accounts` row (if new, status `INVITED`), the CLIENT `actor_profile` + grant (if new), a `CLIENT_TEMP_PASSWORD` `credential_tokens` row (hash of a random correlation token; `expires_at` = now + 7 days; it carries **no** password), an `EMAIL` outbox job of new type `PORTAL_CREDENTIALS` referencing `{ userAccountId, credentialTokenId, engagementId, contactRouteId }`, and the `portal_credential_issues` row linking them. The email job **generates** the temporary password at send time, sets `user_accounts.password_hash` + `password_must_change=1` + `status='ACTIVE'`, sends the email, and commits in one job mutation. A retry of the same job generates a new password and overwrites the hash — only the last emailed password works. Temporary-password expiry is read from the latest `CLIENT_TEMP_PASSWORD` token for the account.
- Recipient = the engagement client's **active `PBC` contact route** (Audit Liaison). If none: the transition still happens, no credentials are issued, and a workflow blocker `PORTAL_LIAISON_ROUTE_MISSING` is shown to staff (`worker/businessWorkflow.ts`).
- Account reuse: if a CLIENT `user_account` exists for that contact, reuse it; if `ACTIVE` and `password_must_change=0`, send a "portal now open for <engagement>" notice **without** a new password.
- Create the CLIENT `actor_profile` for the contact if none, and the `user_profile_grants` row.

## Acceptance criteria
1. Settling the advance (existing journey in `tests/unit/businessWorkspace.test.ts`) produces exactly one `portal_credential_issues` row (`trigger='ADVANCE_PAYMENT'`), one CLIENT `user_accounts` row (`INVITED`→ set to `ACTIVE` with `password_must_change=1` when the email job succeeds), one grant, one `PORTAL_CREDENTIALS` outbox job.
2. Replaying the receipt job or the command is idempotent: still one issue row (unique index), no second email.
3. The email body (captured by the provider stub) contains the portal URL, the login email, the temporary password, the 7-day expiry, and the statement that the password must be changed at first sign-in; it contains no other engagement data.
4. After the job: `user_accounts.password_hash` verifies the emailed password; no table, log line or outbox payload contains the plaintext (test greps D1 dump + captured logs).
5. Temporary password older than 7 days → login rejected with `INVALID_TOKEN`-style `401` and a hint to request reissue (E03-S05 handles login; this story stores the expiry).
6. `portal.credentials.reissue` (Reviewer or Partner) issues a new password via the same job, writes `TEMP_PASSWORD_ISSUED`, and invalidates the previous one.
7. Missing PBC route → blocker visible in workflow progress; adding the route then calling `portal.credentials.reissue` issues credentials.
8. Email provider failure → job retries per existing outbox policy; after final failure staff see `PORTAL_CREDENTIAL_EMAIL_FAILED` in workflow blockers.

## Constraints
- Do not alter the lifecycle transition semantics or its `command_assertions` guard.
- The email job must not include the password in any field persisted by `dispatches.recipient_snapshot_json`.

## Verify with
```bash
npx tsx --test --test-name-pattern="portal credential" tests/unit/businessWorkspace.test.ts
npx tsx --test tests/unit/portalCredentials.test.ts && npm run test:unit
```

## Stop and ask if
- The outbox `EMAIL` job model cannot generate content at send time without a schema change beyond data-model-delta §2.
