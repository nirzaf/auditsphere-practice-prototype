import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BusinessContextResponse,
  BusinessFieldworkWorkspace,
  BusinessFileMetadata,
  BusinessWorkspacePreference
} from '../../shared/api/business';
import {
  getBusinessFieldworkWorkspace,
  getBusinessFieldworkChanges,
  getBusinessSamplingPlan,
  getBusinessSamplingPopulation,
  newBusinessIdempotencyKey,
  runBusinessCommand
} from '../../services/businessWorkspace';

type EngagementRef = { id: string; clientId: string; code: string; clientName: string; lifecycleState: string; periodStart: string; periodEnd: string };
type Tab = 'statements' | 'workprograms' | 'sampling' | 'evidence' | 'reviews';
type Assertion = 'EXISTENCE' | 'RIGHTS_OBLIGATIONS' | 'COMPLETENESS' | 'VALUATION' | 'CUTOFF' | 'PRESENTATION';
type PopulationPayload = {
  population: { id: string; name: string; rowCount: number; positiveTotalMinor: number; excludedCount: number; exclusionsReason: string; sourceHash: string; tbVersionId: string };
  rows: Array<{ id: string; sourceRowKey: string; ordinal: number; bookValueMinor: number; eligible: number; exclusionReason: string | null }>;
};
type SamplingPlanPayload = {
  plan: { id: string; populationId: string; method: string; revision: number; confidenceBps: number | null; tolerableMinor: number | null;
    requestedCount: number | null; calculatedCount: number; inputHash: string; parameters: Record<string, unknown>; seedHex?: string; policyVersion?: number; latestResult: string | null };
  population: { id: string; name: string; rowCount: number; positiveTotalMinor: number; excludedCount: number };
  rows: Array<{ id: string; sourceRowKey: string; ordinal: number; bookValueMinor: number; eligible: number; exclusionReason: string | null }>;
  hits: Array<{ drawNumber: number; populationRowId: string; monetaryUnitMinor: number | null; stratumKey: string | null; sourceRowKey: string }>;
  tests: Array<{ id: string; version: number; populationRowId: string; tested: number; auditedValueMinor: string | number | null; misstated: number | null; deviation: number | null;
    conclusion: string | null; evidenceId: string | null; evidenceVersion: number | null }>;
  testSetHash: string;
  strata: Array<Record<string, unknown>>;
  evaluations: Array<Record<string, unknown>>;
};

const activeStates = new Set(['FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN']);
const assertions: Assertion[] = ['EXISTENCE', 'RIGHTS_OBLIGATIONS', 'COMPLETENESS', 'VALUATION', 'CUTOFF', 'PRESENTATION'];
const standardSteps: Array<{ title: string; instructions: string; assertion: Assertion; mandatory: boolean }> = [
  { title: 'Existence', instructions: 'Inspect retained source evidence and test that the recorded balance or transaction exists.', assertion: 'EXISTENCE', mandatory: true },
  { title: 'Rights and obligations', instructions: 'Inspect contracts, title or other source evidence for ownership and obligations.', assertion: 'RIGHTS_OBLIGATIONS', mandatory: true },
  { title: 'Completeness', instructions: 'Trace from source records into the ledger and assess omitted items.', assertion: 'COMPLETENESS', mandatory: true },
  { title: 'Valuation', instructions: 'Recalculate or inspect valuation inputs and compare them with retained evidence.', assertion: 'VALUATION', mandatory: true },
  { title: 'Cutoff and presentation', instructions: 'Inspect period cutoff and financial-statement classification for relevant items.', assertion: 'CUTOFF', mandatory: true }
];

