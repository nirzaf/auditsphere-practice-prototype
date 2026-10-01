import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encode } from 'fast-png';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { proposalPDF, proposalTeam, proposalOutputLines } from '../../src/services/proposalOutput';
import { managementLetterLines } from '../../src/services/clientOutputs';
import { reviewBasis } from '../../src/services/targetLifecycle';
import { createPDFBlob } from '../../src/services/exportService';
import { createDOCXBlob } from '../../src/services/exportService';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { unzipSync } from 'fflate';
import { comparativeVariance } from '../../src/services/comparativeVariance';

const captured = () => JSON.parse(readFileSync('tests/fixtures/current-partner-approval.json','utf8'));

it('R03 zero base, unchanged zero, missing source and signed prior have distinct results', () => {
  assert.deepEqual(comparativeVariance(100000,0),{movement:100000,percent:null,label:'New balance — percentage not meaningful'});
  assert.equal(comparativeVariance(0,0).percent,0);
  assert.equal(comparativeVariance(100000).movement,undefined);
  assert.equal(comparativeVariance(-80,-100).percent,20);
});

it('A01 multi-level corporate relationships persist while missing parents and cycles fail', () => {
  const state=targetFixture();(store as any).state=state;act(state,'manager');
  const base=state.clients[0];base.entityRole='Holding';base.parentClientId=undefined;
  const child={...structuredClone(base),id:'HIER-SUB',code:'HIER-SUB',name:'Synthetic subsidiary',entityRole:'Subsidiary' as const,parentClientId:base.id};
  store.addClient(child);
  const affiliate={...structuredClone(child),id:'HIER-AFF',code:'HIER-AFF',name:'Synthetic affiliate',entityRole:'Affiliate' as const,parentClientId:child.id};
  store.addClient(affiliate);
  assert.equal(store.getSnapshot().clients.find(c=>c.id==='HIER-AFF')!.parentClientId,'HIER-SUB');
  assert.throws(()=>store.updateClient({...base,parentClientId:affiliate.id},base.profileRevision||0),/cycle/);
  assert.throws(()=>store.updateClient({...child,parentClientId:'MISSING'},child.profileRevision||0),/existing client/);
});

it('A08 all three required methods retain rationale, replay parameters and enforce strata count', () => {
  const state=captured(),e=state.engagements.find((e:any)=>e.id===state.selectedEngagement),p=state.samplePopulations[0];
  const commands=new TargetLifecycleCommands(()=>state,()=>{});act(state,'manager');
  const methodology={samplingBasis:'Complete reconciled customer population tested using a documented professional override.',sizeDetermination:'Reviewer-selected two items for this synthetic example; not a validated recommendation.',attributeDefinition:'Customer-group attribute identifies the strata for this test.',strataField:'counterparty' as const};
  p.items.forEach((item:any,index:number)=>item.counterparty=index===0?'Customer A':'Customer B');
  for(const method of ['Monetary Unit Sampling','Systematic Random Sampling','Stratified Attribute Sampling'] as const){
    commands.generateSample(e.id,p.id,method,2,42,methodology);const ids=p.items.filter((i:any)=>i.selected).map((i:any)=>i.id);
    commands.generateSample(e.id,p.id,method,2,42,methodology);assert.deepEqual(p.items.filter((i:any)=>i.selected).map((i:any)=>i.id),ids);
    assert.equal(p.samplingBasis,methodology.samplingBasis);assert.equal(p.sizeDetermination,methodology.sizeDetermination);
    if(method==='Stratified Attribute Sampling')assert.deepEqual(new Set(p.items.filter((i:any)=>i.selected).map((i:any)=>i.counterparty)),new Set(['Customer A','Customer B']));
  }
  assert.throws(()=>commands.generateSample(e.id,p.id,'Stratified Attribute Sampling',1,42,methodology),/strat/);
  assert.throws(()=>commands.generateSample(e.id,p.id,'Systematic Random Sampling',2,42),/basis/i);
  commands.generateSample(e.id,p.id,'Systematic Random Sampling',3,42,methodology);assert.equal(p.items.filter((i:any)=>i.selected).length,3);
  e.sourceVersion++;assert.throws(()=>commands.generateSample(e.id,p.id,'Systematic Random Sampling',2,42,methodology),/source|planning|stale|current/i);
});

