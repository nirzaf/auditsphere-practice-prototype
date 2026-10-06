// Practice management is firm-scoped bookkeeping and operational reporting.
// It never writes client audit balances or changes an engagement lifecycle.
import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';
import type { BusinessContext, BusinessMutation } from './business';

const id = z.uuid();
const date = z.iso.date();
const amount = z.string().regex(/^(0|[1-9]\d{0,15})$/).refine(value => Number.isSafeInteger(Number(value)), 'Amount is outside safe QAR minor-unit precision.');
const signedAmount = z.string().regex(/^-?(0|[1-9]\d{0,15})$/).refine(value => Number.isSafeInteger(Number(value)), 'Amount is outside safe QAR minor-unit precision.');
const reason = (min = 10, max = 5000) => z.string().trim().min(min).max(max);
const phases = z.enum(['COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE']);
const grades = z.enum(['PARTNER','MANAGER','SENIOR','ASSOCIATE']);
const phaseValues=['COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE'] as const;
const timeLine = z.strictObject({ accountId: id, debitMinor: amount, creditMinor: amount, clientId: id.nullable().optional(), engagementId: id.nullable().optional(), memo: z.string().trim().max(1000).optional() })
  .refine(line => (BigInt(line.debitMinor)>0n)!==(BigInt(line.creditMinor)>0n), 'Each journal line must have exactly one positive debit or credit.');

const chargeRateSet = z.strictObject({ type:z.literal('practice.rate.set'),payload:z.strictObject({
  grade:grades,hourlyMinor:amount,effectiveFrom:date
})});
const timeCreate = z.strictObject({ type:z.literal('time.create'),payload:z.strictObject({
  engagementId:id,staffMemberId:id,workDate:date,phase:phases,fsliId:id.optional(),procedureId:id.optional(),minutes:z.number().int().min(1).max(1440),
  description:reason(10),billable:z.boolean(),startAt:z.iso.datetime().optional(),endAt:z.iso.datetime().optional()
}).refine(value => Boolean(value.startAt)===Boolean(value.endAt),'Provide both start and end times, or neither.')
  .refine(value => !value.startAt || Date.parse(value.endAt!)>Date.parse(value.startAt!), 'The end time must follow the start time.')
  .refine(value => !value.startAt || Date.parse(value.endAt!)-Date.parse(value.startAt!)===value.minutes*60_000,'Timed duration must match the recorded integer minutes.')});
const timeSubmit = z.strictObject({ type:z.literal('time.submit'),payload:z.strictObject({timeEntryId:id,expectedVersion:z.number().int().positive()})});
const timeApprove = z.strictObject({ type:z.literal('time.approve'),payload:z.strictObject({timeEntryId:id,expectedVersion:z.number().int().positive()})});
const timeReturn = z.strictObject({ type:z.literal('time.return'),payload:z.strictObject({timeEntryId:id,expectedVersion:z.number().int().positive(),reason:reason(10,2000)})});
const timeCorrect = z.strictObject({ type:z.literal('time.correct'),payload:z.strictObject({
  timeEntryId:id,expectedVersion:z.number().int().positive(),reason:reason(),replacement:z.strictObject({
    workDate:date.optional(),phase:phases.optional(),fsliId:id.nullable().optional(),procedureId:id.nullable().optional(),minutes:z.number().int().min(1).max(1440).optional(),
    description:reason(10).optional(),billable:z.boolean().optional(),startAt:z.iso.datetime().nullable().optional(),endAt:z.iso.datetime().nullable().optional()
  }).nullable().optional()
})});
const captureUtilization = z.strictObject({ type:z.literal('practice.capture-utilization-report'),payload:z.strictObject({
  from:date,to:date,staffMemberIds:z.array(id).max(500).optional()
}).refine(value=>value.from<=value.to,'The period end must not precede the start.')});
const budgetApprove = z.strictObject({ type:z.literal('budget.approve'),payload:z.strictObject({
  engagementId:id,feeProposalVersionId:id,phases:z.array(z.strictObject({phase:phases,grade:grades,plannedMinutes:z.number().int().min(0).max(1_000_000)})).min(1).max(24)
}).refine(value=>new Set(value.phases.map(item=>`${item.phase}:${item.grade}`)).size===value.phases.length,'Each phase and grade pair may appear once.')});
const accountCreate = z.strictObject({ type:z.literal('ledger.account.create'),payload:z.strictObject({
  code:z.string().trim().min(1).max(40),name:z.string().trim().min(1).max(200),accountType:z.enum(['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE']),
  normalSide:z.enum(['DEBIT','CREDIT']),postingAllowed:z.boolean().default(true),controlType:z.enum(['NONE','BANK','CASH','AR','AP','CONTRACT_LIABILITY','UNALLOCATED_RECEIPTS','PARTNER_CAPITAL','PARTNER_DRAWINGS']).default('NONE')
})});
const periodOpen = z.strictObject({ type:z.literal('accounting-period.open'),payload:z.strictObject({startDate:date,endDate:date}).refine(value=>value.startDate<=value.endDate,'The period end must not precede the start.')});
const periodClose = z.strictObject({ type:z.literal('accounting-period.close'),payload:z.strictObject({periodId:id})});
const journalCreate = z.strictObject({ type:z.literal('ledger.create-draft'),payload:z.strictObject({
  postingDate:date,description:reason(5,2000),sourceType:z.string().trim().min(1).max(120),sourceId:id.optional(),supportingFileId:id.optional(),lines:z.array(timeLine).min(2).max(100)
})});
const journalPost = z.strictObject({ type:z.literal('ledger.post'),payload:z.strictObject({journalId:id,expectedVersion:z.number().int().positive()})});
const journalReverse = z.strictObject({ type:z.literal('ledger.reverse'),payload:z.strictObject({journalId:id,postingDate:date,reason:reason()})});
const expenseCreate = z.strictObject({ type:z.literal('expense.create'),payload:z.strictObject({
  date, payee:z.string().trim().min(1).max(300),category:z.enum(['RENT','SALARIES_BENEFITS','OVERHEAD','PETTY_CASH','OTHER']),amountMinor:amount.refine(value=>BigInt(value)>0n),
  description:reason(10),supportingFileId:id.optional(),missingSupportReason:reason(10,2000).optional(),debitAccountId:id,
  settlementAccountId:id, paymentMethod:z.enum(['BANK','CASH','PAYABLE']),engagementId:id.optional()
}).refine(value=>Boolean(value.supportingFileId)||Boolean(value.missingSupportReason),'Attach a committed voucher or explain the approved support exception.')});
const expensePost = z.strictObject({ type:z.literal('expense.approve-and-post'),payload:z.strictObject({expenseId:id})});
const withdrawalPost = z.strictObject({ type:z.literal('partner-withdrawal.post'),payload:z.strictObject({
  partnerStaffId:id,date,amountMinor:amount.refine(value=>BigInt(value)>0n),equityAccountId:id,bankAccountId:id,reason:reason()
})});
const pettyCashReconcile = z.strictObject({ type:z.literal('petty-cash.reconcile'),payload:z.strictObject({accountId:id,asOf:date,countedCashMinor:amount,explanation:reason(),custodianStaffId:id})});
const revenuePolicySave = z.strictObject({ type:z.literal('revenue-policy.save'),payload:z.strictObject({
  name:z.string().trim().min(1).max(200),effectiveFrom:date,recognitionMethod:z.enum(['DEFER_UNTIL_EARNED','APPROVED_MILESTONE']),recognitionRules:reason(10,10000)
})});
const revenueRecognize = z.strictObject({ type:z.literal('revenue.recognize'),payload:z.strictObject({
  engagementId:id,policyId:id,date,amountMinor:amount.refine(value=>BigInt(value)>0n),basis:reason(),supportingFileId:id.optional()
})});
const captureProfitability = z.strictObject({ type:z.literal('practice.capture-profitability-report'),payload:z.strictObject({engagementId:id,asOf:z.iso.datetime().optional()})});
const paymentAllocate = z.strictObject({ type:z.literal('payment.allocate'),payload:z.strictObject({
  paymentId:id,effectiveDate:date,allocations:z.array(z.strictObject({invoiceId:id,amountMinor:amount.refine(value=>BigInt(value)>0n)})).min(1).max(30)
}).refine(value=>new Set(value.allocations.map(row=>row.invoiceId)).size===value.allocations.length,'Use one allocation per invoice.')});
const paymentReverseAllocation = z.strictObject({ type:z.literal('payment.reverse-allocation'),payload:z.strictObject({allocationId:id,effectiveDate:date,amountMinor:amount.refine(value=>BigInt(value)>0n),reason:reason()})});
const creditNoteIssue = z.strictObject({ type:z.literal('credit-note.issue'),payload:z.strictObject({invoiceId:id,date,amountMinor:amount.refine(value=>BigInt(value)>0n),reason:reason()})});
const captureAr = z.strictObject({ type:z.literal('practice.capture-ar-aging-report'),payload:z.strictObject({asOf:date,clientId:id.optional()})});
const exportReport = z.strictObject({type:z.literal('practice.export-report'),payload:z.strictObject({kind:z.enum(['TRIAL_BALANCE','MONTHLY_PROFIT_LOSS']),
  periodStart:date,periodEnd:date,format:z.enum(['CSV','XLSX','PDF'])}).refine(value=>value.periodStart<=value.periodEnd,'The report period end must not precede its start.')});

export const businessPracticeCommands = [chargeRateSet,timeCreate,timeSubmit,timeApprove,timeReturn,timeCorrect,captureUtilization,budgetApprove,accountCreate,periodOpen,periodClose,
  journalCreate,journalPost,journalReverse,expenseCreate,expensePost,withdrawalPost,pettyCashReconcile,revenuePolicySave,revenueRecognize,captureProfitability,
  paymentAllocate,paymentReverseAllocation,creditNoteIssue,captureAr,exportReport] as const;
export type BusinessPracticeCommand = z.infer<(typeof businessPracticeCommands)[number]>;
export function isBusinessPracticeCommand(command:{type:string}):command is BusinessPracticeCommand {
  return command.type.startsWith('time.') || command.type.startsWith('practice.') || command.type.startsWith('budget.')
    || command.type.startsWith('ledger.') || command.type.startsWith('accounting-period.') || command.type.startsWith('expense.')
    || command.type.startsWith('partner-withdrawal.') || command.type.startsWith('petty-cash.') || command.type.startsWith('revenue-policy.')
    || command.type==='revenue.recognize' || command.type==='payment.allocate' || command.type==='payment.reverse-allocation' || command.type==='credit-note.issue';
}

const rateDefaults:{grade:'PARTNER'|'MANAGER'|'SENIOR'|'ASSOCIATE';hourlyMinor:string}[]=[
  {grade:'PARTNER',hourlyMinor:'100000'},{grade:'MANAGER',hourlyMinor:'75000'},{grade:'SENIOR',hourlyMinor:'50000'},{grade:'ASSOCIATE',hourlyMinor:'20000'}
];
const accountDefaults:{code:string;name:string;accountType:'ASSET'|'LIABILITY'|'EQUITY'|'REVENUE'|'EXPENSE';normalSide:'DEBIT'|'CREDIT';controlType:string}[]=[
  {code:'1000',name:'Bank',accountType:'ASSET',normalSide:'DEBIT',controlType:'BANK'},
  {code:'1010',name:'Petty Cash',accountType:'ASSET',normalSide:'DEBIT',controlType:'CASH'},
  {code:'1100',name:'Trade Receivables',accountType:'ASSET',normalSide:'DEBIT',controlType:'AR'},
  {code:'2100',name:'Contract Liability',accountType:'LIABILITY',normalSide:'CREDIT',controlType:'CONTRACT_LIABILITY'},
  {code:'2110',name:'Unallocated Client Receipts',accountType:'LIABILITY',normalSide:'CREDIT',controlType:'UNALLOCATED_RECEIPTS'},
  {code:'2190',name:'Accounts Payable',accountType:'LIABILITY',normalSide:'CREDIT',controlType:'AP'},
  {code:'2200',name:'VAT Payable',accountType:'LIABILITY',normalSide:'CREDIT',controlType:'NONE'},
  {code:'3000',name:'Partner Capital',accountType:'EQUITY',normalSide:'CREDIT',controlType:'PARTNER_CAPITAL'},
  {code:'3100',name:'Partner Drawings',accountType:'EQUITY',normalSide:'DEBIT',controlType:'PARTNER_DRAWINGS'},
  {code:'4000',name:'Professional Fees',accountType:'REVENUE',normalSide:'CREDIT',controlType:'NONE'},
  {code:'5000',name:'Rent Expense',accountType:'EXPENSE',normalSide:'DEBIT',controlType:'NONE'},
  {code:'5100',name:'Salaries and Benefits',accountType:'EXPENSE',normalSide:'DEBIT',controlType:'NONE'},
  {code:'5200',name:'Operating Overheads',accountType:'EXPENSE',normalSide:'DEBIT',controlType:'NONE'},
  {code:'5300',name:'Petty Cash Expense',accountType:'EXPENSE',normalSide:'DEBIT',controlType:'NONE'}
];

