import { it } from 'node:test';
import assert from 'node:assert/strict';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { computeSystemState, acceptedProposal, hasExactFivePartBundle, sampleEvidenceReady, substantiveProgramFor, materialityBenchmark, firmTrialBalance, normalizeTargetState, closeExpiredArchives, fsliRiskLevel } from '../../src/services/targetLifecycle';
import { mergeIndependentEdits } from '../../src/services/rowMerge';
import { inspectionRecords } from '../../src/services/archivePackage';
import { requireRoutedContact } from '../../src/services/contactRouting';

const writer = async (id: string) => ({id,name:`${id}.pdf`,kind:'PDF' as const,mimeType:'application/pdf',size:3,sha256:'a'.repeat(64)});
async function commerce(pay = false) {
  const state = targetFixture(), e = state.engagements[0]; (store as any).state = state;
  const commands = new TargetLifecycleCommands(() => state, () => {}, writer);
  act(state,'manager'); commands.pinAcceptedProposal(e.id,e.proposalId!); store.saveAcceptanceCase(acceptance(state));
  act(state,'partner'); store.decideAcceptanceCase('ACC-TARGET','Accepted','Independent assessment of evidence against current client risk.');
  store.generateEngagementLetter(e.id,'ISA 210 External Statutory Audit','IFRS',state.currentPerson,true);
  if (pay) { act(state,'billing'); commands.recordAdvance(e.id,{amount:e.agreedFee/2,date:state.asOfDate,method:'Bank transfer',reference:'REVIEW-PAYMENT'}); }
  return {state,e,commands};
}
it('RT-01/02 draft proposal does not advance Dual-Key; current dispatch does', () => {
  const s = targetFixture(), e = s.engagements[0], p = s.proposals[0]; p.state='Draft'; delete p.clientResponse; delete p.presentedSnapshot; p.dispatchHistory=[];
  assert.equal(computeSystemState(s,e).state,'PROPOSAL_GENERATION');
  p.presentedSnapshot={revision:p.revision} as any; p.dispatchHistory=[{revision:p.revision,recipientName:'Managing Director',simulatedOutcome:'Delivered (simulated)'}] as any;
  assert.equal(computeSystemState(s,e).state,'DUAL_KEY_PENDING');
});
it('RT-03/04 exact commercial references reject wrong year/service and stale acceptance', async () => {
  for (const change of ['year','service','response','currency'] as const) {
    const {state,e}=await commerce(); const p=state.proposals[0];
    if(change==='year') p.periodEnd='2025-12-31'; if(change==='service') e.service='Agreed-Upon Procedures'; if(change==='response') p.clientResponse!.revision++; if(change==='currency') e.currency='USD';
    assert.equal(acceptedProposal(state,e),undefined);
    const before=JSON.stringify({letter:e.engagementLetter,invoices:state.invoices});
    assert.throws(()=>store.generateEngagementLetter(e.id,'ISA 210 External Statutory Audit','IFRS',state.currentPerson,true),/Key 1/);
    assert.equal(JSON.stringify({letter:e.engagementLetter,invoices:state.invoices}),before);
  }
});
it('RT-05 June reporting period/deadline appears in EL with retrievable prior content', async () => {
  const {state,e,commands}=await commerce(); const old=e.engagementLetter!.content;
  e.period='Year ended 30 June 2026'; state.proposals[0].periodEnd='2026-06-30';
  delete e.auditLifecycle!.commercialBasis; act(state,'manager'); commands.pinAcceptedProposal(e.id,e.proposalId!);
  e.auditLifecycle!.milestones=[{revision:1,cutoff:'2026-06-30',fieldwork:'2026-07-01',draft:'2026-07-20',final:'2026-07-31',reason:'June reporting',actorUserId:'manager',at:new Date().toISOString()}];
  act(state,'partner'); store.generateEngagementLetter(e.id,'ISA 210 External Statutory Audit','IFRS',state.currentPerson,true);
  assert.match(e.engagementLetter!.content,/2026-06-30/); assert.match(e.engagementLetter!.content,/Submission deadline: 2026-07-31/); assert.doesNotMatch(e.engagementLetter!.content,/December 31/);
  assert.equal(e.engagementLetterHistory![0].content,old);
});
it('RT-06 Manager preparation remains Draft; Partner issuance produces visible unpaid invoice', async () => {
  const {state,e}=await commerce(); const invoice=state.invoices[0]; assert.equal(invoice.status,'Issued'); assert.equal(invoice.paid,0);
  state.invoices=[]; act(state,'manager'); store.generateEngagementLetter(e.id,'ISA 210 External Statutory Audit','IFRS','',false);
  assert.equal(state.invoices[0].status,'Draft'); assert.equal(e.engagementLetter!.partnerSignature,'');
});
it('RT-07 receipt failure preserves payment once; retry reuses receipt and onboarding basis', async () => {
  const {state,e,commands}=await commerce(true);
  const broken=new TargetLifecycleCommands(()=>state,()=>{},async()=>{throw new Error('Storage failure');});
  await assert.rejects(broken.generateOfficialReceipt(e.id),/Storage failure/); assert.equal(state.receipts.length,1); assert.equal(e.auditLifecycle!.receiptDocuments.length,0);
  const a=await commands.generateOfficialReceipt(e.id), b=await commands.generateOfficialReceipt(e.id);
  assert.equal(a.id,b.id); assert.equal(e.auditLifecycle!.receiptDocuments.length,1); assert.equal(state.receipts.length,1);
  assert.equal(e.auditLifecycle!.onboarding!.requiresFirstLoginReset,true); assert.equal(state.folders!.filter(f=>f.engagementId===e.id).length,5);
});
it('RT-08 missing or ambiguous responsibility never routes to an arbitrary contact', () => {
  const s=targetFixture(); const md=requireRoutedContact(s.contacts.filter(c => c.clientId === s.engagements[0].client),'proposals_reports');
  assert.throws(()=>requireRoutedContact([...s.contacts.filter(c => c.clientId === s.engagements[0].client),{...md,id:'SECOND-MD'}],'proposals_reports'),/Ambiguous/);
  assert.throws(()=>requireRoutedContact(s.contacts.filter(c=>c.clientId === s.engagements[0].client && c.id!==md.id),'proposals_reports'),/MD|contact|recipient/i);
});
it('RT-11/12 materiality derives signed-normal TB revenue/PBT/assets with explainable accounts', () => {
  const s=targetFixture(), e=s.engagements[0]; e.rows=[{code:'1',name:'Cash',type:'asset',balance:1068420},{code:'4',name:'Revenue',type:'revenue',balance:-1068420}];
  assert.equal(materialityBenchmark(e,'profit').value,1068420); assert.equal(materialityBenchmark(e,'revenue').value,1068420); assert.equal(materialityBenchmark(e,'profit').accounts.length,1);
});
it('RT-14 significant low-balance FSLI uses Red policy everywhere', () => {
  const s=targetFixture(), e=s.engagements[0]; e.rows=[{code:'1',name:'Receivable',type:'asset',balance:10,mappedStatementLine:'Receivables'}]; s.auditRisks=[{engagementId:e.id,area:'Receivables',rating:'Significant'} as any];
  assert.equal(fsliRiskLevel(s,e,'Receivables'),'RED');
});
it('RT-15 exact substantive navigation excludes broad AR/Going Concern', () => {
  const s=targetFixture(), e=s.engagements[0]; s.auditPrograms=[{id:'AR',engagementId:e.id,area:'Analytical Review',financialStatementLines:['Equity'],procedures:[]},{id:'EQ',engagementId:e.id,area:'FSLI: Equity',financialStatementLines:['Equity'],procedures:[]}];
  assert.equal(substantiveProgramFor(s,e.id,'Equity')!.id,'EQ'); assert.equal(substantiveProgramFor(s,e.id,'Cash'),undefined);
});
it('RT-18 digital-only samples pass current evidence; Hybrid requires both modes', () => {
  const s=targetFixture(), e=s.engagements[0]; s.documents=[{id:'D',engagementId:e.id,clientId:e.client,version:1} as any]; s.evidenceCatalogue=[{documentId:'D',version:1,adequacyStatus:'Adequate'} as any];
  const item={tested:true,evidenceDoc:'D',evidenceMode:'Digital'} as any; assert.equal(sampleEvidenceReady(s,e,item),true);
  item.evidenceMode='Hybrid'; assert.equal(sampleEvidenceReady(s,e,item),false); item.physicalReference={indexCode:'X-1',description:'Physical original'}; assert.equal(sampleEvidenceReady(s,e,item),true);
  s.documents[0].brokenLink=true; assert.equal(sampleEvidenceReady(s,e,item),false);
});
it('RT-19 independent Sales/PPE edits survive; same procedure revisions conflict', () => {
  const base={auditPrograms:[{id:'P',procedures:[{id:'Sales',conclusion:''},{id:'PPE',conclusion:''}]}]};
  const a=structuredClone(base), b=structuredClone(base); a.auditPrograms[0].procedures[0].conclusion='Sales evidence'; b.auditPrograms[0].procedures[1].conclusion='PPE evidence';
  const merged=mergeIndependentEdits(base,a,b); assert.equal(merged.auditPrograms[0].procedures[0].conclusion,'Sales evidence'); assert.equal(merged.auditPrograms[0].procedures[1].conclusion,'PPE evidence');
  b.auditPrograms[0].procedures[0].conclusion='Conflicting Sales'; assert.throws(()=>mergeIndependentEdits(base,a,b),/same-row/);
});
it('RT-22 old SRM never advances a fresh engagement review', () => {
  const s=targetFixture(), e=s.engagements[0]; e.auditLifecycle!.srms=[{basis:'old-source',artifact:awaitableArtifact(),summary:[],revision:1,at:new Date().toISOString(),actorUserId:'manager',notes:'Old review'}];
  assert.notEqual(computeSystemState(s,e).state,'MANAGERIAL_REVIEW');
});
function awaitableArtifact(){return {id:'OLD',name:'old.pdf',kind:'PDF' as const,mimeType:'application/pdf',size:3,sha256:'a'.repeat(64)};}
it('RT-26 validates exactly five semantic outputs, rejects duplicates and three-part sets', () => {
  const types=['Audit Report','Management Letter','Letter of Representation','Management Correspondences Audit Trail','Final Balance Fee Note'];
  const set={artifacts:types.map((deliverable,i)=>({...awaitableArtifact(),id:String(i),deliverable}))} as any;
  assert.equal(hasExactFivePartBundle(set),true); set.artifacts[4].deliverable='Management Letter'; assert.equal(hasExactFivePartBundle(set),false); set.artifacts=set.artifacts.slice(0,3); assert.equal(hasExactFivePartBundle(set),false);
});
it('RT-32/33 expiry without a report still reloads as read-only with explicit packaging exception', () => {
  const s=targetFixture(),e=s.engagements[0]; Object.assign(e.auditLifecycle!.archiveControl,{finalReportDate:'2026-07-01',freezeDueDate:'2026-08-30',freezeStatus:'Counting Down'});
  closeExpiredArchives(s); assert.equal(e.archive!.packagingStatus,'Pending'); assert.match(e.archive!.manifest[0],/unavailable/); assert.doesNotThrow(()=>normalizeTargetState(structuredClone(s)));
});
it('RT-35 full inspection includes TB history, review/signoffs, workpapers, AJEs and scoped evidence', () => {
  const s=targetFixture(),e=s.engagements[0]; s.adjustmentJournals=[{engagementId:e.id,id:'OURS'} as any,{engagementId:'FOREIGN',id:'OTHER'} as any];
  const records=inspectionRecords(s,e); assert.deepEqual(records.adjustments.map(j=>j.id),['OURS']); assert.ok('workpapers' in records.engagement); assert.ok('sourceHistory' in records.engagement); assert.ok('auditLifecycle' in records.engagement);
});
it('RT-31/36 common month/currency projection reconciles receipts and reversal without double revenue', async () => {
  const {state,e,commands}=await commerce(true); const month=state.asOfDate.slice(0,7);
  let tb=firmTrialBalance(state,month); assert.equal(tb.find(r=>r.account==='Audit fee revenue')!.credit,e.agreedFee/2); assert.equal(tb.find(r=>r.account==='Accounts receivable')!.balance,0); assert.equal(tb.find(r=>r.account==='Cash')!.balance,e.agreedFee/2);
  commands.reverseAdvance(e.id,state.receipts[0].id,'Synthetic correction'); tb=firmTrialBalance(state,month); assert.equal(tb.find(r=>r.account==='Accounts receivable')!.balance,e.agreedFee/2); assert.equal(tb.reduce((n,r)=>n+r.debit-r.credit,0),0);
  assert.deepEqual(firmTrialBalance(state,month,'USD'),[]);
});

