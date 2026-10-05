# Cloud full-stack migration

> **Phase record (historical):** This document records the additive migration PHASE only (before the route/Worker cutover). Script names, file paths and the retained legacy Worker it mentions describe that phase and are superseded by the current architecture: one root `wrangler.jsonc` → `worker/index.ts`, same-origin `/api/*`, and `src/services/cloudWorkspace.ts`.

## 1. Baseline (Phase 0) — recorded before any change

| Item | Value |
| --- | --- |
| Starting commit | `02091e4` (only `package.json` / `package-lock.json` were dirty: `wrangler` added as a devDependency) |
| `npm run lint` | pass |
| `npm run demo:typecheck` | pass |
| `npm run test:unit` | **3 pre-existing failures** — `tests/unit/conformityBacklog.test.ts` (7 tests, 4 pass, 3 fail) with `INVALID_STATE: The final report date cannot predate current Partner clearance.` at `targetLifecycleCommands.ts:1784` |
| Legacy cloud proof | Worker `steaudit-prototype-demo-api` + D1 `steaudit-prototype-demo` snapshot API; Pages project `steaudit-prototype` |

The three unit failures are **pre-existing at the baseline commit** and are
unrelated to this work. They were not deleted, skipped or hidden.

## 2. Current browser-only / cloud boundaries (before)

* The whole `PrototypeState` is stored as one versioned JSON snapshot in D1 with a
  workspace-wide revision and a three-way merge on conflict.
* The browser holds file bytes in IndexedDB; **the access code does not transfer
  file bytes**, so cross-browser resume restored records but not files.
* Professional authorization and lifecycle enforcement lived in browser code only.
* The API accepted whole-state replacement.
* No server-side role/scope enforcement.

## 3. Minimal migration approach taken

Additive, not a rewrite, and not a cutover:

1. Keep `vite.config.ts`, `dist/`, the Pages project and the legacy Worker exactly
   as they were. Nothing in the existing deployment path changed.
2. Add a **new** Worker (`auditsphere-visual-prototype`) that serves the unchanged
   `dist/` as Static Assets plus a new `/api/*` v2 API, with D1 + R2 bindings.
3. Add migration `0003` — new tables only, on the existing D1 database. The v1
   tables and the legacy API keep working untouched.
4. Extract the domain rules the Worker must enforce into a **browser-free**
   `src/domain/` layer that reuses the existing `src/services/guards.ts` guards, so
   there is exactly one implementation of each rule.
5. Verify with real D1/R2 through a deployed integration test.

### Design decisions and why

* **Wrangler `assets.directory` instead of `@cloudflare/vite-plugin`.** Both give
  the same runtime shape (one Worker serving assets + API). Using the built-in
  asset path leaves `vite build` output byte-for-byte unchanged, so the existing
  Pages deployment cannot regress. Adopting the Vite plugin later is a contained
  follow-up.
* **Reuse the existing D1 database** rather than creating a new one: additive
  migrations satisfy the "additive/migratory" requirement and avoid a second
  resource.
* **One new R2 bucket** (`auditsphere-prototype-files`). No bucket existed for this
  app; R2 was already enabled on the account.
* **Reuse `demo_seeds`** for seeding instead of adding a `demo_seeds_v2` table.
* **Hand-written router** instead of Hono, so no new runtime dependency is added
  for a surface this small.
* **Generic state adapter** driven by a stored manifest instead of enumerating
  every `PrototypeState` collection: fewer places to drift.

### Command execution: one atomic batch

Every command now commits its *entire* effect in a single D1 batch:

```
version assertions -> revision bump -> row upserts/removals -> root documents
    -> manifest -> audit event -> idempotency record -> clear assertion rows
```

* **No partial commits.** The earlier path issued three independent commits (revision
  bump, row writes, audit/idempotency), so a mid-way failure could leave a prefix of
  the work applied while the caller was told the command had failed. A D1 `batch()` is
  one transaction, so a failure now commits nothing at all.
* **Optimistic concurrency is per entity, not per workspace.** Callers declare
  `expectedVersions: [{ entity, id, version }]`. A stale entry returns
  `409 VERSION_CONFLICT` with `details.currentVersions`, and an in-batch assertion row
  (`command_assertions`, migration `0005`, whose `CHECK (ok = 1)` constraint aborts the
  batch) re-checks the versions *inside* the transaction, so a race between the
  pre-check and the commit still rolls back instead of writing.
* **The workspace revision is a change cursor, not a gate.** Two clients editing
  different rows no longer conflict merely because some other command advanced the
  revision; `expectedRevision` is still accepted for compatibility but ignored.
* **Oversized commands fail closed.** Above `COMMAND_STATEMENT_LIMIT` (100) statements
  a command is rejected with `503` rather than being silently split, because splitting
  would reintroduce the partial-commit problem.

## 4. Files changed / added

