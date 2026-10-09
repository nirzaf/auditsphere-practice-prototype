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
  /** HMAC-SHA256 secret for signed email provider delivery callbacks. */
  EMAIL_STATUS_WEBHOOK_SECRET?: string;
  /** Microsoft Graph / SharePoint document integration (see docs/ops/integrations.md). */
  SHAREPOINT_TENANT_ID?: string;
  SHAREPOINT_CLIENT_ID?: string;
  SHAREPOINT_CLIENT_SECRET?: string;
  SHAREPOINT_SITE_HOSTNAME?: string;
  SHAREPOINT_SITE_PATH?: string;
  SHAREPOINT_DRIVE_NAME?: string;
  /** Optional sender mailbox used when dispatching through Microsoft Graph instead of Email Routing. */
  SHAREPOINT_SENDER_MAILBOX?: string;
  /** Cloudflare Turnstile verification secret for public lead intake. */
  TURNSTILE_SECRET_KEY?: string;
  /** Comma-separated hostnames permitted by the Turnstile siteverify response. */
  PUBLIC_LEAD_TURNSTILE_HOSTNAMES?: string;
  /** HMAC key used to store salted hashes of public lead requester IPs. */
  PUBLIC_LEAD_IP_HASH_SECRET?: string;
  /** Default two-letter firm jurisdiction for prospect records from the public form. */
  PUBLIC_LEAD_DEFAULT_COUNTRY_CODE?: string;
  /** Optional notification destination for new public inquiries; disabled when unset. */
  PUBLIC_LEAD_NOTIFICATION_EMAIL?: string;
  /** Optional fixed workspace target; omitted only when exactly one active BUSINESS workspace exists. */
  PUBLIC_LEAD_WORKSPACE_ID?: string;
  /** Comma-separated exact origins allowed to post from a firm's marketing site. */
  PUBLIC_LEAD_ALLOWED_ORIGINS?: string;
  /** Comma-separated allowed origins. Same-origin deployments need not list one. */
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
  /** Enable first-time BUSINESS workspace setup only in a trusted deployment. */
  BUSINESS_SETUP_ENABLED?: string;
  /** Enables CI metadata ingestion only on a separately configured verification sandbox Worker. */
  VERIFICATION_INGEST_ENABLED?: string;
  VERIFICATION_INGEST_TOKEN?: string;
  /** Fixed workspace scope for trusted CI metadata; never supplied by the caller. */
  VERIFICATION_INGEST_WORKSPACE_ID?: string;
  /** General Worker rate limiting for command and workspace request buckets. */
  RATE_LIMITER?: RateLimiterBinding;
}
