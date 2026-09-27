// "What changed since I last reviewed this?" — deterministic field differences only.
// Compares a workpaper's current state with its most recent review baseline (last clearance,
// otherwise last submission). No semantic or AI summarisation: every line cites a recorded field.
import type { EngagementRecord, WorkpaperItem } from '../types';

export interface ReviewBaseline { kind: 'clearance' | 'submission'; version: number; at: string; by: string; sourceVersion?: number }
export interface ReviewChange { field: string; detail: string; at?: string }

export function workpaperReviewBaseline(wp: WorkpaperItem): ReviewBaseline | null {
  const cleared = wp.clearanceHistory?.at(-1);
  if (cleared) return { kind: 'clearance', version: cleared.version, at: cleared.clearedAt, by: cleared.clearedBy, sourceVersion: cleared.sourceVersion };
  const submitted = wp.submissionHistory?.at(-1);
  if (submitted) return { kind: 'submission', version: submitted.version, at: submitted.submittedAt, by: submitted.submittedBy };
  return null;
}

const after = (at: string | undefined, baseline: string) => Boolean(at && baseline && at > baseline);

export function workpaperChangesSinceReview(wp: WorkpaperItem, engagement?: Pick<EngagementRecord, 'sourceVersion'>): { baseline: ReviewBaseline | null; changes: ReviewChange[] } {
  const baseline = workpaperReviewBaseline(wp);
  if (!baseline) return { baseline, changes: [] };
  const changes: ReviewChange[] = [];
  if (wp.version !== baseline.version) changes.push({ field: 'Workpaper revision', detail: `v${baseline.version} → v${wp.version}` });
  if (wp.workingPaper && after(wp.workingPaper.uploadedAt, baseline.at)) changes.push({ field: 'Workbook file', detail: `Replaced with ${wp.workingPaper.name} (v${wp.workingPaper.version}) by ${wp.workingPaper.uploadedBy}`, at: wp.workingPaper.uploadedAt });
  (wp.evidenceLinkHistory || []).filter(entry => after(entry.at, baseline.at)).forEach(entry => changes.push({ field: 'Evidence', detail: `${entry.action} ${entry.documentId} v${entry.version}${entry.reason ? ` — ${entry.reason}` : ''}`, at: entry.at }));
  (wp.assignmentHistory || []).filter(entry => after(entry.assignedAt, baseline.at)).forEach(entry => changes.push({ field: `${entry.role === 'preparer' ? 'Preparer' : 'Reviewer'} assignment`, detail: `${entry.from || 'unassigned'} → ${entry.to} (${entry.reason})`, at: entry.assignedAt }));
  if (baseline.sourceVersion !== undefined && engagement && engagement.sourceVersion !== baseline.sourceVersion) changes.push({ field: 'Trial balance source', detail: `v${baseline.sourceVersion} → v${engagement.sourceVersion}` });
  if (baseline.kind === 'clearance' && wp.status !== 'Cleared') changes.push({ field: 'Status', detail: `Cleared → ${wp.status}` });
  return { baseline, changes };
}
