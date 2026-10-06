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
  explanation: text(10,10000).nullable().optional(), conclusion: text(10,5000).nullable().optional(), ratios: z.array(ratioInput).max(30).default([])
}) });
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
  procedureId: id, expectedVersion: z.number().int().positive(), decision: z.enum(['ACCEPT','REWORK','NOT_APPLICABLE_APPROVED']), comments: text(10,10000)
}) });
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
  engagementId: id, populationId: id, policyId: id, method: z.enum(['MUS_BINOMIAL_PPS','SYSTEMATIC','STRATIFIED_ATTRIBUTE']),
  confidenceBps: z.number().int().min(5000).max(9999).nullable().optional(), tolerableMinor: minor.nullable().optional(),
  expectedTaintedBps: z.number().int().min(0).max(9999).nullable().optional(), requestedCount: z.number().int().positive().nullable().optional(),
  sampleSizeRationale: text(10,5000).nullable().optional(), orderingRule: z.enum(['SOURCE_ROW_ASC','REFERENCE_ASC','SERVER_SEEDED_SHUFFLE']).default('SOURCE_ROW_ASC'),
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
  procedureNotApplicable, procedureSubmit, procedureReview, samplingPolicyCreate, samplingPolicyApprove,
  samplingPopulationCreate, samplingPlan, samplingRecordTest, samplingEvaluate, evidenceCreate, evidenceLink,
  evidenceReview, evidenceUnlink] as const;
export const businessFieldworkCommandSchema = z.discriminatedUnion('type', businessFieldworkCommands);
export type BusinessFieldworkCommand = z.infer<typeof businessFieldworkCommandSchema>;
export function isBusinessFieldworkCommand(command: { type: string }): command is BusinessFieldworkCommand {
  return command.type === 'statement.snapshot' || command.type.startsWith('analytical-review.') || command.type.startsWith('going-concern.')
    || command.type.startsWith('workprogram.') || command.type.startsWith('procedure.') || command.type.startsWith('sampling.')
    || command.type.startsWith('evidence.');
}

