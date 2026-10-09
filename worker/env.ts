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
  /** Microsoft Graph / SharePoint document integration (see docs/ops/integrations.md). */
  SHAREPOINT_TENANT_ID?: string;
  SHAREPOINT_CLIENT_ID?: string;
  SHAREPOINT_CLIENT_SECRET?: string;
  SHAREPOINT_SITE_HOSTNAME?: string;
  SHAREPOINT_SITE_PATH?: string;
  SHAREPOINT_DRIVE_NAME?: string;
  /** Optional sender mailbox used when dispatching through Microsoft Graph instead of Email Routing. */
  SHAREPOINT_SENDER_MAILBOX?: string;
  /** Microsoft Entra OIDC configuration; the client secret is supplied as a Worker secret. */
  OIDC_TENANT_ID?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  /** Workspace used to retain failed OIDC attempts that cannot yet be tied to an account. */
  OIDC_AUDIT_WORKSPACE_ID?: string;
  /** Cloudflare Turnstile verification secret for public lead intake. */
  TURNSTILE_SECRET_KEY?: string;
  /** Comma-separated allowed origins. Same-origin deployments need not list one. */
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
  /** One-time operator credential for creating the first BUSINESS workspace. */
  BOOTSTRAP_TOKEN?: string;
  /** Enables CI metadata ingestion only on a separately configured verification sandbox Worker. */
  VERIFICATION_INGEST_ENABLED?: string;
  /** Public Worker URL included in client portal sign-in emails. */
  PUBLIC_APP_URL?: string;
  VERIFICATION_INGEST_TOKEN?: string;
  /** Fixed workspace scope for trusted CI metadata; never supplied by the caller. */
  VERIFICATION_INGEST_WORKSPACE_ID?: string;
  /** Optional Cloudflare Worker Rate Limiting binding. */
  RATE_LIMITER?: RateLimiterBinding;
}
