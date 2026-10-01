import type { PrototypeState, EngagementRecord } from '../types';
import { applyReportingAdjustments } from './calculations';
import { currentPlan, fsliRiskLevel, money } from './targetLifecycle';
import { adjustmentSupportIssues } from './adjustmentSupport';

/** Readable current-source review schedules; no persistence or professional decision. */
export function srmReviewSections(state: PrototypeState, engagement: EngagementRecord) {
  const engagementId = engagement.id, plan = currentPlan(state,engagement);
  if (!plan) throw new Error('A current plan is required for SRM schedules.');
    const journals = state.adjustmentJournals.filter(j => j.engagementId === engagementId);
    const supportIssues = adjustmentSupportIssues(state,engagementId);
    const adjustedIds = new Set([...applyReportingAdjustments(engagement.rows,journals,engagement.sourceVersion,supportIssues).applied, ...journals.filter(j => !supportIssues[j.id] && ['Management accepted','Reporting included'].includes(j.status) && j.reflectionStatus === 'Reflected in TB' && j.reflectionSourceVersion === engagement.sourceVersion).map(j => j.id)]);
    const unadjusted = state.findings.filter(f => f.engagementId === engagementId && f.category === 'Monetary misstatement' && !['Corrected in TB','Corrected by client'].includes(f.disposition || '') && !journals.some(j => adjustedIds.has(j.id) && (j.id === f.linkedJournalId || j.supportLinks?.finding?.id === f.id)));
    const gross = money(unadjusted.reduce((n,f) => n + (f.grossMisstatement ?? Math.abs(f.amount || 0)), 0));
    const net = money(unadjusted.reduce((n,f) => n + (f.netMisstatement ?? f.amount ?? 0),0));
  return [
      'ADJUSTMENT JOURNAL SCHEDULE (each journal counted once):',
      ...journals.map(j => `${j.id} v${j.revision || 1}: ${j.title}; ${j.status}; ${adjustedIds.has(j.id) ? 'ADJUSTED: applied in reporting or reflected in current TB' : 'NOT POSTED: pending/rejected/stale adjustment'}; reflection ${j.reflectionStatus || 'Unknown'}; debits ${j.lines.filter(l => l.type === 'debit').reduce((n,l) => n + l.amount,0)}; credits ${j.lines.filter(l => l.type === 'credit').reduce((n,l) => n + l.amount,0)}; ${j.rationale}`),
      'UNADJUSTED DIFFERENCES (each finding once; pending linked AJE does not remove the difference):',
      ...journals.flatMap(j => (j.managementResponses || []).filter(response => response.journalRevision === (j.revision || 1)).map(response => `${j.id}: management ${response.accepted ? 'accepted' : 'declined'} correction; ${response.respondent}; reference ${response.reference}; ${response.note}; recorded ${response.at} by ${response.recordedByUserId}.`)),
      ...unadjusted.map(f => `${f.id}: ${f.title}; gross ${f.grossMisstatement ?? Math.abs(f.amount || 0)}; net ${f.netMisstatement ?? f.amount ?? 0}; ${f.disposition}`),
      `Aggregate gross unadjusted: ${gross} ${engagement.currency}; SAD ${plan.clearlyTrivialThreshold} (${gross > plan.clearlyTrivialThreshold ? 'exceeds' : 'within'}); PM ${plan.overallMateriality} (${gross > plan.overallMateriality ? 'exceeds' : 'within'}).`,
      `Aggregate signed net unadjusted: ${net} ${engagement.currency}. Balanced journal debit/credit totals are disclosed separately and are not added again as misstatement amounts.`,
      'SIGNIFICANT ESTIMATES AND GOING CONCERN EVALUATION:',
      ...engagement.rows.filter(r => /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc/i.test(r.name)).map(r => `Estimate ${r.code} / ${r.name}: ${r.balance} ${engagement.currency}; FSLI ${r.mappedStatementLine || 'Unmapped'}; risk ${fsliRiskLevel(state,engagement,r.mappedStatementLine || r.name)}; evaluation ${engagement.auditLifecycle!.analyticalReviews?.find(a => a.fsli === r.mappedStatementLine)?.analysis || 'See current risk response and workprogram conclusions below.'}`),
      ...[...new Map((engagement.auditLifecycle!.analyticalReviews || []).map(r => [r.fsli,r])).values()].map(r => `${r.fsli}: ${r.analysis}; ${r.isa570Checklist.conclusion}`),
      'RED-AREA REVIEW EVIDENCE (manager-executed workpapers with their current clearance):',
      ...(() => {
        const red = engagement.workpapers.filter(w => w.applicable && w.executionRiskLevel === 'RED');
        if (!red.length) return ['No RED-risk workpaper in the current program file; manager execution and partner review were not triggered.'];
        return red.map(w => {
          const areas = state.auditPrograms.filter(p => p.engagementId === engagementId && p.leadWorkpaperRef === w.id).map(p => p.area).join(', ');
          const procedures = state.auditPrograms.flatMap(p => (p.leadWorkpaperRef === w.id ? p.procedures : [])).map(s => `${s.id} ${s.status}`).join('; ');
          return `Workpaper ${w.id} (areas: ${areas || w.title}); executor/preparer ${w.preparer}; assigned reviewer ${w.reviewer}; v${w.version} ${w.status}; clearance ${w.clearance ? `${w.clearance.clearedBy} at ${w.clearance.clearedAt} (v${w.clearance.version}, source v${w.clearance.sourceVersion})` : 'MISSING — assigned reviewer clearance required before Partner approval'}; procedures ${procedures || 'none linked'}.`;
        });
      })(),
  ];
}
