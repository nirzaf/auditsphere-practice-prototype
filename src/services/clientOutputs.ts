import type { PrototypeState, EngagementRecord } from '../types';

export const STANDARD_PAYMENT_TERMS = '50% advance deposit payable upon engagement letter (EL) execution; 50% final balance payable upon delivery of the final signed audit deliverables package (balance fee note prepared with the final bundle and issued at final release).';

export function managementLetterLines(state: PrototypeState, engagement: EngagementRecord): string[] {
  const findings = state.findings.filter(f => f.engagementId === engagement.id);
  const included = findings.filter(f => f.managementLetterVisible);
  if (included.some(f => !f.impact?.trim() || !f.recommendation?.trim())) return ['Blocked: every designated management-letter observation needs an explicit impact and recommendation.'];
  return [...included.map(f => `• Deficiency: ${f.title}${f.condition ? ` — ${f.condition}` : ''}\n  Impact: ${f.impact!.trim()}\n  Auditor Recommendation: ${f.recommendation!.trim()} (${f.disposition})`),
    ...(!included.length ? ['No observations designated for this management letter.'] : []),
    ...(findings.length > included.length ? [`${findings.length - included.length} finding(s) omitted from this client document; retained in the internal audit record.`] : [])];
}

export function clientCorrespondenceLines(state: PrototypeState, engagement: EngagementRecord): string[] {
  const designated = engagement.reviews.filter(r => r.externalVisibility === 'Formal client correspondence' && r.status === 'Cleared');
  return [
    ...state.communications.filter(m => m.clientId === engagement.client && m.engagementId === engagement.id && m.visibility === 'Client visible').map(m => `• [Management correspondence ${m.id}] ${m.date} | ${m.channel} | ${m.participants}: ${m.summary} ${m.body || ''}`),
    ...engagement.pbc.filter(r => !['Draft','Cancelled'].includes(r.status)).flatMap(r => (r.thread || []).filter(m => m.clientVisible).map(m => `• [PBC inquiry ${r.id}] ${m.time} | ${m.kind} | ${m.author}: ${m.text} (current request status: ${r.status})`)),
    ...(state.confirmations || []).filter(c => c.engagementId === engagement.id).map(c => `• [Confirmation ${c.type}] ${c.counterparty} (${c.relatedFsli}): Status ${c.status} (Critical: ${c.critical ? 'Yes' : 'No'})`),
    ...designated.map(r => `• [Formal client correspondence ${r.id}] ${r.title} (${r.status}): ${r.body}`),
    `Internal review notes retained in the audit file: ${engagement.reviews.length - designated.length} (not client correspondence).`
  ];
}
