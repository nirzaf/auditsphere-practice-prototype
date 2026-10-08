// Email provider Worker implementation of the AuditSphere EMAIL_PROVIDER contract.
//
// The business Worker posts a FormData body to `POST /send` with an
// `Idempotency-Key` header and a `message` JSON field plus one or more `attachment`
// files, and expects `{ messageId }` on success. This provider forwards the message
// through one of two configurable transports:
//   * `SEND_EMAIL`   - Cloudflare Email Service (no third-party credentials).
//   * HTTP API       â€” EMAIL_API_URL + EMAIL_API_KEY pointing at a transactional
//                      email API that accepts a multipart `message`/`attachment` body.
// When neither transport is configured it fails closed with 503 and never reports
// a synthetic success.

import type { EmailServiceMessage, SendEmailBinding } from '../env';

export interface EmailProviderEnv {
  SEND_EMAIL?: SendEmailBinding;
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

interface NormalizedMessage {
  to: string[];
  subject: string;
  text: string;
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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  return { to, subject, text: asString(message.text) ?? '', attachments: [] };
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
    return jsonResponse(503, {
      error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      message: 'Configure SEND_EMAIL (Cloudflare Email Service) or EMAIL_API_URL + EMAIL_API_KEY on the email-provider Worker.'
    });
  }
  if (!isConfiguredSenderAddress(env.EMAIL_FROM)) {
    return jsonResponse(503, {
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
      return jsonResponse(200, { messageId: asString(result?.messageId) ?? (idempotencyKey || `email-service-${Date.now()}`) });
    } catch (error) {
      return jsonResponse(502, { error: 'EMAIL_SERVICE_FAILED', detail: error instanceof Error ? error.message : 'Cloudflare Email Service rejected the message.' });
    }
  }
  if (transport === 'HTTP_API' && env.EMAIL_API_URL && env.EMAIL_API_KEY) {
    try {
      const response = await fetch(env.EMAIL_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        body: form
      });
      if (!response.ok) return jsonResponse(response.status, { error: 'EMAIL_API_REJECTED' });
      const body = await response.json().catch(() => null) as { id?: unknown; messageId?: unknown } | null;
      return jsonResponse(200, { messageId: asString(body?.messageId) ?? asString(body?.id) ?? (idempotencyKey || `api-${Date.now()}`) });
    } catch (error) {
      return jsonResponse(502, { error: 'EMAIL_API_UNREACHABLE', detail: error instanceof Error ? error.message : 'The email API could not be reached.' });
    }
  }
  return jsonResponse(503, {
    error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    message: 'Configure SEND_EMAIL (Cloudflare Email Service) or EMAIL_API_URL + EMAIL_API_KEY on the email-provider Worker.'
  });
}
