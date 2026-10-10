# API Contract Delta (remaining work only)

> **Historical proposal notice:** this contract contains a superseded E03 authentication design (`/api/auth/*`, sessions and `firm.admin`). The current real-implementation epic excludes application authentication and keeps actor/persona request context self-selected. Those auth paths and requirements are not part of the runtime contract. Use the registered route inventory and current Worker schemas as the source of truth; do not implement this historical proposal.

## 0. Where the contract lives today

There is no OpenAPI file. The executable contract is:

| Concern | Source of truth |
|---|---|
| Route table | `worker/index.ts` router chain (lines ~1035–1098) |
| Command envelope + all command payloads | zod schemas in each `worker/business*.ts` module, unioned in `businessCommandEnvelopeSchema` (`worker/business.ts:1254`) |
| Browser-side types | `src/shared/api/business.ts`, `src/shared/api/errors.ts` |
| Error codes | `src/shared/api/errors.ts` (36 codes, e.g. `GATE_BLOCKED`, `VERSION_CONFLICT`, `PORTAL_FROZEN`) |

**Rule:** for every change below, write the zod schema first, export the inferred type to `src/shared/api/business.ts` (or a new `src/shared/api/auth.ts`), then the handler. The YAML here is the review target, not a generated artifact.

## 1. Authentication endpoints — E03-S02…S05

All under `/api/auth/*`. JSON bodies; responses never include tokens except via `Set-Cookie`. Cookie: `__Host-as_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`. Every non-GET requires a same-origin `Origin` header (existing `assertSameOrigin`).

```yaml
openapi: 3.1.0
info: { title: AuditSphere Auth (delta), version: 0.1.0 }
paths:
  /api/auth/staff/login:
    get:
      summary: Start Entra ID OIDC authorization-code + PKCE flow
      parameters:
        - { name: returnTo, in: query, schema: { type: string, pattern: '^/[^/].*$' } }
      responses:
        '302': { description: Redirect to Entra authorize endpoint; sets short-lived __Host-as_oidc cookie (state, nonce, code_verifier hash) }
  /api/auth/staff/callback:
    get:
      summary: OIDC redirect URI
      parameters:
        - { name: code, in: query, required: true, schema: { type: string } }
        - { name: state, in: query, required: true, schema: { type: string } }
      responses:
        '302': { description: Session created; redirect to returnTo or / }
        '401': { description: UNAUTHENTICATED — state/nonce mismatch, token invalid, or no ACTIVE STAFF user_account for oid }
  /api/auth/client/login:
    post:
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/PasswordLogin' } } }
      responses:
        '200': { description: Session created, content: { application/json: { schema: { $ref: '#/components/schemas/Me' } } } }
        '401': { description: UNAUTHENTICATED (generic message; never reveal which field was wrong) }
        '423': { description: ACCOUNT_LOCKED with retryAfterSeconds }
        '429': { description: RATE_LIMITED }
  /api/auth/password:
    post:
      summary: Change own password (required when passwordMustChange=true)
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/PasswordChange' } } }
      responses:
        '204': { description: Changed; all other sessions of this user revoked (reason PASSWORD_CHANGED) }
        '400': { description: VALIDATION_FAILED (policy) }
        '401': { description: UNAUTHENTICATED (current password wrong) }
  /api/auth/password-reset/request:
    post:
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [email], properties: { email: { type: string, format: email } }, additionalProperties: false } } }
      responses:
        '202': { description: Always 202 (no account enumeration); emails a single-use link if a CLIENT account exists }
  /api/auth/password-reset/confirm:
    post:
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [token, newPassword], properties: { token: { type: string, minLength: 43 }, newPassword: { type: string } }, additionalProperties: false } } }
      responses:
        '204': { description: Password set; token consumed; passwordMustChange cleared; sessions revoked }
        '400': { description: INVALID_TOKEN (expired, consumed, unknown) or VALIDATION_FAILED }
  /api/auth/me:
    get:
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Me' } } } }
        '401': { description: UNAUTHENTICATED }
  /api/auth/active-profile:
    post:
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [actorProfileId], properties: { actorProfileId: { type: string, format: uuid } }, additionalProperties: false } } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Me' } } } }
        '403': { description: PERSONA_ACTION_DENIED — profile not granted to this user }
  /api/auth/logout:
    post:
      responses: { '204': { description: Session revoked; cookie cleared } }
components:
  schemas:
    PasswordLogin:
      type: object
      required: [email, password]
      additionalProperties: false
      properties: { email: { type: string, format: email, maxLength: 320 }, password: { type: string, minLength: 1, maxLength: 256 } }
    PasswordChange:
      type: object
      required: [currentPassword, newPassword]
      additionalProperties: false
      properties: { currentPassword: { type: string }, newPassword: { type: string, minLength: 12, maxLength: 256 } }
    Me:
      type: object
      required: [user, workspaceId, profiles, activeProfileId, passwordMustChange]
      properties:
        workspaceId: { type: string, format: uuid }
        user: { type: object, properties: { id: { type: string }, kind: { enum: [STAFF, CLIENT] }, displayName: { type: string }, email: { type: string }, isFirmAdmin: { type: boolean } } }
        profiles:
          type: array
          items: { type: object, properties: { id: { type: string }, persona: { enum: [PREPARER, REVIEWER, APPROVER, CLIENT] }, displayName: { type: string }, staffGrade: { type: [string, 'null'] }, clientId: { type: [string, 'null'] } } }
        activeProfileId: { type: [string, 'null'] }
        passwordMustChange: { type: boolean }
        idleExpiresAt: { type: string, format: date-time }
```

