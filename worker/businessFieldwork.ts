// Version-pinned technical execution: statements, analysis, workprograms,
// sampling and retained evidence. All decisions pass through the audited
// BUSINESS command transaction in business.ts.
import * as z from 'zod';
import * as XLSX from 'xlsx';
import type { Env } from './env';
import { ApiError } from './errors';
import { randomToken, sha256Hex } from './http';
import type { BusinessContext, BusinessMutation } from './business';

const id = z.uuid();
const minor = z.string().regex(/^-?(0|[1-9]\d{0,15})$/).refine(value => Number.isSafeInteger(Number(value)), 'Amount is outside safe QAR minor-unit precision.');
const text = (min = 1, max = 10000) => z.string().trim().min(min).max(max);
const assertion = z.enum(['EXISTENCE','RIGHTS_OBLIGATIONS','COMPLETENESS','VALUATION','CUTOFF','PRESENTATION']);
const statementSnapshot = z.strictObject({ type: z.literal('statement.snapshot'), payload: z.strictObject({ engagementId: id }) });
const ratioInput = z.strictObject({
  name: text(1,200), numeratorMinor: minor, denominatorMinor: minor,
  numeratorSource: text(1,1000), denominatorSource: text(1,1000)
});
const analyticalReviewSave = z.strictObject({ type: z.literal('analytical-review.save'), payload: z.strictObject({
  engagementId: id, fsliId: id, statementSnapshotId: id,
  expectationText: text(10,10000), thresholdMinor: minor.nullable().optional(), thresholdBps: z.number().int().min(1).max(100000).nullable().optional(),
  explanation: text(10,10000).nullable().optional(), conclusion: text(10,5000).nullable().optional(), ratios: z.array(ratioInput).max(30).default([]),
  analyticalReviewId: id.optional(), expectedVersion: z.number().int().positive().optional()
}).refine(value => Boolean(value.analyticalReviewId) === Boolean(value.expectedVersion), { message: 'Revising an analytical review requires both the exact review id and its expected version.' }) });
const analyticalReviewSubmit = z.strictObject({ type: z.literal('analytical-review.submit'), payload: z.strictObject({ analyticalReviewId: id, expectedVersion: z.number().int().positive() }) });
const checklist = z.strictObject({
  managementAssessment: z.boolean(), cashFlowForecasts: z.boolean(), financingAndCovenants: z.boolean(),
  adverseEvents: z.boolean(), mitigatingPlans: z.boolean(), uncertaintyEvaluation: z.boolean()
});
const goingConcernSave = z.strictObject({ type: z.literal('going-concern.save'), payload: z.strictObject({
  engagementId: id, assessmentStart: z.iso.date(), assessmentEnd: z.iso.date(), checklist,
  managementAssessmentFileId: id.nullable().optional(), evidenceFileIds: z.array(id).max(30).default([]), eventsText: z.string().trim().max(10000).default(''),
  mitigatingPlansText: z.string().trim().max(10000).default(''),
  conclusion: z.enum(['UNASSESSED','NO_MATERIAL_UNCERTAINTY','MATERIAL_UNCERTAINTY','INAPPROPRIATE_BASIS']),
  rationale: text(10,10000)
}).refine(value => value.assessmentStart <= value.assessmentEnd, { message: 'Assessment end must not precede its start.' }) });
const workprogramTemplateCreate = z.strictObject({ type: z.literal('workprogram.template.create'), payload: z.strictObject({
  fsliCode: text(1,120), title: text(1,300), standardsProfileId: id,
  procedures: z.array(z.strictObject({ title: text(1,500), instructions: text(1,10000), assertion, mandatory: z.boolean() })).min(1).max(30)
}) });
const workprogramTemplateApprove = z.strictObject({ type: z.literal('workprogram.template.approve'), payload: z.strictObject({ templateId: id, expectedVersion: z.number().int().positive() }) });
const workprogramProvision = z.strictObject({ type: z.literal('workprogram.provision'), payload: z.strictObject({
  engagementId: id, fsliId: id, planningVersionId: id, templateId: id, assignedStaffId: id
}) });
const procedureInsert = z.strictObject({ type: z.literal('procedure.insert'), payload: z.strictObject({
  workprogramId: id, afterProcedureId: id.nullable().optional(), title: text(1,500), instructions: text(1,10000),
  assertion, scopeReason: text(10,5000)
}) });
const procedureUpdate = z.strictObject({ type: z.literal('procedure.update'), payload: z.strictObject({
  procedureId: id, expectedVersion: z.number().int().positive(), workPerformed: text(10,20000), conclusion: text(10,10000), reworkReason: text(10,5000).optional()
}) });
const procedureNotApplicable = z.strictObject({ type: z.literal('procedure.mark-not-applicable'), payload: z.strictObject({
  procedureId: id, expectedVersion: z.number().int().positive(), reason: text(10,5000)
}) });
const procedureSubmit = z.strictObject({ type: z.literal('procedure.submit'), payload: z.strictObject({ procedureId: id, expectedVersion: z.number().int().positive() }) });
const procedureReview = z.strictObject({ type: z.literal('procedure.review'), payload: z.strictObject({
  procedureId: id, expectedVersion: z.number().int().positive(), decision: z.enum(['ACCEPT','REWORK','NOT_APPLICABLE_APPROVED']), comments: text(10,10000), assignedPreparerId: id.optional()
}) });
const reviewSubmit = z.strictObject({ type: z.literal('review.submit'), payload: z.strictObject({ targetKind: z.enum(['PROCEDURE','WORKPROGRAM','ANALYTICAL_REVIEW','GOING_CONCERN','SRM']), targetId: id, targetVersion: z.number().int().positive(), dependencyHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }) });
const reviewDecide = z.strictObject({ type: z.literal('review.decide'), payload: z.strictObject({ submissionId: id, decision: z.enum(['ACCEPT','RETURN']), comment: text(10,10000), assignedPreparerId: id.optional(), procedureIds: z.array(id).max(100).default([]) }) });
const reviewRespond = z.strictObject({ type: z.literal('review.respond'), payload: z.strictObject({ noteId: id, responseText: text(10,10000) }) });
const reviewCloseNote = z.strictObject({ type: z.literal('review.close-note'), payload: z.strictObject({ noteId: id, resubmissionId: id, closureReason: text(10,10000) }) });
const partnerAreaClear = z.strictObject({ type: z.literal('partner.clear-area'), payload: z.strictObject({ workprogramId: id, submissionId: id, dependencyHash: z.string().regex(/^[a-f0-9]{64}$/), rationale: text(10,10000) }) });
const managerHandover = z.strictObject({ type: z.literal('fieldwork.handover-manager'), payload: z.strictObject({ engagementId: id, expectedVersion: z.number().int().positive(), reason: text(10,10000) }) });
const partnerHandover = z.strictObject({ type: z.literal('fieldwork.handover-partner'), payload: z.strictObject({ engagementId: id, expectedVersion: z.number().int().positive(), reason: text(10,10000) }) });
const findingCreate = z.strictObject({ type: z.literal('finding.create'), payload: z.strictObject({ engagementId: id, fsliId: id, title: text(1,500), description: text(10,20000), severity: z.enum(['LOW','MODERATE','HIGH','CRITICAL']), qualitativeSignificance: z.boolean() }) });
const findingRespond = z.strictObject({ type: z.literal('finding.respond'), payload: z.strictObject({ findingId: id, expectedVersion: z.number().int().positive(), clientResponse: text(10,10000) }) });
const findingResolve = z.strictObject({ type: z.literal('finding.resolve'), payload: z.strictObject({ findingId: id, expectedVersion: z.number().int().positive(), resolution: text(10,10000) }) });
const nonnegativeMinor = z.string().regex(/^(0|[1-9]\d{0,15})$/).refine(value=>Number.isSafeInteger(Number(value)),'Amount is outside safe QAR minor-unit precision.');
const adjustmentLine = z.strictObject({ fsliId: id, accountCode: text(1,120).nullable().optional(), debitMinor: nonnegativeMinor, creditMinor: nonnegativeMinor }).refine(line => (BigInt(line.debitMinor)>0n)!==(BigInt(line.creditMinor)>0n), { message:'Exactly one positive debit or credit amount is required on each AJE line.' });
const adjustmentCreate = z.strictObject({ type: z.literal('adjustment.create'), payload: z.strictObject({ engagementId: id, tbVersionId: id, findingId: id.nullable().optional(), description: text(10,10000), evidenceIds: z.array(id).min(1).max(100), lines: z.array(adjustmentLine).min(2).max(200) }) });
const adjustmentPropose = z.strictObject({ type: z.literal('adjustment.propose'), payload: z.strictObject({ adjustmentId: id, expectedVersion: z.number().int().positive() }) });
const adjustmentClientRespond = z.strictObject({ type: z.literal('adjustment.client-respond'), payload: z.strictObject({ adjustmentId: id, expectedVersion: z.number().int().positive(), decision: z.enum(['ACCEPTED','DECLINED']), responseText: text(10,10000), responseFileId: id.nullable().optional() }) });
const adjustmentApprove = z.strictObject({ type: z.literal('adjustment.approve'), payload: z.strictObject({ adjustmentId: id, expectedVersion: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), reflectedInSourceReason: text(10,10000).optional() }) });
const differenceCreate = z.strictObject({ type: z.literal('difference.create'), payload: z.strictObject({ findingId: id, fsliId: id, amountMinor: minor, nature: z.enum(['FACTUAL','JUDGMENTAL','PROJECTED']), qualitativeSignificance: z.boolean(), disposition: z.enum(['UNADJUSTED','ADJUSTED','CLEARLY_TRIVIAL']), dispositionReason: text(10,10000), adjustmentId: id.nullable().optional() }).refine(value => BigInt(value.amountMinor)!==0n) });
const srmCompile = z.strictObject({ type: z.literal('srm.compile'), payload: z.strictObject({ engagementId: id, managerRecommendation: text(10,10000), estimatesText: text(10,10000) }) });
const srmClear = z.strictObject({ type: z.literal('srm.clear'), payload: z.strictObject({ srmVersionId: id, dependencyHash: z.string().regex(/^[a-f0-9]{64}$/), rationale: text(10,10000) }) });
const confirmationCreate = z.strictObject({ type: z.literal('confirmation.create'), payload: z.strictObject({
  engagementId: id, type: z.enum(['BANK','AR','AP','INVENTORY','LEGAL']), fsliId: id,
  externalPartyName: text(1,200), externalPartyAddress: text(1,2000), externalPartyEmail: z.email().max(320).nullable().optional(),
  recipientVerificationText: text(10,5000), balanceMinor: minor.nullable().optional(), critical: z.boolean(),
  criticalityReason: text(10,5000).nullable().optional(), dueDate: z.iso.date()
}).refine(value => !value.critical || Boolean(value.criticalityReason?.trim()), { message: 'Critical confirmations require a reason.' }) });
const confirmationDispatch = z.strictObject({ type: z.literal('confirmation.dispatch'), payload: z.strictObject({ confirmationId: id, expectedVersion: z.number().int().positive() }) });
const confirmationResponse = z.strictObject({ type: z.literal('confirmation.record-response'), payload: z.strictObject({ confirmationId: id, expectedVersion: z.number().int().positive(), responseFileId: id, returnedAt: z.iso.datetime({ offset: true }) }) });
const confirmationVerify = z.strictObject({ type: z.literal('confirmation.verify'), payload: z.strictObject({ confirmationId: id, expectedVersion: z.number().int().positive(), verificationRationale: text(10,10000) }) });
const confirmationCancel = z.strictObject({ type: z.literal('confirmation.cancel'), payload: z.strictObject({ confirmationId: id, expectedVersion: z.number().int().positive(), reason: text(10,5000) }) });
const confirmationScopeReassess = z.strictObject({ type: z.literal('confirmation.scope-reassess'), payload: z.strictObject({ confirmationId: id, expectedVersion: z.number().int().positive(), rationale: text(10,10000), replacementCritical: z.boolean().nullable(), replacementCriticalityReason: text(10,5000).nullable().optional() }).refine(value=>value.replacementCritical!==true||Boolean(value.replacementCriticalityReason?.trim()),{message:'A critical replacement requires a criticality rationale.'}) });
const confirmationFollowup = z.strictObject({ type: z.literal('confirmation.follow-up'), payload: z.strictObject({ confirmationId: id, note: text(10,5000) }) });
const confirmationAlternative = z.strictObject({ type: z.literal('confirmation.alternative-procedure'), payload: z.strictObject({ confirmationId: id, evidenceFileId: id, rationale: text(10,10000) }) });
const samplingPolicyCreate = z.strictObject({ type: z.literal('sampling.policy.create'), payload: z.strictObject({
  name: text(1,300), method: z.enum(['MUS_BINOMIAL_PPS','SYSTEMATIC','STRATIFIED_ATTRIBUTE']), assumptions: text(10,10000)
}) });
const samplingPolicyApprove = z.strictObject({ type: z.literal('sampling.policy.approve'), payload: z.strictObject({ policyId: id, expectedVersion: z.number().int().positive(), rationale: text(10,10000) }) });
const samplingPopulationCreate = z.strictObject({ type: z.literal('sampling.population.create'), payload: z.strictObject({
  engagementId: id, name: text(1,300), fsliId: id, sourceFileId: id, worksheet: text(1,200).optional(), headerRow: z.number().int().min(1).max(10000),
  referenceColumn: z.number().int().min(0).max(255), amountColumn: z.number().int().min(0).max(255), descriptionColumn: z.number().int().min(0).max(255).optional(),
  exclusionsReason: text(10,5000).optional()
}) });
const stratumInput = z.strictObject({ key: text(1,120), description: text(1,1000), populationRowIds: z.array(id).min(1).max(100000), expectedDeviationBps: z.number().int().min(0).max(9999), tolerableDeviationBps: z.number().int().min(1).max(10000), rationale: text(10,5000) });
const samplingPlan = z.strictObject({ type: z.literal('sampling.plan'), payload: z.strictObject({
  engagementId: id, populationId: id, policyId: id, procedureId: id.optional(), method: z.enum(['MUS_BINOMIAL_PPS','SYSTEMATIC','STRATIFIED_ATTRIBUTE']),
  confidenceBps: z.number().int().min(5000).max(9999).nullable().optional(), tolerableMinor: minor.nullable().optional(),
  expectedTaintedBps: z.number().int().min(0).max(9999).nullable().optional(), requestedCount: z.number().int().positive().nullable().optional(),
  sampleSizeRationale: text(10,5000).nullable().optional(), periodicityAssessment: text(10,5000).nullable().optional(),
  orderingRule: z.enum(['SOURCE_ROW_ASC','REFERENCE_ASC','SERVER_SEEDED_SHUFFLE']).default('SOURCE_ROW_ASC'),
  strata: z.array(stratumInput).max(100).optional(), reason: text(10,10000)
}) });
const samplingRecordTest = z.strictObject({ type: z.literal('sampling.record-test'), payload: z.strictObject({
  planId: id, populationRowId: id, expectedVersion: z.number().int().min(0), tested: z.boolean(), auditedValueMinor: minor.nullable().optional(), misstated: z.boolean().nullable().optional(),
  deviation: z.boolean().nullable().optional(), conclusion: text(10,10000).nullable().optional(), evidenceId: id.nullable().optional(), evidenceVersion: z.number().int().positive().nullable().optional()
}) });
const samplingEvaluate = z.strictObject({ type: z.literal('sampling.evaluate'), payload: z.strictObject({ planId: id, testSetHash: z.string().regex(/^[a-f0-9]{64}$/) }) });
const evidenceCreate = z.strictObject({ type: z.literal('evidence.create'), payload: z.strictObject({
  engagementId: id, mode: z.enum(['DIGITAL','PHYSICAL','HYBRID']), title: text(1,500), fileVersionId: id.optional(),
  physicalIndex: text(1,120).optional(), physicalDescription: text(5,3000).optional(), binder: text(1,200).optional(), box: text(1,200).optional(), shelf: text(1,200).optional(),
  externalSourceUrl: z.url().max(2000).refine(value=>/^https?:\/\//i.test(value),'Only HTTP(S) source URLs are supported.').optional(), retrievedAt: z.iso.datetime({ offset: true }).optional(), supersedesEvidenceId: id.optional()
}).superRefine((value,ctx)=>{
  if(value.mode==='DIGITAL'&&!value.fileVersionId)ctx.addIssue({code:'custom',path:['fileVersionId'],message:'DIGITAL evidence needs a committed retained file.'});
  if(value.mode==='PHYSICAL'||value.mode==='HYBRID'){
    if(!value.physicalIndex)ctx.addIssue({code:'custom',path:['physicalIndex'],message:'Physical evidence requires an index code.'});
    if(!value.physicalDescription)ctx.addIssue({code:'custom',path:['physicalDescription'],message:'Physical evidence requires a description.'});
    if(!value.binder&&!value.box&&!value.shelf)ctx.addIssue({code:'custom',path:['binder'],message:'Provide at least one physical binder, box or shelf locator.'});
  }
  if(Boolean(value.externalSourceUrl)!==Boolean(value.retrievedAt))ctx.addIssue({code:'custom',path:['retrievedAt'],message:'An external source URL and its retrieval time must be recorded together.'});
}) });
const evidenceLink = z.strictObject({ type: z.literal('evidence.link'), payload: z.strictObject({
  evidenceId: id, evidenceVersion: z.number().int().positive(), targetVersion: z.number().int().positive(), procedureId: id.optional(), sampleTestId: id.optional(), analyticalReviewId: id.optional(), findingId: id.optional()
}).refine(value => [value.procedureId,value.sampleTestId,value.analyticalReviewId,value.findingId].filter(Boolean).length === 1, { message: 'Evidence must link to exactly one supported audit target.' }) });
const evidenceReview = z.strictObject({ type: z.literal('evidence.review'), payload: z.strictObject({
  evidenceId: id, evidenceVersion: z.number().int().positive(), status: z.enum(['ADEQUATE','DEFICIENT']), rationale: text(10,10000)
}) });
const evidenceUnlink = z.strictObject({ type: z.literal('evidence.unlink'), payload: z.strictObject({ evidenceLinkId: id, reason: text(10,10000) }) });

export const businessFieldworkCommands = [statementSnapshot, analyticalReviewSave, analyticalReviewSubmit, goingConcernSave,
  workprogramTemplateCreate, workprogramTemplateApprove, workprogramProvision, procedureInsert, procedureUpdate,
  procedureNotApplicable, procedureSubmit, procedureReview, reviewSubmit, reviewDecide, reviewRespond, reviewCloseNote, partnerAreaClear, managerHandover, partnerHandover, findingCreate, findingRespond, findingResolve, adjustmentCreate, adjustmentPropose, adjustmentClientRespond, adjustmentApprove, differenceCreate, srmCompile, srmClear, samplingPolicyCreate, samplingPolicyApprove,
  samplingPopulationCreate, samplingPlan, samplingRecordTest, samplingEvaluate, evidenceCreate, evidenceLink,
  evidenceReview, evidenceUnlink, confirmationCreate, confirmationDispatch, confirmationResponse, confirmationVerify, confirmationCancel, confirmationScopeReassess, confirmationFollowup, confirmationAlternative] as const;
export const businessFieldworkCommandSchema = z.discriminatedUnion('type', businessFieldworkCommands);
export type BusinessFieldworkCommand = z.infer<typeof businessFieldworkCommandSchema>;
export function isBusinessFieldworkCommand(command: { type: string }): command is BusinessFieldworkCommand {
  return command.type === 'statement.snapshot' || command.type.startsWith('analytical-review.') || command.type.startsWith('going-concern.')
    || command.type.startsWith('workprogram.') || command.type.startsWith('procedure.') || command.type.startsWith('review.') || command.type==='partner.clear-area' || command.type.startsWith('fieldwork.handover-') || command.type.startsWith('finding.') || command.type.startsWith('adjustment.') || command.type.startsWith('difference.') || command.type.startsWith('srm.') || command.type.startsWith('sampling.')
    || command.type.startsWith('evidence.') || command.type.startsWith('confirmation.');
}

type Engagement = { id: string; version: number; client_id: string; lifecycle_state: string; period_start: string; period_end: string; locked_at: string | null; standards_profile_id: string; active_tb_version_id: string | null; active_mapping_version_id: string | null; active_materiality_version_id: string | null; approved_planning_version_id: string | null };
export type ConfirmationGateEngagement = Pick<Engagement, 'id' | 'version' | 'client_id' | 'active_tb_version_id' | 'active_mapping_version_id' | 'active_materiality_version_id'>;
export type CriticalConfirmationBlocker = { id: string; version: number; type: string; status: string; dueDate: string; sourceHash: string; externalPartyName: string; criticalityReason: string; stalePins: boolean };
type StatementLine = { fsliId: string; code: string; name: string; statement: string; category: string; displaySign: number; currentBaseMinor: number; currentAdjustmentMinor: number; currentAdjustedMinor: number; priorMinor: number | null; varianceNumerator: string | null; varianceDenominator: string | null; variancePercent: number | null; varianceReason: string; riskBand: string; sourceRows: Array<Record<string, unknown>> };

export function isIsa570EditionCompatible(periodStart: string, isa570Edition: string): boolean {
  return periodStart < '2026-12-15' || /2024/i.test(isa570Edition);
}

export function calculateStatementVariance(currentMinor: number, priorMinor: number | null): {
  numerator: string | null; denominator: string | null; percent: number | null;
  reason: 'CALCULATED' | 'NEW_BALANCE' | 'ZERO_BOTH' | 'NO_COMPARATIVE';
} {
  if (priorMinor === null) return { numerator: null, denominator: null, percent: null, reason: 'NO_COMPARATIVE' };
  if (priorMinor === 0) return { numerator: null, denominator: null, percent: null, reason: currentMinor === 0 ? 'ZERO_BOTH' : 'NEW_BALANCE' };
  const numerator = currentMinor - priorMinor;
  const percent = numerator / Math.abs(priorMinor) * 100;
  return { numerator: String(numerator), denominator: String(Math.abs(priorMinor)), percent: Math.round(percent * 100) / 100, reason: 'CALCULATED' };
}

function requireInternal(context: BusinessContext, action = 'fieldwork.read'): void {
  if (context.actor.persona === 'CLIENT' || !context.allowedActions.includes(action)) throw new ApiError('PERSONA_ACTION_DENIED', 'Internal fieldwork access is required for this action.');
}
function requireWriter(context: BusinessContext): void {
  if (context.actor.persona !== 'PREPARER' && context.actor.persona !== 'REVIEWER' && context.actor.persona !== 'APPROVER') throw new ApiError('PERSONA_ACTION_DENIED', 'Only an internal persona can record fieldwork.');
  if (!context.allowedActions.includes('fieldwork.manage')) throw new ApiError('PERSONA_ACTION_DENIED', 'Fieldwork write access is required.');
}
function requireReviewer(context: BusinessContext): void {
  if ((context.actor.persona !== 'REVIEWER' && context.actor.persona !== 'APPROVER') || !context.allowedActions.includes('fieldwork.review')) throw new ApiError('PERSONA_ACTION_DENIED', 'An internal reviewer is required for this decision.');
}
function requirePartner(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') throw new ApiError('PERSONA_ACTION_DENIED', 'Only a PARTNER APPROVER can approve firm methodology or templates.');
}
async function getEngagement(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<Engagement> {
  requireInternal(context);
  const row = await env.DB.prepare(`SELECT id,version,client_id,lifecycle_state,period_start,period_end,locked_at,standards_profile_id,
      active_tb_version_id,active_mapping_version_id,active_materiality_version_id,approved_planning_version_id
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,engagementId).first<Engagement>();
  if (!row) throw new ApiError('NOT_FOUND','The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId!==row.client_id)||(context.scope.engagementId&&context.scope.engagementId!==row.id)) throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside the selected context.');
  if (row.locked_at || row.lifecycle_state==='ARCHIVED_READ_ONLY') throw new ApiError('WORKSPACE_FROZEN','Archived engagements are read-only.');
  if (!['FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN'].includes(row.lifecycle_state)) throw new ApiError('INVALID_STATE','Technical execution is available only after planning sign-off.');
  if (!row.active_tb_version_id || !row.active_mapping_version_id || !row.approved_planning_version_id) throw new ApiError('GATE_BLOCKED','Current approved trial-balance, mapping and planning pins are required.');
  return row;
}
function rowHash(input: unknown): Promise<string> { return sha256Hex(JSON.stringify(input)); }
export function assertGoingConcernComplete(conclusion: string): void {
  if (conclusion === 'UNASSESSED') throw new ApiError('GATE_BLOCKED', 'An unfinished going-concern assessment (conclusion UNASSESSED) cannot be submitted for independent review.');
}
export function assertFieldworkFsliCoverage(mappedFsliIds: string[], workprogramFsliIds: string[]): void {
  const covered = new Set(workprogramFsliIds);
  const uncovered = mappedFsliIds.filter(fsliId => !covered.has(fsliId));
  if (uncovered.length) throw new ApiError('GATE_BLOCKED', `Fieldwork is incomplete: ${uncovered.length} in-scope FSLI(s) on the active mapping have no workprogram.`);
}
function moneyMinor(value: string | number): number {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(amount)) throw new ApiError('INVALID_SAMPLE_PARAMETERS','Amount is outside the supported safe minor-unit range.');
  return amount;
}
function decimalToMinor(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new ApiError('INVALID_POPULATION','A population amount is missing or is not numeric.');
  const input = String(value).trim().replace(/,/g,'');
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) throw new ApiError('INVALID_POPULATION','Population values must be exact QAR amounts with at most two decimal places.');
  const minorValue = Number(match[2])*100 + Number((match[3]??'').padEnd(2,'0'));
  const result = match[1] ? -minorValue : minorValue;
  if (!Number.isSafeInteger(result)) throw new ApiError('INVALID_POPULATION','A population amount is outside safe QAR minor-unit precision.');
  return result;
}

// Lanczos log-gamma keeps the statistical CDF calculations in log space. The
// production domain is bounded by explicit population and draw-count ceilings.
function logGamma(z: number): number {
  const p = [676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-0.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  let x = 0.9999999999998099;
  const v = z-1;
  p.forEach((coefficient,index)=>{x+=coefficient/(v+index+1);});
  const t=v+p.length-0.5;
  return 0.5*Math.log(2*Math.PI)+(v+0.5)*Math.log(t)-t+Math.log(x);
}
function logChoose(n: number, k: number): number {
  if (k<0||k>n) return Number.NEGATIVE_INFINITY;
  return logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1);
}
function logSumExp(values: number[]): number {
  if (!values.length) return Number.NEGATIVE_INFINITY;
  const maximum=Math.max(...values);
  if (!Number.isFinite(maximum)) return maximum;
  return maximum+Math.log(values.reduce((sum,value)=>sum+Math.exp(value-maximum),0));
}
function binomialCdf(k: number, n: number, probability: number): number {
  if (probability<=0) return 1;
  if (probability>=1) return k>=n ? 1 : 0;
  const upper=Math.min(k,n);
  if (upper<0) return 0;
  const terms:number[]=[];
  for(let i=0;i<=upper;i++) terms.push(logChoose(n,i)+i*Math.log(probability)+(n-i)*Math.log1p(-probability));
  return Math.min(1,Math.exp(logSumExp(terms)));
}
function hypergeometricCdf(k: number, population: number, deviations: number, draws: number): number {
  const low=Math.max(0,draws-(population-deviations));
  const high=Math.min(k,draws,deviations);
  if(high<low)return 0;
  if(population>20000)throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','Exact finite-population evaluation supports populations up to 20,000 rows. No approximate confidence result was created.');
  const denominator=logChoose(population,draws);
  const terms:number[]=[];
  for(let x=low;x<=high;x++)terms.push(logChoose(deviations,x)+logChoose(population-deviations,draws-x)-denominator);
  return Math.min(1,Math.exp(logSumExp(terms)));
}
function chooseMusCount(pT: number,pE: number,alpha: number): number {
  if(!(pT>0&&pT<1&&pE>=0&&pE<pT&&alpha>0&&alpha<1))throw new ApiError('INVALID_SAMPLE_PARAMETERS','MUS requires 0 < T/B < 1, 0 <= expected tainted-book-value proportion < T/B, and a supported confidence level.');
  if(pE===0){const n=Math.ceil(Math.log(alpha)/Math.log1p(-pT));if(n>5000)throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The exact MUS sample exceeds the supported 5,000-draw calculation domain.');return Math.max(1,n);}
  for(let n=1;n<=5000;n++){if(binomialCdf(Math.floor(n*pE),n,pT)<=alpha)return n;}
  throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The exact MUS sample exceeds the supported 5,000-draw calculation domain.');
}
function chooseAttributeCount(population: number,expectedBps: number,tolerableBps: number,alpha: number): number {
  if(population<1||population>20000||expectedBps<0||expectedBps>=tolerableBps||tolerableBps>=10000)throw new ApiError('INVALID_SAMPLE_PARAMETERS','Attribute sampling needs a supported population and 0 <= EDR < TDR < 100%.');
  const unacceptable=Math.floor(population*tolerableBps/10000)+1;
  for(let n=1;n<=population;n++)if(hypergeometricCdf(Math.floor(n*expectedBps/10000),population,unacceptable,n)<=alpha)return n;
  return population;
}
async function keyedSampler(seedHex:string){
  const seed=new Uint8Array(seedHex.match(/../g)?.map(pair=>parseInt(pair,16))??[]);
  const key=await crypto.subtle.importKey('raw',seed,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return async(counter:number,range:bigint):Promise<bigint>=>{
    if(range<=0n||range>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The random selection range exceeds safe integer precision.');
    const space=1n<<64n;const limit=(space/range)*range;
    for(let retry=0;retry<100;retry++){
      const message=new TextEncoder().encode(`AUDITSPHERE_SAMPLING:v1:${counter}:${retry}`);const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
      let sample=0n;for(let i=0;i<8;i++)sample=(sample<<8n)|BigInt(signature[i]);if(sample<limit)return sample%range;
    }
    throw new ApiError('UNAVAILABLE','The cryptographic sampler could not produce an unbiased value.');
  };
}

async function financialStatements(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const engagement=await getEngagement(env,workspaceId,context,engagementId);
  const tb=await env.DB.prepare(`SELECT revision,prior_present,content_sha256 FROM tb_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,engagement.active_tb_version_id,engagementId).first<{revision:number;prior_present:number;content_sha256:string}>();
  const mapping=await env.DB.prepare(`SELECT revision,content_sha256 FROM mapping_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,engagement.active_mapping_version_id,engagementId).first<{revision:number;content_sha256:string}>();
  if(!tb||!mapping)throw new ApiError('STALE_DEPENDENCY','The active TB or mapping pin is no longer available.');
  const catalog=await env.DB.prepare(`SELECT id,code,name,statement,category,display_sign,presentation_order FROM fsli_catalog
    WHERE workspace_id=? AND active=1 ORDER BY presentation_order,code`).bind(workspaceId).all<Record<string,unknown>>();
  const source=await env.DB.prepare(`SELECT l.id AS tbLineId,l.source_row_number AS sourceRowNumber,l.account_code AS accountCode,
      l.account_name AS accountName,l.current_minor AS currentRawMinor,l.prior_minor AS priorRawMinor,
      m.fsli_id AS fsliId,c.display_sign AS displaySign
    FROM tb_lines l JOIN tb_mappings m ON m.workspace_id=l.workspace_id AND m.tb_line_id=l.id AND m.mapping_version_id=?
      JOIN fsli_catalog c ON c.workspace_id=m.workspace_id AND c.id=m.fsli_id
    WHERE l.workspace_id=? AND l.tb_version_id=? AND l.engagement_id=? ORDER BY l.source_row_number,l.id`)
    .bind(engagement.active_mapping_version_id,workspaceId,engagement.active_tb_version_id,engagementId).all<Record<string,unknown>>();
  const adjustmentRows=await env.DB.prepare(`SELECT a.id AS adjustmentId,a.number,a.tb_version_id AS tbVersionId,a.mapping_version_id AS mappingVersionId,a.source_hash AS sourceHash,
      l.fsli_id AS fsliId,l.debit_minor AS debitMinor,l.credit_minor AS creditMinor
    FROM audit_adjustments a JOIN audit_adjustment_lines l ON l.workspace_id=a.workspace_id AND l.adjustment_id=a.id
    WHERE a.workspace_id=? AND a.engagement_id=? AND a.status='REVIEW_APPROVED' AND a.include_in_statements=1
    ORDER BY a.number,l.id`).bind(workspaceId,engagementId).all<{adjustmentId:string;number:string;tbVersionId:string;mappingVersionId:string|null;sourceHash:string;fsliId:string;debitMinor:number;creditMinor:number}>();
  const appliedAdjustments=adjustmentRows.results??[];
  if(appliedAdjustments.some(row=>row.tbVersionId!==engagement.active_tb_version_id||row.mappingVersionId!==engagement.active_mapping_version_id))throw new ApiError('STALE_DEPENDENCY','An approved adjustment is pinned to a replaced trial-balance or mapping source and cannot be overlaid on the active statement. Record a reviewer disposition for the replacement source.');
  const adjustmentByFsli=new Map<string,bigint>();
  for(const row of appliedAdjustments){const key=row.fsliId;adjustmentByFsli.set(key,(adjustmentByFsli.get(key)??0n)+BigInt(row.debitMinor)-BigInt(row.creditMinor));}
  const adjustmentSetHash=await rowHash(appliedAdjustments.map(row=>({id:row.adjustmentId,number:row.number,tbVersionId:row.tbVersionId,mappingVersionId:row.mappingVersionId,sourceHash:row.sourceHash,fsliId:row.fsliId,debitMinor:String(row.debitMinor),creditMinor:String(row.creditMinor)})));
  const risks=await env.DB.prepare(`SELECT r.fsli_id AS fsliId,r.band FROM fsli_risks r
    WHERE r.workspace_id=? AND r.engagement_id=? AND r.materiality_version_id=?
      AND r.revision=(SELECT MAX(r2.revision) FROM fsli_risks r2 WHERE r2.workspace_id=r.workspace_id AND r2.engagement_id=r.engagement_id AND r2.fsli_id=r.fsli_id AND r2.materiality_version_id=r.materiality_version_id)`)
    .bind(workspaceId,engagementId,engagement.active_materiality_version_id).all<{fsliId:string;band:string}>();
  const riskMap=new Map((risks.results??[]).map(row=>[row.fsliId,row.band]));
  const rowsByFsli=new Map<string,Array<Record<string,unknown>>>();
  for(const row of source.results??[]){const key=String(row.fsliId);const rows=rowsByFsli.get(key)??[];rows.push(row);rowsByFsli.set(key,rows);}
  const lines:StatementLine[]=(catalog.results??[]).map(item=>{
    const fsliId=String(item.id);const sign=Number(item.display_sign);const contributors=rowsByFsli.get(fsliId)??[];
    const currentRaw=contributors.reduce((sum,row)=>sum+Number(row.currentRawMinor),0);
    const priorRaw=(tb.prior_present===1)?contributors.reduce((sum,row)=>sum+(row.priorRawMinor===null?0:Number(row.priorRawMinor)),0):null;
    const currentBase=currentRaw*sign;const adjustment=Number(adjustmentByFsli.get(fsliId)??0n)*sign;
    if(!Number.isSafeInteger(adjustment))throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The approved adjustment total exceeds safe QAR minor-unit precision for this statement line.');
    const current=currentBase+adjustment;const prior=priorRaw===null?null:priorRaw*sign;
    const variance=calculateStatementVariance(current,prior);
    return {fsliId,code:String(item.code),name:String(item.name),statement:String(item.statement),category:String(item.category),displaySign:sign,
      currentBaseMinor:currentBase,currentAdjustmentMinor:adjustment,currentAdjustedMinor:current,priorMinor:prior,varianceNumerator:variance.numerator,varianceDenominator:variance.denominator,
      variancePercent:variance.percent,varianceReason:variance.reason,riskBand:riskMap.get(fsliId)??'GREEN',
      sourceRows:contributors.map(row=>({tbLineId:row.tbLineId,sourceRowNumber:row.sourceRowNumber,accountCode:row.accountCode,accountName:row.accountName,
        currentRawMinor:String(row.currentRawMinor),currentPresentedMinor:String(Number(row.currentRawMinor)*sign),priorRawMinor:row.priorRawMinor===null?null:String(row.priorRawMinor),
        priorPresentedMinor:row.priorRawMinor===null?null:String(Number(row.priorRawMinor)*sign),displaySign:sign}))};
  });
  const profitLoss=lines.filter(line=>line.statement==='PROFIT_LOSS');
  const balanceSheet=lines.filter(line=>line.statement==='BALANCE_SHEET');
  const total=(items:StatementLine[],category:string)=>items.filter(line=>line.category===category).reduce((sum,line)=>sum+line.currentAdjustedMinor,0);
  const assets=total(balanceSheet,'ASSET');const liabilities=total(balanceSheet,'LIABILITY');const equity=total(balanceSheet,'EQUITY');
  const revenue=profitLoss.filter(line=>line.category==='REVENUE').reduce((sum,line)=>sum+line.currentAdjustedMinor,0);
  const expenses=profitLoss.filter(line=>line.category==='EXPENSE').reduce((sum,line)=>sum+line.currentAdjustedMinor,0);
  const currentResult=revenue-expenses;const equityIncludingResult=equity+currentResult;const difference=assets-liabilities-equityIncludingResult;
  const pins={tbVersionId:engagement.active_tb_version_id,tbRevision:tb.revision,tbSha256:tb.content_sha256,
    mappingVersionId:engagement.active_mapping_version_id,mappingRevision:mapping.revision,mappingSha256:mapping.content_sha256,
    standardsProfileId:engagement.standards_profile_id};
  const sourceHash=await rowHash({engagementId,pins,adjustmentSetHash,lines:lines.map(line=>({fsliId:line.fsliId,currentBase:line.currentBaseMinor,currentAdjustment:line.currentAdjustmentMinor,currentAdjusted:line.currentAdjustedMinor,prior:line.priorMinor,riskBand:line.riskBand}))});
  return {engagementId,sourcePins:pins,sourceHash,adjustmentSetHash,basis:'ADJUSTED',profitLoss,balanceSheet,
    reconciliation:{assetsMinor:String(assets),liabilitiesMinor:String(liabilities),equityMinor:String(equity),currentResultMinor:String(currentResult),
      equityIncludingCurrentResultMinor:String(equityIncludingResult),differenceMinor:String(difference),balanced:difference===0},
    blockers:difference===0?[]:[{code:'BALANCE_SHEET_OUT_OF_BALANCE',differenceMinor:String(difference),message:'Assets must equal liabilities, equity and current-period result. No suspense balance is created.'}]};
}

export async function getBusinessFinancialStatements(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  requireInternal(context);return financialStatements(env,workspaceId,context,engagementId);
}

export async function getBusinessFsliSourceLines(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,fsliId:string,limit:number,cursor:number){
  const statements=await financialStatements(env,workspaceId,context,engagementId);
  const line=[...statements.profitLoss,...statements.balanceSheet].find(item=>item.fsliId===fsliId);
  if(!line)throw new ApiError('NOT_FOUND','The financial statement line was not found in the current engagement.');
  const start=Math.max(0,Math.min(line.sourceRows.length,cursor));const page=line.sourceRows.slice(start,start+Math.max(1,Math.min(200,limit)));
  const adjustmentRows=await env.DB.prepare(`SELECT a.id AS adjustmentId,a.number,a.tb_version_id AS tbVersionId,a.source_hash AS sourceHash,a.description,
      l.debit_minor AS debitMinor,l.credit_minor AS creditMinor
    FROM audit_adjustments a JOIN audit_adjustment_lines l ON l.workspace_id=a.workspace_id AND l.adjustment_id=a.id
    WHERE a.workspace_id=? AND a.engagement_id=? AND a.status='REVIEW_APPROVED' AND a.include_in_statements=1 AND l.fsli_id=? ORDER BY a.number,l.id`)
    .bind(workspaceId,engagementId,fsliId).all<Record<string,unknown>>();
  return {sourcePins:statements.sourcePins,sourceHash:statements.sourceHash,fsli:{id:line.fsliId,code:line.code,name:line.name},
    rows:page,adjustments:adjustmentRows.results??[],nextCursor:start+page.length<line.sourceRows.length?String(start+page.length):null,totalRows:line.sourceRows.length};
}

export async function getBusinessFieldworkWorkspace(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const engagement=await getEngagement(env,workspaceId,context,engagementId);
  const statements=await financialStatements(env,workspaceId,context,engagementId);
  const [templates,reviews,going,programs,procedures,evidence,policies,populations,plans,changes]=await Promise.all([
    env.DB.prepare(`SELECT id,version,fsli_code AS fsliCode,revision,title,standards_profile_id AS standardsProfileId,status,approved_by_actor_id AS approvedByActorId,approved_at AS approvedAt
      FROM workprogram_templates WHERE workspace_id=? AND standards_profile_id=? ORDER BY fsli_code,revision DESC`).bind(workspaceId,engagement.standards_profile_id).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.version,a.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,a.statement_snapshot_id AS statementSnapshotId,a.expectation_text AS expectationText,
      a.threshold_minor AS thresholdMinor,a.threshold_bps AS thresholdBps,a.explanation,a.conclusion,a.status,a.source_hash AS sourceHash,a.prepared_by_actor_id AS preparedByActorId,
      (SELECT COUNT(*) FROM evidence_links l LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id
        WHERE l.workspace_id=a.workspace_id AND l.analytical_review_id=a.id AND u.id IS NULL) AS evidenceCount
      FROM analytical_reviews a JOIN fsli_catalog c ON c.workspace_id=a.workspace_id AND c.id=a.fsli_id WHERE a.workspace_id=? AND a.engagement_id=? ORDER BY a.updated_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT g.id,g.version,g.revision,g.isa_570_edition AS isa570Edition,g.assessment_start AS assessmentStart,g.assessment_end AS assessmentEnd,
      g.checklist_json AS checklistJson,g.events_text AS eventsText,g.mitigating_plans_text AS mitigatingPlansText,g.conclusion,g.rationale,g.status,g.source_hash AS sourceHash,g.created_at AS createdAt
      FROM going_concern_assessments g WHERE g.workspace_id=? AND g.engagement_id=? ORDER BY g.revision DESC LIMIT 1`).bind(workspaceId,engagementId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT w.id,w.version,w.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,w.template_id AS templateId,w.planning_version_id AS planningVersionId,w.risk_band AS riskBand,
      w.assigned_staff_id AS assignedStaffId,w.status,w.source_hash AS sourceHash FROM workprograms w JOIN fsli_catalog c ON c.workspace_id=w.workspace_id AND c.id=w.fsli_id
      WHERE w.workspace_id=? AND w.engagement_id=? ORDER BY c.presentation_order`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT p.id,p.version,p.workprogram_id AS workprogramId,w.fsli_id AS fsliId,p.ordinal,p.title,p.instructions,p.assertion,p.origin,p.mandatory,p.scope_reason AS scopeReason,
      p.work_performed AS workPerformed,p.conclusion,p.applicable,p.not_applicable_reason AS notApplicableReason,p.status,p.executed_by_staff_id AS executedByStaffId,
      p.evidence_set_hash AS evidenceSetHash,p.source_hash AS sourceHash,(SELECT MAX(s.id) FROM procedure_submissions s WHERE s.workspace_id=p.workspace_id AND s.procedure_id=p.id) AS submissionId
      FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id,p.ordinal`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT e.id,e.family_id AS familyId,e.version,e.mode,e.title,e.file_version_id AS fileVersionId,e.physical_index AS physicalIndex,e.physical_description AS physicalDescription,
      e.binder,e.box,e.shelf,e.external_source_url AS externalSourceUrl,e.retrieved_at AS retrievedAt,f.sha256 AS fileSha256,
      (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy,
      (SELECT d.rationale FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacyRationale
      FROM evidence_records e LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id WHERE e.workspace_id=? AND e.engagement_id=?
      AND e.version=(SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) ORDER BY e.created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,version,name,method,algorithm_version AS algorithmVersion,assumptions,status,approved_by_actor_id AS approvedByActorId,approved_at AS approvedAt
      FROM sampling_policies WHERE workspace_id=? ORDER BY name,version DESC`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,name,source_file_id AS sourceFileId,fsli_id AS fsliId,source_hash AS sourceHash,order_hash AS orderHash,row_count AS rowCount,
      positive_total_minor AS positiveTotalMinor,excluded_count AS excludedCount,exclusions_reason AS exclusionsReason FROM sample_populations WHERE workspace_id=? AND engagement_id=? ORDER BY created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT p.id,p.population_id AS populationId,p.policy_id AS policyId,p.policy_version AS policyVersion,p.seed_hex AS seedHex,p.revision,p.method,p.confidence_bps AS confidenceBps,p.tolerable_minor AS tolerableMinor,
      p.expected_tainted_bps AS expectedTaintedBps,p.requested_count AS requestedCount,p.calculated_count AS calculatedCount,p.parameters_json AS parametersJson,
      p.input_hash AS inputHash,p.reason,p.created_at AS createdAt,link.procedure_id AS procedureId,
      (SELECT e.result FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS latestResult
      FROM sampling_plans p JOIN sample_populations s ON s.workspace_id=p.workspace_id AND s.id=p.population_id
      LEFT JOIN sampling_plan_procedure_links link ON link.workspace_id=p.workspace_id AND link.plan_id=p.id
      WHERE p.workspace_id=? AND s.engagement_id=? ORDER BY p.created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT COALESCE(MAX(sequence),0) AS cursor FROM fieldwork_change_feed WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagementId).first<{cursor:number}>()
  ] as const);
  const [staff,evidenceLinks]=await Promise.all([
    env.DB.prepare(`SELECT id,display_name AS displayName,grade FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY grade,display_name`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.evidence_id AS evidenceId,l.evidence_version AS evidenceVersion,l.target_version AS targetVersion,
      CASE WHEN l.procedure_id IS NOT NULL THEN 'PROCEDURE' WHEN l.sample_test_id IS NOT NULL THEN 'SAMPLE_TEST' WHEN l.analytical_review_id IS NOT NULL THEN 'ANALYTICAL_REVIEW' ELSE 'FINDING' END AS targetType,
      COALESCE(l.procedure_id,l.sample_test_id,l.analytical_review_id,l.finding_id) AS targetId,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS currentEvidenceVersion,
      u.reason AS unlinkReason,
      u.actor_id AS unlinkActorId,u.unlinked_at AS unlinkedAt,l.linked_at AS linkedAt
      FROM evidence_links l JOIN evidence_records e ON e.workspace_id=l.workspace_id AND e.id=l.evidence_id
      LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id
      WHERE l.workspace_id=? AND l.engagement_id=? ORDER BY l.linked_at DESC LIMIT 500`).bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  const [reviewSubmissions,reviewNotes]=await Promise.all([
    env.DB.prepare(`SELECT s.id,s.target_kind AS targetKind,s.procedure_id AS procedureId,s.workprogram_id AS workprogramId,s.analytical_review_id AS analyticalReviewId,s.going_concern_id AS goingConcernId,s.srm_version_id AS srmVersionId,s.target_version AS targetVersion,json_extract(s.snapshot_json,'$.revision') AS subjectRevision,s.dependency_hash AS dependencyHash,s.submitted_by_actor_id AS submittedByActorId,s.submitted_at AS submittedAt,d.decision,d.comment AS decisionComment,d.decided_at AS decidedAt
      FROM review_submissions s LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.submitted_at DESC LIMIT 500`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT n.id,n.version,n.submission_id AS submissionId,n.procedure_id AS procedureId,n.text,n.assigned_preparer_id AS assignedPreparerId,n.status,n.response_text AS responseText,n.response_at AS responseAt,n.closed_by_actor_id AS closedByActorId,n.closed_at AS closedAt,n.closure_reason AS closureReason,n.resubmission_id AS resubmissionId,n.created_at AS createdAt,s.target_kind AS targetKind,s.workprogram_id AS workprogramId,s.analytical_review_id AS analyticalReviewId,s.going_concern_id AS goingConcernId,s.srm_version_id AS srmVersionId,s.target_version AS targetVersion,
        CASE WHEN n.procedure_id IS NOT NULL AND s.target_kind='WORKPROGRAM' THEN (SELECT json_extract(item.value,'$.version') FROM json_each(s.snapshot_json,'$.procedures') item WHERE json_extract(item.value,'$.id')=n.procedure_id LIMIT 1) ELSE s.target_version END AS procedureTargetVersion,
        json_extract(s.snapshot_json,'$.revision') AS targetRevision
      FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY n.created_at DESC LIMIT 500`).bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  const [confirmations,confirmationFollowups,confirmationAlternatives,confirmationReassessments]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.version,c.type,c.fsli_id AS fsliId,f.code AS fsliCode,c.external_party_name AS externalPartyName,c.external_party_address AS externalPartyAddress,
      c.external_party_email AS externalPartyEmail,c.recipient_verification_text AS recipientVerificationText,c.balance_minor AS balanceMinor,c.critical,c.criticality_reason AS criticalityReason,
      c.status,c.due_date AS dueDate,c.dispatch_id AS dispatchId,d.status AS dispatchStatus,j.status AS jobStatus,
      COALESCE(j.last_error_code,(SELECT q.last_error_code FROM outbox_jobs q WHERE q.workspace_id=c.workspace_id AND q.aggregate_id=c.id AND q.kind='GENERATE_DOCUMENT' ORDER BY q.created_at DESC LIMIT 1)) AS jobError,
      c.response_file_id AS responseFileId,c.returned_at AS returnedAt,c.verified_by_actor_id AS verifiedByActorId,c.verified_at AS verifiedAt,c.verification_rationale AS verificationRationale,
      c.scope_approval_id AS scopeApprovalId,
      c.reliance_frozen AS relianceFrozen,c.source_hash AS sourceHash,c.created_by_actor_id AS createdByActorId,c.created_at AS createdAt,
      (SELECT json_object('id',h.id,'artifactId',h.artifact_id,'dispatchId',h.dispatch_id,'createdAt',h.created_at) FROM holding_letters h
        WHERE h.workspace_id=c.workspace_id AND h.engagement_id=c.engagement_id ORDER BY h.created_at DESC LIMIT 1) AS latestHoldingLetter
      FROM confirmations c JOIN fsli_catalog f ON f.workspace_id=c.workspace_id AND f.id=c.fsli_id
      LEFT JOIN dispatches d ON d.workspace_id=c.workspace_id AND d.id=c.dispatch_id
      LEFT JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
      WHERE c.workspace_id=? AND c.engagement_id=? ORDER BY c.created_at DESC,c.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,confirmation_id AS confirmationId,note,dispatch_id AS dispatchId,followed_at AS followedAt,created_by_actor_id AS createdByActorId
      FROM confirmation_followups WHERE workspace_id=? AND engagement_id=? ORDER BY followed_at DESC,id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,confirmation_id AS confirmationId,evidence_file_id AS evidenceFileId,rationale,recorded_by_actor_id AS recordedByActorId,recorded_at AS recordedAt
      FROM confirmation_alternative_procedures WHERE workspace_id=? AND engagement_id=? ORDER BY recorded_at DESC,id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT r.id,r.prior_confirmation_id AS priorConfirmationId,r.replacement_confirmation_id AS replacementConfirmationId,r.prior_critical AS priorCritical,
      r.replacement_critical AS replacementCritical,r.rationale,r.partner_actor_id AS partnerActorId,r.approved_at AS approvedAt
      FROM confirmation_scope_reassessments r WHERE r.workspace_id=? AND r.engagement_id=? ORDER BY r.approved_at DESC,r.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  const [findings,adjustmentHeads,adjustmentLineResult,adjustmentEvidenceResult,differences,srmVersions,materiality]=await Promise.all([
    env.DB.prepare(`SELECT f.id,f.version,f.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,f.tb_version_id AS tbVersionId,f.mapping_version_id AS mappingVersionId,
      f.materiality_version_id AS materialityVersionId,f.title,f.description,f.severity,f.qualitative_significance AS qualitativeSignificance,f.status,f.client_response AS clientResponse,
      f.client_responded_by_actor_id AS clientRespondedByActorId,f.client_responded_at AS clientRespondedAt,f.resolution,f.source_hash AS sourceHash,f.created_at AS createdAt,f.updated_at AS updatedAt
      FROM findings f JOIN fsli_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.fsli_id WHERE f.workspace_id=? AND f.engagement_id=? ORDER BY f.created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.version,a.number,a.tb_version_id AS tbVersionId,a.mapping_version_id AS mappingVersionId,a.materiality_version_id AS materialityVersionId,a.finding_id AS findingId,
      a.description,a.status,a.reflected_in_source AS reflectedInSource,a.reflected_in_source_reason AS reflectedInSourceReason,a.include_in_statements AS includeInStatements,
      a.client_response_decision AS clientResponse,a.client_response AS clientResponseText,a.client_response_file_id AS clientResponseFileId,a.client_responded_at AS clientRespondedAt,
      a.source_hash AS sourceHash,a.created_by_actor_id AS createdByActorId,a.approved_by_actor_id AS approvedByActorId,a.created_at AS createdAt,a.updated_at AS updatedAt
      FROM audit_adjustments a WHERE a.workspace_id=? AND a.engagement_id=? ORDER BY a.created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.adjustment_id AS adjustmentId,l.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,l.account_code AS accountCode,l.debit_minor AS debitMinor,l.credit_minor AS creditMinor
      FROM audit_adjustment_lines l JOIN audit_adjustments a ON a.workspace_id=l.workspace_id AND a.id=l.adjustment_id JOIN fsli_catalog c ON c.workspace_id=l.workspace_id AND c.id=l.fsli_id
      WHERE l.workspace_id=? AND a.engagement_id=? ORDER BY a.number,l.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.adjustment_id AS adjustmentId,l.evidence_id AS evidenceId,l.evidence_version AS evidenceVersion,l.file_sha256 AS fileSha256,l.source_snapshot_json AS sourceSnapshotJson,
      l.linked_by_actor_id AS linkedByActorId,l.linked_at AS linkedAt FROM audit_adjustment_evidence_links l JOIN audit_adjustments a ON a.workspace_id=l.workspace_id AND a.id=l.adjustment_id
      WHERE l.workspace_id=? AND a.engagement_id=? ORDER BY a.number,l.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT d.id,d.version,d.finding_id AS findingId,d.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,d.tb_version_id AS tbVersionId,d.mapping_version_id AS mappingVersionId,
      d.materiality_version_id AS materialityVersionId,d.amount_minor AS amountMinor,d.nature,d.qualitative_significance AS qualitativeSignificance,d.disposition,
      d.disposition_reason AS dispositionReason,d.adjustment_id AS adjustmentId,d.source_hash AS sourceHash,d.created_at AS createdAt
      FROM audit_differences d JOIN fsli_catalog c ON c.workspace_id=d.workspace_id AND c.id=d.fsli_id WHERE d.workspace_id=? AND d.engagement_id=? ORDER BY d.created_at,d.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT s.id,s.revision,s.planning_version_id AS planningVersionId,s.statement_snapshot_id AS statementSnapshotId,s.signed_unadjusted_minor AS signedUnadjustedMinor,
      s.gross_unadjusted_minor AS grossUnadjustedMinor,s.materiality_snapshot_json AS materialitySnapshotJson,s.findings_snapshot_json AS findingsSnapshotJson,
      s.adjustments_snapshot_json AS adjustmentsSnapshotJson,s.review_snapshot_json AS reviewSnapshotJson,s.estimates_text AS estimatesText,s.going_concern_id AS goingConcernId,
      s.manager_recommendation AS managerRecommendation,s.dependency_hash AS dependencyHash,s.compiled_by_actor_id AS compiledByActorId,s.compiled_at AS compiledAt,
      c.id AS clearanceId,c.partner_actor_id AS partnerActorId,c.rationale AS clearanceRationale,c.signed_at AS clearedAt
      FROM srm_versions s LEFT JOIN srm_clearances c ON c.workspace_id=s.workspace_id AND c.srm_version_id=s.id
      WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.revision DESC,c.signed_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    engagement.active_materiality_version_id?env.DB.prepare(`SELECT id,revision,planning_minor AS planningMinor,performance_minor AS performanceMinor,sad_minor AS sadMinor,source_sha256 AS sourceHash
      FROM materiality_versions WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,engagement.active_materiality_version_id,engagementId).first<Record<string,unknown>>()
      :Promise.resolve(null)
  ]);
  const adjustmentLineMap=new Map<string,Record<string,unknown>[]>();
  for(const line of adjustmentLineResult.results??[]){const rows=adjustmentLineMap.get(String(line.adjustmentId))??[];rows.push(line);adjustmentLineMap.set(String(line.adjustmentId),rows);}
  const adjustmentEvidenceMap=new Map<string,Record<string,unknown>[]>();
  for(const link of adjustmentEvidenceResult.results??[]){const rows=adjustmentEvidenceMap.get(String(link.adjustmentId))??[];rows.push({...link,sourceSnapshot:JSON.parse(String(link.sourceSnapshotJson))});adjustmentEvidenceMap.set(String(link.adjustmentId),rows);}
  const adjustmentRows=(adjustmentHeads.results??[]).map(row=>({...row,lines:adjustmentLineMap.get(String(row.id))??[],evidence:adjustmentEvidenceMap.get(String(row.id))??[]}));
  const srmRows=(srmVersions.results??[]).map(row=>({...row,materialitySnapshot:JSON.parse(String(row.materialitySnapshotJson)),findingsSnapshot:JSON.parse(String(row.findingsSnapshotJson)),adjustmentsSnapshot:JSON.parse(String(row.adjustmentsSnapshotJson)),reviewSnapshot:JSON.parse(String(row.reviewSnapshotJson))}));
  const samplingPlanRows=(plans.results??[]) as unknown as Array<{id:string;populationId:string;policyId:string;policyVersion:number;seedHex:string;revision:number;method:string;confidenceBps:number|null;
    tolerableMinor:number|null;expectedTaintedBps:number|null;requestedCount:number|null;calculatedCount:number;parametersJson:string;inputHash:string;reason:string;createdAt:string;latestResult:string|null}>;
  return {engagement:{id:engagement.id,version:engagement.version,clientId:engagement.client_id,state:engagement.lifecycle_state,periodStart:engagement.period_start,periodEnd:engagement.period_end,standardsProfileId:engagement.standards_profile_id,
      activeTbVersionId:engagement.active_tb_version_id,activeMappingVersionId:engagement.active_mapping_version_id,approvedPlanningVersionId:engagement.approved_planning_version_id},
    staff:staff.results??[],evidenceLinks:evidenceLinks.results??[],
    statements,templates:templates.results??[],analyticalReviews:reviews.results??[],goingConcern:going?{...going,checklist:JSON.parse(String(going.checklistJson))}:null,
    workprograms:programs.results??[],procedures:procedures.results??[],reviewSubmissions:reviewSubmissions.results??[],reviewNotes:reviewNotes.results??[],findings:findings.results??[],adjustments:adjustmentRows,
    differences:differences.results??[],srmVersions:srmRows,materiality,confirmations:confirmations.results??[],confirmationFollowups:confirmationFollowups.results??[],confirmationAlternatives:confirmationAlternatives.results??[],confirmationReassessments:confirmationReassessments.results??[],
    evidence:evidence.results??[],samplingPolicies:policies.results??[],populations:populations.results??[],samplingPlans:samplingPlanRows.map(row=>({...row,parameters:JSON.parse(String(row.parametersJson))})),changeCursor:changes?.cursor??0};
}

export async function getBusinessSamplingPlan(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,planId:string){
  const workspace=await getBusinessFieldworkWorkspace(env,workspaceId,context,engagementId);
  const plan=workspace.samplingPlans.find(item=>item.id===planId);
  if(!plan)throw new ApiError('NOT_FOUND','Sampling plan was not found in this engagement.');
  const [rows,hits,tests,strata,evaluations]=await Promise.all([
    env.DB.prepare(`SELECT r.id,r.source_row_key AS sourceRowKey,r.ordinal,r.book_value_minor AS bookValueMinor,r.eligible,r.exclusion_reason AS exclusionReason,r.stratum_key AS stratumKey,r.source_data_json AS sourceDataJson
      FROM population_rows r JOIN sampling_plans p ON p.workspace_id=r.workspace_id AND p.population_id=r.population_id WHERE r.workspace_id=? AND p.id=? ORDER BY r.ordinal`).bind(workspaceId,planId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT h.draw_number AS drawNumber,h.population_row_id AS populationRowId,h.monetary_unit_minor AS monetaryUnitMinor,h.stratum_key AS stratumKey,r.ordinal,r.source_row_key AS sourceRowKey
      FROM sample_hits h JOIN population_rows r ON r.workspace_id=h.workspace_id AND r.id=h.population_row_id WHERE h.workspace_id=? AND h.plan_id=? ORDER BY h.draw_number`).bind(workspaceId,planId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT t.id,t.version,t.population_row_id AS populationRowId,t.tested,t.audited_value_minor AS auditedValueMinor,t.misstated,t.deviation,t.conclusion,t.evidence_id AS evidenceId,t.evidence_version AS evidenceVersion,t.source_hash AS sourceHash
      FROM sample_tests t WHERE t.workspace_id=? AND t.plan_id=? ORDER BY t.population_row_id`).bind(workspaceId,planId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT s.id,s.key,s.description,s.population_count AS populationCount,s.expected_deviation_bps AS expectedDeviationBps,s.tolerable_deviation_bps AS tolerableDeviationBps,s.sample_count AS sampleCount
      FROM sampling_strata s WHERE s.workspace_id=? AND s.plan_id=? ORDER BY s.key`).bind(workspaceId,planId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,revision,tested_hit_count AS testedHitCount,tainted_hit_count AS taintedHitCount,upper_bound_minor AS upperBoundMinor,result,details_json AS detailsJson,reviewed_at AS reviewedAt
      FROM sampling_evaluations WHERE workspace_id=? AND plan_id=? ORDER BY revision DESC`).bind(workspaceId,planId).all<Record<string,unknown>>()
  ]);
  const testRows=tests.results??[];const testSetHash=await rowHash(testRows.map(row=>({id:row.id,version:row.version,populationRowId:row.populationRowId,tested:row.tested,auditedValueMinor:row.auditedValueMinor,
    misstated:row.misstated,deviation:row.deviation,conclusion:row.conclusion,evidenceId:row.evidenceId,evidenceVersion:row.evidenceVersion,sourceHash:row.sourceHash})));
  return {plan,population:workspace.populations.find(item=>item.id===plan.populationId),rows:(rows.results??[]).map(row=>({...row,sourceData:JSON.parse(String(row.sourceDataJson))})),
    hits:hits.results??[],tests:testRows,testSetHash,strata:strata.results??[],evaluations:(evaluations.results??[]).map(row=>({...row,details:JSON.parse(String(row.detailsJson))}))};
}

export async function getBusinessSamplingPopulation(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,populationId:string){
  const engagement=await getEngagement(env,workspaceId,context,engagementId);
  const population=await env.DB.prepare(`SELECT id,name,client_id AS clientId,engagement_id AS engagementId,source_file_id AS sourceFileId,
      tb_version_id AS tbVersionId,fsli_id AS fsliId,source_hash AS sourceHash,order_hash AS orderHash,row_count AS rowCount,
      positive_total_minor AS positiveTotalMinor,excluded_count AS excludedCount,exclusions_reason AS exclusionsReason
    FROM sample_populations WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,populationId,engagement.id).first<Record<string,unknown>>();
  if(!population)throw new ApiError('NOT_FOUND','The sampling population was not found in this engagement.');
  const rows=await env.DB.prepare(`SELECT id,source_row_key AS sourceRowKey,ordinal,book_value_minor AS bookValueMinor,eligible,
      exclusion_reason AS exclusionReason,source_data_json AS sourceDataJson FROM population_rows WHERE workspace_id=? AND population_id=? ORDER BY ordinal`)
    .bind(workspaceId,populationId).all<Record<string,unknown>>();
  const sourceRows=rows.results??[];
  return {population,rows:sourceRows.map(({sourceDataJson: _sourceDataJson,...row})=>row),sourceOrderPeriodicityFlags:detectSourceOrderPeriodicity(sourceRows.map(row=>({
    eligible:Number(row.eligible),bookValueMinor:Number(row.bookValueMinor),sourceDataJson:String(row.sourceDataJson)
  })))};
}

type SourceOrderPeriodicityFlag={field:'DESCRIPTION'|'BOOK_VALUE_MINOR';periodLength:number;repeatedCycles:number;eligibleOrderStart:number;eligibleOrderEnd:number};

function repeatedPeriodPattern(values:string[]):{periodLength:number;repeatedCycles:number;startIndex:number;endIndex:number}|null{
  const length=values.length;if(length<6||values.every(value=>value===values[0]))return null;
  for(let period=2;period<=Math.min(64,Math.floor(length/3));period++){
    let currentRun=0,currentStart=0,bestRun=0,bestStart=0;
    for(let index=period;index<length;index++){
      if(values[index]===values[index-period]){
        if(currentRun===0)currentStart=index-period;
        currentRun++;
        if(currentRun>bestRun){bestRun=currentRun;bestStart=currentStart;}
      }else currentRun=0;
    }
    if(bestRun>=period*2)return {periodLength:period,repeatedCycles:Math.floor((period+bestRun)/period),startIndex:bestStart,endIndex:bestStart+period+bestRun-1};
  }
  // Also catch longer exact cycles that cover the entire ordered sequence.
  const prefix=new Uint32Array(length);
  for(let index=1,matched=0;index<length;index++){
    while(matched>0&&values[index]!==values[matched])matched=prefix[matched-1];
    if(values[index]===values[matched])matched++;
    prefix[index]=matched;
  }
  const period=length-prefix[length-1];
  if(period<2||Math.floor(length/period)<3)return null;
  for(let index=period;index<length;index++)if(values[index]!==values[index-period])return null;
  return {periodLength:period,repeatedCycles:Math.floor(length/period),startIndex:0,endIndex:length-1};
}

function detectSourceOrderPeriodicity(rows:Array<{eligible:number;bookValueMinor:number;sourceDataJson:string}>):SourceOrderPeriodicityFlag[]{
  const eligible=rows.filter(row=>row.eligible===1);if(eligible.length<6)return [];
  const descriptions=eligible.map(row=>{
    try{return String((JSON.parse(row.sourceDataJson) as {description?:unknown}).description??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
    catch{return '';}
  });
  const flags:SourceOrderPeriodicityFlag[]=[];
  const descriptionPattern=repeatedPeriodPattern(descriptions);
  if(descriptionPattern)flags.push({field:'DESCRIPTION',periodLength:descriptionPattern.periodLength,repeatedCycles:descriptionPattern.repeatedCycles,
    eligibleOrderStart:descriptionPattern.startIndex+1,eligibleOrderEnd:descriptionPattern.endIndex+1});
  const amountPattern=repeatedPeriodPattern(eligible.map(row=>String(row.bookValueMinor)));
  if(amountPattern)flags.push({field:'BOOK_VALUE_MINOR',periodLength:amountPattern.periodLength,repeatedCycles:amountPattern.repeatedCycles,
    eligibleOrderStart:amountPattern.startIndex+1,eligibleOrderEnd:amountPattern.endIndex+1});
  return flags;
}

export async function getBusinessFieldworkChanges(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,after:number,limit:number){
  const engagement=await env.DB.prepare(`SELECT id,client_id,lifecycle_state,locked_at FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,engagementId).first<{id:string;client_id:string;lifecycle_state:string;locked_at:string|null}>();
  if(!engagement)throw new ApiError('NOT_FOUND','The engagement was not found.');
  if((context.scope.clientId&&context.scope.clientId!==engagement.client_id)||(context.scope.engagementId&&context.scope.engagementId!==engagement.id))throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside the selected context.');
  if(context.actor.persona!=='CLIENT')requireInternal(context);
  const take=Math.max(1,Math.min(100,limit));const result=await env.DB.prepare(`SELECT sequence,entity_type AS entityType,entity_id AS entityId,row_version AS rowVersion,engagement_id AS engagementId,changed_at AS changedAt
    FROM fieldwork_change_feed WHERE workspace_id=? AND engagement_id=? AND sequence>? ORDER BY sequence LIMIT ?`)
    .bind(workspaceId,engagementId,Math.max(0,after),take+1).all<Record<string,unknown>>();
  const rows=result.results??[];const hasMore=rows.length>take;const page=rows.slice(0,take);
  const changes=context.actor.persona==='CLIENT'?page.map(row=>({sequence:row.sequence,changedAt:row.changedAt}))
    :page;
  return {changes,nextCursor:page.length?String(page[page.length-1].sequence):String(Math.max(0,after)),hasMore};
}

function commandMutation(statements:D1PreparedStatement[],result:Record<string,unknown>,entityType:string,entityId:string,beforeVersion:number|null,afterVersion:number,auditDetails?:Record<string,unknown>):BusinessMutation{
  return {statements,result,entityType,entityId,beforeVersion,afterVersion,...(auditDetails?{auditDetails}:{})};
}
function versionGuard(env:Env,workspaceId:string,seq:number,table:string,idColumn:string,recordId:string,version:number){
  return env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND ${idColumn}=? AND version=?) THEN 1 ELSE 0 END`)
    .bind(workspaceId,seq,workspaceId,recordId,version);
}
function makeMultiInsertStatements(env:Env,table:string,columns:string[],rows:unknown[][],rowsPerStatement=1000):D1PreparedStatement[]{
  const statements:D1PreparedStatement[]=[];const projection=columns.map((_,index)=>`json_extract(value,'$[${index}]')`).join(',');
  for(let offset=0;offset<rows.length;){
    let end=Math.min(rows.length,offset+rowsPerStatement);let json=JSON.stringify(rows.slice(offset,end));
    while(new TextEncoder().encode(json).byteLength>1_800_000&&end-offset>1){end=offset+Math.max(1,Math.floor((end-offset)/2));json=JSON.stringify(rows.slice(offset,end));}
    if(new TextEncoder().encode(json).byteLength>1_800_000)throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','A source row exceeds the safe D1 bulk-write size. Shorten the source field or split the population before import.');
    statements.push(env.DB.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${projection} FROM json_each(?)`).bind(json));offset=end;
  }
  return statements;
}
async function actorStaff(env:Env,workspaceId:string,context:BusinessContext):Promise<{id:string;grade:string;natural_person_key:string}>{
  const row=await env.DB.prepare(`SELECT s.id,s.grade,s.natural_person_key FROM actor_profiles a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
    WHERE a.workspace_id=? AND a.id=? AND a.active=1 AND s.active=1`).bind(workspaceId,context.actor.id).first<{id:string;grade:string;natural_person_key:string}>();
  if(!row)throw new ApiError('DISABLED_IDENTITY','The internal actor no longer has an active staff record.');
  return row;
}
async function actorNaturalPerson(env:Env,workspaceId:string,actorId:string):Promise<string|null>{
  const row=await env.DB.prepare(`SELECT s.natural_person_key AS naturalPersonKey FROM actor_profiles a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
    WHERE a.workspace_id=? AND a.id=?`).bind(workspaceId,actorId).first<{naturalPersonKey:string}>();
  return row?.naturalPersonKey??null;
}
async function committedEvidenceFile(env:Env,workspaceId:string,engagement:Engagement,fileId:string){
  const row=await env.DB.prepare(`SELECT f.id,f.client_id,f.engagement_id,f.purpose,f.state,f.immutable,f.sha256,f.media_type,f.object_key,f.size_bytes
    FROM file_versions f WHERE f.workspace_id=? AND f.id=?`).bind(workspaceId,fileId).first<{id:string;client_id:string;engagement_id:string;purpose:string;state:string;immutable:number;sha256:string|null;media_type:string;object_key:string;size_bytes:number}>();
  if(!row||row.client_id!==engagement.client_id||row.engagement_id!==engagement.id||row.state!=='COMMITTED'||row.immutable!==1||!row.sha256){
    throw new ApiError('GATE_BLOCKED','Evidence must reference exact committed immutable bytes within this engagement.');
  }
  if(row.purpose==='PBC'){
    const approved=await env.DB.prepare(`SELECT 1 AS ok FROM pbc_submissions s JOIN pbc_reviews r ON r.workspace_id=s.workspace_id AND r.submission_id=s.id AND r.request_id=s.request_id AND r.decision='APPROVE'
      WHERE s.workspace_id=? AND s.file_version_id=? LIMIT 1`).bind(workspaceId,fileId).first<{ok:number}>();
    if(!approved)throw new ApiError('GATE_BLOCKED','A PBC file must have an approved review before it can serve as audit evidence.');
  }else if(row.purpose!=='EVIDENCE')throw new ApiError('VALIDATION_FAILED','Select an EVIDENCE file or an approved PBC submission.');
  return row;
}
async function activeEvidenceForTarget(env:Env,workspaceId:string,kind:'procedure_id'|'analytical_review_id'|'sample_test_id',targetId:string){
  return env.DB.prepare(`SELECT e.id,e.family_id,e.version,l.evidence_version,l.target_version,l.id AS link_id,d.adequacy,f.sha256,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS latest_version
    FROM evidence_links l JOIN evidence_records e ON e.workspace_id=l.workspace_id AND e.id=l.evidence_id
      LEFT JOIN evidence_adequacy_decisions d ON d.workspace_id=e.workspace_id AND d.evidence_id=e.id AND d.id=(SELECT d2.id FROM evidence_adequacy_decisions d2
        WHERE d2.workspace_id=e.workspace_id AND d2.evidence_id=e.id ORDER BY d2.reviewed_at DESC LIMIT 1)
      LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id
      LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id
    WHERE l.workspace_id=? AND l.${kind}=? AND u.id IS NULL ORDER BY l.linked_at,l.id`).bind(workspaceId,targetId)
    .all<{id:string;family_id:string;version:number;evidence_version:number;target_version:number;link_id:string;adequacy:string|null;sha256:string|null;latest_version:number}>();
}
async function evidenceSet(env:Env,workspaceId:string,kind:'procedure_id'|'analytical_review_id'|'sample_test_id',targetId:string,requireAdequate:boolean){
  const result=await activeEvidenceForTarget(env,workspaceId,kind,targetId);const rows=result.results??[];
  const stale=rows.filter(row=>row.evidence_version!==row.version||row.version!==row.latest_version);
  const deficient=rows.filter(row=>row.adequacy!=='ADEQUATE');
  if(stale.length)throw new ApiError('STALE_DEPENDENCY','A linked evidence version has been replaced. Refresh its pin and reassess the affected work.');
  if(requireAdequate&&deficient.length)throw new ApiError('GATE_BLOCKED','All linked evidence must have a current ADEQUATE reviewer decision.');
  return {rows,hash:await pinHash(rows.map(row=>({evidenceId:row.id,evidenceVersion:row.version,sha256:row.sha256,adequacy:row.adequacy}))),adequate:rows.filter(row=>row.adequacy==='ADEQUATE').length};
}
export async function assertProcedureEvidenceCurrent(env:Env,workspaceId:string,procedureId:string,recordedEvidenceHash:unknown){
  const current=await evidenceSet(env,workspaceId,'procedure_id',procedureId,false);
  if(current.hash!==String(recordedEvidenceHash))throw new ApiError('STALE_DEPENDENCY','Procedure evidence changed after review. Reassess the evidence and procedure before clearance.');
  return current;
}
type ProcedureSamplingPin={planId:string;planRevision:number;populationId:string;populationSourceHash:string;populationTbVersionId:string;policyId:string;policyVersion:number;
  inputHash:string;evaluationId:string;evaluationRevision:number;testSetHash:string;result:string;selectedDrawCount:number;testedHitCount:number};
export async function procedureSamplingPins(env:Env,workspaceId:string,procedureId:string,activeTbVersionId:string,requireComplete:boolean):Promise<ProcedureSamplingPin[]>{
  const plans=await env.DB.prepare(`SELECT p.id AS planId,p.revision AS planRevision,p.policy_id AS policyId,p.policy_version AS policyVersion,p.input_hash AS inputHash,
      pop.id AS populationId,pop.source_hash AS populationSourceHash,pop.tb_version_id AS populationTbVersionId,
      (SELECT e.id FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS evaluationId,
      (SELECT e.revision FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS evaluationRevision,
      (SELECT e.result FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS result,
      (SELECT e.details_json FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS evaluationDetails,
      (SELECT COUNT(*) FROM sample_hits h WHERE h.workspace_id=p.workspace_id AND h.plan_id=p.id) AS selectedDrawCount,
      (SELECT e.tested_hit_count FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS testedHitCount
    FROM sampling_plan_procedure_links l JOIN sampling_plans p ON p.workspace_id=l.workspace_id AND p.id=l.plan_id
      JOIN sample_populations pop ON pop.workspace_id=p.workspace_id AND pop.id=p.population_id
    WHERE l.workspace_id=? AND l.procedure_id=? ORDER BY p.created_at,p.id`).bind(workspaceId,procedureId).all<Record<string,unknown>>();
  const pins:ProcedureSamplingPin[]=[];
  for(const plan of plans.results??[]){
    if(String(plan.populationTbVersionId)!==activeTbVersionId)throw new ApiError('STALE_DEPENDENCY','A linked sample plan uses a replaced trial-balance population. Re-import and retest the current population before submission.');
    const [hitRows,testRows]=await Promise.all([
      env.DB.prepare(`SELECT population_row_id AS populationRowId FROM sample_hits WHERE workspace_id=? AND plan_id=? ORDER BY draw_number`).bind(workspaceId,plan.planId).all<{populationRowId:string}>(),
      env.DB.prepare(`SELECT id,version,population_row_id AS populationRowId,tested,audited_value_minor AS auditedValueMinor,misstated,deviation,conclusion,evidence_id AS evidenceId,evidence_version AS evidenceVersion,source_hash AS sourceHash
        FROM sample_tests WHERE workspace_id=? AND plan_id=? ORDER BY population_row_id`).bind(workspaceId,plan.planId).all<Record<string,unknown>>()
    ]);
    const tests=testRows.results??[];const hits=hitRows.results??[];
    const testSetHash=await rowHash(tests.map(row=>({id:row.id,version:row.version,populationRowId:row.populationRowId,tested:row.tested,auditedValueMinor:row.auditedValueMinor,
      misstated:row.misstated,deviation:row.deviation,conclusion:row.conclusion,evidenceId:row.evidenceId,evidenceVersion:row.evidenceVersion,sourceHash:row.sourceHash})));
    const testByPopulationRow=new Map(tests.map(row=>[String(row.populationRowId),row]));
    const missing=[...new Set(hits.map(row=>row.populationRowId))].filter(row=>Number(testByPopulationRow.get(row)?.tested)!==1);
    const evaluationDetails=plan.evaluationDetails?JSON.parse(String(plan.evaluationDetails)) as {testSetHash?:string}:null;
    if(requireComplete){
      if(missing.length||!plan.evaluationId||!evaluationDetails||evaluationDetails.testSetHash!==testSetHash||plan.result==='INCOMPLETE')
        throw new ApiError('GATE_BLOCKED',`Complete and evaluate every selected sample in linked plan ${String(plan.planId)} before procedure submission.`);
      if(String(plan.result)==='OUTSIDE_ASSUMPTIONS')throw new ApiError('GATE_BLOCKED',`Linked sample plan ${String(plan.planId)} is outside its approved assumptions and needs reviewer disposition before procedure submission.`);
    }else if(!plan.evaluationId||!evaluationDetails||evaluationDetails.testSetHash!==testSetHash){
      throw new ApiError('STALE_DEPENDENCY',`The completed sample set in plan ${String(plan.planId)} changed after its evaluation.`);
    }
    const staleEvidence=await env.DB.prepare(`SELECT t.id FROM sample_tests t LEFT JOIN evidence_records e ON e.workspace_id=t.workspace_id AND e.id=t.evidence_id
        LEFT JOIN evidence_adequacy_decisions d ON d.workspace_id=t.workspace_id AND d.evidence_id=t.evidence_id AND d.evidence_version=t.evidence_version
          AND d.id=(SELECT d2.id FROM evidence_adequacy_decisions d2 WHERE d2.workspace_id=t.workspace_id AND d2.evidence_id=t.evidence_id AND d2.evidence_version=t.evidence_version ORDER BY d2.reviewed_at DESC LIMIT 1)
      WHERE t.workspace_id=? AND t.plan_id=? AND t.tested=1 AND (
        t.evidence_id IS NULL OR t.evidence_version IS NULL OR e.id IS NULL OR e.version<>t.evidence_version OR
        e.version<>(SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) OR COALESCE(d.adequacy,'')<>'ADEQUATE' OR
        NOT EXISTS(SELECT 1 FROM evidence_links el LEFT JOIN evidence_unlinks eu ON eu.workspace_id=el.workspace_id AND eu.evidence_link_id=el.id
          WHERE el.workspace_id=t.workspace_id AND el.sample_test_id=t.id AND el.evidence_id=t.evidence_id AND el.evidence_version=t.evidence_version AND el.target_version=t.version AND eu.id IS NULL)
      ) LIMIT 1`).bind(workspaceId,plan.planId).first<{id:string}>();
    if(staleEvidence)throw new ApiError('STALE_DEPENDENCY',`Sample test ${staleEvidence.id} no longer has current adequate evidence.`);
    pins.push({planId:String(plan.planId),planRevision:Number(plan.planRevision),populationId:String(plan.populationId),populationSourceHash:String(plan.populationSourceHash),
      populationTbVersionId:String(plan.populationTbVersionId),policyId:String(plan.policyId),policyVersion:Number(plan.policyVersion),inputHash:String(plan.inputHash),
      evaluationId:String(plan.evaluationId),evaluationRevision:Number(plan.evaluationRevision),testSetHash,result:String(plan.result),selectedDrawCount:Number(plan.selectedDrawCount),testedHitCount:Number(plan.testedHitCount)});
  }
  return pins;
}
function pushChange(env:Env,workspaceId:string,engagementId:string,entityType:string,entityId:string,rowVersion:number,now:string){
  return env.DB.prepare(`INSERT INTO fieldwork_change_feed(workspace_id,sequence,entity_type,entity_id,row_version,engagement_id,changed_at)
    SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,?,? FROM fieldwork_change_feed WHERE workspace_id=?`)
    .bind(workspaceId,entityType,entityId,rowVersion,engagementId,now,workspaceId);
}
async function currentProcedure(env:Env,workspaceId:string,procedureId:string){
  const row=await env.DB.prepare(`SELECT p.id,p.version,p.workprogram_id,p.ordinal,p.title,p.instructions,p.assertion,p.origin,p.mandatory,p.scope_reason,p.work_performed,p.conclusion,p.applicable,
      p.prepared_by_staff_id,p.executed_by_staff_id,
      p.not_applicable_reason,p.status,p.source_hash,p.evidence_set_hash,w.client_id,w.engagement_id,w.fsli_id,w.risk_band,w.assigned_staff_id,w.planning_version_id,e.approved_planning_version_id,e.lifecycle_state,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id
    FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id
      JOIN engagements e ON e.workspace_id=w.workspace_id AND e.id=w.engagement_id WHERE p.workspace_id=? AND p.id=?`)
    .bind(workspaceId,procedureId).first<Record<string,unknown>>();
  if(!row)throw new ApiError('NOT_FOUND','Procedure was not found.');
  return row;
}
async function verifyProcedureScope(context:BusinessContext,row:Record<string,unknown>){
  if((context.scope.clientId&&context.scope.clientId!==row.client_id)||(context.scope.engagementId&&context.scope.engagementId!==row.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Procedure is outside the selected engagement.');
  if(row.lifecycle_state==='ARCHIVED_READ_ONLY'||row.approved_planning_version_id!==row.planning_version_id)throw new ApiError('STALE_DEPENDENCY','The workprogram does not use the current approved planning version.');
}

async function saveStatementSnapshot(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'statement.snapshot'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const view=await financialStatements(env,workspaceId,context,command.payload.engagementId);
  const existing=await env.DB.prepare(`SELECT id FROM statement_snapshots WHERE workspace_id=? AND engagement_id=? AND source_hash=?`)
    .bind(workspaceId,command.payload.engagementId,view.sourceHash).first<{id:string}>();
  if(existing)return commandMutation([],{statementSnapshotId:existing.id,sourceHash:view.sourceHash,lineCount:view.profitLoss.length+view.balanceSheet.length,reused:true},'STATEMENT_SNAPSHOT',existing.id,null,1);
  const engagement=await getEngagement(env,workspaceId,context,command.payload.engagementId);const snapshotId=crypto.randomUUID();
  const lineRows=[...view.profitLoss,...view.balanceSheet].map(line=>[crypto.randomUUID(),workspaceId,snapshotId,line.fsliId,line.currentBaseMinor,line.currentAdjustmentMinor,line.currentAdjustedMinor,
    line.priorMinor,line.varianceNumerator,line.varianceDenominator,line.varianceReason,line.riskBand]);
  const statements:D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO statement_snapshots(id,workspace_id,client_id,engagement_id,tb_version_id,mapping_version_id,adjustment_set_hash,standards_profile_id,source_hash,generated_at,generated_by_actor_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(snapshotId,workspaceId,engagement.client_id,engagement.id,engagement.active_tb_version_id,engagement.active_mapping_version_id,view.adjustmentSetHash,engagement.standards_profile_id,view.sourceHash,now,context.actor.id),
    ...makeMultiInsertStatements(env,'statement_snapshot_lines',['id','workspace_id','snapshot_id','fsli_id','current_base_minor','current_adjustment_minor','current_adjusted_minor','prior_minor','variance_numerator','variance_denominator','variance_reason','risk_band'],lineRows)
  ];
  return commandMutation(statements,{statementSnapshotId:snapshotId,sourceHash:view.sourceHash,lineCount:lineRows.length},'STATEMENT_SNAPSHOT',snapshotId,null,1,{tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id});
}

async function saveAnalyticalReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'analytical-review.save'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);const view=await financialStatements(env,workspaceId,context,p.engagementId);
  const snapshot=await env.DB.prepare(`SELECT source_hash FROM statement_snapshots WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,p.statementSnapshotId,p.engagementId).first<{source_hash:string}>();
  if(!snapshot||snapshot.source_hash!==view.sourceHash)throw new ApiError('STALE_DEPENDENCY','Create a current statement snapshot before drafting an analytical review.');
  const line=[...view.profitLoss,...view.balanceSheet].find(item=>item.fsliId===p.fsliId);if(!line)throw new ApiError('NOT_FOUND','FSLI was not found on the current statement.');
  const reviewSourceHash=await rowHash({snapshot:snapshot.source_hash,fsliId:p.fsliId,expectation:p.expectationText,thresholdMinor:p.thresholdMinor??null,thresholdBps:p.thresholdBps??null,ratios:p.ratios});
  const ratioStatements=(reviewId:string)=>p.ratios.map(ratio=>{
    const numerator=moneyMinor(ratio.numeratorMinor);const denominator=moneyMinor(ratio.denominatorMinor);const undefinedReason=denominator===0?'ZERO_DENOMINATOR':null;
    return env.DB.prepare(`INSERT INTO analytical_ratios(id,workspace_id,analytical_review_id,name,numerator_minor,denominator_minor,result_numerator,result_denominator,undefined_reason,numerator_source,denominator_source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,reviewId,ratio.name,numerator,denominator,undefinedReason?null:String(numerator),undefinedReason?null:String(denominator),undefinedReason,ratio.numeratorSource,ratio.denominatorSource);});
  if(p.analyticalReviewId){
    const existing=await env.DB.prepare(`SELECT id,version,status,client_id,engagement_id FROM analytical_reviews WHERE workspace_id=? AND id=?`).bind(workspaceId,p.analyticalReviewId)
      .first<{id:string;version:number;status:string;client_id:string;engagement_id:string}>();
    if(!existing)throw new ApiError('NOT_FOUND','The analytical review to revise was not found.');
    if(existing.engagement_id!==p.engagementId||existing.client_id!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','The analytical review is outside the selected engagement.');
    if(existing.status!=='DRAFT'&&existing.status!=='UNDER_REWORK')throw new ApiError('INVALID_STATE','Only a draft or returned analytical review can be revised and resubmitted.');
    const expectedVersion=p.expectedVersion as number;
    if(Number(existing.version)!==expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AnalyticalReview',id:existing.id,expectedVersion,currentVersion:existing.version}));
    const nextVersion=expectedVersion+1;
    const revisedStatements:D1PreparedStatement[]=[versionGuard(env,workspaceId,990,'analytical_reviews','id',existing.id,expectedVersion),
      env.DB.prepare(`UPDATE analytical_reviews SET version=?,fsli_id=?,statement_snapshot_id=?,expectation_text=?,threshold_minor=?,threshold_bps=?,explanation=?,conclusion=?,status='DRAFT',source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status IN ('DRAFT','UNDER_REWORK')`)
        .bind(nextVersion,p.fsliId,p.statementSnapshotId,p.expectationText,p.thresholdMinor??null,p.thresholdBps??null,p.explanation??null,p.conclusion??null,reviewSourceHash,now,workspaceId,existing.id,expectedVersion),
      env.DB.prepare(`DELETE FROM analytical_ratios WHERE workspace_id=? AND analytical_review_id=?`).bind(workspaceId,existing.id),
      ...ratioStatements(existing.id)];
    return commandMutation(revisedStatements,{analyticalReviewId:existing.id,version:nextVersion,revised:true,fsli:{id:line.fsliId,code:line.code},sourceHash:reviewSourceHash,variancePercent:line.variancePercent,varianceReason:line.varianceReason},
      'ANALYTICAL_REVIEW',existing.id,expectedVersion,nextVersion);
  }
  const reviewId=crypto.randomUUID();
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO analytical_reviews(id,workspace_id,version,client_id,engagement_id,fsli_id,statement_snapshot_id,expectation_text,threshold_minor,threshold_bps,explanation,conclusion,status,prepared_by_actor_id,source_hash,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?)`).bind(reviewId,workspaceId,engagement.client_id,engagement.id,p.fsliId,p.statementSnapshotId,p.expectationText,p.thresholdMinor??null,p.thresholdBps??null,p.explanation??null,p.conclusion??null,context.actor.id,reviewSourceHash,now,now),
    ...ratioStatements(reviewId)];
  return commandMutation(statements,{analyticalReviewId:reviewId,version:1,fsli:{id:line.fsliId,code:line.code},sourceHash:reviewSourceHash,variancePercent:line.variancePercent,varianceReason:line.varianceReason},'ANALYTICAL_REVIEW',reviewId,null,1);
}

async function submitAnalyticalReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'analytical-review.submit'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const review=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,fsli_id,statement_snapshot_id,expectation_text,threshold_minor,threshold_bps,explanation,conclusion,status,source_hash,prepared_by_actor_id
    FROM analytical_reviews WHERE workspace_id=? AND id=?`).bind(workspaceId,p.analyticalReviewId).first<Record<string,unknown>>();
  if(!review)throw new ApiError('NOT_FOUND','Analytical review was not found.');
  if(Number(review.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AnalyticalReview',id:review.id,expectedVersion:p.expectedVersion,currentVersion:review.version}));
  const engagement=await getEngagement(env,workspaceId,context,String(review.engagement_id));if(engagement.client_id!==review.client_id)throw new ApiError('FORBIDDEN_SCOPE','Analytical review is outside the engagement.');
  if(review.status!=='DRAFT'&&review.status!=='UNDER_REWORK')throw new ApiError('INVALID_STATE','Only a draft analytical review can be submitted.');
  const view=await financialStatements(env,workspaceId,context,engagement.id);const snapshot=await env.DB.prepare(`SELECT source_hash FROM statement_snapshots WHERE workspace_id=? AND id=?`).bind(workspaceId,review.statement_snapshot_id).first<{source_hash:string}>();
  if(snapshot?.source_hash!==view.sourceHash)throw new ApiError('STALE_DEPENDENCY','The statement source changed after this review was drafted. Rebuild the analysis on a current snapshot.');
  const support=await evidenceSet(env,workspaceId,'analytical_review_id',p.analyticalReviewId,true);
  if(support.rows.some(item=>item.target_version!==p.expectedVersion))throw new ApiError('STALE_DEPENDENCY','Analytical-review evidence is linked to an older review version. Re-link it to the current analysis.');
  const missingFields:string[]=[];
  if(!review.explanation||String(review.explanation).trim().length<10)missingFields.push('explanation');
  if(!review.conclusion||String(review.conclusion).trim().length<10)missingFields.push('conclusion');
  if(!support.adequate)missingFields.push('supportingEvidence');
  if(missingFields.length)throw new ApiError('VALIDATION_FAILED','Complete the explanation, conclusion and current supporting evidence before submitting the analytical review.',{missingFields});
  const dependencyHash=await rowHash({sourceHash:review.source_hash,evidenceHash:support.hash,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id});
  const preparer=await env.DB.prepare(`SELECT staff_member_id AS staffMemberId FROM actor_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,review.prepared_by_actor_id).first<{staffMemberId:string}>();
  const nextVersion=p.expectedVersion+1;
  return createReviewSubmission(env,workspaceId,context,'ANALYTICAL_REVIEW',p.analyticalReviewId,nextVersion,dependencyHash,{...review,evidenceSetHash:support.hash,statementSourceHash:view.sourceHash},preparer?.staffMemberId?[preparer.staffMemberId]:[],engagement,now,[
    versionGuard(env,workspaceId,990,'analytical_reviews','id',p.analyticalReviewId,p.expectedVersion),
    env.DB.prepare(`UPDATE analytical_reviews SET version=?,status='SUBMITTED',updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,now,workspaceId,p.analyticalReviewId,p.expectedVersion)
  ]);
}

async function saveGoingConcern(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'going-concern.save'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  const profile=await env.DB.prepare(`SELECT isa_570_edition FROM standards_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,engagement.standards_profile_id).first<{isa_570_edition:string}>();
  if(!profile)throw new ApiError('STALE_DEPENDENCY','The engagement standards profile is missing.');
  if(!isIsa570EditionCompatible(engagement.period_start,profile.isa_570_edition))throw new ApiError('STANDARDS_PROFILE_INCOMPATIBLE','Periods beginning on or after 15 December 2026 require an approved ISA 570 (Revised 2024) profile.');
  if(p.assessmentEnd<engagement.period_end)throw new ApiError('VALIDATION_FAILED','The going-concern assessment horizon must include the engagement period end.');
  const files=new Set<string>(p.evidenceFileIds);if(p.managementAssessmentFileId)files.add(p.managementAssessmentFileId);
  const evidencePins=[] as Array<{id:string;sha256:string}>;
  for(const fileId of files){const file=await committedEvidenceFile(env,workspaceId,engagement,fileId);evidencePins.push({id:file.id,sha256:String(file.sha256)});}
  if((p.checklist.managementAssessment||p.checklist.cashFlowForecasts)&&!p.managementAssessmentFileId)throw new ApiError('VALIDATION_FAILED','A checked management assessment or cash-flow forecast must link to committed source evidence.');
  if(!p.checklist.cashFlowForecasts&&p.conclusion==='NO_MATERIAL_UNCERTAINTY'&&!p.mitigatingPlansText.trim())throw new ApiError('VALIDATION_FAILED','Explain missing cash-flow forecasts and the basis for the explicit going-concern conclusion.');
  if(p.conclusion==='MATERIAL_UNCERTAINTY'&&!p.eventsText.trim()&&!p.mitigatingPlansText.trim())throw new ApiError('VALIDATION_FAILED','Document the adverse events or mitigating plans supporting material uncertainty.');
  const previous=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM going_concern_assessments WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{revision:number}>();
  const assessmentId=crypto.randomUUID();const revision=(previous?.revision??0)+1;const sourceHash=await rowHash({engagementId:engagement.id,period:[engagement.period_start,engagement.period_end],standardsProfileId:engagement.standards_profile_id,edition:profile.isa_570_edition,
    assessmentPeriod:[p.assessmentStart,p.assessmentEnd],checklist:p.checklist,files:evidencePins,events:p.eventsText,plans:p.mitigatingPlansText,conclusion:p.conclusion,rationale:p.rationale});
  const statement=env.DB.prepare(`INSERT INTO going_concern_assessments(id,workspace_id,version,client_id,engagement_id,revision,standards_profile_id,isa_570_edition,assessment_start,assessment_end,management_assessment_file_id,evidence_file_ids_json,checklist_json,events_text,mitigating_plans_text,conclusion,rationale,status,source_hash,prepared_by_actor_id,created_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,'DRAFT',?,?,?)`).bind(assessmentId,workspaceId,engagement.client_id,engagement.id,revision,engagement.standards_profile_id,profile.isa_570_edition,p.assessmentStart,p.assessmentEnd,p.managementAssessmentFileId??null,JSON.stringify([...files]),JSON.stringify(p.checklist),p.eventsText,p.mitigatingPlansText,p.conclusion,p.rationale,sourceHash,context.actor.id,now);
  return commandMutation([statement],{assessmentId,version:1,revision,edition:profile.isa_570_edition,status:'DRAFT',sourceHash,blockers:[]},'GOING_CONCERN_ASSESSMENT',assessmentId,null,1);
}

async function createWorkprogramTemplate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'workprogram.template.create'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND code=? AND active=1`).bind(workspaceId,p.fsliCode).first<{id:string}>();
  if(!fsli)throw new ApiError('NOT_FOUND','The FSLI code does not exist in this workspace.');
  const profile=await env.DB.prepare(`SELECT id FROM standards_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,p.standardsProfileId).first<{id:string}>();if(!profile)throw new ApiError('NOT_FOUND','The approved standards profile was not found.');
  const prior=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM workprogram_templates WHERE workspace_id=? AND fsli_code=? AND standards_profile_id=?`).bind(workspaceId,p.fsliCode,p.standardsProfileId).first<{revision:number}>();
  const templateId=crypto.randomUUID();const revision=(prior?.revision??0)+1;const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO workprogram_templates(id,workspace_id,version,fsli_code,revision,title,standards_profile_id,procedures_json,status,approved_by_actor_id,approved_at,created_by_actor_id,created_at)
    VALUES(?,?,1,?,?,?,?,?,'DRAFT',NULL,NULL,?,?)`).bind(templateId,workspaceId,p.fsliCode,revision,p.title,p.standardsProfileId,JSON.stringify(p.procedures),context.actor.id,now)];
  p.procedures.forEach((step,index)=>statements.push(env.DB.prepare(`INSERT INTO procedure_templates(id,workspace_id,template_id,ordinal,title,instructions,assertion,mandatory) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,templateId,index+1,step.title,step.instructions,step.assertion,step.mandatory?1:0)));
  return commandMutation(statements,{templateId,version:1,revision,status:'DRAFT',procedureCount:p.procedures.length},'WORKPROGRAM_TEMPLATE',templateId,null,1);
}

async function approveWorkprogramTemplate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'workprogram.template.approve'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const row=await env.DB.prepare(`SELECT version,status FROM workprogram_templates WHERE workspace_id=? AND id=?`).bind(workspaceId,p.templateId).first<{version:number;status:string}>();
  if(!row)throw new ApiError('NOT_FOUND','The workprogram template was not found.');if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'WorkprogramTemplate',id:p.templateId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='DRAFT')throw new ApiError('INVALID_STATE','Only a draft template can receive initial approval.');
  return commandMutation([versionGuard(env,workspaceId,990,'workprogram_templates','id',p.templateId,p.expectedVersion),env.DB.prepare(`UPDATE workprogram_templates SET version=version+1,status='APPROVED',approved_by_actor_id=?,approved_at=? WHERE workspace_id=? AND id=? AND version=?`)
    .bind(context.actor.id,now,workspaceId,p.templateId,p.expectedVersion)],{templateId:p.templateId,version:p.expectedVersion+1,status:'APPROVED'},'WORKPROGRAM_TEMPLATE',p.templateId,p.expectedVersion,p.expectedVersion+1);
}

async function provisionWorkprogram(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'workprogram.provision'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  if(engagement.approved_planning_version_id!==p.planningVersionId)throw new ApiError('STALE_DEPENDENCY','Workprograms must pin the current approved planning version.');
  const existing=await env.DB.prepare(`SELECT id FROM workprograms WHERE workspace_id=? AND engagement_id=? AND fsli_id=?`).bind(workspaceId,p.engagementId,p.fsliId).first<{id:string}>();
  if(existing)throw new ApiError('VERSION_CONFLICT','This FSLI already has a workprogram. Reopen its current procedure rows rather than provision a duplicate.');
  const [catalog,template,staff,risk]=await Promise.all([
    env.DB.prepare(`SELECT id,code FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string;code:string}>(),
    env.DB.prepare(`SELECT id,fsli_code,standards_profile_id,status FROM workprogram_templates WHERE workspace_id=? AND id=?`).bind(workspaceId,p.templateId).first<{id:string;fsli_code:string;standards_profile_id:string;status:string}>(),
    env.DB.prepare(`SELECT id,grade FROM staff_members WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.assignedStaffId).first<{id:string;grade:string}>(),
    env.DB.prepare(`SELECT band FROM fsli_risks WHERE workspace_id=? AND engagement_id=? AND fsli_id=? AND materiality_version_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,p.engagementId,p.fsliId,engagement.active_materiality_version_id).first<{band:string}>()
  ]);
  if(!catalog||!template||template.status!=='APPROVED'||template.fsli_code!==catalog.code||template.standards_profile_id!==engagement.standards_profile_id)throw new ApiError('GATE_BLOCKED','Select an approved versioned template for this FSLI and standards profile.');
  if(!staff)throw new ApiError('NOT_FOUND','The assigned active staff member was not found.');const band=risk?.band??'GREEN';
  if(band==='RED'&&staff.grade!=='MANAGER'&&staff.grade!=='PARTNER')throw new ApiError('PERSONA_ACTION_DENIED','Red-risk execution must be assigned to a Manager-grade staff member.');
  const templateSteps=await env.DB.prepare(`SELECT id,ordinal,title,instructions,assertion,mandatory FROM procedure_templates WHERE workspace_id=? AND template_id=? ORDER BY ordinal`).bind(workspaceId,p.templateId).all<Record<string,unknown>>();
  if(!templateSteps.results?.length)throw new ApiError('GATE_BLOCKED','The approved template has no procedure steps.');
  const programId=crypto.randomUUID();const sourceHash=await rowHash({engagementId:p.engagementId,planningVersionId:p.planningVersionId,fsliId:p.fsliId,templateId:p.templateId,riskBand:band,assignedStaffId:p.assignedStaffId});
  const procedureIds:string[]=[];
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO workprograms(id,workspace_id,version,client_id,engagement_id,fsli_id,template_id,planning_version_id,risk_band,assigned_staff_id,status,source_hash,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,'IN_PROGRESS',?,?,?,?)`).bind(programId,workspaceId,engagement.client_id,engagement.id,p.fsliId,p.templateId,p.planningVersionId,band,p.assignedStaffId,sourceHash,context.actor.id,now,now)];
  for(const step of templateSteps.results){
    const procedureId=crypto.randomUUID();procedureIds.push(procedureId);const versionSource=await rowHash({programId,stepId:step.id,title:step.title,instructions:step.instructions,assertion:step.assertion,band});
    const snapshot={version:1,workprogramId:programId,templateStepId:step.id,ordinal:step.ordinal,title:step.title,instructions:step.instructions,assertion:step.assertion,origin:'STANDARD',mandatory:step.mandatory,workPerformed:null,conclusion:null,applicable:true,status:'NOT_STARTED'};
    statements.push(env.DB.prepare(`INSERT INTO procedures(id,workspace_id,version,workprogram_id,template_step_id,ordinal,title,instructions,assertion,origin,mandatory,scope_reason,work_performed,conclusion,applicable,not_applicable_reason,status,prepared_by_staff_id,executed_by_staff_id,evidence_set_hash,source_hash,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,? ,?,'STANDARD',?,NULL,NULL,NULL,1,NULL,'NOT_STARTED',NULL,NULL,?,?,?,?)`).bind(procedureId,workspaceId,programId,step.id,step.ordinal,step.title,step.instructions,step.assertion,step.mandatory,await rowHash([]),versionSource,now,now));
    statements.push(env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,NULL)`)
      .bind(crypto.randomUUID(),workspaceId,procedureId,1,JSON.stringify(snapshot),await rowHash([]),context.actor.id,now));
    statements.push(pushChange(env,workspaceId,engagement.id,'Procedure',procedureId,1,now));
  }
  return commandMutation(statements,{workprogramId:programId,procedureIds,procedureCount:templateSteps.results.length,sourceHash},'WORKPROGRAM',programId,null,1,{planningVersionId:p.planningVersionId,templateId:p.templateId,riskBand:band});
}

async function insertProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.insert'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const program=await env.DB.prepare(`SELECT w.id,w.client_id,w.engagement_id,w.fsli_id,w.planning_version_id,w.risk_band,w.status,e.approved_planning_version_id,e.lifecycle_state,e.locked_at
    FROM workprograms w JOIN engagements e ON e.workspace_id=w.workspace_id AND e.id=w.engagement_id WHERE w.workspace_id=? AND w.id=?`).bind(workspaceId,p.workprogramId).first<Record<string,unknown>>();
  if(!program)throw new ApiError('NOT_FOUND','Workprogram was not found.');if((context.scope.clientId&&context.scope.clientId!==program.client_id)||(context.scope.engagementId&&context.scope.engagementId!==program.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Workprogram is outside the selected scope.');
  if(program.locked_at||program.lifecycle_state==='ARCHIVED_READ_ONLY'||program.approved_planning_version_id!==program.planning_version_id)throw new ApiError('STALE_DEPENDENCY','The workprogram is locked or its planning source is stale.');
  if(['SUBMITTED','REVIEWED','PARTNER_CLEARED'].includes(String(program.status)))throw new ApiError('INVALID_STATE','A submitted workprogram must be returned for rework before its scope changes.');
  const steps=await env.DB.prepare(`SELECT id,ordinal FROM procedures WHERE workspace_id=? AND workprogram_id=? ORDER BY ordinal`).bind(workspaceId,p.workprogramId).all<{id:string;ordinal:number}>();
  let ordinal=(steps.results??[]).length+1;const statements:D1PreparedStatement[]=[];
  const shiftedProcedures:Array<{row:Record<string,unknown>;nextOrdinal:number;nextVersion:number;evidenceHash:string;sourceHash:string;content:Record<string,unknown>}>=[];
  if(p.afterProcedureId){const after=(steps.results??[]).find(item=>item.id===p.afterProcedureId);if(!after)throw new ApiError('NOT_FOUND','The procedure selected as the insertion point was not found.');ordinal=after.ordinal+1;
    const affected=(steps.results??[]).filter(item=>item.ordinal>=ordinal).sort((left,right)=>left.ordinal-right.ordinal);
    for(const item of affected){
      const row=await currentProcedure(env,workspaceId,item.id);
      if(!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(String(row.status)))throw new ApiError('INVALID_STATE','Return every affected submitted or reviewed procedure for rework before changing workprogram order.');
      const evidence=await evidenceSet(env,workspaceId,'procedure_id',item.id,false);const nextOrdinal=Number(row.ordinal)+1;const nextVersion=Number(row.version)+1;
      const content={procedureId:item.id,workprogramId:p.workprogramId,ordinal:nextOrdinal,title:row.title,instructions:row.instructions,assertion:row.assertion,origin:row.origin,mandatory:row.mandatory,
        scopeReason:row.scope_reason,workPerformed:row.work_performed,conclusion:row.conclusion,applicable:Boolean(row.applicable),notApplicableReason:row.not_applicable_reason,status:row.status,
        preparedByStaffId:row.prepared_by_staff_id,executedByStaffId:row.executed_by_staff_id};
      const sourceHash=await rowHash({content,evidence:evidence.hash,planningVersionId:row.planning_version_id,tbVersionId:row.active_tb_version_id,mappingVersionId:row.active_mapping_version_id});
      shiftedProcedures.push({row,nextOrdinal,nextVersion,evidenceHash:evidence.hash,sourceHash,content});
    }
    if(shiftedProcedures.length)statements.push(env.DB.prepare(`UPDATE procedures SET ordinal=ordinal+1000000 WHERE workspace_id=? AND workprogram_id=? AND ordinal>=?`).bind(workspaceId,p.workprogramId,ordinal));
    shiftedProcedures.forEach((shifted,index)=>{
      const id=String(shifted.row.id);const oldVersion=Number(shifted.row.version);
      statements.push(versionGuard(env,workspaceId,700+index,'procedures','id',id,oldVersion));
      statements.push(env.DB.prepare(`UPDATE procedures SET version=?,ordinal=?,evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
        .bind(shifted.nextVersion,shifted.nextOrdinal,shifted.evidenceHash,shifted.sourceHash,now,workspaceId,id,oldVersion));
      statements.push(env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(),workspaceId,id,shifted.nextVersion,JSON.stringify({...shifted.content,version:shifted.nextVersion}),shifted.evidenceHash,context.actor.id,now,p.scopeReason));
      statements.push(pushChange(env,workspaceId,String(program.engagement_id),'Procedure',id,shifted.nextVersion,now));
    });
  }
  const procedureId=crypto.randomUUID();const emptyHash=await rowHash([]);const content={version:1,workprogramId:p.workprogramId,ordinal,title:p.title,instructions:p.instructions,assertion:p.assertion,origin:'AD_HOC',mandatory:true,scopeReason:p.scopeReason,workPerformed:null,conclusion:null,applicable:true,status:'NOT_STARTED'};const sourceHash=await rowHash(content);
  statements.push(env.DB.prepare(`INSERT INTO procedures(id,workspace_id,version,workprogram_id,template_step_id,ordinal,title,instructions,assertion,origin,mandatory,scope_reason,work_performed,conclusion,applicable,not_applicable_reason,status,prepared_by_staff_id,executed_by_staff_id,evidence_set_hash,source_hash,created_at,updated_at)
    VALUES(?,?,1,?,NULL,?,?,?,?,'AD_HOC',1,?,NULL,NULL,1,NULL,'NOT_STARTED',NULL,NULL,?,?,?,?)`).bind(procedureId,workspaceId,p.workprogramId,ordinal,p.title,p.instructions,p.assertion,p.scopeReason,emptyHash,sourceHash,now,now));
  statements.push(env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,procedureId,1,JSON.stringify(content),emptyHash,context.actor.id,now,p.scopeReason));
  statements.push(pushChange(env,workspaceId,String(program.engagement_id),'Procedure',procedureId,1,now));
  return commandMutation(statements,{procedureId,version:1,ordinal,origin:'AD_HOC'},'PROCEDURE',procedureId,null,1,{scopeReason:p.scopeReason});
}

async function updateProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.update'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.procedureId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(String(row.status)))throw new ApiError('INVALID_STATE','Submitted or reviewed procedure content is frozen until an explicit rework decision.');
  if(row.status==='UNDER_REWORK'&&!p.reworkReason)throw new ApiError('VALIDATION_FAILED','Rework changes must retain the review rationale.');
  if(row.risk_band==='RED'&&context.actor.staffGrade!=='MANAGER'&&context.actor.staffGrade!=='PARTNER')throw new ApiError('PERSONA_ACTION_DENIED','A Manager-grade staff member must execute Red-risk work; preparers may draft supporting content only.');
  const staff=await actorStaff(env,workspaceId,context);if(row.risk_band==='RED'&&staff.grade!=='MANAGER'&&staff.grade!=='PARTNER')throw new ApiError('PERSONA_ACTION_DENIED','Red-risk execution must be recorded against a Manager-grade staff member.');
  const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,false);const nextVersion=p.expectedVersion+1;
  const content={procedureId:p.procedureId,workprogramId:row.workprogram_id,ordinal:row.ordinal,title:row.title,instructions:row.instructions,assertion:row.assertion,origin:row.origin,mandatory:row.mandatory,
    scopeReason:row.scope_reason,workPerformed:p.workPerformed,conclusion:p.conclusion,applicable:Boolean(row.applicable),notApplicableReason:row.not_applicable_reason,status:'IN_PROGRESS',executedByStaffId:staff.id};
  const sourceHash=await rowHash({content,evidence:evidence.hash,planningVersionId:row.planning_version_id,tbVersionId:row.active_tb_version_id,mappingVersionId:row.active_mapping_version_id});
  const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`UPDATE procedures SET version=?,work_performed=?,conclusion=?,status='IN_PROGRESS',prepared_by_staff_id=?,executed_by_staff_id=?,evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,p.workPerformed,p.conclusion,staff.id,staff.id,evidence.hash,sourceHash,now,workspaceId,p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,p.procedureId,nextVersion,JSON.stringify({...content,version:nextVersion}),evidence.hash,context.actor.id,now,p.reworkReason??null),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,version:nextVersion,status:'IN_PROGRESS',evidenceSetHash:evidence.hash,sourceHash},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion);
}

async function markNotApplicable(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.mark-not-applicable'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.procedureId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(String(row.status)))throw new ApiError('INVALID_STATE','A submitted procedure must be returned for rework before scope can change.');
  const nextVersion=p.expectedVersion+1;const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,false);
  const content={procedureId:p.procedureId,version:nextVersion,workprogramId:row.workprogram_id,ordinal:row.ordinal,title:row.title,instructions:row.instructions,assertion:row.assertion,
    origin:row.origin,mandatory:row.mandatory,scopeReason:row.scope_reason,workPerformed:null,conclusion:null,applicable:false,notApplicableReason:p.reason,status:'SUBMITTED'};
  const sourceHash=await rowHash({content,evidence:evidence.hash,planningVersionId:row.planning_version_id});
  const samplingPins=await procedureSamplingPins(env,workspaceId,p.procedureId,String(row.active_tb_version_id),true);
  const submissionId=crypto.randomUUID();const reviewSubmissionId=crypto.randomUUID();const submittingStaff=await actorStaff(env,workspaceId,context);
  const contributorIds=[...new Set([row.prepared_by_staff_id,row.executed_by_staff_id,submittingStaff.id].filter((value):value is string=>typeof value==='string'))];
  const contributorRows=await env.DB.prepare(`SELECT natural_person_key AS naturalPersonKey FROM staff_members WHERE workspace_id=? AND id IN (${contributorIds.map(()=>'?').join(',')})`).bind(workspaceId,...contributorIds).all<{naturalPersonKey:string}>();
  const contributorKeys=[...new Set((contributorRows.results??[]).map(person=>person.naturalPersonKey))];
  const dependencyHash=await rowHash({sourceHash,evidenceHash:evidence.hash,targetVersion:nextVersion,samplingPins});const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`UPDATE procedures SET version=?,applicable=0,not_applicable_reason=?,status='SUBMITTED',prepared_by_staff_id=?,evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,p.reason,submittingStaff.id,evidence.hash,sourceHash,now,workspaceId,p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,p.procedureId,nextVersion,JSON.stringify(content),evidence.hash,context.actor.id,now,p.reason),
    env.DB.prepare(`INSERT INTO procedure_submissions(id,workspace_id,procedure_id,row_version,content_version,evidence_set_hash,source_hash,submitted_by_actor_id,submitted_at,status) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTED')`)
      .bind(submissionId,workspaceId,p.procedureId,nextVersion,p.expectedVersion,evidence.hash,sourceHash,context.actor.id,now),
    env.DB.prepare(`INSERT INTO review_submissions(id,workspace_id,client_id,engagement_id,target_kind,procedure_id,workprogram_id,analytical_review_id,going_concern_id,srm_version_id,target_version,snapshot_json,dependency_hash,submitted_by_actor_id,submitted_natural_person_key,contributor_natural_person_keys_json,submitted_at)
      VALUES(?,?,?,?, 'PROCEDURE',?,NULL,NULL,NULL,NULL,?,?,?,?,?,?,?)`).bind(reviewSubmissionId,workspaceId,row.client_id,row.engagement_id,p.procedureId,nextVersion,JSON.stringify({...content,sourceHash,evidenceSetHash:evidence.hash,samplingPins}),dependencyHash,context.actor.id,submittingStaff.natural_person_key,JSON.stringify(contributorKeys),now),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,submissionId,reviewSubmissionId,version:nextVersion,status:'SUBMITTED',applicable:false,reviewRequired:true,dependencyHash},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion,{notApplicableReason:p.reason});
}

async function submitProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.submit'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.procedureId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='IN_PROGRESS'&&row.status!=='NOT_STARTED'&&row.status!=='UNDER_REWORK')throw new ApiError('INVALID_STATE','Only editable procedure work can be submitted.');
  if(row.applicable===0){if(!row.not_applicable_reason)throw new ApiError('VALIDATION_FAILED','A not-applicable procedure needs a reason and reviewer approval.');}
  else{
    const missingFields=[
      ...(String(row.work_performed??'').trim().length<10?['workPerformed']:[]),
      ...(String(row.conclusion??'').trim().length<10?['conclusion']:[])
    ];
    if(missingFields.length)throw new ApiError('VALIDATION_FAILED','Work performed and a conclusion are required before submission.',{fields:missingFields});
    const support=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,true);if(Number(row.mandatory)===1&&support.adequate===0)throw new ApiError('GATE_BLOCKED','A mandatory procedure needs at least one adequate current evidence item.');
  }
  const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,false);
  if(evidence.rows.some(item=>item.target_version!==p.expectedVersion))throw new ApiError('STALE_DEPENDENCY','Procedure evidence is linked to an older row version. Re-link it to the current procedure revision.');
  if(evidence.hash!==row.evidence_set_hash)throw new ApiError('STALE_DEPENDENCY','Evidence changed after the current procedure revision. Re-save and review the current source pins.');
  const samplingPins=await procedureSamplingPins(env,workspaceId,p.procedureId,String(row.active_tb_version_id),true);
  const submissionId=crypto.randomUUID();const reviewSubmissionId=crypto.randomUUID();const nextVersion=p.expectedVersion+1;const content={procedureId:p.procedureId,version:nextVersion,sourceVersion:p.expectedVersion,sourceHash:row.source_hash,evidenceSetHash:evidence.hash,
    samplingPins,workPerformed:row.work_performed,conclusion:row.conclusion,applicable:Boolean(row.applicable),notApplicableReason:row.not_applicable_reason};
  const submittingStaff=await actorStaff(env,workspaceId,context);const contributorIds=[row.prepared_by_staff_id,row.executed_by_staff_id,submittingStaff.id].filter((value):value is string=>typeof value==='string');
  const contributorRows=contributorIds.length?await env.DB.prepare(`SELECT id,natural_person_key AS naturalPersonKey FROM staff_members WHERE workspace_id=? AND id IN (${contributorIds.map(()=>'?').join(',')})`).bind(workspaceId,...contributorIds).all<{id:string;naturalPersonKey:string}>():{results:[]};
  const contributorKeys=[...new Set((contributorRows.results??[]).map(item=>item.naturalPersonKey))];const dependencyHash=await rowHash({sourceHash:row.source_hash,evidenceHash:evidence.hash,targetVersion:nextVersion,samplingPins});
  const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`UPDATE procedures SET version=?,status='SUBMITTED',updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,now,workspaceId,p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,NULL)`)
      .bind(crypto.randomUUID(),workspaceId,p.procedureId,nextVersion,JSON.stringify(content),evidence.hash,context.actor.id,now),
    env.DB.prepare(`INSERT INTO procedure_submissions(id,workspace_id,procedure_id,row_version,content_version,evidence_set_hash,source_hash,submitted_by_actor_id,submitted_at,status) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTED')`)
      .bind(submissionId,workspaceId,p.procedureId,nextVersion,p.expectedVersion,evidence.hash,String(row.source_hash),context.actor.id,now),
    env.DB.prepare(`INSERT INTO review_submissions(id,workspace_id,client_id,engagement_id,target_kind,procedure_id,workprogram_id,analytical_review_id,going_concern_id,srm_version_id,target_version,snapshot_json,dependency_hash,submitted_by_actor_id,submitted_natural_person_key,contributor_natural_person_keys_json,submitted_at)
      VALUES(?,?,?,?, 'PROCEDURE',?,NULL,NULL,NULL,NULL,?,?,?,?,?,?,?)`).bind(reviewSubmissionId,workspaceId,row.client_id,row.engagement_id,p.procedureId,nextVersion,JSON.stringify({...content,submittedByStaffId:submittingStaff.id}),dependencyHash,context.actor.id,submittingStaff.natural_person_key,JSON.stringify(contributorKeys),now),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,submissionId,reviewSubmissionId,version:nextVersion,status:'SUBMITTED',sourceHash:row.source_hash,evidenceSetHash:evidence.hash,dependencyHash},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion);
}

async function reviewProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.review'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('STALE_DEPENDENCY','The procedure changed after the reviewer opened the submitted revision. Refresh and review the exact current submission.');
  if(row.status!=='SUBMITTED')throw new ApiError('INVALID_STATE','Only an exact current submitted procedure revision can be reviewed.');
  const submission=await env.DB.prepare(`SELECT id,row_version,content_version,evidence_set_hash,source_hash,status,submitted_by_actor_id FROM procedure_submissions WHERE workspace_id=? AND procedure_id=? ORDER BY submitted_at DESC LIMIT 1`).bind(workspaceId,p.procedureId).first<Record<string,unknown>>();
  if(!submission||Number(submission.row_version)!==p.expectedVersion||submission.status!=='SUBMITTED')throw new ApiError('STALE_DEPENDENCY','The submitted procedure revision is no longer current.');
  const [reviewSubmission,reviewer]=await Promise.all([
    env.DB.prepare(`SELECT id,submitted_natural_person_key,contributor_natural_person_keys_json,dependency_hash,snapshot_json FROM review_submissions WHERE workspace_id=? AND procedure_id=? AND target_version=? ORDER BY submitted_at DESC LIMIT 1`)
      .bind(workspaceId,p.procedureId,p.expectedVersion).first<{id:string;submitted_natural_person_key:string;contributor_natural_person_keys_json:string;dependency_hash:string;snapshot_json:string}>(),
    actorStaff(env,workspaceId,context)
  ]);
  if(!reviewSubmission)throw new ApiError('STALE_DEPENDENCY','The exact submitted review snapshot is missing; resubmit the current procedure revision.');
  const contributorKeys=JSON.parse(reviewSubmission.contributor_natural_person_keys_json) as string[];
  if(submission.submitted_by_actor_id===context.actor.id||contributorKeys.includes(reviewer.natural_person_key)||reviewSubmission.submitted_natural_person_key===reviewer.natural_person_key)throw new ApiError('SELF_REVIEW_BLOCKED','A natural person who prepared or executed this revision cannot review it after switching personas.');
  if(p.decision!=='REWORK'){
    const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,p.decision==='ACCEPT');
    if(evidence.rows.some(item=>item.target_version!==submission.content_version))throw new ApiError('STALE_DEPENDENCY','A linked evidence target pin does not match the submitted procedure content revision.');
    if(evidence.hash!==submission.evidence_set_hash||row.source_hash!==submission.source_hash)throw new ApiError('STALE_DEPENDENCY','Procedure or evidence content changed after submission.');
    const samplingPins=await procedureSamplingPins(env,workspaceId,p.procedureId,String(row.active_tb_version_id),true);
    const exactSnapshot=JSON.parse(String(reviewSubmission.snapshot_json)) as {samplingPins?:ProcedureSamplingPin[]};
    const submittedPins=exactSnapshot.samplingPins??[];
    if(await rowHash(samplingPins)!==await rowHash(submittedPins))throw new ApiError('STALE_DEPENDENCY','A linked sample test, evaluation, policy or source pin changed after procedure submission.');
    const dependencyHash=await rowHash({sourceHash:submission.source_hash,evidenceHash:evidence.hash,targetVersion:p.expectedVersion,samplingPins});
    if(dependencyHash!==reviewSubmission.dependency_hash)throw new ApiError('STALE_DEPENDENCY','Procedure, evidence or sample dependencies changed after submission.');
  }
  if(row.risk_band==='RED'){
    const executor=await env.DB.prepare(`SELECT grade FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,row.executed_by_staff_id).first<{grade:string}>();
    if(p.decision==='ACCEPT'&&(!executor||!['MANAGER','PARTNER'].includes(executor.grade)))throw new ApiError('GATE_BLOCKED','Red-risk procedures require recorded Manager-grade execution before review.');
  }
  if(row.applicable===0&&p.decision!=='NOT_APPLICABLE_APPROVED'&&p.decision!=='REWORK')throw new ApiError('VALIDATION_FAILED','A not-applicable procedure requires an explicit independent approval.');
  if(row.applicable===1&&p.decision==='NOT_APPLICABLE_APPROVED')throw new ApiError('INVALID_STATE','Only a reasoned not-applicable procedure can receive that decision.');
  const decisionId=crypto.randomUUID();const newStatus=p.decision==='REWORK'?'UNDER_REWORK':'REVIEWED';const nextVersion=p.expectedVersion+1;const reviewDecisionId=crypto.randomUUID();
  let assignedPreparerId=p.assignedPreparerId??String(row.prepared_by_staff_id??row.executed_by_staff_id??'');
  if(p.decision==='REWORK'){
    const directStaff=assignedPreparerId?await env.DB.prepare(`SELECT id FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,assignedPreparerId).first<{id:string}>():null;
    const assignedProfile=!directStaff&&assignedPreparerId?await env.DB.prepare(`SELECT s.id FROM actor_profiles a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id WHERE a.workspace_id=? AND a.id=?`).bind(workspaceId,assignedPreparerId).first<{id:string}>():null;
    assignedPreparerId=directStaff?.id??assignedProfile?.id??'';
    if(!assignedPreparerId)throw new ApiError('VALIDATION_FAILED','A returned procedure must be assigned to its responsible staff preparer.');
  }
  const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_review_decisions(id,workspace_id,submission_id,decision,comments,reviewer_actor_id,decided_at) VALUES(?,?,?,?,?,?,?)`).bind(decisionId,workspaceId,submission.id,p.decision,p.comments,context.actor.id,now),
    env.DB.prepare(`INSERT INTO review_decisions(id,workspace_id,submission_id,decision,reviewer_actor_id,reviewer_natural_person_key,comment,decided_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(reviewDecisionId,workspaceId,reviewSubmission.id,p.decision==='REWORK'?'RETURN':'ACCEPT',context.actor.id,reviewer.natural_person_key,p.comments,now),
    env.DB.prepare(`UPDATE procedure_submissions SET status=? WHERE workspace_id=? AND id=? AND status='SUBMITTED'`).bind(p.decision==='REWORK'?'UNDER_REWORK':'REVIEWED',workspaceId,submission.id),
    env.DB.prepare(`UPDATE procedures SET version=?,status=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,newStatus,now,workspaceId,p.procedureId,p.expectedVersion),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  let noteId:string|undefined;
  if(p.decision==='REWORK'){
    noteId=crypto.randomUUID();const noteRevisionId=crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO review_notes(id,workspace_id,version,submission_id,procedure_id,text,assigned_preparer_id,status,response_text,response_at,closed_by_actor_id,closed_at,closure_reason,resubmission_id,created_at)
      VALUES(?,?,1,?,?,?,?,'OPEN',NULL,NULL,NULL,NULL,NULL,NULL,?)`).bind(noteId,workspaceId,reviewSubmission.id,p.procedureId,p.comments,assignedPreparerId,now));
    statements.push(env.DB.prepare(`INSERT INTO review_note_revisions(id,workspace_id,note_id,revision,status,response_text,actor_id,reason,recorded_at) VALUES(?,?,?,1,'OPEN',NULL,?,?,?)`)
      .bind(noteRevisionId,workspaceId,noteId,context.actor.id,p.comments,now));
  }
  return commandMutation(statements,{procedureId:p.procedureId,submissionId:submission.id,reviewSubmissionId:reviewSubmission.id,decisionId,reviewDecisionId,noteId,version:nextVersion,status:newStatus,comments:p.comments},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion,{submissionId:submission.id,reviewSubmissionId:reviewSubmission.id,decision:p.decision,noteId});
}

async function createReviewSubmission(env:Env,workspaceId:string,context:BusinessContext,kind:'PROCEDURE'|'WORKPROGRAM'|'ANALYTICAL_REVIEW'|'GOING_CONCERN'|'SRM',targetId:string,targetVersion:number,dependencyHash:string,snapshot:Record<string,unknown>,contributorIds:string[],engagement:{id:string;client_id:string},now:string,extra:D1PreparedStatement[]=[]):Promise<BusinessMutation>{
  const submittingStaff=await actorStaff(env,workspaceId,context);const contributorStaffIds=[...new Set([...contributorIds,submittingStaff.id])];
  const people=contributorStaffIds.length?await env.DB.prepare(`SELECT id,natural_person_key AS naturalPersonKey FROM staff_members WHERE workspace_id=? AND id IN (${contributorStaffIds.map(()=>'?').join(',')})`)
    .bind(workspaceId,...contributorStaffIds).all<{id:string;naturalPersonKey:string}>():{results:[]};
  const contributorKeys=[...new Set((people.results??[]).map(item=>item.naturalPersonKey))];
  const rowId=crypto.randomUUID();const fields={procedure_id:null as string|null,workprogram_id:null as string|null,analytical_review_id:null as string|null,going_concern_id:null as string|null,srm_version_id:null as string|null};
  if(kind==='PROCEDURE')fields.procedure_id=targetId;else if(kind==='WORKPROGRAM')fields.workprogram_id=targetId;else if(kind==='ANALYTICAL_REVIEW')fields.analytical_review_id=targetId;
  else if(kind==='GOING_CONCERN')fields.going_concern_id=targetId;else fields.srm_version_id=targetId;
  const statements=[...extra,env.DB.prepare(`INSERT INTO review_submissions(id,workspace_id,client_id,engagement_id,target_kind,procedure_id,workprogram_id,analytical_review_id,going_concern_id,srm_version_id,target_version,snapshot_json,dependency_hash,submitted_by_actor_id,submitted_natural_person_key,contributor_natural_person_keys_json,submitted_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(rowId,workspaceId,engagement.client_id,engagement.id,kind,fields.procedure_id,fields.workprogram_id,fields.analytical_review_id,fields.going_concern_id,fields.srm_version_id,targetVersion,JSON.stringify(snapshot),dependencyHash,context.actor.id,submittingStaff.natural_person_key,JSON.stringify(contributorKeys),now)];
  return commandMutation(statements,{submissionId:rowId,targetKind:kind,targetId,targetVersion,dependencyHash,status:'SUBMITTED'},'REVIEW_SUBMISSION',rowId,null,1,{targetKind:kind,targetId,targetVersion,dependencyHash});
}

async function submitReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'review.submit'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;
  if(p.targetKind==='PROCEDURE'){
    const row=await currentProcedure(env,workspaceId,p.targetId);await verifyProcedureScope(context,row);
    if(Number(row.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.targetId,expectedVersion:p.targetVersion,currentVersion:row.version}));
    if(p.dependencyHash&&p.dependencyHash!==row.source_hash)throw new ApiError('STALE_DEPENDENCY','Procedure source dependencies changed; refresh before submission.');
    if(row.status==='SUBMITTED'){
      const existing=await env.DB.prepare(`SELECT id,dependency_hash FROM review_submissions WHERE workspace_id=? AND procedure_id=? AND target_version=? ORDER BY submitted_at DESC LIMIT 1`).bind(workspaceId,p.targetId,p.targetVersion).first<{id:string;dependency_hash:string}>();
      if(!existing)throw new ApiError('STALE_DEPENDENCY','A submitted procedure is missing its immutable review snapshot.');
      return commandMutation([],{submissionId:existing.id,targetKind:p.targetKind,targetId:p.targetId,targetVersion:p.targetVersion,dependencyHash:existing.dependency_hash,status:'SUBMITTED',reused:true},'REVIEW_SUBMISSION',existing.id,null,1);
    }
    return submitProcedure(env,workspaceId,context,{type:'procedure.submit',payload:{procedureId:p.targetId,expectedVersion:p.targetVersion}},now);
  }
  if(p.targetKind==='WORKPROGRAM'){
    const row=await env.DB.prepare(`SELECT w.id,w.version,w.client_id,w.engagement_id,w.fsli_id,w.planning_version_id,w.risk_band,w.assigned_staff_id,w.status,w.source_hash,e.approved_planning_version_id,e.active_tb_version_id,e.active_mapping_version_id
      FROM workprograms w JOIN engagements e ON e.workspace_id=w.workspace_id AND e.id=w.engagement_id WHERE w.workspace_id=? AND w.id=?`).bind(workspaceId,p.targetId).first<Record<string,unknown>>();
    if(!row)throw new ApiError('NOT_FOUND','The workprogram was not found.');if((context.scope.clientId&&context.scope.clientId!==row.client_id)||(context.scope.engagementId&&context.scope.engagementId!==row.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Workprogram is outside the selected engagement.');
    const engagement=await getEngagement(env,workspaceId,context,String(row.engagement_id));if(Number(row.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Workprogram',id:p.targetId,expectedVersion:p.targetVersion,currentVersion:row.version}));
    if(row.planning_version_id!==row.approved_planning_version_id)throw new ApiError('STALE_DEPENDENCY','The workprogram uses a stale planning version.');
    if(!['DRAFT','IN_PROGRESS','UNDER_REWORK'].includes(String(row.status)))throw new ApiError('INVALID_STATE','This workprogram has already been submitted or reviewed.');
    const procedures=await env.DB.prepare(`SELECT id,version,ordinal,title,instructions,assertion,origin,mandatory,scope_reason AS scopeReason,work_performed AS workPerformed,
        conclusion,applicable,not_applicable_reason AS notApplicableReason,status,source_hash AS sourceHash,evidence_set_hash AS evidenceSetHash,
        prepared_by_staff_id AS preparedByStaffId,executed_by_staff_id AS executedByStaffId
      FROM procedures WHERE workspace_id=? AND workprogram_id=? ORDER BY ordinal`).bind(workspaceId,p.targetId).all<Record<string,unknown>>();
    const procedureRows=procedures.results??[];if(!procedureRows.length)throw new ApiError('GATE_BLOCKED','A workprogram needs procedure rows before submission.');
    for(const item of procedureRows){
      await assertProcedureEvidenceCurrent(env,workspaceId,String(item.id),item.evidenceSetHash);
      await procedureSamplingPins(env,workspaceId,String(item.id),String(row.active_tb_version_id),true);
    }
    const incomplete=procedureRows.filter(item=>item.status!=='REVIEWED');if(incomplete.length)throw new ApiError('GATE_BLOCKED',`${incomplete.length} applicable or not-applicable procedure rows remain unreviewed.`);
    const openNotes=await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id
      WHERE s.workspace_id=? AND n.status='OPEN' AND (s.workprogram_id=? OR s.procedure_id IN
        (SELECT p.id FROM procedures p WHERE p.workspace_id=? AND p.workprogram_id=?))`).bind(workspaceId,p.targetId,workspaceId,p.targetId).first<{count:number}>();
    if(Number(openNotes?.count??0)>0)throw new ApiError('GATE_BLOCKED','Resolve every open rework note before workprogram submission.');
    const procedureSnapshots=await Promise.all(procedureRows.map(async item=>({...item,samplingPins:await procedureSamplingPins(env,workspaceId,String(item.id),String(row.active_tb_version_id),true)})));
    const dependencies=procedureRows.map(item=>({id:item.id,version:item.version,status:item.status,sourceHash:item.sourceHash,evidenceSetHash:item.evidenceSetHash}));
    const dependencyHash=await rowHash({workprogramSourceHash:row.source_hash,planningVersionId:row.planning_version_id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,dependencies});
    if(p.dependencyHash&&p.dependencyHash!==dependencyHash)throw new ApiError('STALE_DEPENDENCY','The workprogram or its source dependencies changed. Refresh and review the current versions.');
    const contributors=procedureRows.flatMap(item=>[item.preparedByStaffId,item.executedByStaffId]).filter((value):value is string=>typeof value==='string');const nextVersion=p.targetVersion+1;
    const extra=[versionGuard(env,workspaceId,990,'workprograms','id',p.targetId,p.targetVersion),env.DB.prepare(`UPDATE workprograms SET version=?,status='SUBMITTED',updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,now,workspaceId,p.targetId,p.targetVersion),pushChange(env,workspaceId,engagement.id,'Workprogram',p.targetId,nextVersion,now)];
    return createReviewSubmission(env,workspaceId,context,'WORKPROGRAM',p.targetId,nextVersion,dependencyHash,{workprogram:{id:p.targetId,version:nextVersion,sourceHash:row.source_hash,riskBand:row.risk_band,planningVersionId:row.planning_version_id},procedures:procedureSnapshots},contributors,engagement,now,extra);
  }
  if(p.targetKind==='ANALYTICAL_REVIEW'){
    const row=await env.DB.prepare(`SELECT a.id,a.version,a.client_id,a.engagement_id,a.fsli_id,a.statement_snapshot_id,a.source_hash,a.status,a.prepared_by_actor_id,e.active_tb_version_id,e.active_mapping_version_id
      FROM analytical_reviews a JOIN engagements e ON e.workspace_id=a.workspace_id AND e.id=a.engagement_id WHERE a.workspace_id=? AND a.id=?`).bind(workspaceId,p.targetId).first<Record<string,unknown>>();
    if(!row||row.status!=='SUBMITTED')throw new ApiError('INVALID_STATE','Only a submitted analytical review can be placed in independent review.');
    if((context.scope.clientId&&context.scope.clientId!==row.client_id)||(context.scope.engagementId&&context.scope.engagementId!==row.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Analytical review is outside the selected engagement.');
    if(Number(row.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AnalyticalReview',id:p.targetId,expectedVersion:p.targetVersion,currentVersion:row.version}));
    const submitted=await env.DB.prepare(`SELECT id,dependency_hash FROM review_submissions WHERE workspace_id=? AND analytical_review_id=? AND target_version=?`).bind(workspaceId,p.targetId,p.targetVersion).first<{id:string;dependency_hash:string}>();
    if(submitted)return commandMutation([],{submissionId:submitted.id,targetKind:p.targetKind,targetId:p.targetId,targetVersion:p.targetVersion,dependencyHash:submitted.dependency_hash,status:'SUBMITTED',reused:true},'REVIEW_SUBMISSION',submitted.id,null,1);
    const support=await evidenceSet(env,workspaceId,'analytical_review_id',p.targetId,true);
    if(support.rows.some(item=>item.target_version!==p.targetVersion))throw new ApiError('STALE_DEPENDENCY','Analytical review evidence is linked to an older review revision. Refresh the exact target pin before submission.');
    if(!support.adequate)throw new ApiError('GATE_BLOCKED','Current adequate evidence is required before independent review.');
    const engagement=await getEngagement(env,workspaceId,context,String(row.engagement_id));const dependencyHash=await rowHash({sourceHash:row.source_hash,evidenceHash:support.hash,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id});
    if(p.dependencyHash&&p.dependencyHash!==dependencyHash)throw new ApiError('STALE_DEPENDENCY','Analytical review evidence or statement source changed.');
    const staff=await env.DB.prepare(`SELECT staff_member_id AS staffMemberId FROM actor_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,row.prepared_by_actor_id).first<{staffMemberId:string}>();
    return createReviewSubmission(env,workspaceId,context,'ANALYTICAL_REVIEW',p.targetId,p.targetVersion,dependencyHash,{...row,evidenceSetHash:support.hash},staff?.staffMemberId?[staff.staffMemberId]:[],engagement,now);
  }
  if(p.targetKind==='GOING_CONCERN'){
    const row=await env.DB.prepare(`SELECT g.id,g.version,g.client_id,g.engagement_id,g.revision,g.source_hash,g.status,g.prepared_by_actor_id,g.assessment_end,g.conclusion,g.checklist_json,g.evidence_file_ids_json FROM going_concern_assessments g WHERE g.workspace_id=? AND g.id=?`).bind(workspaceId,p.targetId).first<Record<string,unknown>>();
    if(!row||!['DRAFT','UNDER_REWORK'].includes(String(row.status)))throw new ApiError('INVALID_STATE','Only an editable going-concern assessment can be submitted.');
    assertGoingConcernComplete(String(row.conclusion));
    const engagement=await getEngagement(env,workspaceId,context,String(row.engagement_id));if(Number(row.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'GoingConcernAssessment',id:p.targetId,expectedVersion:p.targetVersion,currentVersion:row.version}));
    const dependencyHash=await rowHash({sourceHash:row.source_hash,standardsProfileId:engagement.standards_profile_id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id});
    if(p.dependencyHash&&p.dependencyHash!==dependencyHash)throw new ApiError('STALE_DEPENDENCY','Going-concern source pins changed.');
    const staff=await env.DB.prepare(`SELECT staff_member_id AS staffMemberId FROM actor_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,row.prepared_by_actor_id).first<{staffMemberId:string}>();const nextVersion=p.targetVersion+1;
    const extra=[versionGuard(env,workspaceId,990,'going_concern_assessments','id',p.targetId,p.targetVersion),env.DB.prepare(`UPDATE going_concern_assessments SET version=?,status='SUBMITTED' WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,workspaceId,p.targetId,p.targetVersion)];
    return createReviewSubmission(env,workspaceId,context,'GOING_CONCERN',p.targetId,nextVersion,dependencyHash,row,staff?.staffMemberId?[staff.staffMemberId]:[],engagement,now,extra);
  }
  const srm=await env.DB.prepare(`SELECT id,client_id,engagement_id,revision,dependency_hash FROM srm_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,p.targetId).first<Record<string,unknown>>();
  if(!srm)throw new ApiError('NOT_FOUND','The SRM version was not found.');if(Number(srm.revision)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT','The requested SRM revision is no longer current.');
  const engagement=await getEngagement(env,workspaceId,context,String(srm.engagement_id));if((context.scope.clientId&&context.scope.clientId!==srm.client_id)||(context.scope.engagementId&&context.scope.engagementId!==srm.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','SRM is outside the selected engagement.');
  if(p.dependencyHash&&p.dependencyHash!==srm.dependency_hash)throw new ApiError('STALE_DEPENDENCY','The SRM dependency hash is stale.');
  return createReviewSubmission(env,workspaceId,context,'SRM',p.targetId,p.targetVersion,String(srm.dependency_hash),srm,[],engagement,now);
}

async function decideReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'review.decide'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const submission=await env.DB.prepare(`SELECT id,target_kind,procedure_id,workprogram_id,analytical_review_id,going_concern_id,srm_version_id,target_version,dependency_hash,submitted_by_actor_id,submitted_natural_person_key,contributor_natural_person_keys_json,client_id,engagement_id,snapshot_json
    FROM review_submissions WHERE workspace_id=? AND id=?`).bind(workspaceId,p.submissionId).first<Record<string,unknown>>();
  if(!submission)throw new ApiError('NOT_FOUND','The exact review submission was not found.');if((context.scope.clientId&&context.scope.clientId!==submission.client_id)||(context.scope.engagementId&&context.scope.engagementId!==submission.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Review submission is outside the selected engagement.');
  const staff=await actorStaff(env,workspaceId,context);const contributors=JSON.parse(String(submission.contributor_natural_person_keys_json)) as string[];
  if(submission.submitted_by_actor_id===context.actor.id||submission.submitted_natural_person_key===staff.natural_person_key||contributors.includes(staff.natural_person_key))throw new ApiError('SELF_REVIEW_BLOCKED','A preparer or executor cannot review the same immutable submission, including after persona switching.');
  const existing=await env.DB.prepare(`SELECT id FROM review_decisions WHERE workspace_id=? AND submission_id=?`).bind(workspaceId,p.submissionId).first<{id:string}>();if(existing)throw new ApiError('INVALID_STATE','This exact submission already has an independent decision.');
  if(submission.target_kind==='PROCEDURE'){
    return reviewProcedure(env,workspaceId,context,{type:'procedure.review',payload:{procedureId:String(submission.procedure_id),expectedVersion:Number(submission.target_version),decision:p.decision==='RETURN'?'REWORK':'ACCEPT',comments:p.comment,assignedPreparerId:p.assignedPreparerId}},now);
  }
  const kind=String(submission.target_kind);const entityId=String(submission.workprogram_id??submission.analytical_review_id??submission.going_concern_id??submission.srm_version_id);const decisionId=crypto.randomUUID();const nextStatus=p.decision==='RETURN'?'UNDER_REWORK':'REVIEWED';
  let table:string;let entity:string;let currentVersion=Number(submission.target_version);let status:string|null=null;
  if(kind==='WORKPROGRAM'){
    table='workprograms';entity='Workprogram';const row=await env.DB.prepare(`SELECT w.version,w.status,w.source_hash AS sourceHash,w.planning_version_id AS planningVersionId,e.active_tb_version_id AS tbVersionId,e.active_mapping_version_id AS mappingVersionId
      FROM workprograms w JOIN engagements e ON e.workspace_id=w.workspace_id AND e.id=w.engagement_id WHERE w.workspace_id=? AND w.id=?`).bind(workspaceId,entityId).first<Record<string,unknown>>();if(!row||Number(row.version)!==currentVersion||row.status!=='SUBMITTED')throw new ApiError('STALE_DEPENDENCY','The workprogram changed after submission.');status=String(row.status);
    if(p.decision==='ACCEPT'){
      const procedures=await env.DB.prepare(`SELECT id,version,status,source_hash AS sourceHash,evidence_set_hash AS evidenceSetHash FROM procedures WHERE workspace_id=? AND workprogram_id=? ORDER BY ordinal`).bind(workspaceId,entityId).all<Record<string,unknown>>();
      const currentProcedures=procedures.results??[];
      for(const procedure of currentProcedures){
        await assertProcedureEvidenceCurrent(env,workspaceId,String(procedure.id),procedure.evidenceSetHash);
        await procedureSamplingPins(env,workspaceId,String(procedure.id),String(row.tbVersionId),true);
      }
      if(currentProcedures.some(procedure=>procedure.status!=='REVIEWED'))throw new ApiError('STALE_DEPENDENCY','Procedure review status changed after the workprogram was submitted. Return and resubmit the current workprogram.');
      const dependencyHash=await rowHash({workprogramSourceHash:row.sourceHash,planningVersionId:row.planningVersionId,tbVersionId:row.tbVersionId,mappingVersionId:row.mappingVersionId,
        dependencies:currentProcedures.map(procedure=>({id:procedure.id,version:procedure.version,status:procedure.status,sourceHash:procedure.sourceHash,evidenceSetHash:procedure.evidenceSetHash}))});
      if(dependencyHash!==submission.dependency_hash)throw new ApiError('STALE_DEPENDENCY','Procedure revisions or evidence changed after the workprogram was submitted. Return and resubmit the current snapshot.');
    }
  }else if(kind==='ANALYTICAL_REVIEW'){
    table='analytical_reviews';entity='AnalyticalReview';const row=await env.DB.prepare(`SELECT a.version,a.status,a.source_hash AS sourceHash,a.engagement_id,e.active_tb_version_id AS tbVersionId,e.active_mapping_version_id AS mappingVersionId
      FROM analytical_reviews a JOIN engagements e ON e.workspace_id=a.workspace_id AND e.id=a.engagement_id WHERE a.workspace_id=? AND a.id=?`).bind(workspaceId,entityId).first<Record<string,unknown>>();if(!row||Number(row.version)!==currentVersion||row.status!=='SUBMITTED')throw new ApiError('STALE_DEPENDENCY','The analytical review changed after submission.');status=String(row.status);
    if(p.decision==='ACCEPT'){
      const support=await evidenceSet(env,workspaceId,'analytical_review_id',entityId,true);
      const submittedSnapshot=JSON.parse(String(submission.snapshot_json)) as Record<string,unknown>;const contentVersion=Number(submittedSnapshot.version??currentVersion-1);
      if(support.rows.some(item=>item.target_version!==contentVersion))throw new ApiError('STALE_DEPENDENCY','Analytical evidence is linked to an older review revision. Return and refresh the exact evidence pins.');
      if(support.hash!==submittedSnapshot.evidenceSetHash||row.sourceHash!==submittedSnapshot.source_hash)throw new ApiError('STALE_DEPENDENCY','The analytical review or its evidence pins changed after submission. Return and resubmit the current snapshot.');
      if(!support.adequate)throw new ApiError('GATE_BLOCKED','Current adequate evidence is required before the analytical review can be accepted.');
      const dependencyHash=await rowHash({sourceHash:row.sourceHash,evidenceHash:support.hash,tbVersionId:row.tbVersionId,mappingVersionId:row.mappingVersionId});
      if(dependencyHash!==submission.dependency_hash)throw new ApiError('STALE_DEPENDENCY','The analytical review or evidence dependencies changed after submission. Return and resubmit the current snapshot.');
    }
  }else if(kind==='GOING_CONCERN'){
    table='going_concern_assessments';entity='GoingConcernAssessment';const row=await env.DB.prepare(`SELECT version,status FROM going_concern_assessments WHERE workspace_id=? AND id=?`).bind(workspaceId,entityId).first<{version:number;status:string}>();if(!row||Number(row.version)!==currentVersion||row.status!=='SUBMITTED')throw new ApiError('STALE_DEPENDENCY','The going-concern assessment changed after submission.');status=row.status;
  }else {throw new ApiError('INVALID_STATE','An SRM receives Partner clearance after Manager recommendation, not a generic review decision.');}
  const decisionStatement=env.DB.prepare(`INSERT INTO review_decisions(id,workspace_id,submission_id,decision,reviewer_actor_id,reviewer_natural_person_key,comment,decided_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(decisionId,workspaceId,p.submissionId,p.decision,context.actor.id,staff.natural_person_key,p.comment,now);
  const updateStatement=env.DB.prepare(`UPDATE ${table} SET version=version+1,status=? WHERE workspace_id=? AND id=? AND version=? AND status='SUBMITTED'`).bind(nextStatus,workspaceId,entityId,currentVersion);
  const statements:D1PreparedStatement[]=[versionGuard(env,workspaceId,990,table,'id',entityId,currentVersion),decisionStatement,updateStatement];
  const noteIds:string[]=[];
  if(p.decision==='RETURN'){
    let assigned=p.assignedPreparerId;
    if(!assigned&&(kind==='ANALYTICAL_REVIEW'||kind==='GOING_CONCERN')){
      const preparedByColumn=kind==='ANALYTICAL_REVIEW'?'prepared_by_actor_id':'prepared_by_actor_id';
      const prepared=await env.DB.prepare(`SELECT a.staff_member_id AS staffMemberId FROM ${table} t JOIN actor_profiles a ON a.workspace_id=t.workspace_id AND a.id=t.${preparedByColumn} WHERE t.workspace_id=? AND t.id=?`)
        .bind(workspaceId,entityId).first<{staffMemberId:string}>();
      assigned=prepared?.staffMemberId;
    }
    assigned??=String(submission.submitted_by_actor_id);
    const directStaff=await env.DB.prepare(`SELECT id FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,assigned).first<{id:string}>();
    const assignedProfile=directStaff?null:await env.DB.prepare(`SELECT s.id FROM actor_profiles a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id WHERE a.workspace_id=? AND a.id=?`).bind(workspaceId,assigned).first<{id:string}>();
    const preparerId=directStaff?.id??assignedProfile?.id;if(!preparerId)throw new ApiError('VALIDATION_FAILED','A returned submission needs an active assigned staff preparer.');
    const mandatorySteps=kind==='WORKPROGRAM'?(await env.DB.prepare(`SELECT id FROM procedures WHERE workspace_id=? AND workprogram_id=? AND mandatory=1`).bind(workspaceId,entityId).all<{id:string}>()).results??[]:[];
    const affected=kind==='WORKPROGRAM'?[...new Set(p.procedureIds.length?p.procedureIds:mandatorySteps.map(row=>row.id))]:[];
    if(kind==='WORKPROGRAM'&&!affected.length)throw new ApiError('VALIDATION_FAILED','Select the affected procedure step or retain at least one mandatory step in the note.');
    const notedProcedures:Array<string|null>=kind==='WORKPROGRAM'?affected:[null];
    let procedureGuardSequence=991;
    for(const procedureId of notedProcedures){
      if(procedureId){
        const procedure=await currentProcedure(env,workspaceId,procedureId);if(procedure.workprogram_id!==entityId)throw new ApiError('FORBIDDEN_SCOPE','A review note step must belong to the returned workprogram.');
        const nextProcedureVersion=Number(procedure.version)+1;const content={procedureId,workprogramId:procedure.workprogram_id,ordinal:procedure.ordinal,title:procedure.title,instructions:procedure.instructions,
          assertion:procedure.assertion,origin:procedure.origin,mandatory:procedure.mandatory,scopeReason:procedure.scope_reason,workPerformed:procedure.work_performed,conclusion:procedure.conclusion,
          applicable:Boolean(procedure.applicable),notApplicableReason:procedure.not_applicable_reason,status:'UNDER_REWORK',version:nextProcedureVersion};
        statements.push(versionGuard(env,workspaceId,procedureGuardSequence++,'procedures','id',procedureId,Number(procedure.version)),
          env.DB.prepare(`UPDATE procedures SET version=?,status='UNDER_REWORK',updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextProcedureVersion,now,workspaceId,procedureId,procedure.version),
          env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
            .bind(crypto.randomUUID(),workspaceId,procedureId,nextProcedureVersion,JSON.stringify(content),procedure.evidence_set_hash,context.actor.id,now,p.comment),
          pushChange(env,workspaceId,String(submission.engagement_id),'Procedure',procedureId,nextProcedureVersion,now));
      }
      const noteId=crypto.randomUUID();noteIds.push(noteId);statements.push(env.DB.prepare(`INSERT INTO review_notes(id,workspace_id,version,submission_id,procedure_id,text,assigned_preparer_id,status,response_text,response_at,closed_by_actor_id,closed_at,closure_reason,resubmission_id,created_at)
        VALUES(?,?,1,?,?,?,?,'OPEN',NULL,NULL,NULL,NULL,NULL,NULL,?)`).bind(noteId,workspaceId,p.submissionId,procedureId,p.comment,preparerId,now));
      statements.push(env.DB.prepare(`INSERT INTO review_note_revisions(id,workspace_id,note_id,revision,status,response_text,actor_id,reason,recorded_at) VALUES(?,?,?,1,'OPEN',NULL,?,?,?)`).bind(crypto.randomUUID(),workspaceId,noteId,context.actor.id,p.comment,now));
    }
  }
  if(submission.target_kind==='WORKPROGRAM')statements.push(pushChange(env,workspaceId,String(submission.engagement_id),'Workprogram',entityId,currentVersion+1,now));
  return commandMutation(statements,{submissionId:p.submissionId,decisionId,decision:p.decision,status:nextStatus,noteIds,version:currentVersion+1},entity,entityId,currentVersion,currentVersion+1,{comment:p.comment,noteIds});
}

async function respondReviewNote(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'review.respond'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const note=await env.DB.prepare(`SELECT n.id,n.version,n.submission_id,n.procedure_id,n.assigned_preparer_id,n.status,s.engagement_id FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE n.workspace_id=? AND n.id=?`)
    .bind(workspaceId,p.noteId).first<Record<string,unknown>>();if(!note)throw new ApiError('NOT_FOUND','The review note was not found.');
  const engagement=await getEngagement(env,workspaceId,context,String(note.engagement_id));if(note.status!=='OPEN')throw new ApiError('INVALID_STATE','Only an open review note can receive its assigned preparer response.');
  const staff=await actorStaff(env,workspaceId,context);if(staff.id!==note.assigned_preparer_id)throw new ApiError('PERSONA_ACTION_DENIED','Only the staff member assigned to this review note can respond.');
  const revisionId=crypto.randomUUID();const nextVersion=Number(note.version)+1;const statements=[versionGuard(env,workspaceId,990,'review_notes','id',p.noteId,Number(note.version)),
    env.DB.prepare(`UPDATE review_notes SET version=?,status='RESPONDED',response_text=?,response_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,p.responseText,now,workspaceId,p.noteId,note.version),
    env.DB.prepare(`INSERT INTO review_note_revisions(id,workspace_id,note_id,revision,status,response_text,actor_id,reason,recorded_at) VALUES(?,?,?,?, 'RESPONDED',?,?,?,?)`).bind(revisionId,workspaceId,p.noteId,nextVersion,p.responseText,context.actor.id,'Assigned preparer response recorded.',now),
    pushChange(env,workspaceId,engagement.id,'ReviewNote',p.noteId,nextVersion,now)];
  return commandMutation(statements,{noteId:p.noteId,version:nextVersion,status:'RESPONDED'},'REVIEW_NOTE',p.noteId,Number(note.version),nextVersion);
}

async function closeReviewNote(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'review.close-note'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const note=await env.DB.prepare(`SELECT n.id,n.version,n.submission_id,n.procedure_id,n.status,n.response_text,n.response_at,s.engagement_id,s.target_kind,s.target_version,s.snapshot_json,s.workprogram_id,s.analytical_review_id,s.going_concern_id,s.srm_version_id FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE n.workspace_id=? AND n.id=?`)
    .bind(workspaceId,p.noteId).first<Record<string,unknown>>();if(!note)throw new ApiError('NOT_FOUND','The review note was not found.');
  const engagement=await getEngagement(env,workspaceId,context,String(note.engagement_id));if(note.status!=='RESPONDED')throw new ApiError('INVALID_STATE','A review note can be closed only after its assigned preparer responds.');
  const resubmission=await env.DB.prepare(`SELECT s.id,s.target_kind,s.procedure_id,s.workprogram_id,s.analytical_review_id,s.going_concern_id,s.srm_version_id,s.engagement_id,s.target_version,s.snapshot_json,s.submitted_at,d.decision FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
    WHERE s.workspace_id=? AND s.id=?`).bind(workspaceId,p.resubmissionId).first<Record<string,unknown>>();
  let laterVersion=Number(resubmission?.target_version??0)>Number(note.target_version);
  if(note.procedure_id&&note.target_kind==='WORKPROGRAM'){
    const original=JSON.parse(String(note.snapshot_json)) as {procedures?:Array<{id:string;version:number}>};
    const originalProcedureVersion=original.procedures?.find(item=>item.id===note.procedure_id)?.version;
    const current=JSON.parse(String(resubmission?.snapshot_json??'{}')) as {procedures?:Array<{id:string;version:number}>};
    const resubmittedProcedureVersion=current.procedures?.find(item=>item.id===note.procedure_id)?.version;
    laterVersion=Boolean(originalProcedureVersion&&resubmittedProcedureVersion&&resubmittedProcedureVersion>originalProcedureVersion);
  }else if(note.target_kind==='GOING_CONCERN'){
    const original=JSON.parse(String(note.snapshot_json)) as {revision?:number};const current=JSON.parse(String(resubmission?.snapshot_json??'{}')) as {revision?:number};
    laterVersion=Boolean(original.revision&&current.revision&&current.revision>original.revision);
  }
  const targetMatches=note.procedure_id
    ? note.target_kind==='WORKPROGRAM'
      ? resubmission?.target_kind==='WORKPROGRAM'&&resubmission.workprogram_id===note.workprogram_id
      : resubmission?.target_kind==='PROCEDURE'&&resubmission.procedure_id===note.procedure_id
    : note.target_kind==='GOING_CONCERN'
      ? resubmission?.target_kind==='GOING_CONCERN'&&resubmission.engagement_id===note.engagement_id
      : resubmission?.target_kind===note.target_kind&&resubmission?.workprogram_id===note.workprogram_id&&resubmission?.analytical_review_id===note.analytical_review_id&&resubmission?.going_concern_id===note.going_concern_id&&resubmission?.srm_version_id===note.srm_version_id;
  if(!resubmission||!targetMatches||!laterVersion||String(resubmission.submitted_at)<String(note.response_at)||resubmission.decision!=='ACCEPT')throw new ApiError('GATE_BLOCKED','Close the note only after a later exact resubmission has been independently accepted.');
  const nextVersion=Number(note.version)+1;const statements=[versionGuard(env,workspaceId,990,'review_notes','id',p.noteId,Number(note.version)),
    env.DB.prepare(`UPDATE review_notes SET version=?,status='CLOSED',closed_by_actor_id=?,closed_at=?,closure_reason=?,resubmission_id=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,context.actor.id,now,p.closureReason,p.resubmissionId,workspaceId,p.noteId,note.version),
    env.DB.prepare(`INSERT INTO review_note_revisions(id,workspace_id,note_id,revision,status,response_text,actor_id,reason,recorded_at) VALUES(?,?,?,?, 'CLOSED',?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,p.noteId,nextVersion,String(note.response_text??''),context.actor.id,p.closureReason,now),
    pushChange(env,workspaceId,engagement.id,'ReviewNote',p.noteId,nextVersion,now)];
  return commandMutation(statements,{noteId:p.noteId,version:nextVersion,status:'CLOSED',resubmissionId:p.resubmissionId},'REVIEW_NOTE',p.noteId,Number(note.version),nextVersion);
}

async function clearPartnerArea(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'partner.clear-area'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const workprogram=await env.DB.prepare(`SELECT w.id,w.version,w.client_id,w.engagement_id,w.fsli_id,w.planning_version_id,w.risk_band,w.status,w.source_hash,e.approved_planning_version_id,e.active_tb_version_id,e.active_mapping_version_id FROM workprograms w JOIN engagements e ON e.workspace_id=w.workspace_id AND e.id=w.engagement_id WHERE w.workspace_id=? AND w.id=?`)
    .bind(workspaceId,p.workprogramId).first<Record<string,unknown>>();if(!workprogram)throw new ApiError('NOT_FOUND','The workprogram was not found.');
  const engagement=await getEngagement(env,workspaceId,context,String(workprogram.engagement_id));if(engagement.lifecycle_state!=='MANAGERIAL_REVIEW')throw new ApiError('INVALID_STATE','Partner area clearance opens after the Manager accepts engagement fieldwork for Partner approval.');
  if(workprogram.planning_version_id!==workprogram.approved_planning_version_id)throw new ApiError('STALE_DEPENDENCY','Partner clearance requires the currently approved planning version.');
  if(workprogram.status!=='REVIEWED')throw new ApiError('GATE_BLOCKED','The Manager must independently accept the current workprogram before Partner area clearance.');
  const submission=await env.DB.prepare(`SELECT s.id,s.target_version,s.dependency_hash,d.decision FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
    WHERE s.workspace_id=? AND s.id=? AND s.workprogram_id=? AND s.target_kind='WORKPROGRAM'`).bind(workspaceId,p.submissionId,p.workprogramId).first<Record<string,unknown>>();
  if(!submission||submission.decision!=='ACCEPT'||submission.dependency_hash!==p.dependencyHash||Number(submission.target_version)+1!==Number(workprogram.version))throw new ApiError('STALE_DEPENDENCY','Partner clearance must pin the Manager-accepted current workprogram snapshot and exact dependency hash.');
  const procedures=await env.DB.prepare(`SELECT p.id,p.version,p.status,w.risk_band,p.executed_by_staff_id,p.source_hash,p.evidence_set_hash,p.ordinal FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND p.workprogram_id=? ORDER BY p.ordinal`).bind(workspaceId,p.workprogramId).all<Record<string,unknown>>();
  const items=procedures.results??[];if(items.some(row=>row.status!=='REVIEWED'))throw new ApiError('GATE_BLOCKED','Every procedure must be independently reviewed before Partner area clearance.');
  for(const item of items){
    await assertProcedureEvidenceCurrent(env,workspaceId,String(item.id),item.evidence_set_hash);
    await procedureSamplingPins(env,workspaceId,String(item.id),String(engagement.active_tb_version_id),true);
  }
  const redIds=items.filter(row=>row.risk_band==='RED').map(row=>row.executed_by_staff_id).filter((value):value is string=>typeof value==='string');
  if(redIds.length){const people=await env.DB.prepare(`SELECT id,grade FROM staff_members WHERE workspace_id=? AND id IN (${redIds.map(()=>'?').join(',')})`).bind(workspaceId,...redIds).all<{id:string;grade:string}>();if((people.results??[]).some(person=>!['MANAGER','PARTNER'].includes(person.grade)))throw new ApiError('GATE_BLOCKED','Red-risk area work must be executed by Manager-grade staff before Partner clearance.');}
  const openNotes=await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id
    LEFT JOIN procedures p ON p.workspace_id=n.workspace_id AND p.id=n.procedure_id WHERE s.workspace_id=? AND (s.workprogram_id=? OR p.workprogram_id=?) AND n.status<>'CLOSED'`)
    .bind(workspaceId,p.workprogramId,p.workprogramId).first<{count:number}>();
  if(Number(openNotes?.count??0)>0)throw new ApiError('GATE_BLOCKED','Open rework notes block Partner area clearance.');
  const dependencyHash=await rowHash({workprogramSourceHash:workprogram.source_hash,planningVersionId:workprogram.planning_version_id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,
    dependencies:items.map(row=>({id:row.id,version:row.version,status:row.status,sourceHash:row.source_hash,evidenceSetHash:row.evidence_set_hash}))});
  if(dependencyHash!==p.dependencyHash)throw new ApiError('STALE_DEPENDENCY','Procedure or workprogram content changed since the accepted submission.');
  const clearanceId=crypto.randomUUID();const nextVersion=Number(workprogram.version)+1;return commandMutation([versionGuard(env,workspaceId,990,'workprograms','id',p.workprogramId,Number(workprogram.version)),
    env.DB.prepare(`INSERT INTO partner_area_clearances(id,workspace_id,workprogram_id,reviewed_submission_id,partner_actor_id,dependency_hash,rationale,signed_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(clearanceId,workspaceId,p.workprogramId,p.submissionId,context.actor.id,dependencyHash,p.rationale,now),
    env.DB.prepare(`UPDATE workprograms SET version=?,status='PARTNER_CLEARED',updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='REVIEWED'`)
      .bind(nextVersion,now,workspaceId,p.workprogramId,workprogram.version),
    pushChange(env,workspaceId,engagement.id,'Workprogram',p.workprogramId,nextVersion,now)],{clearanceId,workprogramId:p.workprogramId,dependencyHash,signedAt:now,status:'PARTNER_CLEARED',version:nextVersion},'PARTNER_AREA_CLEARANCE',clearanceId,null,1);
}

async function handoverToManager(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'fieldwork.handover-manager'}>,commandId:string,now:string):Promise<BusinessMutation>{
  const p=command.payload;requireReviewer(context);if(context.actor.staffGrade!=='MANAGER')throw new ApiError('PERSONA_ACTION_DENIED','Managerial handover requires an active Manager reviewer.');
  const engagement=await getEngagement(env,workspaceId,context,p.engagementId);if(engagement.lifecycle_state!=='FIELDWORK_EXECUTION')throw new ApiError('INVALID_STATE','Only active fieldwork can be handed over for Manager review.');
  if(engagement.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Engagement',id:p.engagementId,expectedVersion:p.expectedVersion,currentVersion:engagement.version}));
  const confirmationBlockers=await criticalConfirmationBlockers(env,workspaceId,engagement);
  if(confirmationBlockers.length)return queueHoldingLetterForBlockers(env,workspaceId,context,engagement,commandId,now,confirmationBlockers);
  const programs=await env.DB.prepare(`SELECT w.id,w.version,w.status,w.source_hash,w.planning_version_id,
      EXISTS(SELECT 1 FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE s.workspace_id=w.workspace_id AND s.workprogram_id=w.id AND s.target_kind='WORKPROGRAM' AND d.decision='ACCEPT' AND s.target_version+1=w.version) AS independently_accepted
    FROM workprograms w WHERE w.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  const programRows=programs.results??[];if(!programRows.length)throw new ApiError('GATE_BLOCKED','Provision and independently review the applicable workprograms before managerial handover.');
  const programBlockers=programRows.filter(row=>row.status!=='REVIEWED'||Number(row.independently_accepted)!==1||row.planning_version_id!==engagement.approved_planning_version_id);
  const procedureRows=await env.DB.prepare(`SELECT p.id,p.version,p.status,p.source_hash,p.evidence_set_hash,p.mandatory,
      EXISTS(SELECT 1 FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE s.workspace_id=p.workspace_id AND s.procedure_id=p.id AND s.target_kind='PROCEDURE' AND d.decision='ACCEPT' AND s.target_version+1=p.version) AS independently_accepted
    FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id,p.ordinal`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  for(const procedure of procedureRows.results??[]){
    await assertProcedureEvidenceCurrent(env,workspaceId,String(procedure.id),procedure.evidence_set_hash);
    await procedureSamplingPins(env,workspaceId,String(procedure.id),String(engagement.active_tb_version_id),true);
  }
  const procedureBlockers=(procedureRows.results??[]).filter(row=>row.status!=='REVIEWED'||Number(row.independently_accepted)!==1);
  const pendingReviews=await env.DB.prepare(`SELECT s.id,s.target_kind AS targetKind,s.target_version AS targetVersion FROM review_submissions s LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
    WHERE s.workspace_id=? AND s.engagement_id=? AND s.target_kind IN ('ANALYTICAL_REVIEW','GOING_CONCERN') AND d.id IS NULL ORDER BY s.submitted_at`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  const openNotes=await env.DB.prepare(`SELECT n.id,n.text FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE s.workspace_id=? AND s.engagement_id=? AND n.status<>'CLOSED' ORDER BY n.created_at`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  if(programBlockers.length||procedureBlockers.length||(pendingReviews.results??[]).length||(openNotes.results??[]).length){
    const details={workprograms:programBlockers.map(row=>({id:row.id,status:row.status})),procedures:procedureBlockers.map(row=>({id:row.id,status:row.status})),pendingReviews:pendingReviews.results??[],openNotes:openNotes.results??[]};
    throw new ApiError('GATE_BLOCKED',`Current fieldwork is not ready for Manager review: ${JSON.stringify(details)}`);
  }
  const pins={tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id,planningVersionId:engagement.approved_planning_version_id};
  const dependencyHash=await rowHash({engagementId:p.engagementId,pins,workprograms:programRows.map(row=>({id:row.id,version:row.version,status:row.status,sourceHash:row.source_hash})),
    procedures:procedureRows.results?.map(row=>({id:row.id,version:row.version,status:row.status,sourceHash:row.source_hash,evidenceSetHash:row.evidence_set_hash}))});
  const transitionId=crypto.randomUUID();const nextVersion=engagement.version+1;
  return commandMutation([env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,988,CASE WHEN NOT EXISTS(SELECT 1 FROM confirmations c WHERE c.workspace_id=? AND c.engagement_id=? AND c.critical=1 AND c.status<>'CANCELLED'
        AND (c.status<>'RETURNED_VERIFIED' OR c.tb_version_id IS NOT ? OR c.mapping_version_id IS NOT ? OR c.materiality_version_id IS NOT ?))
        THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,engagement.id,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id),
    versionGuard(env,workspaceId,990,'engagements','id',p.engagementId,engagement.version),
    env.DB.prepare(`UPDATE engagements SET version=?,lifecycle_state='MANAGERIAL_REVIEW',updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='FIELDWORK_EXECUTION'`)
      .bind(nextVersion,now,context.actor.id,workspaceId,p.engagementId,engagement.version),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at) VALUES(?,?,?,?,1,'FIELDWORK_EXECUTION','MANAGERIAL_REVIEW',?,?,?,?)`)
      .bind(transitionId,workspaceId,engagement.client_id,p.engagementId,commandId,p.reason,dependencyHash,now),
    pushChange(env,workspaceId,p.engagementId,'Engagement',p.engagementId,nextVersion,now)],{engagementId:p.engagementId,state:'MANAGERIAL_REVIEW',version:nextVersion,transitionId,dependencyHash,blockers:[]},'ENGAGEMENT',p.engagementId,engagement.version,nextVersion,{transitionId,fromState:'FIELDWORK_EXECUTION',toState:'MANAGERIAL_REVIEW',reason:p.reason,dependencyHash});
}

async function handoverToPartner(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'fieldwork.handover-partner'}>,commandId:string,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='MANAGERIAL_REVIEW')throw new ApiError('INVALID_STATE','Partner handover follows Manager review and clearance of every applicable area.');
  if(engagement.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Engagement',id:p.engagementId,expectedVersion:p.expectedVersion,currentVersion:engagement.version}));
  const programs=await env.DB.prepare(`SELECT w.id,w.version,w.status,w.source_hash,w.planning_version_id FROM workprograms w WHERE w.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  const programRows=programs.results??[];if(!programRows.length)throw new ApiError('GATE_BLOCKED','At least one current workprogram must receive Partner clearance before Partner approval.');
  const uncleared:string[]=[];const clearancePins:Array<{workprogramId:string;dependencyHash:string}> = [];
  for(const workprogram of programRows){
    if(workprogram.status!=='PARTNER_CLEARED'||workprogram.planning_version_id!==engagement.approved_planning_version_id){uncleared.push(String(workprogram.id));continue;}
    const procedures=await env.DB.prepare(`SELECT p.id,p.version,p.status,p.source_hash,p.evidence_set_hash,p.ordinal,w.risk_band,p.executed_by_staff_id FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND p.workprogram_id=? ORDER BY p.ordinal`).bind(workspaceId,workprogram.id).all<Record<string,unknown>>();
    const items=procedures.results??[];if(!items.length||items.some(row=>row.status!=='REVIEWED')){uncleared.push(String(workprogram.id));continue;}
    for(const item of items){
      await assertProcedureEvidenceCurrent(env,workspaceId,String(item.id),item.evidence_set_hash);
      await procedureSamplingPins(env,workspaceId,String(item.id),String(engagement.active_tb_version_id),true);
    }
    const dependencyHash=await rowHash({workprogramSourceHash:workprogram.source_hash,planningVersionId:workprogram.planning_version_id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,
      dependencies:items.map(row=>({id:row.id,version:row.version,status:row.status,sourceHash:row.source_hash,evidenceSetHash:row.evidence_set_hash}))});
    const clearance=await env.DB.prepare(`SELECT id FROM partner_area_clearances WHERE workspace_id=? AND workprogram_id=? AND dependency_hash=?`).bind(workspaceId,workprogram.id,dependencyHash).first<{id:string}>();
    if(!clearance){uncleared.push(String(workprogram.id));continue;}clearancePins.push({workprogramId:String(workprogram.id),dependencyHash});
  }
  const openNotes=await env.DB.prepare(`SELECT n.id,n.text FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE s.workspace_id=? AND s.engagement_id=? AND n.status<>'CLOSED' ORDER BY n.created_at`).bind(workspaceId,p.engagementId).all<Record<string,unknown>>();
  if(uncleared.length||(openNotes.results??[]).length)throw new ApiError('GATE_BLOCKED',`Partner approval is blocked by uncleared areas or rework notes: ${JSON.stringify({workprogramIds:uncleared,openNotes:openNotes.results??[]})}`);
  const srm=await env.DB.prepare(`SELECT id,revision,dependency_hash AS dependencyHash,manager_recommendation AS managerRecommendation,estimates_text AS estimatesText FROM srm_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`)
    .bind(workspaceId,p.engagementId).first<{id:string;revision:number;dependencyHash:string;managerRecommendation:string;estimatesText:string}>();
  if(!srm)throw new ApiError('GATE_BLOCKED','Compile the Manager SRM recommendation before Partner handover.');
  const srmInputs=await collectSrmInputs(env,workspaceId,context,p.engagementId);const currentSrmHash=await rowHash({inputDependencyHash:srmInputs.inputDependencyHash,managerRecommendation:srm.managerRecommendation,estimatesText:srm.estimatesText});
  if(currentSrmHash!==srm.dependencyHash)throw new ApiError('STALE_DEPENDENCY','The Manager SRM no longer matches current fieldwork, source pins, or clearances. Recompile before Partner handover.');
  const dependencyHash=await rowHash({engagementId:p.engagementId,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id,
    planningVersionId:engagement.approved_planning_version_id,managerialVersion:engagement.version,areaClearances:clearancePins,srmVersionId:srm.id,srmDependencyHash:srm.dependencyHash});
  const transitionId=crypto.randomUUID();const nextVersion=engagement.version+1;
  return commandMutation([versionGuard(env,workspaceId,990,'engagements','id',p.engagementId,engagement.version),
    env.DB.prepare(`UPDATE engagements SET version=?,lifecycle_state='PARTNER_APPROVAL',updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='MANAGERIAL_REVIEW'`)
      .bind(nextVersion,now,context.actor.id,workspaceId,p.engagementId,engagement.version),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at) VALUES(?,?,?,?,1,'MANAGERIAL_REVIEW','PARTNER_APPROVAL',?,?,?,?)`)
      .bind(transitionId,workspaceId,engagement.client_id,p.engagementId,commandId,p.reason,dependencyHash,now),
    pushChange(env,workspaceId,p.engagementId,'Engagement',p.engagementId,nextVersion,now)],{engagementId:p.engagementId,state:'PARTNER_APPROVAL',version:nextVersion,transitionId,dependencyHash,blockers:[]},'ENGAGEMENT',p.engagementId,engagement.version,nextVersion,{transitionId,fromState:'MANAGERIAL_REVIEW',toState:'PARTNER_APPROVAL',reason:p.reason,dependencyHash});
}

async function currentEvidenceRecord(env:Env,workspaceId:string,engagement:Engagement,evidenceId:string,evidenceVersion:number,requireAdequate:boolean){
  const row=await env.DB.prepare(`SELECT e.id,e.family_id,e.version,e.client_id,e.engagement_id,e.file_version_id,e.mode,f.sha256,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS latestVersion,
      (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy
    FROM evidence_records e LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id WHERE e.workspace_id=? AND e.id=? AND e.version=?`)
    .bind(workspaceId,evidenceId,evidenceVersion).first<Record<string,unknown>>();
  if(!row||row.client_id!==engagement.client_id||row.engagement_id!==engagement.id)throw new ApiError('FORBIDDEN_SCOPE','The evidence reference is outside this engagement.');
  if(row.version!==row.latestVersion)throw new ApiError('STALE_DEPENDENCY','A replacement evidence version exists; refresh this evidence pin.');
  if(requireAdequate&&row.adequacy!=='ADEQUATE')throw new ApiError('GATE_BLOCKED','Current reviewer-accepted adequate evidence is required for this sample test.');
  return row;
}

async function assertLinkedSamplingPlanEditable(env:Env,workspaceId:string,planId:string){
  const linked=await env.DB.prepare(`SELECT p.status FROM sampling_plan_procedure_links l JOIN procedures p ON p.workspace_id=l.workspace_id AND p.id=l.procedure_id
    WHERE l.workspace_id=? AND l.plan_id=?`).bind(workspaceId,planId).first<{status:string}>();
  if(linked&&!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(linked.status))
    throw new ApiError('INVALID_STATE','Sample tests and evaluations are frozen while the linked procedure is submitted or independently reviewed.');
}

async function recordSampleTest(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.record-test'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;
  const target=await env.DB.prepare(`SELECT p.id,p.method,p.population_id,s.engagement_id,s.client_id,s.tb_version_id,e.active_tb_version_id,e.locked_at,e.lifecycle_state
    FROM sampling_plans p JOIN sample_populations s ON s.workspace_id=p.workspace_id AND s.id=p.population_id JOIN engagements e ON e.workspace_id=s.workspace_id AND e.id=s.engagement_id
    WHERE p.workspace_id=? AND p.id=?`).bind(workspaceId,p.planId).first<Record<string,unknown>>();
  if(!target)throw new ApiError('NOT_FOUND','Sampling plan was not found.');if((context.scope.clientId&&context.scope.clientId!==target.client_id)||(context.scope.engagementId&&context.scope.engagementId!==target.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Sampling plan is outside the selected engagement.');
  await assertLinkedSamplingPlanEditable(env,workspaceId,p.planId);
  if(target.locked_at||target.lifecycle_state==='ARCHIVED_READ_ONLY')throw new ApiError('WORKSPACE_FROZEN','Archived sampling plans are read-only.');
  if(target.tb_version_id!==target.active_tb_version_id)throw new ApiError('STALE_DEPENDENCY','Sampling population source TB has changed.');
  const hit=await env.DB.prepare(`SELECT 1 AS ok FROM sample_hits WHERE workspace_id=? AND plan_id=? AND population_row_id=? LIMIT 1`).bind(workspaceId,p.planId,p.populationRowId).first<{ok:number}>();
  if(!hit)throw new ApiError('FORBIDDEN_SCOPE','Only a row selected by this sampling plan can be tested.');
  const existing=await env.DB.prepare(`SELECT id,version FROM sample_tests WHERE workspace_id=? AND plan_id=? AND population_row_id=?`).bind(workspaceId,p.planId,p.populationRowId).first<{id:string;version:number}>();
  if((existing?.version??0)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'SampleTest',id:existing?.id??p.populationRowId,expectedVersion:p.expectedVersion,currentVersion:existing?.version??0}));
  if(p.tested){
    if(String(p.conclusion??'').trim().length<10)throw new ApiError('VALIDATION_FAILED','A tested sample item needs a documented conclusion.');
    if(target.method==='MUS_BINOMIAL_PPS'&&(p.auditedValueMinor==null||p.misstated==null))throw new ApiError('VALIDATION_FAILED','A MUS test requires an audited value and explicit misstatement assessment.');
    if(target.method==='STRATIFIED_ATTRIBUTE'&&p.deviation==null)throw new ApiError('VALIDATION_FAILED','Attribute testing requires an explicit deviation result.');
    if(p.auditedValueMinor!=null&&moneyMinor(p.auditedValueMinor)<0)throw new ApiError('OUTSIDE_ASSUMPTIONS','Negative audited values are outside the approved positive-value sampling policy.');
    if(!p.evidenceId||!p.evidenceVersion)throw new ApiError('VALIDATION_FAILED','A completed sample test needs an exact evidence version pin.');
    const engagement=await getEngagement(env,workspaceId,context,String(target.engagement_id));await currentEvidenceRecord(env,workspaceId,engagement,p.evidenceId,p.evidenceVersion,true);
  }
  const idValue=existing?.id??crypto.randomUUID();const version=p.expectedVersion+1;const sourceHash=await rowHash({planId:p.planId,populationRowId:p.populationRowId,tested:p.tested,auditedValueMinor:p.auditedValueMinor??null,misstated:p.misstated??null,deviation:p.deviation??null,
    conclusion:p.conclusion??null,evidenceId:p.evidenceId??null,evidenceVersion:p.evidenceVersion??null});
  const assertionStatement=existing?versionGuard(env,workspaceId,990,'sample_tests','id',existing.id,p.expectedVersion)
    :env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,990,CASE WHEN NOT EXISTS(SELECT 1 FROM sample_tests WHERE workspace_id=? AND plan_id=? AND population_row_id=?) THEN 1 ELSE 0 END`)
      .bind(workspaceId,workspaceId,p.planId,p.populationRowId);
  const statement=env.DB.prepare(`INSERT INTO sample_tests(id,workspace_id,version,plan_id,population_row_id,tested,audited_value_minor,misstated,deviation,conclusion,evidence_id,evidence_version,source_hash,updated_by_actor_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,plan_id,population_row_id) DO UPDATE SET version=sample_tests.version+1,tested=excluded.tested,
      audited_value_minor=excluded.audited_value_minor,misstated=excluded.misstated,deviation=excluded.deviation,conclusion=excluded.conclusion,evidence_id=excluded.evidence_id,
      evidence_version=excluded.evidence_version,source_hash=excluded.source_hash,updated_by_actor_id=excluded.updated_by_actor_id,updated_at=excluded.updated_at
    WHERE sample_tests.version=?`).bind(idValue,workspaceId,version,p.planId,p.populationRowId,p.tested?1:0,p.tested&&p.auditedValueMinor!=null?moneyMinor(p.auditedValueMinor):null,
      p.tested?p.misstated==null?null:p.misstated?1:0:null,p.tested?p.deviation==null?null:p.deviation?1:0:null,p.tested?p.conclusion:null,p.tested?p.evidenceId??null:null,p.tested?p.evidenceVersion??null:null,sourceHash,context.actor.id,now,p.expectedVersion);
  const statements=[assertionStatement,statement];
  const priorEvidencePins=await targetEvidencePins(env,workspaceId,'sample_test_id',idValue);
  for(const pin of priorEvidencePins.results??[])statements.push(env.DB.prepare(`INSERT INTO evidence_unlinks(id,workspace_id,evidence_link_id,reason,actor_id,unlinked_at) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,pin.id,'Superseded by the exact evidence pin on a new sample-test revision.',context.actor.id,now));
  if(p.tested&&p.evidenceId&&p.evidenceVersion){
    const engagement=await getEngagement(env,workspaceId,context,String(target.engagement_id));const evidence=await currentEvidenceRecord(env,workspaceId,engagement,p.evidenceId,p.evidenceVersion,true);
    statements.push(env.DB.prepare(`INSERT INTO evidence_links(id,workspace_id,client_id,engagement_id,evidence_id,evidence_version,target_version,procedure_id,sample_test_id,analytical_review_id,finding_id,linked_by_actor_id,linked_at)
      VALUES(?,?,?,?,?,?,?,NULL,?,NULL,NULL,?,?)`).bind(crypto.randomUUID(),workspaceId,engagement.client_id,engagement.id,p.evidenceId,p.evidenceVersion,version,idValue,context.actor.id,now));
    void evidence;
  }
  statements.push(pushChange(env,workspaceId,String(target.engagement_id),'SampleTest',idValue,version,now));
  return commandMutation(statements,{sampleTestId:idValue,version,planId:p.planId,populationRowId:p.populationRowId,tested:p.tested,sourceHash},'SAMPLE_TEST',idValue,p.expectedVersion,version);
}

async function evaluateSampling(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.evaluate'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const plan=await env.DB.prepare(`SELECT sp.id,sp.method,sp.confidence_bps,sp.tolerable_minor,sp.expected_tainted_bps,sp.calculated_count,sp.parameters_json,sp.revision,
      pop.id AS population_id,pop.engagement_id,pop.positive_total_minor,pop.source_hash,pop.client_id,pop.tb_version_id
    FROM sampling_plans sp JOIN sample_populations pop ON pop.workspace_id=sp.workspace_id AND pop.id=sp.population_id WHERE sp.workspace_id=? AND sp.id=?`).bind(workspaceId,p.planId).first<Record<string,unknown>>();
  if(!plan)throw new ApiError('NOT_FOUND','Sampling plan was not found.');if((context.scope.clientId&&context.scope.clientId!==plan.client_id)||(context.scope.engagementId&&context.scope.engagementId!==plan.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Sampling plan is outside the selected scope.');
  await assertLinkedSamplingPlanEditable(env,workspaceId,p.planId);
  const engagement=await getEngagement(env,workspaceId,context,String(plan.engagement_id));
  if(plan.tb_version_id!==engagement.active_tb_version_id)throw new ApiError('STALE_DEPENDENCY','The population TB version changed after sample selection. Create a current population and plan before evaluation.');
  const [hitResult,testResult]=await Promise.all([
    env.DB.prepare(`SELECT draw_number AS drawNumber,population_row_id AS populationRowId,stratum_key AS stratumKey FROM sample_hits WHERE workspace_id=? AND plan_id=? ORDER BY draw_number`).bind(workspaceId,p.planId).all<{drawNumber:number;populationRowId:string;stratumKey:string|null}>(),
    env.DB.prepare(`SELECT id,version,population_row_id AS populationRowId,tested,audited_value_minor AS auditedValueMinor,misstated,deviation,conclusion,evidence_id AS evidenceId,evidence_version AS evidenceVersion,source_hash AS sourceHash
      FROM sample_tests WHERE workspace_id=? AND plan_id=? ORDER BY population_row_id`).bind(workspaceId,p.planId).all<Record<string,unknown>>()
  ]);
  const hits=hitResult.results??[];const tests=testResult.results??[];const testHash=await rowHash(tests.map(row=>({id:row.id,version:row.version,populationRowId:row.populationRowId,tested:row.tested,auditedValueMinor:row.auditedValueMinor,
    misstated:row.misstated,deviation:row.deviation,conclusion:row.conclusion,evidenceId:row.evidenceId,evidenceVersion:row.evidenceVersion,sourceHash:row.sourceHash})));
  if(testHash!==p.testSetHash)throw new ApiError('STALE_DEPENDENCY','The sample test set changed. Refresh the sample and evaluate its current exact test versions.');
  const evidenceHealth=await env.DB.prepare(`SELECT t.id,t.evidence_id AS evidenceId,t.evidence_version AS evidenceVersion,t.version,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=t.workspace_id AND e2.family_id=(SELECT e.family_id FROM evidence_records e WHERE e.workspace_id=t.workspace_id AND e.id=t.evidence_id)) AS latestEvidenceVersion,
      (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=t.workspace_id AND d.evidence_id=t.evidence_id AND d.evidence_version=t.evidence_version ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy,
      EXISTS(SELECT 1 FROM evidence_links l LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id
        WHERE l.workspace_id=t.workspace_id AND l.sample_test_id=t.id AND l.evidence_id=t.evidence_id AND l.evidence_version=t.evidence_version AND l.target_version=t.version AND u.id IS NULL) AS hasCurrentEvidencePin
    FROM sample_tests t WHERE t.workspace_id=? AND t.plan_id=? AND t.tested=1`).bind(workspaceId,p.planId).all<Record<string,unknown>>();
  const staleEvidence=(evidenceHealth.results??[]).find(row=>!row.evidenceId||!row.evidenceVersion||Number(row.latestEvidenceVersion)!==Number(row.evidenceVersion)||row.hasCurrentEvidencePin!==1);
  if(staleEvidence)throw new ApiError('STALE_DEPENDENCY','A tested sample item no longer has its exact current evidence pin. Refresh evidence and reassess the affected test.');
  if((evidenceHealth.results??[]).some(row=>row.adequacy!=='ADEQUATE'))throw new ApiError('GATE_BLOCKED','Every completed sample test needs current reviewer-accepted ADEQUATE evidence.');
  const testMap=new Map(tests.map(row=>[String(row.populationRowId),row]));const distinctHitIds=new Set(hits.map(hit=>hit.populationRowId));
  const missing=[...distinctHitIds].filter(rowId=>Number(testMap.get(rowId)?.tested)!==1);const evaluationId=crypto.randomUUID();const prior=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM sampling_evaluations WHERE workspace_id=? AND plan_id=?`).bind(workspaceId,p.planId).first<{revision:number}>();
  const revision=(prior?.revision??0)+1;let details:Record<string,unknown>={method:plan.method,testSetHash:testHash,distinctSelectedCount:distinctHitIds.size,selectedDrawCount:hits.length};let testedHitCount=0;let taintedHitCount=0;let upperBound:number|null=null;let result:'WITHIN_TOLERANCE'|'EXCEEDS_TOLERANCE'|'INCOMPLETE'|'OUTSIDE_ASSUMPTIONS'|'COMPLETED_NONSTATISTICAL'='INCOMPLETE';
  if(missing.length&&plan.method!=='STRATIFIED_ATTRIBUTE'){result='INCOMPLETE';details.missingPopulationRowIds=missing;}
  else if(plan.method==='MUS_BINOMIAL_PPS'){
    for(const hit of hits){const test=testMap.get(hit.populationRowId);if(test&&Number(test.tested)===1){testedHitCount++;if(Number(test.misstated)===1)taintedHitCount++;if(Number(test.auditedValueMinor)<0){result='OUTSIDE_ASSUMPTIONS';details.outsideAssumptionsReason='A tested audited value is negative.';break;}}}
    if(!('outsideAssumptionsReason'in details)){
      const alpha=(10000-Number(plan.confidence_bps))/10000;const pUpper=upperBinomialProbability(taintedHitCount,hits.length,alpha);upperBound=Math.ceil(pUpper*Number(plan.positive_total_minor));
      result=upperBound<=Number(plan.tolerable_minor)?'WITHIN_TOLERANCE':'EXCEEDS_TOLERANCE';details={...details,confidenceBps:plan.confidence_bps,taintedDraws:taintedHitCount,distinctTaintedItems:[...testMap.values()].filter(test=>Number(test.tested)===1&&Number(test.misstated)===1).length,
        upperTaintedBookValueProportion:pUpper,positivePopulationMinor:String(plan.positive_total_minor),upperBoundMinor:String(upperBound),tolerableMinor:String(plan.tolerable_minor),assumption:'Each tainted monetary-unit hit counts as fully tainted; overstatement bound applies only to positive nonnegative audited values.'};
    }
  }else if(plan.method==='SYSTEMATIC'){
    testedHitCount=hits.length;const deviations=hits.filter(hit=>Number(testMap.get(hit.populationRowId)?.deviation)===1).length;
    result='COMPLETED_NONSTATISTICAL';details={...details,selectedItemCount:hits.length,deviations,confidenceClaim:null,
      limitation:'Reviewer-selected systematic sample size does not establish statistical confidence; periodicity and exceptions require reviewer assessment.'};
  }else{
    const stratumResult=await env.DB.prepare(`SELECT id,key,population_count AS populationCount,expected_deviation_bps AS expectedDeviationBps,tolerable_deviation_bps AS tolerableDeviationBps,sample_count AS sampleCount,alpha_numerator AS alphaNumerator,alpha_denominator AS alphaDenominator
      FROM sampling_strata WHERE workspace_id=? AND plan_id=? ORDER BY key`).bind(workspaceId,p.planId).all<Record<string,unknown>>();
    const alpha=(10000-Number(plan.confidence_bps))/10000;const evaluations:Array<{id:string;key:string;population:number;selected:number;tested:number;deviations:number;upper:number|null;result:'WITHIN_TOLERANCE'|'EXCEEDS_TOLERANCE'|'INCOMPLETE'}>=[];
    for(const stratum of stratumResult.results??[]){
      const selected=hits.filter(hit=>hit.stratumKey===stratum.key);const selectedTests=selected.map(hit=>testMap.get(hit.populationRowId));const outstanding=selectedTests.some(test=>Number(test?.tested)!==1);
      const tested=selectedTests.filter(test=>Number(test?.tested)===1).length;const deviations=selectedTests.filter(test=>Number(test?.tested)===1&&Number(test?.deviation)===1).length;
      const populationCount=Number(stratum.populationCount);
      let upper:number|null=null;let stratumOutcome:'WITHIN_TOLERANCE'|'EXCEEDS_TOLERANCE'|'INCOMPLETE';
      if(outstanding)stratumOutcome='INCOMPLETE';else if(selected.length===populationCount) {upper=deviations;stratumOutcome=deviations*10000<=populationCount*Number(stratum.tolerableDeviationBps)?'WITHIN_TOLERANCE':'EXCEEDS_TOLERANCE';}
      else{upper=upperHypergeometricDeviation(deviations,populationCount,selected.length,alpha/(stratumResult.results??[]).length);stratumOutcome=upper*10000<=populationCount*Number(stratum.tolerableDeviationBps)?'WITHIN_TOLERANCE':'EXCEEDS_TOLERANCE';}
      evaluations.push({id:String(stratum.id),key:String(stratum.key),population:populationCount,selected:selected.length,tested,deviations,upper,result:stratumOutcome});
    }
    testedHitCount=evaluations.reduce((sum,item)=>sum+item.tested,0);taintedHitCount=evaluations.reduce((sum,item)=>sum+item.deviations,0);
    result=evaluations.some(item=>item.result==='INCOMPLETE')?'INCOMPLETE':evaluations.some(item=>item.result==='EXCEEDS_TOLERANCE')?'EXCEEDS_TOLERANCE':'WITHIN_TOLERANCE';
    details={...details,confidenceBps:plan.confidence_bps,familywiseMethod:'BONFERRONI',perStratum:evaluations.map(item=>({stratumId:item.id,key:item.key,populationCount:item.population,
      selectedCount:item.selected,testedCount:item.tested,deviationCount:item.deviations,upperPopulationDeviationCount:item.upper,
      upperDeviationRate:item.upper===null?null:{numerator:String(item.upper),denominator:String(item.population)},result:item.result}))};
    upperBound=null;
    // Stratum evaluations are inserted after the parent evaluation below.
  }
  const evaluationStatement=env.DB.prepare(`INSERT INTO sampling_evaluations(id,workspace_id,plan_id,revision,tested_hit_count,tainted_hit_count,upper_bound_minor,result,details_json,reviewed_by_actor_id,reviewed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(evaluationId,workspaceId,p.planId,revision,testedHitCount,taintedHitCount,upperBound,result,JSON.stringify(details),context.actor.id,now);
  const statements:D1PreparedStatement[]=[evaluationStatement];
  if(plan.method==='STRATIFIED_ATTRIBUTE'){
    const perStratum=Array.isArray(details.perStratum)?details.perStratum as Array<Record<string,unknown>>:[];
    for(const item of perStratum){const stratumId=String(item.stratumId);const stratum=await env.DB.prepare(`SELECT population_count AS populationCount FROM sampling_strata WHERE workspace_id=? AND id=?`).bind(workspaceId,stratumId).first<{populationCount:number}>();
      const tested=Number(item.testedCount);const deviations=Number(item.deviationCount);const upper=item.upperPopulationDeviationCount==null?null:Number(item.upperPopulationDeviationCount);const rateDenominator=stratum?.populationCount??0;
      statements.push(env.DB.prepare(`INSERT INTO stratum_evaluations(id,workspace_id,sampling_evaluation_id,stratum_id,tested_count,deviation_count,upper_population_deviation_count,upper_rate_numerator,upper_rate_denominator,result)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,evaluationId,stratumId,tested,deviations,upper,upper,rateDenominator||null,String(item.result)));
    }
  }
  return commandMutation(statements,{evaluationId,planId:p.planId,revision,testedHitCount,taintedHitCount,upperBoundMinor:upperBound===null?null:String(upperBound),result,details},'SAMPLING_EVALUATION',evaluationId,null,revision,{testSetHash:testHash});
}

async function createSamplingPolicy(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.policy.create'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const policyId=crypto.randomUUID();
  const algorithm=p.method==='MUS_BINOMIAL_PPS'?'MUS_BINOMIAL_PPS_V1':p.method==='SYSTEMATIC'?'SYSTEMATIC_LATTICE_V1':'STRATIFIED_HYPERGEOMETRIC_BONFERRONI_V1';
  const limitations=p.method==='MUS_BINOMIAL_PPS'?`${p.assumptions}\nConservative PPS-with-replacement/binomial policy is a firm methodology design decision; it bounds overstatement only for a positive nonnegative population and requires a separate procedure for negative/zero items.`
    :p.method==='SYSTEMATIC'?`${p.assumptions}\nReviewer-selected count is non-statistical; no confidence level or statistical assurance is inferred.`
      :`${p.assumptions}\nExact finite-population hypergeometric evaluation uses Bonferroni alpha allocation across disjoint strata; calculation domain is at most 20,000 rows.`;
  const statement=env.DB.prepare(`INSERT INTO sampling_policies(id,workspace_id,version,name,method,algorithm_version,assumptions,input_schema_json,status,approved_by_actor_id,approved_at,created_by_actor_id,created_at)
    VALUES(?,?,1,?,?,?,?,?,'DRAFT',NULL,NULL,?,?)`).bind(policyId,workspaceId,p.name,p.method,algorithm,limitations,JSON.stringify({method:p.method,confidenceBps:{min:5000,max:9999},serverSeed:true}),context.actor.id,now);
  return commandMutation([statement],{policyId,version:1,method:p.method,algorithmVersion:algorithm,status:'DRAFT',requiresPartnerApproval:true},'SAMPLING_POLICY',policyId,null,1);
}

async function approveSamplingPolicy(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.policy.approve'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const row=await env.DB.prepare(`SELECT version,status,method,algorithm_version AS algorithmVersion,assumptions FROM sampling_policies WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,p.policyId).first<{version:number;status:string;method:string;algorithmVersion:string;assumptions:string}>();
  if(!row)throw new ApiError('NOT_FOUND','Sampling methodology policy was not found.');if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'SamplingPolicy',id:p.policyId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='DRAFT')throw new ApiError('INVALID_STATE','Only a draft sampling policy can receive initial approval.');
  const nextVersion=p.expectedVersion+1;const policyHash=await rowHash({method:row.method,algorithm:row.algorithmVersion,assumptions:row.assumptions,approvedBy:context.actor.id,rationale:p.rationale});
  return commandMutation([versionGuard(env,workspaceId,990,'sampling_policies','id',p.policyId,p.expectedVersion),env.DB.prepare(`UPDATE sampling_policies SET version=?,status='APPROVED',approved_by_actor_id=?,approved_at=? WHERE workspace_id=? AND id=? AND version=?`)
    .bind(nextVersion,context.actor.id,now,workspaceId,p.policyId,p.expectedVersion)],{policyId:p.policyId,version:nextVersion,status:'APPROVED',policyHash,rationale:p.rationale},'SAMPLING_POLICY',p.policyId,p.expectedVersion,nextVersion);
}

async function bytesHash(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function createSamplePopulation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.population.create'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);const file=await committedEvidenceFile(env,workspaceId,engagement,p.sourceFileId);
  if(!['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.media_type))throw new ApiError('UNSUPPORTED_MEDIA_TYPE','Sampling population source must be a committed CSV or XLSX file.');
  if(file.size_bytes>25*1024*1024)throw new ApiError('PAYLOAD_TOO_LARGE','Population source exceeds the supported 25 MB file ceiling.');
  const fsli=await env.DB.prepare(`SELECT id,code FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string;code:string}>();if(!fsli)throw new ApiError('NOT_FOUND','The selected FSLI is not active.');
  const object=await env.FILES.get(file.object_key);if(!object)throw new ApiError('UNAVAILABLE','The committed population source bytes could not be read from private file storage.');
  const bytes=new Uint8Array(await object.arrayBuffer());if(await bytesHash(bytes)!==file.sha256)throw new ApiError('FILE_HASH_MISMATCH','The population file bytes no longer match the committed SHA-256 digest.');
  let workbook:XLSX.WorkBook;try{workbook=XLSX.read(bytes,{type:'array',cellFormula:false,cellDates:false,WTF:true});}catch{throw new ApiError('VALIDATION_FAILED','The selected population file could not be parsed as CSV or XLSX.');}
  const worksheetName=p.worksheet??workbook.SheetNames[0];const sheet=workbook.Sheets[worksheetName];if(!sheet)throw new ApiError('VALIDATION_FAILED','The selected worksheet does not exist in the committed population file.');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}) as unknown[][];const headerIndex=p.headerRow-1;const header=matrix[headerIndex];
  if(!header||Math.max(p.referenceColumn,p.amountColumn,p.descriptionColumn??0)>=header.length)throw new ApiError('VALIDATION_FAILED','The selected header row or population columns do not exist.');
  const seen=new Set<string>();const rows:Array<{id:string;key:string;ordinal:number;amount:number;reference:string;description:string;sourceRowNumber:number}>=[];let excludedCount=0;let positiveTotal=0;
  for(let index=headerIndex+1;index<matrix.length;index++){
    const row=matrix[index]??[];if(row.every(value=>value===null||String(value).trim()===''))continue;
    const reference=String(row[p.referenceColumn]??'').trim();if(!reference)throw new ApiError('INVALID_POPULATION',`Population row ${index+1} has no stable reference.`);
    if(seen.has(reference))throw new ApiError('INVALID_POPULATION',`Population reference ${reference} occurs more than once.`);seen.add(reference);
    const amount=decimalToMinor(row[p.amountColumn]);if(amount<=0)excludedCount++;else{positiveTotal+=amount;if(!Number.isSafeInteger(positiveTotal))throw new ApiError('INVALID_POPULATION','Positive population total exceeds safe integer precision.');}
    rows.push({id:crypto.randomUUID(),key:reference,ordinal:rows.length+1,amount,reference,description:String(row[p.descriptionColumn??p.referenceColumn]??''),sourceRowNumber:index+1});
    if(rows.length>20000)throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','This exact sampling implementation supports up to 20,000 population rows. No population or sample was created.');
  }
  if(!rows.length)throw new ApiError('INVALID_POPULATION','The selected source contains no population records.');
  if(excludedCount&&!p.exclusionsReason)throw new ApiError('INVALID_POPULATION',`${excludedCount} zero or negative balances need a documented alternate procedure before this population is frozen.`);
  if(!positiveTotal)throw new ApiError('INVALID_POPULATION','A positive-value population total is required for monetary-unit sampling.');
  const sourcePins={fileVersionId:file.id,fileSha256:file.sha256,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,fsliId:p.fsliId,
    worksheet:worksheetName,headerRow:p.headerRow,referenceColumn:p.referenceColumn,amountColumn:p.amountColumn};
  const orderHash=await rowHash(rows.map(row=>({ordinal:row.ordinal,key:row.key,amount:row.amount})));
  const sourceHash=await rowHash({pins:sourcePins,orderHash,exclusionsReason:p.exclusionsReason??null});const populationId=crypto.randomUUID();
  const rowValues=rows.map(row=>{
    const eligible=row.amount>0;
    return [row.id,workspaceId,populationId,row.key,row.ordinal,row.amount,eligible?1:0,eligible?null:p.exclusionsReason??null,
      JSON.stringify({reference:row.reference,description:row.description,sourceRowNumber:row.sourceRowNumber})];
  });
  const statements=[env.DB.prepare(`INSERT INTO sample_populations(id,workspace_id,client_id,engagement_id,name,source_file_id,tb_version_id,fsli_id,source_hash,order_hash,row_count,positive_total_minor,excluded_count,exclusions_reason,created_by_actor_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(populationId,workspaceId,engagement.client_id,engagement.id,p.name,file.id,engagement.active_tb_version_id,p.fsliId,sourceHash,orderHash,rows.length,positiveTotal,excludedCount,p.exclusionsReason??'',context.actor.id,now),
    ...makeMultiInsertStatements(env,'population_rows',['id','workspace_id','population_id','source_row_key','ordinal','book_value_minor','eligible','exclusion_reason','source_data_json'],rowValues)];
  return commandMutation(statements,{populationId,rowCount:rows.length,positiveTotalMinor:String(positiveTotal),excludedCount,exclusionsReason:p.exclusionsReason??null,sourceFileId:file.id,sourceHash,orderHash},'SAMPLE_POPULATION',populationId,null,1,{sourcePins});
}

async function createSamplingPlan(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.plan'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  const [population,policy]=await Promise.all([
    env.DB.prepare(`SELECT id,client_id,engagement_id,source_file_id,tb_version_id,fsli_id,source_hash,order_hash,row_count,positive_total_minor,excluded_count,exclusions_reason FROM sample_populations WHERE workspace_id=? AND id=?`)
      .bind(workspaceId,p.populationId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,version,method,algorithm_version AS algorithmVersion,status,approved_by_actor_id AS approvedByActorId FROM sampling_policies WHERE workspace_id=? AND id=?`)
      .bind(workspaceId,p.policyId).first<Record<string,unknown>>()
  ]);
  if(!population||population.engagement_id!==engagement.id||population.client_id!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','The sampling population is outside this engagement.');
  if(population.tb_version_id!==engagement.active_tb_version_id)throw new ApiError('STALE_DEPENDENCY','The population was imported from a prior TB version. Re-import the population before sampling.');
  if(!policy||policy.status!=='APPROVED'||policy.method!==p.method)throw new ApiError('GATE_BLOCKED','An approved firm sampling policy for the selected method is required before operational use.');
  if(p.procedureId){
    const procedure=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,procedure);
    if(procedure.engagement_id!==engagement.id||procedure.fsli_id!==population.fsli_id)throw new ApiError('FORBIDDEN_SCOPE','A sample plan must use a population for the linked procedure FSLI and engagement.');
    if(!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(String(procedure.status)))throw new ApiError('INVALID_STATE','A sample plan can be linked only while its procedure is editable.');
  }
  const rowResult=await env.DB.prepare(`SELECT id,source_row_key,ordinal,book_value_minor,eligible,source_data_json FROM population_rows WHERE workspace_id=? AND population_id=? ORDER BY ordinal`)
    .bind(workspaceId,p.populationId).all<{id:string;source_row_key:string;ordinal:number;book_value_minor:number;eligible:number;source_data_json:string}>();
  const allRows=rowResult.results??[];const revisionRow=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM sampling_plans WHERE workspace_id=? AND population_id=?`).bind(workspaceId,p.populationId).first<{revision:number}>();
  const planId=crypto.randomUUID();const revision=(revisionRow?.revision??0)+1;
  // Isolated Worker tests can inject a deterministic seed directly through the
  // test environment. The public command schema never accepts a seed; deployed
  // Workers always use cryptographically random seed material.
  const testSeedFactory=(env as Env & {__testSamplingSeedFactory?:()=>string}).__testSamplingSeedFactory;
  const seedHex=testSeedFactory?.()??randomToken(32);const random=await keyedSampler(seedHex);
  let hits:Array<{drawNumber:number;rowId:string;monetaryUnitMinor:number|null;stratumKey:string|null}>=[];let strataParams:unknown[]=[];let strataRows:Array<{id:string;key:string;description:string;rows:Array<typeof allRows[number]>;sampleCount:number;alpha:number}>=[];
  let confidenceBps:number|null=null;let tolerableMinor:number|null=null;let expectedBps:number|null=null;let requestedCount:number|null=null;let parameters:Record<string,unknown>={};
  if(p.method==='MUS_BINOMIAL_PPS'){
    if(p.confidenceBps==null||p.tolerableMinor==null||p.expectedTaintedBps==null)throw new ApiError('INVALID_SAMPLE_PARAMETERS','MUS requires confidence, tolerable error and expected tainted-book-value proportion.');
    const total=Number(population.positive_total_minor);tolerableMinor=moneyMinor(p.tolerableMinor);if(!(tolerableMinor>0&&tolerableMinor<total))throw new ApiError('INVALID_SAMPLE_PARAMETERS','MUS requires 0 < tolerable error T < positive population total B.');
    confidenceBps=p.confidenceBps;expectedBps=p.expectedTaintedBps;const pT=tolerableMinor/total;const pE=expectedBps/10000;const alpha=(10000-confidenceBps)/10000;
    const positives=allRows.filter(row=>row.eligible===1&&row.book_value_minor>0);if(!positives.length)throw new ApiError('INVALID_POPULATION','The positive-value MUS population is empty.');
    if(Number(population.excluded_count)>0&&!String(population.exclusions_reason??'').trim())throw new ApiError('INVALID_POPULATION','Zero and negative items require an explicit alternate-procedure rationale.');
    const count=chooseMusCount(pT,pE,alpha);const cumulative:number[]=[];let totalCheck=0;for(const row of positives){totalCheck+=row.book_value_minor;if(!Number.isSafeInteger(totalCheck))throw new ApiError('INVALID_POPULATION','The positive population is outside safe integer precision.');cumulative.push(totalCheck);}
    if(totalCheck!==total)throw new ApiError('INVALID_POPULATION','The positive source rows do not reconcile to the recorded population total.');
    for(let draw=0;draw<count;draw++){
      const unit=Number(await random(draw,BigInt(total)))+1;let low=0,high=cumulative.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(unit<=cumulative[mid])high=mid;else low=mid+1;}
      hits.push({drawNumber:draw+1,rowId:positives[low].id,monetaryUnitMinor:unit,stratumKey:null});
    }
    parameters={populationCount:positives.length,positiveTotalMinor:String(total),excludedCount:Number(population.excluded_count),exclusionsReason:population.exclusions_reason,
      confidenceBps,pT:{numerator:String(tolerableMinor),denominator:String(total)},pE:{bps:expectedBps,meaning:'expected tainted-book-value proportion; not expected monetary error'},alpha:{numerator:String(10000-confidenceBps),denominator:'10000'},selectionMode:'PPS_WITH_REPLACEMENT',algorithmVersion:policy.algorithmVersion};
  }else if(p.method==='SYSTEMATIC'){
    if(p.requestedCount==null||!p.sampleSizeRationale||p.confidenceBps!=null||p.tolerableMinor!=null||p.expectedTaintedBps!=null)throw new ApiError('INVALID_SAMPLE_PARAMETERS','Systematic sampling requires a reviewer-selected count and rationale and accepts no statistical confidence or tolerable error.');
    const sourceOrder=allRows.filter(row=>row.eligible===1);if(!sourceOrder.length||p.requestedCount>sourceOrder.length)throw new ApiError('INVALID_SAMPLE_PARAMETERS',`Requested count must be between 1 and the ${sourceOrder.length} eligible population rows.`);
    const sourceOrderFlags=detectSourceOrderPeriodicity(sourceOrder.map(row=>({eligible:row.eligible,bookValueMinor:row.book_value_minor,sourceDataJson:row.source_data_json})));
    const periodicityAssessment=p.periodicityAssessment?.trim()??'';
    if(sourceOrderFlags.length&&!periodicityAssessment)throw new ApiError('INVALID_SAMPLE_PARAMETERS','The original source order contains a potential repeating pattern. Record how it was assessed before freezing a systematic sample order.');
    const ordered=[...sourceOrder];requestedCount=p.requestedCount;
    if(p.orderingRule==='REFERENCE_ASC')ordered.sort((a,b)=>a.source_row_key<b.source_row_key?-1:a.source_row_key>b.source_row_key?1:a.ordinal-b.ordinal);
    let counter=0;
    if(p.orderingRule==='SERVER_SEEDED_SHUFFLE')for(let index=ordered.length-1;index>0;index--){const swap=Number(await random(counter++,BigInt(index+1)));[ordered[index],ordered[swap]]=[ordered[swap],ordered[index]];}
    const start=requestedCount===ordered.length?0:Number(await random(counter,BigInt(ordered.length)));const selected=new Set<string>();
    for(let j=0;j<requestedCount;j++){const position=Number((BigInt(start)+BigInt(j)*BigInt(ordered.length))/BigInt(requestedCount));const row=ordered[position];if(!row||selected.has(row.id))throw new ApiError('UNAVAILABLE','Systematic selection produced a duplicate position. No plan was saved.');selected.add(row.id);hits.push({drawNumber:j+1,rowId:row.id,monetaryUnitMinor:null,stratumKey:null});}
    const frozenOrderFlags=detectSourceOrderPeriodicity(ordered.map(row=>({eligible:row.eligible,bookValueMinor:row.book_value_minor,sourceDataJson:row.source_data_json})));
    parameters={selectionMode:requestedCount===ordered.length?'CENSUS':'SYSTEMATIC',intervalNumerator:ordered.length,intervalDenominator:requestedCount,startNumerator:String(start),startDenominator:String(requestedCount),orderingRule:p.orderingRule,
      orderingHash:await rowHash(ordered.map(row=>row.id)),orderingAlgorithm:p.orderingRule==='SERVER_SEEDED_SHUFFLE'?'FISHER_YATES_HMAC_SHA256_REJECTION_V1':'CANONICAL_ASC_V1',
      sourceOrderPeriodicityFlags:sourceOrderFlags,frozenOrderPeriodicityFlags:frozenOrderFlags,periodicityAssessment:periodicityAssessment||null,
      sampleSizeRationale:p.sampleSizeRationale,confidenceClaim:null,algorithmVersion:policy.algorithmVersion};
  }else{
    if(p.confidenceBps==null||p.tolerableMinor!=null||p.expectedTaintedBps!=null||p.requestedCount!=null||!p.strata?.length)throw new ApiError('INVALID_SAMPLE_PARAMETERS','Stratified attribute sampling requires confidence and fully specified strata, with no monetary tolerable amount or reviewer-sized count.');
    if(allRows.length>20000)throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','Exact stratified calculations support up to 20,000 source rows.');
    confidenceBps=p.confidenceBps;const alpha=(10000-confidenceBps)/10000;const eligible=new Map(allRows.filter(row=>row.eligible===1).map(row=>[row.id,row]));const memberships=new Set<string>();const keys=new Set<string>();const coverageErrors:string[]=[];
    for(const stratum of p.strata){
      const duplicateKey=keys.has(stratum.key);if(duplicateKey)coverageErrors.push(`Stratum key ${stratum.key} is repeated.`);else keys.add(stratum.key);
      const validRates=stratum.expectedDeviationBps<stratum.tolerableDeviationBps&&stratum.tolerableDeviationBps<10000;
      if(!validRates)coverageErrors.push(`Stratum ${stratum.key} must satisfy 0 <= EDR < TDR < 100%.`);
      const members:Array<typeof allRows[number]>=[];
      for(const rowId of stratum.populationRowIds){const row=eligible.get(rowId);if(!row){coverageErrors.push(`Stratum ${stratum.key} includes an unknown or ineligible population row ${rowId}.`);continue;}if(memberships.has(rowId)){coverageErrors.push(`Population row ${rowId} occurs in overlapping strata.`);continue;}memberships.add(rowId);members.push(row);}
      if(!members.length)coverageErrors.push(`Stratum ${stratum.key} has no unique eligible population rows.`);
      if(!validRates||!members.length||duplicateKey)continue;
      const count=chooseAttributeCount(members.length,stratum.expectedDeviationBps,stratum.tolerableDeviationBps,alpha/p.strata.length);
      strataRows.push({id:crypto.randomUUID(),key:stratum.key,description:stratum.description,rows:members,sampleCount:count,alpha:alpha/p.strata.length});
      strataParams.push({key:stratum.key,description:stratum.description,expectedDeviationBps:stratum.expectedDeviationBps,tolerableDeviationBps:stratum.tolerableDeviationBps,rationale:stratum.rationale,populationCount:members.length,sampleCount:count,alphaNumerator:String(10000-confidenceBps),alphaDenominator:String(10000*p.strata.length)});
    }
    const unassigned=[...eligible.keys()].filter(rowId=>!memberships.has(rowId));
    if(unassigned.length)coverageErrors.push(`${unassigned.length} eligible rows are not assigned to a stratum (examples: ${unassigned.slice(0,20).join(', ')}).`);
    if(coverageErrors.length)throw new ApiError('INVALID_POPULATION','Stratified population coverage is invalid.',{errors:coverageErrors});
    let counter=0;
    for(const stratum of strataRows){
      const shuffled=[...stratum.rows];for(let index=0;index<stratum.sampleCount;index++){const swap=index+Number(await random(counter++,BigInt(shuffled.length-index)));[shuffled[index],shuffled[swap]]=[shuffled[swap],shuffled[index]];}
      for(let index=0;index<stratum.sampleCount;index++)hits.push({drawNumber:hits.length+1,rowId:shuffled[index].id,monetaryUnitMinor:null,stratumKey:stratum.key});
    }
    parameters={confidenceBps,alpha:{numerator:String(10000-confidenceBps),denominator:'10000'},familywiseMethod:'BONFERRONI',
      selectionAlgorithm:'HMAC_SHA256_REJECTION_PARTIAL_FISHER_YATES_V1',strata:strataParams,algorithmVersion:policy.algorithmVersion};
  }
  const inputHash=await rowHash({method:p.method,populationId:population.id,sourceHash:population.source_hash,orderHash:population.order_hash,policyId:policy.id,policyVersion:policy.version,policyAlgorithm:policy.algorithmVersion,
    procedureId:p.procedureId??null,parameters,reason:p.reason});
  const planRow=env.DB.prepare(`INSERT INTO sampling_plans(id,workspace_id,population_id,policy_id,policy_version,revision,method,confidence_bps,tolerable_minor,expected_tainted_bps,requested_count,seed_hex,input_hash,calculated_count,parameters_json,created_by_reviewer_id,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(planId,workspaceId,population.id,policy.id,policy.version,revision,p.method,confidenceBps,tolerableMinor,expectedBps,requestedCount,seedHex,inputHash,hits.length,JSON.stringify(parameters),context.actor.id,p.reason,now);
  const statements:D1PreparedStatement[]=[planRow];
  if(p.procedureId)statements.push(env.DB.prepare(`INSERT INTO sampling_plan_procedure_links(id,workspace_id,plan_id,procedure_id,linked_by_actor_id,linked_at) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,planId,p.procedureId,context.actor.id,now));
  if(strataRows.length){
    for(const stratum of strataRows)statements.push(env.DB.prepare(`INSERT INTO sampling_strata(id,workspace_id,plan_id,key,description,population_count,expected_deviation_bps,tolerable_deviation_bps,alpha_numerator,alpha_denominator,sample_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(stratum.id,workspaceId,planId,stratum.key,stratum.description,stratum.rows.length,
        (p.strata??[]).find(item=>item.key===stratum.key)?.expectedDeviationBps,(p.strata??[]).find(item=>item.key===stratum.key)?.tolerableDeviationBps,String(10000-(confidenceBps??0)),String(10000*strataRows.length),stratum.sampleCount));
    const membershipRows=strataRows.flatMap(stratum=>stratum.rows.map(row=>[crypto.randomUUID(),workspaceId,planId,row.id,stratum.id]));
    statements.push(...makeMultiInsertStatements(env,'stratum_memberships',['id','workspace_id','plan_id','population_row_id','stratum_id'],membershipRows));
  }
  const rowById=new Map(allRows.map(row=>[row.id,row]));const hitRows=hits.map(hit=>[crypto.randomUUID(),workspaceId,planId,hit.drawNumber,hit.rowId,hit.monetaryUnitMinor,hit.stratumKey]);
  statements.push(...makeMultiInsertStatements(env,'sample_hits',['id','workspace_id','plan_id','draw_number','population_row_id','monetary_unit_minor','stratum_key'],hitRows));
  return commandMutation(statements,{planId,revision,method:p.method,calculatedCount:hits.length,distinctRowCount:new Set(hits.map(hit=>hit.rowId)).size,populationCount:p.method==='MUS_BINOMIAL_PPS'
    ?allRows.filter(row=>row.eligible===1&&row.book_value_minor>0).length:allRows.filter(row=>row.eligible===1).length,
    ...(p.method==='SYSTEMATIC'?{interval:{numerator:parameters.intervalNumerator,denominator:parameters.intervalDenominator},start:{numerator:parameters.startNumerator,denominator:parameters.startDenominator},selectionMode:parameters.selectionMode,confidenceClaim:null}:{}),
    ...(strataRows.length?{strata:strataRows.map(row=>({key:row.key,populationCount:row.rows.length,sampleCount:row.sampleCount}))}:{}),inputHash,procedureId:p.procedureId??null},'SAMPLING_PLAN',planId,null,1,
    {populationId:population.id,policyId:policy.id,procedureId:p.procedureId??null,method:p.method,seedHex,parameters,reason:p.reason});
}

function upperBinomialProbability(tainted:number,draws:number,alpha:number):number{
  if(tainted>=draws)return 1;if(tainted===0)return 1-Math.pow(alpha,1/draws);
  let low=0,high=1;for(let iteration=0;iteration<64;iteration++){const mid=(low+high)/2;if(binomialCdf(tainted,draws,mid)>alpha)low=mid;else high=mid;}return (low+high)/2;
}
function upperHypergeometricDeviation(k:number,population:number,draws:number,alpha:number):number{
  let low=0,high=population;while(low<high){const mid=Math.ceil((low+high)/2);if(hypergeometricCdf(k,population,mid,draws)>=alpha)low=mid;else high=mid-1;}return low;
}

async function createEvidence(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'evidence.create'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  if((p.mode==='DIGITAL'||p.mode==='HYBRID')&&!p.fileVersionId)throw new ApiError('VALIDATION_FAILED','Digital evidence must retain committed file bytes.');
  if(p.mode==='PHYSICAL'&&p.fileVersionId)throw new ApiError('VALIDATION_FAILED','A physical-only item cannot be presented as digitally hashed evidence; use HYBRID when both forms are available.');
  const file=p.fileVersionId?await committedEvidenceFile(env,workspaceId,engagement,p.fileVersionId):null;
  let familyId=crypto.randomUUID();let version=1;let supersedes:string|null=null;
  if(p.supersedesEvidenceId){
    const prior=await env.DB.prepare(`SELECT id,family_id,version,client_id,engagement_id FROM evidence_records WHERE workspace_id=? AND id=?`).bind(workspaceId,p.supersedesEvidenceId).first<{id:string;family_id:string;version:number;client_id:string;engagement_id:string}>();
    if(!prior||prior.client_id!==engagement.client_id||prior.engagement_id!==engagement.id)throw new ApiError('FORBIDDEN_SCOPE','The superseded evidence version is outside this engagement.');
    const latest=await env.DB.prepare(`SELECT MAX(version) AS version FROM evidence_records WHERE workspace_id=? AND family_id=?`).bind(workspaceId,prior.family_id).first<{version:number}>();
    if(latest?.version!==prior.version)throw new ApiError('STALE_DEPENDENCY','Supersede the latest evidence revision only.');
    familyId=prior.family_id;version=prior.version+1;supersedes=prior.id;
  }
  const evidenceId=crypto.randomUUID();const statement=env.DB.prepare(`INSERT INTO evidence_records(id,workspace_id,family_id,version,client_id,engagement_id,mode,title,file_version_id,physical_index,physical_description,binder,box,shelf,external_source_url,retrieved_at,supersedes_evidence_id,created_by_actor_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(evidenceId,workspaceId,familyId,version,engagement.client_id,engagement.id,p.mode,p.title,file?.id??null,p.physicalIndex??null,p.physicalDescription??null,p.binder??null,p.box??null,p.shelf??null,p.externalSourceUrl??null,p.retrievedAt??null,supersedes,context.actor.id,now);
  return commandMutation([statement],{evidenceId,familyId,version,mode:p.mode,fileVersionId:file?.id??null,fileSha256:file?.sha256??null,physicalIndex:p.physicalIndex??null,binder:p.binder??null,box:p.box??null,shelf:p.shelf??null,adequacy:'PENDING_VERIFICATION',supersedesEvidenceId:supersedes},'EVIDENCE',evidenceId,null,version);
}

type EvidencePinRow={id:string;evidence_id:string;evidence_version:number;target_version:number;family_id:string;latest_version:number;adequacy:string|null;sha256:string|null;file_version_id:string|null;mode:string};
async function targetEvidencePins(env:Env,workspaceId:string,targetColumn:'procedure_id'|'sample_test_id'|'analytical_review_id'|'finding_id',targetId:string){
  return env.DB.prepare(`SELECT l.id,l.evidence_id,l.evidence_version,l.target_version,e.family_id,e.version AS latest_version,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS current_version,
      (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy,
      f.sha256,e.file_version_id,e.mode
    FROM evidence_links l JOIN evidence_records e ON e.workspace_id=l.workspace_id AND e.id=l.evidence_id
      LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id
      LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id
    WHERE l.workspace_id=? AND l.${targetColumn}=? AND u.id IS NULL ORDER BY l.linked_at,l.id`).bind(workspaceId,targetId)
    .all<EvidencePinRow & {current_version:number}>();
}
function pinHash(pins:Array<{evidenceId:string;evidenceVersion:number;sha256:string|null;adequacy:string|null}>):Promise<string>{
  return rowHash([...pins].sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId)).map(pin=>({id:pin.evidenceId,version:pin.evidenceVersion,sha256:pin.sha256,adequacy:pin.adequacy})));
}
async function linkEvidence(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'evidence.link'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const evidence=await env.DB.prepare(`SELECT e.id,e.version,e.family_id,e.client_id,e.engagement_id,e.mode,e.file_version_id,f.sha256,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS latest_version,
      (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy
    FROM evidence_records e LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id WHERE e.workspace_id=? AND e.id=? AND e.version=?`)
    .bind(workspaceId,p.evidenceId,p.evidenceVersion).first<Record<string,unknown>>();
  if(!evidence||evidence.version!==evidence.latest_version)throw new ApiError('STALE_DEPENDENCY','Link the latest version of current evidence.');
  const engagement=await getEngagement(env,workspaceId,context,String(evidence.engagement_id));if(evidence.client_id!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','Evidence is outside this client.');
  const target=p.procedureId?{column:'procedure_id' as const,id:p.procedureId,kind:'procedure'}:p.sampleTestId?{column:'sample_test_id' as const,id:p.sampleTestId,kind:'sampleTest'}:p.analyticalReviewId?{column:'analytical_review_id' as const,id:p.analyticalReviewId,kind:'analyticalReview'}:{column:'finding_id' as const,id:String(p.findingId),kind:'finding'};
  let targetRow:Record<string,unknown>|null=null;let resultType='';let targetEngagementId=engagement.id;
  if(target.kind==='procedure'){
    targetRow=await currentProcedure(env,workspaceId,target.id);await verifyProcedureScope(context,targetRow);
    if(targetRow.engagement_id!==engagement.id)throw new ApiError('FORBIDDEN_SCOPE','Evidence target and source must be in the same engagement.');
    if(Number(targetRow.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:target.id,expectedVersion:p.targetVersion,currentVersion:targetRow.version}));
    if(!['NOT_STARTED','IN_PROGRESS','UNDER_REWORK'].includes(String(targetRow.status)))throw new ApiError('INVALID_STATE','Submitted or reviewed procedures require a rework decision before evidence can change.');
    resultType='PROCEDURE';
  }else if(target.kind==='analyticalReview'){
    targetRow=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,status,source_hash,statement_snapshot_id,fsli_id,expectation_text,threshold_minor,threshold_bps,explanation,conclusion,prepared_by_actor_id
      FROM analytical_reviews WHERE workspace_id=? AND id=?`).bind(workspaceId,target.id).first<Record<string,unknown>>();
    if(!targetRow||targetRow.engagement_id!==engagement.id)throw new ApiError('FORBIDDEN_SCOPE','Analytical review target is outside this engagement.');
    if(Number(targetRow.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AnalyticalReview',id:target.id,expectedVersion:p.targetVersion,currentVersion:targetRow.version}));
    if(!['DRAFT','UNDER_REWORK'].includes(String(targetRow.status)))throw new ApiError('INVALID_STATE','A submitted analytical review is frozen until it is returned for rework.');resultType='ANALYTICAL_REVIEW';
  }else if(target.kind==='sampleTest'){
    targetRow=await env.DB.prepare(`SELECT t.id,t.version,t.tested,t.plan_id,pop.engagement_id,pop.client_id FROM sample_tests t JOIN sampling_plans p ON p.workspace_id=t.workspace_id AND p.id=t.plan_id
      JOIN sample_populations pop ON pop.workspace_id=p.workspace_id AND pop.id=p.population_id WHERE t.workspace_id=? AND t.id=?`).bind(workspaceId,target.id).first<Record<string,unknown>>();
    if(!targetRow||targetRow.engagement_id!==engagement.id||Number(targetRow.tested)!==1)throw new ApiError('INVALID_STATE','Evidence can link only to a completed sample test in this engagement.');
    if(Number(targetRow.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'SampleTest',id:target.id,expectedVersion:p.targetVersion,currentVersion:targetRow.version}));resultType='SAMPLE_TEST';
  }else{
    targetRow=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,source_hash,status FROM findings WHERE workspace_id=? AND id=?`).bind(workspaceId,target.id).first<Record<string,unknown>>();
    if(!targetRow||targetRow.engagement_id!==engagement.id)throw new ApiError('FORBIDDEN_SCOPE','Finding target is outside this engagement.');
    if(Number(targetRow.version)!==p.targetVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Finding',id:target.id,expectedVersion:p.targetVersion,currentVersion:targetRow.version}));resultType='FINDING';
  }
  const column=target.column;const existing=await targetEvidencePins(env,workspaceId,column,target.id);const active=(existing.results??[]).filter(row=>row.evidence_version===row.current_version);
  if(active.some(row=>row.evidence_id===p.evidenceId))throw new ApiError('VERSION_CONFLICT','This exact evidence version is already linked to the target.');
  const nextVersion=p.targetVersion+1;const nextPins=[...active.filter(row=>row.family_id!==evidence.family_id).map(row=>({evidenceId:row.evidence_id,evidenceVersion:row.evidence_version,sha256:row.sha256,adequacy:row.adequacy})),
    {evidenceId:p.evidenceId,evidenceVersion:p.evidenceVersion,sha256:evidence.sha256 as string|null,adequacy:evidence.adequacy as string|null}];
  const evidenceHash=await pinHash(nextPins);const statements:D1PreparedStatement[]=[];const createdLinkIds:string[]=[];let selectedLinkId:string|null=null;
  for(const old of existing.results??[])statements.push(env.DB.prepare(`INSERT INTO evidence_unlinks(id,workspace_id,evidence_link_id,reason,actor_id,unlinked_at) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,old.id,'Superseded by a new evidence target-version pin; prior provenance remains in the audit file.',context.actor.id,now));
  for(const pin of nextPins){
    const evidenceId=pin.evidenceId;const evidenceVersion=pin.evidenceVersion;
    const newLinkId=crypto.randomUUID();createdLinkIds.push(newLinkId);if(evidenceId===p.evidenceId&&evidenceVersion===p.evidenceVersion)selectedLinkId=newLinkId;
    const rowTarget=target.kind==='procedure'?{procedureId:target.id,sampleTestId:null,analyticalReviewId:null,findingId:null}
      :target.kind==='sampleTest'?{procedureId:null,sampleTestId:target.id,analyticalReviewId:null,findingId:null}
        :target.kind==='analyticalReview'?{procedureId:null,sampleTestId:null,analyticalReviewId:target.id,findingId:null}:{procedureId:null,sampleTestId:null,analyticalReviewId:null,findingId:target.id};
    statements.push(env.DB.prepare(`INSERT INTO evidence_links(id,workspace_id,client_id,engagement_id,evidence_id,evidence_version,target_version,procedure_id,sample_test_id,analytical_review_id,finding_id,linked_by_actor_id,linked_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(newLinkId,workspaceId,engagement.client_id,engagement.id,evidenceId,evidenceVersion,nextVersion,rowTarget.procedureId,rowTarget.sampleTestId,rowTarget.analyticalReviewId,rowTarget.findingId,context.actor.id,now));
  }
  const sourceHash=await rowHash({previousSourceHash:targetRow.source_hash??null,evidenceHash,targetVersion:nextVersion});
  if(target.kind==='procedure'){
    const content={version:nextVersion,workprogramId:targetRow.workprogram_id,ordinal:targetRow.ordinal,title:targetRow.title,instructions:targetRow.instructions,assertion:targetRow.assertion,origin:targetRow.origin,mandatory:targetRow.mandatory,
      scopeReason:targetRow.scope_reason,workPerformed:targetRow.work_performed,conclusion:targetRow.conclusion,applicable:Boolean(targetRow.applicable),notApplicableReason:targetRow.not_applicable_reason,status:targetRow.status};
    statements.unshift(versionGuard(env,workspaceId,990,'procedures','id',target.id,p.targetVersion));
    statements.push(env.DB.prepare(`UPDATE procedures SET version=?,evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,evidenceHash,sourceHash,now,workspaceId,target.id,p.targetVersion));
    statements.push(env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,target.id,nextVersion,JSON.stringify(content),evidenceHash,context.actor.id,now,'Evidence pins changed; procedure content was preserved.'));
    statements.push(pushChange(env,workspaceId,engagement.id,'Procedure',target.id,nextVersion,now));
  }else if(target.kind==='analyticalReview'){
    statements.unshift(versionGuard(env,workspaceId,990,'analytical_reviews','id',target.id,p.targetVersion));
    statements.push(env.DB.prepare(`UPDATE analytical_reviews SET version=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,sourceHash,now,workspaceId,target.id,p.targetVersion));
  }else if(target.kind==='sampleTest'){
    statements.unshift(versionGuard(env,workspaceId,990,'sample_tests','id',target.id,p.targetVersion));
    statements.push(env.DB.prepare(`UPDATE sample_tests SET version=?,evidence_id=?,evidence_version=?,source_hash=?,updated_by_actor_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,p.evidenceId,p.evidenceVersion,sourceHash,context.actor.id,now,workspaceId,target.id,p.targetVersion));
  }else{
    statements.unshift(versionGuard(env,workspaceId,990,'findings','id',target.id,p.targetVersion));
    statements.push(env.DB.prepare(`UPDATE findings SET version=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,sourceHash,now,workspaceId,target.id,p.targetVersion));
  }
  return commandMutation(statements,{linkId:selectedLinkId,linkIds:createdLinkIds,targetId:target.id,targetVersion:nextVersion,evidenceId:p.evidenceId,evidenceVersion:p.evidenceVersion,version:nextVersion,evidenceSetHash:evidenceHash},resultType,target.id,p.targetVersion,nextVersion);
}

async function reviewEvidence(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'evidence.review'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const record=await env.DB.prepare(`SELECT e.id,e.version,e.family_id,e.client_id,e.engagement_id,e.file_version_id,e.mode,e.physical_description,e.physical_index,e.binder,e.box,e.shelf,e.created_by_actor_id,
      (SELECT MAX(e2.version) FROM evidence_records e2 WHERE e2.workspace_id=e.workspace_id AND e2.family_id=e.family_id) AS latest_version
    FROM evidence_records e WHERE e.workspace_id=? AND e.id=? AND e.version=?`).bind(workspaceId,p.evidenceId,p.evidenceVersion).first<Record<string,unknown>>();
  if(!record||record.version!==record.latest_version)throw new ApiError('STALE_DEPENDENCY','Review the latest evidence version only.');
  const [creatorKey,reviewer]=await Promise.all([actorNaturalPerson(env,workspaceId,String(record.created_by_actor_id)),actorStaff(env,workspaceId,context)]);
  if(record.created_by_actor_id===context.actor.id||(creatorKey&&creatorKey===reviewer.natural_person_key))throw new ApiError('SELF_REVIEW_BLOCKED','The same natural person cannot review evidence they recorded, even after switching personas.');
  const engagement=await getEngagement(env,workspaceId,context,String(record.engagement_id));if(record.client_id!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','Evidence is outside this engagement.');
  if(p.status==='ADEQUATE'){
    if((record.mode==='DIGITAL'||record.mode==='HYBRID')&&record.file_version_id){await committedEvidenceFile(env,workspaceId,engagement,String(record.file_version_id));}
    if((record.mode==='PHYSICAL'||record.mode==='HYBRID')&&(!record.physical_index||!record.physical_description||(!record.binder&&!record.box&&!record.shelf)))throw new ApiError('GATE_BLOCKED','Complete the physical index, description and locator before adequacy approval.');
  }
  const decisionId=crypto.randomUUID();const statement=env.DB.prepare(`INSERT INTO evidence_adequacy_decisions(id,workspace_id,evidence_id,evidence_version,adequacy,rationale,reviewed_by_actor_id,reviewed_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(decisionId,workspaceId,p.evidenceId,p.evidenceVersion,p.status,p.rationale,context.actor.id,now);
  return commandMutation([statement],{evidenceId:p.evidenceId,evidenceVersion:p.evidenceVersion,decisionId,adequacy:p.status,rationale:p.rationale},'EVIDENCE_ADEQUACY_DECISION',decisionId,null,1);
}

async function unlinkEvidence(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'evidence.unlink'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const link=await env.DB.prepare(`SELECT l.id,l.client_id,l.engagement_id,l.evidence_id,l.evidence_version,l.target_version,l.procedure_id,l.sample_test_id,l.analytical_review_id,l.finding_id,
      u.id AS unlinkedId FROM evidence_links l LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id WHERE l.workspace_id=? AND l.id=?`)
    .bind(workspaceId,p.evidenceLinkId).first<Record<string,unknown>>();
  if(!link)throw new ApiError('NOT_FOUND','Evidence link was not found.');if(link.unlinkedId)throw new ApiError('INVALID_STATE','This evidence link has already been unlinked.');
  const engagement=await getEngagement(env,workspaceId,context,String(link.engagement_id));if(link.client_id!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','Evidence link is outside this engagement.');
  const unlinkId=crypto.randomUUID();const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO evidence_unlinks(id,workspace_id,evidence_link_id,reason,actor_id,unlinked_at) VALUES(?,?,?,?,?,?)`)
    .bind(unlinkId,workspaceId,p.evidenceLinkId,p.reason,context.actor.id,now)];
  let targetId='';let entityType='EVIDENCE_LINK';let beforeVersion:number|null=null;let afterVersion=1;
  if(link.procedure_id){
    const row=await currentProcedure(env,workspaceId,String(link.procedure_id));await verifyProcedureScope(context,row);targetId=String(row.id);entityType='PROCEDURE';beforeVersion=Number(row.version);afterVersion=beforeVersion+1;
    const remaining=await targetEvidencePins(env,workspaceId,'procedure_id',targetId);const pins=(remaining.results??[]).filter(item=>item.id!==p.evidenceLinkId&&item.evidence_version===item.current_version)
      .map(item=>({evidenceId:item.evidence_id,evidenceVersion:item.evidence_version,sha256:item.sha256,adequacy:item.adequacy}));const hash=await pinHash(pins);
    statements.push(versionGuard(env,workspaceId,990,'procedures','id',targetId,beforeVersion));
    statements.push(env.DB.prepare(`UPDATE procedures SET version=?,status='UNDER_REWORK',evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(afterVersion,hash,await rowHash({sourceHash:row.source_hash,evidenceHash:hash,unlinkReason:p.reason}),now,workspaceId,targetId,beforeVersion));
    statements.push(env.DB.prepare(`UPDATE procedure_submissions SET status='UNDER_REWORK' WHERE workspace_id=? AND procedure_id=? AND status='SUBMITTED'`).bind(workspaceId,targetId));
    statements.push(pushChange(env,workspaceId,engagement.id,'Procedure',targetId,afterVersion,now));
  }else if(link.analytical_review_id){
    const row=await env.DB.prepare(`SELECT id,version,source_hash FROM analytical_reviews WHERE workspace_id=? AND id=?`).bind(workspaceId,link.analytical_review_id).first<Record<string,unknown>>();
    if(row){targetId=String(row.id);entityType='ANALYTICAL_REVIEW';beforeVersion=Number(row.version);afterVersion=beforeVersion+1;const pins=await targetEvidencePins(env,workspaceId,'analytical_review_id',targetId);
      statements.push(versionGuard(env,workspaceId,990,'analytical_reviews','id',targetId,beforeVersion));statements.push(env.DB.prepare(`UPDATE analytical_reviews SET version=?,status='UNDER_REWORK',source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
        .bind(afterVersion,await rowHash({sourceHash:row.source_hash,evidenceLinks:pins.results?.filter(item=>item.id!==p.evidenceLinkId),unlinkReason:p.reason}),now,workspaceId,targetId,beforeVersion));}
  }else if(link.sample_test_id){
    const row=await env.DB.prepare(`SELECT id,version,source_hash FROM sample_tests WHERE workspace_id=? AND id=?`).bind(workspaceId,link.sample_test_id).first<Record<string,unknown>>();
    if(row){targetId=String(row.id);entityType='SAMPLE_TEST';beforeVersion=Number(row.version);afterVersion=beforeVersion+1;statements.push(versionGuard(env,workspaceId,990,'sample_tests','id',targetId,beforeVersion));
      statements.push(env.DB.prepare(`UPDATE sample_tests SET version=?,tested=0,audited_value_minor=NULL,misstated=NULL,deviation=NULL,conclusion=NULL,evidence_id=NULL,evidence_version=NULL,source_hash=?,updated_by_actor_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
        .bind(afterVersion,await rowHash({sourceHash:row.source_hash,unlinkReason:p.reason}),context.actor.id,now,workspaceId,targetId,beforeVersion));}
  }else if(link.finding_id){
    const row=await env.DB.prepare(`SELECT id,version,source_hash FROM findings WHERE workspace_id=? AND id=?`).bind(workspaceId,link.finding_id).first<Record<string,unknown>>();
    if(row){targetId=String(row.id);entityType='FINDING';beforeVersion=Number(row.version);afterVersion=beforeVersion+1;statements.push(versionGuard(env,workspaceId,990,'findings','id',targetId,beforeVersion));
      statements.push(env.DB.prepare(`UPDATE findings SET version=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(afterVersion,await rowHash({sourceHash:row.source_hash,unlinkReason:p.reason}),now,workspaceId,targetId,beforeVersion));}
  }
  if(targetId)statements.push(pushChange(env,workspaceId,engagement.id,entityType,targetId,afterVersion,now));
  return commandMutation(statements,{unlinkId,evidenceLinkId:p.evidenceLinkId,targetId:targetId||null,reason:p.reason,affectedEntityVersion:afterVersion,requiresReassessment:Boolean(targetId)},entityType,targetId||unlinkId,beforeVersion,afterVersion);
}

type AdjustmentLineInput={fsliId:string;accountCode?:string|null;debitMinor:string;creditMinor:string};
type AdjustmentRow={id:string;version:number;client_id:string;engagement_id:string;number:string;tb_version_id:string;finding_id:string|null;description:string;status:string;
  mapping_version_id:string|null;materiality_version_id:string|null;
  reflected_in_source:number;reflected_in_source_reason:string|null;include_in_statements:number;client_response:string|null;client_response_decision:string|null;client_response_file_id:string|null;
  client_responded_by_actor_id:string|null;client_responded_at:string|null;source_hash:string;created_by_actor_id:string;approved_by_actor_id:string|null;created_at:string;updated_at:string};
type AdjustmentLineRow={id:string;fsli_id:string;account_code:string|null;debit_minor:number;credit_minor:number};
async function adjustmentLines(env:Env,workspaceId:string,adjustmentId:string):Promise<AdjustmentLineRow[]>{
  const result=await env.DB.prepare(`SELECT id,fsli_id,account_code,debit_minor,credit_minor FROM audit_adjustment_lines WHERE workspace_id=? AND adjustment_id=? ORDER BY id`).bind(workspaceId,adjustmentId).all<AdjustmentLineRow>();
  return result.results??[];
}
async function adjustmentEvidence(env:Env,workspaceId:string,adjustmentId:string):Promise<Array<Record<string,unknown>>>{
  const result=await env.DB.prepare(`SELECT id,evidence_id AS evidenceId,evidence_version AS evidenceVersion,file_sha256 AS fileSha256,source_snapshot_json AS sourceSnapshotJson,linked_by_actor_id AS linkedByActorId,linked_at AS linkedAt
    FROM audit_adjustment_evidence_links WHERE workspace_id=? AND adjustment_id=? ORDER BY id`).bind(workspaceId,adjustmentId).all<Record<string,unknown>>();
  return (result.results??[]).map(row=>({...row,sourceSnapshot:JSON.parse(String(row.sourceSnapshotJson))}));
}
async function verifyAdjustmentEvidence(env:Env,workspaceId:string,engagement:Engagement,evidence:Array<Record<string,unknown>>){
  for(const pin of evidence){const version=Number(pin.evidenceVersion);const current=await currentEvidenceRecord(env,workspaceId,engagement,String(pin.evidenceId),version,true);
    const snapshot=pin.sourceSnapshot as Record<string,unknown>;if((current.sha256??null)!==(snapshot.fileSha256??null))throw new ApiError('STALE_DEPENDENCY','An AJE evidence file changed after it was pinned. Refresh evidence and revise the adjustment.');
    const currentDecision=await env.DB.prepare(`SELECT id FROM evidence_adequacy_decisions WHERE workspace_id=? AND evidence_id=? ORDER BY reviewed_at DESC LIMIT 1`).bind(workspaceId,pin.evidenceId).first<{id:string}>();
    if(currentDecision?.id!==snapshot.adequacyDecisionId)throw new ApiError('STALE_DEPENDENCY','An AJE evidence adequacy decision changed after it was pinned. Reassess the adjustment against the current review.');
  }
}
function adjustmentRevision(env:Env,workspaceId:string,adjustmentId:string,revision:number,snapshot:unknown,sourceHash:string,actorId:string,now:string){
  return env.DB.prepare(`INSERT INTO audit_adjustment_revisions(id,workspace_id,adjustment_id,revision,snapshot_json,source_hash,changed_by_actor_id,changed_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,adjustmentId,revision,JSON.stringify(snapshot),sourceHash,actorId,now);
}
function assertBalancedAdjustment(lines:Array<{debitMinor:string|number;creditMinor:string|number}>){
  const debit=lines.reduce((sum,line)=>sum+BigInt(line.debitMinor),0n);const credit=lines.reduce((sum,line)=>sum+BigInt(line.creditMinor),0n);
  if(debit!==credit)throw new ApiError('UNBALANCED_ADJUSTMENT',`The adjustment must balance in QAR minor units (debits ${debit}, credits ${credit}).`);
  if(debit>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The adjustment total exceeds safe QAR minor-unit precision.');
  return {debitMinor:debit.toString(),creditMinor:credit.toString()};
}
async function validateActiveFslis(env:Env,workspaceId:string,lines:AdjustmentLineInput[]){
  const ids=[...new Set(lines.map(line=>line.fsliId))];const found=new Set<string>();
  for(let offset=0;offset<ids.length;offset+=80){const part=ids.slice(offset,offset+80);const placeholders=part.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND active=1 AND id IN (${placeholders})`).bind(workspaceId,...part).all<{id:string}>();
    for(const row of rows.results??[])found.add(row.id);
  }
  if(found.size!==ids.length)throw new ApiError('VALIDATION_FAILED','Every adjustment line must reference an active financial-statement line.');
}
function adjustmentSnapshot(header:Record<string,unknown>,lines:Array<Record<string,unknown>>){
  return {adjustment:{id:header.id,version:header.version,number:header.number,clientId:header.client_id,engagementId:header.engagement_id,tbVersionId:header.tb_version_id,
    mappingVersionId:header.mapping_version_id,materialityVersionId:header.materiality_version_id,
    findingId:header.finding_id,description:header.description,status:header.status,reflectedInSource:header.reflected_in_source,reflectedInSourceReason:header.reflected_in_source_reason,
    includeInStatements:header.include_in_statements,clientResponse:header.client_response_decision,clientResponseText:header.client_response,clientResponseFileId:header.client_response_file_id,
    clientRespondedByActorId:header.client_responded_by_actor_id,clientRespondedAt:header.client_responded_at,sourceHash:header.source_hash,createdByActorId:header.created_by_actor_id,
    approvedByActorId:header.approved_by_actor_id,createdAt:header.created_at,updatedAt:header.updated_at,evidence:header.evidence??[]},lines};
}

async function createFinding(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'finding.create'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  const fsli=await env.DB.prepare(`SELECT id,code FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string;code:string}>();
  if(!fsli)throw new ApiError('NOT_FOUND','An active FSLI is required for a finding.');
  const findingId=crypto.randomUUID();const sourceHash=await rowHash({engagementId:engagement.id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,
    materialityVersionId:engagement.active_materiality_version_id,fsliId:fsli.id,title:p.title,description:p.description,severity:p.severity,qualitativeSignificance:p.qualitativeSignificance});
  return commandMutation([env.DB.prepare(`INSERT INTO findings(id,workspace_id,version,client_id,engagement_id,fsli_id,tb_version_id,mapping_version_id,materiality_version_id,title,description,severity,qualitative_significance,status,client_response,resolution,created_by_actor_id,source_hash,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,'OPEN',NULL,NULL,?,?,?,?)`).bind(findingId,workspaceId,engagement.client_id,engagement.id,fsli.id,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,p.title,p.description,p.severity,p.qualitativeSignificance?1:0,context.actor.id,sourceHash,now,now),
    pushChange(env,workspaceId,engagement.id,'Finding',findingId,1,now)],{findingId,version:1,status:'OPEN',sourceHash,fsliCode:fsli.code},'FINDING',findingId,null,1,{fsliId:fsli.id,severity:p.severity,qualitativeSignificance:p.qualitativeSignificance});
}

async function respondFinding(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'finding.respond'}>,now:string):Promise<BusinessMutation>{
  const p=command.payload;
  if(context.actor.persona!=='CLIENT')throw new ApiError('PERSONA_ACTION_DENIED','A finding response must come from the scoped CLIENT persona.');
  const finding=await env.DB.prepare(`SELECT f.id,f.version,f.client_id,f.engagement_id,f.status,f.source_hash,e.lifecycle_state,e.locked_at
    FROM findings f JOIN engagements e ON e.workspace_id=f.workspace_id AND e.id=f.engagement_id WHERE f.workspace_id=? AND f.id=?`).bind(workspaceId,p.findingId)
    .first<{id:string;version:number;client_id:string;engagement_id:string;status:string;source_hash:string;lifecycle_state:string;locked_at:string|null}>();
  if(!finding)throw new ApiError('NOT_FOUND','The finding was not found.');
  if(context.actor.clientId!==finding.client_id||(context.scope.clientId&&context.scope.clientId!==finding.client_id)||(context.scope.engagementId&&context.scope.engagementId!==finding.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','The finding is outside the selected client engagement.');
  if(finding.locked_at||!['FIELDWORK_EXECUTION','MANAGERIAL_REVIEW'].includes(finding.lifecycle_state))throw new ApiError('WORKSPACE_FROZEN','Client finding responses are closed for this engagement stage.');
  if(finding.status!=='OPEN')throw new ApiError('INVALID_STATE','Only an open finding can receive its first client response.');
  if(Number(finding.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Finding',id:p.findingId,expectedVersion:p.expectedVersion,currentVersion:finding.version}));
  const nextVersion=Number(finding.version)+1;const sourceHash=await rowHash({priorSourceHash:finding.source_hash,response:p.clientResponse,actorId:context.actor.id,respondedAt:now});
  return commandMutation([versionGuard(env,workspaceId,990,'findings','id',p.findingId,Number(finding.version)),
    env.DB.prepare(`UPDATE findings SET version=?,status='RESPONDED',client_response=?,client_responded_by_actor_id=?,client_responded_at=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,p.clientResponse,context.actor.id,now,sourceHash,now,workspaceId,p.findingId,finding.version),
    pushChange(env,workspaceId,finding.engagement_id,'Finding',p.findingId,nextVersion,now)],{findingId:p.findingId,version:nextVersion,status:'RESPONDED',sourceHash},'FINDING',p.findingId,Number(finding.version),nextVersion,{clientResponseRecorded:true});
}

async function resolveFinding(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'finding.resolve'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const finding=await env.DB.prepare(`SELECT id,version,engagement_id,status,client_response,source_hash,created_by_actor_id FROM findings WHERE workspace_id=? AND id=?`).bind(workspaceId,p.findingId)
    .first<{id:string;version:number;engagement_id:string;status:string;client_response:string|null;source_hash:string;created_by_actor_id:string}>();
  if(!finding)throw new ApiError('NOT_FOUND','The finding was not found.');const engagement=await getEngagement(env,workspaceId,context,finding.engagement_id);
  if(finding.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Finding',id:p.findingId,expectedVersion:p.expectedVersion,currentVersion:finding.version}));
  if(finding.status!=='RESPONDED'||!finding.client_response)throw new ApiError('GATE_BLOCKED','A finding can be resolved only after the scoped client response is recorded.');
  const evidencePins=await targetEvidencePins(env,workspaceId,'finding_id',finding.id);const pins=evidencePins.results??[];
  if(pins.some(pin=>pin.evidence_version!==pin.latest_version||pin.latest_version!==pin.current_version))throw new ApiError('STALE_DEPENDENCY','A finding has a superseded evidence pin. Refresh and reassess its current evidence before resolution.');
  if(pins.some(pin=>pin.adequacy!=='ADEQUATE'))throw new ApiError('GATE_BLOCKED','Every linked finding evidence item must be independently assessed as ADEQUATE before resolution.');
  const reviewer=await actorStaff(env,workspaceId,context);const preparer=await actorNaturalPerson(env,workspaceId,finding.created_by_actor_id);
  if(!preparer||reviewer.natural_person_key===preparer)throw new ApiError('SELF_REVIEW_BLOCKED','The finding preparer cannot independently resolve the same finding.');
  const nextVersion=finding.version+1;const sourceHash=await rowHash({priorSourceHash:finding.source_hash,resolution:p.resolution,reviewerActorId:context.actor.id,resolvedAt:now});
  return commandMutation([versionGuard(env,workspaceId,990,'findings','id',finding.id,finding.version),
    env.DB.prepare(`UPDATE findings SET version=?,status='RESOLVED',resolution=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='RESPONDED'`)
      .bind(nextVersion,p.resolution,sourceHash,now,workspaceId,finding.id,finding.version),pushChange(env,workspaceId,engagement.id,'Finding',finding.id,nextVersion,now)],
    {findingId:finding.id,version:nextVersion,status:'RESOLVED',sourceHash,resolution:p.resolution},'FINDING',finding.id,finding.version,nextVersion,{resolution:p.resolution});
}

type ConfirmationRow={id:string;version:number;client_id:string;engagement_id:string;type:string;fsli_id:string;tb_version_id:string;mapping_version_id:string;materiality_version_id:string;
  external_party_name:string;external_party_address:string;external_party_email:string|null;recipient_verification_text:string;balance_minor:number|null;critical:number;criticality_reason:string|null;
  status:string;due_date:string;dispatch_id:string|null;response_file_id:string|null;response_recorded_by_actor_id:string|null;returned_at:string|null;
  verified_by_actor_id:string|null;verified_at:string|null;verification_rationale:string|null;reliance_frozen:number;source_hash:string;created_by_actor_id:string;created_at:string};

async function currentConfirmation(env:Env,workspaceId:string,confirmationId:string):Promise<ConfirmationRow>{
  const row=await env.DB.prepare(`SELECT * FROM confirmations WHERE workspace_id=? AND id=?`).bind(workspaceId,confirmationId).first<ConfirmationRow>();
  if(!row)throw new ApiError('NOT_FOUND','The external confirmation was not found.');
  return row;
}

async function createConfirmation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.create'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  if(!engagement.active_tb_version_id||!engagement.active_mapping_version_id||!engagement.active_materiality_version_id)throw new ApiError('GATE_BLOCKED','Current trial-balance, mapping and materiality versions are required to scope an external confirmation.');
  const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string}>();
  if(!fsli)throw new ApiError('VALIDATION_FAILED','Choose a current active FSLI in this workspace.');
  const idValue=crypto.randomUUID();const balance=p.balanceMinor==null?null:moneyMinor(p.balanceMinor);
  const sourceHash=await rowHash({engagementId:engagement.id,type:p.type,fsliId:p.fsliId,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,
    materialityVersionId:engagement.active_materiality_version_id,externalPartyName:p.externalPartyName,externalPartyAddress:p.externalPartyAddress,externalPartyEmail:p.externalPartyEmail??null,
    recipientVerificationText:p.recipientVerificationText,balanceMinor:balance,critical:p.critical,criticalityReason:p.criticalityReason??null,dueDate:p.dueDate});
  return commandMutation([env.DB.prepare(`INSERT INTO confirmations(id,workspace_id,version,client_id,engagement_id,type,fsli_id,tb_version_id,mapping_version_id,materiality_version_id,
      external_party_name,external_party_address,external_party_email,recipient_verification_text,balance_minor,critical,criticality_reason,status,due_date,dispatch_id,response_file_id,response_recorded_by_actor_id,
      returned_at,verified_by_actor_id,verified_at,verification_rationale,reliance_frozen,source_hash,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,?,?,?,?)`)
      .bind(idValue,workspaceId,engagement.client_id,engagement.id,p.type,p.fsliId,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,
        p.externalPartyName,p.externalPartyAddress,p.externalPartyEmail??null,p.recipientVerificationText,balance,p.critical?1:0,p.criticalityReason??null,p.dueDate,sourceHash,context.actor.id,now,now),
    pushChange(env,workspaceId,engagement.id,'Confirmation',idValue,1,now)],{confirmationId:idValue,version:1,status:'DRAFT',sourceHash},'CONFIRMATION',idValue,null,1,
    {type:p.type,critical:p.critical,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id});
}

async function dispatchConfirmation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.dispatch'}>,commandId:string,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Confirmation',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='DRAFT')throw new ApiError('INVALID_STATE','Only a draft confirmation can be dispatched.');
  if(!row.external_party_email)throw new ApiError('GATE_BLOCKED','Add a verified external-party email before queuing the confirmation.');
  if(row.tb_version_id!==engagement.active_tb_version_id||row.mapping_version_id!==engagement.active_mapping_version_id||row.materiality_version_id!==engagement.active_materiality_version_id)throw new ApiError('STALE_DEPENDENCY','The confirmation scope pins are stale; reassess the recipient and balance before dispatch.');
  const nextVersion=row.version+1;const jobId=crypto.randomUUID();const dispatchId=crypto.randomUUID();const deduplicationKey=`confirmation-request:${row.id}:${row.source_hash}`;
  const payload={commandId,documentType:'CONFIRMATION_REQUEST',confirmationId:row.id,dispatchId,engagementId:engagement.id,clientId:engagement.client_id,sourceHash:row.source_hash,
    recipient:{name:row.external_party_name,email:row.external_party_email}};
  return commandMutation([versionGuard(env,workspaceId,990,'confirmations','id',row.id,row.version),
    env.DB.prepare(`UPDATE confirmations SET status='QUEUED',reliance_frozen=1,version=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`)
      .bind(nextVersion,now,workspaceId,row.id,row.version),
    env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
      VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?, 'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId,workspaceId,row.id,nextVersion,JSON.stringify(payload),deduplicationKey,now,now,now),
    pushChange(env,workspaceId,engagement.id,'Confirmation',row.id,nextVersion,now)],{confirmationId:row.id,version:nextVersion,status:'QUEUED',jobId,dispatchId},'CONFIRMATION',row.id,row.version,nextVersion,
    {dispatchQueued:true,jobId,critical:Boolean(row.critical),sourceHash:row.source_hash});
}

async function recordConfirmationResponse(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.record-response'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Confirmation',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='SENT')throw new ApiError('INVALID_STATE','A response can be recorded only after the confirmation dispatch is accepted by the provider.');
  const returnedAt=new Date(p.returnedAt).toISOString();if(Date.parse(returnedAt)>Date.parse(now))throw new ApiError('VALIDATION_FAILED','The third-party response date cannot be in the future.');
  const file=await committedEvidenceFile(env,workspaceId,engagement,p.responseFileId);
  const nextVersion=row.version+1;const sourceHash=await rowHash({priorSourceHash:row.source_hash,responseFileId:file.id,responseFileSha256:file.sha256,returnedAt,recordedByActorId:context.actor.id});
  return commandMutation([versionGuard(env,workspaceId,990,'confirmations','id',row.id,row.version),
    env.DB.prepare(`UPDATE confirmations SET status='RETURNED_UNVERIFIED',response_file_id=?,response_recorded_by_actor_id=?,returned_at=?,version=?,source_hash=?,updated_at=?
      WHERE workspace_id=? AND id=? AND version=? AND status='SENT'`).bind(file.id,context.actor.id,returnedAt,nextVersion,sourceHash,now,workspaceId,row.id,row.version),
    pushChange(env,workspaceId,engagement.id,'Confirmation',row.id,nextVersion,now)],{confirmationId:row.id,version:nextVersion,status:'RETURNED_UNVERIFIED',responseFileId:file.id,responseSha256:file.sha256,sourceHash},
    'CONFIRMATION',row.id,row.version,nextVersion,{responseRecorded:true,responseSha256:file.sha256});
}

async function verifyConfirmation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.verify'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Confirmation',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='RETURNED_UNVERIFIED'||!row.response_file_id||!row.response_recorded_by_actor_id)throw new ApiError('GATE_BLOCKED','Only a newly returned, unverified response can receive independent verification.');
  const reviewer=await actorStaff(env,workspaceId,context);const creator=await actorNaturalPerson(env,workspaceId,row.created_by_actor_id);const recorder=await actorNaturalPerson(env,workspaceId,row.response_recorded_by_actor_id);
  if(!creator||!recorder||reviewer.natural_person_key===creator||reviewer.natural_person_key===recorder)throw new ApiError('SELF_REVIEW_BLOCKED','The confirmation preparer and response recorder cannot independently verify this return.');
  const file=await committedEvidenceFile(env,workspaceId,engagement,row.response_file_id);const nextVersion=row.version+1;
  const sourceHash=await rowHash({priorSourceHash:row.source_hash,verifiedByActorId:context.actor.id,verifiedNaturalPersonKey:reviewer.natural_person_key,verificationRationale:p.verificationRationale,
    responseFileId:file.id,responseFileSha256:file.sha256,verifiedAt:now});
  return commandMutation([versionGuard(env,workspaceId,990,'confirmations','id',row.id,row.version),
    env.DB.prepare(`UPDATE confirmations SET status='RETURNED_VERIFIED',verified_by_actor_id=?,verified_at=?,verification_rationale=?,version=?,source_hash=?,updated_at=?
      WHERE workspace_id=? AND id=? AND version=? AND status='RETURNED_UNVERIFIED'`).bind(context.actor.id,now,p.verificationRationale,nextVersion,sourceHash,now,workspaceId,row.id,row.version),
    pushChange(env,workspaceId,engagement.id,'Confirmation',row.id,nextVersion,now)],{confirmationId:row.id,version:nextVersion,status:'RETURNED_VERIFIED',sourceHash},
    'CONFIRMATION',row.id,row.version,nextVersion,{verificationRationale:p.verificationRationale,responseSha256:file.sha256});
}

async function cancelConfirmation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.cancel'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Confirmation',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='DRAFT'||row.reliance_frozen)throw new ApiError('GATE_BLOCKED','A confirmation already queued or relied upon cannot be cancelled without a fresh Partner scope reassessment.');
  const nextVersion=row.version+1;const sourceHash=await rowHash({priorSourceHash:row.source_hash,cancelledByActorId:context.actor.id,reason:p.reason,cancelledAt:now});
  return commandMutation([versionGuard(env,workspaceId,990,'confirmations','id',row.id,row.version),
    env.DB.prepare(`UPDATE confirmations SET status='CANCELLED',version=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`)
      .bind(nextVersion,sourceHash,now,workspaceId,row.id,row.version),pushChange(env,workspaceId,engagement.id,'Confirmation',row.id,nextVersion,now)],
    {confirmationId:row.id,version:nextVersion,status:'CANCELLED',sourceHash},'CONFIRMATION',row.id,row.version,nextVersion,{reason:p.reason});
}

async function reassessConfirmationScope(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.scope-reassess'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const prior=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,prior.engagement_id);
  if(prior.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Confirmation',id:prior.id,expectedVersion:p.expectedVersion,currentVersion:prior.version}));
  if(prior.status==='CANCELLED')throw new ApiError('INVALID_STATE','A cancelled confirmation cannot be reassessed again; create a new scoped confirmation.');
  let replacementId:string|null=null;let replacementHash:string|null=null;let replacementCritical:number|null=null;let replacementInsert:D1PreparedStatement|undefined;
  if(p.replacementCritical!==null){
    if(!engagement.active_tb_version_id||!engagement.active_mapping_version_id||!engagement.active_materiality_version_id)throw new ApiError('GATE_BLOCKED','Current TB, mapping, and materiality versions are required for a replacement scope.');
    const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,prior.fsli_id).first<{id:string}>();
    if(!fsli)throw new ApiError('VALIDATION_FAILED','The confirmation FSLI is no longer active; create a new scope against an active line.');
    const criticalityReason=p.replacementCritical?p.replacementCriticalityReason??'':null;
    replacementId=crypto.randomUUID();replacementCritical=p.replacementCritical?1:0;
    replacementHash=await rowHash({engagementId:engagement.id,type:prior.type,fsliId:prior.fsli_id,tbVersionId:engagement.active_tb_version_id,
      mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id,externalPartyName:prior.external_party_name,
      externalPartyAddress:prior.external_party_address,externalPartyEmail:prior.external_party_email,recipientVerificationText:prior.recipient_verification_text,
      balanceMinor:prior.balance_minor,critical:Boolean(replacementCritical),criticalityReason,dueDate:prior.due_date});
    replacementInsert=env.DB.prepare(`INSERT INTO confirmations(id,workspace_id,version,client_id,engagement_id,type,fsli_id,tb_version_id,mapping_version_id,materiality_version_id,
        external_party_name,external_party_address,external_party_email,recipient_verification_text,balance_minor,critical,criticality_reason,status,due_date,dispatch_id,response_file_id,response_recorded_by_actor_id,
        returned_at,verified_by_actor_id,verified_at,verification_rationale,reliance_frozen,source_hash,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,?,?,?,?)`)
      .bind(replacementId,workspaceId,engagement.client_id,engagement.id,prior.type,prior.fsli_id,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,
        prior.external_party_name,prior.external_party_address,prior.external_party_email,prior.recipient_verification_text,prior.balance_minor,replacementCritical,criticalityReason,prior.due_date,
        replacementHash,context.actor.id,now,now);
  }
  const approvalId=crypto.randomUUID();const nextPriorVersion=prior.version+1;
  const actorSnapshot=JSON.stringify({actorId:context.actor.id,persona:context.actor.persona,displayName:context.actor.displayName,staffGrade:context.actor.staffGrade});
  const statements:D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,988,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND active_tb_version_id IS ? AND active_mapping_version_id IS ? AND active_materiality_version_id IS ?)
        AND (? IS NULL OR EXISTS(SELECT 1 FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1)) THEN 1 ELSE 0 END`)
      .bind(workspaceId,workspaceId,engagement.id,engagement.version,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,
        replacementId,workspaceId,prior.fsli_id),
    versionGuard(env,workspaceId,990,'confirmations','id',prior.id,prior.version)
  ];
  if(replacementInsert)statements.push(replacementInsert);
  statements.push(env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
      VALUES(?,?,?,?,1,'CONFIRMATION_SCOPE',?,?,'APPROVE',?,?,?,NULL)`)
      .bind(approvalId,workspaceId,engagement.client_id,engagement.id,prior.id,nextPriorVersion,p.rationale,actorSnapshot,now),
    env.DB.prepare(`INSERT INTO approval_dependencies(id,workspace_id,client_id,engagement_id,version,approval_id,entity_type,entity_id,entity_version,content_sha256)
      VALUES(?,?,?, ?,1,?,'Confirmation',?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,engagement.client_id,engagement.id,approvalId,prior.id,prior.version,prior.source_hash));
  if(replacementId&&replacementHash)statements.push(env.DB.prepare(`INSERT INTO approval_dependencies(id,workspace_id,client_id,engagement_id,version,approval_id,entity_type,entity_id,entity_version,content_sha256)
      VALUES(?,?,?, ?,1,?,'Confirmation',?,1,?)`)
      .bind(crypto.randomUUID(),workspaceId,engagement.client_id,engagement.id,approvalId,replacementId,replacementHash));
  statements.push(env.DB.prepare(`INSERT INTO confirmation_scope_reassessments(id,workspace_id,client_id,engagement_id,prior_confirmation_id,replacement_confirmation_id,prior_source_hash,
      replacement_source_hash,prior_critical,replacement_critical,rationale,partner_actor_id,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(approvalId,workspaceId,engagement.client_id,engagement.id,prior.id,replacementId,prior.source_hash,replacementHash,prior.critical,replacementCritical,p.rationale,context.actor.id,now),
    env.DB.prepare(`UPDATE confirmations SET status='CANCELLED',version=?,scope_approval_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status=?`)
      .bind(nextPriorVersion,approvalId,now,workspaceId,prior.id,prior.version,prior.status),
    pushChange(env,workspaceId,engagement.id,'Confirmation',prior.id,nextPriorVersion,now));
  if(replacementId)statements.push(pushChange(env,workspaceId,engagement.id,'Confirmation',replacementId,1,now));
  return commandMutation(statements,{reassessmentId:approvalId,confirmationId:prior.id,version:nextPriorVersion,status:'CANCELLED',replacementConfirmationId:replacementId,
      replacementStatus:replacementId?'DRAFT':null,replacementCritical:p.replacementCritical,replacementSourceHash:replacementHash},'CONFIRMATION_SCOPE_REASSESSMENT',approvalId,null,1,
    {priorConfirmationId:prior.id,priorSourceHash:prior.source_hash,replacementConfirmationId:replacementId,replacementSourceHash:replacementHash,
      priorCritical:Boolean(prior.critical),replacementCritical:p.replacementCritical,rationale:p.rationale});
}

async function addConfirmationFollowup(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.follow-up'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(!['SENT','RETURNED_UNVERIFIED'].includes(row.status))throw new ApiError('INVALID_STATE','Follow-ups can be recorded only while a response is outstanding or awaiting independent verification.');
  const idValue=crypto.randomUUID();return commandMutation([env.DB.prepare(`INSERT INTO confirmation_followups(id,workspace_id,client_id,engagement_id,confirmation_id,note,dispatch_id,followed_at,created_by_actor_id)
      VALUES(?,?,?,?,?,?,NULL,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,row.id,p.note,now,context.actor.id),
    pushChange(env,workspaceId,engagement.id,'ConfirmationFollowup',idValue,1,now)],{followupId:idValue,confirmationId:row.id,recordedAt:now},'CONFIRMATION_FOLLOWUP',idValue,null,1,{confirmationId:row.id,note:p.note});
}

async function recordConfirmationAlternative(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'confirmation.alternative-procedure'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentConfirmation(env,workspaceId,p.confirmationId);const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  const file=await committedEvidenceFile(env,workspaceId,engagement,p.evidenceFileId);const idValue=crypto.randomUUID();
  return commandMutation([env.DB.prepare(`INSERT INTO confirmation_alternative_procedures(id,workspace_id,client_id,engagement_id,confirmation_id,evidence_file_id,rationale,recorded_by_actor_id,recorded_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,row.id,file.id,p.rationale,context.actor.id,now),
    pushChange(env,workspaceId,engagement.id,'ConfirmationAlternativeProcedure',idValue,1,now)],{alternativeProcedureId:idValue,confirmationId:row.id,evidenceFileId:file.id,criticalGateWaived:false},
    'CONFIRMATION_ALTERNATIVE_PROCEDURE',idValue,null,1,{confirmationId:row.id,evidenceFileId:file.id,rationale:p.rationale,criticalGateWaived:false});
}

export async function criticalConfirmationBlockers(env:Env,workspaceId:string,engagement:ConfirmationGateEngagement):Promise<CriticalConfirmationBlocker[]>{
  const result=await env.DB.prepare(`SELECT id,version,type,status,due_date AS dueDate,source_hash AS sourceHash,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,
      materiality_version_id AS materialityVersionId,external_party_name AS externalPartyName,criticality_reason AS criticalityReason
    FROM confirmations WHERE workspace_id=? AND engagement_id=? AND critical=1 AND status<>'CANCELLED' ORDER BY id`).bind(workspaceId,engagement.id).all<Record<string,unknown>>();
  const rows=result.results??[];
  return rows.filter(row=>row.status!=='RETURNED_VERIFIED'||row.tbVersionId!==engagement.active_tb_version_id||row.mappingVersionId!==engagement.active_mapping_version_id
    ||row.materialityVersionId!==engagement.active_materiality_version_id).map(row=>({id:String(row.id),version:Number(row.version),type:String(row.type),status:String(row.status),dueDate:String(row.dueDate),
      sourceHash:String(row.sourceHash),externalPartyName:String(row.externalPartyName),criticalityReason:String(row.criticalityReason??''),stalePins:row.tbVersionId!==engagement.active_tb_version_id
        ||row.mappingVersionId!==engagement.active_mapping_version_id||row.materialityVersionId!==engagement.active_materiality_version_id}));
}

export async function queueHoldingLetterForBlockers(env:Env,workspaceId:string,context:BusinessContext,engagement:ConfirmationGateEngagement,commandId:string,now:string,blockers:CriticalConfirmationBlocker[],responseStatus?:number):Promise<BusinessMutation>{
  const route=await env.DB.prepare(`SELECT cr.id,cr.version,ct.id AS contact_id,ct.full_name,ct.email FROM contact_routes cr JOIN contacts ct
      ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.client_id=? AND cr.purpose='HOLDING_LETTER' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL
      AND ct.role IN ('MD_GM','CFO_FINANCE_DIRECTOR') ORDER BY cr.id LIMIT 1`).bind(workspaceId,engagement.client_id).first<{id:string;version:number;contact_id:string;full_name:string;email:string}>();
  const snapshot=blockers.map(item=>({id:item.id,version:item.version,type:item.type,status:item.status,dueDate:item.dueDate,sourceHash:item.sourceHash,externalPartyName:item.externalPartyName,stalePins:item.stalePins}));
  const outstandingSetHash=await rowHash(snapshot);const baseBlockers=blockers.map(item=>({code:item.stalePins?'STALE_CONFIRMATION_SOURCE':'CRITICAL_CONFIRMATION_OUTSTANDING',entityId:item.id,
    description:`${String(item.type)} confirmation for ${String(item.externalPartyName)} is ${String(item.status).replaceAll('_',' ').toLowerCase()}${item.stalePins?' or pinned to replaced source versions':''}.`,
    route:'#audit-fieldwork',remediation:item.stalePins?'Reassess this confirmation against the current trial balance, mapping, and materiality.':'Obtain and independently verify the direct third-party response.'}));
  if(!route){
    const mutation=commandMutation([],{blocked:true,blockers:[...baseBlockers,{code:'HOLDING_LETTER_ROUTE_MISSING',entityId:engagement.id,description:'No active primary management contact route with an email is configured for the holding letter.',route:'#clients',remediation:'Set a primary HOLDING_LETTER route for an active MD/GM or CFO contact.'}],
      holdingLetterJobId:null,outstandingSetHash},'CONFIRMATION_GATE',engagement.id,engagement.version,engagement.version,{blocked:true,outstandingSetHash,holdingLetterQueued:false});
    return responseStatus===undefined?mutation:{...mutation,responseStatus};
  }
  const deduplicationKey=`holding-letter:${engagement.id}:${outstandingSetHash}`;
  const prior=await env.DB.prepare(`SELECT id,status FROM outbox_jobs WHERE workspace_id=? AND deduplication_key=?`).bind(workspaceId,deduplicationKey).first<{id:string;status:string}>();
  const jobId=prior?.id??crypto.randomUUID();const recipient={contactRouteId:route.id,contactRouteVersion:route.version,contactId:route.contact_id,name:route.full_name,email:route.email};
  const payload={commandId,documentType:'HOLDING_LETTER',holdingLetterId:crypto.randomUUID(),engagementId:engagement.id,clientId:engagement.client_id,
    outstandingSetHash,confirmations:snapshot,recipient};
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,988,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND active_tb_version_id IS ? AND active_mapping_version_id IS ? AND active_materiality_version_id IS ?)
        AND (SELECT COUNT(*) FROM confirmations c JOIN engagements e ON e.workspace_id=c.workspace_id AND e.id=c.engagement_id
          WHERE c.workspace_id=? AND c.engagement_id=? AND c.critical=1 AND c.status<>'CANCELLED'
            AND (c.status<>'RETURNED_VERIFIED' OR c.tb_version_id IS NOT e.active_tb_version_id OR c.mapping_version_id IS NOT e.active_mapping_version_id OR c.materiality_version_id IS NOT e.active_materiality_version_id))=?
        AND NOT EXISTS(SELECT 1 FROM json_each(?) item LEFT JOIN confirmations c ON c.workspace_id=? AND c.id=json_extract(item.value,'$.id')
          WHERE c.id IS NULL OR c.critical<>1 OR c.status='CANCELLED' OR c.version<>CAST(json_extract(item.value,'$.version') AS INTEGER)
            OR c.status<>json_extract(item.value,'$.status') OR c.source_hash<>json_extract(item.value,'$.sourceHash'))
        THEN 1 ELSE 0 END`)
      .bind(workspaceId,workspaceId,engagement.id,engagement.version,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,
        workspaceId,engagement.id,snapshot.length,JSON.stringify(snapshot),workspaceId)];
  if(!prior)statements.push(env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
      VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?, 'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`).bind(jobId,workspaceId,engagement.id,engagement.version,JSON.stringify(payload),deduplicationKey,now,now,now));
  const mutation=commandMutation(statements,{blocked:true,blockers:baseBlockers,holdingLetterJobId:jobId,holdingLetterJobStatus:prior?.status??'PENDING',holdingLetterReused:Boolean(prior),outstandingSetHash},'CONFIRMATION_GATE',engagement.id,engagement.version,engagement.version,
    {blocked:true,outstandingSetHash,holdingLetterJobId:jobId,holdingLetterReused:Boolean(prior)});
  return responseStatus===undefined?mutation:{...mutation,responseStatus};
}

async function createAdjustment(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'adjustment.create'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  if(!engagement.active_mapping_version_id||!engagement.active_materiality_version_id)throw new ApiError('GATE_BLOCKED','A current approved mapping and materiality version are required before drafting an AJE.');
  if(engagement.active_tb_version_id!==p.tbVersionId)throw new ApiError('STALE_DEPENDENCY','AJE lines must be prepared against the current accepted trial-balance version.');
  const totals=assertBalancedAdjustment(p.lines);await validateActiveFslis(env,workspaceId,p.lines);
  if(p.findingId){const finding=await env.DB.prepare(`SELECT id FROM findings WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,p.findingId,engagement.id).first<{id:string}>();if(!finding)throw new ApiError('FORBIDDEN_SCOPE','The linked finding is outside this engagement.');}
  const evidencePins:Array<{id:string;version:number;fileSha256:string|null;snapshot:Record<string,unknown>}>=[];
  for(const evidenceId of [...new Set(p.evidenceIds)]){
    const candidate=await env.DB.prepare(`SELECT e.id,e.family_id AS familyId,e.version,e.mode,e.title,e.file_version_id AS fileVersionId,e.physical_index AS physicalIndex,e.physical_description AS physicalDescription,
        e.binder,e.box,e.shelf,e.external_source_url AS externalSourceUrl,e.retrieved_at AS retrievedAt,f.sha256 AS fileSha256,
        (SELECT d.id FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacyDecisionId,
        (SELECT d.adequacy FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacy,
        (SELECT d.rationale FROM evidence_adequacy_decisions d WHERE d.workspace_id=e.workspace_id AND d.evidence_id=e.id ORDER BY d.reviewed_at DESC LIMIT 1) AS adequacyRationale
      FROM evidence_records e LEFT JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id WHERE e.workspace_id=? AND e.id=? AND e.engagement_id=?`)
      .bind(workspaceId,evidenceId,engagement.id).first<Record<string,unknown>>();
    if(!candidate)throw new ApiError('FORBIDDEN_SCOPE','Every AJE evidence pin must belong to this engagement.');
    await currentEvidenceRecord(env,workspaceId,engagement,evidenceId,Number(candidate.version),true);
    const snapshot={id:candidate.id,familyId:candidate.familyId,version:candidate.version,mode:candidate.mode,title:candidate.title,fileVersionId:candidate.fileVersionId,fileSha256:candidate.fileSha256,
      physicalIndex:candidate.physicalIndex,physicalDescription:candidate.physicalDescription,binder:candidate.binder,box:candidate.box,shelf:candidate.shelf,externalSourceUrl:candidate.externalSourceUrl,
      retrievedAt:candidate.retrievedAt,adequacyDecisionId:candidate.adequacyDecisionId,adequacy:candidate.adequacy,adequacyRationale:candidate.adequacyRationale};
    evidencePins.push({id:evidenceId,version:Number(candidate.version),fileSha256:candidate.fileSha256===null?null:String(candidate.fileSha256),snapshot});
  }
  const sequence=await env.DB.prepare(`SELECT COALESCE(MAX(CAST(substr(number,5) AS INTEGER)),0) AS value FROM audit_adjustments WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{value:number}>();
  const number=`AJE-${String(Number(sequence?.value??0)+1).padStart(4,'0')}`;const adjustmentId=crypto.randomUUID();
  const lineSnapshot=p.lines.map(line=>({fsliId:line.fsliId,accountCode:line.accountCode??null,debitMinor:line.debitMinor,creditMinor:line.creditMinor}));
  const sourceHash=await rowHash({engagementId:engagement.id,tbVersionId:p.tbVersionId,mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id,
    findingId:p.findingId??null,description:p.description,lines:lineSnapshot,evidence:evidencePins.map(pin=>({evidenceId:pin.id,evidenceVersion:pin.version,fileSha256:pin.fileSha256,snapshot:pin.snapshot}))});
  const header={id:adjustmentId,version:1,client_id:engagement.client_id,engagement_id:engagement.id,number,tb_version_id:p.tbVersionId,mapping_version_id:engagement.active_mapping_version_id,materiality_version_id:engagement.active_materiality_version_id,finding_id:p.findingId??null,description:p.description,status:'DRAFT',
    reflected_in_source:0,reflected_in_source_reason:null,include_in_statements:0,client_response:null,client_response_decision:null,client_response_file_id:null,client_responded_by_actor_id:null,client_responded_at:null,
    source_hash:sourceHash,created_by_actor_id:context.actor.id,approved_by_actor_id:null,created_at:now,updated_at:now,evidence:evidencePins};
  const lines:AdjustmentLineRow[]=p.lines.map(line=>({id:crypto.randomUUID(),fsli_id:line.fsliId,account_code:line.accountCode??null,debit_minor:Number(line.debitMinor),credit_minor:Number(line.creditMinor)}));
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO audit_adjustments(id,workspace_id,version,client_id,engagement_id,number,tb_version_id,mapping_version_id,materiality_version_id,finding_id,description,status,source_hash,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?, 'DRAFT',?,?,?,?)`).bind(adjustmentId,workspaceId,engagement.client_id,engagement.id,number,p.tbVersionId,engagement.active_mapping_version_id,engagement.active_materiality_version_id,p.findingId??null,p.description,sourceHash,context.actor.id,now,now),
    ...makeMultiInsertStatements(env,'audit_adjustment_lines',['id','workspace_id','adjustment_id','fsli_id','account_code','debit_minor','credit_minor'],lines.map(line=>[line.id,workspaceId,adjustmentId,line.fsli_id,line.account_code,line.debit_minor,line.credit_minor])),
    ...evidencePins.map(pin=>env.DB.prepare(`INSERT INTO audit_adjustment_evidence_links(id,workspace_id,adjustment_id,evidence_id,evidence_version,file_sha256,source_snapshot_json,linked_by_actor_id,linked_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,adjustmentId,pin.id,pin.version,pin.fileSha256,JSON.stringify(pin.snapshot),context.actor.id,now)),
    adjustmentRevision(env,workspaceId,adjustmentId,1,adjustmentSnapshot(header,lines as unknown as Array<Record<string,unknown>>),sourceHash,context.actor.id,now),
    pushChange(env,workspaceId,engagement.id,'Adjustment',adjustmentId,1,now)];
  return commandMutation(statements,{adjustmentId,number,version:1,status:'DRAFT',sourceHash,evidenceCount:evidencePins.length,...totals},'AUDIT_ADJUSTMENT',adjustmentId,null,1,{tbVersionId:p.tbVersionId,findingId:p.findingId??null,lineCount:lines.length,evidenceCount:evidencePins.length,...totals});
}

async function proposeAdjustment(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'adjustment.propose'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await env.DB.prepare(`SELECT * FROM audit_adjustments WHERE workspace_id=? AND id=?`).bind(workspaceId,p.adjustmentId).first<AdjustmentRow>();
  if(!row)throw new ApiError('NOT_FOUND','The audit adjustment was not found.');const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AuditAdjustment',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='DRAFT')throw new ApiError('INVALID_STATE','Only a draft adjustment can be proposed to the client.');
  if(row.tb_version_id!==engagement.active_tb_version_id||row.mapping_version_id!==engagement.active_mapping_version_id||row.materiality_version_id!==engagement.active_materiality_version_id)throw new ApiError('STALE_DEPENDENCY','The adjustment trial-balance, mapping, or materiality source has changed. Recreate the proposal against the active versions.');
  const lines=await adjustmentLines(env,workspaceId,row.id);const evidence=await adjustmentEvidence(env,workspaceId,row.id);const totals=assertBalancedAdjustment(lines.map(line=>({debitMinor:line.debit_minor,creditMinor:line.credit_minor})));
  await verifyAdjustmentEvidence(env,workspaceId,engagement,evidence);
  if(lines.length<2)throw new ApiError('GATE_BLOCKED','An adjustment must retain at least two balanced FSLI lines.');
  const nextVersion=row.version+1;const sourceHash=await rowHash({priorSourceHash:row.source_hash,transition:'PROPOSED',version:nextVersion});const header={...row,version:nextVersion,status:'PROPOSED',source_hash:sourceHash,updated_at:now,evidence};
  const statements=[versionGuard(env,workspaceId,990,'audit_adjustments','id',row.id,row.version),
    env.DB.prepare(`UPDATE audit_adjustments SET version=?,status='PROPOSED',source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`).bind(nextVersion,sourceHash,now,workspaceId,row.id,row.version),
    adjustmentRevision(env,workspaceId,row.id,nextVersion,adjustmentSnapshot(header,lines as unknown as Array<Record<string,unknown>>),sourceHash,context.actor.id,now),pushChange(env,workspaceId,row.engagement_id,'Adjustment',row.id,nextVersion,now)];
  return commandMutation(statements,{adjustmentId:row.id,version:nextVersion,status:'PROPOSED',sourceHash,...totals},'AUDIT_ADJUSTMENT',row.id,row.version,nextVersion,{clientDecisionRequested:true});
}

async function respondToAdjustment(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'adjustment.client-respond'}>,now:string):Promise<BusinessMutation>{
  const p=command.payload;if(context.actor.persona!=='CLIENT')throw new ApiError('PERSONA_ACTION_DENIED','An adjustment response must come from the scoped CLIENT persona.');
  const row=await env.DB.prepare(`SELECT a.*,e.lifecycle_state,e.locked_at FROM audit_adjustments a JOIN engagements e ON e.workspace_id=a.workspace_id AND e.id=a.engagement_id WHERE a.workspace_id=? AND a.id=?`)
    .bind(workspaceId,p.adjustmentId).first<AdjustmentRow&{lifecycle_state:string;locked_at:string|null}>();
  if(!row)throw new ApiError('NOT_FOUND','The audit adjustment was not found.');
  if(context.actor.clientId!==row.client_id||(context.scope.clientId&&context.scope.clientId!==row.client_id)||(context.scope.engagementId&&context.scope.engagementId!==row.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','The adjustment is outside the selected client engagement.');
  if(row.locked_at||!['FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL'].includes(row.lifecycle_state))throw new ApiError('WORKSPACE_FROZEN','Client adjustment responses are closed for this engagement stage.');
  if(row.status!=='PROPOSED'||row.client_response_decision!==null)throw new ApiError('INVALID_STATE','Only a proposed adjustment awaiting the client can receive a response.');
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AuditAdjustment',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  let fileSha256:string|null=null;
  if(p.responseFileId){const file=await env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=? AND state='COMMITTED' AND immutable=1 AND sha256 IS NOT NULL`)
      .bind(workspaceId,p.responseFileId,row.client_id,row.engagement_id).first<{sha256:string}>();if(!file)throw new ApiError('FORBIDDEN_SCOPE','The response attachment must be committed, immutable, and belong to this engagement.');fileSha256=file.sha256;}
  const nextVersion=row.version+1;const sourceHash=await rowHash({priorSourceHash:row.source_hash,decision:p.decision,responseText:p.responseText,responseFileId:p.responseFileId??null,responseFileSha256:fileSha256,actorId:context.actor.id,respondedAt:now});
  const lines=await adjustmentLines(env,workspaceId,row.id);const evidence=await adjustmentEvidence(env,workspaceId,row.id);const status=p.decision==='ACCEPTED'?'CLIENT_ACCEPTED':'CLIENT_DECLINED';const header={...row,version:nextVersion,status,client_response:p.responseText,client_response_decision:p.decision,
    client_response_file_id:p.responseFileId??null,client_responded_by_actor_id:context.actor.id,client_responded_at:now,source_hash:sourceHash,updated_at:now,evidence};
  const statements=[versionGuard(env,workspaceId,990,'audit_adjustments','id',row.id,row.version),
    env.DB.prepare(`UPDATE audit_adjustments SET version=?,status=?,client_response=?,client_response_decision=?,client_response_file_id=?,client_responded_by_actor_id=?,client_responded_at=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='PROPOSED'`)
      .bind(nextVersion,status,p.responseText,p.decision,p.responseFileId??null,context.actor.id,now,sourceHash,now,workspaceId,row.id,row.version),
    adjustmentRevision(env,workspaceId,row.id,nextVersion,adjustmentSnapshot(header,lines as unknown as Array<Record<string,unknown>>),sourceHash,context.actor.id,now),
    pushChange(env,workspaceId,row.engagement_id,'Adjustment',row.id,nextVersion,now)];
  return commandMutation(statements,{adjustmentId:row.id,version:nextVersion,status,decision:p.decision,sourceHash},'AUDIT_ADJUSTMENT',row.id,row.version,nextVersion,{clientResponseRecorded:true,responseFileSha256:fileSha256});
}

async function approveAdjustment(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'adjustment.approve'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const row=await env.DB.prepare(`SELECT * FROM audit_adjustments WHERE workspace_id=? AND id=?`).bind(workspaceId,p.adjustmentId).first<AdjustmentRow>();
  if(!row)throw new ApiError('NOT_FOUND','The audit adjustment was not found.');const engagement=await getEngagement(env,workspaceId,context,row.engagement_id);
  if(row.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AuditAdjustment',id:row.id,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.source_hash!==p.sourceHash)throw new ApiError('STALE_DEPENDENCY','The adjustment changed after this reviewer opened it. Refresh the proposal.');
  if(!['CLIENT_ACCEPTED','CLIENT_DECLINED'].includes(row.status)||!row.client_response_decision)throw new ApiError('GATE_BLOCKED','The client must accept or decline the proposed adjustment before independent review.');
  const staff=await actorStaff(env,workspaceId,context);const preparer=await actorNaturalPerson(env,workspaceId,row.created_by_actor_id);
  if(!preparer||preparer===staff.natural_person_key)throw new ApiError('SELF_REVIEW_BLOCKED','An adjustment must be approved by a different natural person from its preparer.');
  const lines=await adjustmentLines(env,workspaceId,row.id);const evidence=await adjustmentEvidence(env,workspaceId,row.id);if(lines.length<2)throw new ApiError('GATE_BLOCKED','The adjustment does not contain a complete line set.');const totals=assertBalancedAdjustment(lines.map(line=>({debitMinor:line.debit_minor,creditMinor:line.credit_minor})));
  if(!evidence.length)throw new ApiError('GATE_BLOCKED','At least one exact evidence pin is required to approve an adjustment.');
  await verifyAdjustmentEvidence(env,workspaceId,engagement,evidence);
  const sourceChanged=row.tb_version_id!==engagement.active_tb_version_id||row.mapping_version_id!==engagement.active_mapping_version_id;
  if(row.materiality_version_id!==engagement.active_materiality_version_id)throw new ApiError('STALE_DEPENDENCY','The adjustment was prepared against an obsolete materiality version; refresh its classification before approval.');
  if(sourceChanged&&!p.reflectedInSourceReason)throw new ApiError('GATE_BLOCKED','The active trial balance replaced the AJE source. Record a reasoned reviewer disposition before excluding the overlay.');
  if(!sourceChanged&&p.reflectedInSourceReason)throw new ApiError('VALIDATION_FAILED','A reflected-in-source disposition is only valid when the active trial balance replaced the AJE source.');
  const nextVersion=row.version+1;const reflected=sourceChanged?1:0;const include=sourceChanged?0:row.client_response_decision==='ACCEPTED'?1:0;
  const sourceHash=await rowHash({priorSourceHash:row.source_hash,reviewerActorId:context.actor.id,decision:'REVIEW_APPROVED',activeTbVersionId:engagement.active_tb_version_id,reflectedInSourceReason:p.reflectedInSourceReason??null});
  const header={...row,version:nextVersion,status:'REVIEW_APPROVED',reflected_in_source:reflected,reflected_in_source_reason:p.reflectedInSourceReason??null,include_in_statements:include,source_hash:sourceHash,approved_by_actor_id:context.actor.id,updated_at:now,evidence};
  const statements=[versionGuard(env,workspaceId,990,'audit_adjustments','id',row.id,row.version),
    env.DB.prepare(`UPDATE audit_adjustments SET version=?,status='REVIEW_APPROVED',reflected_in_source=?,reflected_in_source_reason=?,include_in_statements=?,source_hash=?,approved_by_actor_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,reflected,p.reflectedInSourceReason??null,include,sourceHash,context.actor.id,now,workspaceId,row.id,row.version),
    adjustmentRevision(env,workspaceId,row.id,nextVersion,adjustmentSnapshot(header,lines as unknown as Array<Record<string,unknown>>),sourceHash,context.actor.id,now),
    pushChange(env,workspaceId,row.engagement_id,'Adjustment',row.id,nextVersion,now)];
  return commandMutation(statements,{adjustmentId:row.id,version:nextVersion,status:'REVIEW_APPROVED',includeInStatements:Boolean(include),reflectedInSource:Boolean(reflected),sourceHash,...totals},'AUDIT_ADJUSTMENT',row.id,row.version,nextVersion,{clientDecision:row.client_response_decision,includeInStatements:Boolean(include),reflectedInSourceReason:p.reflectedInSourceReason??null});
}

async function createDifference(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'difference.create'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const finding=await env.DB.prepare(`SELECT id,client_id,engagement_id,source_hash,tb_version_id,mapping_version_id,materiality_version_id FROM findings WHERE workspace_id=? AND id=?`).bind(workspaceId,p.findingId)
    .first<{id:string;client_id:string;engagement_id:string;source_hash:string;tb_version_id:string|null;mapping_version_id:string|null;materiality_version_id:string|null}>();if(!finding)throw new ApiError('NOT_FOUND','The finding was not found.');
  const engagement=await getEngagement(env,workspaceId,context,finding.engagement_id);const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string}>();
  if(!fsli)throw new ApiError('NOT_FOUND','An active FSLI is required for an unadjusted difference.');
  const materiality=engagement.active_materiality_version_id?await env.DB.prepare(`SELECT sad_minor,performance_minor,planning_minor,source_sha256 FROM materiality_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,engagement.active_materiality_version_id,engagement.id).first<{sad_minor:number;performance_minor:number;planning_minor:number;source_sha256:string}>():null;
  if(!materiality)throw new ApiError('GATE_BLOCKED','Current SAD, TE, and PM thresholds are required to classify a difference.');
  if(finding.tb_version_id!==engagement.active_tb_version_id||finding.mapping_version_id!==engagement.active_mapping_version_id||finding.materiality_version_id!==engagement.active_materiality_version_id)throw new ApiError('STALE_DEPENDENCY','The finding source pins are stale. Reassess it against current TB, mapping and materiality before recording a difference.');
  const amount=BigInt(p.amountMinor);const absolute=amount<0n?-amount:amount;const sad=BigInt(materiality.sad_minor);
  if(p.disposition==='CLEARLY_TRIVIAL'&&(p.qualitativeSignificance||absolute>sad))throw new ApiError('GATE_BLOCKED','Only non-qualitative differences at or below the current SAD may be classified as clearly trivial.');
  if(p.disposition==='ADJUSTED'){
    const adjustmentId=p.adjustmentId;if(!adjustmentId)throw new ApiError('VALIDATION_FAILED','An adjusted difference must name its approved AJE.');
    const adjustment=await env.DB.prepare(`SELECT id,finding_id,tb_version_id,status,reflected_in_source,include_in_statements FROM audit_adjustments WHERE workspace_id=? AND id=? AND engagement_id=?`)
      .bind(workspaceId,adjustmentId,engagement.id).first<{id:string;finding_id:string|null;tb_version_id:string;status:string;reflected_in_source:number;include_in_statements:number}>();
    if(!adjustment||adjustment.status!=='REVIEW_APPROVED'||(adjustment.finding_id&&adjustment.finding_id!==finding.id)||
      (!adjustment.include_in_statements&&!adjustment.reflected_in_source)||
      (adjustment.tb_version_id!==engagement.active_tb_version_id&&!adjustment.reflected_in_source))throw new ApiError('GATE_BLOCKED','An adjusted difference must link to an approved AJE included in statements or already reflected in the current trial balance.');
    const matching=await env.DB.prepare(`SELECT COUNT(*) AS count FROM audit_adjustment_lines WHERE workspace_id=? AND adjustment_id=? AND fsli_id=?`).bind(workspaceId,adjustmentId,p.fsliId).first<{count:number}>();
    if(!Number(matching?.count??0))throw new ApiError('VALIDATION_FAILED','The linked AJE does not include this FSLI.');
  }else if(p.adjustmentId)throw new ApiError('VALIDATION_FAILED','Only an adjusted difference may reference an AJE.');
  const differenceId=crypto.randomUUID();const sourceHash=await rowHash({engagementId:engagement.id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,
    materialityVersionId:engagement.active_materiality_version_id,materialitySourceHash:materiality.source_sha256,findingSourceHash:finding.source_hash,fsliId:p.fsliId,amountMinor:p.amountMinor,
    nature:p.nature,qualitativeSignificance:p.qualitativeSignificance,disposition:p.disposition,dispositionReason:p.dispositionReason,adjustmentId:p.adjustmentId??null});
  return commandMutation([env.DB.prepare(`INSERT INTO audit_differences(id,workspace_id,version,client_id,engagement_id,finding_id,fsli_id,tb_version_id,mapping_version_id,materiality_version_id,amount_minor,nature,qualitative_significance,disposition,disposition_reason,adjustment_id,source_hash,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(differenceId,workspaceId,finding.client_id,engagement.id,finding.id,p.fsliId,engagement.active_tb_version_id,engagement.active_mapping_version_id,engagement.active_materiality_version_id,Number(p.amountMinor),p.nature,p.qualitativeSignificance?1:0,p.disposition,p.dispositionReason,p.adjustmentId??null,sourceHash,context.actor.id,now,now),
    pushChange(env,workspaceId,engagement.id,'Difference',differenceId,1,now)],{differenceId,version:1,sourceHash,disposition:p.disposition,amountMinor:p.amountMinor,sadMinor:materiality.sad_minor,performanceMaterialityMinor:materiality.performance_minor,planningMaterialityMinor:materiality.planning_minor},'AUDIT_DIFFERENCE',differenceId,null,1,
    {findingId:finding.id,fsliId:p.fsliId,amountMinor:p.amountMinor,nature:p.nature,qualitativeSignificance:p.qualitativeSignificance,disposition:p.disposition,adjustmentId:p.adjustmentId??null});
}

type SrmInputs={engagement:Engagement;planning:Record<string,unknown>;materiality:Record<string,unknown>;statementView:Awaited<ReturnType<typeof financialStatements>>;
  goingConcern:Record<string,unknown>;goingConcernSubmission:Record<string,unknown>;workprograms:Array<Record<string,unknown>>;procedures:Array<Record<string,unknown>>;
  analyticalReviews:Array<Record<string,unknown>>;findings:Array<Record<string,unknown>>;adjustments:Array<Record<string,unknown>>;adjustmentLines:Array<Record<string,unknown>>;
  adjustmentEvidence:Array<Record<string,unknown>>;adjustmentRevisions:Array<Record<string,unknown>>;differences:Array<Record<string,unknown>>;reviewSubmissions:Array<Record<string,unknown>>;reviewNotes:Array<Record<string,unknown>>;
  areaClearances:Array<Record<string,unknown>>;signedUnadjustedMinor:string;grossUnadjustedMinor:string;thresholdAnalysis:Record<string,unknown>;inputDependencyHash:string};

export type SrmDifferenceInput={id:string;amountMinor:string|number|bigint;qualitativeSignificance:boolean|number;disposition:'UNADJUSTED'|'ADJUSTED'|'CLEARLY_TRIVIAL'};
export function summarizeSrmDifferences(differences:readonly SrmDifferenceInput[],thresholds:{sadMinor:string|number|bigint;performanceMinor:string|number|bigint;planningMinor:string|number|bigint}){
  const sad=BigInt(thresholds.sadMinor);const te=BigInt(thresholds.performanceMinor);const pm=BigInt(thresholds.planningMinor);let signed=0n;let gross=0n;
  const perItem=differences.map(row=>{const amount=BigInt(String(row.amountMinor));if(amount===0n)throw new ApiError('VALIDATION_FAILED','An audit difference must be nonzero.');
    const abs=amount<0n?-amount:amount;const qualitative=Boolean(row.qualitativeSignificance);
    if(row.disposition==='CLEARLY_TRIVIAL'&&(qualitative||abs>sad))throw new ApiError('GATE_BLOCKED','A qualitative or above-SAD difference cannot be excluded as clearly trivial.');
    if(row.disposition==='UNADJUSTED'){signed+=amount;gross+=abs;}
    return {differenceId:row.id,amountMinor:amount.toString(),qualitativeSignificance:qualitative,exceedsSAD:abs>sad,exceedsTE:abs>te,exceedsPM:abs>pm,disposition:row.disposition};
  });
  if(signed>BigInt(Number.MAX_SAFE_INTEGER)||signed<BigInt(Number.MIN_SAFE_INTEGER)||gross>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','Unadjusted-difference totals exceed safe QAR minor-unit precision.');
  const absoluteSigned=signed<0n?-signed:signed;
  return {signedUnadjustedMinor:signed.toString(),grossUnadjustedMinor:gross.toString(),thresholdAnalysis:{perItem,aggregate:{signedMinor:signed.toString(),absoluteSignedMinor:absoluteSigned.toString(),grossMinor:gross.toString(),
    signedExceedsSAD:absoluteSigned>sad,signedExceedsTE:absoluteSigned>te,signedExceedsPM:absoluteSigned>pm,grossExceedsSAD:gross>sad,grossExceedsTE:gross>te,grossExceedsPM:gross>pm}}};
}

async function collectSrmInputs(env:Env,workspaceId:string,context:BusinessContext,engagementId:string):Promise<SrmInputs>{
  const engagement=await getEngagement(env,workspaceId,context,engagementId);
  if(!['MANAGERIAL_REVIEW','PARTNER_APPROVAL'].includes(engagement.lifecycle_state))throw new ApiError('INVALID_STATE','An SRM can be compiled in Managerial Review and cleared in Partner Approval.');
  if(!engagement.active_materiality_version_id||!engagement.approved_planning_version_id)throw new ApiError('GATE_BLOCKED','Current materiality and approved planning pins are required for SRM.');
  const statementView=await financialStatements(env,workspaceId,context,engagementId);
  const [planning,materiality,going,workprogramResult,procedureResult,analyticalResult,findingResult,adjustmentResult,adjustmentLineResult,adjustmentEvidenceResult,adjustmentRevisionResult,differenceResult,reviewResult,noteResult,clearanceResult]=await Promise.all([
    env.DB.prepare(`SELECT id,revision,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,materiality_version_id AS materialityVersionId,standards_profile_id AS standardsProfileId,source_sha256 AS sourceHash
      FROM planning_versions WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,engagement.approved_planning_version_id,engagementId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,revision,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,benchmark,benchmark_minor AS benchmarkMinor,normalization_minor AS normalizationMinor,
      planning_minor AS planningMinor,performance_minor AS performanceMinor,sad_minor AS sadMinor,source_sha256 AS sourceHash FROM materiality_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
      .bind(workspaceId,engagement.active_materiality_version_id,engagementId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT g.id,g.version,g.revision,g.source_hash AS sourceHash,g.status,g.conclusion,g.assessment_start AS assessmentStart,g.assessment_end AS assessmentEnd,
      g.checklist_json AS checklistJson,g.events_text AS eventsText,g.mitigating_plans_text AS mitigatingPlansText,g.rationale,g.prepared_by_actor_id AS preparedByActorId,
      s.id AS submissionId,s.target_version AS submittedVersion,s.dependency_hash AS dependencyHash,d.decision,d.reviewer_actor_id AS reviewerActorId,d.comment AS decisionComment,d.decided_at AS decidedAt
      FROM going_concern_assessments g LEFT JOIN review_submissions s ON s.workspace_id=g.workspace_id AND s.going_concern_id=g.id AND s.target_kind='GOING_CONCERN'
      LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE g.workspace_id=? AND g.engagement_id=? ORDER BY g.revision DESC,s.submitted_at DESC LIMIT 1`)
      .bind(workspaceId,engagementId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT w.id,w.version,w.fsli_id AS fsliId,w.status,w.source_hash AS sourceHash,w.planning_version_id AS planningVersionId,
      EXISTS(SELECT 1 FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE s.workspace_id=w.workspace_id AND s.workprogram_id=w.id AND d.decision='ACCEPT' AND s.target_version+1=CASE WHEN w.status='PARTNER_CLEARED' THEN w.version-1 ELSE w.version END) AS managerAccepted
      FROM workprograms w WHERE w.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT p.id,p.version,p.workprogram_id AS workprogramId,p.status,p.source_hash AS sourceHash,p.evidence_set_hash AS evidenceSetHash,p.mandatory,p.executed_by_staff_id AS executedByStaffId
      FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND w.engagement_id=? ORDER BY w.fsli_id,p.ordinal`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.version,a.fsli_id AS fsliId,a.statement_snapshot_id AS statementSnapshotId,a.status,a.source_hash AS sourceHash,a.prepared_by_actor_id AS preparedByActorId
      FROM analytical_reviews a WHERE a.workspace_id=? AND a.engagement_id=? ORDER BY a.fsli_id,a.updated_at`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,version,fsli_id AS fsliId,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,materiality_version_id AS materialityVersionId,
      title,description,severity,qualitative_significance AS qualitativeSignificance,status,client_response AS clientResponse,resolution,source_hash AS sourceHash,created_by_actor_id AS createdByActorId,created_at AS createdAt,updated_at AS updatedAt
      FROM findings WHERE workspace_id=? AND engagement_id=? ORDER BY created_at,id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,version,number,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,materiality_version_id AS materialityVersionId,finding_id AS findingId,description,status,
      reflected_in_source AS reflectedInSource,reflected_in_source_reason AS reflectedInSourceReason,include_in_statements AS includeInStatements,client_response_decision AS clientResponse,
      client_response AS clientResponseText,client_response_file_id AS clientResponseFileId,client_responded_by_actor_id AS clientRespondedByActorId,client_responded_at AS clientRespondedAt,
      source_hash AS sourceHash,created_by_actor_id AS createdByActorId,approved_by_actor_id AS approvedByActorId,created_at AS createdAt,updated_at AS updatedAt
      FROM audit_adjustments WHERE workspace_id=? AND engagement_id=? ORDER BY number`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.adjustment_id AS adjustmentId,l.fsli_id AS fsliId,l.account_code AS accountCode,l.debit_minor AS debitMinor,l.credit_minor AS creditMinor
      FROM audit_adjustment_lines l JOIN audit_adjustments a ON a.workspace_id=l.workspace_id AND a.id=l.adjustment_id WHERE l.workspace_id=? AND a.engagement_id=? ORDER BY a.number,l.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.adjustment_id AS adjustmentId,l.evidence_id AS evidenceId,l.evidence_version AS evidenceVersion,l.file_sha256 AS fileSha256,l.source_snapshot_json AS sourceSnapshotJson,
      l.linked_by_actor_id AS linkedByActorId,l.linked_at AS linkedAt FROM audit_adjustment_evidence_links l JOIN audit_adjustments a ON a.workspace_id=l.workspace_id AND a.id=l.adjustment_id
      WHERE l.workspace_id=? AND a.engagement_id=? ORDER BY a.number,l.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT r.adjustment_id AS adjustmentId,r.revision,r.snapshot_json AS snapshotJson,r.source_hash AS sourceHash,r.changed_by_actor_id AS changedByActorId,r.changed_at AS changedAt
      FROM audit_adjustment_revisions r JOIN audit_adjustments a ON a.workspace_id=r.workspace_id AND a.id=r.adjustment_id WHERE r.workspace_id=? AND a.engagement_id=? ORDER BY a.number,r.revision`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,version,finding_id AS findingId,fsli_id AS fsliId,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,materiality_version_id AS materialityVersionId,
      amount_minor AS amountMinor,nature,qualitative_significance AS qualitativeSignificance,disposition,disposition_reason AS dispositionReason,adjustment_id AS adjustmentId,source_hash AS sourceHash,created_at AS createdAt
      FROM audit_differences WHERE workspace_id=? AND engagement_id=? ORDER BY created_at,id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT s.id,s.target_kind AS targetKind,s.target_version AS targetVersion,s.snapshot_json AS snapshotJson,s.dependency_hash AS dependencyHash,s.submitted_by_actor_id AS submittedByActorId,
      s.submitted_natural_person_key AS submittedNaturalPersonKey,s.submitted_at AS submittedAt,d.decision,d.reviewer_actor_id AS reviewerActorId,d.reviewer_natural_person_key AS reviewerNaturalPersonKey,d.comment AS decisionComment,d.decided_at AS decidedAt
      FROM review_submissions s LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.submitted_at,s.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT n.id,n.version,n.submission_id AS submissionId,n.procedure_id AS procedureId,n.status,n.text,n.response_text AS responseText,n.response_at AS responseAt,n.closed_at AS closedAt,n.closure_reason AS closureReason
      FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY n.created_at,n.id`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT c.id,c.workprogram_id AS workprogramId,c.reviewed_submission_id AS reviewedSubmissionId,c.partner_actor_id AS partnerActorId,c.dependency_hash AS dependencyHash,c.rationale,c.signed_at AS signedAt
      FROM partner_area_clearances c JOIN workprograms w ON w.workspace_id=c.workspace_id AND w.id=c.workprogram_id WHERE c.workspace_id=? AND w.engagement_id=? ORDER BY c.workprogram_id,c.signed_at`).bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  if(!planning||!materiality||!going)throw new ApiError('GATE_BLOCKED','A pinned planning, materiality, and going-concern record are mandatory for SRM.');
  if(planning.tbVersionId!==engagement.active_tb_version_id||planning.mappingVersionId!==engagement.active_mapping_version_id||planning.materialityVersionId!==engagement.active_materiality_version_id||
    materiality.tbVersionId!==engagement.active_tb_version_id||materiality.mappingVersionId!==engagement.active_mapping_version_id)throw new ApiError('STALE_DEPENDENCY','Planning or materiality does not match the active TB, mapping, and materiality pins.');
  const goingDependency=await rowHash({sourceHash:going.sourceHash,standardsProfileId:engagement.standards_profile_id,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id});
  if(going.status!=='REVIEWED'||going.decision!=='ACCEPT'||Number(going.submittedVersion)+1!==Number(going.version)||going.dependencyHash!==goingDependency)throw new ApiError('GATE_BLOCKED','The latest going-concern assessment must be independently accepted against current source pins.');
  const workprograms=workprogramResult.results??[];const procedures=procedureResult.results??[];const analyticalReviews=analyticalResult.results??[];const findings=findingResult.results??[];const adjustments=adjustmentResult.results??[];
  for(const procedure of procedures){
    await assertProcedureEvidenceCurrent(env,workspaceId,String(procedure.id),procedure.evidenceSetHash);
    await procedureSamplingPins(env,workspaceId,String(procedure.id),String(engagement.active_tb_version_id),true);
  }
  for(const review of analyticalReviews){
    const support=await evidenceSet(env,workspaceId,'analytical_review_id',String(review.id),false);
    const acceptedSubmission=(reviewResult.results??[]).find(sub=>sub.targetKind==='ANALYTICAL_REVIEW'&&sub.snapshotJson&&sub.decision==='ACCEPT'&&Number(sub.targetVersion)+1===Number(review.version)&&JSON.parse(String(sub.snapshotJson)).id===review.id);
    if(!acceptedSubmission)continue;
    const submittedSnapshot=JSON.parse(String(acceptedSubmission.snapshotJson)) as Record<string,unknown>;const contentVersion=Number(submittedSnapshot.version);
    if(support.rows.some(item=>item.target_version!==contentVersion)||support.hash!==submittedSnapshot.evidenceSetHash||review.sourceHash!==submittedSnapshot.source_hash)
      throw new ApiError('STALE_DEPENDENCY','An analytical review evidence pin or submitted source has changed. Reassess it before compiling the SRM.');
  }
  if(!workprograms.length||workprograms.some(row=>row.status!=='PARTNER_CLEARED'||Number(row.managerAccepted)!==1||row.planningVersionId!==engagement.approved_planning_version_id))throw new ApiError('GATE_BLOCKED','Every current workprogram must have Manager acceptance and Partner area clearance before the SRM can be compiled.');
  const mappedFsliResult=await env.DB.prepare(`SELECT DISTINCT fsli_id AS fsliId FROM tb_mappings WHERE workspace_id=? AND mapping_version_id=?`)
    .bind(workspaceId,engagement.active_mapping_version_id).all<{fsliId:string}>();
  assertFieldworkFsliCoverage((mappedFsliResult.results??[]).map(row=>row.fsliId),workprograms.map(row=>String(row.fsliId)));
  if(!procedures.length||procedures.some(row=>row.status!=='REVIEWED'))throw new ApiError('GATE_BLOCKED','Every applicable procedure must be independently reviewed before the SRM can be compiled.');
  if(analyticalReviews.some(row=>row.status!=='REVIEWED'))throw new ApiError('GATE_BLOCKED','Resolve every draft, returned, or pending analytical review before compiling the SRM.');
  for(const review of analyticalReviews){const accepted=(reviewResult.results??[]).some(sub=>sub.targetKind==='ANALYTICAL_REVIEW'&&sub.snapshotJson&&sub.decision==='ACCEPT'&&Number(sub.targetVersion)+1===review.version&&JSON.parse(String(sub.snapshotJson)).id===review.id);
    if(!accepted)throw new ApiError('GATE_BLOCKED','Every analytical review in the SRM must have an exact independently accepted submission.');
    const snapshot=await env.DB.prepare(`SELECT source_hash FROM statement_snapshots WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,review.statementSnapshotId,engagementId).first<{source_hash:string}>();
    if(!snapshot||snapshot.source_hash!==statementView.sourceHash)throw new ApiError('STALE_DEPENDENCY','An analytical review uses an outdated statement snapshot.');
  }
  const submissions=reviewResult.results??[];const notes=noteResult.results??[];
  if(submissions.some(row=>row.decision===null)||(notes.some(row=>row.status!=='CLOSED')))throw new ApiError('GATE_BLOCKED','Pending review submissions and open review notes must be resolved before compiling the SRM.');
  if(findings.some(row=>row.tbVersionId!==engagement.active_tb_version_id||row.mappingVersionId!==engagement.active_mapping_version_id||row.materialityVersionId!==engagement.active_materiality_version_id))throw new ApiError('STALE_DEPENDENCY','A finding is pinned to obsolete TB, mapping, or materiality. Reassess it before compiling the SRM.');
  const adjustmentLines=adjustmentLineResult.results??[];const adjustmentEvidence:Array<Record<string,unknown>>=(adjustmentEvidenceResult.results??[]).map(link=>({...link,sourceSnapshot:JSON.parse(String(link.sourceSnapshotJson))}));const adjustmentRevisions=adjustmentRevisionResult.results??[];
  for(const adjustment of adjustments){
    if(!['REVIEW_APPROVED','REVERSED'].includes(String(adjustment.status))||!adjustment.clientResponse||!adjustment.clientResponseText||!adjustment.approvedByActorId)throw new ApiError('GATE_BLOCKED',`Adjustment ${String(adjustment.number)} needs a recorded client response and independent approval before SRM compilation.`);
    const lines=adjustmentLines.filter(line=>line.adjustmentId===adjustment.id);if(lines.length<2)throw new ApiError('GATE_BLOCKED',`Adjustment ${String(adjustment.number)} has no complete immutable line set.`);
    assertBalancedAdjustment(lines.map(line=>({debitMinor:Number(line.debitMinor),creditMinor:Number(line.creditMinor)})));
    const evidence=adjustmentEvidence.filter(link=>link.adjustmentId===adjustment.id);if(!evidence.length)throw new ApiError('GATE_BLOCKED',`Adjustment ${String(adjustment.number)} has no exact evidence pins.`);
    await verifyAdjustmentEvidence(env,workspaceId,engagement,evidence);
    if(Number(adjustment.includeInStatements)===1&&(adjustment.tbVersionId!==engagement.active_tb_version_id||adjustment.mappingVersionId!==engagement.active_mapping_version_id))throw new ApiError('STALE_DEPENDENCY',`Adjustment ${String(adjustment.number)} is overlaid on a replaced source.`);
    if(adjustment.tbVersionId!==engagement.active_tb_version_id&&Number(adjustment.reflectedInSource)!==1)throw new ApiError('GATE_BLOCKED',`Adjustment ${String(adjustment.number)} has no reviewer disposition for the replacement TB.`);
  }
  const differences=differenceResult.results??[];
  for(const difference of differences){
    if(difference.tbVersionId!==engagement.active_tb_version_id||difference.mappingVersionId!==engagement.active_mapping_version_id||difference.materialityVersionId!==engagement.active_materiality_version_id)throw new ApiError('STALE_DEPENDENCY','A difference is pinned to obsolete TB, mapping, or materiality. Reassess it before compiling the SRM.');
  }
  const differenceSummary=summarizeSrmDifferences(differences.map(row=>({id:String(row.id),amountMinor:String(row.amountMinor),qualitativeSignificance:Number(row.qualitativeSignificance)!==0,
    disposition:row.disposition as SrmDifferenceInput['disposition']})),{sadMinor:String(materiality.sadMinor),performanceMinor:String(materiality.performanceMinor),planningMinor:String(materiality.planningMinor)});
  const {signedUnadjustedMinor,grossUnadjustedMinor,thresholdAnalysis}=differenceSummary;
  const areaClearances=clearanceResult.results??[];const clearancePins:Array<Record<string,unknown>>=[];
  for(const program of workprograms){
    const procedureItems=procedures.filter(row=>row.workprogramId===program.id).map(row=>({id:row.id,version:row.version,status:row.status,sourceHash:row.sourceHash,evidenceSetHash:row.evidenceSetHash}));
    const dependencyHash=await rowHash({workprogramSourceHash:program.sourceHash,planningVersionId:program.planningVersionId,tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,dependencies:procedureItems});
    const clearance=areaClearances.find(row=>row.workprogramId===program.id&&row.dependencyHash===dependencyHash);
    if(!clearance)throw new ApiError('STALE_DEPENDENCY',`Partner area clearance for workprogram ${String(program.id)} is stale.`);
    clearancePins.push(clearance);
  }
  const inputDependencyHash=await rowHash({engagementId,sourcePins:{tbVersionId:engagement.active_tb_version_id,mappingVersionId:engagement.active_mapping_version_id,materialityVersionId:engagement.active_materiality_version_id,
      planningVersionId:engagement.approved_planning_version_id,standardsProfileId:engagement.standards_profile_id},planning,materiality,statementSourceHash:statementView.sourceHash,adjustmentSetHash:statementView.adjustmentSetHash,
    goingConcern:going,workprograms,procedures,analyticalReviews,findings,adjustments,adjustmentLines,adjustmentEvidence,adjustmentRevisions,differences,reviewSubmissions:submissions,reviewNotes:notes,areaClearances:clearancePins,
    signedUnadjustedMinor,grossUnadjustedMinor,thresholdAnalysis});
  return {engagement,planning,materiality,statementView,goingConcern:going,goingConcernSubmission:going,workprograms,procedures,analyticalReviews,findings,adjustments,adjustmentLines,adjustmentEvidence,adjustmentRevisions,differences,
    reviewSubmissions:submissions,reviewNotes:notes,areaClearances:clearancePins,signedUnadjustedMinor,grossUnadjustedMinor,thresholdAnalysis,inputDependencyHash};
}

export async function getBusinessSrmCurrentness(env:Env,workspaceId:string,context:BusinessContext,engagementId:string):Promise<{
  srmVersionId:string|null;dependencyHash:string|null;current:boolean;reason:string|null
}>{
  const srm=await env.DB.prepare(`SELECT id,dependency_hash,manager_recommendation,estimates_text FROM srm_versions
    WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,engagementId)
    .first<{id:string;dependency_hash:string;manager_recommendation:string;estimates_text:string}>();
  if(!srm)return {srmVersionId:null,dependencyHash:null,current:false,reason:'Compile the current Manager SRM recommendation.'};
  try{
    const inputs=await collectSrmInputs(env,workspaceId,context,engagementId);
    const currentHash=await rowHash({inputDependencyHash:inputs.inputDependencyHash,managerRecommendation:srm.manager_recommendation,estimatesText:srm.estimates_text});
    return currentHash===srm.dependency_hash
      ? {srmVersionId:srm.id,dependencyHash:srm.dependency_hash,current:true,reason:null}
      : {srmVersionId:srm.id,dependencyHash:srm.dependency_hash,current:false,reason:'A source changed after Manager compilation. Recompile the SRM before Partner handover.'};
  }catch(error){
    return {srmVersionId:srm.id,dependencyHash:srm.dependency_hash,current:false,
      reason:error instanceof Error?error.message:'The SRM source readiness could not be evaluated.'};
  }
}

async function compileSrm(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'srm.compile'}>,now:string):Promise<BusinessMutation>{
  if(context.actor.persona!=='REVIEWER'||context.actor.staffGrade!=='MANAGER')throw new ApiError('PERSONA_ACTION_DENIED','Only a Manager-grade REVIEWER can compile the SRM recommendation.');
  const p=command.payload;const inputs=await collectSrmInputs(env,workspaceId,context,p.engagementId);
  if(inputs.engagement.lifecycle_state!=='MANAGERIAL_REVIEW')throw new ApiError('INVALID_STATE','The Manager recommendation must be compiled during Managerial Review.');
  const dependencyHash=await rowHash({inputDependencyHash:inputs.inputDependencyHash,managerRecommendation:p.managerRecommendation,estimatesText:p.estimatesText});
  const existing=await env.DB.prepare(`SELECT id FROM statement_snapshots WHERE workspace_id=? AND engagement_id=? AND source_hash=?`).bind(workspaceId,p.engagementId,inputs.statementView.sourceHash).first<{id:string}>();
  const snapshotId=existing?.id??crypto.randomUUID();const revision=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS value FROM srm_versions WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,p.engagementId).first<{value:number}>();
  const srmId=crypto.randomUUID();const nextRevision=Number(revision?.value??0)+1;const {statementView,materiality}=inputs;
  const materialitySnapshot={id:materiality.id,revision:materiality.revision,benchmark:materiality.benchmark,benchmarkMinor:materiality.benchmarkMinor,normalizationMinor:materiality.normalizationMinor,
    planningMinor:materiality.planningMinor,performanceMinor:materiality.performanceMinor,sadMinor:materiality.sadMinor,sourceHash:materiality.sourceHash};
  const findingsSnapshot={findings:inputs.findings,differences:inputs.differences,thresholdAnalysis:inputs.thresholdAnalysis};
  const adjustmentsSnapshot={adjustments:inputs.adjustments,lines:inputs.adjustmentLines,evidence:inputs.adjustmentEvidence,revisions:inputs.adjustmentRevisions};
  const reviewSnapshot={workprograms:inputs.workprograms,procedures:inputs.procedures,analyticalReviews:inputs.analyticalReviews,goingConcern:inputs.goingConcern,goingConcernSubmission:inputs.goingConcernSubmission,
    reviewSubmissions:inputs.reviewSubmissions,reviewNotes:inputs.reviewNotes,partnerAreaClearances:inputs.areaClearances,sourcePins:statementView.sourcePins,statementSourceHash:statementView.sourceHash,
    statementAdjustmentSetHash:statementView.adjustmentSetHash,managerRecommendation:p.managerRecommendation};
  const statements:D1PreparedStatement[]=[];
  if(!existing){const lineRows=[...statementView.profitLoss,...statementView.balanceSheet].map(line=>[crypto.randomUUID(),workspaceId,snapshotId,line.fsliId,line.currentBaseMinor,line.currentAdjustmentMinor,line.currentAdjustedMinor,
      line.priorMinor,line.varianceNumerator,line.varianceDenominator,line.varianceReason,line.riskBand]);
    statements.push(env.DB.prepare(`INSERT INTO statement_snapshots(id,workspace_id,client_id,engagement_id,tb_version_id,mapping_version_id,adjustment_set_hash,standards_profile_id,source_hash,generated_at,generated_by_actor_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(snapshotId,workspaceId,inputs.engagement.client_id,inputs.engagement.id,inputs.engagement.active_tb_version_id,inputs.engagement.active_mapping_version_id,statementView.adjustmentSetHash,
      inputs.engagement.standards_profile_id,statementView.sourceHash,now,context.actor.id),
      ...makeMultiInsertStatements(env,'statement_snapshot_lines',['id','workspace_id','snapshot_id','fsli_id','current_base_minor','current_adjustment_minor','current_adjusted_minor','prior_minor','variance_numerator','variance_denominator','variance_reason','risk_band'],lineRows));
  }
  statements.push(env.DB.prepare(`INSERT INTO srm_versions(id,workspace_id,client_id,engagement_id,revision,planning_version_id,statement_snapshot_id,signed_unadjusted_minor,gross_unadjusted_minor,
      materiality_snapshot_json,findings_snapshot_json,adjustments_snapshot_json,review_snapshot_json,estimates_text,going_concern_id,manager_recommendation,dependency_hash,compiled_by_actor_id,compiled_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(srmId,workspaceId,inputs.engagement.client_id,inputs.engagement.id,nextRevision,inputs.engagement.approved_planning_version_id,snapshotId,
      Number(inputs.signedUnadjustedMinor),Number(inputs.grossUnadjustedMinor),JSON.stringify(materialitySnapshot),JSON.stringify(findingsSnapshot),JSON.stringify(adjustmentsSnapshot),JSON.stringify(reviewSnapshot),
      p.estimatesText,String(inputs.goingConcern.id),p.managerRecommendation,dependencyHash,context.actor.id,now),
    pushChange(env,workspaceId,p.engagementId,'SRM',srmId,1,now));
  return commandMutation(statements,{srmVersionId:srmId,revision:nextRevision,statementSnapshotId:snapshotId,dependencyHash,signedUnadjustedMinor:inputs.signedUnadjustedMinor,
    grossUnadjustedMinor:inputs.grossUnadjustedMinor,thresholdAnalysis:inputs.thresholdAnalysis,materialitySnapshot,reviewSnapshot,compiledAt:now},'SRM',srmId,null,1,{dependencyHash,revision:nextRevision});
}

async function clearSrm(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'srm.clear'}>,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;
  const srm=await env.DB.prepare(`SELECT * FROM srm_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,p.srmVersionId).first<Record<string,unknown>>();
  if(!srm)throw new ApiError('NOT_FOUND','The SRM version was not found.');const engagement=await getEngagement(env,workspaceId,context,String(srm.engagement_id));
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL')throw new ApiError('INVALID_STATE','Partner SRM clearance follows handover into Partner Approval.');
  if(srm.dependency_hash!==p.dependencyHash)throw new ApiError('STALE_DEPENDENCY','The presented SRM hash does not match the immutable Manager recommendation.');
  const latest=await env.DB.prepare(`SELECT id FROM srm_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,engagement.id).first<{id:string}>();
  if(latest?.id!==p.srmVersionId)throw new ApiError('STALE_DEPENDENCY','A newer SRM version exists. Clear only the current Manager recommendation.');
  const inputs=await collectSrmInputs(env,workspaceId,context,engagement.id);const currentDependency=await rowHash({inputDependencyHash:inputs.inputDependencyHash,managerRecommendation:srm.manager_recommendation,estimatesText:srm.estimates_text});
  if(currentDependency!==srm.dependency_hash)throw new ApiError('STALE_DEPENDENCY','An SRM source changed after Manager compilation. Recompile the current snapshot before Partner clearance.');
  const managerPerson=await actorNaturalPerson(env,workspaceId,String(srm.compiled_by_actor_id));const partner=await actorStaff(env,workspaceId,context);
  if(!managerPerson||partner.natural_person_key===managerPerson)throw new ApiError('SELF_REVIEW_BLOCKED','Partner clearance must come from a different natural person from the Manager compiler.');
  const reused=await env.DB.prepare(`SELECT id FROM srm_clearances WHERE workspace_id=? AND srm_version_id=? AND dependency_hash=?`).bind(workspaceId,p.srmVersionId,p.dependencyHash).first<{id:string}>();
  if(reused)return commandMutation([],{srmVersionId:p.srmVersionId,clearanceId:reused.id,dependencyHash:p.dependencyHash,reused:true},'SRM_CLEARANCE',reused.id,null,1);
  const clearanceId=crypto.randomUUID();return commandMutation([env.DB.prepare(`INSERT INTO srm_clearances(id,workspace_id,srm_version_id,partner_actor_id,rationale,dependency_hash,signed_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(clearanceId,workspaceId,p.srmVersionId,context.actor.id,p.rationale,p.dependencyHash,now),pushChange(env,workspaceId,engagement.id,'SRMClearance',clearanceId,1,now)],
    {srmVersionId:p.srmVersionId,clearanceId,dependencyHash:p.dependencyHash,clearedAt:now},'SRM_CLEARANCE',clearanceId,null,1,{srmVersionId:p.srmVersionId,dependencyHash:p.dependencyHash});
}

export async function buildBusinessFieldworkMutation(env:Env,workspaceId:string,context:BusinessContext,command:BusinessFieldworkCommand,commandId:string,now:string):Promise<BusinessMutation>{
  switch(command.type){
    case 'statement.snapshot':return saveStatementSnapshot(env,workspaceId,context,command,now);
    case 'analytical-review.save':return saveAnalyticalReview(env,workspaceId,context,command,now);
    case 'analytical-review.submit':return submitAnalyticalReview(env,workspaceId,context,command,now);
    case 'going-concern.save':return saveGoingConcern(env,workspaceId,context,command,now);
    case 'workprogram.template.create':return createWorkprogramTemplate(env,workspaceId,context,command,now);
    case 'workprogram.template.approve':return approveWorkprogramTemplate(env,workspaceId,context,command,now);
    case 'workprogram.provision':return provisionWorkprogram(env,workspaceId,context,command,now);
    case 'procedure.insert':return insertProcedure(env,workspaceId,context,command,now);
    case 'procedure.update':return updateProcedure(env,workspaceId,context,command,now);
    case 'procedure.mark-not-applicable':return markNotApplicable(env,workspaceId,context,command,now);
    case 'procedure.submit':return submitProcedure(env,workspaceId,context,command,now);
    case 'procedure.review':return reviewProcedure(env,workspaceId,context,command,now);
    case 'review.submit':return submitReview(env,workspaceId,context,command,now);
    case 'review.decide':return decideReview(env,workspaceId,context,command,now);
    case 'review.respond':return respondReviewNote(env,workspaceId,context,command,now);
    case 'review.close-note':return closeReviewNote(env,workspaceId,context,command,now);
    case 'partner.clear-area':return clearPartnerArea(env,workspaceId,context,command,now);
    case 'fieldwork.handover-manager':return handoverToManager(env,workspaceId,context,command,commandId,now);
    case 'fieldwork.handover-partner':return handoverToPartner(env,workspaceId,context,command,commandId,now);
    case 'finding.create':return createFinding(env,workspaceId,context,command,now);
    case 'finding.respond':return respondFinding(env,workspaceId,context,command,now);
    case 'finding.resolve':return resolveFinding(env,workspaceId,context,command,now);
    case 'adjustment.create':return createAdjustment(env,workspaceId,context,command,now);
    case 'adjustment.propose':return proposeAdjustment(env,workspaceId,context,command,now);
    case 'adjustment.client-respond':return respondToAdjustment(env,workspaceId,context,command,now);
    case 'adjustment.approve':return approveAdjustment(env,workspaceId,context,command,now);
    case 'difference.create':return createDifference(env,workspaceId,context,command,now);
    case 'srm.compile':return compileSrm(env,workspaceId,context,command,now);
    case 'srm.clear':return clearSrm(env,workspaceId,context,command,now);
    case 'sampling.policy.create':return createSamplingPolicy(env,workspaceId,context,command,now);
    case 'sampling.policy.approve':return approveSamplingPolicy(env,workspaceId,context,command,now);
    case 'sampling.population.create':return createSamplePopulation(env,workspaceId,context,command,now);
    case 'sampling.plan':return createSamplingPlan(env,workspaceId,context,command,now);
    case 'sampling.record-test':return recordSampleTest(env,workspaceId,context,command,now);
    case 'sampling.evaluate':return evaluateSampling(env,workspaceId,context,command,now);
    case 'evidence.create':return createEvidence(env,workspaceId,context,command,now);
    case 'evidence.link':return linkEvidence(env,workspaceId,context,command,now);
    case 'evidence.review':return reviewEvidence(env,workspaceId,context,command,now);
    case 'evidence.unlink':return unlinkEvidence(env,workspaceId,context,command,now);
    case 'confirmation.create':return createConfirmation(env,workspaceId,context,command,now);
    case 'confirmation.dispatch':return dispatchConfirmation(env,workspaceId,context,command,commandId,now);
    case 'confirmation.record-response':return recordConfirmationResponse(env,workspaceId,context,command,now);
    case 'confirmation.verify':return verifyConfirmation(env,workspaceId,context,command,now);
    case 'confirmation.cancel':return cancelConfirmation(env,workspaceId,context,command,now);
    case 'confirmation.scope-reassess':return reassessConfirmationScope(env,workspaceId,context,command,now);
    case 'confirmation.follow-up':return addConfirmationFollowup(env,workspaceId,context,command,now);
    case 'confirmation.alternative-procedure':return recordConfirmationAlternative(env,workspaceId,context,command,now);
  }
}