it('A07 Digital, Physical and Hybrid workbook modes share submission readiness and reject stale digital refs', async () => {
  const state=captured(),e=state.engagements.find((e:any)=>e.id===state.selectedEngagement),wp=e.workpapers.find((w:any)=>w.applicable);
  (store as any).state=state;act(state,'manager');const commands=new TargetLifecycleCommands(()=>state,()=>{});
  wp.physicalReference={indexCode:'X-1',description:'Synthetic physical invoice inspection',box:'Demo cabinet'};
  wp.evidenceRefs=[];wp.evidenceRevisions={};
  wp.evidenceMode='Physical';wp.workPerformed='Inspected original physical invoice and reconciled amount.';wp.scope='Recorded physical scope';wp.conclusion='Evidence supports the recorded conclusion.';
  store.submitWorkpaper(e.id,wp.id);assert.equal(wp.status,'Submitted');
  await assert.rejects(()=>commands.saveFieldworkWorkbook(e.id,wp.id,'Digital scope','Current evidence tested independently.','Evidence supports the recorded conclusion.','Digital'),/Digital/);
  await assert.rejects(()=>commands.saveFieldworkWorkbook(e.id,wp.id,'Hybrid scope','Current evidence tested independently.','Evidence supports the recorded conclusion.','Hybrid'),/Hybrid/);
  const doc=state.documents.find((d:any)=>d.engagementId===e.id&&!d.brokenLink&&!state.documents.some((n:any)=>n.supersedesDocumentId===d.id));
  wp.evidenceRefs=[doc.id];wp.evidenceRevisions={[doc.id]:doc.version};
  wp.evidenceMode='Hybrid';
  store.submitWorkpaper(e.id,wp.id);assert.equal(wp.status,'Submitted');
  doc.brokenLink=true;await assert.rejects(()=>commands.saveFieldworkWorkbook(e.id,wp.id,'Hybrid scope','Inspected physical and digital supporting documentation.','Both evidence modes support the conclusion.','Hybrid'),/stale/);
});

it('R14 statutory and AUP engagement letters produce distinct genuine DOCX outputs with shared terms', async () => {
  for(const template of ['ISA 210 External Statutory Audit','ISRS 4400 Agreed-Upon Procedures'] as const){
    const state=targetFixture(),e=state.engagements[0];(store as any).state=state;
    const commands=new TargetLifecycleCommands(()=>state,()=>{});act(state,'manager');commands.pinAcceptedProposal(e.id,e.proposalId!);store.saveAcceptanceCase(acceptance(state));
    act(state,'partner');store.decideAcceptanceCase('ACC-TARGET','Accepted','Current screening independently reviewed.');
    store.generateEngagementLetter(e.id,template,'IFRS',state.currentPerson,true);
    const content=e.engagementLetter!.content;assert.match(content,template.startsWith('ISA')?/OBJECTIVE AND SCOPE OF THE AUDIT/:/SCOPE OF AGREED-UPON PROCEDURES/);
    const blob=await createDOCXBlob('Engagement Letter',content.split('\n'));const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml=new TextDecoder().decode(zip['word/document.xml']);assert.match(xml,/50% final balance/);assert.match(xml,/SYNTHETIC DEMO SEAL/);
    if(template.startsWith('ISRS'))assert.ok(!content.includes('express an opinion under International Standards on Auditing'));
  }
});

it('A03 internal folders appear at risk acceptance before payment and external access', () => {
  const state=targetFixture(), e=state.engagements[0]; (store as any).state=state;
  act(state,'manager'); store.saveAcceptanceCase(acceptance(state));
  assert.equal(state.folders?.length,0);
  act(state,'partner'); store.decideAcceptanceCase('ACC-TARGET','Accepted','Independent screening evidence reviewed.');
  assert.equal(state.folders?.filter(f=>f.engagementId===e.id).length,5);
  assert.ok(e.auditLifecycle!.workspace);
  assert.equal(e.auditLifecycle!.workspace!.accessVerifiedAt,undefined);
  assert.equal(e.auditLifecycle!.advancePayments.length,0);
  assert.equal(e.auditLifecycle!.portalOnboarding,undefined);
});