/** Supplies the same real, explicit defaults to newly bootstrapped BUSINESS workspaces. */
export async function businessPracticeBootstrapStatements(env:Env,workspaceId:string,partnerActorId:string,now:string):Promise<D1PreparedStatement[]> {
  const statements:D1PreparedStatement[]=[];
  for(const rate of rateDefaults){
    const contentHash=await sha256Hex(JSON.stringify({grade:rate.grade,hourlyMinor:rate.hourlyMinor,effectiveFrom:'1970-01-01'}));
    statements.push(env.DB.prepare(`INSERT INTO firm_charge_out_rates(id,workspace_id,grade,hourly_minor,effective_from,effective_to,revision,content_sha256,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,'1970-01-01',NULL,1,?,?,?)`).bind(crypto.randomUUID(),workspaceId,rate.grade,Number(rate.hourlyMinor),contentHash,partnerActorId,now));
  }
  for(const account of accountDefaults){
    statements.push(env.DB.prepare(`INSERT INTO firm_accounts(id,workspace_id,code,name,account_type,parent_account_id,normal_side,posting_allowed,active,control_type,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,?,?,?,NULL,?,1,1,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,account.code,account.name,account.accountType,account.normalSide,account.controlType,partnerActorId,now,now));
  }
  const year=Number(now.slice(0,4));
  statements.push(env.DB.prepare(`INSERT INTO accounting_periods(id,workspace_id,start_date,end_date,status,created_by_actor_id,created_at)
    VALUES(?,?,?,?,'OPEN',?,?)`).bind(crypto.randomUUID(),workspaceId,`${year}-01-01`,`${year}-12-31`,partnerActorId,now));
  const policy={name:'Baseline deferred revenue recognition',effectiveFrom:'1970-01-01',recognitionMethod:'DEFER_UNTIL_EARNED',
    recognitionRules:'Invoice advances are contract liabilities until service is earned and explicitly recognized by a Partner.'};
  statements.push(env.DB.prepare(`INSERT INTO firm_revenue_policies(id,workspace_id,revision,name,effective_from,recognition_method,recognition_rules,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,1,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,policy.name,policy.effectiveFrom,policy.recognitionMethod,policy.recognitionRules,await sha256Hex(JSON.stringify(policy)),partnerActorId,now));
  return statements;
}

const mutation=(statements:D1PreparedStatement[],result:Record<string,unknown>,entityType:string,entityId:string,beforeVersion:number|null,afterVersion:number,auditDetails?:Record<string,unknown>):BusinessMutation=>({
  statements,result,entityType,entityId,beforeVersion,afterVersion,...(auditDetails?{auditDetails}:{})
});
function partner(context:BusinessContext):void { if(context.actor.persona!=='APPROVER'||context.actor.staffGrade!=='PARTNER')throw new ApiError('PERSONA_ACTION_DENIED','Only the selected PARTNER APPROVER can perform this action.'); }
function reviewerOrPartner(context:BusinessContext):void { if(!(context.actor.persona==='REVIEWER'||(context.actor.persona==='APPROVER'&&context.actor.staffGrade==='PARTNER')))throw new ApiError('PERSONA_ACTION_DENIED','Independent review by a REVIEWER or PARTNER APPROVER is required.'); }
function internal(context:BusinessContext):void { if(context.actor.persona==='CLIENT')throw new ApiError('PERSONA_ACTION_DENIED','Client profiles cannot use firm practice-management records.'); }
function safeNumber(value:bigint):number { const n=Number(value); if(!Number.isSafeInteger(n))throw new ApiError('VALIDATION_FAILED','The amount is outside supported QAR minor-unit precision.'); return n; }
function roundHalfUp(numerator:bigint,denominator:bigint):bigint { if(denominator<=0n)throw new ApiError('VALIDATION_FAILED','A positive denominator is required.'); return (numerator*2n+denominator)/(2n*denominator); }
function qatarDate():string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function dateRange(from:string,to:string,maxDays=366):string[]{
  if(from>to)throw new ApiError('VALIDATION_FAILED','The period end must not precede the start.');
  const start=Date.parse(`${from}T00:00:00Z`),end=Date.parse(`${to}T00:00:00Z`),count=Math.floor((end-start)/86_400_000)+1;
  if(!Number.isFinite(start)||!Number.isFinite(end)||count<1||count>maxDays)throw new ApiError('VALIDATION_FAILED',`The selected period must contain at most ${maxDays} inclusive calendar days.`);
  return Array.from({length:count},(_,index)=>new Date(start+index*86_400_000).toISOString().slice(0,10));
}
function assertion(env:Env,workspaceId:string,sequence:number,sql:string,...values:unknown[]):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,?,CASE WHEN (${sql}) THEN 1 ELSE 0 END`).bind(workspaceId,sequence,...values);
}
async function requireEngagement(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const row=await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.code,e.period_start,e.period_end,e.contract_fee_minor,e.lifecycle_state,e.locked_at,
      e.active_proposal_version_id,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,e.approved_planning_version_id,e.standards_profile_id
    FROM engagements e WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId,engagementId)
    .first<{id:string;version:number;client_id:string;code:string;period_start:string;period_end:string;contract_fee_minor:number;lifecycle_state:string;locked_at:string|null;
      active_proposal_version_id:string|null;active_tb_version_id:string|null;active_mapping_version_id:string|null;active_materiality_version_id:string|null;approved_planning_version_id:string|null;standards_profile_id:string}>();
  if(!row)throw new ApiError('NOT_FOUND','The engagement was not found.');
  if(context.actor.persona==='CLIENT'&&context.actor.clientId!==row.client_id)throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside this client profile.');
  if(context.scope.clientId&&context.scope.clientId!==row.client_id)throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside the selected client scope.');
  if(context.scope.engagementId&&context.scope.engagementId!==row.id)throw new ApiError('FORBIDDEN_SCOPE','The engagement does not match the selected engagement scope.');
  return row;
}
async function requireWritableEngagement(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const row=await requireEngagement(env,workspaceId,context,engagementId);
  const deadline=await env.DB.prepare(`SELECT archive_due_at FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,engagementId).first<{archive_due_at:string|null}>();
  if(row.locked_at||row.lifecycle_state==='ARCHIVED_READ_ONLY'||deadline?.archive_due_at&&deadline.archive_due_at<=new Date().toISOString())
    throw new ApiError('WORKSPACE_FROZEN','Engagement time is read-only because the archive deadline has passed or the archive is locked.');
  return row;
}
async function partnerAccount(env:Env,workspaceId:string,controlType:string){
  const row=await env.DB.prepare(`SELECT id,account_type,normal_side,posting_allowed,active FROM firm_accounts WHERE workspace_id=? AND control_type=? AND active=1`).bind(workspaceId,controlType)
    .first<{id:string;account_type:string;normal_side:string;posting_allowed:number;active:number}>();
  if(!row||row.posting_allowed!==1)throw new ApiError('GATE_BLOCKED',`Configure an active posting account for ${controlType} before recording this transaction.`);
  return row;
}
async function openPeriod(env:Env,workspaceId:string,postingDate:string){
  const period=await env.DB.prepare(`SELECT id FROM accounting_periods WHERE workspace_id=? AND status='OPEN' AND start_date<=? AND end_date>=?`).bind(workspaceId,postingDate,postingDate).first<{id:string}>();
  if(!period)throw new ApiError('GATE_BLOCKED','No open firm accounting period covers this posting date.');
  return period.id;
}
async function createPostedJournal(env:Env,workspaceId:string,actorId:string,input:{date:string;description:string;sourceType:string;sourceId:string|null;sourceEventKey:string;reversalOfId?:string|null;lines:Array<{accountId:string;debit:bigint;credit:bigint;clientId?:string|null;engagementId?:string|null;memo?:string|null}>;now:string}){
  const existing=await env.DB.prepare(`SELECT id,number FROM firm_journals WHERE workspace_id=? AND source_event_key=? AND status='POSTED'`).bind(workspaceId,input.sourceEventKey).first<{id:string;number:string}>();
  if(existing)return {id:existing.id,number:existing.number,statements:[] as D1PreparedStatement[]};
  const periodId=await openPeriod(env,workspaceId,input.date);
  const debit=input.lines.reduce((sum,line)=>sum+line.debit,0n),credit=input.lines.reduce((sum,line)=>sum+line.credit,0n);
  if(input.lines.length<2||debit<=0n||debit!==credit)throw new ApiError('UNBALANCED_JOURNAL','A posted journal needs at least two nonzero lines with exactly equal debit and credit totals.');
  const journalId=crypto.randomUUID(),number=`FJ-${input.date.slice(0,4)}-${journalId.slice(0,8).toUpperCase()}`;
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO firm_journals(id,workspace_id,version,number,posting_date,period_id,description,source_type,source_id,source_event_key,reversal_of_id,status,posted_by_actor_id,posted_at,debit_total_minor,credit_total_minor,created_by_actor_id,created_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,'DRAFT',NULL,NULL,?,?,?,?)`).bind(journalId,workspaceId,number,input.date,periodId,input.description,input.sourceType,input.sourceId,input.sourceEventKey,input.reversalOfId??null,safeNumber(debit),safeNumber(credit),actorId,input.now)];
  for(const line of input.lines)statements.push(env.DB.prepare(`INSERT INTO firm_journal_lines(id,workspace_id,journal_id,account_id,debit_minor,credit_minor,client_id,engagement_id,memo)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,journalId,line.accountId,safeNumber(line.debit),safeNumber(line.credit),line.clientId??null,line.engagementId??null,line.memo??null));
  statements.push(env.DB.prepare(`UPDATE firm_journals SET status='POSTED',posted_by_actor_id=?,posted_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='DRAFT'`).bind(actorId,input.now,workspaceId,journalId));
  return {id:journalId,number,statements};
}

/** Creates the firm-side entry in the same transaction that issues an invoice PDF. */
export async function prepareBusinessInvoiceJournal(env:Env,workspaceId:string,invoice:{id:string;number:string;kind:string;clientId:string;engagementId:string;subtotalMinor:number;taxMinor:number;totalMinor:number;issueDate:string;actorId:string},now:string):Promise<D1PreparedStatement[]> {
  for(const value of [invoice.subtotalMinor,invoice.taxMinor,invoice.totalMinor])if(!Number.isSafeInteger(value)||value<0)throw new ApiError('VALIDATION_FAILED','The issued invoice amounts are invalid.');
  if(invoice.subtotalMinor+invoice.taxMinor!==invoice.totalMinor||invoice.totalMinor<=0)throw new ApiError('VALIDATION_FAILED','The issued invoice does not reconcile to its subtotal and tax.');
  const ar=await partnerAccount(env,workspaceId,'AR'),liability=await partnerAccount(env,workspaceId,'CONTRACT_LIABILITY');
  const vat=await env.DB.prepare(`SELECT id,account_type,posting_allowed,active FROM firm_accounts WHERE workspace_id=? AND code='2200'`).bind(workspaceId)
    .first<{id:string;account_type:string;posting_allowed:number;active:number}>();
  if(invoice.taxMinor>0&&(!vat||vat.account_type!=='LIABILITY'||vat.posting_allowed!==1||vat.active!==1))throw new ApiError('GATE_BLOCKED','Configure an active VAT liability account before issuing a taxable invoice.');
  const lines:Array<{accountId:string;debit:bigint;credit:bigint;clientId:string;engagementId:string;memo:string}>=[
    {accountId:ar.id,debit:BigInt(invoice.totalMinor),credit:0n,clientId:invoice.clientId,engagementId:invoice.engagementId,memo:`Invoice ${invoice.number}`}
  ];
  if(invoice.subtotalMinor>0)lines.push({accountId:liability.id,debit:0n,credit:BigInt(invoice.subtotalMinor),clientId:invoice.clientId,engagementId:invoice.engagementId,memo:`Deferred fee ${invoice.number}`});
  if(invoice.taxMinor>0&&vat)lines.push({accountId:vat.id,debit:0n,credit:BigInt(invoice.taxMinor),clientId:invoice.clientId,engagementId:invoice.engagementId,memo:`Tax ${invoice.number}`});
  const journal=await createPostedJournal(env,workspaceId,invoice.actorId,{date:invoice.issueDate,description:`Issued ${invoice.kind.toLowerCase()} invoice ${invoice.number}`,
    sourceType:'INVOICE_ISSUED',sourceId:invoice.id,sourceEventKey:`invoice:${invoice.id}`,lines,now});
  return journal.statements;
}

/**
 * Posts verified receipts against the firm AR control or unallocated receipt liability.
 * The callers append these statements to the existing payment command transaction.
 */
export async function prepareBusinessPaymentJournal(env:Env,workspaceId:string,context:BusinessContext,input:{paymentId:string;clientId:string;engagementId:string;method:string;amountMinor:number;allocations:Array<{invoiceId:string;amountMinor:number}>;postingDate:string;now:string;reversesPaymentId?:string;reason?:string}):Promise<D1PreparedStatement[]> {
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0)throw new ApiError('VALIDATION_FAILED','The verified receipt amount is invalid.');
  const total=BigInt(input.amountMinor),allocated=input.allocations.reduce((sum,item)=>sum+BigInt(item.amountMinor),0n);
  if(allocated>total)throw new ApiError('VALIDATION_FAILED','Receipt allocations exceed the verified payment amount.');
  let lines:Array<{accountId:string;debit:bigint;credit:bigint;clientId:string;engagementId:string;memo:string}>;
  let reversalOfId:string|null=null;
  if(input.reversesPaymentId){
    const original=await env.DB.prepare(`SELECT id FROM firm_journals WHERE workspace_id=? AND source_event_key=? AND status='POSTED'`).bind(workspaceId,`payment:${input.reversesPaymentId}`)
      .first<{id:string}>();
    if(!original)throw new ApiError('GATE_BLOCKED','The original verified payment has no posted firm ledger entry and cannot be reversed automatically.');
    const originalLines=(await env.DB.prepare(`SELECT account_id,client_id,engagement_id,debit_minor,credit_minor,memo FROM firm_journal_lines WHERE workspace_id=? AND journal_id=? ORDER BY id`)
      .bind(workspaceId,original.id).all<{account_id:string;client_id:string|null;engagement_id:string|null;debit_minor:number;credit_minor:number;memo:string|null}>()).results??[];
    lines=originalLines.map(line=>({accountId:line.account_id,debit:BigInt(line.credit_minor),credit:BigInt(line.debit_minor),clientId:line.client_id??input.clientId,
      engagementId:line.engagement_id??input.engagementId,memo:`Reversal of payment ${input.reversesPaymentId}${line.memo?`: ${line.memo}`:''}`}));
    reversalOfId=original.id;
  }else{
    const cash=await partnerAccount(env,workspaceId,input.method==='CASH'?'CASH':'BANK'),ar=await partnerAccount(env,workspaceId,'AR'),unallocated=await partnerAccount(env,workspaceId,'UNALLOCATED_RECEIPTS');
    lines=[{accountId:cash.id,debit:total,credit:0n,clientId:input.clientId,engagementId:input.engagementId,memo:`Verified payment ${input.paymentId}`}];
    for(const item of input.allocations){const amount=BigInt(item.amountMinor);if(amount<=0n||!Number.isSafeInteger(item.amountMinor))throw new ApiError('VALIDATION_FAILED','An allocation amount is invalid.');
      lines.push({accountId:ar.id,debit:0n,credit:amount,clientId:input.clientId,engagementId:input.engagementId,memo:`Invoice ${item.invoiceId}`});}
    const remainder=total-allocated;
    if(remainder>0n)lines.push({accountId:unallocated.id,debit:0n,credit:remainder,clientId:input.clientId,engagementId:input.engagementId,memo:`Unallocated payment ${input.paymentId}`});
  }
  const journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:input.postingDate,description:input.reversesPaymentId?`Payment reversal ${input.paymentId}: ${input.reason??''}`:`Verified client payment ${input.paymentId}`,
    sourceType:input.reversesPaymentId?'PAYMENT_REVERSAL':'PAYMENT',sourceId:input.paymentId,sourceEventKey:`payment:${input.paymentId}`,reversalOfId,lines,now:input.now});
  return journal.statements;
}

async function timeValue(env:Env,workspaceId:string,staffMemberId:string,workDate:string){
  const row=await env.DB.prepare(`SELECT r.id,r.hourly_minor FROM staff_members s JOIN firm_charge_out_rates r ON r.workspace_id=s.workspace_id AND r.grade=s.grade
    WHERE s.workspace_id=? AND s.id=? AND s.active=1 AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?)
    ORDER BY r.effective_from DESC,r.revision DESC LIMIT 1`).bind(workspaceId,staffMemberId,workDate,workDate)
    .first<{id:string;hourly_minor:number}>();
  if(!row)throw new ApiError('GATE_BLOCKED','No effective approved grade-based charge-out rate exists for this work date.');
  return row;
}
async function rateForGrade(env:Env,workspaceId:string,grade:string,workDate:string){
  const row=await env.DB.prepare(`SELECT id,hourly_minor FROM firm_charge_out_rates WHERE workspace_id=? AND grade=? AND effective_from<=?
    AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC,revision DESC LIMIT 1`).bind(workspaceId,grade,workDate,workDate)
    .first<{id:string;hourly_minor:number}>();
  if(!row)throw new ApiError('GATE_BLOCKED',`No approved ${grade} rate covers the selected budget date.`);
  return row;
}

