// Worker binding contract.
//
// Bindings are declared here rather than hand-maintained against every
// wrangler.jsonc value; the generated runtime types still supply D1Database,
// R2Bucket and Fetcher. Regenerate with:
//   npx wrangler types --config wrangler.jsonc worker/v2/cloudflare-env.d.ts

export interface RateLimiterBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

/** Cloudflare Email Service send binding (native delivery, no third-party provider required). */
export interface EmailServiceMessage {
  to: string | string[];
  from: { email: string; name?: string } | string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: ArrayBuffer; type: string; disposition: 'attachment' }>;
}

/** @deprecated Kept as a source-compatible alias for earlier provider tests/integrations. */
export type EmailRoutingMessage = EmailServiceMessage;

export interface SendEmailBinding {
  send(message: EmailServiceMessage): Promise<{ messageId?: string }>;
}

export interface Env {
  /** D1 — authoritative structured workspace state. */
  DB: D1Database;
  /** R2 — canonical cloud location for exact file bytes. */
  FILES: R2Bucket;
  /** Static assets binding for the built React app (Workers Static Assets). */
  ASSETS: Fetcher;
  /** Optional Worker service binding implementing the proposal-email provider contract. */
  EMAIL_PROVIDER?: Fetcher;
  /** Optional Cloudflare Email Service binding used when no EMAIL_PROVIDER service binding is present. */
  SEND_EMAIL?: SendEmailBinding;
  /** Microsoft Graph / SharePoint document integration (see docs/prototype/integration-configuration.md). */
  SHAREPOINT_TENANT_ID?: string;
  SHAREPOINT_CLIENT_ID?: string;
  SHAREPOINT_CLIENT_SECRET?: string;
  SHAREPOINT_SITE_HOSTNAME?: string;
  SHAREPOINT_SITE_PATH?: string;
  SHAREPOINT_DRIVE_NAME?: string;
  /** Optional sender mailbox used when dispatching through Microsoft Graph instead of Email Routing. */
  SHAREPOINT_SENDER_MAILBOX?: string;
  /** Comma-separated allowed origins. Same-origin deployments need not list one. */
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
  /** Enable first-time BUSINESS workspace setup only in a trusted deployment. */
  BUSINESS_SETUP_ENABLED?: string;
  /** Enables CI metadata ingestion only on a separately configured verification sandbox Worker. */
  VERIFICATION_INGEST_TOKEN?: string;
  /** Fixed workspace scope for trusted CI metadata; never supplied by the caller. */
  VERIFICATION_INGEST_WORKSPACE_ID?: string;
  /** Explicit local/test opt-in for the retired snapshot/session API. Never set in production. */
  TEST_SNAPSHOT_API_ENABLED?: string;
  /** Optional Cloudflare Worker Rate Limiting binding. */
  RATE_LIMITER?: RateLimiterBinding;
}

/**
 * Root-document key holding the workspace layout manifest. The manifest records
 * which top-level `PrototypeState` keys are entity collections and which are root
 * documents, so an empty collection round-trips with the exact same shape instead
 * of disappearing.
 */
export const MANIFEST_DOCUMENT_KEY = '__manifest__';

/** Root document holding the scalar top-level fields of `PrototypeState`. */
export const SCALARS_DOCUMENT_KEY = '__scalars__';

/** Root document holding the workspace display metadata mirrored into `workspaces`. */
export const SETTINGS_DOCUMENT_KEY = '__settings__';

export interface WorkspaceManifest {
  schemaVersion: number;
  entityCollections: string[];
  rootDocuments: string[];
}

export const parseManifest = (value: unknown): WorkspaceManifest | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<WorkspaceManifest>;
  if (typeof candidate.schemaVersion !== 'number') return undefined;
  if (!Array.isArray(candidate.entityCollections) || !Array.isArray(candidate.rootDocuments)) return undefined;
  return {
    schemaVersion: candidate.schemaVersion,
    entityCollections: candidate.entityCollections.filter((key): key is string => typeof key === 'string'),
    rootDocuments: candidate.rootDocuments.filter((key): key is string => typeof key === 'string')
  };
};