function qar(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  let amount: bigint;
  try { amount = BigInt(String(value)); } catch { return '—'; }
  const absolute = amount < 0n ? -amount : amount;
  const whole = new Intl.NumberFormat('en-QA').format(absolute / 100n);
  return `QAR ${amount < 0n ? '-' : ''}${whole}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
function toMinor(value: string): string {
  const match = value.trim().match(/^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Enter a QAR amount with no more than two decimal places.');
  const magnitude = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  const amount = match[1] ? -magnitude : magnitude;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('The amount exceeds supported precision.');
  return amount.toString();
}
function percentBps(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error('Enter a percentage from 0 through 100.');
  return Math.round(parsed * 100);
}
function label(value: unknown): string { return String(value ?? '—').replaceAll('_', ' '); }
function formatRate(value: number | null, reason: string): string {
  if (reason !== 'CALCULATED' || value === null) return label(reason);
  return `${value.toFixed(2)}%`;
}

export function BusinessFieldworkPanel({ workspaceId, selected, context, engagement, files, onChanged }: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: EngagementRef;
  files: BusinessFileMetadata[];
  onChanged: () => void;
}) {
  const scope = useMemo(() => ({ ...selected, clientId: engagement.clientId, engagementId: engagement.id }),
    [selected.actorId, selected.persona, engagement.clientId, engagement.id]);
  const available = activeStates.has(engagement.lifecycleState);
  const [workspace, setWorkspace] = useState<BusinessFieldworkWorkspace | null>(null);
  const [loading, setLoading] = useState(available);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('statements');
  const [selectedFsliId, setSelectedFsliId] = useState('');
  const [snapshotId, setSnapshotId] = useState('');
  const [expectation, setExpectation] = useState('');
  const [thresholdPercent, setThresholdPercent] = useState('10');
  const [thresholdAmount, setThresholdAmount] = useState('');
  const [analysisExplanation, setAnalysisExplanation] = useState('');
  const [analysisConclusion, setAnalysisConclusion] = useState('');
  const [ratioName, setRatioName] = useState('Current ratio');
  const [ratioNumerator, setRatioNumerator] = useState('');
  const [ratioDenominator, setRatioDenominator] = useState('');
  const [ratioNumeratorSource, setRatioNumeratorSource] = useState('');
  const [ratioDenominatorSource, setRatioDenominatorSource] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [sourceFsliId, setSourceFsliId] = useState('');
  const [sourceRowsPage, setSourceRowsPage] = useState(0);
  const [goingChecklist, setGoingChecklist] = useState({ managementAssessment: false, cashFlowForecasts: false, financingAndCovenants: false,
    adverseEvents: false, mitigatingPlans: false, uncertaintyEvaluation: false });
  const [goingManagementFile, setGoingManagementFile] = useState('');
  const [goingEvidenceFiles, setGoingEvidenceFiles] = useState<string[]>([]);
  const [goingStart, setGoingStart] = useState(engagement.periodStart);
  const [goingEnd, setGoingEnd] = useState(() => {
    const date = new Date(`${engagement.periodEnd}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 12); return date.toISOString().slice(0, 10);
  });
  const [goingEvents, setGoingEvents] = useState('');
  const [goingPlans, setGoingPlans] = useState('');
  const [goingConclusion, setGoingConclusion] = useState<'UNASSESSED'|'NO_MATERIAL_UNCERTAINTY'|'MATERIAL_UNCERTAINTY'|'INAPPROPRIATE_BASIS'>('UNASSESSED');
  const [goingRationale, setGoingRationale] = useState('');
  const [templateSteps, setTemplateSteps] = useState(standardSteps);
  const [templateTitle, setTemplateTitle] = useState('Substantive audit procedures');
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [adhocDrafts, setAdhocDrafts] = useState<Record<string, { title: string; instructions: string; assertion: Assertion; scopeReason: string }>>({});
  const [procedureDrafts, setProcedureDrafts] = useState<Record<string, { workPerformed: string; conclusion: string }>>({});
  const [procedureReviewDrafts, setProcedureReviewDrafts] = useState<Record<string, string>>({});
  const [procedureReworkReasons, setProcedureReworkReasons] = useState<Record<string, string>>({});
  const [workprogramReviewDrafts, setWorkprogramReviewDrafts] = useState<Record<string, string>>({});
  const [reviewNoteResponses, setReviewNoteResponses] = useState<Record<string, string>>({});
  const [reviewNoteClosures, setReviewNoteClosures] = useState<Record<string, string>>({});
  const [partnerClearanceRationales, setPartnerClearanceRationales] = useState<Record<string, string>>({});
  const [handoverReason, setHandoverReason] = useState('');
  const [procedureNaReasons, setProcedureNaReasons] = useState<Record<string, string>>({});
  const [populationName, setPopulationName] = useState('');
  const [populationFileId, setPopulationFileId] = useState('');
  const [populationFsliId, setPopulationFsliId] = useState('');
  const [worksheet, setWorksheet] = useState('');
  const [headerRow, setHeaderRow] = useState('1');
  const [referenceColumn, setReferenceColumn] = useState('0');
  const [amountColumn, setAmountColumn] = useState('1');
  const [descriptionColumn, setDescriptionColumn] = useState('2');
  const [exclusionsReason, setExclusionsReason] = useState('');
  const [selectedPopulationId, setSelectedPopulationId] = useState('');
  const [population, setPopulation] = useState<PopulationPayload | null>(null);
  const [stratumByRow, setStratumByRow] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'MUS_BINOMIAL_PPS'|'SYSTEMATIC'|'STRATIFIED_ATTRIBUTE'>('MUS_BINOMIAL_PPS');
  const [confidencePercent, setConfidencePercent] = useState('95');
  const [tolerableAmount, setTolerableAmount] = useState('500.00');
  const [expectedTaintedPercent, setExpectedTaintedPercent] = useState('0');
  const [requestedCount, setRequestedCount] = useState('25');
  const [sampleRationale, setSampleRationale] = useState('Reviewer-selected systematic sample size based on engagement risk and available population coverage.');
  const [systematicOrdering, setSystematicOrdering] = useState<'SOURCE_ROW_ASC'|'REFERENCE_ASC'|'SERVER_SEEDED_SHUFFLE'>('SOURCE_ROW_ASC');
  const [attributeExpected, setAttributeExpected] = useState('0');
  const [attributeTolerable, setAttributeTolerable] = useState('10');
  const [attributeRationale, setAttributeRationale] = useState('Risk-based tolerable deviation rate approved for this population.');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planDetail, setPlanDetail] = useState<SamplingPlanPayload | null>(null);
  const [attributePage, setAttributePage] = useState(0);
  const [samplePage, setSamplePage] = useState(0);
  const [hitPage, setHitPage] = useState(0);
  const [sampleDrafts, setSampleDrafts] = useState<Record<string, { auditedValue: string; misstated: boolean; deviation: boolean; conclusion: string; evidenceId: string }>>({});
  const [evidenceMode, setEvidenceMode] = useState<'DIGITAL'|'PHYSICAL'|'HYBRID'>('DIGITAL');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceFileId, setEvidenceFileId] = useState('');
  const [physicalIndex, setPhysicalIndex] = useState('');
  const [physicalDescription, setPhysicalDescription] = useState('');
  const [binder, setBinder] = useState('');
  const [box, setBox] = useState('');
  const [shelf, setShelf] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [retrievedAt, setRetrievedAt] = useState('');
  const [reviewEvidenceId, setReviewEvidenceId] = useState('');
  const [reviewEvidenceVersion, setReviewEvidenceVersion] = useState('');
  const [evidenceDecision, setEvidenceDecision] = useState<'ADEQUATE'|'DEFICIENT'>('ADEQUATE');
  const [evidenceRationale, setEvidenceRationale] = useState('');
  const [policyApprovalRationales, setPolicyApprovalRationales] = useState<Record<string, string>>({});
  const [linkEvidenceId, setLinkEvidenceId] = useState('');
  const [linkTargetType, setLinkTargetType] = useState<'PROCEDURE'|'SAMPLE_TEST'|'ANALYTICAL_REVIEW'|'FINDING'>('PROCEDURE');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkTargetVersion, setLinkTargetVersion] = useState('');
  const [unlinkId, setUnlinkId] = useState('');
  const [unlinkReason, setUnlinkReason] = useState('');
  const [changeCursor, setChangeCursor] = useState(0);
  const samplingPlanIdempotencyKey = useRef<string | null>(null);

  const canWrite = context.allowedActions.includes('fieldwork.manage') && context.actor.persona !== 'CLIENT';
  const canReview = context.allowedActions.includes('fieldwork.review') && context.actor.persona !== 'PREPARER' && context.actor.persona !== 'CLIENT';
  const canPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const sourceFiles = files.filter(file => file.engagementId === engagement.id && file.state === 'COMMITTED' && file.immutable && (file.purpose === 'EVIDENCE' || file.purpose === 'PBC'));
  const allLines = useMemo(() => workspace ? [...workspace.statements.profitLoss, ...workspace.statements.balanceSheet] : [], [workspace]);
  const selectedLine = allLines.find(line => line.fsliId === selectedFsliId) ?? null;
  const selectedWorkprogram = workspace?.workprograms.find(item => item.fsliId === selectedFsliId) ?? null;
  const selectedAnalyticalReviews = workspace?.analyticalReviews.filter(item => String(item.fsliId) === selectedFsliId) ?? [];
  const editableEvidence = workspace?.evidence ?? [];
  const distinctSampleRows = planDetail ? [...new Set(planDetail.hits.map(hit => hit.populationRowId))] : [];
  const eligiblePopulationRows = population?.rows.filter(row => row.eligible === 1) ?? [];
  const selectedSourceRows = allLines.find(line => line.fsliId === sourceFsliId)?.sourceRows ?? [];

  useEffect(() => {
    if (!available) { setLoading(false); setWorkspace(null); return; }
    const controller = new AbortController(); setLoading(true); setError(''); setWorkspace(null);
    getBusinessFieldworkWorkspace(workspaceId, engagement.id, scope, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setWorkspace(data); setChangeCursor(data.changeCursor);
        setSelectedFsliId(current => current || data.statements.profitLoss[0]?.fsliId || data.statements.balanceSheet[0]?.fsliId || '');
        setPopulationFsliId(current => current || data.statements.profitLoss[0]?.fsliId || data.statements.balanceSheet[0]?.fsliId || '');
        setAssignedStaffId(current => current || data.staff.find(person => person.grade === 'MANAGER')?.id || data.staff[0]?.id || '');
        setSelectedPlanId(current => current || data.samplingPlans[0]?.id || '');
        setSelectedPopulationId(current => current || data.populations[0]?.id || '');
        setReviewEvidenceId(current => current || data.evidence[0]?.id || '');
        setReviewEvidenceVersion(current => current || String(data.evidence[0]?.version ?? ''));
        setLinkEvidenceId(current => current || data.evidence[0]?.id || '');
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Fieldwork records could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [available, workspaceId, engagement.id, scope.actorId, scope.persona, scope.clientId, scope.engagementId, refresh]);

  useEffect(() => {
    if (!selectedPopulationId || !available) { setPopulation(null); return; }
    const controller = new AbortController(); setPopulation(null);
    getBusinessSamplingPopulation(workspaceId, engagement.id, selectedPopulationId, scope, controller.signal)
      .then(value => { if (!controller.signal.aborted) { const data = value as unknown as PopulationPayload; setPopulation(data); setStratumByRow({}); setAttributePage(0); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Population rows could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selectedPopulationId, scope.actorId, scope.persona, scope.clientId, scope.engagementId, available]);

  useEffect(() => {
    if (!selectedPlanId || !available) { setPlanDetail(null); return; }
    const controller = new AbortController(); setPlanDetail(null);
    getBusinessSamplingPlan(workspaceId, engagement.id, selectedPlanId, scope, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPlanDetail(value as unknown as SamplingPlanPayload); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Sampling plan details could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selectedPlanId, scope.actorId, scope.persona, scope.clientId, scope.engagementId, available, refresh]);

  async function command<T extends Record<string, unknown> = Record<string, unknown>>(type: string, payload: Record<string, unknown>, success: string, idempotencyKey = newBusinessIdempotencyKey()): Promise<T | null> {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await runBusinessCommand<T>(workspaceId, scope, { type, payload }, idempotencyKey);
      setMessage(success); setRefresh(value => value + 1); onChanged(); return response.result;
    } catch (reason) {
      const code = reason && typeof reason === 'object' ? String((reason as { code?: unknown }).code ?? '') : '';
      if (code === 'VERSION_CONFLICT' || code === 'STALE_REVISION' || code === 'STALE_DEPENDENCY') {
        setError('This row or one of its source pins changed while you were working. The current records are being reloaded; review them before retrying.');
        setRefresh(value => value + 1);
      } else setError(reason instanceof Error ? reason.message : 'The fieldwork change could not be saved.');
      return null;
    } finally { setBusy(false); }
  }

  async function createSnapshot(): Promise<string | null> {
    const result = await command<{ statementSnapshotId?: string }>('statement.snapshot', { engagementId: engagement.id }, 'A source-pinned financial statement snapshot is ready.');
    const id = result?.statementSnapshotId ?? null; if (id) setSnapshotId(id); return id;
  }

  async function saveAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedLine) return;
    try {
      const currentSnapshot = snapshotId || await createSnapshot(); if (!currentSnapshot) return;
      const ratios = ratioNumerator.trim() || ratioDenominator.trim() ? [{ name: ratioName, numeratorMinor: toMinor(ratioNumerator), denominatorMinor: toMinor(ratioDenominator),
        numeratorSource: ratioNumeratorSource, denominatorSource: ratioDenominatorSource }] : [];
      const result = await command<{ analyticalReviewId?: string }>('analytical-review.save', { engagementId: engagement.id, fsliId: selectedLine.fsliId,
        statementSnapshotId: currentSnapshot, expectationText: expectation, thresholdBps: percentBps(thresholdPercent),
        ...(thresholdAmount.trim() ? { thresholdMinor: toMinor(thresholdAmount) } : {}), explanation: analysisExplanation, conclusion: analysisConclusion, ratios },
        `Analytical review drafted for ${selectedLine.code}.`);
      if (result?.analyticalReviewId) setShowAnalysis(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The analytical review is incomplete.'); }
  }

  async function saveGoingConcern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await command('going-concern.save', { engagementId: engagement.id, assessmentStart: goingStart, assessmentEnd: goingEnd, checklist: goingChecklist,
      managementAssessmentFileId: goingManagementFile || null, evidenceFileIds: goingEvidenceFiles, eventsText: goingEvents, mitigatingPlansText: goingPlans,
      conclusion: goingConclusion, rationale: goingRationale }, 'Going-concern assessment revision saved with its source file pins.');
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedLine || !workspace) return;
    await command('workprogram.template.create', { fsliCode: selectedLine.code, title: templateTitle, standardsProfileId: workspace.engagement.standardsProfileId, procedures: templateSteps },
      `A versioned ${selectedLine.code} template was created for Partner approval.`);
  }

  async function provisionWorkprogram(templateId: string) {
    if (!selectedLine || !workspace?.engagement.approvedPlanningVersionId || !assignedStaffId) return;
    const result = await command<{ workprogramId?: string }>('workprogram.provision', { engagementId: engagement.id, fsliId: selectedLine.fsliId,
      planningVersionId: workspace.engagement.approvedPlanningVersionId, templateId, assignedStaffId }, `Workprogram provisioned for ${selectedLine.code}.`);
    if (result?.workprogramId) setTab('workprograms');
  }

  async function insertProcedure(event: FormEvent<HTMLFormElement>, workprogramId: string) {
    event.preventDefault(); const draft = adhocDrafts[workprogramId]; if (!draft) return;
    const result = await command<{ procedureId?: string }>('procedure.insert', { workprogramId, title: draft.title, instructions: draft.instructions,
      assertion: draft.assertion, scopeReason: draft.scopeReason }, 'Ad-hoc procedure added with a retained scope rationale.');
    if (result) setAdhocDrafts(current => ({ ...current, [workprogramId]: { title: '', instructions: '', assertion: 'VALUATION', scopeReason: '' } }));
  }

  async function createPopulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await command<{ populationId?: string }>('sampling.population.create', { engagementId: engagement.id, name: populationName, fsliId: populationFsliId,
      sourceFileId: populationFileId, ...(worksheet.trim() ? { worksheet: worksheet.trim() } : {}), headerRow: Number(headerRow), referenceColumn: Number(referenceColumn),
      amountColumn: Number(amountColumn), descriptionColumn: Number(descriptionColumn), exclusionsReason }, 'A source-pinned sample population was imported.');
    if (result?.populationId) { setSelectedPopulationId(result.populationId); setPopulationName(''); }
  }

  async function createSamplingPlan(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!population || !workspace) return;
    try {
      const policy = workspace.samplingPolicies.find(item => item.method === method && item.status === 'APPROVED');
      if (!policy) throw new Error(`A Partner-approved ${label(method)} policy is required before sampling.`);
      const confidenceBps = percentBps(confidencePercent);
      const strata = method === 'STRATIFIED_ATTRIBUTE' ? (() => {
        const groups = new Map<string, string[]>();
        for (const row of population.rows.filter(item => item.eligible === 1)) {
          const key = (stratumByRow[row.id] ?? 'A').trim();
          if (!key) throw new Error(`Assign eligible row ${row.sourceRowKey} to a stratum.`);
          groups.set(key, [...(groups.get(key) ?? []), row.id]);
        }
        return [...groups.entries()].map(([key, populationRowIds]) => ({ key, description: `Reviewer-defined stratum ${key}`,
          populationRowIds, expectedDeviationBps: percentBps(attributeExpected), tolerableDeviationBps: percentBps(attributeTolerable), rationale: attributeRationale }));
      })() : undefined;
      const payload: Record<string, unknown> = { engagementId: engagement.id, populationId: population.population.id, policyId: policy.id, method,
        ...(method === 'SYSTEMATIC' ? { requestedCount: Number(requestedCount), sampleSizeRationale: sampleRationale, orderingRule: systematicOrdering } : { confidenceBps }),
        ...(method === 'MUS_BINOMIAL_PPS' ? { tolerableMinor: toMinor(tolerableAmount), expectedTaintedBps: percentBps(expectedTaintedPercent) } : {}),
        ...(strata ? { strata } : {}), reason: sampleRationale };
      const idempotencyKey = samplingPlanIdempotencyKey.current ?? newBusinessIdempotencyKey();
      samplingPlanIdempotencyKey.current = idempotencyKey;
      const result = await command<{ planId?: string }>('sampling.plan', payload, 'A reproducible sample has been selected and committed with its source and policy pins.', idempotencyKey);
      if (result?.planId) { samplingPlanIdempotencyKey.current = null; setHitPage(0); setSamplePage(0); setSelectedPlanId(result.planId); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sampling inputs are incomplete.'); }
  }

  async function recordSampleTest(event: FormEvent<HTMLFormElement>, hitRowId: string) {
    event.preventDefault(); if (!planDetail) return;
    const draft = sampleDrafts[hitRowId] ?? { auditedValue: '', misstated: false, deviation: false, conclusion: '', evidenceId: '' };
    const existing = planDetail.tests.find(test => test.populationRowId === hitRowId);
    try {
      const auditedValueMinor = draft.auditedValue.trim() ? toMinor(draft.auditedValue) : null;
      const evidence = editableEvidence.find(item => item.id === draft.evidenceId);
      await command('sampling.record-test', { planId: planDetail.plan.id, populationRowId: hitRowId, expectedVersion: existing?.version ?? 0, tested: true,
        auditedValueMinor, misstated: planDetail.plan.method === 'MUS_BINOMIAL_PPS' ? draft.misstated : null,
        deviation: planDetail.plan.method === 'STRATIFIED_ATTRIBUTE' ? draft.deviation : null, conclusion: draft.conclusion,
        evidenceId: evidence?.id ?? null, evidenceVersion: evidence?.version ?? null }, 'Sample test saved with exact evidence version.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The sample test is incomplete.'); }
  }

  async function createEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await command('evidence.create', { engagementId: engagement.id, mode: evidenceMode, title: evidenceTitle,
      ...(evidenceFileId ? { fileVersionId: evidenceFileId } : {}), ...(physicalIndex ? { physicalIndex } : {}), ...(physicalDescription ? { physicalDescription } : {}),
      ...(binder ? { binder } : {}), ...(box ? { box } : {}), ...(shelf ? { shelf } : {}),
      ...(externalUrl ? { externalSourceUrl: externalUrl, retrievedAt: retrievedAt ? new Date(retrievedAt).toISOString() : '' } : {}) }, 'Evidence record created with pending reviewer verification.');
    setEvidenceTitle('');
  }

  async function linkEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const evidence = editableEvidence.find(item => item.id === linkEvidenceId);
    if (!evidence) { setError('Choose a current evidence version first.'); return; }
    const selectedTarget = linkTargetType === 'PROCEDURE' ? workspace?.procedures.find(item => item.id === linkTargetId)
      : linkTargetType === 'ANALYTICAL_REVIEW' ? workspace?.analyticalReviews.find(item => String(item.id) === linkTargetId)
        : linkTargetType === 'SAMPLE_TEST' ? planDetail?.tests.find(item => item.id === linkTargetId) : null;
    if (!selectedTarget) { setError('Choose an available target in this engagement.'); return; }
    const targetProp = linkTargetType === 'PROCEDURE' ? { procedureId: linkTargetId } : linkTargetType === 'ANALYTICAL_REVIEW' ? { analyticalReviewId: linkTargetId }
      : linkTargetType === 'SAMPLE_TEST' ? { sampleTestId: linkTargetId } : { findingId: linkTargetId };
    const targetVersion = Number(linkTargetVersion || ('version' in selectedTarget ? selectedTarget.version : 0));
    await command('evidence.link', { evidenceId: evidence.id, evidenceVersion: evidence.version, targetVersion, ...targetProp }, 'Evidence linked to the selected exact target revision.');
  }

  async function reviewProcedure(procedure: BusinessFieldworkWorkspace['procedures'][number], decision: 'ACCEPT'|'REWORK'|'NOT_APPLICABLE_APPROVED') {
    const comments = procedureReviewDrafts[procedure.id] ?? '';
    if (comments.trim().length < 10) { setError('The review rationale needs at least 10 non-space characters.'); return; }
    const result = await command('procedure.review', { procedureId: procedure.id, expectedVersion: procedure.version, decision, comments }, `Procedure ${label(decision).toLowerCase()} decision recorded.`);
    if (result) setProcedureReviewDrafts(current => ({ ...current, [procedure.id]: '' }));
  }

  if (!available) return <section className="business-fieldwork-panel" aria-labelledby="business-fieldwork-heading">
    <div className="business-fieldwork-head"><div><p className="business-eyebrow">TECHNICAL EXECUTION</p><h2 id="business-fieldwork-heading">Audit fieldwork</h2></div><span className="business-fieldwork-state">Available after planning sign-off</span></div>
    <p className="business-note">Approve and hand over the current trial-balance, FSLI mapping, materiality and planning versions before technical fieldwork can begin.</p>
  </section>;

  return <section className="business-fieldwork-panel" aria-labelledby="business-fieldwork-heading">
    <div className="business-fieldwork-head">
      <div><p className="business-eyebrow">VERSION-PINNED TECHNICAL EXECUTION</p><h2 id="business-fieldwork-heading">Audit fieldwork</h2>
        <p className="business-muted">{engagement.clientName} · {engagement.code} · {label(engagement.lifecycleState)}</p></div>
      <button type="button" className="btn sm" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Refresh records</button>
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-success-note" role="status">{message}</p>}
    {loading ? <p className="business-note" role="status">Loading current audit records…</p> : workspace && <>
      <div className="business-fieldwork-pins" aria-label="Current source versions">
        <span><strong>TB</strong>{workspace.engagement.activeTbVersionId ?? 'Missing'}</span><span><strong>Mapping</strong>{workspace.engagement.activeMappingVersionId ?? 'Missing'}</span>
        <span><strong>Planning</strong>{workspace.engagement.approvedPlanningVersionId ?? 'Missing'}</span><span><strong>Statement source</strong>{workspace.statements.sourceHash.slice(0, 14)}</span>
      </div>
      <nav className="business-fieldwork-tabs" aria-label="Fieldwork sections">
        {([['statements','Financial statements'],['workprograms','Workprograms'],['sampling','Sampling'],['evidence','Evidence'],['reviews','Review queue']] as Array<[Tab,string]>).map(([key,title]) =>
          <button type="button" key={key} className={tab === key ? 'selected' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}
      </nav>

      {tab === 'statements' && <div className="business-fieldwork-body">
        <div className="business-fieldwork-actions"><div><strong>Adjusted reporting view</strong><span>Source TB and mapping remain unchanged; accepted adjustment hash {workspace.statements.adjustmentSetHash.slice(0, 14)}.</span></div>
          <button type="button" className="btn sm" disabled={busy} onClick={() => void createSnapshot()}>Create current snapshot</button></div>
        <StatementPane title="Profit and loss" lines={workspace.statements.profitLoss} selectedFsliId={selectedFsliId} onAnalysis={line => { setSelectedFsliId(line.fsliId); setShowAnalysis(true); }} onWorkprogram={line => { setSelectedFsliId(line.fsliId); setTab('workprograms'); }} onSources={id => { setSourceRowsPage(0); setSourceFsliId(id); }}
          reviews={workspace.analyticalReviews} workprograms={workspace.workprograms} />
        <StatementPane title="Balance sheet" lines={workspace.statements.balanceSheet} selectedFsliId={selectedFsliId} onAnalysis={line => { setSelectedFsliId(line.fsliId); setShowAnalysis(true); }} onWorkprogram={line => { setSelectedFsliId(line.fsliId); setTab('workprograms'); }} onSources={id => { setSourceRowsPage(0); setSourceFsliId(id); }}
          reviews={workspace.analyticalReviews} workprograms={workspace.workprograms} />
        <section className={`business-fieldwork-reconciliation ${workspace.statements.reconciliation.balanced ? 'balanced' : 'unbalanced'}`} aria-label="Balance sheet reconciliation">
          <div><strong>Assets</strong><span>{qar(workspace.statements.reconciliation.assetsMinor)}</span></div>
          <div><strong>Liabilities + equity + current result</strong><span>{qar(workspace.statements.reconciliation.equityIncludingCurrentResultMinor)}</span></div>
          <div><strong>Difference</strong><span>{qar(workspace.statements.reconciliation.differenceMinor)}</span></div>
          <b>{workspace.statements.reconciliation.balanced ? 'Balanced' : 'Approval blocked: mapping does not reconcile'}</b>
        </section>
        {!workspace.statements.reconciliation.balanced && workspace.statements.blockers.map(item => <p className="business-alert" role="alert" key={item.code}>{item.message}</p>)}
        {sourceFsliId && <section className="business-fieldwork-source" aria-label="FSLI source lines">
          <div className="business-section-heading"><h3>Source rows · {allLines.find(line => line.fsliId === sourceFsliId)?.code}</h3><button type="button" className="btn sm" onClick={() => setSourceFsliId('')}>Close</button></div>
          <p className="business-muted">All contributing trial-balance rows are shown with raw and presented values.</p>
          <div className="business-fieldwork-scroll"><table><thead><tr><th>Source row</th><th>Account</th><th>Raw CY</th><th>Presented CY</th><th>PY</th></tr></thead><tbody>
            {selectedSourceRows.slice(sourceRowsPage * 100, (sourceRowsPage + 1) * 100).map(row => <tr key={row.tbLineId}><td>{row.sourceRowNumber}</td><td>{row.accountCode} · {row.accountName}</td>
              <td>{qar(row.currentRawMinor)}</td><td>{qar(row.currentPresentedMinor)}</td><td>{qar(row.priorPresentedMinor)}</td></tr>)}
          </tbody></table></div>
          <PaginationControls page={sourceRowsPage} pageSize={100} total={selectedSourceRows.length} label="Source rows" onPage={setSourceRowsPage} />
        </section>}
        {showAnalysis && selectedLine && <section className="business-fieldwork-card" aria-labelledby="business-fieldwork-ar-heading">
          <div className="business-section-heading"><div><p className="business-eyebrow">ISA 520 · SOURCE-LINKED REVIEW</p><h3 id="business-fieldwork-ar-heading">Analytical review · {selectedLine.code} {selectedLine.name}</h3></div><button className="btn sm" type="button" onClick={() => setShowAnalysis(false)}>Close</button></div>
          <p className="business-note">CY {qar(selectedLine.currentAdjustedMinor)} · PY {qar(selectedLine.priorMinor)} · variance {formatRate(selectedLine.variancePercent, selectedLine.varianceReason)}. Explanation and conclusion remain explicit reviewer work.</p>
          <form className="business-form" onSubmit={saveAnalysis}>
            <div className="business-form-grid">
              <label className="business-field"><span>Expected result and financial basis</span><textarea required minLength={10} value={expectation} onChange={event => setExpectation(event.target.value)} /></label>
              <label className="business-field"><span>Investigation explanation</span><textarea required minLength={10} value={analysisExplanation} onChange={event => setAnalysisExplanation(event.target.value)} /></label>
              <label className="business-field"><span>Investigation threshold (%)</span><input type="number" min="0.01" max="100" step="0.01" value={thresholdPercent} onChange={event => setThresholdPercent(event.target.value)} /></label>
              <label className="business-field"><span>Investigation threshold (QAR, optional)</span><input inputMode="decimal" value={thresholdAmount} onChange={event => setThresholdAmount(event.target.value)} /></label>
              <label className="business-field"><span>Review conclusion</span><textarea required minLength={10} value={analysisConclusion} onChange={event => setAnalysisConclusion(event.target.value)} /></label>
            </div>
            <details className="business-fieldwork-details"><summary>Optional source-backed ratio</summary><div className="business-form-grid">
              <label className="business-field"><span>Ratio name</span><input value={ratioName} onChange={event => setRatioName(event.target.value)} /></label>
              <label className="business-field"><span>Numerator (QAR)</span><input inputMode="decimal" value={ratioNumerator} onChange={event => setRatioNumerator(event.target.value)} /></label>
              <label className="business-field"><span>Numerator source</span><input value={ratioNumeratorSource} onChange={event => setRatioNumeratorSource(event.target.value)} /></label>
              <label className="business-field"><span>Denominator (QAR)</span><input inputMode="decimal" value={ratioDenominator} onChange={event => setRatioDenominator(event.target.value)} /></label>
              <label className="business-field"><span>Denominator source</span><input value={ratioDenominatorSource} onChange={event => setRatioDenominatorSource(event.target.value)} /></label>
            </div>{ratioDenominator.trim() && Number(ratioDenominator) === 0 && <p className="business-note">This ratio will be stored as undefined because its denominator is zero.</p>}</details>
            <p className="business-note">A current snapshot is created before this review is saved. Link adequate evidence in the Evidence section before submission.</p>
            <button className="btn primary" type="submit" disabled={busy || !canWrite}>Save analytical review draft</button>
          </form>
          {selectedAnalyticalReviews.map(review => <div className="business-fieldwork-row" key={String(review.id)}><div><strong>{label(review.status)} · v{String(review.version)}</strong><span>{String(review.expectationText ?? '')}</span></div>
            {review.status === 'DRAFT' && <button className="btn sm" type="button" disabled={busy || !canWrite} onClick={() => void command('analytical-review.submit', { analyticalReviewId: String(review.id), expectedVersion: Number(review.version) }, 'Analytical review submitted for independent review.')}>Submit exact version</button>}</div>)}
        </section>}
        <section className="business-fieldwork-card" aria-labelledby="business-fieldwork-gc-heading">
          <div><p className="business-eyebrow">ISA 570 · ENGAGEMENT-WIDE ASSESSMENT</p><h3 id="business-fieldwork-gc-heading">Going concern</h3></div>
          {workspace.goingConcern && <p className="business-note">Current saved revision {workspace.goingConcern.revision} · {workspace.goingConcern.isa570Edition} · {label(workspace.goingConcern.status)}. Saving creates a new revision; prior assessment content is retained.</p>}
          <form className="business-form" onSubmit={saveGoingConcern}>
            <div className="business-form-grid">
              <label className="business-field"><span>Assessment start</span><input type="date" required value={goingStart} onChange={event => setGoingStart(event.target.value)} /></label>
              <label className="business-field"><span>Assessment horizon end</span><input type="date" required min={engagement.periodEnd} value={goingEnd} onChange={event => setGoingEnd(event.target.value)} /><small>Default includes twelve months after period end; the edition follows the engagement profile.</small></label>
              <label className="business-field"><span>Management assessment evidence</span><select value={goingManagementFile} onChange={event => setGoingManagementFile(event.target.value)}><option value="">Select retained file…</option>{sourceFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · v{file.version}</option>)}</select></label>
              <label className="business-field"><span>Conclusion</span><select value={goingConclusion} onChange={event => setGoingConclusion(event.target.value as typeof goingConclusion)}><option value="UNASSESSED">Unassessed</option><option value="NO_MATERIAL_UNCERTAINTY">No material uncertainty</option><option value="MATERIAL_UNCERTAINTY">Material uncertainty</option><option value="INAPPROPRIATE_BASIS">Inappropriate basis</option></select></label>
              <label className="business-field"><span>Adverse events and conditions</span><textarea value={goingEvents} onChange={event => setGoingEvents(event.target.value)} /></label>
              <label className="business-field"><span>Mitigating plans and evaluation</span><textarea value={goingPlans} onChange={event => setGoingPlans(event.target.value)} /></label>
              <label className="business-field"><span>Rationale</span><textarea required minLength={10} value={goingRationale} onChange={event => setGoingRationale(event.target.value)} /></label>
            </div>
            <fieldset className="business-fieldwork-checklist"><legend>Required assessment areas</legend>{Object.entries({managementAssessment:'Management assessment',cashFlowForecasts:'Cash-flow forecasts',financingAndCovenants:'Financing and covenants',adverseEvents:'Adverse events',mitigatingPlans:'Mitigating plans',uncertaintyEvaluation:'Uncertainty evaluation'}).map(([key,title]) =>
              <label key={key}><input type="checkbox" checked={goingChecklist[key as keyof typeof goingChecklist]} onChange={event => setGoingChecklist(current => ({ ...current, [key]: event.target.checked }))} />{title}</label>)}</fieldset>
            <label className="business-field"><span>Additional retained evidence files</span><select multiple value={goingEvidenceFiles} onChange={event => setGoingEvidenceFiles([...event.currentTarget.selectedOptions].map(option => option.value))}>{sourceFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · v{file.version}</option>)}</select></label>
            <button className="btn primary" type="submit" disabled={busy || !canWrite}>Save assessment revision</button>
          </form>
          {workspace.goingConcern && ['DRAFT','UNDER_REWORK'].includes(workspace.goingConcern.status) && <button className="btn primary" type="button" disabled={busy || !canWrite} onClick={() => void command('review.submit', { targetKind: 'GOING_CONCERN', targetId: workspace.goingConcern!.id, targetVersion: workspace.goingConcern!.version }, 'Going-concern assessment submitted as an immutable independent-review snapshot.')}>Submit going-concern assessment for review</button>}
        </section>
      </div>}

      {tab === 'workprograms' && <div className="business-fieldwork-body">
        <div className="business-fieldwork-card"><h3>Choose a statement line</h3><div className="business-fieldwork-picklist">{allLines.map(line => <button key={line.fsliId} type="button" aria-pressed={line.fsliId === selectedFsliId} className={line.fsliId === selectedFsliId ? 'selected' : ''}
          onClick={() => setSelectedFsliId(line.fsliId)}><strong>{line.code}</strong><span>{line.name}</span><small>{line.riskBand} risk</small></button>)}</div></div>
        {selectedLine && <>
          <div className="business-fieldwork-card"><div className="business-section-heading"><div><p className="business-eyebrow">APPROVED STANDARD PROCEDURES</p><h3>Templates · {selectedLine.code} {selectedLine.name}</h3></div></div>
            {workspace.templates.filter(item => item.fsliCode === selectedLine.code).map(template => <div className="business-fieldwork-row" key={template.id}><div><strong>{template.title} · rev {template.revision}</strong><span>{label(template.status)} · {template.id}</span></div>
              {template.status === 'DRAFT' && canPartner && <button type="button" className="btn sm" disabled={busy} onClick={() => void command('workprogram.template.approve', { templateId: template.id, expectedVersion: template.version }, 'Template approved as an immutable methodology revision.')}>Partner approve</button>}
              {template.status === 'APPROVED' && !selectedWorkprogram && <button type="button" className="btn sm" disabled={busy || !canWrite || !assignedStaffId} onClick={() => void provisionWorkprogram(template.id)}>Provision workprogram</button>}</div>)}
            {!workspace.templates.some(item => item.fsliCode === selectedLine.code) && <p className="business-muted">No versioned procedures are available for this FSLI yet.</p>}
            {canPartner && <form className="business-form business-fieldwork-subform" onSubmit={createTemplate}><h4>Create a new template revision</h4>
              <label className="business-field"><span>Template title</span><input required minLength={1} value={templateTitle} onChange={event => setTemplateTitle(event.target.value)} /></label>
              {templateSteps.map((step,index) => <div className="business-fieldwork-template-step" key={`${selectedLine.fsliId}-${index}`}><label className="business-field"><span>Step {index+1} title</span><input required value={step.title} onChange={event => setTemplateSteps(current => current.map((item,i) => i === index ? { ...item, title: event.target.value } : item))} /></label>
                <label className="business-field"><span>Assertion</span><select value={step.assertion} onChange={event => setTemplateSteps(current => current.map((item,i) => i === index ? { ...item, assertion: event.target.value as Assertion } : item))}>{assertions.map(value => <option key={value}>{value}</option>)}</select></label>
                <label className="business-field"><span>Instructions</span><textarea required value={step.instructions} onChange={event => setTemplateSteps(current => current.map((item,i) => i === index ? { ...item, instructions: event.target.value } : item))} /></label>
                <label className="business-check-field"><input type="checkbox" checked={step.mandatory} onChange={event => setTemplateSteps(current => current.map((item,i) => i === index ? { ...item, mandatory: event.target.checked } : item))} />Mandatory</label></div>)}
              <button className="btn primary" type="submit" disabled={busy || !canPartner}>Create Partner-reviewable template</button></form>}
            <label className="business-field"><span>Assigned executor</span><select value={assignedStaffId} onChange={event => setAssignedStaffId(event.target.value)}>{workspace.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.displayName} · {staff.grade}</option>)}</select><small>Red-risk work requires Manager-grade execution before acceptance.</small></label>
          </div>
          {selectedWorkprogram && <section className="business-fieldwork-card"><div className="business-section-heading"><div><p className="business-eyebrow">PLANNING VERSION {selectedWorkprogram.planningVersionId}</p><h3>{selectedLine.code} workprogram · {label(selectedWorkprogram.status)}</h3></div><span>{selectedWorkprogram.riskBand} risk</span></div>
            <p className="business-note">Assigned executor: {workspace.staff.find(staff => staff.id === selectedWorkprogram.assignedStaffId)?.displayName ?? selectedWorkprogram.assignedStaffId}. Assignment is frozen with this workprogram revision.</p>
            {['DRAFT','IN_PROGRESS','UNDER_REWORK'].includes(selectedWorkprogram.status) && !workspace.reviewNotes.some(note => note.status !== 'CLOSED' && (note.workprogramId === selectedWorkprogram.id || Boolean(note.procedureId && workspace.procedures.some(procedure => procedure.id === note.procedureId && procedure.workprogramId === selectedWorkprogram.id)))) && workspace.procedures.filter(item => item.workprogramId === selectedWorkprogram.id).length > 0 && workspace.procedures.filter(item => item.workprogramId === selectedWorkprogram.id).every(item => item.status === 'REVIEWED') &&
              <button className="btn primary" type="button" disabled={busy || !canWrite} onClick={() => void command('review.submit', { targetKind: 'WORKPROGRAM', targetId: selectedWorkprogram.id, targetVersion: selectedWorkprogram.version }, 'Current workprogram snapshot submitted for independent Manager review.')}>Submit workprogram for Manager review</button>}
            {workspace.procedures.filter(item => item.workprogramId === selectedWorkprogram.id).map(procedure => <article className="business-fieldwork-procedure" key={procedure.id}>
              <div className="business-section-heading"><div><strong>{procedure.ordinal}. {procedure.title}</strong><span>{procedure.assertion} · {procedure.origin} · {label(procedure.status)}</span></div><span>v{procedure.version}</span></div>
              <p>{procedure.instructions}</p>{procedure.scopeReason && <p className="business-muted">Scope: {procedure.scopeReason}</p>}
              <label className="business-field"><span>Work performed</span><textarea minLength={10} value={procedureDrafts[procedure.id]?.workPerformed ?? procedure.workPerformed ?? ''} onChange={event => setProcedureDrafts(current => ({ ...current, [procedure.id]: { workPerformed: event.target.value, conclusion: current[procedure.id]?.conclusion ?? procedure.conclusion ?? '' } }))} /></label>
              <label className="business-field"><span>Conclusion</span><textarea minLength={10} value={procedureDrafts[procedure.id]?.conclusion ?? procedure.conclusion ?? ''} onChange={event => setProcedureDrafts(current => ({ ...current, [procedure.id]: { workPerformed: current[procedure.id]?.workPerformed ?? procedure.workPerformed ?? '', conclusion: event.target.value } }))} /></label>
              {procedure.status === 'UNDER_REWORK' && <label className="business-field"><span>How this revision addresses the review note</span><textarea required minLength={10} value={procedureReworkReasons[procedure.id] ?? ''} onChange={event => setProcedureReworkReasons(current => ({ ...current, [procedure.id]: event.target.value }))} /></label>}
              {procedure.status === 'NOT_STARTED' || procedure.status === 'IN_PROGRESS' || procedure.status === 'UNDER_REWORK' ? <>
                <button className="btn sm" type="button" disabled={busy || !canWrite || !(procedureDrafts[procedure.id]?.workPerformed ?? procedure.workPerformed) || !(procedureDrafts[procedure.id]?.conclusion ?? procedure.conclusion) || (procedure.status === 'UNDER_REWORK' && (procedureReworkReasons[procedure.id] ?? '').trim().length < 10)} onClick={() => void command('procedure.update', { procedureId: procedure.id, expectedVersion: procedure.version,
                  workPerformed: procedureDrafts[procedure.id]?.workPerformed ?? procedure.workPerformed, conclusion: procedureDrafts[procedure.id]?.conclusion ?? procedure.conclusion,
                  ...(procedure.status === 'UNDER_REWORK' ? { reworkReason: procedureReworkReasons[procedure.id] } : {}) }, 'Procedure work and conclusion saved as a new revision.')}>Save work</button>
                <button className="btn sm" type="button" disabled={busy || !canWrite} onClick={() => void command('procedure.submit', { procedureId: procedure.id, expectedVersion: procedure.version }, 'Exact procedure revision submitted for independent review.')}>Submit</button>
                <label className="business-field"><span>Reason this step is not applicable</span><textarea minLength={10} value={procedureNaReasons[procedure.id] ?? ''} onChange={event => setProcedureNaReasons(current => ({ ...current, [procedure.id]: event.target.value }))} /></label>
                <button className="btn sm" type="button" disabled={busy || !canWrite || (procedureNaReasons[procedure.id] ?? '').trim().length < 10} onClick={() => void command('procedure.mark-not-applicable', { procedureId: procedure.id, expectedVersion: procedure.version, reason: procedureNaReasons[procedure.id] }, 'Not-applicable decision submitted for independent approval.')}>Propose N/A</button>
              </> : null}
              {procedure.status === 'SUBMITTED' && canReview && <div className="business-fieldwork-review">
                <label className="business-field"><span>Independent review rationale</span><textarea minLength={10} value={procedureReviewDrafts[procedure.id] ?? ''} onChange={event => setProcedureReviewDrafts(current => ({ ...current, [procedure.id]: event.target.value }))} /></label>
                <div className="business-fieldwork-action-row"><button className="btn sm" type="button" disabled={busy || (procedureReviewDrafts[procedure.id] ?? '').trim().length < 10} onClick={() => void reviewProcedure(procedure,'ACCEPT')}>Accept</button>
                  <button className="btn sm" type="button" disabled={busy || (procedureReviewDrafts[procedure.id] ?? '').trim().length < 10} onClick={() => void reviewProcedure(procedure,'REWORK')}>Return for rework</button>
                  {procedure.applicable === 0 && <button className="btn sm" type="button" disabled={busy || (procedureReviewDrafts[procedure.id] ?? '').trim().length < 10} onClick={() => void reviewProcedure(procedure,'NOT_APPLICABLE_APPROVED')}>Approve N/A</button>}</div>
              </div>}
              <small>Evidence pins: {workspace.evidenceLinks.filter(link => link.targetType === 'PROCEDURE' && link.targetId === procedure.id && !link.unlinkReason).length} · {procedure.evidenceSetHash.slice(0, 12)}</small>
            </article>)}
            {workspace.reviewSubmissions.filter(item => item.targetKind === 'WORKPROGRAM' && item.workprogramId === selectedWorkprogram.id).map(submission => <div className="business-fieldwork-review" key={submission.id}>
              <p className="business-note">Manager submission v{submission.targetVersion} · {submission.decision ? `${label(submission.decision)}${submission.decidedAt ? ` · ${new Date(submission.decidedAt).toLocaleString()}` : ''}` : 'Awaiting independent decision'} · dependency {submission.dependencyHash.slice(0, 12)}</p>
              {submission.decisionComment && <p className="business-note">Review rationale: {submission.decisionComment}</p>}
              {!submission.decision && canReview && <>
                <label className="business-field"><span>Manager review rationale (required for either decision)</span><textarea minLength={10} value={workprogramReviewDrafts[submission.id] ?? ''} onChange={event => setWorkprogramReviewDrafts(current => ({ ...current, [submission.id]: event.target.value }))} /></label>
                <div className="business-fieldwork-action-row">
                  <button className="btn sm" type="button" disabled={busy || (workprogramReviewDrafts[submission.id] ?? '').trim().length < 10} onClick={() => void command('review.decide', { submissionId: submission.id, decision: 'ACCEPT', comment: workprogramReviewDrafts[submission.id] }, 'Workprogram accepted by an independent Manager.')}>Accept workprogram</button>
                  <button className="btn sm" type="button" disabled={busy || (workprogramReviewDrafts[submission.id] ?? '').trim().length < 10} onClick={() => void command('review.decide', { submissionId: submission.id, decision: 'RETURN', comment: workprogramReviewDrafts[submission.id], assignedPreparerId: selectedWorkprogram.assignedStaffId,
                    procedureIds: workspace.procedures.filter(item => item.workprogramId === selectedWorkprogram.id && item.mandatory).map(item => item.id) }, 'Workprogram returned with assigned, step-specific rework notes.')}>Return for rework</button>
                </div>
              </>}
              {submission.decision === 'ACCEPT' && canPartner && <>
                <label className="business-field"><span>Partner area-clearance rationale</span><textarea minLength={10} value={partnerClearanceRationales[selectedWorkprogram.id] ?? ''} onChange={event => setPartnerClearanceRationales(current => ({ ...current, [selectedWorkprogram.id]: event.target.value }))} /></label>
                <button className="btn sm" type="button" disabled={busy || (partnerClearanceRationales[selectedWorkprogram.id] ?? '').trim().length < 10} onClick={() => void command('partner.clear-area', { workprogramId: selectedWorkprogram.id, submissionId: submission.id, dependencyHash: submission.dependencyHash, rationale: partnerClearanceRationales[selectedWorkprogram.id] }, 'Partner area clearance signed against the accepted current dependency snapshot.')}>Partner clear area</button>
              </>}
            </div>)}
            {workspace.reviewNotes.filter(note => note.workprogramId === selectedWorkprogram.id || (note.procedureId && workspace.procedures.some(procedure => procedure.id === note.procedureId && procedure.workprogramId === selectedWorkprogram.id))).map(note => {
              const assigned = workspace.staff.find(staff => staff.id === note.assignedPreparerId);
              const laterAccepted = workspace.reviewSubmissions.filter(item => item.decision === 'ACCEPT' && item.submittedAt > (note.responseAt ?? note.createdAt) && (note.procedureId
                ? item.targetKind === 'PROCEDURE' && item.procedureId === note.procedureId
              : note.targetKind === 'GOING_CONCERN' ? item.targetKind === 'GOING_CONCERN' && (item.subjectRevision ?? 0) > (note.targetRevision ?? 0)
                : item.targetKind === note.targetKind && item.workprogramId === note.workprogramId))
                .sort((left,right) => right.targetVersion-left.targetVersion)[0];
              return <article className="business-fieldwork-review" key={note.id}>
                <strong>Review note · {label(note.status)}{note.procedureId ? ` · ${workspace.procedures.find(item => item.id === note.procedureId)?.title ?? note.procedureId}` : ''}</strong>
                <p>{note.text}</p><small>Assigned preparer: {assigned?.displayName ?? note.assignedPreparerId}</small>
                {note.responseText && <p className="business-note">Preparer response: {note.responseText}</p>}
                {note.status === 'OPEN' && context.actor.staffMemberId === note.assignedPreparerId && <>
                  <label className="business-field"><span>Response to the review note</span><textarea minLength={10} value={reviewNoteResponses[note.id] ?? ''} onChange={event => setReviewNoteResponses(current => ({ ...current, [note.id]: event.target.value }))} /></label>
                  <button className="btn sm" type="button" disabled={busy || (reviewNoteResponses[note.id] ?? '').trim().length < 10} onClick={() => void command('review.respond', { noteId: note.id, responseText: reviewNoteResponses[note.id] }, 'Assigned preparer response recorded in the review history.')}>Record response</button>
                </>}
                {note.status === 'RESPONDED' && canReview && <>
                  {laterAccepted ? <>
                    <p className="business-note">Accepted resubmission v{laterAccepted.targetVersion} is available for closure.</p>
                    <label className="business-field"><span>Reviewer closure rationale</span><textarea minLength={10} value={reviewNoteClosures[note.id] ?? ''} onChange={event => setReviewNoteClosures(current => ({ ...current, [note.id]: event.target.value }))} /></label>
                    <button className="btn sm" type="button" disabled={busy || (reviewNoteClosures[note.id] ?? '').trim().length < 10} onClick={() => void command('review.close-note', { noteId: note.id, resubmissionId: laterAccepted.id, closureReason: reviewNoteClosures[note.id] }, 'Review note closed after independent acceptance of the later revision.')}>Close resolved note</button>
                  </> : <p className="business-note">The note remains open until the later revision is independently accepted.</p>}
                </>}
              </article>;
            })}
            {canWrite && <form className="business-form business-fieldwork-subform" onSubmit={event => void insertProcedure(event,selectedWorkprogram.id)}><h4>Add a reasoned ad-hoc step</h4>
              <label className="business-field"><span>Title</span><input required value={adhocDrafts[selectedWorkprogram.id]?.title ?? ''} onChange={event => setAdhocDrafts(current => ({ ...current, [selectedWorkprogram.id]: { title: event.target.value, instructions: current[selectedWorkprogram.id]?.instructions ?? '', assertion: current[selectedWorkprogram.id]?.assertion ?? 'VALUATION', scopeReason: current[selectedWorkprogram.id]?.scopeReason ?? '' } }))} /></label>
              <label className="business-field"><span>Instructions</span><textarea required minLength={1} value={adhocDrafts[selectedWorkprogram.id]?.instructions ?? ''} onChange={event => setAdhocDrafts(current => ({ ...current, [selectedWorkprogram.id]: { title: current[selectedWorkprogram.id]?.title ?? '', instructions: event.target.value, assertion: current[selectedWorkprogram.id]?.assertion ?? 'VALUATION', scopeReason: current[selectedWorkprogram.id]?.scopeReason ?? '' } }))} /></label>
              <label className="business-field"><span>Assertion</span><select value={adhocDrafts[selectedWorkprogram.id]?.assertion ?? 'VALUATION'} onChange={event => setAdhocDrafts(current => ({ ...current, [selectedWorkprogram.id]: { title: current[selectedWorkprogram.id]?.title ?? '', instructions: current[selectedWorkprogram.id]?.instructions ?? '', assertion: event.target.value as Assertion, scopeReason: current[selectedWorkprogram.id]?.scopeReason ?? '' } }))}>{assertions.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="business-field"><span>Scope rationale</span><textarea required minLength={10} value={adhocDrafts[selectedWorkprogram.id]?.scopeReason ?? ''} onChange={event => setAdhocDrafts(current => ({ ...current, [selectedWorkprogram.id]: { title: current[selectedWorkprogram.id]?.title ?? '', instructions: current[selectedWorkprogram.id]?.instructions ?? '', assertion: current[selectedWorkprogram.id]?.assertion ?? 'VALUATION', scopeReason: event.target.value } }))} /></label>
              <button className="btn" type="submit" disabled={busy}>Add procedure</button></form>}
          </section>}
        </>}
      </div>}

      {tab === 'sampling' && <div className="business-fieldwork-body">
        {canReview && <form className="business-fieldwork-card business-form" onSubmit={event => { event.preventDefault(); void command('sampling.policy.create', { name: `${method.replaceAll('_',' ')} · firm policy`, method,
          assumptions: 'Document the population assumptions, method limitations, exception handling and reviewer assessment required before client use.' }, 'Draft sampling methodology created. Partner approval is required.'); }}>
          <h3>Firm sampling methodology</h3><div className="business-form-grid"><label className="business-field"><span>Method</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="MUS_BINOMIAL_PPS">Monetary-unit sampling</option><option value="SYSTEMATIC">Systematic random</option><option value="STRATIFIED_ATTRIBUTE">Stratified attribute</option></select></label>
          <p className="business-note">Sampling cannot run until a Partner approves a versioned methodology. Statistical selections use a server seed; systematic sample size remains explicitly non-statistical.</p></div>
          <button className="btn" type="submit" disabled={busy || !canReview}>Create draft policy</button>
        </form>}
        {workspace.samplingPolicies.map(policy => <div className="business-fieldwork-row" key={policy.id}><div><strong>{policy.name}</strong><span>{label(policy.method)} · {policy.algorithmVersion} · {label(policy.status)} · v{policy.version}</span></div>
          {policy.status === 'DRAFT' && canPartner && <div className="business-fieldwork-review"><label className="business-field"><span>Partner methodology approval rationale</span><textarea minLength={10} value={policyApprovalRationales[policy.id] ?? ''} onChange={event => setPolicyApprovalRationales(current => ({ ...current, [policy.id]: event.target.value }))} /></label><button type="button" className="btn sm" disabled={busy || (policyApprovalRationales[policy.id] ?? '').trim().length < 10} onClick={() => void command('sampling.policy.approve', { policyId: policy.id, expectedVersion: policy.version, rationale: policyApprovalRationales[policy.id] }, 'Sampling methodology approved by Partner.')}>Partner approve</button></div>}</div>)}
        <form className="business-fieldwork-card business-form" onSubmit={createPopulation}><h3>Import a version-pinned sampling population</h3>
          <div className="business-form-grid"><label className="business-field"><span>Population name</span><input required value={populationName} onChange={event => setPopulationName(event.target.value)} /></label>
            <label className="business-field"><span>Committed source file</span><select required value={populationFileId} onChange={event => setPopulationFileId(event.target.value)}><option value="">Choose verified CSV/XLSX evidence…</option>{sourceFiles.filter(file => file.mediaType === 'text/csv' || file.mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.purpose} · v{file.version}</option>)}</select></label>
            <label className="business-field"><span>FSLI</span><select value={populationFsliId} onChange={event => setPopulationFsliId(event.target.value)}>{allLines.map(line => <option key={line.fsliId} value={line.fsliId}>{line.code} · {line.name}</option>)}</select></label>
            <label className="business-field"><span>Worksheet (optional)</span><input value={worksheet} onChange={event => setWorksheet(event.target.value)} /></label>
            <label className="business-field"><span>Header row (1-based)</span><input type="number" min="1" value={headerRow} onChange={event => setHeaderRow(event.target.value)} /></label>
            <label className="business-field"><span>Reference column (zero-based)</span><input type="number" min="0" max="255" value={referenceColumn} onChange={event => setReferenceColumn(event.target.value)} /></label>
            <label className="business-field"><span>Amount column (zero-based)</span><input type="number" min="0" max="255" value={amountColumn} onChange={event => setAmountColumn(event.target.value)} /></label>
            <label className="business-field"><span>Description column (zero-based)</span><input type="number" min="0" max="255" value={descriptionColumn} onChange={event => setDescriptionColumn(event.target.value)} /></label>
          </div><label className="business-field"><span>Zero and negative item alternate-procedure rationale</span><textarea required minLength={10} value={exclusionsReason} onChange={event => setExclusionsReason(event.target.value)} /></label>
          <p className="business-note">Rows are parsed from verified committed bytes. Duplicate references, inexact QAR amounts, missing IDs and stale TB pins block the import.</p>
          <button className="btn primary" type="submit" disabled={busy || !canReview || !populationFileId}>Import population</button>
        </form>
        {workspace.populations.map(item => <div className="business-fieldwork-row" key={item.id}><div><strong>{item.name}</strong><span>{item.rowCount} rows · {qar(item.positiveTotalMinor)} positive · {item.excludedCount} excluded · source {item.sourceHash.slice(0,12)}</span></div>
          <button type="button" className="btn sm" aria-pressed={selectedPopulationId === item.id} onClick={() => { setSelectedPopulationId(item.id); setTab('sampling'); }}>Assign and select</button></div>)}
        {population && <section className="business-fieldwork-card"><div className="business-section-heading"><div><h3>{population.population.name} · {population.population.rowCount} source rows</h3><p className="business-muted">Eligible items must belong to exactly one attribute stratum. Assignments are retained in the plan input hash.</p></div>
            <label className="business-field"><span>Sampling method</span><select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="MUS_BINOMIAL_PPS">MUS · binomial bound</option><option value="SYSTEMATIC">Systematic · reviewer-sized</option><option value="STRATIFIED_ATTRIBUTE">Stratified attribute</option></select></label></div>
          {method === 'MUS_BINOMIAL_PPS' && <div className="business-form-grid"><label className="business-field"><span>Confidence (%)</span><input type="number" min="50" max="99.99" step="0.01" value={confidencePercent} onChange={event => setConfidencePercent(event.target.value)} /></label>
            <label className="business-field"><span>Tolerable misstatement (QAR)</span><input required inputMode="decimal" value={tolerableAmount} onChange={event => setTolerableAmount(event.target.value)} /></label>
            <label className="business-field"><span>Expected tainted book-value (%)</span><input type="number" min="0" max="99.99" step="0.01" value={expectedTaintedPercent} onChange={event => setExpectedTaintedPercent(event.target.value)} /></label></div>}
          {method === 'SYSTEMATIC' && <div className="business-form-grid"><label className="business-field"><span>Reviewer-selected count</span><input type="number" min="1" max={population.rows.filter(row => row.eligible === 1).length} value={requestedCount} onChange={event => setRequestedCount(event.target.value)} /></label>
            <label className="business-field"><span>Frozen source ordering</span><select value={systematicOrdering} onChange={event => setSystematicOrdering(event.target.value as typeof systematicOrdering)}><option value="SOURCE_ROW_ASC">Source row ascending</option><option value="REFERENCE_ASC">Reference ascending</option><option value="SERVER_SEEDED_SHUFFLE">Server-seeded unbiased shuffle</option></select><small>Ordering and the rational start offset are pinned in the plan.</small></label>
            <label className="business-field"><span>Sample-size rationale</span><textarea required minLength={10} value={sampleRationale} onChange={event => setSampleRationale(event.target.value)} /></label></div>}
          {method === 'STRATIFIED_ATTRIBUTE' && <><div className="business-form-grid"><label className="business-field"><span>Joint confidence (%)</span><input type="number" min="50" max="99.99" step="0.01" value={confidencePercent} onChange={event => setConfidencePercent(event.target.value)} /></label>
            <label className="business-field"><span>Expected deviation (%)</span><input type="number" min="0" max="99.99" step="0.01" value={attributeExpected} onChange={event => setAttributeExpected(event.target.value)} /></label>
            <label className="business-field"><span>Tolerable deviation (%)</span><input type="number" min="0.01" max="99.99" step="0.01" value={attributeTolerable} onChange={event => setAttributeTolerable(event.target.value)} /></label>
            <label className="business-field"><span>Stratum rationale</span><textarea required minLength={10} value={attributeRationale} onChange={event => setAttributeRationale(event.target.value)} /></label></div>
            <div className="business-fieldwork-scroll"><table><thead><tr><th>Row</th><th>Reference</th><th>Book value</th><th>Eligible</th><th>Stratum key</th></tr></thead><tbody>{eligiblePopulationRows.slice(attributePage * 100, (attributePage + 1) * 100).map(row => <tr key={row.id}><td>{row.ordinal}</td><td>{row.sourceRowKey}</td><td>{qar(row.bookValueMinor)}</td><td>Yes</td><td><input aria-label={`Stratum for ${row.sourceRowKey}`} value={stratumByRow[row.id] ?? 'A'} onChange={event => setStratumByRow(current => ({ ...current, [row.id]: event.target.value }))} /></td></tr>)}</tbody></table></div>
            <PaginationControls page={attributePage} pageSize={100} total={eligiblePopulationRows.length} label="Eligible population rows" onPage={setAttributePage} />
            <p className="business-note">Each eligible source row must be assigned exactly once. Confidence is split by the approved Bonferroni method; no averaging can make an incomplete stratum pass.</p></>}
          <label className="business-field"><span>Reviewer sampling rationale</span><textarea required minLength={10} value={sampleRationale} onChange={event => setSampleRationale(event.target.value)} /></label>
          <button className="btn primary" type="button" disabled={busy || !canReview || !workspace.samplingPolicies.some(item => item.method === method && item.status === 'APPROVED')} onClick={() => void createSamplingPlan()}>Create sample plan</button>
        </section>}
        {workspace.samplingPlans.map(plan => <div className="business-fieldwork-row" key={plan.id}><div><strong>{label(plan.method)} · {plan.calculatedCount} draws</strong><span>{plan.populationId} · revision {plan.revision} · {plan.latestResult ? label(plan.latestResult) : 'Not evaluated'} · {plan.inputHash.slice(0,12)}</span></div>
          <button type="button" className="btn sm" aria-pressed={selectedPlanId === plan.id} onClick={() => { setHitPage(0); setSamplePage(0); setSelectedPlanId(plan.id); }}>Open exact plan</button></div>)}
        {planDetail && <section className="business-fieldwork-card"><div className="business-section-heading"><div><h3>{label(planDetail.plan.method)} · revision {planDetail.plan.revision}</h3><p className="business-muted">{planDetail.plan.calculatedCount} selected draws · {planDetail.hits.length} draw rows · {planDetail.plan.latestResult ? label(planDetail.plan.latestResult) : 'Not evaluated'}</p></div>
          <button type="button" className="btn sm" disabled={busy || !canReview} onClick={() => void command('sampling.evaluate', { planId: planDetail.plan.id, testSetHash: planDetail.testSetHash }, 'Exact version-pinned sample evaluation completed.')}>Evaluate current tests</button></div>
          <p className="business-note">Input hash {planDetail.plan.inputHash} · policy version {planDetail.plan.policyVersion ?? '—'} · seed {planDetail.plan.seedHex ?? 'server-held'} · selected rows and draw numbers are immutable.</p>
          {planDetail.evaluations.map((evaluation,index) => <p className="business-fieldwork-result" key={String(evaluation.id ?? index)}><strong>{label(evaluation.result)}</strong> · {String(evaluation.reviewedAt ?? '')} · {String(evaluation.upperBoundMinor ? qar(String(evaluation.upperBoundMinor)) : 'No monetary upper bound')}</p>)}
          <div className="business-fieldwork-scroll"><table><thead><tr><th>Draw</th><th>Reference</th><th>Book value</th><th>Monetary unit</th><th>Stratum</th></tr></thead><tbody>{planDetail.hits.slice(hitPage * 100, (hitPage + 1) * 100).map(hit => <tr key={`${hit.drawNumber}-${hit.populationRowId}`}><td>{hit.drawNumber}</td><td>{hit.sourceRowKey}</td><td>{qar(planDetail.rows.find(row => row.id === hit.populationRowId)?.bookValueMinor)}</td><td>{hit.monetaryUnitMinor ? qar(hit.monetaryUnitMinor) : '—'}</td><td>{hit.stratumKey ?? '—'}</td></tr>)}</tbody></table></div>
          <PaginationControls page={hitPage} pageSize={100} total={planDetail.hits.length} label="Sample draws" onPage={setHitPage} />
          <h4>Record tests against selected population items</h4>{distinctSampleRows.slice(samplePage * 50, (samplePage + 1) * 50).map(rowId => {
            const hit = planDetail.hits.find(item => item.populationRowId === rowId)!; const existing = planDetail.tests.find(test => test.populationRowId === rowId);
            const draft = sampleDrafts[rowId] ?? { auditedValue: existing?.auditedValueMinor == null ? '' : (Number(existing.auditedValueMinor) / 100).toFixed(2), misstated: Boolean(existing?.misstated), deviation: Boolean(existing?.deviation), conclusion: existing?.conclusion ?? '', evidenceId: existing?.evidenceId ?? '' };
            return <form className="business-fieldwork-sample-test" key={rowId} onSubmit={event => void recordSampleTest(event,rowId)}><div><strong>{hit.sourceRowKey}</strong><span>Selected {planDetail.hits.filter(item => item.populationRowId === rowId).length} draw(s) · test v{existing?.version ?? 0}</span></div>
              <div className="business-form-grid">{planDetail.plan.method === 'MUS_BINOMIAL_PPS' && <><label className="business-field"><span>Audited amount (QAR)</span><input inputMode="decimal" value={draft.auditedValue} onChange={event => setSampleDrafts(current => ({ ...current, [rowId]: { ...draft, auditedValue: event.target.value } }))} /></label>
                <label className="business-check-field"><input type="checkbox" checked={draft.misstated} onChange={event => setSampleDrafts(current => ({ ...current, [rowId]: { ...draft, misstated: event.target.checked } }))} />Misstatement identified</label></>}
                {planDetail.plan.method === 'STRATIFIED_ATTRIBUTE' && <label className="business-check-field"><input type="checkbox" checked={draft.deviation} onChange={event => setSampleDrafts(current => ({ ...current, [rowId]: { ...draft, deviation: event.target.checked } }))} />Control deviation</label>}
                <label className="business-field"><span>Conclusion</span><textarea required minLength={10} value={draft.conclusion} onChange={event => setSampleDrafts(current => ({ ...current, [rowId]: { ...draft, conclusion: event.target.value } }))} /></label>
                <label className="business-field"><span>Adequate evidence item</span><select required value={draft.evidenceId} onChange={event => setSampleDrafts(current => ({ ...current, [rowId]: { ...draft, evidenceId: event.target.value } }))}><option value="">Choose reviewed evidence…</option>{editableEvidence.filter(item => item.adequacy === 'ADEQUATE').map(item => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label></div>
              <button className="btn sm" type="submit" disabled={busy || !canWrite}>Save test</button></form>;
          })}
          <PaginationControls page={samplePage} pageSize={50} total={distinctSampleRows.length} label="Sample test items" onPage={setSamplePage} />
        </section>}
      </div>}

      {tab === 'evidence' && <div className="business-fieldwork-body">
        <form className="business-fieldwork-card business-form" onSubmit={createEvidence}><h3>Retain digital, physical or hybrid evidence</h3>
          <div className="business-form-grid"><label className="business-field"><span>Evidence mode</span><select value={evidenceMode} onChange={event => setEvidenceMode(event.target.value as typeof evidenceMode)}><option value="DIGITAL">Digital</option><option value="PHYSICAL">Physical</option><option value="HYBRID">Hybrid</option></select></label>
            <label className="business-field"><span>Evidence title</span><input required value={evidenceTitle} onChange={event => setEvidenceTitle(event.target.value)} /></label>
            {evidenceMode !== 'PHYSICAL' && <label className="business-field"><span>Committed retained file</span><select required value={evidenceFileId} onChange={event => setEvidenceFileId(event.target.value)}><option value="">Choose verified evidence…</option>{sourceFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.purpose} · v{file.version}</option>)}</select></label>}
            {evidenceMode !== 'DIGITAL' && <><label className="business-field"><span>Physical index code</span><input required value={physicalIndex} onChange={event => setPhysicalIndex(event.target.value)} /></label>
              <label className="business-field"><span>Physical description</span><input required minLength={5} value={physicalDescription} onChange={event => setPhysicalDescription(event.target.value)} /></label>
              <label className="business-field"><span>Binder</span><input value={binder} onChange={event => setBinder(event.target.value)} /></label><label className="business-field"><span>Box</span><input value={box} onChange={event => setBox(event.target.value)} /></label><label className="business-field"><span>Shelf</span><input value={shelf} onChange={event => setShelf(event.target.value)} /></label></>}
            <label className="business-field"><span>External source URL (optional)</span><input type="url" value={externalUrl} onChange={event => setExternalUrl(event.target.value)} /></label>
            {externalUrl && <label className="business-field"><span>Retrieved at</span><input type="datetime-local" required value={retrievedAt} onChange={event => setRetrievedAt(event.target.value)} /></label>}
          </div><p className="business-note">An external URL is provenance only; it does not substitute for retained verified bytes. Physical-only items receive no fabricated digital hash. New evidence starts PENDING_VERIFICATION.</p>
          <button className="btn primary" type="submit" disabled={busy || !canWrite}>Create evidence record</button>
        </form>
        {editableEvidence.map(item => <article className="business-fieldwork-row" key={item.id}><div><strong>{item.title} · {item.mode} · v{item.version}</strong>
          <span>{item.adequacy ?? 'PENDING VERIFICATION'} · {item.fileSha256 ? `SHA-256 ${item.fileSha256}` : 'No digital hash'} · {item.physicalIndex ?? 'No physical index'} {item.box ? `· Box ${item.box}` : ''} {item.shelf ? `· Shelf ${item.shelf}` : ''}</span>
          {item.adequacyRationale && <small>Reviewer: {item.adequacyRationale}</small>}</div></article>)}
        {canReview && editableEvidence.length > 0 && <form className="business-fieldwork-card business-form" onSubmit={event => { event.preventDefault(); void command('evidence.review', { evidenceId: reviewEvidenceId, evidenceVersion: Number(reviewEvidenceVersion), status: evidenceDecision, rationale: evidenceRationale }, `Evidence ${label(evidenceDecision).toLowerCase()} decision saved.`); }}>
          <h3>Independent evidence adequacy review</h3><div className="business-form-grid"><label className="business-field"><span>Exact evidence version</span><select value={`${reviewEvidenceId}:${reviewEvidenceVersion}`} onChange={event => { const [id,version] = event.target.value.split(':'); setReviewEvidenceId(id); setReviewEvidenceVersion(version); }}>
            {editableEvidence.map(item => <option key={item.id} value={`${item.id}:${item.version}`}>{item.title} · v{item.version}</option>)}</select></label>
            <label className="business-field"><span>Decision</span><select value={evidenceDecision} onChange={event => setEvidenceDecision(event.target.value as typeof evidenceDecision)}><option value="ADEQUATE">Adequate</option><option value="DEFICIENT">Deficient</option></select></label>
            <label className="business-field"><span>Reviewer rationale</span><textarea required minLength={10} value={evidenceRationale} onChange={event => setEvidenceRationale(event.target.value)} /></label></div>
          <button className="btn" type="submit" disabled={busy || !context.allowedActions.includes('evidence.review')}>Save evidence review</button>
        </form>}
        <form className="business-fieldwork-card business-form" onSubmit={linkEvidence}><h3>Link evidence to an exact row revision</h3><div className="business-form-grid">
          <label className="business-field"><span>Current evidence version</span><select required value={linkEvidenceId} onChange={event => setLinkEvidenceId(event.target.value)}><option value="">Choose evidence…</option>{editableEvidence.map(item => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>
          <label className="business-field"><span>Audit target type</span><select value={linkTargetType} onChange={event => { setLinkTargetType(event.target.value as typeof linkTargetType); setLinkTargetId(''); setLinkTargetVersion(''); }}><option value="PROCEDURE">Procedure</option><option value="ANALYTICAL_REVIEW">Analytical review</option><option value="SAMPLE_TEST">Sample test</option></select></label>
          <label className="business-field"><span>Target revision</span><select value={linkTargetId} onChange={event => { setLinkTargetId(event.target.value); const target = linkTargetType === 'PROCEDURE' ? workspace.procedures.find(row => row.id === event.target.value)
            : linkTargetType === 'ANALYTICAL_REVIEW' ? workspace.analyticalReviews.find(row => String(row.id) === event.target.value) : planDetail?.tests.find(row => row.id === event.target.value); setLinkTargetVersion(String(target && 'version' in target ? target.version : '')); }}>
            <option value="">Choose a target…</option>{linkTargetType === 'PROCEDURE' ? workspace.procedures.filter(row => ['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(row.status)).map(row => <option key={row.id} value={row.id}>{row.title} · v{row.version}</option>)
              : linkTargetType === 'ANALYTICAL_REVIEW' ? workspace.analyticalReviews.filter(row => ['DRAFT','UNDER_REWORK'].includes(String(row.status))).map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.fsliCode ?? row.id)} · v{String(row.version)}</option>)
                : (planDetail?.tests ?? []).filter(row => row.tested === 1).map(row => <option key={row.id} value={row.id}>{row.populationRowId} · v{row.version}</option>)}</select></label>
          <label className="business-field"><span>Expected target version</span><input type="number" min="1" required value={linkTargetVersion} onChange={event => setLinkTargetVersion(event.target.value)} /></label></div>
          <button className="btn" type="submit" disabled={busy || !canWrite}>Link exact evidence version</button>
        </form>
        {workspace.evidenceLinks.filter(link => !link.unlinkReason).map(link => <div className="business-fieldwork-row" key={link.id}><div><strong>{link.targetType} · {link.targetId} · target v{link.targetVersion}</strong><span>Evidence {link.evidenceId} · v{link.evidenceVersion} · linked {link.linkedAt}</span></div>
          {unlinkId === link.id ? <form className="business-fieldwork-review" onSubmit={async event => { event.preventDefault(); const result = await command('evidence.unlink', { evidenceLinkId: link.id, reason: unlinkReason }, 'An append-only unlink event was recorded; the prior reference remains in the audit history.'); if (result) { setUnlinkId(''); setUnlinkReason(''); } }}>
            <label className="business-field"><span>Reason for unlinking this evidence reference</span><textarea required minLength={10} value={unlinkReason} onChange={event => setUnlinkReason(event.target.value)} /></label>
            <button type="submit" className="btn sm" disabled={busy || !canWrite || unlinkReason.trim().length < 10}>Record unlink</button><button type="button" className="btn sm" onClick={() => { setUnlinkId(''); setUnlinkReason(''); }}>Cancel</button>
          </form> : <button type="button" className="btn sm" disabled={busy || !canWrite} onClick={() => { setUnlinkId(link.id); setUnlinkReason(''); }}>Unlink with reason</button>}</div>)}
        <div className="business-fieldwork-card"><div className="business-section-heading"><div><h3>Change feed</h3><p className="business-muted">Cursor {changeCursor} · refresh reloads current versioned rows and audit links.</p></div>
          <button className="btn sm" type="button" disabled={busy} onClick={async () => { try { const result = await getBusinessFieldworkChanges<{changes:unknown[];nextCursor:string;hasMore:boolean}>(workspaceId, engagement.id, scope, changeCursor); setChangeCursor(Number(result.nextCursor)); setMessage(`${result.changes.length} changes loaded${result.hasMore ? '; more are available' : ''}.`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Fieldwork changes could not be loaded.'); } }}>Read next events</button></div>
        </div>
      </div>}
      {tab === 'reviews' && <div className="business-fieldwork-body">
        {(workspace.engagement.state === 'FIELDWORK_EXECUTION' && context.actor.staffGrade === 'MANAGER' || workspace.engagement.state === 'MANAGERIAL_REVIEW' && canPartner) && <section className="business-fieldwork-card">
          <p className="business-eyebrow">LIFECYCLE GATE</p><h3>{workspace.engagement.state === 'FIELDWORK_EXECUTION' ? 'Hand over for Manager review' : 'Hand over for Partner approval'}</h3>
          <p className="business-note">The server rechecks every current submission, decision, source pin and open rework note inside the handover command.</p>
          <label className="business-field"><span>Handover rationale</span><textarea minLength={10} value={handoverReason} onChange={event => setHandoverReason(event.target.value)} /></label>
          {workspace.engagement.state === 'FIELDWORK_EXECUTION' ? <button className="btn primary" type="button" disabled={busy || !canReview || handoverReason.trim().length < 10} onClick={() => void command('fieldwork.handover-manager', { engagementId: engagement.id, expectedVersion: workspace.engagement.version, reason: handoverReason }, 'Current fieldwork handed over to Manager review.')}>Start Manager review</button>
            : <button className="btn primary" type="button" disabled={busy || handoverReason.trim().length < 10} onClick={() => void command('fieldwork.handover-partner', { engagementId: engagement.id, expectedVersion: workspace.engagement.version, reason: handoverReason }, 'Manager-reviewed fieldwork handed over to Partner approval.')}>Start Partner approval</button>}
        </section>}
        <section className="business-fieldwork-card"><p className="business-eyebrow">IMMUTABLE SUBMISSIONS</p><h3>Independent review queue</h3>
          {workspace.reviewSubmissions.filter(item => ['ANALYTICAL_REVIEW','GOING_CONCERN'].includes(item.targetKind)).map(submission => {
            const reviewDraft = workprogramReviewDrafts[submission.id] ?? '';
            const targetName = submission.targetKind === 'ANALYTICAL_REVIEW'
              ? `Analytical review · ${String(workspace.analyticalReviews.find(item => item.id === submission.analyticalReviewId)?.fsliCode ?? submission.analyticalReviewId)}`
              : `Going-concern assessment · ${submission.goingConcernId}`;
            return <article className="business-fieldwork-review" key={submission.id}>
              <div className="business-section-heading"><div><strong>{targetName} · v{submission.targetVersion}</strong><span>Submitted {new Date(submission.submittedAt).toLocaleString()} · {submission.decision ? label(submission.decision) : 'awaiting review'}</span></div><code>{submission.dependencyHash.slice(0, 14)}</code></div>
              {submission.decisionComment && <p className="business-note">Reviewer rationale: {submission.decisionComment}</p>}
              {!submission.decision && canReview && <>
                <label className="business-field"><span>Independent review rationale (required for either decision)</span><textarea minLength={10} value={reviewDraft} onChange={event => setWorkprogramReviewDrafts(current => ({ ...current, [submission.id]: event.target.value }))} /></label>
                <div className="business-fieldwork-action-row">
                  <button className="btn sm" type="button" disabled={busy || reviewDraft.trim().length < 10} onClick={() => void command('review.decide', { submissionId: submission.id, decision: 'ACCEPT', comment: reviewDraft }, 'Submission accepted by an independent reviewer.')}>Accept exact submission</button>
                  <button className="btn sm" type="button" disabled={busy || reviewDraft.trim().length < 10} onClick={() => void command('review.decide', { submissionId: submission.id, decision: 'RETURN', comment: reviewDraft }, 'Submission returned with a documented assigned-preparer note.')}>Return for rework</button>
                </div>
              </>}
            </article>;
          })}
          {!workspace.reviewSubmissions.some(item => ['ANALYTICAL_REVIEW','GOING_CONCERN'].includes(item.targetKind)) && <p className="business-muted">No analytical-review or going-concern submissions are waiting in this engagement.</p>}
        </section>
        <section className="business-fieldwork-card"><p className="business-eyebrow">DOCUMENTED REWORK</p><h3>Review notes</h3>
          {workspace.reviewNotes.map(note => {
            const assigned = workspace.staff.find(staff => staff.id === note.assignedPreparerId);
            const laterAccepted = workspace.reviewSubmissions.filter(item => item.decision === 'ACCEPT' && item.submittedAt > (note.responseAt ?? note.createdAt) && (note.procedureId
              ? item.targetKind === 'PROCEDURE' && item.procedureId === note.procedureId
              : note.targetKind === 'GOING_CONCERN' ? item.targetKind === 'GOING_CONCERN' && (item.subjectRevision ?? 0) > (note.targetRevision ?? 0)
                : item.targetKind === note.targetKind && item.workprogramId === note.workprogramId && item.analyticalReviewId === note.analyticalReviewId && item.goingConcernId === note.goingConcernId && item.srmVersionId === note.srmVersionId))
              .sort((left,right) => right.targetVersion-left.targetVersion)[0];
            return <article className="business-fieldwork-review" key={note.id}>
              <strong>{label(note.targetKind)} note · {label(note.status)}{note.procedureId ? ` · ${workspace.procedures.find(item => item.id === note.procedureId)?.title ?? note.procedureId}` : ''}</strong>
              <p>{note.text}</p><small>Assigned preparer: {assigned?.displayName ?? note.assignedPreparerId}</small>
              {note.responseText && <p className="business-note">Preparer response: {note.responseText}</p>}
              {note.status === 'OPEN' && context.actor.staffMemberId === note.assignedPreparerId && <>
                <label className="business-field"><span>Response to the review note</span><textarea minLength={10} value={reviewNoteResponses[note.id] ?? ''} onChange={event => setReviewNoteResponses(current => ({ ...current, [note.id]: event.target.value }))} /></label>
                <button className="btn sm" type="button" disabled={busy || (reviewNoteResponses[note.id] ?? '').trim().length < 10} onClick={() => void command('review.respond', { noteId: note.id, responseText: reviewNoteResponses[note.id] }, 'Assigned preparer response recorded in the review history.')}>Record response</button>
              </>}
              {note.status === 'RESPONDED' && canReview && (laterAccepted ? <>
                <p className="business-note">Accepted resubmission v{laterAccepted.targetVersion} is available for closure.</p>
                <label className="business-field"><span>Reviewer closure rationale</span><textarea minLength={10} value={reviewNoteClosures[note.id] ?? ''} onChange={event => setReviewNoteClosures(current => ({ ...current, [note.id]: event.target.value }))} /></label>
                <button className="btn sm" type="button" disabled={busy || (reviewNoteClosures[note.id] ?? '').trim().length < 10} onClick={() => void command('review.close-note', { noteId: note.id, resubmissionId: laterAccepted.id, closureReason: reviewNoteClosures[note.id] }, 'Review note closed after independent acceptance of the later revision.')}>Close resolved note</button>
              </> : <p className="business-note">Waiting for the assigned preparer to resubmit and receive independent acceptance.</p>)}
            </article>;
          })}
          {!workspace.reviewNotes.length && <p className="business-muted">No rework notes have been issued for this engagement.</p>}
        </section>
      </div>}
    </>}
  </section>;
}

function StatementPane({ title, lines, selectedFsliId, onAnalysis, onWorkprogram, onSources, reviews, workprograms }: {
  title: string; lines: BusinessFieldworkWorkspace['statements']['profitLoss']; selectedFsliId: string;
  onAnalysis: (line: BusinessFieldworkWorkspace['statements']['profitLoss'][number]) => void;
  onWorkprogram: (line: BusinessFieldworkWorkspace['statements']['profitLoss'][number]) => void; onSources: (fsliId: string) => void;
  reviews: Array<Record<string, unknown>>; workprograms: BusinessFieldworkWorkspace['workprograms'];
}) {
  return <section className="business-fieldwork-card"><h3>{title}</h3><div className="business-fieldwork-scroll"><table><thead><tr><th>FSLI</th><th>CY adjusted</th><th>PY</th><th>Variance</th><th>Risk / status</th><th>Actions</th></tr></thead><tbody>
    {lines.map(line => {
      const review = reviews.find(item => String(item.fsliId) === line.fsliId);
      const workprogram = workprograms.find(item => item.fsliId === line.fsliId);
      return <tr key={line.fsliId} className={selectedFsliId === line.fsliId ? 'selected' : ''}><th scope="row">{line.code} · {line.name}</th><td>{qar(line.currentAdjustedMinor)}</td><td>{qar(line.priorMinor)}</td>
        <td>{formatRate(line.variancePercent,line.varianceReason)}</td><td><span className={`business-risk-band risk-${line.riskBand.toLowerCase()}`}>{line.riskBand}</span><small>{review ? `AR ${label(review.status)}` : 'AR not documented'} · {workprogram ? label(workprogram.status) : 'No workprogram'}</small></td>
        <td><div className="business-fieldwork-row-actions"><button type="button" className="btn sm" onClick={() => onAnalysis(line)}>AR Test</button><button type="button" className="btn sm" onClick={() => onWorkprogram(line)}>Audit Workprogram</button><button type="button" className="btn sm" onClick={() => onSources(line.fsliId)}>Source rows</button></div></td></tr>;
    })}
  </tbody></table></div></section>;
}

function PaginationControls({ page, pageSize, total, label: regionLabel, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  label: string;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const pageCount = Math.ceil(total / pageSize);
  return <nav className="business-fieldwork-pagination" aria-label={regionLabel}>
    <button type="button" className="btn sm" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))}>Previous {pageSize}</button>
    <span aria-live="polite">Rows {first}–{last} of {total} · page {page + 1} of {pageCount}</span>
    <button type="button" className="btn sm" disabled={last >= total} onClick={() => onPage(Math.min(pageCount - 1, page + 1))}>Next {pageSize}</button>
  </nav>;
}