type Engagement = { id: string; client_id: string; lifecycle_state: string; period_start: string; period_end: string; locked_at: string | null; standards_profile_id: string; active_tb_version_id: string | null; active_mapping_version_id: string | null; active_materiality_version_id: string | null; approved_planning_version_id: string | null };
type StatementLine = { fsliId: string; code: string; name: string; statement: string; category: string; displaySign: number; currentBaseMinor: number; currentAdjustedMinor: number; priorMinor: number | null; varianceNumerator: string | null; varianceDenominator: string | null; variancePercent: number | null; varianceReason: string; riskBand: string; sourceRows: Array<Record<string, unknown>> };

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
  const row = await env.DB.prepare(`SELECT id,client_id,lifecycle_state,period_start,period_end,locked_at,standards_profile_id,
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
    const current=currentRaw*sign;const prior=priorRaw===null?null:priorRaw*sign;
    const reason=prior===null?'NO_COMPARATIVE':prior===0?(current===0?'ZERO_BOTH':'NEW_BALANCE'):'CALCULATED';
    const numerator=prior===null||prior===0?null:String(current-prior);const denominator=prior===null||prior===0?null:String(Math.abs(prior));
    const percent=reason==='CALCULATED'&&prior!==null?(current-prior)/Math.abs(prior)*100:null;
    return {fsliId,code:String(item.code),name:String(item.name),statement:String(item.statement),category:String(item.category),displaySign:sign,
      currentBaseMinor:current,currentAdjustedMinor:current,priorMinor:prior,varianceNumerator:numerator,varianceDenominator:denominator,
      variancePercent:percent===null?null:Math.round(percent*100)/100,varianceReason:reason,riskBand:riskMap.get(fsliId)??'GREEN',
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
  const sourceHash=await rowHash({engagementId,pins,lines:lines.map(line=>({fsliId:line.fsliId,current:line.currentBaseMinor,prior:line.priorMinor,riskBand:line.riskBand}))});
  return {engagementId,sourcePins:pins,sourceHash,adjustmentSetHash:await rowHash([]),basis:'ADJUSTED',profitLoss,balanceSheet,
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
  return {sourcePins:statements.sourcePins,sourceHash:statements.sourceHash,fsli:{id:line.fsliId,code:line.code,name:line.name},
    rows:page,adjustments:[],nextCursor:start+page.length<line.sourceRows.length?String(start+page.length):null,totalRows:line.sourceRows.length};
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
      p.input_hash AS inputHash,p.reason,p.created_at AS createdAt,(SELECT e.result FROM sampling_evaluations e WHERE e.workspace_id=p.workspace_id AND e.plan_id=p.id ORDER BY e.revision DESC LIMIT 1) AS latestResult
      FROM sampling_plans p JOIN sample_populations s ON s.workspace_id=p.workspace_id AND s.id=p.population_id WHERE p.workspace_id=? AND s.engagement_id=? ORDER BY p.created_at DESC`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT COALESCE(MAX(sequence),0) AS cursor FROM fieldwork_change_feed WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagementId).first<{cursor:number}>()
  ] as const);
  const [staff,evidenceLinks]=await Promise.all([
    env.DB.prepare(`SELECT id,display_name AS displayName,grade FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY grade,display_name`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT l.id,l.evidence_id AS evidenceId,l.evidence_version AS evidenceVersion,l.target_version AS targetVersion,
      CASE WHEN l.procedure_id IS NOT NULL THEN 'PROCEDURE' WHEN l.sample_test_id IS NOT NULL THEN 'SAMPLE_TEST' WHEN l.analytical_review_id IS NOT NULL THEN 'ANALYTICAL_REVIEW' ELSE 'FINDING' END AS targetType,
      COALESCE(l.procedure_id,l.sample_test_id,l.analytical_review_id,l.finding_id) AS targetId,u.reason AS unlinkReason,l.linked_at AS linkedAt
      FROM evidence_links l LEFT JOIN evidence_unlinks u ON u.workspace_id=l.workspace_id AND u.evidence_link_id=l.id WHERE l.workspace_id=? AND l.engagement_id=? ORDER BY l.linked_at DESC LIMIT 500`).bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  const samplingPlanRows=(plans.results??[]) as unknown as Array<{id:string;populationId:string;policyId:string;policyVersion:number;seedHex:string;revision:number;method:string;confidenceBps:number|null;
    tolerableMinor:number|null;expectedTaintedBps:number|null;requestedCount:number|null;calculatedCount:number;parametersJson:string;inputHash:string;reason:string;createdAt:string;latestResult:string|null}>;
  return {engagement:{id:engagement.id,clientId:engagement.client_id,state:engagement.lifecycle_state,periodStart:engagement.period_start,periodEnd:engagement.period_end,standardsProfileId:engagement.standards_profile_id,
      activeTbVersionId:engagement.active_tb_version_id,activeMappingVersionId:engagement.active_mapping_version_id,approvedPlanningVersionId:engagement.approved_planning_version_id},
    staff:staff.results??[],evidenceLinks:evidenceLinks.results??[],
    statements,templates:templates.results??[],analyticalReviews:reviews.results??[],goingConcern:going?{...going,checklist:JSON.parse(String(going.checklistJson))}:null,
    workprograms:programs.results??[],procedures:procedures.results??[],evidence:evidence.results??[],samplingPolicies:policies.results??[],populations:populations.results??[],samplingPlans:samplingPlanRows.map(row=>({...row,parameters:JSON.parse(String(row.parametersJson))})),changeCursor:changes?.cursor??0};
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
      exclusion_reason AS exclusionReason FROM population_rows WHERE workspace_id=? AND population_id=? ORDER BY ordinal`)
    .bind(workspaceId,populationId).all<Record<string,unknown>>();
  return {population,rows:rows.results??[]};
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
  return {rows,hash:await rowHash(rows.map(row=>({id:row.id,version:row.version,adequacy:row.adequacy,sha256:row.sha256}))),adequate:rows.filter(row=>row.adequacy==='ADEQUATE').length};
}
function pushChange(env:Env,workspaceId:string,engagementId:string,entityType:string,entityId:string,rowVersion:number,now:string){
  return env.DB.prepare(`INSERT INTO fieldwork_change_feed(workspace_id,sequence,entity_type,entity_id,row_version,engagement_id,changed_at)
    SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,?,? FROM fieldwork_change_feed WHERE workspace_id=?`)
    .bind(workspaceId,entityType,entityId,rowVersion,engagementId,now,workspaceId);
}
async function currentProcedure(env:Env,workspaceId:string,procedureId:string){
  const row=await env.DB.prepare(`SELECT p.id,p.version,p.workprogram_id,p.ordinal,p.title,p.instructions,p.assertion,p.origin,p.mandatory,p.scope_reason,p.work_performed,p.conclusion,p.applicable,
      p.not_applicable_reason,p.status,p.source_hash,p.evidence_set_hash,w.client_id,w.engagement_id,w.risk_band,w.assigned_staff_id,w.planning_version_id,e.approved_planning_version_id,e.lifecycle_state,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id
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
  const lineRows=[...view.profitLoss,...view.balanceSheet].map(line=>[crypto.randomUUID(),workspaceId,snapshotId,line.fsliId,line.currentBaseMinor,0,line.currentAdjustedMinor,
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
  const reviewId=crypto.randomUUID();const reviewSourceHash=await rowHash({snapshot:snapshot.source_hash,fsliId:p.fsliId,expectation:p.expectationText,thresholdMinor:p.thresholdMinor??null,thresholdBps:p.thresholdBps??null,ratios:p.ratios});
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO analytical_reviews(id,workspace_id,version,client_id,engagement_id,fsli_id,statement_snapshot_id,expectation_text,threshold_minor,threshold_bps,explanation,conclusion,status,prepared_by_actor_id,source_hash,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?)`).bind(reviewId,workspaceId,engagement.client_id,engagement.id,p.fsliId,p.statementSnapshotId,p.expectationText,p.thresholdMinor??null,p.thresholdBps??null,p.explanation??null,p.conclusion??null,context.actor.id,reviewSourceHash,now,now)];
  for(const ratio of p.ratios){
    const numerator=moneyMinor(ratio.numeratorMinor);const denominator=moneyMinor(ratio.denominatorMinor);const undefinedReason=denominator===0?'ZERO_DENOMINATOR':null;
    statements.push(env.DB.prepare(`INSERT INTO analytical_ratios(id,workspace_id,analytical_review_id,name,numerator_minor,denominator_minor,result_numerator,result_denominator,undefined_reason,numerator_source,denominator_source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,reviewId,ratio.name,numerator,denominator,undefinedReason?null:String(numerator),undefinedReason?null:String(denominator),undefinedReason,ratio.numeratorSource,ratio.denominatorSource));
  }
  return commandMutation(statements,{analyticalReviewId:reviewId,version:1,fsli:{id:line.fsliId,code:line.code},sourceHash:reviewSourceHash,variancePercent:line.variancePercent,varianceReason:line.varianceReason},'ANALYTICAL_REVIEW',reviewId,null,1);
}

async function submitAnalyticalReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'analytical-review.submit'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const review=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,fsli_id,statement_snapshot_id,explanation,conclusion,status,source_hash
    FROM analytical_reviews WHERE workspace_id=? AND id=?`).bind(workspaceId,p.analyticalReviewId).first<Record<string,unknown>>();
  if(!review)throw new ApiError('NOT_FOUND','Analytical review was not found.');
  if(Number(review.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'AnalyticalReview',id:review.id,expectedVersion:p.expectedVersion,currentVersion:review.version}));
  const engagement=await getEngagement(env,workspaceId,context,String(review.engagement_id));if(engagement.client_id!==review.client_id)throw new ApiError('FORBIDDEN_SCOPE','Analytical review is outside the engagement.');
  if(review.status!=='DRAFT'&&review.status!=='UNDER_REWORK')throw new ApiError('INVALID_STATE','Only a draft analytical review can be submitted.');
  if(!review.explanation||String(review.explanation).trim().length<10||!review.conclusion||String(review.conclusion).trim().length<10)throw new ApiError('VALIDATION_FAILED','An explanation and conclusion are required before submission.');
  const view=await financialStatements(env,workspaceId,context,engagement.id);const snapshot=await env.DB.prepare(`SELECT source_hash FROM statement_snapshots WHERE workspace_id=? AND id=?`).bind(workspaceId,review.statement_snapshot_id).first<{source_hash:string}>();
  if(snapshot?.source_hash!==view.sourceHash)throw new ApiError('STALE_DEPENDENCY','The statement source changed after this review was drafted. Rebuild the analysis on a current snapshot.');
  const support=await evidenceSet(env,workspaceId,'analytical_review_id',p.analyticalReviewId,true);
  if(support.rows.some(item=>item.target_version!==p.expectedVersion))throw new ApiError('STALE_DEPENDENCY','Analytical-review evidence is linked to an older review version. Re-link it to the current analysis.');
  if(!support.adequate)throw new ApiError('GATE_BLOCKED','At least one adequate, current evidence item must support the analytical conclusion.');
  return commandMutation([versionGuard(env,workspaceId,990,'analytical_reviews','id',p.analyticalReviewId,p.expectedVersion),
    env.DB.prepare(`UPDATE analytical_reviews SET version=version+1,status='SUBMITTED',updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(now,workspaceId,p.analyticalReviewId,p.expectedVersion)],
    {analyticalReviewId:p.analyticalReviewId,version:p.expectedVersion+1,status:'SUBMITTED',sourceHash:view.sourceHash},'ANALYTICAL_REVIEW',p.analyticalReviewId,p.expectedVersion,p.expectedVersion+1);
}

async function saveGoingConcern(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'going-concern.save'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const engagement=await getEngagement(env,workspaceId,context,p.engagementId);
  const profile=await env.DB.prepare(`SELECT isa_570_edition FROM standards_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,engagement.standards_profile_id).first<{isa_570_edition:string}>();
  if(!profile)throw new ApiError('STALE_DEPENDENCY','The engagement standards profile is missing.');
  if(engagement.period_start>='2026-12-15'&&!/2024/i.test(profile.isa_570_edition))throw new ApiError('STANDARDS_PROFILE_INCOMPATIBLE','Periods beginning on or after 15 December 2026 require an approved ISA 570 (Revised 2024) profile.');
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
  if(p.afterProcedureId){const after=(steps.results??[]).find(item=>item.id===p.afterProcedureId);if(!after)throw new ApiError('NOT_FOUND','The procedure selected as the insertion point was not found.');ordinal=after.ordinal+1;
    statements.push(env.DB.prepare(`UPDATE procedures SET ordinal=ordinal+1000000 WHERE workspace_id=? AND workprogram_id=? AND ordinal>=?`).bind(workspaceId,p.workprogramId,ordinal));
    statements.push(env.DB.prepare(`UPDATE procedures SET ordinal=ordinal-999999 WHERE workspace_id=? AND workprogram_id=? AND ordinal>=1000001`).bind(workspaceId,p.workprogramId));
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
  const submissionId=crypto.randomUUID();const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`UPDATE procedures SET version=?,applicable=0,not_applicable_reason=?,status='SUBMITTED',prepared_by_staff_id=?,evidence_set_hash=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`)
      .bind(nextVersion,p.reason,(await actorStaff(env,workspaceId,context)).id,evidence.hash,sourceHash,now,workspaceId,p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,p.procedureId,nextVersion,JSON.stringify(content),evidence.hash,context.actor.id,now,p.reason),
    env.DB.prepare(`INSERT INTO procedure_submissions(id,workspace_id,procedure_id,row_version,content_version,evidence_set_hash,source_hash,submitted_by_actor_id,submitted_at,status) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTED')`)
      .bind(submissionId,workspaceId,p.procedureId,nextVersion,p.expectedVersion,evidence.hash,sourceHash,context.actor.id,now),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,submissionId,version:nextVersion,status:'SUBMITTED',applicable:false,reviewRequired:true},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion,{notApplicableReason:p.reason});
}

async function submitProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.submit'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.procedureId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='IN_PROGRESS'&&row.status!=='NOT_STARTED'&&row.status!=='UNDER_REWORK')throw new ApiError('INVALID_STATE','Only editable procedure work can be submitted.');
  if(row.applicable===0){if(!row.not_applicable_reason)throw new ApiError('VALIDATION_FAILED','A not-applicable procedure needs a reason and reviewer approval.');}
  else{
    if(String(row.work_performed??'').trim().length<10||String(row.conclusion??'').trim().length<10)throw new ApiError('VALIDATION_FAILED','Work performed and a conclusion are required before submission.');
    const support=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,true);if(Number(row.mandatory)===1&&support.adequate===0)throw new ApiError('GATE_BLOCKED','A mandatory procedure needs at least one adequate current evidence item.');
  }
  const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,false);
  if(evidence.rows.some(item=>item.target_version!==p.expectedVersion))throw new ApiError('STALE_DEPENDENCY','Procedure evidence is linked to an older row version. Re-link it to the current procedure revision.');
  if(evidence.hash!==row.evidence_set_hash)throw new ApiError('STALE_DEPENDENCY','Evidence changed after the current procedure revision. Re-save and review the current source pins.');
  const submissionId=crypto.randomUUID();const nextVersion=p.expectedVersion+1;const content={procedureId:p.procedureId,version:nextVersion,sourceVersion:p.expectedVersion,sourceHash:row.source_hash,evidenceSetHash:evidence.hash,workPerformed:row.work_performed,conclusion:row.conclusion,applicable:Boolean(row.applicable),notApplicableReason:row.not_applicable_reason};
  const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`UPDATE procedures SET version=?,status='SUBMITTED',updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,now,workspaceId,p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason) VALUES(?,?,?,?,?,?,?,?,NULL)`)
      .bind(crypto.randomUUID(),workspaceId,p.procedureId,nextVersion,JSON.stringify(content),evidence.hash,context.actor.id,now),
    env.DB.prepare(`INSERT INTO procedure_submissions(id,workspace_id,procedure_id,row_version,content_version,evidence_set_hash,source_hash,submitted_by_actor_id,submitted_at,status) VALUES(?,?,?,?,?,?,?,?,?,'SUBMITTED')`)
      .bind(submissionId,workspaceId,p.procedureId,nextVersion,p.expectedVersion,evidence.hash,String(row.source_hash),context.actor.id,now),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,submissionId,version:nextVersion,status:'SUBMITTED',sourceHash:row.source_hash,evidenceSetHash:evidence.hash},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion);
}