**Password policy (client accounts):** 12–256 chars; reject if in a bundled top-10k breached list (ship as a static hashed set; no network call); reject if it contains the email local part. Lockout: 5 consecutive failures → `LOCKED` for 15 min (exponential to 24 h), `auth_events` row each time.

**New error codes** (add to `src/shared/api/errors.ts`): `ACCOUNT_LOCKED` (423), `PASSWORD_CHANGE_REQUIRED` (403), `INVALID_TOKEN` (400).

## 2. Changes to existing business routes — E03-S03, E03-S08

| Phase | Behaviour |
|---|---|
| E03-S03 (compat) | Every `/api/workspaces/:workspaceId/**` route (except `GET /api/health*`, `GET /api/integrations/status`, `POST /api/internal/verification-runs`, `GET /api/archive-download/:token`) requires a valid `auth_sessions` row. `resolveBusinessContext` takes the actor from the session. If `X-Actor-Id`/`X-Active-Persona` headers or `envelope.actor` are present **and differ** from the session actor → `403 PERSONA_ACTION_DENIED`. `:workspaceId` must equal the session's workspace → else `404 NOT_FOUND`. |
| E03-S05 | If `passwordMustChange=true`, every business route except `GET /api/auth/me`, `POST /api/auth/password`, `POST /api/auth/logout` → `403 PASSWORD_CHANGE_REQUIRED`. |
| E03-S08 (final) | `envelope.actor` removed from `businessCommandEnvelopeSchema` (strict object → presence is `400`). `X-Actor-Id`, `X-Active-Persona` headers ignored and stripped. `GET /api/workspaces/:id/actor-profiles` restricted to `firm.admin`. `POST /api/workspaces` (public bootstrap), `POST /api/workspaces/resume`, `POST /api/session/persona`, `POST /api/session/logout`, `GET /api/seeds` deleted. |

## 3. New business commands (command bus, ADR-0004)

Payloads are zod `z.strictObject`. All return the standard command result and write `audit_events`.

