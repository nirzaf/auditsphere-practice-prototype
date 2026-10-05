-- STE Audit Management Tool — Row-Level Security policies.
-- Applied after `prisma migrate deploy` by `npm run db:rls` (scripts/apply-rls.ts).
--
-- The application connects as a NON-owner role (see .env.example). The app sets
-- `app.actor_id`, `app.actor_role` and (for portal sessions) `app.client_id` for the
-- duration of each transaction; policies read those settings. Table owners and
-- superusers bypass RLS, so the runtime role must not own these tables.

CREATE OR REPLACE FUNCTION app_actor_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.actor_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_actor_role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.actor_role', true), '') $$;

CREATE OR REPLACE FUNCTION app_client_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.client_id', true), '') $$;

-- Staff see a client row when a grant covers the client directly or through one of
-- its engagements. Client (portal) identities see only their own client row.
CREATE OR REPLACE FUNCTION app_can_access_client(target_client text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT CASE app_actor_role()
      WHEN 'CLIENT' THEN target_client = app_client_id()
      WHEN 'ADMIN'  THEN true
      ELSE EXISTS (
        SELECT 1 FROM "ClientAccessGrant" g
        WHERE g."userId" = app_actor_id() AND g."revokedAt" IS NULL
          AND (g."clientId" = target_client
               OR g."engagementId" IN (SELECT id FROM "Engagement" WHERE "clientId" = target_client))
      )
    END
  $$;

CREATE OR REPLACE FUNCTION app_can_access_engagement(target_engagement text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT CASE app_actor_role()
      WHEN 'CLIENT' THEN EXISTS (
        SELECT 1 FROM "Engagement" e
        WHERE e.id = target_engagement AND e."clientId" = app_client_id()
      )
      WHEN 'ADMIN' THEN true
      ELSE EXISTS (
        SELECT 1 FROM "ClientAccessGrant" g
        WHERE g."userId" = app_actor_id() AND g."revokedAt" IS NULL
          AND (g."engagementId" = target_engagement
               OR g."clientId" IN (SELECT "clientId" FROM "Engagement" WHERE id = target_engagement))
      )
    END
  $$;

-- ── Direct-column policies ───────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  engagement_scoped text[] := ARRAY[
    'DualKeyGate','AcceptanceScreening','MaterialityRevision','StaffAllocation',
    'EngagementFolder','TrialBalanceRow','Fsli','WorkProgram','SamplePlan',
    'AnalyticalReview','ReviewNote','Confirmation','HoldingLetter','SrmRecord',
    'OpinionSelection','DeliverableSet','ArchiveRecord','TimeEntry','PbcRequest',
    'EngagementStateTransition'
  ];
  client_scoped text[] := ARRAY[
    'ClientContact','Proposal','PortalInvitation','Document'
  ];
BEGIN
  FOREACH t IN ARRAY engagement_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY engagement_scope ON %I
      USING (app_can_access_engagement("engagementId"))
      WITH CHECK (app_can_access_engagement("engagementId"))$f$, t);
  END LOOP;

  FOREACH t IN ARRAY client_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY client_scope ON %I
      USING (app_can_access_client("clientId"))
      WITH CHECK (app_can_access_client("clientId"))$f$, t);
  END LOOP;
END $$;

-- ── Parent-owned rows and firm-level rows ────────────────────────────────────

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY client_scope ON "Client"
  USING (app_can_access_client(id)) WITH CHECK (app_can_access_client(id));

ALTER TABLE "Engagement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Engagement" FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_scope ON "Engagement"
  USING (app_can_access_engagement(id)) WITH CHECK (app_can_access_engagement(id));

-- Children reached through a parent row (no client/engagement column of their own).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditProcedure'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY parent_scope ON %I
      USING (app_can_access_engagement((SELECT w."engagementId" FROM "WorkProgram" w WHERE w.id = %I."workProgramId")))
      WITH CHECK (app_can_access_engagement((SELECT w."engagementId" FROM "WorkProgram" w WHERE w.id = %I."workProgramId")))$f$, t, t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['EvidenceRef'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY parent_scope ON %I
      USING (app_can_access_engagement((
        SELECT w."engagementId" FROM "AuditProcedure" ap
        JOIN "WorkProgram" w ON w.id = ap."workProgramId" WHERE ap.id = %I."procedureId")))
      WITH CHECK (app_can_access_engagement((
        SELECT w."engagementId" FROM "AuditProcedure" ap
        JOIN "WorkProgram" w ON w.id = ap."workProgramId" WHERE ap.id = %I."procedureId")))$f$, t, t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['DeliverableArtifact'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY parent_scope ON %I
      USING (app_can_access_engagement((SELECT d."engagementId" FROM "DeliverableSet" d WHERE d.id = %I."deliverableId")))
      WITH CHECK (app_can_access_engagement((SELECT d."engagementId" FROM "DeliverableSet" d WHERE d.id = %I."deliverableId")))$f$, t, t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['PbcUpload'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY parent_scope ON %I
      USING (app_can_access_engagement((SELECT r."engagementId" FROM "PbcRequest" r WHERE r.id = %I."requestId")))
      WITH CHECK (app_can_access_engagement((SELECT r."engagementId" FROM "PbcRequest" r WHERE r.id = %I."requestId")))$f$, t, t, t);
  END LOOP;
END $$;

-- Audit trail: global rows (engagementId IS NULL) are visible, engagement rows scoped.
ALTER TABLE "AuditTrailEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditTrailEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_scope ON "AuditTrailEntry"
  USING ("engagementId" IS NULL OR app_can_access_engagement("engagementId"))
  WITH CHECK ("engagementId" IS NULL OR app_can_access_engagement("engagementId"));

-- Grants: users see grants that concern them; only ADMIN/self-service may write.
ALTER TABLE "ClientAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientAccessGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY self_grant ON "ClientAccessGrant"
  USING (
    app_actor_role() = 'ADMIN'
    OR "userId" = app_actor_id()
    OR ("clientId" IS NOT NULL AND app_can_access_client("clientId"))
    OR ("engagementId" IS NOT NULL AND app_can_access_engagement("engagementId"))
  )
  WITH CHECK (app_actor_role() = 'ADMIN' OR "userId" = app_actor_id());

-- Firm practice ledger: professionals may read; only ADMIN/APPROVER may post.
ALTER TABLE "FirmLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FirmLedgerEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY firm_scope ON "FirmLedgerEntry"
  USING (app_actor_role() IN ('ADMIN','APPROVER','REVIEWER','PREPARER'))
  WITH CHECK (app_actor_role() IN ('ADMIN','APPROVER'));

ALTER TABLE "FirmLedgerLineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FirmLedgerLineItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY firm_scope ON "FirmLedgerLineItem"
  USING (app_actor_role() IN ('ADMIN','APPROVER','REVIEWER','PREPARER'))
  WITH CHECK (app_actor_role() IN ('ADMIN','APPROVER'));
