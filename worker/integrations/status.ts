// Deployment-level integration configuration status (US-GAP-05/06 email, US-GAP-25..28 SharePoint).
//
// Reports whether each integration is configured and, for SharePoint, performs a
// scoped read probe so the state shown is backed by a real request rather than a
// saved configuration flag. No secret values are returned.

import type { Env } from '../env';
import { sharePointStatus, type SharePointStatus } from './sharepoint';

export type EmailTransport = 'SERVICE_BINDING' | 'CLOUDFLARE_EMAIL_SERVICE' | 'UNCONFIGURED';

export interface EmailTransportStatus {
  configured: boolean;
  transport: EmailTransport;
  providerReadiness: 'READY' | 'UNAVAILABLE' | 'NOT_PROBED';
}

export async function emailTransportStatus(env: Env): Promise<EmailTransportStatus> {
  if (env.EMAIL_PROVIDER) {
    try {
      const response = await env.EMAIL_PROVIDER.fetch('https://email-provider.internal/health');
      if (response.ok) {
        const body = await response.json() as { ok?: unknown; senderConfigured?: unknown };
        if (body.ok === true && body.senderConfigured === true) {
          return { configured: true, transport: 'SERVICE_BINDING', providerReadiness: 'READY' };
        }
      }
    } catch {
      // A binding alone is not proof that the provider can accept a delivery.
    }
    return { configured: false, transport: 'SERVICE_BINDING', providerReadiness: 'UNAVAILABLE' };
  }
  if (env.SEND_EMAIL) return { configured: true, transport: 'CLOUDFLARE_EMAIL_SERVICE', providerReadiness: 'NOT_PROBED' };
  return { configured: false, transport: 'UNCONFIGURED', providerReadiness: 'NOT_PROBED' };
}

export interface IntegrationStatus {
  email: EmailTransportStatus;
  sharepoint: SharePointStatus;
}

export async function integrationStatus(env: Env): Promise<IntegrationStatus> {
  const [email, sharepoint] = await Promise.all([emailTransportStatus(env), sharePointStatus(env)]);
  return { email, sharepoint };
}