| Command `type` | Persona / capability | Payload | Effects | Story |
|---|---|---|---|---|
| `user.inviteStaff` | `firm.admin` | `{ staffMemberId, email }` | Creates `user_accounts` (`STAFF`,`INVITED`), `credential_tokens` (`STAFF_INVITE`, 7 days), queues invite email. Entra login with matching email + oid activates. | E03-S06 |
| `user.grantProfile` | `firm.admin` | `{ userAccountId, actorProfileId, expectedVersion }` | Inserts `user_profile_grants`. Validates kind/profile ownership. | E03-S06 |
| `user.revokeProfile` | `firm.admin` | `{ grantId }` | Sets `revoked_at`; revokes sessions whose active profile is that grant (`GRANT_REVOKED`). Cannot revoke the last active firm admin. | E03-S06 |
| `user.disable` / `user.enable` | `firm.admin` | `{ userAccountId, expectedVersion, reason }` | Status change; disable revokes all sessions. Cannot disable self or last firm admin. | E03-S06 |
| `user.unlock` | `firm.admin` | `{ userAccountId, expectedVersion }` | Clears lockout. | E03-S05 |
| `portal.credentials.reissue` | `REVIEWER` or Partner `APPROVER` | `{ engagementId, contactRouteId, reason }` | New temp password + email, prior unconsumed `CLIENT_TEMP_PASSWORD` tokens invalidated (set `expires_at` = now via new token row; tokens are immutable, so validation must check "latest issued"). | E03-S04 |
| `proposal.dispatch.recordManual` | same allowed action as email dispatch: `proposal.dispatch` (today Partner `APPROVER` only — do not widen) | `{ engagementId, proposalVersionId, channel: 'WHATSAPP'\|'HAND_DELIVERY', contactId, sentAt, evidenceFileVersionId?, note? }` | Inserts append-only `manual_dispatch_records`; performs the same `PROPOSAL_GENERATION → DUAL_KEY_PENDING` transition as email acceptance, but never transitions a second time when another channel already advanced this exact proposal. Requires the current Partner-approved version. | E04-S02 |
| `publicLead.triage` | `lead.manage` | `{ submissionId, decision: 'ACCEPT'\|'SPAM'\|'DUPLICATE', expectedVersion, existingLeadId?, requestedService?, periodStart?, periodEnd?, estimatedFeeMinor? }` | `ACCEPT` requires a requested service and ordered audited period, creates a `lead` with `source='WEB_FORM'` and the original received time. An optional duplicate link must have a primary contact whose email matches the inquiry. | E04-S03 |
| `milestone.applyDefaults` | `staffing.manage` | `{ engagementId, periodEnd: 'YYYY-MM-DD', overwrite?: boolean, suggestedDates?: { FIELDWORK_START, DRAFT_REPORT, FINAL_REPORT } }` | Applies the three suggested milestones from the default rule (E05-S01), with optional reviewed date edits; never overwrites existing unless `overwrite:true`. STATUTORY_CUTOFF is never inferred. | E05-S01 |
| `clientImport.validate` / `clientImport.apply` | Partner `APPROVER` + `client.manage` | `{ fileVersionId }` / `{ runId }` | Validate accepts an immutable, committed workspace-level `TEMPLATE` file with media type `text/csv`; reports row and field errors without creating client records. Apply accepts only a zero-error `VALIDATED` run, creates clients, contacts, routes, and subsidiary affiliations in parent-first atomic batches of at most 500 rows, and resumes via `client_import_row_map`. Re-validating the same workspace/source SHA-256 is rejected. | E05-S06 |

## 4. New public endpoint — E04-S03

```yaml
paths:
  /api/public/leads:
    post:
      summary: Public web-form lead intake (no session)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [companyName, contactName, email, turnstileToken]
              properties:
                companyName: { type: string, maxLength: 200 }
                contactName: { type: string, maxLength: 200 }
                email: { type: string, format: email, maxLength: 320 }
                phone: { type: string, maxLength: 40 }
                serviceInterest: { enum: [STATUTORY_AUDIT, INTERNAL_AUDIT, AGREED_UPON_PROCEDURES, OTHER] }
                message: { type: string, maxLength: 4000 }
                turnstileToken: { type: string, maxLength: 2048 }
                website: { type: string, maxLength: 0, description: honeypot — must be empty }
      responses:
        '202': { description: Accepted for triage (also returned for honeypot hits, silently stored as REJECTED_SPAM) }
        '403': { description: FORBIDDEN_SCOPE (origin is not allowlisted) }
        '422': { description: VALIDATION_FAILED (invalid body or Turnstile verification) }
        '429': { description: RATE_LIMITED (per IP hash, 5/hour) }
        '503': { description: UNAVAILABLE (verification, hashing, persistence or notification configuration unavailable) }
```