async function reviewProcedure(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'procedure.review'}>,now:string):Promise<BusinessMutation>{
  requireReviewer(context);const p=command.payload;const row=await currentProcedure(env,workspaceId,p.procedureId);await verifyProcedureScope(context,row);
  if(Number(row.version)!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT',JSON.stringify({entity:'Procedure',id:p.procedureId,expectedVersion:p.expectedVersion,currentVersion:row.version}));
  if(row.status!=='SUBMITTED')throw new ApiError('INVALID_STATE','Only an exact current submitted procedure revision can be reviewed.');
  const submission=await env.DB.prepare(`SELECT id,row_version,content_version,evidence_set_hash,source_hash,status,submitted_by_actor_id FROM procedure_submissions WHERE workspace_id=? AND procedure_id=? ORDER BY submitted_at DESC LIMIT 1`).bind(workspaceId,p.procedureId).first<Record<string,unknown>>();
  if(!submission||Number(submission.row_version)!==p.expectedVersion||submission.status!=='SUBMITTED')throw new ApiError('STALE_DEPENDENCY','The submitted procedure revision is no longer current.');
  const [submitterKey,reviewer]=await Promise.all([actorNaturalPerson(env,workspaceId,String(submission.submitted_by_actor_id)),actorStaff(env,workspaceId,context)]);
  if(submission.submitted_by_actor_id===context.actor.id||(submitterKey&&submitterKey===reviewer.natural_person_key))throw new ApiError('SELF_REVIEW_BLOCKED','The same natural person cannot review work they prepared, even after switching personas.');
  const evidence=await evidenceSet(env,workspaceId,'procedure_id',p.procedureId,p.decision==='ACCEPT');
  if(evidence.rows.some(item=>item.target_version!==submission.content_version))throw new ApiError('STALE_DEPENDENCY','A linked evidence target pin does not match the submitted procedure content revision.');
  if(evidence.hash!==submission.evidence_set_hash||row.source_hash!==submission.source_hash)throw new ApiError('STALE_DEPENDENCY','Procedure or evidence content changed after submission.');
  if(row.risk_band==='RED'){
    const executor=await env.DB.prepare(`SELECT grade FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,row.executed_by_staff_id).first<{grade:string}>();
    if(p.decision==='ACCEPT'&&(!executor||!['MANAGER','PARTNER'].includes(executor.grade)))throw new ApiError('GATE_BLOCKED','Red-risk procedures require recorded Manager-grade execution before review.');
  }
  if(row.applicable===0&&p.decision!=='NOT_APPLICABLE_APPROVED'&&p.decision!=='REWORK')throw new ApiError('VALIDATION_FAILED','A not-applicable procedure requires an explicit independent approval.');
  if(row.applicable===1&&p.decision==='NOT_APPLICABLE_APPROVED')throw new ApiError('INVALID_STATE','Only a reasoned not-applicable procedure can receive that decision.');
  const decisionId=crypto.randomUUID();const newStatus=p.decision==='REWORK'?'UNDER_REWORK':'REVIEWED';const nextVersion=p.expectedVersion+1;
  const statements=[versionGuard(env,workspaceId,990,'procedures','id',p.procedureId,p.expectedVersion),
    env.DB.prepare(`INSERT INTO procedure_review_decisions(id,workspace_id,submission_id,decision,comments,reviewer_actor_id,decided_at) VALUES(?,?,?,?,?,?,?)`).bind(decisionId,workspaceId,submission.id,p.decision,p.comments,context.actor.id,now),
    env.DB.prepare(`UPDATE procedure_submissions SET status=? WHERE workspace_id=? AND id=? AND status='SUBMITTED'`).bind(p.decision==='REWORK'?'UNDER_REWORK':'REVIEWED',workspaceId,submission.id),
    env.DB.prepare(`UPDATE procedures SET version=?,status=?,updated_at=? WHERE workspace_id=? AND id=? AND version=?`).bind(nextVersion,newStatus,now,workspaceId,p.procedureId,p.expectedVersion),
    pushChange(env,workspaceId,String(row.engagement_id),'Procedure',p.procedureId,nextVersion,now)];
  return commandMutation(statements,{procedureId:p.procedureId,decisionId,version:nextVersion,status:newStatus,comments:p.comments},'PROCEDURE',p.procedureId,p.expectedVersion,nextVersion,{submissionId:submission.id,decision:p.decision});
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

async function recordSampleTest(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessFieldworkCommand,{type:'sampling.record-test'}>,now:string):Promise<BusinessMutation>{
  requireWriter(context);const p=command.payload;
  const target=await env.DB.prepare(`SELECT p.id,p.method,p.population_id,s.engagement_id,s.client_id,s.tb_version_id,e.active_tb_version_id,e.locked_at,e.lifecycle_state
    FROM sampling_plans p JOIN sample_populations s ON s.workspace_id=p.workspace_id AND s.id=p.population_id JOIN engagements e ON e.workspace_id=s.workspace_id AND e.id=s.engagement_id
    WHERE p.workspace_id=? AND p.id=?`).bind(workspaceId,p.planId).first<Record<string,unknown>>();
  if(!target)throw new ApiError('NOT_FOUND','Sampling plan was not found.');if((context.scope.clientId&&context.scope.clientId!==target.client_id)||(context.scope.engagementId&&context.scope.engagementId!==target.engagement_id))throw new ApiError('FORBIDDEN_SCOPE','Sampling plan is outside the selected engagement.');
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
  if(missing.length){result='INCOMPLETE';details.missingPopulationRowIds=missing;}
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
    const alpha=(10000-Number(plan.confidence_bps))/10000;const evaluations:Array<{id:string;tested:number;deviations:number;upper:number|null;result:'WITHIN_TOLERANCE'|'EXCEEDS_TOLERANCE'|'INCOMPLETE'}>=[];
    for(const stratum of stratumResult.results??[]){
      const selected=hits.filter(hit=>hit.stratumKey===stratum.key);const outstanding=selected.some(hit=>Number(testMap.get(hit.populationRowId)?.tested)!==1);const deviations=selected.filter(hit=>Number(testMap.get(hit.populationRowId)?.deviation)===1).length;
      let upper:number|null=null;let stratumOutcome:'WITHIN_TOLERANCE'|'EXCEEDS_TOLERANCE'|'INCOMPLETE';
      if(outstanding)stratumOutcome='INCOMPLETE';else if(selected.length===Number(stratum.populationCount)) {upper=deviations;stratumOutcome=deviations*10000<=Number(stratum.populationCount)*Number(stratum.tolerableDeviationBps)?'WITHIN_TOLERANCE':'EXCEEDS_TOLERANCE';}
      else{upper=upperHypergeometricDeviation(deviations,Number(stratum.populationCount),selected.length,alpha/(stratumResult.results??[]).length);stratumOutcome=upper*10000<=Number(stratum.populationCount)*Number(stratum.tolerableDeviationBps)?'WITHIN_TOLERANCE':'EXCEEDS_TOLERANCE';}
      evaluations.push({id:String(stratum.id),tested:selected.length,deviations,upper,result:stratumOutcome});
    }
    testedHitCount=hits.length;taintedHitCount=evaluations.reduce((sum,item)=>sum+item.deviations,0);
    result=evaluations.some(item=>item.result==='INCOMPLETE')?'INCOMPLETE':evaluations.some(item=>item.result==='EXCEEDS_TOLERANCE')?'EXCEEDS_TOLERANCE':'WITHIN_TOLERANCE';
    details={...details,confidenceBps:plan.confidence_bps,familywiseMethod:'BONFERRONI',perStratum:evaluations.map(item=>({stratumId:item.id,testedCount:item.tested,deviationCount:item.deviations,upperPopulationDeviationCount:item.upper,result:item.result}))};
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
  const rowValues=rows.map(row=>[row.id,workspaceId,populationId,row.key,row.ordinal,row.amount,1,null,JSON.stringify({reference:row.reference,description:row.description,sourceRowNumber:row.sourceRowNumber})]);
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
  const rowResult=await env.DB.prepare(`SELECT id,source_row_key,ordinal,book_value_minor,eligible FROM population_rows WHERE workspace_id=? AND population_id=? ORDER BY ordinal`)
    .bind(workspaceId,p.populationId).all<{id:string;source_row_key:string;ordinal:number;book_value_minor:number;eligible:number}>();
  const allRows=rowResult.results??[];const revisionRow=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM sampling_plans WHERE workspace_id=? AND population_id=?`).bind(workspaceId,p.populationId).first<{revision:number}>();
  const planId=crypto.randomUUID();const revision=(revisionRow?.revision??0)+1;const seedHex=randomToken(32);const random=await keyedSampler(seedHex);
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
    const ordered=allRows.filter(row=>row.eligible===1);if(!ordered.length||p.requestedCount>ordered.length)throw new ApiError('INVALID_SAMPLE_PARAMETERS',`Requested count must be between 1 and the ${ordered.length} eligible population rows.`);
    if(p.orderingRule==='REFERENCE_ASC')ordered.sort((a,b)=>a.source_row_key.localeCompare(b.source_row_key));requestedCount=p.requestedCount;
    let counter=0;
    if(p.orderingRule==='SERVER_SEEDED_SHUFFLE')for(let index=ordered.length-1;index>0;index--){const swap=Number(await random(counter++,BigInt(index+1)));[ordered[index],ordered[swap]]=[ordered[swap],ordered[index]];}
    const start=Number(await random(counter,BigInt(ordered.length)));const selected=new Set<string>();
    for(let j=0;j<requestedCount;j++){const position=Math.floor((start+j*ordered.length)/requestedCount);const row=ordered[position];if(!row||selected.has(row.id))throw new ApiError('UNAVAILABLE','Systematic selection produced a duplicate position. No plan was saved.');selected.add(row.id);hits.push({drawNumber:j+1,rowId:row.id,monetaryUnitMinor:null,stratumKey:null});}
    parameters={selectionMode:requestedCount===ordered.length?'CENSUS':'SYSTEMATIC',intervalNumerator:ordered.length,intervalDenominator:requestedCount,startNumerator:String(start),startDenominator:String(requestedCount),orderingRule:p.orderingRule,
      orderingHash:await rowHash(ordered.map(row=>row.id)),sampleSizeRationale:p.sampleSizeRationale,confidenceClaim:null,algorithmVersion:policy.algorithmVersion};
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
    parameters={confidenceBps,alpha:{numerator:String(10000-confidenceBps),denominator:'10000'},familywiseMethod:'BONFERRONI',strata:strataParams,algorithmVersion:policy.algorithmVersion};
  }
  const inputHash=await rowHash({method:p.method,populationId:population.id,sourceHash:population.source_hash,orderHash:population.order_hash,policyId:policy.id,policyVersion:policy.version,policyAlgorithm:policy.algorithmVersion,parameters,reason:p.reason});
  const planRow=env.DB.prepare(`INSERT INTO sampling_plans(id,workspace_id,population_id,policy_id,policy_version,revision,method,confidence_bps,tolerable_minor,expected_tainted_bps,requested_count,seed_hex,input_hash,calculated_count,parameters_json,created_by_reviewer_id,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(planId,workspaceId,population.id,policy.id,policy.version,revision,p.method,confidenceBps,tolerableMinor,expectedBps,requestedCount,seedHex,inputHash,hits.length,JSON.stringify(parameters),context.actor.id,p.reason,now);
  const statements:D1PreparedStatement[]=[planRow];
  if(strataRows.length){
    for(const stratum of strataRows)statements.push(env.DB.prepare(`INSERT INTO sampling_strata(id,workspace_id,plan_id,key,description,population_count,expected_deviation_bps,tolerable_deviation_bps,alpha_numerator,alpha_denominator,sample_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(stratum.id,workspaceId,planId,stratum.key,stratum.description,stratum.rows.length,
        (p.strata??[]).find(item=>item.key===stratum.key)?.expectedDeviationBps,(p.strata??[]).find(item=>item.key===stratum.key)?.tolerableDeviationBps,String(10000-(confidenceBps??0)),String(10000*strataRows.length),stratum.sampleCount));
    const membershipRows=strataRows.flatMap(stratum=>stratum.rows.map(row=>[crypto.randomUUID(),workspaceId,planId,row.id,stratum.id]));
    statements.push(...makeMultiInsertStatements(env,'stratum_memberships',['id','workspace_id','plan_id','population_row_id','stratum_id'],membershipRows));
  }
  const rowById=new Map(allRows.map(row=>[row.id,row]));const hitRows=hits.map(hit=>[crypto.randomUUID(),workspaceId,planId,hit.drawNumber,hit.rowId,hit.monetaryUnitMinor,hit.stratumKey]);
  statements.push(...makeMultiInsertStatements(env,'sample_hits',['id','workspace_id','plan_id','draw_number','population_row_id','monetary_unit_minor','stratum_key'],hitRows));
  return commandMutation(statements,{planId,revision,method:p.method,calculatedCount:hits.length,distinctRowCount:new Set(hits.map(hit=>hit.rowId)).size,populationCount:p.method==='MUS_BINOMIAL_PPS'?allRows.filter(row=>row.book_value_minor>0).length:allRows.length,
    ...(p.method==='SYSTEMATIC'?{interval:{numerator:parameters.intervalNumerator,denominator:parameters.intervalDenominator},start:{numerator:parameters.startNumerator,denominator:parameters.startDenominator},selectionMode:parameters.selectionMode,confidenceClaim:null}:{}),
    ...(strataRows.length?{strata:strataRows.map(row=>({key:row.key,populationCount:row.rows.length,sampleCount:row.sampleCount}))}:{}),inputHash},'SAMPLING_PLAN',planId,null,1,{populationId:population.id,policyId:policy.id,method:p.method,seedHex,parameters,reason:p.reason});
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

export async function buildBusinessFieldworkMutation(env:Env,workspaceId:string,context:BusinessContext,command:BusinessFieldworkCommand,commandId:string,now:string):Promise<BusinessMutation>{
  void commandId;
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
  }
}
