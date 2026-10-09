# AuditSphere go-live checklist

## Release status

**NO-GO.** This checklist is prepared for a future release review. The current
public Worker is not a trusted staging or confidential-data environment. The
firm/legal adviser has not recorded the data-residency, cross-border, or retention
decisions; isolated staging resources do not exist; deployed UAT and fire drills
are not complete. Do not load client information or treat a successful build as
approval to open the service.

The active implementation profile has no application authentication. Actor and
persona headers are caller-selected workflow context. Until the firm records a
trusted perimeter and approves the remaining risk, keep confidential/client data
out of the public Worker. Do not add identity-provider flows as an implicit
substitute for the agreed product scope.

## Mandatory evidence and owner sign-off

Fill in evidence links and approver names only after the referenced action is
completed. `N/A` requires a recorded scope owner decision; do not use it to hide a
missing control.

| Gate | Required evidence | Owner | Status / sign-off |
|---|---|---|---|
| Approved staging boundary | SP-04 decision; trusted network perimeter; isolated staging Worker, D1, and R2 IDs; staging readiness output | Firm / platform owner | BLOCKED |
| UAT journeys and negative cases | Completed `uat-plan.md` and `uat-log.md` for E2E-001…005 and every listed blocking scenario | Firm testers | NOT RUN |
| P0 reliability/security NFRs | Each applicable P0 NFR row linked to a current test, scan, dashboard, or runbook evidence | Engineering / security owner | OPEN |
| Data protection (CMP-03) | Applicable regimes, lawful basis, cross-border transfer decision, access boundary, and processor review | Firm / legal adviser | BLOCKED |
| Retention (CMP-02) | Approved retention term, covered data/object prefixes, and hold/deletion policy | Firm / records owner | BLOCKED |
| Backup and restore (E02-S03) | Isolated-resource drill with D1 relationships/totals, R2 manifest and verified object hashes | Platform owner | NOT RUN |
| Alert routing (E06-S03) | Staging-only alert definitions, destination review, and successful fire-drill evidence | Operations owner | BLOCKED |
| Repository visibility | Recorded public/private decision and approved secret-scanning result | Repository owner | OPEN |
| Legacy resource retirement | Named plan for the retired prototype Worker, D1 and R2; confirm traffic and retention before retirement | Platform owner | OPEN |
| First Partner/bootstrap | N/A only under the signed no-auth scope; otherwise reconcile the required identity model before go-live | Product owner | SCOPE DECISION REQUIRED |
| Entra production redirect URIs | N/A only under the signed no-auth scope; do not create OIDC configuration for the current profile | Product owner | SCOPE DECISION REQUIRED |
| Email sender and recipient | Cloudflare sender domain shows Enabled / DNS Configured; M365 MX preserved; approved staging destination verified; one synthetic message received and correlated to dispatch/provider IDs | Mail owner | PARTIAL — sender configured; delivery unverified |
| SharePoint site access | Current deployed credential authenticates; site-only write grant confirmed; synthetic site read/write check succeeds | Microsoft 365 owner | BLOCKED — deployed secret mismatch not resolved |
| Production readiness | Fresh `/api/health/ready` reports ready for the exact candidate build and production bindings | Release owner | NOT RUN |
| Rollback rehearsal | Previous Worker version and pre-deploy D1 Time Travel bookmark ID recorded; rollback operator and restore criteria named | Release owner | NOT RUN |
| Release decision | Every applicable row above is signed, known gaps have explicit risk owner/expiry, and workflow-dispatch approval is recorded | Firm Partner / release approver | NO-GO |

## Deployment procedure after approval

1. Freeze the approved candidate commit and record its exact Git and Worker build
   identities.
2. Confirm every mandatory gate above is closed; verify target account, Worker,
   D1 database, R2 bucket, environment, and GitHub approval.
3. Take a D1 Time Travel bookmark immediately before deployment. Record its
   bookmark ID; do not invent or reuse an older ID.
4. Deploy only through the reviewed `workflow_dispatch` path after the authorized
   release approval. Record the workflow run and deployed Worker version.
5. Run the approved smoke checks for the no-auth scope, including readiness,
   public entry points, a synthetic workflow, and integration status. Do not run
   production load, induce alert failures, send an unapproved message, or create
   real client data as a smoke test.
6. Check error rate, readiness and provider state. If any release guard fails,
   stop new data entry and follow rollback immediately.

## Rollback

1. Record the failed deployment version and stop further release actions.
2. Roll the Worker back to the recorded previous healthy version using the
   Cloudflare version rollback workflow or the approved Wrangler rollback command.
3. Compare the current D1 schema/data state with the pre-deploy Time Travel
   bookmark. Prefer forward repair for additive migrations; restore only under
   the approved recovery procedure because restoring D1 may discard writes made
   after the bookmark.
4. Verify Worker readiness, synthetic read/write integrity, and the R2 manifest
   and hashes before reopening the trusted perimeter.
5. Record timestamps, version IDs, bookmark ID, symptoms, recovery checks, and
   follow-up stories. Exclude secrets, request bodies, email addresses, and client
   content.

No production deployment or rollback has been performed for this checklist.