`GET /api/workspaces/{workspaceId}/public-lead-submissions` returns rows to staff with `lead.read`; the optional `status` query filters by `RECEIVED`, `ACCEPTED_AS_LEAD`, `REJECTED_SPAM` or `DUPLICATE`. CORS is same-origin only by default; `PUBLIC_LEAD_ALLOWED_ORIGINS` lists exact marketing-site origins for cross-origin `POST` and `OPTIONS`, without credentials. A verified Turnstile token is required for non-honeypot submissions. `PUBLIC_LEAD_IP_HASH_SECRET` must contain at least 32 characters; the rolling five-per-hour D1 limiter fails closed when it is absent. `PUBLIC_LEAD_DEFAULT_COUNTRY_CODE` is the two-letter firm jurisdiction used when triage creates a prospect. `PUBLIC_LEAD_NOTIFICATION_EMAIL` optionally queues a staff notification through the existing email outbox; notifications are off when unset.

## 5. Readiness changes — E02-S04, E04-S04

`GET /api/health/ready` reports `readinessChecks` for `environment`, the general rate limiter, `emailProvider`, `turnstile`, public-lead hashing/jurisdiction/notification/origin settings, D1, R2 and schema version. There is no `auth.entra` check in the current no-auth profile. Readiness requirements vary by environment as implemented in `worker/index.ts`; staging checks documented here are not evidence that a named staging app Worker is deployed.

## 6. Client document centre — E05-S04

`GET /api/workspaces/{workspaceId}/engagements/{engagementId}/portal`, when called with the selected `CLIENT` persona, includes `clientDocuments`. Each row is an explicit allowlist: `id`, `fileVersionId`, `category`, `originalName`, `issueDate`, `engagementId` and `engagementCode`; `HOLDING_LETTER` rows may additionally include the saved blocker snapshot fields `id`, `type`, `status`, `dueDate` and `stalePins`. Categories are `ENGAGEMENT_LETTER`, `INVOICE`, `RECEIPT`, `HOLDING_LETTER` and `FINAL_DELIVERABLE`. Draft/unissued invoices, pending receipts, undelivered holding letters, uncommitted bytes and bundle files outside a committed Partner-released bundle are excluded.

The CLIENT response does not include staff `commercialDocuments` / `releasedDeliverables`, findings, adjustments, SRM content, or ordinary approval review notes. The mandatory reason on a rejected PBC submission remains visible for correction as required by US-ENG-008. `GET /api/workspaces/{workspaceId}/files/{fileId}` independently rechecks the client's client/engagement scope and the issued-document or released-bundle membership before serving committed bytes; membership in a list is not a download capability by itself.

## 7. Approved leave intervals — US-PRC-002

`C("staffing.leave.record", {staffMemberId,workDate,startMinute,endMinute,minutes,reason})` requires a half-open local work-day interval: `startMinute` is 0–1439, `endMinute` is 1–1440, and `minutes` must equal `endMinute - startMinute`. Adjacent approved intervals are allowed; overlap is rejected and does not change the availability total. Existing day-only approvals remain in the total but block any additional leave for that staff member/date until the historical interval is explicitly reconciled; the application does not guess their timing.

## 8. Atomic journal balance revalidation — US-PRC-004

`C("ledger.post", {journalId,expectedVersion})` re-reads persisted journal lines before posting and the same D1 batch asserts that the draft header totals are positive, equal, and exactly match the sums of its lines, with at least two active posting-account lines. If the draft was altered or became unbalanced after creation, the command returns `422 UNBALANCED_JOURNAL`; the atomic batch aborts, leaving the journal in `DRAFT` with its lines unchanged by the posting command.

## 9. Posted-only firm reports and cutoffs — US-PRC-006

`GET .../practice/reports/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD&asOf=<UTC timestamp>` and `GET .../practice/reports/profit-loss?month=YYYY-MM&asOf=<UTC timestamp>` include only journals in `POSTED` status with `posted_at <= asOf`. Period movement uses each journal's actual `posting_date`; the trial balance exposes exact minor-unit debit/credit and closing-balance checks. A draft is excluded, and a backdated journal posted after the requested cutoff remains excluded. Reversals affect reports in their own posting period. Deferred advance invoices and receipts do not create revenue; an approved `revenue.recognize` event posts against the active versioned firm policy. Report exports use the same cutoff-bound computed snapshot as their screen projection.