async function buildRateSet(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'practice.rate.set'}>,now:string){
  partner(context);const p=command.payload;
  if(p.effectiveFrom<=now.slice(0,10))throw new ApiError('VALIDATION_FAILED','A new charge-out rate must be future-effective; historical work keeps its approved rate.');
  const prior=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision,MAX(effective_from) AS latest FROM firm_charge_out_rates WHERE workspace_id=? AND grade=?`)
    .bind(workspaceId,p.grade).first<{revision:number;latest:string|null}>();
  if(prior?.latest&&p.effectiveFrom<=prior.latest)throw new ApiError('VERSION_CONFLICT','Rate revisions must be effective after the latest approved rate for this grade.');
  const idValue=crypto.randomUUID(),revision=(prior?.revision??0)+1;
  const canonical={grade:p.grade,hourlyMinor:p.hourlyMinor,effectiveFrom:p.effectiveFrom};
  const digest=await sha256Hex(JSON.stringify(canonical));
  return mutation([env.DB.prepare(`INSERT INTO firm_charge_out_rates(id,workspace_id,grade,hourly_minor,effective_from,effective_to,revision,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,NULL,?,?,?,?)`).bind(idValue,workspaceId,p.grade,Number(p.hourlyMinor),p.effectiveFrom,revision,digest,context.actor.id,now)],
    {rateId:idValue,grade:p.grade,hourlyMinor:p.hourlyMinor,effectiveFrom:p.effectiveFrom,revision,contentSha256:digest},'CHARGE_OUT_RATE',idValue,null,revision,
    {rateId:idValue,grade:p.grade,hourlyMinor:p.hourlyMinor,effectiveFrom:p.effectiveFrom,contentSha256:digest});
}

async function timeAssignment(env:Env,workspaceId:string,staffMemberId:string,engagementId:string,workDate:string,phase:string){
  return env.DB.prepare(`SELECT a.id FROM engagement_assignments a
    WHERE a.workspace_id=? AND a.staff_member_id=? AND a.engagement_id=? AND a.phase=? AND a.start_date<=? AND a.end_date>=? LIMIT 1`)
    .bind(workspaceId,staffMemberId,engagementId,phase,workDate,workDate).first<{id:string}>();
}

async function buildTimeCreate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'time.create'}>,now:string){
  internal(context);const p=command.payload,engagement=await requireWritableEngagement(env,workspaceId,context,p.engagementId);
  if(engagement.locked_at||engagement.lifecycle_state==='ARCHIVED_READ_ONLY')throw new ApiError('WORKSPACE_FROZEN','No new audit time can be recorded after the engagement archive is locked.');
  const staff=await env.DB.prepare(`SELECT id,grade,active FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,p.staffMemberId)
    .first<{id:string;grade:string;active:number}>();
  if(!staff||staff.active!==1)throw new ApiError('NOT_FOUND','The active staff member was not found.');
  if(context.actor.persona==='PREPARER'&&context.actor.staffMemberId!==staff.id)throw new ApiError('FORBIDDEN_SCOPE','Preparers may record only their own time.');
  const assignment=await timeAssignment(env,workspaceId,staff.id,engagement.id,p.workDate,p.phase);
  if(!assignment)throw new ApiError('GATE_BLOCKED','The staff member needs a matching approved phase assignment for this engagement and work date.');
  if(p.fsliId){const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId,p.fsliId).first<{id:string}>();if(!fsli)throw new ApiError('NOT_FOUND','The selected FSLI is not active in this workspace.');}
  if(p.procedureId){const procedure=await env.DB.prepare(`SELECT p.id FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id
      WHERE p.workspace_id=? AND p.id=? AND w.engagement_id=?`).bind(workspaceId,p.procedureId,engagement.id).first<{id:string}>();if(!procedure)throw new ApiError('FORBIDDEN_SCOPE','The selected procedure is outside this engagement.');}
  if(p.startAt){const overlap=await env.DB.prepare(`SELECT id FROM firm_time_entries WHERE workspace_id=? AND staff_member_id=? AND work_date=? AND status IN ('DRAFT','SUBMITTED','APPROVED')
      AND start_at IS NOT NULL AND end_at IS NOT NULL AND start_at<? AND end_at>? LIMIT 1`).bind(workspaceId,staff.id,p.workDate,p.endAt,p.startAt)
      .first<{id:string}>();if(overlap)throw new ApiError('VALIDATION_FAILED','The time range overlaps an existing recorded entry.');}
  const idValue=crypto.randomUUID();
  return mutation([env.DB.prepare(`INSERT INTO firm_time_entries(id,workspace_id,version,client_id,engagement_id,staff_member_id,work_date,phase,fsli_id,procedure_id,minutes,start_at,end_at,description,billable,status,rate_id,hourly_minor_snapshot,charge_numerator,charge_denominator,submitted_by_actor_id,submitted_at,approved_by_actor_id,approved_at,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,staff.id,p.workDate,p.phase,p.fsliId??null,p.procedureId??null,p.minutes,p.startAt??null,p.endAt??null,p.description,p.billable?1:0,context.actor.id,now,now)],
    {timeEntryId:idValue,status:'DRAFT',minutes:p.minutes,billable:p.billable,grade:staff.grade},'TIME_ENTRY',idValue,null,1,{engagementId:engagement.id,staffMemberId:staff.id,workDate:p.workDate,phase:p.phase,minutes:p.minutes});
}

async function buildTimeSubmit(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'time.submit'}>,now:string){
  internal(context);const p=command.payload;
  const entry=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,staff_member_id,work_date,phase,minutes,start_at,end_at,status,created_by_actor_id
    FROM firm_time_entries WHERE workspace_id=? AND id=?`).bind(workspaceId,p.timeEntryId)
    .first<{id:string;version:number;client_id:string;engagement_id:string;staff_member_id:string;work_date:string;phase:string;minutes:number;start_at:string|null;end_at:string|null;status:string;created_by_actor_id:string}>();
  if(!entry)throw new ApiError('NOT_FOUND','The time entry was not found.');
  if(entry.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT','The time entry changed. Reload it before submitting.');
  if(!['DRAFT','RETURNED'].includes(entry.status))throw new ApiError('INVALID_TRANSITION','Only a draft or returned time entry can be submitted.');
  if(context.actor.persona==='PREPARER'&&entry.created_by_actor_id!==context.actor.id)throw new ApiError('FORBIDDEN_SCOPE','Preparers may submit only their own time entries.');
  const engagement=await requireWritableEngagement(env,workspaceId,context,entry.engagement_id);
  if(engagement.locked_at||engagement.lifecycle_state==='ARCHIVED_READ_ONLY')throw new ApiError('WORKSPACE_FROZEN','Audit time cannot be submitted after the engagement archive is locked.');
  const assignment=await timeAssignment(env,workspaceId,entry.staff_member_id,entry.engagement_id,entry.work_date,entry.phase);
  if(!assignment)throw new ApiError('GATE_BLOCKED','The approved assignment covering this work date and phase is no longer available.');
  const rate=await timeValue(env,workspaceId,entry.staff_member_id,entry.work_date);
  const prior=await env.DB.prepare(`SELECT COALESCE(SUM(t.minutes),0) AS minutes FROM firm_time_entries t
    WHERE t.workspace_id=? AND t.staff_member_id=? AND t.work_date=? AND t.id<>? AND t.status IN ('SUBMITTED','APPROVED')
      AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=t.workspace_id AND c.original_time_entry_id=t.id)`)
    .bind(workspaceId,entry.staff_member_id,entry.work_date,entry.id).first<{minutes:number}>();
  if(Number(prior?.minutes??0)+entry.minutes>1440)throw new ApiError('VALIDATION_FAILED','Submitted time cannot exceed 1,440 minutes per person and work date.');
  if(entry.start_at){const overlap=await env.DB.prepare(`SELECT id FROM firm_time_entries WHERE workspace_id=? AND staff_member_id=? AND work_date=? AND id<>?
      AND status IN ('SUBMITTED','APPROVED') AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=firm_time_entries.workspace_id AND c.original_time_entry_id=firm_time_entries.id)
      AND start_at IS NOT NULL AND end_at IS NOT NULL AND start_at<? AND end_at>? LIMIT 1`)
      .bind(workspaceId,entry.staff_member_id,entry.work_date,entry.id,entry.end_at,entry.start_at).first<{id:string}>();
    if(overlap)throw new ApiError('VALIDATION_FAILED','Submitted time overlaps another submitted or approved time range.');}
  const next=entry.version+1;
  return mutation([
    assertion(env,workspaceId,501,`EXISTS(SELECT 1 FROM firm_time_entries WHERE workspace_id=? AND id=? AND version=? AND status IN ('DRAFT','RETURNED'))
      AND COALESCE((SELECT SUM(t.minutes) FROM firm_time_entries t WHERE t.workspace_id=? AND t.staff_member_id=? AND t.work_date=? AND t.id<>? AND t.status IN ('SUBMITTED','APPROVED')
        AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=t.workspace_id AND c.original_time_entry_id=t.id)),0)+?<=1440`,
      workspaceId,entry.id,p.expectedVersion,workspaceId,entry.staff_member_id,entry.work_date,entry.id,entry.minutes),
    env.DB.prepare(`UPDATE firm_time_entries SET status='SUBMITTED',rate_id=?,hourly_minor_snapshot=?,charge_numerator=?,charge_denominator=60,
      submitted_by_actor_id=?,submitted_at=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status IN ('DRAFT','RETURNED')`)
      .bind(rate.id,rate.hourly_minor,String(BigInt(rate.hourly_minor)*BigInt(entry.minutes)),context.actor.id,now,now,workspaceId,entry.id,p.expectedVersion)
  ],{timeEntryId:entry.id,status:'SUBMITTED',rateId:rate.id,hourlyMinorSnapshot:String(rate.hourly_minor),minutes:entry.minutes,version:next},'TIME_ENTRY',entry.id,p.expectedVersion,next,
    {rateId:rate.id,hourlyMinorSnapshot:rate.hourly_minor,chargeOutNumerator:String(BigInt(rate.hourly_minor)*BigInt(entry.minutes)),chargeOutDenominator:60});
}

async function buildTimeDecision(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'time.approve'|'time.return'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const entry=await env.DB.prepare(`SELECT id,version,engagement_id,staff_member_id,status,submitted_by_actor_id,created_by_actor_id,minutes,work_date
    FROM firm_time_entries WHERE workspace_id=? AND id=?`).bind(workspaceId,p.timeEntryId)
    .first<{id:string;version:number;engagement_id:string;staff_member_id:string;status:string;submitted_by_actor_id:string|null;created_by_actor_id:string;minutes:number;work_date:string}>();
  if(!entry)throw new ApiError('NOT_FOUND','The time entry was not found.');
  if(entry.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT','The time entry changed. Reload it before deciding.');
  if(entry.status!=='SUBMITTED')throw new ApiError('INVALID_TRANSITION','Only submitted time can be approved or returned.');
  if(entry.submitted_by_actor_id===context.actor.id||entry.created_by_actor_id===context.actor.id)throw new ApiError('PERSONA_ACTION_DENIED','The time preparer cannot approve or return their own entry.');
  const engagement=await requireWritableEngagement(env,workspaceId,context,entry.engagement_id);
  if(engagement.locked_at||engagement.lifecycle_state==='ARCHIVED_READ_ONLY')throw new ApiError('WORKSPACE_FROZEN','Audit time review is closed after archive lock.');
  const isApproval=command.type==='time.approve',next=entry.version+1;
  const statements:D1PreparedStatement[]=[
    assertion(env,workspaceId,502,`EXISTS(SELECT 1 FROM firm_time_entries WHERE workspace_id=? AND id=? AND version=? AND status='SUBMITTED' AND submitted_by_actor_id<>?)`,workspaceId,entry.id,p.expectedVersion,context.actor.id),
    isApproval
      ? env.DB.prepare(`UPDATE firm_time_entries SET status='APPROVED',approved_by_actor_id=?,approved_at=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='SUBMITTED'`)
        .bind(context.actor.id,now,now,workspaceId,entry.id,p.expectedVersion)
      : env.DB.prepare(`UPDATE firm_time_entries SET status='RETURNED',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='SUBMITTED'`)
        .bind(now,workspaceId,entry.id,p.expectedVersion)
  ];
  return mutation(statements,{timeEntryId:entry.id,status:isApproval?'APPROVED':'RETURNED',...(isApproval?{approvedAt:now}:{reason:(p as Extract<typeof p,{reason:string}>).reason}),version:next},'TIME_ENTRY',entry.id,p.expectedVersion,next,
    {decision:isApproval?'APPROVE':'RETURN',reviewerActorId:context.actor.id,...(!isApproval?{reason:(p as Extract<typeof p,{reason:string}>).reason}:{})});
}

async function buildTimeCorrection(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'time.correct'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const original=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,staff_member_id,work_date,phase,fsli_id,procedure_id,minutes,start_at,end_at,description,billable,status,submitted_by_actor_id,approved_by_actor_id
    FROM firm_time_entries WHERE workspace_id=? AND id=?`).bind(workspaceId,p.timeEntryId)
    .first<{id:string;version:number;client_id:string;engagement_id:string;staff_member_id:string;work_date:string;phase:string;fsli_id:string|null;procedure_id:string|null;minutes:number;start_at:string|null;end_at:string|null;description:string;billable:number;status:string;submitted_by_actor_id:string|null;approved_by_actor_id:string|null}>();
  if(!original||original.status!=='APPROVED')throw new ApiError('INVALID_TRANSITION','Only approved time can be corrected.');
  if(original.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT','The approved time changed.');
  if(original.approved_by_actor_id===context.actor.id||original.submitted_by_actor_id===context.actor.id)throw new ApiError('PERSONA_ACTION_DENIED','A time correction requires approval by a different actor from the original preparer and approver.');
  const prior=await env.DB.prepare(`SELECT id FROM firm_time_corrections WHERE workspace_id=? AND original_time_entry_id=?`).bind(workspaceId,original.id).first<{id:string}>();
  if(prior)throw new ApiError('VERSION_CONFLICT','This time entry already has a correction. Correct its replacement if another change is needed.');
  const engagement=await requireWritableEngagement(env,workspaceId,context,original.engagement_id);
  if(engagement.locked_at||engagement.lifecycle_state==='ARCHIVED_READ_ONLY')throw new ApiError('WORKSPACE_FROZEN','Audit time corrections cannot change the sealed workpaper period.');
  const replacement=p.replacement??null;let replacementId:string|null=null;const statements:D1PreparedStatement[]=[];
  if(replacement){
    const workDate=replacement.workDate??original.work_date,phase=replacement.phase??original.phase,minutes=replacement.minutes??original.minutes;
    const description=replacement.description??original.description,billable=replacement.billable??Boolean(original.billable);
    const startAt=replacement.startAt===undefined?original.start_at:replacement.startAt,endAt=replacement.endAt===undefined?original.end_at:replacement.endAt;
    if(Boolean(startAt)!==Boolean(endAt)||(startAt&&Date.parse(endAt!)-Date.parse(startAt)!==minutes*60_000))throw new ApiError('VALIDATION_FAILED','Corrected timed duration must match its integer minutes.');
    if(!await timeAssignment(env,workspaceId,original.staff_member_id,original.engagement_id,workDate,phase))throw new ApiError('GATE_BLOCKED','The replacement work date and phase need an approved staff assignment.');
    const rate=await timeValue(env,workspaceId,original.staff_member_id,workDate);
    const daily=await env.DB.prepare(`SELECT COALESCE(SUM(t.minutes),0) AS minutes FROM firm_time_entries t WHERE t.workspace_id=? AND t.staff_member_id=? AND t.work_date=?
      AND t.id<>? AND t.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=t.workspace_id AND c.original_time_entry_id=t.id)`)
      .bind(workspaceId,original.staff_member_id,workDate,original.id).first<{minutes:number}>();
    if(Number(daily?.minutes??0)+minutes>1440)throw new ApiError('VALIDATION_FAILED','The corrected daily total would exceed 1,440 minutes.');
    replacementId=crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO firm_time_entries(id,workspace_id,version,client_id,engagement_id,staff_member_id,work_date,phase,fsli_id,procedure_id,minutes,start_at,end_at,description,billable,status,rate_id,hourly_minor_snapshot,charge_numerator,charge_denominator,submitted_by_actor_id,submitted_at,approved_by_actor_id,approved_at,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?, 'APPROVED',?,?,?,60,?,?,?,?,?,?,?)`).bind(replacementId,workspaceId,original.client_id,original.engagement_id,original.staff_member_id,workDate,phase,
      replacement.fsliId===undefined?original.fsli_id:replacement.fsliId,replacement.procedureId===undefined?original.procedure_id:replacement.procedureId,minutes,startAt,endAt,description,billable?1:0,
      rate.id,rate.hourly_minor,String(BigInt(rate.hourly_minor)*BigInt(minutes)),original.submitted_by_actor_id,now,context.actor.id,now,context.actor.id,now,now));
  }
  const correctionId=crypto.randomUUID();
  statements.push(env.DB.prepare(`INSERT INTO firm_time_corrections(id,workspace_id,original_time_entry_id,replacement_time_entry_id,reason,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,?)`).bind(correctionId,workspaceId,original.id,replacementId,p.reason,context.actor.id,now));
  return mutation(statements,{correctionId,timeEntryId:original.id,replacementTimeEntryId:replacementId,status:'CORRECTED'},'TIME_CORRECTION',correctionId,original.version,original.version+1,
    {originalTimeEntryId:original.id,replacementTimeEntryId:replacementId,reason:p.reason});
}

async function utilizationFor(env:Env,workspaceId:string,staffMemberId:string,from:string,to:string){
  const days=dateRange(from,to);
  const availability=await env.DB.prepare(`SELECT work_date,scheduled_minutes,approved_leave_minutes FROM staff_availability
    WHERE workspace_id=? AND staff_member_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date`).bind(workspaceId,staffMemberId,from,to).all<{work_date:string;scheduled_minutes:number;approved_leave_minutes:number}>();
  const byDate=new Map((availability.results??[]).map(row=>[row.work_date,row]));
  const missing=days.filter(day=>!byDate.has(day));
  let scheduled=0,leave=0;
  for(const row of availability.results??[]){scheduled+=Number(row.scheduled_minutes);leave+=Number(row.approved_leave_minutes);}
  const time=await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN billable=1 THEN minutes ELSE 0 END),0) AS billable,
      COALESCE(SUM(CASE WHEN billable=0 THEN minutes ELSE 0 END),0) AS nonbillable,
      COALESCE(SUM(minutes),0) AS total
    FROM firm_time_entries t WHERE t.workspace_id=? AND t.staff_member_id=? AND t.work_date BETWEEN ? AND ? AND t.status='APPROVED'
      AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=t.workspace_id AND c.original_time_entry_id=t.id)`)
    .bind(workspaceId,staffMemberId,from,to).first<{billable:number;nonbillable:number;total:number}>();
  const available=Math.max(0,scheduled-leave),billable=Number(time?.billable??0),nonbillable=Number(time?.nonbillable??0);
  const reason=missing.length?'MISSING_CAPACITY':available===0?'ZERO_AVAILABILITY':'CALCULATED';
  return {staffMemberId,from,to,scheduledMinutes:scheduled,leaveMinutes:leave,availableMinutes:available,
    recordedMinutes:Number(time?.total??0),approvedBillableMinutes:billable,approvedNonbillableMinutes:nonbillable,
    utilizationBps:reason==='CALCULATED'?Math.round(billable*10000/available):null,resultReason:reason,missingCapacityDates:missing};
}

async function buildCaptureUtilization(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'practice.capture-utilization-report'}>,now:string){
  internal(context);const p=command.payload;dateRange(p.from,p.to);
  const allStaff=(await env.DB.prepare(`SELECT id FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY id`).bind(workspaceId).all<{id:string}>()).results??[];
  const staffIds=p.staffMemberIds??(context.actor.persona==='PREPARER'&&context.actor.staffMemberId?[context.actor.staffMemberId]:allStaff.map(row=>row.id));
  if(context.actor.persona==='PREPARER'&&staffIds.some(staffId=>staffId!==context.actor.staffMemberId))throw new ApiError('FORBIDDEN_SCOPE','Preparers can capture utilization only for their own time.');
  if(new Set(staffIds).size!==staffIds.length)throw new ApiError('VALIDATION_FAILED','A staff member can appear only once in a utilization snapshot.');
  const rows=[] as Array<Awaited<ReturnType<typeof utilizationFor>>>;
  for(const staffId of staffIds)rows.push(await utilizationFor(env,workspaceId,staffId,p.from,p.to));
  if(rows.some(row=>row.resultReason==='MISSING_CAPACITY'))throw new ApiError('GATE_BLOCKED','A reproducible utilization snapshot requires capacity for every inclusive calendar date; use the live dashboard to inspect missing dates.',{staff:rows.filter(row=>row.resultReason==='MISSING_CAPACITY')});
  const snapshots:string[]=[],statements:D1PreparedStatement[]=[],sourceHashes:string[]=[];
  for(const row of rows){
    const sourceHash=await sha256Hex(JSON.stringify(row)),snapshotId=crypto.randomUUID();
    snapshots.push(snapshotId);sourceHashes.push(sourceHash);
    const numerator=row.availableMinutes===0?null:row.approvedBillableMinutes,denominator=row.availableMinutes===0?null:row.availableMinutes;
    statements.push(env.DB.prepare(`INSERT INTO utilization_snapshots(id,workspace_id,staff_member_id,period_start,period_end,scheduled_minutes,leave_minutes,available_minutes,approved_billable_minutes,approved_nonbillable_minutes,utilization_numerator,utilization_denominator,result_reason,missing_capacity_dates_json,source_hash,calculated_by_actor_id,calculated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(snapshotId,workspaceId,row.staffMemberId,p.from,p.to,row.scheduledMinutes,row.leaveMinutes,row.availableMinutes,row.approvedBillableMinutes,row.approvedNonbillableMinutes,numerator,denominator,row.resultReason,JSON.stringify(row.missingCapacityDates),sourceHash,context.actor.id,now));
  }
  return mutation(statements, {snapshotIds:snapshots,staffCount:rows.length,from:p.from,to:p.to},'UTILIZATION_REPORT',snapshots[0]??crypto.randomUUID(),null,1,
    {snapshotIds:snapshots,staffCount:rows.length,sourceHashes});
}

