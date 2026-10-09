// Email provider Worker implementation of the AuditSphere EMAIL_PROVIDER contract.
//
// The business Worker posts a FormData body to `POST /send` with an
// `Idempotency-Key` header and a `message` JSON field plus one or more `attachment`
// files, and expects a real `{ messageId, status }` on success. This provider forwards the message
// through one of two configurable transports:
//   * `SEND_EMAIL`   - Cloudflare Email Service (no third-party credentials).
//   * HTTP API       â€” EMAIL_API_URL + EMAIL_API_KEY. The generic multipart
//                      adapter preserves the AuditSphere provider contract; the
//                      Cloudflare REST adapter sends its documented JSON shape.
// When neither transport is configured it fails closed with 503 and never reports
// a synthetic success.

import type { EmailServiceMessage, SendEmailBinding } from '../env';
import { emailRecipientSha256, isRoleBlockedRecipient, isRouteIdentifier } from './recipientPolicy';

export interface EmailProviderEnv {
  SEND_EMAIL?: SendEmailBinding;
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_RECIPIENT_POLICY?: 'ALLOWLIST' | 'ROUTED';
  EMAIL_API_FORMAT?: 'AUDITSPHERE_MULTIPART' | 'CLOUDFLARE_EMAIL_SERVICE_REST';
  /** Comma-separated explicit recipient allowlist for this deployment. */
  EMAIL_ALLOWED_RECIPIENTS?: string;
}

interface NormalizedMessage {
  to: string[];
  subject: string;
  text: string;
  routeId?: string;
  recipientSha256?: string;
  attachments: Array<{ filename: string; content: ArrayBuffer; type: string; disposition: 'attachment' }>;
}

export function emailProviderTransport(env: EmailProviderEnv): 'CLOUDFLARE_EMAIL_SERVICE' | 'HTTP_API' | 'UNCONFIGURED' {
  if (env.SEND_EMAIL) return 'CLOUDFLARE_EMAIL_SERVICE';
  if (env.EMAIL_API_URL?.trim() && env.EMAIL_API_KEY) return 'HTTP_API';
  return 'UNCONFIGURED';
}

export function isConfiguredSenderAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n\s<>]/.test(value)) return false;
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator === value.length - 1) return false;
  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const labels = domain.split('.');
  const topLevelDomain = labels.at(-1)?.toLowerCase() ?? '';
  return localPart.length <= 64 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
    && domain.length <= 253 && labels.length >= 2
    && labels.every(label => label.length > 0 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$/.test(topLevelDomain)
    && !new Set(['example', 'invalid', 'local', 'test']).has(topLevelDomain);
}

export function configuredRecipientAllowlist(value: unknown): ReadonlySet<string> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const addresses = value.split(',').map(address => address.trim().toLocaleLowerCase());
  if (addresses.some(address => !isConfiguredSenderAddress(address))) return null;
  return new Set(addresses);
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function providerMessageId(value: unknown): string | undefined {
  const messageId = asString(value);
  return messageId && messageId.length <= 512 ? messageId : undefined;
}

/** Accepts both the proposal (`recipient`) and commercial (`to`) message shapes. */
export function normalizeMessage(message: Record<string, unknown>): NormalizedMessage {
  const recipient = message.recipient && typeof message.recipient === 'object' ? message.recipient as Record<string, unknown> : {};
  const to: string[] = [];
  const direct = message.to ?? recipient.email;
  if (Array.isArray(direct)) {
    for (const entry of direct) { const value = asString(entry); if (value) to.push(value); }
  } else {
    const value = asString(direct);
    if (value) to.push(value);
  }
  const recipientName = asString(message.recipientName) ?? asString(recipient.name);
  const subject = asString(message.subject) ?? `AuditSphere document${recipientName ? ` for ${recipientName}` : ''}`;
  return { to, subject, text: asString(message.text) ?? '', routeId: asString(message.routeId),
    recipientSha256: asString(message.recipientSha256), attachments: [] };
}

