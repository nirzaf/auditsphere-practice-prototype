# E03-S06 — Firm administration (invite staff, grants, disable) and first-Partner bootstrap CLI

> **Retired scope:** the current user-provided real-implementation epic explicitly excludes application authentication, accounts, passwords, sessions, and RBAC. This historical E03 story is not an active requirement. Do not implement it unless the user authorizes a new scope.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S06 | E03 | Feature | P0 | M | E03-S03 | §1.2 personas; ADR-0005 §5; ADR-0008 |

## Intent
A Partner with the firm-admin capability manages who can sign in and which personas they hold. The very first Partner is created by an operator command, not a public route.

## Read first
- `worker/business.ts` `bootstrapBusinessWorkspace` (L~80–140), `staff.create`/`staff.update`, actor-profile create/deactivate (L1505–1575)
- `docs/contracts/api-delta.md` §3 (`user.*` commands)
- Pattern — command builder + zod union: `worker/businessPlanning.ts`

## Scope
**In:**
- Commands `user.inviteStaff`, `user.grantProfile`, `user.revokeProfile`, `user.disable`, `user.enable`, `user.unlock` (capability `firm.admin` = `user_accounts.is_firm_admin=1` on the session user; add `'firm.admin'` to `allowedActions` only for such users).
- Invite email (outbox) with sign-in link to `/api/auth/staff/login`; invite expires 7 days; activation happens in E03-S02 callback.
- Guards: cannot disable/revoke self; cannot remove the last active firm admin; grants must match account kind and the profile's staff/contact; APPROVER grant requires PARTNER grade (already enforced at profile creation — re-check).
- Read model: `GET /api/workspaces/:id/users` (firm admin only) listing accounts, status, grants, last login.
- `tools/bootstrap-first-partner.ts`: operator CLI (`npx tsx tools/bootstrap-first-partner.ts --env staging --name "…" --email … --natural-person-key …`) that calls the same bootstrap function against remote D1 via `wrangler d1 execute` **or** a one-time `POST /api/internal/bootstrap` protected by secret `BOOTSTRAP_TOKEN` that self-disables after first success (choose one, justify in report). Result: workspace, staff member (PARTNER), APPROVER profile, STAFF account (`INVITED`, `is_firm_admin=1`), grant, invite email.
- Test bootstrap helper so tests no longer depend on the public setup route.
**Out:** UI screens (E03-S08 adds an admin panel).

## Acceptance criteria
1. Each command: happy path, persona/capability denial, stale version, idempotent replay — tested via `worker.fetch`.
2. Last-admin and self-disable guards return `GATE_BLOCKED` with explicit messages.
3. Disabling a user revokes all their sessions within the same command batch (`ACCOUNT_DISABLED`).
4. Bootstrap refuses to run when any `BUSINESS` workspace already exists in the target database (`GATE_BLOCKED`), and records `audit_events` + `auth_events`.
5. After this story, `BUSINESS_SETUP_ENABLED` is no longer needed by any test (route deletion happens in E03-S08).

## Verify with
```bash
npx tsx --test tests/unit/authAdmin.test.ts tests/unit/bootstrapFirstPartner.test.ts && npm run test:unit
```

## Stop and ask if
- The firm wants more than one firm admin by default, or wants non-Partner admins.