async function buildBudgetApprove(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'budget.approve'}>,now:string){
  partner(context);const p=command.payload,engagement=await requireEngagement(env,workspaceId,context,p.engagementId);
  const proposal=await env.DB.prepare(`SELECT pv.id,pv.revision,pv.fee_minor,pv.engagement_id FROM proposal_versions pv JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.id=pv.engagement_id
    JOIN engagement_letters el ON el.workspace_id=pv.workspace_id AND el.engagement_id=pv.engagement_id AND el.proposal_version_id=pv.id
    WHERE pv.workspace_id=? AND pv.id=? AND pv.engagement_id=? AND e.active_proposal_version_id=pv.id AND pv.fee_minor=e.contract_fee_minor`)
    .bind(workspaceId,p.feeProposalVersionId,engagement.id).first<{id:string;revision:number;fee_minor:number;engagement_id:string}>();
  if(!proposal)throw new ApiError('GATE_BLOCKED','A budget must pin the accepted proposal and issued engagement letter that set the current contract fee.');
  const existing=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM engagement_budgets WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{revision:number}>();
  const revision=(existing?.revision??0)+1,budgetId=crypto.randomUUID();
  const lines=[] as Array<{phase:string;grade:string;minutes:number;rateId:string;hourlyMinor:number}>;
  for(const item of p.phases){const rate=await rateForGrade(env,workspaceId,item.grade,now.slice(0,10));
    lines.push({phase:item.phase,grade:item.grade,minutes:item.plannedMinutes,rateId:rate.id,hourlyMinor:rate.hourly_minor});}
  const canonical={engagementId:engagement.id,proposalVersionId:proposal.id,revision,phases:lines,approvedBy:context.actor.id};
  const sourceHash=await sha256Hex(JSON.stringify(canonical));
  const statements:D1PreparedStatement[]=[assertion(env,workspaceId,503,`EXISTS(SELECT 1 FROM engagements e JOIN proposal_versions pv ON pv.workspace_id=e.workspace_id AND pv.id=e.active_proposal_version_id
      JOIN engagement_letters el ON el.workspace_id=e.workspace_id AND el.engagement_id=e.id AND el.proposal_version_id=pv.id
      WHERE e.workspace_id=? AND e.id=? AND e.active_proposal_version_id=? AND e.contract_fee_minor=pv.fee_minor)`,workspaceId,engagement.id,proposal.id),
    env.DB.prepare(`INSERT INTO engagement_budgets(id,workspace_id,client_id,engagement_id,revision,fee_proposal_version_id,source_hash,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(budgetId,workspaceId,engagement.client_id,engagement.id,revision,proposal.id,sourceHash,context.actor.id,now)];
  for(const line of lines)statements.push(env.DB.prepare(`INSERT INTO engagement_budget_phases(id,workspace_id,budget_id,phase,grade,planned_minutes,rate_id,hourly_minor_snapshot) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,budgetId,line.phase,line.grade,line.minutes,line.rateId,line.hourlyMinor));
  return mutation(statements,{budgetId,revision,feeMinor:String(engagement.contract_fee_minor),totalPlannedMinutes:lines.reduce((sum,line)=>sum+line.minutes,0),sourceHash},'ENGAGEMENT_BUDGET',budgetId,null,revision,
    {proposalVersionId:proposal.id,phaseCount:lines.length,sourceHash});
}

function allocateRounded(total:bigint,groups:Array<{key:string;numerator:bigint}>){
  const base=groups.map(group=>({key:group.key,value:group.numerator/60n,remainder:group.numerator%60n}));
  let remaining=total-base.reduce((sum,row)=>sum+row.value,0n);
  base.sort((a,b)=>a.remainder===b.remainder?a.key.localeCompare(b.key):a.remainder>b.remainder?-1:1);
  for(let index=0;remaining>0n&&index<base.length;index++,remaining--)base[index].value+=1n;
  return new Map(base.map(row=>[row.key,row.value]));
}

async function profitability(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,asOf:string){
  const engagement=await requireEngagement(env,workspaceId,context,engagementId);
  const budget=await env.DB.prepare(`SELECT id,revision,fee_proposal_version_id FROM engagement_budgets WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,engagementId)
    .first<{id:string;revision:number;fee_proposal_version_id:string}>();
  if(!budget)throw new ApiError('GATE_BLOCKED','Approve a phase budget against the accepted fee revision before viewing profitability.');
  const rows=await env.DB.prepare(`SELECT t.phase,s.grade,t.minutes,t.charge_numerator
    FROM firm_time_entries t JOIN staff_members s ON s.workspace_id=t.workspace_id AND s.id=t.staff_member_id
    WHERE t.workspace_id=? AND t.engagement_id=? AND t.status='APPROVED' AND t.approved_at<=?
      AND NOT EXISTS(SELECT 1 FROM firm_time_corrections c WHERE c.workspace_id=t.workspace_id AND c.original_time_entry_id=t.id)
    ORDER BY t.phase,s.grade,t.id`).bind(workspaceId,engagementId,asOf).all<{phase:string;grade:string;minutes:number;charge_numerator:string}>();
  let numerator=0n,approvedMinutes=0;
  const groupedRows=new Map<string,{phase:string;grade:string;minutes:number;numerator:bigint}>();
  for(const row of rows.results??[]){const key=`${row.phase}:${row.grade}`,current=groupedRows.get(key)??{phase:row.phase,grade:row.grade,minutes:0,numerator:0n};current.minutes+=Number(row.minutes);current.numerator+=BigInt(row.charge_numerator);groupedRows.set(key,current);}
  const groups=[...groupedRows.values()].sort((a,b)=>`${a.phase}:${a.grade}`.localeCompare(`${b.phase}:${b.grade}`));
  for(const row of groups){numerator+=row.numerator;approvedMinutes+=row.minutes;}
  const rounded=roundHalfUp(numerator,60n),grouped=allocateRounded(rounded,groups.map(row=>({key:`${row.phase}:${row.grade}`,numerator:row.numerator})));
  const budgetLines=await env.DB.prepare(`SELECT phase,grade,planned_minutes,hourly_minor_snapshot FROM engagement_budget_phases WHERE workspace_id=? AND budget_id=? ORDER BY phase,grade`).bind(workspaceId,budget.id)
    .all<{phase:string;grade:string;planned_minutes:number;hourly_minor_snapshot:number}>();
  const phasesOut=[];
  for(const phase of phaseValues){
    const planned=(budgetLines.results??[]).filter(line=>line.phase===phase).reduce((sum,line)=>sum+Number(line.planned_minutes),0);
    const actual=groups.filter(line=>line.phase===phase).reduce((sum,line)=>sum+line.minutes,0),delta=actual-planned;
    phasesOut.push({phase,plannedMinutes:planned,actualMinutes:actual,varianceMinutes:delta,
      varianceBps:planned>0?Math.round(delta*10000/planned):null,varianceStatus:planned===0&&actual>0?'UNBUDGETED':planned===0?'NO_ACTIVITY':delta>0?'OVERRUN':delta<0?'UNDER_BUDGET':'ON_BUDGET',
      chargeOutValueMinor:String(groups.filter(line=>line.phase===phase).reduce((sum,line)=>sum+(grouped.get(`${line.phase}:${line.grade}`)??0n),0n))});
  }
  const pending=await env.DB.prepare(`SELECT COALESCE(SUM(minutes),0) AS minutes FROM firm_time_entries WHERE workspace_id=? AND engagement_id=? AND status IN ('DRAFT','SUBMITTED','RETURNED')`)
    .bind(workspaceId,engagementId).first<{minutes:number}>();
  const payments=await env.DB.prepare(`SELECT COALESCE(SUM(p.amount_minor),0) AS collected FROM payments p WHERE p.workspace_id=? AND p.engagement_id=? AND p.received_on<=?`)
    .bind(workspaceId,engagementId,asOf.slice(0,10)).first<{collected:number}>();
  const invoices=await env.DB.prepare(`SELECT COALESCE(SUM(total_minor),0) AS billed FROM invoices WHERE workspace_id=? AND engagement_id=? AND status='ISSUED' AND issue_date<=?`)
    .bind(workspaceId,engagementId,asOf.slice(0,10)).first<{billed:number}>();
  const sourceHash=await sha256Hex(JSON.stringify({engagementId,asOf,budgetId:budget.id,feeMinor:engagement.contract_fee_minor,groups:groups.map(row=>[row.phase,row.grade,row.minutes,String(row.numerator)]),phasesOut}));
  return {engagementId,asOf,budgetId:budget.id,budgetRevision:budget.revision,feeProposalVersionId:budget.fee_proposal_version_id,feeMinor:String(engagement.contract_fee_minor),
    approvedMinutes,chargeOutNumerator:String(numerator),chargeOutDenominator:'60',chargeOutValueMinor:String(rounded),profitabilityMinor:String(BigInt(engagement.contract_fee_minor)-rounded),
    phases:phasesOut,pendingMinutes:Number(pending?.minutes??0),billedMinor:String(invoices?.billed??0),collectedMinor:String(payments?.collected??0),
    metricLabel:'Engagement margin against charge-out value',formula:'Accepted contract fee less approved hours multiplied by each pinned grade charge-out rate. This is a management metric, not accounting profit or payroll cost.',sourceHash};
}

async function buildCaptureProfitability(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'practice.capture-profitability-report'}>,now:string){
  partner(context);const p=command.payload,asOf=p.asOf??now;
  const result=await profitability(env,workspaceId,context,p.engagementId,asOf),idValue=crypto.randomUUID();
  return mutation([env.DB.prepare(`INSERT INTO profitability_snapshots(id,workspace_id,client_id,engagement_id,budget_id,as_of,fee_minor,approved_minutes,charge_out_numerator,charge_out_denominator,charge_out_value_minor,profitability_minor,phase_snapshot_json,source_hash,calculated_by_actor_id,calculated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,(await requireEngagement(env,workspaceId,context,p.engagementId)).client_id,p.engagementId,result.budgetId,asOf,
      Number(result.feeMinor),result.approvedMinutes,result.chargeOutNumerator,result.chargeOutDenominator,Number(result.chargeOutValueMinor),Number(result.profitabilityMinor),JSON.stringify(result.phases),result.sourceHash,context.actor.id,now)],
    {snapshotId:idValue,sourceHash:result.sourceHash,feeMinor:result.feeMinor,chargeOutValueMinor:result.chargeOutValueMinor,profitabilityMinor:result.profitabilityMinor},'PROFITABILITY_SNAPSHOT',idValue,null,1,
    {engagementId:p.engagementId,asOf,sourceHash:result.sourceHash});
}