function recipientPolicy(env: EmailProviderEnv): 'ALLOWLIST' | 'ROUTED' {
  return env.EMAIL_RECIPIENT_POLICY === 'ROUTED' ? 'ROUTED' : 'ALLOWLIST';
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function cloudflareApiUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function handleProviderSend(request: Request, env: EmailProviderEnv): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: 'INVALID_FORM' });
  }
  const raw = form.get('message');
  if (typeof raw !== 'string') return jsonResponse(400, { error: 'MISSING_MESSAGE' });
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'INVALID_MESSAGE' });
  }
  const message = normalizeMessage(parsed);
  if (!message.to.length) return jsonResponse(400, { error: 'MISSING_RECIPIENT' });
  const normalizedRecipients = message.to.map(address => address.trim().toLocaleLowerCase());
  const policy = recipientPolicy(env);
  if (policy === 'ALLOWLIST') {
    const allowedRecipients = configuredRecipientAllowlist(env.EMAIL_ALLOWED_RECIPIENTS);
    if (!allowedRecipients) {
      return jsonResponse(424, {
        error: 'EMAIL_RECIPIENT_POLICY_NOT_CONFIGURED',
        message: 'Configure EMAIL_ALLOWED_RECIPIENTS with the explicitly approved recipients for this deployment.'
      });
    }
    if (normalizedRecipients.some(address => !isConfiguredSenderAddress(address) || !allowedRecipients.has(address))) {
      return jsonResponse(403, {
        error: 'EMAIL_RECIPIENT_NOT_ALLOWED',
        message: 'The message includes a recipient outside the approved email destinations for this deployment.'
      });
    }
  } else {
    if (normalizedRecipients.length !== 1 || !isConfiguredSenderAddress(normalizedRecipients[0])
      || isRoleBlockedRecipient(normalizedRecipients[0]) || !isRouteIdentifier(message.routeId)
      || !/^[0-9a-f]{64}$/i.test(message.recipientSha256 ?? '')) {
      return jsonResponse(403, {
        error: 'EMAIL_ROUTE_PROOF_INVALID',
        message: 'Routed delivery requires one valid recipient, a route identifier and a matching recipient hash.'
      });
    }
    const expectedHash = await emailRecipientSha256(normalizedRecipients[0]);
    if (expectedHash !== message.recipientSha256?.toLocaleLowerCase()) {
      return jsonResponse(403, { error: 'EMAIL_ROUTE_PROOF_INVALID', message: 'The recipient does not match the supplied route proof.' });
    }
  }
  if (normalizedRecipients.some(address => !isConfiguredSenderAddress(address))) {
    return jsonResponse(403, {
      error: 'EMAIL_RECIPIENT_NOT_ALLOWED',
      message: 'The message includes an invalid recipient address.'
    });
  }
  message.to = normalizedRecipients;
  for (const entry of form.getAll('attachment')) {
    const blob = entry as unknown as Blob & { name?: string };
    message.attachments.push({
      filename: asString(blob.name) ?? 'attachment',
      content: await blob.arrayBuffer(),
      type: blob.type || 'application/octet-stream',
      disposition: 'attachment'
    });
  }

  const transport = emailProviderTransport(env);
  if (transport === 'UNCONFIGURED') {
    return jsonResponse(424, {
      error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      message: 'Configure SEND_EMAIL (Cloudflare Email Service) or EMAIL_API_URL + EMAIL_API_KEY on the email-provider Worker.'
    });
  }
  if (!isConfiguredSenderAddress(env.EMAIL_FROM)) {
    return jsonResponse(424, {
      error: 'EMAIL_SENDER_NOT_CONFIGURED',
      message: 'Configure EMAIL_FROM with an address authorized by the selected email provider.'
    });
  }
  if (transport === 'CLOUDFLARE_EMAIL_SERVICE' && env.SEND_EMAIL) {
    try {
      const result = await env.SEND_EMAIL.send({
        to: message.to,
        from: { email: env.EMAIL_FROM.trim(), ...(env.EMAIL_FROM_NAME && !/[\r\n]/.test(env.EMAIL_FROM_NAME) ? { name: env.EMAIL_FROM_NAME } : {}) },
        subject: message.subject,
        text: message.text,
        attachments: message.attachments
      } satisfies EmailServiceMessage);
      const messageId = providerMessageId(result?.messageId);
      if (!messageId) return jsonResponse(502, { error: 'EMAIL_PROVIDER_MESSAGE_ID_MISSING' });
      return jsonResponse(200, { messageId, status: 'ACCEPTED' });
    } catch {
      return jsonResponse(502, { error: 'EMAIL_SERVICE_FAILED', message: 'Cloudflare Email Service rejected the message.' });
    }
  }
  if (transport === 'HTTP_API' && env.EMAIL_API_URL && env.EMAIL_API_KEY) {
    try {
      if (env.EMAIL_API_FORMAT === 'CLOUDFLARE_EMAIL_SERVICE_REST') {
        const endpoint = cloudflareApiUrl(env.EMAIL_API_URL);
        if (!endpoint) return jsonResponse(424, { error: 'EMAIL_API_URL_INVALID' });
        const payload = {
          to: normalizedRecipients[0],
          from: env.EMAIL_FROM.trim(),
          subject: message.subject,
          text: message.text,
          attachments: message.attachments.map(attachment => ({
            filename: attachment.filename,
            type: attachment.type,
            disposition: attachment.disposition,
            content: bufferToBase64(attachment.content)
          }))
        };
        const requestBody = JSON.stringify(payload);
        if (new TextEncoder().encode(requestBody).byteLength > 5 * 1024 * 1024) {
          return jsonResponse(413, { error: 'EMAIL_CONTENT_TOO_LARGE' });
        }
        const cloudflareResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
          body: requestBody
        });
        if (!cloudflareResponse.ok) return jsonResponse(cloudflareResponse.status, { error: 'EMAIL_API_REJECTED' });
        const body = await cloudflareResponse.json().catch(() => null) as {
          success?: unknown;
          result?: { message_id?: unknown; delivered?: unknown; permanent_bounces?: unknown; queued?: unknown; suppressed_recipients?: unknown } | null;
        } | null;
        const result = body?.result;
        const messageId = providerMessageId(result?.message_id);
        if (body?.success !== true || !result || !messageId) return jsonResponse(502, { error: 'EMAIL_API_RESPONSE_INVALID' });
        const includesRecipient = (value: unknown): boolean => Array.isArray(value)
          && value.some(address => typeof address === 'string' && address.trim().toLocaleLowerCase() === normalizedRecipients[0]);
        const status = includesRecipient(result.delivered) ? 'DELIVERED'
          : includesRecipient(result.permanent_bounces) || includesRecipient(result.suppressed_recipients) ? 'BOUNCED'
            : includesRecipient(result.queued) ? 'ACCEPTED' : 'UNKNOWN';
        if (status === 'UNKNOWN') return jsonResponse(502, { error: 'EMAIL_API_RECIPIENT_STATUS_UNKNOWN' });
        return jsonResponse(200, { messageId, status });
      }
      const response = await fetch(env.EMAIL_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        body: form
      });
      if (!response.ok) return jsonResponse(response.status, { error: 'EMAIL_API_REJECTED' });
      const body = await response.json().catch(() => null) as { id?: unknown; messageId?: unknown } | null;
      const messageId = providerMessageId(body?.messageId) ?? providerMessageId(body?.id);
      if (!messageId) return jsonResponse(502, { error: 'EMAIL_PROVIDER_MESSAGE_ID_MISSING' });
      return jsonResponse(200, { messageId, status: 'ACCEPTED' });
    } catch {
      return jsonResponse(502, { error: 'EMAIL_API_UNREACHABLE', message: 'The email API could not be reached.' });
    }
  }
  return jsonResponse(503, {
    error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    message: 'Configure SEND_EMAIL (Cloudflare Email Service) or EMAIL_API_URL + EMAIL_API_KEY on the email-provider Worker.'
  });
}
