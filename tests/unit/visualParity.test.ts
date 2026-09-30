import { beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { analyticalReviewIsCurrent, criticalConfirmationBlockers, practiceEconomics } from '../../src/services/targetLifecycle';
import { validateMaterialityRates, validateMaterialityThresholds } from '../../src/services/calculations';
let state: ReturnType<typeof targetFixture>, e: typeof state.engagements[number], commands: TargetLifecycleCommands;
const writer = async (id: string) => ({ id, name: `${id}.pdf`, kind: 'PDF' as const, mimeType: 'application/pdf', size: 3, sha256: 'a'.repeat(64) });
beforeEach(async () => {
  state = targetFixture(); e = state.engagements[0]; (store as any).state = state;
  commands = new TargetLifecycleCommands(() => state, () => {}, writer);
  act(state,'manager'); commands.pinAcceptedProposal(e.id,e.proposalId!); store.saveAcceptanceCase(acceptance(state));
  act(state,'partner'); store.decideAcceptanceCase('ACC-TARGET','Accepted','Independent assessment of all required checks.');
  store.generateEngagementLetter(e.id, 'ISA 210 External Statutory Audit', 'IFRS', state.currentPerson, true);
  act(state,'billing'); commands.recordAdvance(e.id,{amount:e.agreedFee/2,date:state.asOfDate,method:'Bank transfer',reference:'ADV-PARITY'}); await commands.generateOfficialReceipt(e.id);
  act(state,'admin'); store.simulateM365Verification('sharepoint','success'); store.prepareClientWorkspace(e.client,e.year,e.id); commands.verifyWorkspaceAccess(e.id, 'Verified local simulated evidence workspace.'); act(state,'manager');
  commands.importMappedTB(e.id,[{code:'1000',name:'Cash',type:'asset',balance:100},{code:'3000',name:'Capital',type:'equity',balance:-100},{code:'1100',name:'Receivables',type:'asset',balance:1068420},{code:'4000',name:'Revenue',type:'revenue',balance:-1068420}],{fileName:'tb.csv',format:'CSV',sha256:'a'.repeat(64)});
  commands.confirmMapping(e.id,[{code:'1000',line:'Cash'},{code:'3000',line:'Equity'},{code:'1100',line:'Receivables'},{code:'4000',line:'Revenue'}]);
  store.saveAuditPlan({id:'PLAN-PARITY',engagementId:e.id,version:1,status:'Under review',benchmark:'profit',benchmarkValue:1068420,materialityRate:5,overallMateriality:53000,performanceMaterialityRate:75,performanceMateriality:39750,clearlyTrivialRate:5,clearlyTrivialThreshold:2650,rationales:['Manager rounding within five percent.'],teamAllocations:[{person:'Layla Rahman',role:'Manager',scheduledStart:state.asOfDate,scheduledEnd:state.asOfDate}],timingMilestones:[],significantAreas:[]});
  act(state,'partner'); store.reviewAuditPlan('PLAN-PARITY',true,'Independent Partner approval on current TB.');
  act(state,'manager'); commands.saveStaffing(e.id,([{userId:'partner',role:'Partner'},{userId:'manager',role:'Manager'},{userId:'reviewer',role:'Senior/Reviewer'},{userId:'preparer',role:'Preparer/Staff'}] as const).map(a=>({...a,phase:'Fieldwork',plannedHours:10,chargeRate:a.role==='Partner'?1000:a.role==='Manager'?750:a.role==='Senior/Reviewer'?500:200,costRate:100,startDate:state.asOfDate,endDate:state.asOfDate,capacityHours:40,leaveHours:8,targetUtilizationPct:80})),'Recorded capacity and leave.');
});
it('persists permitted 53421 to 53000 rounding and rejects invalid bands / nonfinite values',()=>{
 assert.equal(state.auditPlans![0].overallMateriality,53000);
 for (const [benchmark,rate] of [['profit',4],['revenue',3],['assets',2],['equity',3]] as const) assert.throws(()=>validateMaterialityRates(benchmark,rate,75,5));
 assert.throws(()=>validateMaterialityRates('profit',NaN,75,5));
 assert.throws(()=>validateMaterialityThresholds(1068420,5,50000,75,37500,5,2500),/rounding/);
});
it('enforces Partner approval and mandatory Track A controls at direct command boundary',()=>{
 state.auditPlans![0].status='Under review'; act(state,'reviewer'); assert.throws(()=>store.reviewAuditPlan('PLAN-PARITY',true,'Bypass'),/cannot review/);
 const record=state.acceptanceCases![0]; record.managementIntegrityConfirmed=undefined; act(state,'partner'); assert.throws(()=>store.decideAcceptanceCase(record.id,'Accepted','Re-assessment'),/integrity/);
});
it('systematic samples can reach every population item with N=10 and n=6',()=>{
 act(state,'preparer'); const rows=Array.from({length:10},(_,i)=>({id:`ROW-${i}`,itemRef:`ROW-${i}`,tested:false,result:'Untested' as const,date:`${e.year}-09-01`,counterparty:'Synthetic',amount:10,description:'Population item'}));
 const populationId=commands.importPopulation(e.id,'1000','sample.csv','b'.repeat(64),rows);
 const seen=new Set<string>();
 for(let seed=0;seed<10000;seed+=277){commands.generateSample(e.id,populationId,'Systematic Random Sampling',6,seed); const p=state.samplePopulations.find(p=>p.id===populationId)!; assert.equal(p.items.filter(i=>i.selected).length,6);p.items.filter(i=>i.selected).forEach(i=>seen.add(i.id));}
 assert.equal(seen.size,10,'tail and every other item have positive inclusion probability');
});
it('Holding Letters persist revisions and retain critical release blockers',async()=>{
 act(state,'preparer'); commands.createConfirmation(e.id,{type:'Bank',counterparty:'Synthetic Bank',relatedFsli:'Cash',ownerUserId:'preparer',dueAt:state.asOfDate,critical:true,workpaperIds:[]});
 act(state,'manager'); await commands.generateHoldingLetter(e.id); await commands.generateHoldingLetter(e.id);
 assert.deepEqual(e.auditLifecycle!.holdingLetters!.map(l=>l.revision),[1]);
 assert.equal(e.auditLifecycle!.holdingLetters![0].simulatedDispatchStatus,'Issued (simulated)');
 assert.equal(criticalConfirmationBlockers(state,e).length,1);
 assert.equal(JSON.parse(JSON.stringify(e)).auditLifecycle.holdingLetters.length,1);
});
it('Analytical Review stores deliberate checklist, actor and source and becomes stale',()=>{
 act(state,'manager'); commands.prepareStandardPrograms(e.id);
 const input={fsli:'Cash',tbSourceVersion:e.sourceVersion,mappingRevision:state.accountMappingRevisions!.at(-1)!.revision,planVersion:1,currentBalance:100,variancePct:null,analysis:'Corroborated variance to evidence.',isa570Checklist:{operatingCashFlows:true,debtCovenantsCompliant:true,workingCapitalAdequate:true,noMaterialDisruptions:true,conclusion:'Twelve-month forecast corroborates liquidity.'}};
 assert.throws(()=>store.signOffAnalyticalReview(e.id,{...input,isa570Checklist:{...input.isa570Checklist,operatingCashFlows:null}}),/ISA 570/);
 store.signOffAnalyticalReview(e.id,input); const record=e.auditLifecycle!.analyticalReviews![0];
 assert.equal(record.signedOffByUserId,'manager'); assert.ok(record.signedOffAt); assert.equal(analyticalReviewIsCurrent(state,e,record),true);
 assert.equal(state.auditPrograms.find(p=>p.area==='Analytical Review')!.procedures[0].status,'In progress','independent review remains required');
 e.sourceVersion++; assert.equal(analyticalReviewIsCurrent(state,e,record),false);
});
it('Red estimate requires Manager execution even below materiality; all mapped FSLIs receive assertion coverage', () => {
  act(state, 'manager'); commands.prepareStandardPrograms(e.id);
  const equity = state.auditPrograms.find(program => program.financialStatementLines?.includes('Equity') && program.procedures.length === 5)!;
  assert.ok(equity, 'Uncovered equity FSLI has five assertion procedures');
  e.rows.find(row => row.mappedStatementLine === 'Cash')!.name = 'Cash impairment estimate';
  const procedure = state.auditPrograms.find(program => program.area === 'Treasury')!.procedures[0];
  act(state, 'preparer');
  assert.throws(() => store.updateAuditProcedureExecution(e.id, procedure.id, 'Estimate assessment performed.', 'Estimate assessment conclusion.', ''), /Manager-level/);
  assert.equal(procedure.workPerformed, undefined);
  act(state, 'manager');
  store.updateAuditProcedureExecution(e.id, procedure.id, 'Estimate assessed with supporting forecast.', 'Estimate assessment conclusion.', '');
  assert.equal(procedure.workPerformed, 'Estimate assessed with supporting forecast.');
});
it('local row leases reject competing actors and stale revisions, and allow expiry/release',()=>{
 act(state,'preparer');commands.toggleRowLock(e.id,'Cash',0); act(state,'reviewer');assert.throws(()=>commands.toggleRowLock(e.id,'Cash',1),/Another auditor/);
 e.auditLifecycle!.rowLocks!.Cash.expiresAt='2000-01-01T00:00:00Z';commands.toggleRowLock(e.id,'Cash',1);assert.throws(()=>commands.toggleRowLock(e.id,'Cash',1),/changed/);commands.toggleRowLock(e.id,'Cash',2);assert.ok(e.auditLifecycle!.rowLocks!.Cash.releasedAt);
});
it('profit uses logged charge-out hours and missing rate stays Unknown',()=>{
 state.times=[{id:'T-PARITY',person:'Adam Khan',clientId:e.client,engagementId:e.id,taskTitle:'Cash',date:state.asOfDate,durationMinutes:120,billingRatePerHour:200,costRatePerHour:100,billable:true,activity:'Fieldwork',status:'Approved'}];
 let m=practiceEconomics(state,e);assert.equal(m.profit,e.agreedFee-400);assert.equal(m.actualCost,200);
 state.times[0].billingRatePerHour=undefined; e.auditLifecycle!.staffing.at(-1)!.allocations.find(a=>a.userId==='preparer')!.chargeRate=null;
 assert.equal(practiceEconomics(state,e).profit,null);
});
it('continuance requires all six deliberate answers and an eligible prior-period reference',()=>{
 const record=state.acceptanceCases![0]; record.assessmentType='Track B (Continuance)';
 record.managementIntegrityConfirmed=undefined;record.financialViabilityConfirmed=undefined;
 const prior=structuredClone(e);prior.id='ENG-PRIOR';prior.year=e.year-1;prior.acceptance=true;state.engagements.push(prior);
 record.priorPeriodEngagementId=prior.id;record.continuanceDeltaChecklist={priorFeesSettled:null};
 act(state,'partner');assert.throws(()=>store.decideAcceptanceCase(record.id,'Accepted','Independent continuance assessment.'),/all six/);
 record.continuanceDeltaChecklist={priorFeesSettled:true,managementShareholdingUnchanged:true,noNewLoansCovenants:true,noPendingLitigation:true,noFraudInvestigations:true,noRegulatoryInquiries:true};
 record.priorPeriodEngagementId=e.id;assert.throws(()=>store.decideAcceptanceCase(record.id,'Accepted','Independent continuance assessment.'),/prior period/);
 record.priorPeriodEngagementId=prior.id;store.decideAcceptanceCase(record.id,'Accepted','Independent continuance assessment.');
 assert.equal(record.decisionStatus,'Accepted');
});

it('F07 current-source provenance rejects an arbitrary numerically valid materiality benchmark atomically',()=>{
  act(state,'manager'); const before=JSON.stringify(state.auditPlans);
  const plan={...state.auditPlans[0],id:'PLAN-ARBITRARY',version:2,status:'Under review' as const,benchmarkValue:100000,overallMateriality:5000,performanceMateriality:3750,clearlyTrivialThreshold:250,benchmarkProvenance:undefined};
  assert.throws(()=>store.saveAuditPlan(plan),/Benchmark must reconcile to the current TB/);
  assert.equal(JSON.stringify(state.auditPlans),before);
});
it('F09 an unassigned Partner with the same display name cannot approve planning',()=>{
  const original=state.users.find(u=>u.id==='partner')!;
  state.users.push({...original,id:'other-partner',personId:'OTHER-PERSON'});
  state.roleGrants.push({...state.roleGrants.find(g=>g.userId==='partner')!,userId:'other-partner'});
  state.auditPlans[0].status='Under review';act(state,'other-partner');
  assert.throws(()=>store.reviewAuditPlan('PLAN-PARITY',true,'Independent assessment.'),/assigned Partner/);
  assert.equal(state.auditPlans[0].status,'Under review');
});