async function accountById(env:Env,workspaceId:string,accountId:string){
  const row=await env.DB.prepare(`SELECT id,code,name,account_type,normal_side,posting_allowed,active,control_type FROM firm_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,accountId).first<{id:string;code:string;name:string;account_type:string;normal_side:string;posting_allowed:number;active:number;control_type:string}>();
  if(!row||row.active!==1||row.posting_allowed!==1)throw new ApiError('GATE_BLOCKED','Every journal line needs an active posting account in the firm chart.');
  return row;
}
async function buildAccountCreate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'ledger.account.create'}>,now:string){
  partner(context);const p=command.payload;
  if((p.accountType==='ASSET'&&p.normalSide!=='DEBIT')||(['LIABILITY','EQUITY','REVENUE'].includes(p.accountType)&&p.normalSide!=='CREDIT'))
    throw new ApiError('VALIDATION_FAILED','The normal side must match the selected account classification.');
  if(p.controlType!=='NONE'){
    const current=await env.DB.prepare(`SELECT id FROM firm_accounts WHERE workspace_id=? AND control_type=?`).bind(workspaceId,p.controlType).first<{id:string}>();
    if(current)throw new ApiError('VERSION_CONFLICT','That unique control account already exists. Reuse it instead of creating another.');
  }
  const idValue=crypto.randomUUID();
  return mutation([env.DB.prepare(`INSERT INTO firm_accounts(id,workspace_id,code,name,account_type,parent_account_id,normal_side,posting_allowed,active,control_type,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,NULL,?,?,1,?,?,?,?)`).bind(idValue,workspaceId,p.code,p.name,p.accountType,p.normalSide,p.postingAllowed?1:0,p.controlType,context.actor.id,now,now)],
    {accountId:idValue,code:p.code,name:p.name,accountType:p.accountType,controlType:p.controlType},'FIRM_ACCOUNT',idValue,null,1,{code:p.code,accountType:p.accountType,controlType:p.controlType});
}
async function buildPeriodOpen(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'accounting-period.open'}>,now:string){
  partner(context);const p=command.payload;
  const overlap=await env.DB.prepare(`SELECT id FROM accounting_periods WHERE workspace_id=? AND start_date<=? AND end_date>=? LIMIT 1`).bind(workspaceId,p.endDate,p.startDate).first<{id:string}>();
  if(overlap)throw new ApiError('VERSION_CONFLICT','The new accounting period overlaps an existing period.');
  const idValue=crypto.randomUUID();
  return mutation([assertion(env,workspaceId,504,`NOT EXISTS(SELECT 1 FROM accounting_periods WHERE workspace_id=? AND start_date<=? AND end_date>=?)`,workspaceId,p.endDate,p.startDate),
    env.DB.prepare(`INSERT INTO accounting_periods(id,workspace_id,start_date,end_date,status,created_by_actor_id,created_at) VALUES(?,?,?,?,'OPEN',?,?)`)
      .bind(idValue,workspaceId,p.startDate,p.endDate,context.actor.id,now)],
    {periodId:idValue,startDate:p.startDate,endDate:p.endDate,status:'OPEN'},'ACCOUNTING_PERIOD',idValue,null,1,{startDate:p.startDate,endDate:p.endDate});
}
async function buildPeriodClose(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'accounting-period.close'}>,now:string){
  partner(context);const p=command.payload;
  const period=await env.DB.prepare(`SELECT id,start_date,end_date,status FROM accounting_periods WHERE workspace_id=? AND id=?`).bind(workspaceId,p.periodId)
    .first<{id:string;start_date:string;end_date:string;status:string}>();
  if(!period)throw new ApiError('NOT_FOUND','The accounting period was not found.');
  if(period.status!=='OPEN')throw new ApiError('INVALID_TRANSITION','Only an open period can be closed.');
  const draft=await env.DB.prepare(`SELECT id FROM firm_journals WHERE workspace_id=? AND period_id=? AND status='DRAFT' LIMIT 1`).bind(workspaceId,period.id).first<{id:string}>();
  if(draft)throw new ApiError('GATE_BLOCKED','Resolve or post all draft journals before closing this period.');
  return mutation([assertion(env,workspaceId,505,`EXISTS(SELECT 1 FROM accounting_periods WHERE workspace_id=? AND id=? AND status='OPEN')
      AND NOT EXISTS(SELECT 1 FROM firm_journals WHERE workspace_id=? AND period_id=? AND status='DRAFT')`,workspaceId,period.id,workspaceId,period.id),
    env.DB.prepare(`UPDATE accounting_periods SET status='CLOSED',closed_by_actor_id=?,closed_at=? WHERE workspace_id=? AND id=? AND status='OPEN'`)
      .bind(context.actor.id,now,workspaceId,period.id)],
    {periodId:period.id,status:'CLOSED',closedAt:now},'ACCOUNTING_PERIOD',period.id,1,2,{startDate:period.start_date,endDate:period.end_date});
}

async function buildJournalCreate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'ledger.create-draft'}>,commandId:string,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const debit=p.lines.reduce((sum,line)=>sum+BigInt(line.debitMinor),0n),credit=p.lines.reduce((sum,line)=>sum+BigInt(line.creditMinor),0n);
  if(debit<=0n||debit!==credit)throw new ApiError('UNBALANCED_JOURNAL','The journal draft must have exactly equal positive debit and credit totals.');
  const periodId=await openPeriod(env,workspaceId,p.postingDate);
  if(p.supportingFileId){const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED' AND immutable=1`)
    .bind(workspaceId,p.supportingFileId).first<{id:string}>();if(!file)throw new ApiError('GATE_BLOCKED','The journal support file must be committed and immutable.');}
  for(const line of p.lines){await accountById(env,workspaceId,line.accountId);if(line.engagementId){const engagement=await requireEngagement(env,workspaceId,context,line.engagementId);
      if(line.clientId&&line.clientId!==engagement.client_id)throw new ApiError('FORBIDDEN_SCOPE','A journal line client must match its engagement.');}}
  const idValue=crypto.randomUUID(),number=`FJ-${p.postingDate.slice(0,4)}-${idValue.slice(0,8).toUpperCase()}`;
  const statements:D1PreparedStatement[]=[assertion(env,workspaceId,506,`EXISTS(SELECT 1 FROM accounting_periods WHERE workspace_id=? AND id=? AND status='OPEN' AND start_date<=? AND end_date>=?)
      AND (SELECT COUNT(*) FROM firm_accounts WHERE workspace_id=? AND id IN (${p.lines.map(()=>'?').join(',')}) AND active=1 AND posting_allowed=1)=?`,
      workspaceId,periodId,p.postingDate,p.postingDate,workspaceId,...p.lines.map(line=>line.accountId),p.lines.length),
    env.DB.prepare(`INSERT INTO firm_journals(id,workspace_id,version,number,posting_date,period_id,description,source_type,source_id,source_event_key,reversal_of_id,status,posted_by_actor_id,posted_at,debit_total_minor,credit_total_minor,created_by_actor_id,created_at)
      VALUES(?,?,1,?,?,?,?,?,?,? ,NULL,'DRAFT',NULL,NULL,?,?,?,?)`).bind(idValue,workspaceId,number,p.postingDate,periodId,p.description,p.sourceType,p.sourceId??null,
      `manual-draft:${idValue}`,safeNumber(debit),safeNumber(credit),context.actor.id,now)];
  for(const line of p.lines)statements.push(env.DB.prepare(`INSERT INTO firm_journal_lines(id,workspace_id,journal_id,account_id,debit_minor,credit_minor,client_id,engagement_id,memo) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,idValue,line.accountId,Number(line.debitMinor),Number(line.creditMinor),line.clientId??null,line.engagementId??null,line.memo??null));
  return mutation(statements,{journalId:idValue,number,status:'DRAFT',debitTotalMinor:String(debit),creditTotalMinor:String(credit),supportingFileId:p.supportingFileId??null},'FIRM_JOURNAL',idValue,null,1,
    {number,sourceType:p.sourceType,sourceId:p.sourceId??null,lineCount:p.lines.length,supportingFileId:p.supportingFileId??null});
}
async function buildJournalPost(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'ledger.post'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const journal=await env.DB.prepare(`SELECT id,version,number,posting_date,period_id,created_by_actor_id,status FROM firm_journals WHERE workspace_id=? AND id=?`).bind(workspaceId,p.journalId)
    .first<{id:string;version:number;number:string;posting_date:string;period_id:string;created_by_actor_id:string;status:string}>();
  if(!journal)throw new ApiError('NOT_FOUND','The journal draft was not found.');
  if(journal.version!==p.expectedVersion)throw new ApiError('VERSION_CONFLICT','The journal draft changed. Reload it before posting.');
  if(journal.status!=='DRAFT')throw new ApiError('INVALID_TRANSITION','Only a draft journal can be posted.');
  if(journal.created_by_actor_id===context.actor.id)throw new ApiError('PERSONA_ACTION_DENIED','A journal creator cannot post their own journal.');
  const period=await openPeriod(env,workspaceId,journal.posting_date);if(period!==journal.period_id)throw new ApiError('GATE_BLOCKED','The journal no longer points to the open period for its posting date.');
  const lines=await env.DB.prepare(`SELECT l.account_id,l.debit_minor,l.credit_minor,a.active,a.posting_allowed FROM firm_journal_lines l
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id WHERE l.workspace_id=? AND l.journal_id=?`).bind(workspaceId,journal.id)
    .all<{account_id:string;debit_minor:number;credit_minor:number;active:number;posting_allowed:number}>();
  if((lines.results?.length??0)<2||(lines.results??[]).some(line=>line.active!==1||line.posting_allowed!==1))throw new ApiError('GATE_BLOCKED','A journal needs at least two lines with active posting accounts.');
  const debit=(lines.results??[]).reduce((sum,line)=>sum+BigInt(line.debit_minor),0n),credit=(lines.results??[]).reduce((sum,line)=>sum+BigInt(line.credit_minor),0n);
  if(debit<=0n||debit!==credit)throw new ApiError('UNBALANCED_JOURNAL','The journal lines do not balance exactly; nothing was posted.');
  return mutation([assertion(env,workspaceId,507,`EXISTS(SELECT 1 FROM firm_journals j JOIN accounting_periods p ON p.workspace_id=j.workspace_id AND p.id=j.period_id
      WHERE j.workspace_id=? AND j.id=? AND j.version=? AND j.status='DRAFT' AND p.status='OPEN' AND p.start_date<=j.posting_date AND p.end_date>=j.posting_date)
      AND (SELECT COUNT(*) FROM firm_journal_lines l JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
        WHERE l.workspace_id=? AND l.journal_id=? AND a.active=1 AND a.posting_allowed=1)>=2`,workspaceId,journal.id,p.expectedVersion,workspaceId,journal.id),
    env.DB.prepare(`UPDATE firm_journals SET status='POSTED',posted_by_actor_id=?,posted_at=?,version=version+1 WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`)
      .bind(context.actor.id,now,workspaceId,journal.id,p.expectedVersion)],
    {journalId:journal.id,number:journal.number,status:'POSTED',debitTotalMinor:String(debit),creditTotalMinor:String(credit),postedAt:now},'FIRM_JOURNAL',journal.id,p.expectedVersion,p.expectedVersion+1,
    {postedByActorId:context.actor.id,debitTotalMinor:String(debit),creditTotalMinor:String(credit)});
}
async function buildJournalReverse(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'ledger.reverse'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const original=await env.DB.prepare(`SELECT id,number,posting_date,description,source_type,source_id,posted_by_actor_id,status FROM firm_journals WHERE workspace_id=? AND id=?`).bind(workspaceId,p.journalId)
    .first<{id:string;number:string;posting_date:string;description:string;source_type:string;source_id:string|null;posted_by_actor_id:string|null;status:string}>();
  if(!original||original.status!=='POSTED')throw new ApiError('NOT_FOUND','A posted source journal is required for reversal.');
  if(original.posted_by_actor_id===context.actor.id)throw new ApiError('PERSONA_ACTION_DENIED','The original poster cannot approve the reversing journal.');
  const existing=await env.DB.prepare(`SELECT id,number FROM firm_journals WHERE workspace_id=? AND reversal_of_id=?`).bind(workspaceId,original.id).first<{id:string;number:string}>();
  if(existing)throw new ApiError('VERSION_CONFLICT','This journal already has a reversing entry.');
  const lines=await env.DB.prepare(`SELECT account_id,debit_minor,credit_minor,client_id,engagement_id,memo FROM firm_journal_lines WHERE workspace_id=? AND journal_id=? ORDER BY id`)
    .bind(workspaceId,original.id).all<{account_id:string;debit_minor:number;credit_minor:number;client_id:string|null;engagement_id:string|null;memo:string|null}>();
  const reverse=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.postingDate,description:`Reversal of ${original.number}: ${p.reason}`,sourceType:'REVERSAL',sourceId:original.id,
    sourceEventKey:`reverse:${original.id}`,reversalOfId:original.id,now,lines:(lines.results??[]).map(line=>({accountId:line.account_id,debit:BigInt(line.credit_minor),credit:BigInt(line.debit_minor),clientId:line.client_id,engagementId:line.engagement_id,memo:line.memo}))});
  return mutation([assertion(env,workspaceId,508,`EXISTS(SELECT 1 FROM firm_journals WHERE workspace_id=? AND id=? AND status='POSTED' AND posted_by_actor_id<>?)
      AND NOT EXISTS(SELECT 1 FROM firm_journals WHERE workspace_id=? AND reversal_of_id=?)`,workspaceId,original.id,context.actor.id,workspaceId,original.id),...reverse.statements],
    {reversalJournalId:reverse.id,number:reverse.number,originalJournalId:original.id,status:'POSTED'},'FIRM_JOURNAL',reverse.id,null,1,{reversalOfId:original.id,reason:p.reason,postedAt:now});
}

async function buildExpenseCreate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'expense.create'}>,now:string){
  internal(context);const p=command.payload;
  const debitAccount=await accountById(env,workspaceId,p.debitAccountId),settlement=await accountById(env,workspaceId,p.settlementAccountId);
  if(debitAccount.account_type!=='EXPENSE'&&!(p.category==='PETTY_CASH'&&debitAccount.control_type==='CASH'))throw new ApiError('VALIDATION_FAILED','Choose the approved expense account for this category.');
  const control=p.paymentMethod==='BANK'?'BANK':p.paymentMethod==='CASH'?'CASH':'AP';
  if(settlement.control_type!==control)throw new ApiError('VALIDATION_FAILED',`The settlement account must be the configured ${control} control account.`);
  if(p.supportingFileId){const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED' AND immutable=1`)
    .bind(workspaceId,p.supportingFileId).first<{id:string}>();if(!file)throw new ApiError('GATE_BLOCKED','The expense voucher must be a committed immutable file.');}
  let engagement:{id:string;client_id:string}|null=null;
  if(p.engagementId)engagement=await requireEngagement(env,workspaceId,context,p.engagementId);
  const idValue=crypto.randomUUID();
  return mutation([env.DB.prepare(`INSERT INTO firm_expenses(id,workspace_id,version,expense_date,payee,category,amount_minor,description,supporting_file_id,missing_support_reason,debit_account_id,settlement_account_id,payment_method,client_id,engagement_id,status,approved_by_actor_id,approved_at,journal_id,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',NULL,NULL,NULL,?,?,?)`).bind(idValue,workspaceId,p.date,p.payee,p.category,Number(p.amountMinor),p.description,p.supportingFileId??null,p.missingSupportReason??null,
      p.debitAccountId,p.settlementAccountId,p.paymentMethod,engagement?.client_id??null,engagement?.id??null,context.actor.id,now,now)],
    {expenseId:idValue,status:'DRAFT',amountMinor:p.amountMinor,category:p.category},'FIRM_EXPENSE',idValue,null,1,{date:p.date,payee:p.payee,category:p.category,amountMinor:p.amountMinor,supportingFileId:p.supportingFileId??null,missingSupportReason:p.missingSupportReason??null});
}
async function buildExpensePost(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'expense.approve-and-post'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const expense=await env.DB.prepare(`SELECT id,version,expense_date,payee,category,amount_minor,description,debit_account_id,settlement_account_id,payment_method,client_id,engagement_id,status,created_by_actor_id,supporting_file_id,missing_support_reason
    FROM firm_expenses WHERE workspace_id=? AND id=?`).bind(workspaceId,p.expenseId)
    .first<{id:string;version:number;expense_date:string;payee:string;category:string;amount_minor:number;description:string;debit_account_id:string;settlement_account_id:string;payment_method:string;client_id:string|null;engagement_id:string|null;status:string;created_by_actor_id:string;supporting_file_id:string|null;missing_support_reason:string|null}>();
  if(!expense)throw new ApiError('NOT_FOUND','The expense record was not found.');
  if(expense.status!=='DRAFT')throw new ApiError('INVALID_TRANSITION','Only a draft expense can be approved and posted.');
  if(expense.created_by_actor_id===context.actor.id)throw new ApiError('PERSONA_ACTION_DENIED','The expense preparer cannot approve their own expense.');
  const debit=await accountById(env,workspaceId,expense.debit_account_id),credit=await accountById(env,workspaceId,expense.settlement_account_id);
  if(expense.supporting_file_id){const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED' AND immutable=1`)
    .bind(workspaceId,expense.supporting_file_id).first<{id:string}>();if(!file)throw new ApiError('GATE_BLOCKED','The supporting expense voucher is unavailable.');}
  const amountMinor=BigInt(expense.amount_minor),linked={clientId:expense.client_id,engagementId:expense.engagement_id};
  const journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:expense.expense_date,description:`${expense.category}: ${expense.payee} — ${expense.description}`,
    sourceType:'EXPENSE',sourceId:expense.id,sourceEventKey:`expense:${expense.id}`,now,lines:[{accountId:debit.id,debit:amountMinor,credit:0n,...linked,memo:expense.category},
      {accountId:credit.id,debit:0n,credit:amountMinor,...linked,memo:expense.payment_method}]});
  return mutation([assertion(env,workspaceId,509,`EXISTS(SELECT 1 FROM firm_expenses WHERE workspace_id=? AND id=? AND status='DRAFT' AND created_by_actor_id<>?)`,workspaceId,expense.id,context.actor.id),
      ...journal.statements,
      env.DB.prepare(`UPDATE firm_expenses SET status='POSTED',approved_by_actor_id=?,approved_at=?,journal_id=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='DRAFT'`)
        .bind(context.actor.id,now,journal.id,now,workspaceId,expense.id)],
    {expenseId:expense.id,journalId:journal.id,status:'POSTED',amountMinor:String(amountMinor)},'FIRM_EXPENSE',expense.id,expense.version,expense.version+1,
    {journalId:journal.id,approvedByActorId:context.actor.id,sourceFileId:expense.supporting_file_id,missingSupportReason:expense.missing_support_reason});
}
async function buildWithdrawal(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'partner-withdrawal.post'}>,now:string){
  partner(context);const p=command.payload;
  const staff=await env.DB.prepare(`SELECT id,grade,active FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,p.partnerStaffId).first<{id:string;grade:string;active:number}>();
  if(!staff||staff.grade!=='PARTNER'||staff.active!==1)throw new ApiError('VALIDATION_FAILED','A withdrawal must name an active Partner.');
  if(context.actor.staffMemberId===staff.id)throw new ApiError('PERSONA_ACTION_DENIED','A Partner cannot approve their own withdrawal.');
  const equity=await accountById(env,workspaceId,p.equityAccountId),bank=await accountById(env,workspaceId,p.bankAccountId);
  if(equity.control_type!=='PARTNER_DRAWINGS'||equity.account_type!=='EQUITY'||bank.control_type!=='BANK')throw new ApiError('VALIDATION_FAILED','Use the approved Partner Drawings equity account and Bank control account.');
  const idValue=crypto.randomUUID(),value=BigInt(p.amountMinor),journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.date,description:`Partner withdrawal: ${p.reason}`,
    sourceType:'PARTNER_WITHDRAWAL',sourceId:idValue,sourceEventKey:`withdrawal:${idValue}`,now,lines:[{accountId:equity.id,debit:value,credit:0n,memo:staff.id},{accountId:bank.id,debit:0n,credit:value,memo:staff.id}]});
  return mutation([...journal.statements,env.DB.prepare(`INSERT INTO partner_withdrawals(id,workspace_id,partner_staff_id,withdrawal_date,amount_minor,equity_account_id,bank_account_id,reason,journal_id,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,staff.id,p.date,Number(value),equity.id,bank.id,p.reason,journal.id,context.actor.id,now)],
    {withdrawalId:idValue,journalId:journal.id,amountMinor:String(value),classification:'EQUITY_WITHDRAWAL'},'PARTNER_WITHDRAWAL',idValue,null,1,{partnerStaffId:staff.id,journalId:journal.id,reason:p.reason});
}
async function accountBalance(env:Env,workspaceId:string,accountId:string,asOf:string,engagementId?:string){
  const row=await env.DB.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance FROM firm_journal_lines l
    JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    WHERE l.workspace_id=? AND l.account_id=? AND j.posting_date<=?${engagementId?' AND l.engagement_id=?':''}`)
    .bind(workspaceId,accountId,asOf,...(engagementId?[engagementId]:[])).first<{balance:number}>();
  return BigInt(row?.balance??0);
}
async function buildPettyCashReconcile(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'petty-cash.reconcile'}>,now:string){
  reviewerOrPartner(context);const p=command.payload,account=await accountById(env,workspaceId,p.accountId);
  if(account.control_type!=='CASH')throw new ApiError('VALIDATION_FAILED','Reconcile a configured cash or petty-cash control account.');
  const custodian=await env.DB.prepare(`SELECT id,active FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,p.custodianStaffId).first<{id:string;active:number}>();
  if(!custodian||custodian.active!==1)throw new ApiError('NOT_FOUND','The active cash custodian was not found.');
  if(context.actor.staffMemberId===custodian.id)throw new ApiError('PERSONA_ACTION_DENIED','The cash custodian cannot independently review their own count.');
  const balance=await accountBalance(env,workspaceId,account.id,p.asOf),counted=BigInt(p.countedCashMinor),difference=counted-balance,idValue=crypto.randomUUID();
  return mutation([env.DB.prepare(`INSERT INTO petty_cash_reconciliations(id,workspace_id,account_id,as_of,ledger_balance_minor,counted_cash_minor,difference_minor,explanation,custodian_staff_id,reviewed_by_actor_id,reviewed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,account.id,p.asOf,safeNumber(balance),Number(counted),safeNumber(difference),p.explanation,custodian.id,context.actor.id,now)],
    {reconciliationId:idValue,ledgerBalanceMinor:String(balance),countedCashMinor:String(counted),differenceMinor:String(difference),status:difference===0n?'RECONCILED':'VARIANCE'},'PETTY_CASH_RECONCILIATION',idValue,null,1,
    {accountId:account.id,asOf:p.asOf,custodianStaffId:custodian.id,differenceMinor:String(difference),explanation:p.explanation});
}

async function buildRevenuePolicy(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'revenue-policy.save'}>,now:string){
  partner(context);const p=command.payload;
  const prior=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision,MAX(effective_from) AS latest FROM firm_revenue_policies WHERE workspace_id=?`).bind(workspaceId)
    .first<{revision:number;latest:string|null}>();
  if(prior?.latest&&p.effectiveFrom<=prior.latest)throw new ApiError('VERSION_CONFLICT','Revenue policy revisions must be effective after the current approved policy.');
  const idValue=crypto.randomUUID(),revision=(prior?.revision??0)+1,canonical={...p,revision},digest=await sha256Hex(JSON.stringify(canonical));
  return mutation([env.DB.prepare(`INSERT INTO firm_revenue_policies(id,workspace_id,revision,name,effective_from,recognition_method,recognition_rules,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,revision,p.name,p.effectiveFrom,p.recognitionMethod,p.recognitionRules,digest,context.actor.id,now)],
    {policyId:idValue,revision,contentSha256:digest,effectiveFrom:p.effectiveFrom,recognitionMethod:p.recognitionMethod},'FIRM_REVENUE_POLICY',idValue,null,revision,
    {policyId:idValue,revision,contentSha256:digest,recognitionMethod:p.recognitionMethod});
}
async function buildRevenueRecognize(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'revenue.recognize'}>,now:string){
  partner(context);const p=command.payload,engagement=await requireEngagement(env,workspaceId,context,p.engagementId);
  const policy=await env.DB.prepare(`SELECT id,recognition_method,effective_from FROM firm_revenue_policies WHERE workspace_id=? AND id=?`).bind(workspaceId,p.policyId)
    .first<{id:string;recognition_method:string;effective_from:string}>();
  if(!policy||policy.effective_from>p.date)throw new ApiError('GATE_BLOCKED','Use an approved revenue policy effective on the recognition date.');
  if(policy.recognition_method==='APPROVED_MILESTONE'&&!p.supportingFileId)throw new ApiError('GATE_BLOCKED','Milestone recognition requires committed supporting evidence.');
  if(p.supportingFileId){const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED' AND immutable=1`)
    .bind(workspaceId,p.supportingFileId).first<{id:string}>();if(!file)throw new ApiError('GATE_BLOCKED','Revenue recognition evidence must be a committed immutable file.');}
  const amountMinor=BigInt(p.amountMinor),prior=await env.DB.prepare(`SELECT COALESCE(SUM(amount_minor),0) AS total FROM revenue_recognitions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,engagement.id).first<{total:number}>();
  const already=BigInt(prior?.total??0),eligible=BigInt(engagement.contract_fee_minor);
  if(already+amountMinor>eligible)throw new ApiError('VALIDATION_FAILED','Cumulative recognized professional fees cannot exceed the accepted engagement fee.');
  const liability=await partnerAccount(env,workspaceId,'CONTRACT_LIABILITY'),revenue=await env.DB.prepare(`SELECT id FROM firm_accounts WHERE workspace_id=? AND code='4000' AND active=1 AND posting_allowed=1`)
    .bind(workspaceId).first<{id:string}>();
  if(!revenue)throw new ApiError('GATE_BLOCKED','Configure an active Professional Fees revenue account.');
  const liabilityBalance=-(await accountBalance(env,workspaceId,liability.id,p.date,engagement.id));
  if(policy.recognition_method==='DEFER_UNTIL_EARNED'&&liabilityBalance<amountMinor)throw new ApiError('GATE_BLOCKED','Deferred recognition cannot exceed the engagement’s posted contract-liability balance.');
  const idValue=crypto.randomUUID(),sourceKey=`revenue:${engagement.id}:${p.date}:${p.amountMinor}:${await sha256Hex(p.basis)}`;
  const journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.date,description:`Earned audit fees: ${p.basis}`,sourceType:'REVENUE_RECOGNITION',sourceId:idValue,sourceEventKey:sourceKey,now,
    lines:[{accountId:liability.id,debit:amountMinor,credit:0n,clientId:engagement.client_id,engagementId:engagement.id,memo:'Earned service transfer'},
      {accountId:revenue.id,debit:0n,credit:amountMinor,clientId:engagement.client_id,engagementId:engagement.id,memo:'Recognized professional fees'}]});
  return mutation([...journal.statements,env.DB.prepare(`INSERT INTO revenue_recognitions(id,workspace_id,client_id,engagement_id,policy_id,recognition_date,amount_minor,basis,supporting_file_id,journal_id,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,policy.id,p.date,Number(amountMinor),p.basis,p.supportingFileId??null,journal.id,context.actor.id,now)],
    {recognitionId:idValue,journalId:journal.id,amountMinor:String(amountMinor),policyId:policy.id},'REVENUE_RECOGNITION',idValue,null,1,{engagementId:engagement.id,policyId:policy.id,journalId:journal.id,basis:p.basis});
}

type AgingInvoice={id:string;client_id:string;engagement_id:string;kind:string;number:string;fee_revision_id:string;subtotal_minor:number;tax_minor:number;total_minor:number;issue_date:string;due_date:string;}
async function arAging(env:Env,workspaceId:string,context:BusinessContext,asOf:string,clientId?:string){
  if(context.actor.persona==='CLIENT')throw new ApiError('PERSONA_ACTION_DENIED','Client profiles cannot access firm receivables reporting.');
  if(context.scope.clientId&&clientId&&context.scope.clientId!==clientId)throw new ApiError('FORBIDDEN_SCOPE','AR aging is outside the selected client.');
  const scopedClient=clientId??context.scope.clientId;
  const invoices=(await env.DB.prepare(`SELECT id,client_id,engagement_id,kind,number,fee_revision_id,subtotal_minor,tax_minor,total_minor,issue_date,due_date
    FROM invoices WHERE workspace_id=? AND status='ISSUED' AND issue_date<=?${scopedClient?' AND client_id=?':''} ORDER BY client_id,due_date,id`)
    .bind(workspaceId,asOf,...(scopedClient?[scopedClient]:[])).all<AgingInvoice>()).results??[];
  const invoiceIds=invoices.map(row=>row.id),invoiceSlots=invoiceIds.map(()=>'?').join(',');
  const allocRows=invoiceIds.length?((await env.DB.prepare(`SELECT pa.id AS allocation_id,pa.invoice_id,pa.amount_minor,pa.allocated_on,p.received_on,p.reverses_payment_id
    FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
    WHERE pa.workspace_id=? AND pa.invoice_id IN (${invoiceSlots}) AND pa.allocated_on<=? AND p.received_on<=?`)
      .bind(workspaceId,...invoiceIds,asOf,asOf).all<{allocation_id:string;invoice_id:string;amount_minor:number;allocated_on:string;received_on:string;reverses_payment_id:string|null}>()).results??[]) : [];
  const reversals=allocRows.length?((await env.DB.prepare(`SELECT r.allocation_id,SUM(r.amount_minor) AS amount FROM payment_allocation_reversals r
    WHERE r.workspace_id=? AND r.effective_date<=? AND r.allocation_id IN (${allocRows.map(()=>'?').join(',')}) GROUP BY r.allocation_id`)
      .bind(workspaceId,asOf,...allocRows.map(row=>row.allocation_id)).all<{allocation_id:string;amount:number}>()).results??[]) : [];
  const reversedById=new Map(reversals.map(row=>[row.allocation_id,BigInt(row.amount)]));
  const allocated=new Map<string,bigint>();
  for(let index=0;index<allocRows.length;index++){
    const row=allocRows[index],isPaymentReversal=Boolean(row.reverses_payment_id),amount=BigInt(row.amount_minor),
      reversed=isPaymentReversal?0n:(reversedById.get(row.allocation_id)??0n);
    if(reversed>amount)throw new ApiError('VALIDATION_FAILED','An allocation reversal exceeds its effective allocation.');
    const net=(amount-reversed)*(isPaymentReversal?-1n:1n);
    allocated.set(row.invoice_id,(allocated.get(row.invoice_id)??0n)+net);
  }
  const credits=invoices.length?((await env.DB.prepare(`SELECT invoice_id,SUM(amount_minor) AS amount FROM firm_credit_notes WHERE workspace_id=? AND credit_date<=? AND invoice_id IN (${invoiceSlots}) GROUP BY invoice_id`)
    .bind(workspaceId,asOf,...invoiceIds).all<{invoice_id:string;amount:number}>()).results??[]) : [];
  const credited=new Map(credits.map(row=>[row.invoice_id,BigInt(row.amount)]));
  const items=invoices.map(invoice=>{
    const paid=allocated.get(invoice.id)??0n,credit=credited.get(invoice.id)??0n,total=BigInt(invoice.total_minor),outstanding=total-paid-credit;
    if(outstanding<0n)throw new ApiError('VALIDATION_FAILED',`Invoice ${invoice.number} has credits or allocations greater than its issued amount.`);
    const dueDays=Math.floor((Date.parse(`${asOf}T00:00:00Z`)-Date.parse(`${invoice.due_date}T00:00:00Z`))/86_400_000);
    const bucket=dueDays<=0?'CURRENT':dueDays<=30?'DAYS_1_30':dueDays<=60?'DAYS_31_60':dueDays<=90?'DAYS_61_90':'DAYS_91_PLUS';
    return {invoiceId:invoice.id,clientId:invoice.client_id,engagementId:invoice.engagement_id,kind:invoice.kind,number:invoice.number,feeRevisionId:invoice.fee_revision_id,
      issueDate:invoice.issue_date,dueDate:invoice.due_date,paidMinor:String(paid),creditedMinor:String(credit),outstandingMinor:String(outstanding),bucket};
  });
  let paymentsQuery=`SELECT p.id,p.client_id,p.amount_minor,p.received_on,p.reverses_payment_id FROM payments p WHERE p.workspace_id=? AND p.received_on<=?`;
  const paymentBindings:unknown[]=[workspaceId,asOf];
  if(scopedClient){paymentsQuery+=' AND p.client_id=?';paymentBindings.push(scopedClient);}
  const payments=(await env.DB.prepare(paymentsQuery).bind(...paymentBindings).all<{id:string;client_id:string;amount_minor:number;received_on:string;reverses_payment_id:string|null}>()).results??[];
  const receiptAllocations=(await env.DB.prepare(`SELECT pa.payment_id,pa.amount_minor,p.reverses_payment_id,COALESCE(r.amount,0) AS reversed_minor FROM payment_allocations pa
    JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
    LEFT JOIN (SELECT allocation_id,SUM(amount_minor) AS amount FROM payment_allocation_reversals WHERE workspace_id=? AND effective_date<=? GROUP BY allocation_id) r ON r.allocation_id=pa.id
    WHERE pa.workspace_id=? AND pa.allocated_on<=? AND p.received_on<=?${scopedClient?' AND pa.client_id=?':''}`)
    .bind(workspaceId,asOf,workspaceId,asOf,asOf,...(scopedClient?[scopedClient]:[])).all<{payment_id:string;amount_minor:number;reverses_payment_id:string|null;reversed_minor:number}>()).results??[];
  const allPaymentAllocations=new Map<string,bigint>();
  for(const row of receiptAllocations){const net=(BigInt(row.amount_minor)-BigInt(row.reversed_minor))*(row.reverses_payment_id?-1n:1n);
    allPaymentAllocations.set(row.payment_id,(allPaymentAllocations.get(row.payment_id)??0n)+net);}
  const unallocated=payments.reduce((sum,payment)=>sum+BigInt(payment.amount_minor)*(payment.reverses_payment_id?-1n:1n)-(allPaymentAllocations.get(payment.id)??0n),0n);
  const buckets={CURRENT:0n,DAYS_1_30:0n,DAYS_31_60:0n,DAYS_61_90:0n,DAYS_91_PLUS:0n};
  for(const item of items){const value=BigInt(item.outstandingMinor);buckets[item.bucket as keyof typeof buckets]+=value;}
  const ar=await partnerAccount(env,workspaceId,'AR');
  const control=await env.DB.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance FROM firm_journal_lines l JOIN firm_journals j
    ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED' WHERE l.workspace_id=? AND l.account_id=? AND j.posting_date<=?${scopedClient?' AND l.client_id=?':''}`)
    .bind(workspaceId,ar.id,asOf,...(scopedClient?[scopedClient]:[])).first<{balance:number}>();
  const controlMinor=BigInt(control?.balance??0),total=Object.values(buckets).reduce((sum,value)=>sum+value,0n),difference=controlMinor-total;
  const sourceHash=await sha256Hex(JSON.stringify({asOf,scopedClient,items,buckets:Object.fromEntries(Object.entries(buckets).map(([key,value])=>[key,String(value)])),unallocated:String(unallocated),control:String(controlMinor)}));
  return {asOf,clientId:scopedClient??null,invoices:items,buckets:Object.fromEntries(Object.entries(buckets).map(([key,value])=>[key,String(value)])),
    outstandingTotalMinor:String(total),unallocatedMinor:String(unallocated),controlAccountMinor:String(controlMinor),reconciliationDifferenceMinor:String(difference),sourceHash,
    reconciliationStatus:difference===0n?'RECONCILED':'INTEGRATION_EXCEPTION'};
}

async function buildPaymentAllocate(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'payment.allocate'}>,now:string){
  internal(context);const p=command.payload;
  const payment=await env.DB.prepare(`SELECT id,client_id,engagement_id,amount_minor,received_on,reverses_payment_id FROM payments WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,p.paymentId).first<{id:string;client_id:string;engagement_id:string;amount_minor:number;received_on:string;reverses_payment_id:string|null}>();
  if(!payment||payment.reverses_payment_id)throw new ApiError('NOT_FOUND','Only a verified original receipt can be allocated.');
  const fullReversal=await env.DB.prepare(`SELECT id FROM payments WHERE workspace_id=? AND reverses_payment_id=?`).bind(workspaceId,payment.id).first<{id:string}>();
  if(fullReversal)throw new ApiError('INVALID_TRANSITION','A fully reversed receipt cannot be allocated.');
  if(p.effectiveDate<payment.received_on)throw new ApiError('VALIDATION_FAILED','An allocation cannot predate its verified receipt.');
  const invoiceRows=await env.DB.prepare(`SELECT id,client_id,engagement_id,total_minor,issue_date,status FROM invoices WHERE workspace_id=? AND id IN (${p.allocations.map(()=>'?').join(',')})`)
    .bind(workspaceId,...p.allocations.map(row=>row.invoiceId)).all<{id:string;client_id:string;engagement_id:string;total_minor:number;issue_date:string;status:string}>();
  const invoices=new Map((invoiceRows.results??[]).map(row=>[row.id,row]));
  if(invoices.size!==p.allocations.length)throw new ApiError('NOT_FOUND','One or more invoices were not found.');
  const allocationSum=p.allocations.reduce((sum,row)=>sum+BigInt(row.amountMinor),0n);
  const previous=await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN p.reverses_payment_id IS NULL THEN pa.amount_minor ELSE -pa.amount_minor END),0) AS allocated
      FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
      WHERE pa.workspace_id=? AND (p.id=? OR p.reverses_payment_id=?)`).bind(workspaceId,payment.id,payment.id).first<{allocated:number}>();
  const returned=await env.DB.prepare(`SELECT COALESCE(SUM(r.amount_minor),0) AS amount FROM payment_allocation_reversals r JOIN payment_allocations pa
      ON pa.workspace_id=r.workspace_id AND pa.id=r.allocation_id WHERE r.workspace_id=? AND pa.payment_id=?`).bind(workspaceId,payment.id).first<{amount:number}>();
  if(BigInt(previous?.allocated??0)-BigInt(returned?.amount??0)+allocationSum>BigInt(payment.amount_minor))throw new ApiError('VALIDATION_FAILED','Allocations cannot exceed the remaining verified unapplied receipt.');
  const ar=await partnerAccount(env,workspaceId,'AR'),unallocated=await partnerAccount(env,workspaceId,'UNALLOCATED_RECEIPTS');
  const lines=[] as Array<{invoiceId:string;amount:bigint;clientId:string;engagementId:string}>;
  for(const item of p.allocations){const invoice=invoices.get(item.invoiceId)!;
    if(invoice.client_id!==payment.client_id||invoice.engagement_id!==payment.engagement_id||invoice.status!=='ISSUED'||invoice.issue_date>p.effectiveDate)
      throw new ApiError('GATE_BLOCKED','Each allocation must target an issued invoice for the same client and engagement by the effective allocation date.');
    const balance=await arAging(env,workspaceId,context,p.effectiveDate,payment.client_id);
    const projected=balance.invoices.find(row=>row.invoiceId===invoice.id);
    if(!projected||BigInt(projected.outstandingMinor)<BigInt(item.amountMinor))throw new ApiError('VALIDATION_FAILED','The allocation exceeds the invoice’s effective balance after payments and credits.');
    lines.push({invoiceId:item.invoiceId,amount:BigInt(item.amountMinor),clientId:invoice.client_id,engagementId:invoice.engagement_id});
  }
  const journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.effectiveDate,description:`Apply verified receipt ${payment.id} to invoices`,sourceType:'PAYMENT_ALLOCATION',sourceId:payment.id,
    sourceEventKey:`allocation:${payment.id}:${p.effectiveDate}:${await sha256Hex(JSON.stringify(lines.map(row=>[row.invoiceId,String(row.amount)])))}`,now,
    lines:lines.flatMap(line=>[{accountId:unallocated.id,debit:line.amount,credit:0n,clientId:line.clientId,engagementId:line.engagementId,memo:`Receipt ${payment.id}`},
      {accountId:ar.id,debit:0n,credit:line.amount,clientId:line.clientId,engagementId:line.engagementId,memo:`Invoice ${line.invoiceId}`}])});
  const ids=lines.map(()=>crypto.randomUUID());
  const statements:D1PreparedStatement[]=[...journal.statements];
  for(let index=0;index<lines.length;index++){const line=lines[index];statements.push(env.DB.prepare(`INSERT INTO payment_allocations(id,workspace_id,version,client_id,engagement_id,payment_id,invoice_id,amount_minor,allocated_on) VALUES(?,?,1,?,?,?,?,?,?)`)
    .bind(ids[index],workspaceId,line.clientId,line.engagementId,payment.id,line.invoiceId,safeNumber(line.amount),p.effectiveDate));}
  return mutation(statements,{allocationIds:ids,journalId:journal.id,remainingUnallocatedMinor:String(BigInt(payment.amount_minor)-BigInt(previous?.allocated??0)-allocationSum)},'PAYMENT_ALLOCATION',payment.id,null,1,
    {paymentId:payment.id,allocationIds:ids,amountMinor:String(allocationSum),effectiveDate:p.effectiveDate,journalId:journal.id});
}