it('F02 same-year cutoff, internal-audit service and changed presented fee fail the exact source gate', async () => {
  for(const kind of ['cutoff','internal','fee']) {
    const {state,e,commands}=await commerce();
    if(kind==='cutoff')e.period='Year ended 30 June 2026';
    if(kind==='internal')e.service='Internal audit';
    if(kind==='fee')state.proposals[0].totalAmount++;
    assert.equal(acceptedProposal(state,e),undefined);
    assert.throws(()=>commands.pinAcceptedProposal(e.id,e.proposalId!),/exact client|service|period/);
  }
});
it('F20 reversal is a dated posting and preserves the prior month cash/AR movements', async () => {
  const {state,e,commands}=await commerce(true); state.asOfDate='2026-10-05';commands.reverseAdvance(e.id,state.receipts[0].id,'October correction');
  const september=firmTrialBalance(state,'2026-09'),october=firmTrialBalance(state,'2026-10');
  assert.equal(september.find(r=>r.account==='Cash')!.balance,e.agreedFee/2);
  assert.equal(september.find(r=>r.account==='Accounts receivable')!.balance,0);
  assert.equal(october.find(r=>r.account==='Cash')!.balance,-e.agreedFee/2);
  assert.equal(october.find(r=>r.account==='Accounts receivable')!.balance,e.agreedFee/2);
});
it('F13 SRM renders one adjusted journal, an unadjusted difference and Red estimate without double counting', async () => {
  const {srmReviewSections}=await import('../../src/services/reviewSchedules');
  const {reviewBasis,currentReview}=await import('../../src/services/targetLifecycle');
  const s=targetFixture(),e=s.engagements[0];e.sourceVersion=1;
  e.rows=[{code:'1',name:'Cash impairment estimate',type:'asset',balance:1000,mappedStatementLine:'Cash'},{code:'3',name:'Equity',type:'equity',balance:-1000,mappedStatementLine:'Equity'}];
  s.auditPlans=[{id:'P',engagementId:e.id,sourceVersion:1,version:1,status:'Approved',overallMateriality:100,performanceMateriality:75,clearlyTrivialThreshold:5} as any];
  s.adjustmentJournals=[{id:'AJE-1',engagementId:e.id,title:'Reviewed adjustment',revision:1,status:'Management accepted',reflectionStatus:'Not reflected',reflectionSourceVersion:1,rationale:'Reviewed client correction.',lines:[{accountCode:'1',type:'debit',amount:10},{accountCode:'3',type:'credit',amount:10}]} as any];
  s.findings=[{id:'ADJUSTED',engagementId:e.id,title:'Linked corrected issue',category:'Monetary misstatement',amount:10,disposition:'Uncorrected',linkedJournalId:'AJE-1'},{id:'OPEN',engagementId:e.id,title:'Residual difference',category:'Monetary misstatement',grossMisstatement:30,netMisstatement:-10,disposition:'Uncorrected'}] as any;
  const text=srmReviewSections(s,e).join('\n');assert.match(text,/AJE-1 v1/);assert.match(text,/ADJUSTED: applied/);assert.match(text,/Aggregate gross unadjusted: 30/);assert.match(text,/Aggregate signed net unadjusted: -10/);assert.match(text,/Cash impairment estimate.*risk RED/);
  const basis=reviewBasis(s,e);e.auditLifecycle!.managerReviews.push({basis,revision:1,actorUserId:'manager',at:s.asOfDate,notes:'Current source review.'});assert.equal(currentReview(s,e).manager,true);
  s.adjustmentJournals[0].status='Rejected';assert.equal(currentReview(s,e).manager,false);
  assert.match(srmReviewSections(s,e).join('\n'),/Aggregate gross unadjusted: 40/);
});