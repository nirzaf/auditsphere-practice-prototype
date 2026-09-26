import type { PbcRequestItem } from '../types';

export type PbcRequestStatusFilter = PbcRequestItem['status'] | 'All';
export type PbcRequestDueFilter = 'All dates' | 'Overdue' | 'Due today' | 'Upcoming';
export interface PbcRequestFilterSet {
  status: PbcRequestStatusFilter;
  due: PbcRequestDueFilter;
  recipient: string;
  search: string;
}

const ACTIONABLE_STATUSES: readonly PbcRequestItem['status'][] = [
  'Requested', 'Received', 'Under review', 'Needs clarification'
];

export function getPbcRequestRecipient(request: Pick<PbcRequestItem, 'owner' | 'contributor'>): string {
  return request.contributor?.trim() || request.owner.trim();
}

export function filterPbcRequests<T extends PbcRequestItem>(
  requests: readonly T[],
  filters: PbcRequestFilterSet,
  asOfDate: string
): T[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return requests.filter(request => {
    if (filters.status !== 'All' && request.status !== filters.status) return false;
    if (filters.recipient && getPbcRequestRecipient(request) !== filters.recipient) return false;

    if (filters.due !== 'All dates') {
      if (!ACTIONABLE_STATUSES.includes(request.status)) return false;
      if (filters.due === 'Overdue' && !(request.due < asOfDate)) return false;
      if (filters.due === 'Due today' && request.due !== asOfDate) return false;
      if (filters.due === 'Upcoming' && !(request.due > asOfDate)) return false;
    }

    if (query) {
      const searchable = `${request.title} ${request.id} ${request.category} ${request.owner} ${request.contributor || ''}`;
      if (!searchable.toLocaleLowerCase().includes(query)) return false;
    }
    return true;
  });
}

export function getOutstandingPbcRequestCount(requests: readonly PbcRequestItem[]): number {
  return requests.filter(request => ACTIONABLE_STATUSES.includes(request.status)).length;
}
