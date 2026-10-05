import type { PrototypeState } from '../types';
import { visibleClientIds, visibleEngagementIds } from './guards';

/** The portal and its progress panel share this exact authorized record projection. */
export function selectClientPortalProjection(state: PrototypeState, clientId?: string, engagementId?: string) {
  const clientScope = visibleClientIds(state);
  const clients = state.clients.filter(client => clientScope === 'ALL' || clientScope.includes(client.id));
  // A blank initial selector uses the screen's documented first-visible default.
  // A nonblank stale or revoked selection stays unavailable instead of switching clients.
  const client = clientId ? clients.find(item => item.id === clientId) : clients[0];
  const engagementScope = visibleEngagementIds(state);
  const engagements = client
    ? state.engagements.filter(engagement => engagement.client === client.id && (engagementScope === 'ALL' || engagementScope.includes(engagement.id)))
    : [];
  const engagement = engagementId
    ? engagements.find(item => item.id === engagementId)
    : engagements.find(item => item.id === state.selectedEngagement) || engagements[0];
  const invoices = client && engagement
    ? state.invoices.filter(invoice => invoice.clientId === client.id && (invoice.engagementId || invoice.eng) === engagement.id && (invoice.status === 'Issued' || invoice.status === 'Paid'))
    : [];
  const pbc = engagement?.pbc.filter(request => request.status !== 'Draft' && request.status !== 'Cancelled') || [];
  const documents = client && engagement
    ? state.documents.filter(document => document.visibility === 'Client shared' && document.clientId === client.id && (!document.engagementId || document.engagementId === engagement.id))
    : [];
  const messages = client && engagement
    ? state.communications.filter(message => message.visibility === 'Client visible' && message.clientId === client.id && (!message.engagementId || message.engagementId === engagement.id))
    : [];
  return { clients, client, engagements, engagement, invoices, pbc, documents, messages };
}