| Area | Files | What changed |
| --- | --- | --- |
| Config | `wrangler.jsonc` (new) | Consolidated Worker: `main`, `assets` + `run_worker_first: ["/api/*"]`, D1, R2, observability, cron |
| Migrations | `worker/migrations/0003_cloud_full_stack.sql` (new) | 7 additive tables + indexes |
| Worker | `worker/{index,router,http,errors,env,db,state,sessions,files}.ts`, `worker/tsconfig.json`, `worker/cloudflare-env.d.ts` | current API |
| Shared contracts | `src/shared/api/{errors,sessions,files,commands}.ts` (new) | Typed wire contracts imported by both sides |
| Domain | `src/domain/{commandContext,clientCommands,leadCommands,commands}.ts` (new) | Browser-free command bodies + dispatcher |
| Tests | `tests/cloud/api.test.ts` | Live integration test |
| Scripts | `package.json` | `cloud:typecheck`, `cloud:migrate`, `cloud:dev`, `cloud:deploy`, `test:cloud:v2`, `cf` |
| Docs | `docs/prototype/cloud-full-stack-*.md` (new) | This set |

Nothing in `src/components/`, `src/store/prototypeStore.ts`, the retired snapshot client,
`index.html`, `vite.config.ts`, `worker/index.ts` or the retired snapshot Worker config was modified.

## 5. Migrating the next command family (the repeatable slice recipe)

1. Read the corresponding `prototypeStore` method and copy its body into
   `src/domain/<area>Commands.ts`, replacing `this.state` with a `state` parameter
   and `this.logEvent`/`this.notify`/`crypto.randomUUID` with `ctx.*`.
2. Keep importing the existing guards from `src/services/guards.ts`. Do not
   re-implement a rule.
3. Add the command to the `WorkspaceCommand` union in `src/shared/api/commands.ts`
   and a `case` to `runWorkspaceCommand`.
4. Make `prototypeStore` delegate that method to the new body so there is one
   implementation, then run `npm run test:unit` — the existing unit tests are the
   equivalence guard.
5. Run `npm run cloud:typecheck` (proves the new body is browser-free) and
   `npm run test:cloud:v2`.

## 6. Non-goals

No UI redesign, no state-management framework, no `vite` change, no Node server
framework, no duplicated domain model, no microservices, no queues/KV/vector
search, no speculative AI features, no new DNS or custom-domain changes, and no
deletion of the existing Pages deployment, D1 database or R2 bucket.


---

# Current command-coverage table (post-cutover)

Maintained against the CURRENT architecture. Every current UI mutation either
executes through a server-authoritative shared command or is explicitly labelled
local-only in the cloud workspace controls.

| Current UI action | Current store method | Current command | Server-authoritative? | File dependency |
|---|---|---|---|---|
| Create client | addClient | client.create | Yes (shared body + Worker) | — |
| Update client profile | updateClient | client.update | Yes | — |
| Nominate client contact | nominateClientContact | client.nominateContact | Yes | - |
| Review contact nomination | reviewClientContactNomination | client.reviewContactNomination | Yes | - |
| Set client custom field value | setClientCustomField | client.setCustomField | Yes | - |
| Define client custom field | addCustomFieldDefinition | client.defineCustomField | Yes | - |
| Enable / disable custom field | setCustomFieldDefinitionEnabled | client.setCustomFieldEnabled | Yes | - |
| Assign client relationship group | assignClientRelationshipGroup | client.assignRelationshipGroup | Yes | - |
| Create client relationship group | createClientRelationshipGroup | client.createRelationshipGroup | Yes | - |
| Create lead | addLead | lead.create | Yes | — |
| Update lead | updateLead | lead.update | Yes | — |
| Convert lead | convertLead | lead.convert | Yes | — |
| Add / edit / set-primary contact | addContact, updateClientContact, setPrimaryContact | contact.create, contact.update, contact.setPrimary | Yes | - |
| Draft / edit proposal | addProposal, updateProposal | proposal.create, proposal.update | Yes | - |
| Present proposal | presentProposal | proposal.present | Yes | - |
| Commercially review / return proposal | reviewProposal | proposal.review | Yes | - |
| Revise proposal (supersede + new revision) | createProposalRevision | proposal.revise | Yes | - |
| Record client proposal response | recordProposalResponse | proposal.respond | Yes | - |
| Create engagement | addEngagement | engagement.create | Yes | - |
| Change engagement lifecycle | setEngagementLifecycle | engagement.setLifecycle | Yes | - |
| Review / issue invoice | reviewInvoice, issueInvoice | invoice.review, invoice.issue | Yes | - |
| Set evidence adequacy | setEvidenceAdequacy | evidence.setAdequacy | Yes | - |
| Link evidence to a procedure | linkEvidenceProcedure | evidence.linkProcedure | Yes | - |
| Unlink evidence from a procedure | unlinkEvidenceProcedure | evidence.unlinkProcedure | Yes | - |
| Edit engagement administration fields | updateEngagement | engagement.updateAdmin (body exists but narrower) | No - browser-local until audit-plan/procedure invalidation is ported | - |
| Draft invoice with time/service-linked lines | addInvoice | invoice.create (body exists but ad-hoc lines only) | No - browser-local until source-linked lines are ported | - |
| Rename workspace | workspace controls | workspace.rename | Yes | — |
| File upload (PBC/TB/evidence/…) | artifact/document flows | two-phase R2 file API | Yes (bytes + SHA-256) | R2 |
| All other store mutations | per-family methods | not yet in union | No — labelled local-only | IndexedDB (local mode) |

The two excluded families are excluded deliberately, not by omission: their browser
implementations still enforce richer rules (audit-plan supersession, procedure scope
reassessment, time/proposal source pinning), so dispatching them to the narrower
shared body would make a cloud workspace behave differently from a local one. They
stay local-only until those rules are ported into `src/domain/`.
