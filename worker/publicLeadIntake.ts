import { z } from 'zod';
import type { Handler, RouteContext } from './router';
import type { Env } from './env';
import { ApiError } from './errors';
import { jsonResponse, readJson } from './http';
import { enforceNamedRateLimit } from './rateLimits';
import { enforcePublicLeadHourlyLimit } from './publicLeadRateLimit';

const publicLeadSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  serviceInterest: z.enum(['STATUTORY_AUDIT', 'INTERNAL_AUDIT', 'AGREED_UPON_PROCEDURES', 'OTHER']).optional(),
  message: z.string().trim().max(4000).optional(),
  turnstileToken: z.string().trim().min(1).max(2048),
  // The hidden honeypot is accepted so automated submissions are retained as spam.
  website: z.string().max(500).optional().default('')
});

function allowedOrigins(env: Env): Set<string> {
  return new Set((env.PUBLIC_LEAD_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean));
}

export function configuredTurnstileHostnames(env: Pick<Env, 'PUBLIC_LEAD_TURNSTILE_HOSTNAMES'>): Set<string> {
  const hostnames = (env.PUBLIC_LEAD_TURNSTILE_HOSTNAMES ?? '').split(',')
    .map(value => value.trim().toLocaleLowerCase())
    .filter(value => value.length <= 253
      && value.split('.').every(label => label.length >= 1 && label.length <= 63
        && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)));
  return new Set(hostnames);
}

export function publicLeadCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin || origin === new URL(request.url).origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
}

function assertPublicLeadOrigin(ctx: RouteContext): Record<string, string> {
  const origin = ctx.request.headers.get('Origin');
  const headers = publicLeadCorsHeaders(ctx.request, ctx.env);
  if (origin && origin !== ctx.url.origin && !headers['Access-Control-Allow-Origin']) {
    throw new ApiError('FORBIDDEN_SCOPE', 'This origin is not allowed to submit public inquiries.');
  }
  return headers;
}

async function publicLeadWorkspaceId(env: Env): Promise<string> {
  if (env.PUBLIC_LEAD_WORKSPACE_ID) {
    const configured = await env.DB.prepare(`SELECT id FROM workspaces WHERE id=? AND data_mode='BUSINESS'
      AND status='active' AND business_status='ACTIVE'`).bind(env.PUBLIC_LEAD_WORKSPACE_ID).first<{ id: string }>();
    if (configured) return configured.id;
    throw new ApiError('UNAVAILABLE', 'The public inquiry workspace is not available.');
  }
  const rows = await env.DB.prepare(`SELECT id FROM workspaces WHERE data_mode='BUSINESS'
    AND status='active' AND business_status='ACTIVE' ORDER BY created_at_utc,id LIMIT 2`).all<{ id: string }>();
  if (rows.results?.length !== 1) throw new ApiError('UNAVAILABLE', 'Configure one active workspace for public inquiries.');
  return rows.results[0].id;
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  expectedHostnames: ReadonlySet<string>,
  requestFetch: typeof fetch = fetch
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  let response: Response;
  try {
    response = await requestFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
  } catch {
    throw new ApiError('UNAVAILABLE', 'Inquiry verification is temporarily unavailable.');
  }
  if (!response.ok) throw new ApiError('UNAVAILABLE', 'Inquiry verification is temporarily unavailable.');
  const result = await response.json() as { success?: boolean; hostname?: string };
  return result.success === true
    && typeof result.hostname === 'string'
    && expectedHostnames.has(result.hostname.trim().toLocaleLowerCase());
}

