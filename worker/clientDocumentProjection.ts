export type ClientDocumentCategory = 'ENGAGEMENT_LETTER' | 'INVOICE' | 'RECEIPT' | 'HOLDING_LETTER' | 'FINAL_DELIVERABLE';

export interface ClientDocumentBlockerSnapshot {
  id: string;
  type: string;
  status: string;
  dueDate: string;
  stalePins: boolean;
}

export interface ClientDocument {
  id: string;
  fileVersionId: string;
  category: ClientDocumentCategory;
  originalName: string;
  issueDate: string;
  engagementId: string;
  engagementCode: string;
  blockers?: ClientDocumentBlockerSnapshot[];
}

export interface ClientDocumentSourceRow {
  id: unknown;
  file_version_id: unknown;
  category: unknown;
  original_name: unknown;
  issue_date: unknown;
  engagement_id: unknown;
  engagement_code: unknown;
  blockers_json?: unknown;
}

const categories = new Set<ClientDocumentCategory>([
  'ENGAGEMENT_LETTER', 'INVOICE', 'RECEIPT', 'HOLDING_LETTER', 'FINAL_DELIVERABLE'
]);

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function projectBlockers(value: unknown): ClientDocumentBlockerSnapshot[] {
  if (typeof value !== 'string') return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const blocker = item as Record<string, unknown>;
    const id = stringValue(blocker.id);
    const type = stringValue(blocker.type);
    const status = stringValue(blocker.status);
    const dueDate = stringValue(blocker.dueDate);
    if (!id || !type || !status || !dueDate) return [];
    return [{ id, type, status, dueDate, stalePins: blocker.stalePins === true }];
  });
}

/** Returns an explicit allowlist for the client document centre; source-row internals are never copied. */
export function projectClientDocuments(rows: readonly ClientDocumentSourceRow[]): ClientDocument[] {
  return rows.flatMap(row => {
    const id = stringValue(row.id);
    const fileVersionId = stringValue(row.file_version_id);
    const category = stringValue(row.category) as ClientDocumentCategory | null;
    const originalName = stringValue(row.original_name);
    const issueDate = stringValue(row.issue_date);
    const engagementId = stringValue(row.engagement_id);
    const engagementCode = stringValue(row.engagement_code);
    if (!id || !fileVersionId || !category || !categories.has(category) || !originalName || !issueDate || !engagementId || !engagementCode) return [];
    return [{
      id, fileVersionId, category, originalName, issueDate, engagementId, engagementCode,
      ...(category === 'HOLDING_LETTER' ? { blockers: projectBlockers(row.blockers_json) } : {})
    }];
  }).sort((left, right) => right.issueDate.localeCompare(left.issueDate) || left.id.localeCompare(right.id));
}
