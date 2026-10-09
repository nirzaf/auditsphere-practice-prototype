import type { Env } from './env';
import { jsonResponse } from './http';

const BODY_LIMIT = 16 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EmailStatusEvent {
  eventId: string;
  dispatchId: string;
  providerMessageId: string;
  status: 'DELIVERED' | 'BOUNCED';
  occurredAt: string;
}

interface StoredEmailStatusEvent extends EmailStatusEvent {
  workspace_id: string;
}

/** The provider signs `${timestamp}.${rawBody}` with HMAC-SHA256. */
export async function emailStatusWebhookSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return `sha256=${Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function readBoundedBody(request: Request): Promise<{ body: string } | { response: Response }> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { response: new Response(JSON.stringify({ error: 'UNSUPPORTED_MEDIA_TYPE' }), { status: 415, headers: { 'Content-Type': 'application/json' } }) };
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    return { response: new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), { status: 413, headers: { 'Content-Type': 'application/json' } }) };
  }
  const reader = request.body?.getReader();
  if (!reader) return { response: new Response(JSON.stringify({ error: 'INVALID_BODY' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      return { response: new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), { status: 413, headers: { 'Content-Type': 'application/json' } }) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { response: new Response(JSON.stringify({ error: 'INVALID_BODY' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) };
  }
}

function parseEvent(rawBody: string): EmailStatusEvent | null {
  try {
    const value = JSON.parse(rawBody) as Record<string, unknown>;
    const keys = Object.keys(value).sort();
    if (keys.join(',') !== 'dispatchId,eventId,occurredAt,providerMessageId,status'
      || typeof value.eventId !== 'string' || value.eventId.length < 1 || value.eventId.length > 200 || value.eventId.trim() !== value.eventId
      || typeof value.dispatchId !== 'string' || !UUID.test(value.dispatchId)
      || typeof value.providerMessageId !== 'string' || value.providerMessageId.length < 1 || value.providerMessageId.length > 512 || value.providerMessageId.trim() !== value.providerMessageId
      || (value.status !== 'DELIVERED' && value.status !== 'BOUNCED')
      || typeof value.occurredAt !== 'string' || value.occurredAt.length > 40 || !ISO_TIMESTAMP.test(value.occurredAt)
      || !Number.isFinite(Date.parse(value.occurredAt))) return null;
    return {
      eventId: value.eventId,
      dispatchId: value.dispatchId,
      providerMessageId: value.providerMessageId,
      status: value.status,
      occurredAt: new Date(value.occurredAt).toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Receives an HTTP email provider's signed delivery event. No body, address,
 * secret or signature is logged or persisted; only the event and status metadata
 * are retained in the append-only delivery history table.
 */
export async function handleEmailStatusWebhook(
  request: Request,
  env: Pick<Env, 'DB' | 'EMAIL_STATUS_WEBHOOK_SECRET'>,
  requestId: string,
  nowMilliseconds = Date.now()
): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, requestId);
  const secret = env.EMAIL_STATUS_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) return jsonResponse({ error: 'EMAIL_STATUS_WEBHOOK_NOT_CONFIGURED' }, 503, requestId);
  const raw = await readBoundedBody(request);
  if ('response' in raw) return jsonResponse(await raw.response.json(), raw.response.status, requestId);

  const timestamp = request.headers.get('X-AuditSphere-Timestamp') ?? '';
  const suppliedSignature = request.headers.get('X-AuditSphere-Signature') ?? '';
  if (!/^\d{10}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/i.test(suppliedSignature)
    || Math.abs(Math.floor(nowMilliseconds / 1000) - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    return jsonResponse({ error: 'INVALID_EMAIL_STATUS_SIGNATURE' }, 401, requestId);
  }
  const expectedSignature = await emailStatusWebhookSignature(secret, timestamp, raw.body);
  if (!secureEqual(suppliedSignature.toLowerCase(), expectedSignature)) {
    return jsonResponse({ error: 'INVALID_EMAIL_STATUS_SIGNATURE' }, 401, requestId);
  }
  const event = parseEvent(raw.body);
  if (!event) return jsonResponse({ error: 'INVALID_EMAIL_STATUS_EVENT' }, 400, requestId);

  const dispatch = await env.DB.prepare(`SELECT workspace_id,id,status FROM dispatches
    WHERE id=? AND provider_message_id=?`).bind(event.dispatchId, event.providerMessageId)
    .first<{ workspace_id: string; id: string; status: string }>();
  if (!dispatch) return jsonResponse({ error: 'EMAIL_DISPATCH_NOT_FOUND' }, 404, requestId);

  const receivedAt = new Date(nowMilliseconds).toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO dispatch_delivery_events(workspace_id,provider_event_id,dispatch_id,status,occurred_at,received_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,provider_event_id) DO NOTHING`)
      .bind(dispatch.workspace_id, event.eventId, dispatch.id, event.status, event.occurredAt, receivedAt),
    env.DB.prepare(`UPDATE dispatches SET status=?,updated_at=?,version=version+1
      WHERE workspace_id=? AND id=? AND provider_message_id=? AND status='ACCEPTED' AND changes()=1`)
      .bind(event.status, receivedAt, dispatch.workspace_id, dispatch.id, event.providerMessageId)
  ]);
  const stored = await env.DB.prepare(`SELECT workspace_id,provider_event_id AS eventId,dispatch_id AS dispatchId,
      status,occurred_at AS occurredAt FROM dispatch_delivery_events WHERE workspace_id=? AND provider_event_id=?`)
    .bind(dispatch.workspace_id, event.eventId).first<StoredEmailStatusEvent>();
  if (!stored || stored.dispatchId !== event.dispatchId || stored.status !== event.status || stored.occurredAt !== event.occurredAt) {
    return jsonResponse({ error: 'EMAIL_STATUS_EVENT_ID_CONFLICT' }, 409, requestId);
  }
  const inserted = Number((results[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0) === 1;
  const applied = Number((results[1] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0) === 1;
  return jsonResponse({ ok: true, duplicate: !inserted, applied }, 200, requestId);
}