export const handlePublicLeadSubmission: Handler = async ctx => {
  const cors = assertPublicLeadOrigin(ctx);
  if (ctx.env.ENVIRONMENT === 'production' && !ctx.env.TURNSTILE_SECRET_KEY) {
    throw new ApiError('UNAVAILABLE', 'Inquiry verification is not configured.');
  }
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'local';
  const ipSha256 = await enforcePublicLeadHourlyLimit(ctx.env, ip);
  await enforceNamedRateLimit(ctx, 'RATE_LIMITER', `public.leads.ip:${ipSha256}`);
  const body = publicLeadSchema.safeParse(await readJson<unknown>(ctx.request, 12 * 1024));
  if (!body.success) throw new ApiError('VALIDATION_FAILED', 'Check the required inquiry fields and try again.');

  const workspaceId = await publicLeadWorkspaceId(ctx.env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isSpam = body.data.website.trim().length > 0;
  const notificationSetting = ctx.env.PUBLIC_LEAD_NOTIFICATION_EMAIL?.trim();
  const notificationRecipient = notificationSetting ? z.string().trim().email().max(320).safeParse(notificationSetting) : null;
  if (notificationSetting && !notificationRecipient?.success) {
    throw new ApiError('UNAVAILABLE', 'The public inquiry notification destination is not configured correctly.');
  }
  let turnstileVerified = false;

  if (!isSpam) {
    if (!ctx.env.TURNSTILE_SECRET_KEY) throw new ApiError('UNAVAILABLE', 'Inquiry verification is not configured.');
    const expectedHostnames = configuredTurnstileHostnames(ctx.env);
    if (!expectedHostnames.size) throw new ApiError('UNAVAILABLE', 'Inquiry verification is not configured.');
    turnstileVerified = await verifyTurnstile(body.data.turnstileToken, ctx.env.TURNSTILE_SECRET_KEY, ip, expectedHostnames);
    if (!turnstileVerified) throw new ApiError('VALIDATION_FAILED', 'Inquiry verification failed. Retry the verification and submit again.');
  }

  const thirtyDaysAgo = new Date(Date.parse(now) - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [priorSubmission, matchingLead] = await Promise.all([
    envQueryPriorSubmission(ctx.env, workspaceId, body.data.email, thirtyDaysAgo),
    ctx.env.DB.prepare(`SELECT l.id FROM leads l JOIN contacts c ON c.workspace_id=l.workspace_id
        AND c.client_id=l.client_id AND c.id=l.primary_contact_id
      WHERE l.workspace_id=? AND lower(trim(c.email))=? AND l.received_at>=?
      ORDER BY l.received_at DESC,l.id DESC LIMIT 1`).bind(workspaceId, body.data.email, thirtyDaysAgo)
      .first<{ id: string }>()
  ]);
  const existingLeadId = priorSubmission?.lead_id ?? matchingLead?.id ?? null;
  const status = isSpam ? 'REJECTED_SPAM' : priorSubmission || matchingLead ? 'DUPLICATE' : 'RECEIVED';
  const linkedLeadId = status === 'DUPLICATE' ? existingLeadId : null;

  const statements = [ctx.env.DB.prepare(`INSERT INTO public_lead_submissions(
      id,workspace_id,status,company_name,contact_name,email_normalized,phone,service_interest,message,
      turnstile_verified,ip_sha256,lead_id,triaged_by_actor_id,created_at,updated_at,version
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,1)`)
    .bind(id, workspaceId, status, body.data.companyName, body.data.contactName, body.data.email,
      body.data.phone ?? null, body.data.serviceInterest ?? null, body.data.message ?? null,
      turnstileVerified ? 1 : 0, ipSha256, linkedLeadId, now, now)];
  if (!isSpam && notificationRecipient?.success) {
    const jobId = crypto.randomUUID();
    statements.push(ctx.env.DB.prepare(`INSERT INTO outbox_jobs(
        id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,
        next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at
      ) VALUES(?,?,1,'EMAIL',?,1,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId, workspaceId, id, JSON.stringify({ documentType: 'PUBLIC_LEAD_NOTIFICATION', submissionId: id }),
        `public-lead-notification:${id}`, now, now, now));
  }
  await ctx.env.DB.batch(statements);

  return jsonResponse({ accepted: true }, 202, ctx.requestId, cors);
};

async function envQueryPriorSubmission(env: Env, workspaceId: string, email: string, since: string): Promise<{ lead_id: string | null } | null> {
  return env.DB.prepare(`SELECT lead_id FROM public_lead_submissions WHERE workspace_id=? AND email_normalized=?
    AND status<>'REJECTED_SPAM' AND created_at>=? ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(workspaceId, email, since).first<{ lead_id: string | null }>();
}
