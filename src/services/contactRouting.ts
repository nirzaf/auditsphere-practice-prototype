// Contact Communication Routing Service
// Implements firm rules according to STE Audit Management Tool Functional Requirements v2.1:
// - Proposals & Reports -> Managing Director / General Manager (MD/GM)
// - Invoices & Receipts -> Chief Financial Officer / Finance Director (CFO/Finance Director)
// - PBC Requests & Evidence -> Chief Accountant / Audit Liaison

import { ClientContact, ClientRecord } from '../types';
import { GuardError } from './guards';

export type CommunicationCategory = 'proposals_reports' | 'invoices_receipts' | 'pbc_requests';

export interface RouteRule {
  category: CommunicationCategory;
  label: string;
  targetRole: NonNullable<ClientContact['contactRole']>;
  description: string;
}

export const ROUTE_RULES: RouteRule[] = [
  {
    category: 'proposals_reports',
    label: 'Proposals & Audit Reports',
    targetRole: 'MD/GM',
    description: 'Routes commercial proposals, formal audit deliverables, and governance reports to MD/GM.'
  },
  {
    category: 'invoices_receipts',
    label: 'Invoices & Receipts',
    targetRole: 'CFO/Finance Director',
    description: 'Routes advance invoices, settlement fee notes, and receipt vouchers to CFO/Finance Director.'
  },
  {
    category: 'pbc_requests',
    label: 'PBC Requests & Evidence',
    targetRole: 'Chief Accountant/Audit Liaison',
    description: 'Routes PBC upload requests, evidence clarifications, and follow-ups to Chief Accountant/Audit Liaison.'
  }
];

export function getRoutedContact(
  contacts: ClientContact[],
  category: CommunicationCategory
): ClientContact | undefined {
  const rule = ROUTE_RULES.find(r => r.category === category);
  if (!rule) return undefined;

  // 1. Look for explicit contactRole match
  const explicitMatch = contacts.find(c => c.active && c.contactRole === rule.targetRole);
  if (explicitMatch) return explicitMatch;

  // 2. Fall back to title matching
  if (category === 'proposals_reports') {
    const titleMatch = contacts.find(c => c.active && /(managing director|general manager|\bmd\b|\bgm\b|ceo|partner|owner)/i.test(c.title || ''));
    if (titleMatch) return titleMatch;
  } else if (category === 'invoices_receipts') {
    const titleMatch = contacts.find(c => c.active && /(\bcfo\b|chief financial officer|finance director)/i.test(c.title || ''));
    if (titleMatch) return titleMatch;
  } else if (category === 'pbc_requests') {
    const titleMatch = contacts.find(c => c.active && /(chief accountant|audit liaison)/i.test(c.title || ''));
    if (titleMatch) return titleMatch;
  }

  // Missing responsibility must be resolved explicitly; never silently route to another role.
  return undefined;
}

export function formatContactRoleBadge(contactRole?: ClientContact['contactRole']): { label: string; routing: string } | null {
  if (!contactRole || contactRole === 'Other') return null;
  switch (contactRole) {
    case 'MD/GM':
      return { label: 'MD / GM', routing: 'Proposals & Audit Reports' };
    case 'CFO/Finance Director':
      return { label: 'CFO / FD', routing: 'Invoices & Official Receipts' };
    case 'Chief Accountant/Audit Liaison':
      return { label: 'Chief Accountant', routing: 'PBC Requests & Audit Liaison' };
  }
}

export function requireRoutedContact(contacts: ClientContact[], category: CommunicationCategory): ClientContact {
  const contact = getRoutedContact(contacts, category);
  if (!contact) throw new GuardError('INVALID_STATE', `Assign an active ${ROUTE_RULES.find(rule => rule.category === category)!.targetRole} contact before ${category.replaceAll('_', ' ')} dispatch.`);
  return contact;
}