## 10. Receivables aging and post-archive collection — US-PRC-007

The practice projection accepts a Qatar `asOfDate` and optional client scope. For each issued installment it reports the original fee revision and computes `outstanding = issued - effective allocations - effective credits`; allocation reversals restore both invoice receivables and unallocated verified cash. Receipts, allocations, reversals and credits after the selected date do not change historical aging. Aging uses calendar-day boundaries: due today remains `CURRENT`, and days 31–60 map to `DAYS_31_60`. Customer AR is reconciled to posted AR control and any pre-existing difference is returned as `INTEGRATION_EXCEPTION`, without a fabricated balancing journal.

`payment.record`, `payment.reverse`, `payment.allocate`, `payment.reverse-allocation`, `credit-note.issue`, and `revenue.recognize` remain available for firm bookkeeping after an engagement is archived. Their payment-evidence reservation is narrowly scoped; ordinary post-archive file reservations and audit-content commands remain frozen. Generated receipts and payment journals do not mutate the issued invoice, portal freeze, or archive seal.

## 11. Partner-approved representation wording — US-REP-004

`C("representation.prepare", {engagementId,proposedReportDate,requiredSignatories,contactRouteId,approvedClauses,firmApprovedWording:true,approvalRationale})` is restricted to an active Partner approver. The command requires 1–30 distinct, non-empty clauses (10–4,000 characters each; 30,000 total) and a rationale. It stores an append-only `representation_template_approvals` row with the exact clause JSON, SHA-256, approver and approval time in the same transaction as the request and rendering job. The dependency hash binds the approval ID and clause digest.

The DOCX job recomputes both the clause digest and approval source hash before rendering. It inserts only those approved clauses; it does not substitute built-in legal wording. `representation.send` rechecks that the exact approval row remains present and current. A legacy prepared request without an approval row is blocked and must be replaced with a new Partner-approved request. The returned template remains clearly marked as a draft and is not evidence of a signed client representation.

## 12. Complete contributor separation in fieldwork review — US-FLD-011

`procedure.update` preserves the first recorded preparer and records the current executor on each revision. For a RED-risk workprogram, only its active assigned Manager or Partner may execute a procedure. Submission, review, workprogram submission, Manager handover and Partner area clearance recheck that assignment and grade.

Procedure revision snapshots retain the natural-person key for each person who records work; legacy revision snapshots contribute their prepared/executed staff references when available. `procedure.submit`, `procedure.mark-not-applicable`, and direct review-submission paths pin the deduplicated contributor set into both the immutable snapshot and `contributor_natural_person_keys_json`. Workprogram submissions aggregate the exact contributor keys from their procedure revisions. Review decisions reject any reviewer whose natural-person key appears in that snapshot, even when another actor submitted the revision or later edits changed the current preparer/executor fields.

## 13. Paged financial-statement source provenance — US-FLD-003

`GET /api/workspaces/{workspaceId}/engagements/{engagementId}/fieldwork-workspace` and `GET /api/workspaces/{workspaceId}/engagements/{engagementId}/financial-statements` return statement-line summaries and source pins without duplicating every mapped trial-balance row in the response. `GET /api/workspaces/{workspaceId}/engagements/{engagementId}/fslis/{fsliId}/source-lines?limit=100&cursor=0` is internal-persona only and returns at most 200 contributing TB rows per page, their raw and presented CY/PY values, and every approved AJE line included in that FSLI. The response pins the TB and mapping revisions, statement source hash, AJE-set hash, and each AJE revision/source hash. `nextCursor` is an offset string or `null`; `totalRows` is the mapped TB contributor count. Read-only source drilldown has no lifecycle side effects.

## 14. Operator-supplied payment reversal rationale — US-ENG-006

`C("payment.reverse", {paymentId,rationale})` requires a trimmed 10–2,000 character reason. The billing UI opens an explicit reversal form for the selected issued receipt and sends the operator-entered reason; it does not substitute a fixed generic rationale. The Worker remains authoritative for permission, payment, receipt, balance and lifecycle checks.