async function buildReverseAllocation(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'payment.reverse-allocation'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const allocation=await env.DB.prepare(`SELECT pa.id,pa.client_id,pa.engagement_id,pa.payment_id,pa.invoice_id,pa.amount_minor,pa.allocated_on,p.reverses_payment_id
    FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id WHERE pa.workspace_id=? AND pa.id=?`)
    .bind(workspaceId,p.allocationId).first<{id:string;client_id:string;engagement_id:string;payment_id:string;invoice_id:string;amount_minor:number;allocated_on:string;reverses_payment_id:string|null}>();
  if(!allocation||allocation.reverses_payment_id)throw new ApiError('NOT_FOUND','A normal verified payment allocation is required.');
  if(p.effectiveDate<allocation.allocated_on)throw new ApiError('VALIDATION_FAILED','An allocation reversal cannot predate its allocation.');
  const prior=await env.DB.prepare(`SELECT COALESCE(SUM(amount_minor),0) AS total FROM payment_allocation_reversals WHERE workspace_id=? AND allocation_id=?`).bind(workspaceId,allocation.id)
    .first<{total:number}>();
  const value=BigInt(p.amountMinor);if(value+BigInt(prior?.total??0)>BigInt(allocation.amount_minor))throw new ApiError('VALIDATION_FAILED','The reversal exceeds the remaining allocation amount.');
  const ar=await partnerAccount(env,workspaceId,'AR'),unallocated=await partnerAccount(env,workspaceId,'UNALLOCATED_RECEIPTS');
  const idValue=crypto.randomUUID(),journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.effectiveDate,description:`Reverse invoice allocation: ${p.reason}`,
    sourceType:'ALLOCATION_REVERSAL',sourceId:allocation.id,sourceEventKey:`allocation-reversal:${allocation.id}:${p.effectiveDate}:${idValue}`,now,
    lines:[{accountId:ar.id,debit:value,credit:0n,clientId:allocation.client_id,engagementId:allocation.engagement_id,memo:`Invoice ${allocation.invoice_id}`},
      {accountId:unallocated.id,debit:0n,credit:value,clientId:allocation.client_id,engagementId:allocation.engagement_id,memo:`Receipt ${allocation.payment_id}`} ]});
  return mutation([...journal.statements,env.DB.prepare(`INSERT INTO payment_allocation_reversals(id,workspace_id,allocation_id,effective_date,amount_minor,reason,journal_id,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,allocation.id,p.effectiveDate,Number(value),p.reason,journal.id,context.actor.id,now)],
    {reversalId:idValue,journalId:journal.id,amountMinor:String(value)},'PAYMENT_ALLOCATION_REVERSAL',idValue,null,1,{allocationId:allocation.id,amountMinor:String(value),reason:p.reason});
}

async function buildCreditNote(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'credit-note.issue'}>,now:string){
  reviewerOrPartner(context);const p=command.payload;
  const invoice=await env.DB.prepare(`SELECT id,client_id,engagement_id,kind,number,subtotal_minor,tax_minor,total_minor,issue_date,due_date,status FROM invoices WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,p.invoiceId).first<{id:string;client_id:string;engagement_id:string;kind:string;number:string;subtotal_minor:number;tax_minor:number;total_minor:number;issue_date:string|null;due_date:string;status:string}>();
  if(!invoice||invoice.status!=='ISSUED'||!invoice.issue_date)throw new ApiError('NOT_FOUND','A currently issued invoice is required for a credit note.');
  if(p.date<invoice.issue_date)throw new ApiError('VALIDATION_FAILED','A credit note cannot predate the invoice.');
  const aging=await arAging(env,workspaceId,context,p.date,invoice.client_id),balance=aging.invoices.find(row=>row.invoiceId===invoice.id);
  const value=BigInt(p.amountMinor);if(!balance||value>BigInt(balance.outstandingMinor))throw new ApiError('VALIDATION_FAILED','Credit notes cannot exceed the outstanding invoice balance.');
  const idValue=crypto.randomUUID(),number=`AS-CN-${idValue.slice(0,8).toUpperCase()}`;
  const total=BigInt(invoice.total_minor),tax=BigInt(invoice.tax_minor),taxCredit=total===0n?0n:roundHalfUp(value*tax,total),subtotalCredit=value-taxCredit;
  const liability=await partnerAccount(env,workspaceId,'CONTRACT_LIABILITY'),revenue=await env.DB.prepare(`SELECT id FROM firm_accounts WHERE workspace_id=? AND code='4000' AND active=1 AND posting_allowed=1`)
    .bind(workspaceId).first<{id:string}>(),vat=await env.DB.prepare(`SELECT id FROM firm_accounts WHERE workspace_id=? AND code='2200' AND active=1 AND posting_allowed=1`)
    .bind(workspaceId).first<{id:string}>(),ar=await partnerAccount(env,workspaceId,'AR');
  if(!revenue||!vat)throw new ApiError('GATE_BLOCKED','Configure Professional Fees and VAT Payable accounts before issuing a credit note.');
  const liabilityBalance=-(await accountBalance(env,workspaceId,liability.id,p.date,invoice.engagement_id)),defer=liabilityBalance>0n? (liabilityBalance<subtotalCredit?liabilityBalance:subtotalCredit):0n;
  const lines:Array<{accountId:string;debit:bigint;credit:bigint;clientId:string;engagementId:string;memo:string}> = [];
  if(defer>0n)lines.push({accountId:liability.id,debit:defer,credit:0n,clientId:invoice.client_id,engagementId:invoice.engagement_id,memo:'Reverse unearned fee'});
  if(subtotalCredit>defer)lines.push({accountId:revenue.id,debit:subtotalCredit-defer,credit:0n,clientId:invoice.client_id,engagementId:invoice.engagement_id,memo:'Reduce professional fees'});
  if(taxCredit>0n)lines.push({accountId:vat.id,debit:taxCredit,credit:0n,clientId:invoice.client_id,engagementId:invoice.engagement_id,memo:'Reverse invoice tax'});
  lines.push({accountId:ar.id,debit:0n,credit:value,clientId:invoice.client_id,engagementId:invoice.engagement_id,memo:`Credit ${invoice.number}`});
  const journal=await createPostedJournal(env,workspaceId,context.actor.id,{date:p.date,description:`Credit note ${number}: ${p.reason}`,sourceType:'CREDIT_NOTE',sourceId:idValue,sourceEventKey:`credit-note:${invoice.id}:${number}`,now,lines});
  return mutation([...journal.statements,env.DB.prepare(`INSERT INTO firm_credit_notes(id,workspace_id,client_id,engagement_id,invoice_id,number,credit_date,amount_minor,reason,journal_id,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,invoice.client_id,invoice.engagement_id,invoice.id,number,p.date,Number(value),p.reason,journal.id,context.actor.id,now)],
    {creditNoteId:idValue,number,journalId:journal.id,amountMinor:String(value),status:'ISSUED'},'CREDIT_NOTE',idValue,null,1,{invoiceId:invoice.id,number,amountMinor:String(value),reason:p.reason});
}

async function buildCaptureAr(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'practice.capture-ar-aging-report'}>,now:string){
  reviewerOrPartner(context);const p=command.payload,result=await arAging(env,workspaceId,context,p.asOf,p.clientId),idValue=crypto.randomUUID();
  const b=result.buckets as Record<string,string>;
  const statements=[env.DB.prepare(`INSERT INTO ar_aging_snapshots(id,workspace_id,as_of,client_id,rows_snapshot_json,current_minor,days_1_30_minor,days_31_60_minor,days_61_90_minor,days_91_plus_minor,outstanding_total_minor,unallocated_minor,control_account_minor,reconciliation_difference_minor,source_hash,generated_by_actor_id,generated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,p.asOf,result.clientId,JSON.stringify(result.invoices),Number(b.CURRENT),Number(b.DAYS_1_30),Number(b.DAYS_31_60),Number(b.DAYS_61_90),Number(b.DAYS_91_PLUS),
      Number(result.outstandingTotalMinor),Number(result.unallocatedMinor),Number(result.controlAccountMinor),Number(result.reconciliationDifferenceMinor),result.sourceHash,context.actor.id,now)];
  return mutation(statements,{snapshotId:idValue,asOf:p.asOf,sourceHash:result.sourceHash,outstandingTotalMinor:result.outstandingTotalMinor,
      unallocatedMinor:result.unallocatedMinor,reconciliationDifferenceMinor:result.reconciliationDifferenceMinor},'AR_AGING_SNAPSHOT',idValue,null,1,
    {asOf:p.asOf,clientId:result.clientId,sourceHash:result.sourceHash,reconciliationStatus:result.reconciliationStatus});
}

async function firmTrialBalance(env:Env,workspaceId:string,from:string,to:string){
  const accounts=(await env.DB.prepare(`SELECT id,code,name,account_type,normal_side,control_type FROM firm_accounts WHERE workspace_id=? ORDER BY code,id`)
    .bind(workspaceId).all<{id:string;code:string;name:string;account_type:string;normal_side:string;control_type:string}>()).results??[];
  const movements=(await env.DB.prepare(`SELECT l.account_id,j.posting_date,l.debit_minor,l.credit_minor FROM firm_journal_lines l
    JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    WHERE l.workspace_id=? AND j.posting_date<=? ORDER BY j.posting_date,j.id,l.id`).bind(workspaceId,to)
    .all<{account_id:string;posting_date:string;debit_minor:number;credit_minor:number}>()).results??[];
  const totals=new Map<string,{opening:bigint;debit:bigint;credit:bigint}>();
  for(const account of accounts)totals.set(account.id,{opening:0n,debit:0n,credit:0n});
  let periodDebit=0n,periodCredit=0n;
  for(const line of movements){const target=totals.get(line.account_id);if(!target)continue;
    const debit=BigInt(line.debit_minor),credit=BigInt(line.credit_minor);
    if(line.posting_date<from)target.opening+=debit-credit;
    else {target.debit+=debit;target.credit+=credit;periodDebit+=debit;periodCredit+=credit;}
  }
  const rows=accounts.map(account=>{const totalsFor=totals.get(account.id)!;return {accountId:account.id,code:account.code,name:account.name,accountType:account.account_type,
    normalSide:account.normal_side,controlType:account.control_type,openingMinor:String(totalsFor.opening),periodDebitMinor:String(totalsFor.debit),periodCreditMinor:String(totalsFor.credit),
    closingMinor:String(totalsFor.opening+totalsFor.debit-totalsFor.credit)};});
  const sourceHash=await sha256Hex(JSON.stringify({from,to,rows}));
  const closingDebit=rows.reduce((sum,row)=>sum+(BigInt(row.closingMinor)>0n?BigInt(row.closingMinor):0n),0n);
  const closingCredit=rows.reduce((sum,row)=>sum+(BigInt(row.closingMinor)<0n?-BigInt(row.closingMinor):0n),0n);
  return {from,to,rows,debitTotalMinor:String(periodDebit),creditTotalMinor:String(periodCredit),balanced:periodDebit===periodCredit,
    closingDebitMinor:String(closingDebit),closingCreditMinor:String(closingCredit),closingBalanced:closingDebit===closingCredit,sourceHash};
}
async function firmProfitLoss(env:Env,workspaceId:string,from:string,to:string){
  const rows=(await env.DB.prepare(`SELECT a.id,a.code,a.name,a.account_type,l.debit_minor,l.credit_minor FROM firm_journal_lines l
    JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id WHERE l.workspace_id=? AND j.posting_date BETWEEN ? AND ?
      AND a.account_type IN ('REVENUE','EXPENSE') ORDER BY a.code,j.posting_date,j.id,l.id`).bind(workspaceId,from,to)
    .all<{id:string;code:string;name:string;account_type:string;debit_minor:number;credit_minor:number}>()).results??[];
  const accounts=new Map<string,{code:string;name:string;accountType:string;amount:bigint}>();
  for(const row of rows){const prior=accounts.get(row.id)??{code:row.code,name:row.name,accountType:row.account_type,amount:0n};
    prior.amount+=row.account_type==='REVENUE'?BigInt(row.credit_minor)-BigInt(row.debit_minor):BigInt(row.debit_minor)-BigInt(row.credit_minor);accounts.set(row.id,prior);}
  const result=[...accounts.entries()].map(([id,row])=>({accountId:id,code:row.code,name:row.name,accountType:row.accountType,amountMinor:String(row.amount)}));
  const revenue=[...accounts.values()].filter(row=>row.accountType==='REVENUE').reduce((sum,row)=>sum+row.amount,0n);
  const expense=[...accounts.values()].filter(row=>row.accountType==='EXPENSE').reduce((sum,row)=>sum+row.amount,0n);
  const sourceHash=await sha256Hex(JSON.stringify({from,to,accounts:result}));
  return {from,to,accounts:result,revenueMinor:String(revenue),expenseMinor:String(expense),profitMinor:String(revenue-expense),sourceHash,
    recognitionNote:'Revenue reflects only posted journal entries. Invoices remain deferred contract liabilities under the baseline policy until a Partner records an earned-service event.'};
}

async function buildPracticeReportExport(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessPracticeCommand,{type:'practice.export-report'}>,now:string){
  if(context.actor.persona!=='APPROVER')throw new ApiError('PERSONA_ACTION_DENIED','Only an APPROVER can create firm financial report exports.');
  const p=command.payload;
  if(Date.parse(`${p.periodEnd}T00:00:00Z`)-Date.parse(`${p.periodStart}T00:00:00Z`)>366*86_400_000)
    throw new ApiError('VALIDATION_FAILED','A firm report export may cover at most 367 calendar dates.');
  let snapshot:Record<string,unknown>;
  let sourceHash:string;
  if(p.kind==='TRIAL_BALANCE'){
    const report=await firmTrialBalance(env,workspaceId,p.periodStart,p.periodEnd);
    sourceHash=report.sourceHash;
    snapshot={kind:p.kind,periodStart:p.periodStart,periodEnd:p.periodEnd,asOf:now,rows:report.rows,revenueMinor:null,expenseMinor:null,
      debitTotalMinor:report.debitTotalMinor,creditTotalMinor:report.creditTotalMinor,profitMinor:null,balanced:report.balanced,
      closingDebitMinor:report.closingDebitMinor,closingCreditMinor:report.closingCreditMinor,closingBalanced:report.closingBalanced,sourceHash};
  }else{
    const report=await firmProfitLoss(env,workspaceId,p.periodStart,p.periodEnd);
    sourceHash=report.sourceHash;
    snapshot={kind:p.kind,periodStart:p.periodStart,periodEnd:p.periodEnd,asOf:now,rows:report.accounts,revenueMinor:report.revenueMinor,
      expenseMinor:report.expenseMinor,debitTotalMinor:null,creditTotalMinor:null,profitMinor:report.profitMinor,balanced:null,
      closingDebitMinor:null,closingCreditMinor:null,closingBalanced:null,sourceHash};
  }
  const snapshotId=crypto.randomUUID(),jobId=crypto.randomUUID(),payload={documentType:'PRACTICE_REPORT',reportSnapshotId:snapshotId,kind:p.kind,
    periodStart:p.periodStart,periodEnd:p.periodEnd,format:p.format,asOf:now,sourceHash,rowsJson:JSON.stringify(snapshot),generatedByActorId:context.actor.id};
  const statements=[env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,
      last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
    VALUES(?,?,1,'GENERATE_DOCUMENT',?,1,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId,workspaceId,snapshotId,JSON.stringify(payload),`practice-report:${snapshotId}`,now,now,now)];
  return mutation(statements,{jobId,reportSnapshotId:snapshotId,kind:p.kind,format:p.format,status:'QUEUED',sourceHash},
    'FIRM_REPORT_EXPORT',snapshotId,null,1,{jobId,kind:p.kind,format:p.format,periodStart:p.periodStart,periodEnd:p.periodEnd,sourceHash});
}

export async function getBusinessPracticeWorkspace(env:Env,workspaceId:string,context:BusinessContext,params:URLSearchParams):Promise<Record<string,unknown>>{
  internal(context);
  const today=qatarDate(),from=params.get('from')??`${today.slice(0,4)}-01-01`,to=params.get('to')??today;
  dateRange(from,to,366);
  const engagementId=params.get('engagementId')??context.scope.engagementId??undefined;
  if(engagementId)await requireEngagement(env,workspaceId,context,engagementId);
  const timeQuery=`SELECT t.id,t.version,t.client_id,t.engagement_id,t.staff_member_id,s.display_name,s.grade,t.work_date,t.phase,t.fsli_id,t.procedure_id,t.minutes,t.description,
      t.billable,t.status,t.rate_id,t.hourly_minor_snapshot,t.charge_numerator,t.submitted_at,t.approved_at
    FROM firm_time_entries t JOIN staff_members s ON s.workspace_id=t.workspace_id AND s.id=t.staff_member_id
    WHERE t.workspace_id=? AND t.work_date BETWEEN ? AND ?${engagementId?' AND t.engagement_id=?':''}${context.actor.persona==='PREPARER'?' AND t.staff_member_id=?':''}
    ORDER BY t.work_date DESC,t.created_at DESC,t.id`;
  const timeBindings:unknown[]=[workspaceId,from,to];if(engagementId)timeBindings.push(engagementId);if(context.actor.persona==='PREPARER'&&context.actor.staffMemberId)timeBindings.push(context.actor.staffMemberId);
  const [time,staff,rates,accounts,periods,journals,expenses,policies,trialBalance,profitLoss]=await Promise.all([
    env.DB.prepare(timeQuery).bind(...timeBindings).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,display_name AS displayName,grade FROM staff_members WHERE workspace_id=? AND active=1${context.actor.persona==='PREPARER'?' AND id=?':''} ORDER BY grade,display_name,id`)
      .bind(...(context.actor.persona==='PREPARER'&&context.actor.staffMemberId?[workspaceId,context.actor.staffMemberId]:[workspaceId])).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,grade,hourly_minor AS hourlyMinor,effective_from AS effectiveFrom,effective_to AS effectiveTo,revision,content_sha256 AS contentSha256,approved_at AS approvedAt
      FROM firm_charge_out_rates WHERE workspace_id=? ORDER BY grade,effective_from DESC`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,code,name,account_type AS accountType,normal_side AS normalSide,posting_allowed AS postingAllowed,active,control_type AS controlType FROM firm_accounts WHERE workspace_id=? ORDER BY code`)
      .bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,start_date AS startDate,end_date AS endDate,status FROM accounting_periods WHERE workspace_id=? ORDER BY start_date DESC`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,number,posting_date AS postingDate,description,source_type AS sourceType,status,debit_total_minor AS debitTotalMinor,credit_total_minor AS creditTotalMinor,posted_at AS postedAt
      FROM firm_journals WHERE workspace_id=? AND posting_date BETWEEN ? AND ? ORDER BY posting_date DESC,number LIMIT 100`).bind(workspaceId,from,to).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,expense_date AS date,payee,category,amount_minor AS amountMinor,description,status,supporting_file_id AS supportingFileId,missing_support_reason AS missingSupportReason
      FROM firm_expenses WHERE workspace_id=? ORDER BY expense_date DESC,created_at DESC LIMIT 100`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,revision,name,effective_from AS effectiveFrom,recognition_method AS recognitionMethod,recognition_rules AS recognitionRules,content_sha256 AS contentSha256
      FROM firm_revenue_policies WHERE workspace_id=? ORDER BY revision DESC`).bind(workspaceId).all<Record<string,unknown>>(),
    firmTrialBalance(env,workspaceId,from,to),firmProfitLoss(env,workspaceId,from,to)
  ]);
  const staffRows=staff.results??[],utilization=[] as Array<Record<string,unknown>>;
  const payments=await env.DB.prepare(`SELECT p.id,p.client_id AS clientId,p.engagement_id AS engagementId,p.amount_minor AS amountMinor,p.received_on AS receivedOn,
      p.method,p.reference,p.reverses_payment_id AS reversesPaymentId,rv.number AS receiptNumber,rv.status AS receiptStatus,rv.file_version_id AS receiptFileId,
      (SELECT COALESCE(SUM(CASE WHEN source_payment.reverses_payment_id IS NULL THEN source_allocation.amount_minor ELSE -source_allocation.amount_minor END),0)
        FROM payment_allocations source_allocation JOIN payments source_payment ON source_payment.workspace_id=source_allocation.workspace_id AND source_payment.id=source_allocation.payment_id
        WHERE source_allocation.workspace_id=p.workspace_id AND (source_payment.id=p.id OR source_payment.reverses_payment_id=p.id)) AS netAllocatedMinor,
      (SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_allocation_reversals r JOIN payment_allocations pa ON pa.workspace_id=r.workspace_id AND pa.id=r.allocation_id
        WHERE r.workspace_id=p.workspace_id AND pa.payment_id=p.id) AS allocationReversedMinor,
      EXISTS(SELECT 1 FROM payments reversal WHERE reversal.workspace_id=p.workspace_id AND reversal.reverses_payment_id=p.id) AS fullyReversed
    FROM payments p LEFT JOIN receipt_vouchers rv ON rv.workspace_id=p.workspace_id AND rv.payment_id=p.id
    WHERE p.workspace_id=?${engagementId?' AND p.engagement_id=?':''}${context.scope.clientId?' AND p.client_id=?':''}
    ORDER BY p.received_on DESC,p.id LIMIT 200`).bind(workspaceId,...(engagementId?[engagementId]:[]),...(context.scope.clientId?[context.scope.clientId]:[]))
    .all<Record<string,unknown>>();
  for(const person of staffRows){const row=await utilizationFor(env,workspaceId,String(person.id),from,to);utilization.push({...row,displayName:person.displayName,grade:person.grade});}
  const budget=engagementId?await env.DB.prepare(`SELECT id,revision,fee_proposal_version_id AS feeProposalVersionId,source_hash AS sourceHash,approved_at AS approvedAt
    FROM engagement_budgets WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,engagementId).first<Record<string,unknown>>():null;
  const profitabilityView=engagementId&&budget?await profitability(env,workspaceId,context,engagementId,params.get('asOf')??new Date().toISOString()):null;
  const agingView=context.actor.persona==='PREPARER'?null:await arAging(env,workspaceId,context,params.get('asOfDate')??today,context.scope.clientId??undefined);
  const entryItems=(time.results??[]).map(row=>({...row,minutes:Number(row.minutes),billable:Boolean(row.billable),hourlyMinorSnapshot:row.hourly_minor_snapshot===null?null:String(row.hourly_minor_snapshot),chargeOutMinor:row.charge_numerator===null?null:String(roundHalfUp(BigInt(String(row.charge_numerator)),60n))}));
  const paymentItems=(payments.results??[]).map(row=>({...row,remainingUnallocatedMinor:String(BigInt(String(row.amountMinor))-
    (BigInt(String(row.netAllocatedMinor))-BigInt(String(row.allocationReversedMinor))))}));
  const engagement=engagementId?await requireEngagement(env,workspaceId,context,engagementId):null;
  const reportSnapshots=(await env.DB.prepare(`SELECT s.id,s.kind,s.period_start AS periodStart,s.period_end AS periodEnd,s.as_of AS asOf,
      s.journal_cutoff_hash AS sourceHash,s.file_version_id AS fileVersionId,s.generated_at AS generatedAt,
      f.original_name AS fileName,f.media_type AS mediaType,f.size_bytes AS sizeBytes,f.sha256
    FROM firm_report_snapshots s LEFT JOIN file_versions f ON f.workspace_id=s.workspace_id AND f.id=s.file_version_id
    WHERE s.workspace_id=? ORDER BY s.generated_at DESC LIMIT 50`).bind(workspaceId).all<Record<string,unknown>>()).results??[];
  const [withdrawals,pettyCashReconciliations,creditNotes,allocations]=await Promise.all([
    env.DB.prepare(`SELECT w.id,w.partner_staff_id AS partnerStaffId,s.display_name AS partnerName,w.withdrawal_date AS date,w.amount_minor AS amountMinor,w.reason,w.journal_id AS journalId,w.approved_at AS approvedAt
      FROM partner_withdrawals w JOIN staff_members s ON s.workspace_id=w.workspace_id AND s.id=w.partner_staff_id WHERE w.workspace_id=? ORDER BY w.withdrawal_date DESC,w.id DESC LIMIT 100`)
      .bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT r.id,r.account_id AS accountId,a.code AS accountCode,a.name AS accountName,r.as_of AS asOf,r.ledger_balance_minor AS ledgerBalanceMinor,
      r.counted_cash_minor AS countedCashMinor,r.difference_minor AS differenceMinor,r.explanation,s.display_name AS custodianName,r.reviewed_at AS reviewedAt
      FROM petty_cash_reconciliations r JOIN firm_accounts a ON a.workspace_id=r.workspace_id AND a.id=r.account_id
      JOIN staff_members s ON s.workspace_id=r.workspace_id AND s.id=r.custodian_staff_id WHERE r.workspace_id=? ORDER BY r.as_of DESC,r.id DESC LIMIT 100`).bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT n.id,n.invoice_id AS invoiceId,i.number AS invoiceNumber,n.credit_date AS date,n.amount_minor AS amountMinor,n.reason,n.journal_id AS journalId,n.approved_at AS approvedAt
      FROM firm_credit_notes n JOIN invoices i ON i.workspace_id=n.workspace_id AND i.id=n.invoice_id WHERE n.workspace_id=? ORDER BY n.credit_date DESC,n.id DESC LIMIT 100`)
      .bind(workspaceId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.payment_id AS paymentId,a.invoice_id AS invoiceId,p.client_id AS clientId,p.engagement_id AS engagementId,i.number AS invoiceNumber,
      a.amount_minor AS amountMinor,a.allocated_on AS allocatedOn,COALESCE((SELECT SUM(r.amount_minor) FROM payment_allocation_reversals r WHERE r.workspace_id=a.workspace_id AND r.allocation_id=a.id),0) AS reversedMinor
      FROM payment_allocations a JOIN payments p ON p.workspace_id=a.workspace_id AND p.id=a.payment_id JOIN invoices i ON i.workspace_id=a.workspace_id AND i.id=a.invoice_id
      WHERE a.workspace_id=? ORDER BY a.allocated_on DESC,a.id DESC LIMIT 200`).bind(workspaceId).all<Record<string,unknown>>()
  ]);
  return {period:{from,to},engagement:engagement?{id:engagement.id,version:engagement.version,clientId:engagement.client_id,code:engagement.code,
    lifecycleState:engagement.lifecycle_state,contractFeeMinor:String(engagement.contract_fee_minor),activeProposalVersionId:engagement.active_proposal_version_id}:null,
    staff:staffRows,rates:rates.results??[],timeEntries:entryItems,utilization,
    utilizationNotes:{definition:'Approved billable minutes divided by explicitly scheduled capacity after approved leave. Missing daily capacity is shown, never assumed.',payrollCostAvailable:false},
    budget,profitability:profitabilityView,trialBalance,profitLoss,accounts:accounts.results??[],accountingPeriods:periods.results??[],journals:journals.results??[],expenses:expenses.results??[],
    revenuePolicies:policies.results??[],payments:paymentItems,arAging:agingView,reportSnapshots,partnerWithdrawals:withdrawals.results??[],
    pettyCashReconciliations:pettyCashReconciliations.results??[],creditNotes:creditNotes.results??[],paymentAllocations:allocations.results??[],
    controlAccountBalances:await Promise.all((accounts.results??[]).filter(row=>row.controlType==='CASH').map(async account=>({accountId:account.id,code:account.code,name:account.name,
      balanceMinor:String(await accountBalance(env,workspaceId,String(account.id),to))}))),
    arAgingNote:agingView?.reconciliationStatus==='RECONCILED'?'Customer invoice subledger reconciles to the posted AR control account.':'A reconciliation difference is shown as an integration exception; no balancing entry was fabricated.'};
}

export async function buildBusinessPracticeMutation(env:Env,workspaceId:string,context:BusinessContext,command:BusinessPracticeCommand,commandId:string,now:string):Promise<BusinessMutation>{
  switch(command.type){
    case 'practice.rate.set':return buildRateSet(env,workspaceId,context,command,now);
    case 'time.create':return buildTimeCreate(env,workspaceId,context,command,now);
    case 'time.submit':return buildTimeSubmit(env,workspaceId,context,command,now);
    case 'time.approve':case 'time.return':return buildTimeDecision(env,workspaceId,context,command,now);
    case 'time.correct':return buildTimeCorrection(env,workspaceId,context,command,now);
    case 'practice.capture-utilization-report':return buildCaptureUtilization(env,workspaceId,context,command,now);
    case 'budget.approve':return buildBudgetApprove(env,workspaceId,context,command,now);
    case 'ledger.account.create':return buildAccountCreate(env,workspaceId,context,command,now);
    case 'accounting-period.open':return buildPeriodOpen(env,workspaceId,context,command,now);
    case 'accounting-period.close':return buildPeriodClose(env,workspaceId,context,command,now);
    case 'ledger.create-draft':return buildJournalCreate(env,workspaceId,context,command,commandId,now);
    case 'ledger.post':return buildJournalPost(env,workspaceId,context,command,now);
    case 'ledger.reverse':return buildJournalReverse(env,workspaceId,context,command,now);
    case 'expense.create':return buildExpenseCreate(env,workspaceId,context,command,now);
    case 'expense.approve-and-post':return buildExpensePost(env,workspaceId,context,command,now);
    case 'partner-withdrawal.post':return buildWithdrawal(env,workspaceId,context,command,now);
    case 'petty-cash.reconcile':return buildPettyCashReconcile(env,workspaceId,context,command,now);
    case 'revenue-policy.save':return buildRevenuePolicy(env,workspaceId,context,command,now);
    case 'revenue.recognize':return buildRevenueRecognize(env,workspaceId,context,command,now);
    case 'practice.capture-profitability-report':return buildCaptureProfitability(env,workspaceId,context,command,now);
    case 'payment.allocate':return buildPaymentAllocate(env,workspaceId,context,command,now);
    case 'payment.reverse-allocation':return buildReverseAllocation(env,workspaceId,context,command,now);
    case 'credit-note.issue':return buildCreditNote(env,workspaceId,context,command,now);
    case 'practice.capture-ar-aging-report':return buildCaptureAr(env,workspaceId,context,command,now);
    case 'practice.export-report':return buildPracticeReportExport(env,workspaceId,context,command,now);
    default:throw new ApiError('BAD_REQUEST','Unsupported practice-management command.');
  }
}
