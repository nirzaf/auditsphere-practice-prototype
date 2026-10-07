// Deployment-level integration configuration status (US-GAP-05/06 email, US-GAP-25..28 SharePoint).
//
// Reports whether each integration is configured and, for SharePoint, performs a
// scoped read probe so the state shown is backed by a real request rather than a
// saved configuration flag. No secret values are returned.

import type { Env } from '../env';
import { sharePointStatus, type SharePointStatus } from './sharepoint';

export type EmailTransport = 'SERVICE_BINDING' | 'EMAIL_ROUTING' | 'UNCONFIGURED';

export interface EmailTransportStatus {
  configured: boolean;
  transport: EmailTransport;
}

export function emailTransportStatus(env: Env): EmailTransportStatus {
  if (env.EMAIL_PROVIDER) return { configured: true, transport: 'SERVICE_BINDING' };
  if (env.SEND_EMAIL) return { configured: true, transport: 'EMAIL_ROUTING' };
  return { configured: false, transport: 'UNCONFIGURED' };
}

export interface IntegrationStatus {
  email: EmailTransportStatus;
  sharepoint: SharePointStatus;
}

export async function integrationStatus(env: Env): Promise<IntegrationStatus> {
  return { email: emailTransportStatus(env), sharepoint: await sharePointStatus(env) };
}
