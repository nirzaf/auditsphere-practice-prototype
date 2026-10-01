import type { PrototypeState, ProposalRecord } from '../types';
import { createPDFBlob } from './exportService';

export function proposalTeam(state: PrototypeState, proposal: Pick<ProposalRecord,'id'|'clientId'>): string {
  const engagement = state.engagements.find(e => e.proposalId === proposal.id);
  const ids = engagement?.auditLifecycle?.staffing.at(-1)?.allocations.map(a => a.userId);
  const members = ids?.length ? state.users.filter(u => ids.includes(u.id)) : state.users.filter(u => u.status === 'Active' && ['partner','manager','reviewer','preparer'].includes(u.role));
  return members.map(u => `${u.name} — ${u.role}; credentials/CV: ${u.credentialSummary || 'not supplied'}${u.cvReference ? `; CV evidence ${u.cvReference}` : ''}`).join('\n');
}

export function proposalOutputLines(state: PrototypeState, proposal: ProposalRecord): string[] {
  const p = proposal.presentedSnapshot || proposal;
  const team = typeof p.teamCredentials === 'string' ? p.teamCredentials : p.teamCredentials?.map((u: {name:string;role:string;qualification:string;experience:string}) => `${u.name}: ${u.role}; ${u.qualification}; ${u.experience}`).join('\n');
  const base = [state.firmSettings.firmLegalName, `Proposal ${proposal.id} · revision ${p.revision}`, `Client: ${state.clients.find(c => c.id === proposal.clientId)?.name || state.leads.find(l => l.id === proposal.leadId)?.name || 'Prospective client'}`, `Reporting period: ${proposal.period || proposal.items[0]?.period || 'Not recorded'}`];
  if (p.proposalMode === 'Comprehensive Technical Proposal') base.push(`Firm profile: ${p.firmProfile || 'Not recorded'}`, `Firm history: ${p.firmHistory || 'Not recorded'}`, `Registrations: ${p.regulatoryRegistrations?.join(', ') || 'Not recorded'}`, `Team and CV references: ${team || proposalTeam(state,proposal)}`, `Industry portfolio/evidence: ${p.industryExperience || 'Not recorded'}`, `Methodology: ${p.auditMethodology || 'Not recorded'}`);
  return [...base,...p.items.flatMap(i => [`Service: ${i.serviceName}`, `Scope: ${i.scope}`, `Exclusions: ${i.exclusions || 'None recorded'}`, `Deliverables: ${i.deliverables}`, `Client responsibilities: ${i.clientResponsibilities}`, `Fee: ${i.amount} ${p.currency}`]),`Total: ${p.totalAmount} ${p.currency}`, `Timeline: ${p.deliveryTimeline || 'Not recorded'}`, `Terms: ${p.terms}`, 'Synthetic prototype proposal — no dispatch or signature is performed by downloading.'];
}

export async function proposalPDF(state: PrototypeState, proposal: ProposalRecord): Promise<Blob> {
  const blob = createPDFBlob(proposal.title,proposalOutputLines(state,proposal));
  const pages = (await blob.text()).match(/\/Type\s*\/Page\b/g)?.length || 0;
  if ((proposal.presentedSnapshot || proposal).proposalMode !== 'Comprehensive Technical Proposal' && (pages < 1 || pages > 2)) throw Error('This brief quotation exceeds two pages. Shorten the brief scope or use Comprehensive Technical Proposal.');
  return blob;
}