it('R09 only independent Manager/Partner designation includes a complete finding and invalidates review', () => {
  const state=JSON.parse(readFileSync('tests/fixtures/current-partner-approval.json','utf8')),e=state.engagements.find((e:any)=>e.id===state.selectedEngagement);(store as any).state=state;
  state.findings.push({id:'ML',engagementId:e.id,title:'Control gap',condition:'Same person posts and approves',impact:'Unauthorized payment exposure',recommendation:'Independent approval',disposition:'Management agreed'});
  const before=reviewBasis(state,e);
  assert.ok(!managementLetterLines(state,e).some(l=>l.includes('Unauthorized')));
  act(state,'preparer');assert.throws(()=>store.designateManagementLetter('ML',true,'Client matter'),/Manager|Partner|role|permission/i);
  act(state,'manager');store.designateManagementLetter('ML',true,'Include independently evaluated control observation.');
  assert.ok(managementLetterLines(state,e).some(l=>l.includes('Unauthorized')));
  assert.notEqual(reviewBasis(state,e),before);
  store.designateManagementLetter('ML',false,'Withdraw pending discussion.');
  state.findings[0].impact='';assert.throws(()=>store.designateManagementLetter('ML',true,'Include'),/impact/);
});

it('R16 frozen snapshot shares stable reads, rejects mutation and invalidates on commands', () => {
  const state=targetFixture();(store as any).state=state;
  const first=store.getReadSnapshot();assert.equal(first,store.getReadSnapshot());
  assert.throws(()=>{first.engagements[0].period='changed';},TypeError);
  assert.equal(reviewBasis(first,first.engagements[0]),reviewBasis(state,state.engagements[0]));
  store.setRole('manager');const next=store.getReadSnapshot();assert.notEqual(first,next);assert.equal(next.currentRole,'manager');
  state.engagements[0].period='New period';assert.notEqual(reviewBasis(state,state.engagements[0]),reviewBasis(first,first.engagements[0]));
});

it('R14 brief PDF has 1–2 real pages; comprehensive content and team derive from recorded data', async () => {
  const state=targetFixture(),p=state.proposals[0];p.presentedSnapshot=undefined;p.proposalMode='Brief Quotation';
  const blob=await proposalPDF(state,p);const text=await blob.text();assert.match(text,/^%PDF/);assert.ok((text.match(/\/Type\s*\/Page\b/g)||[]).length<=2);
  p.items[0].scope='Extensive scope detail '.repeat(2000);await assert.rejects(()=>proposalPDF(state,p),/two pages/);
  p.proposalMode='Comprehensive Technical Proposal';p.firmHistory='Recorded firm history';p.industryExperience='Portfolio reference PORT-01';
  assert.ok(proposalOutputLines(state,p).some(l=>l.includes('PORT-01')));
  const e=state.engagements[0];e.auditLifecycle!.staffing.push({allocations:[{userId:'manager'}]} as any);
  const initial=proposalTeam(state,p);assert.ok(initial.includes(state.users.find(u=>u.id==='manager')!.name));
  e.auditLifecycle!.staffing[0].allocations=[{userId:'partner'}] as any;assert.notEqual(proposalTeam(state,p),initial);
});

it('R14 actual signature/seal PNG bytes become PDF image objects and remain labeled synthetic', async () => {
  const png='data:image/png;base64,'+Buffer.from(encode({width:1,height:1,data:new Uint8Array([0,0,0,255]),channels:4})).toString('base64');
  const pdf=await createPDFBlob('Illustration',['Recorded basis'],{signaturePng:png,sealPng:png}).text();
  assert.match(pdf,/\/Subtype \/Image/);assert.match(pdf,/no legal certification/);
  assert.throws(()=>createPDFBlob('Bad asset',[],{signaturePng:'data:image/png;base64,iVBORw0KGgoINVALID'}));
});
