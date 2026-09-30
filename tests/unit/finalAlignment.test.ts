import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { targetFixture } from '../helpers/targetFixture';
import { currentPartnerOpinion, partnerReportingBasis } from '../../src/services/targetLifecycle';
import { REQUIRED_CONFIRMATION_TYPES } from '../../src/types/targetLifecycle';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { prototypeStore } from '../../src/store/prototypeStore';
import { act, acceptance } from '../helpers/targetFixture';
import { CURRENT_ROUTE_CATALOG, ROUTE_CATALOG } from '../../src/services/routeCatalog';
import { RETIRED_ROUTE_REDIRECTS, resolveRouteHash } from '../../src/services/legacyRoutes';
import { DECK_SLIDES } from '../../src/components/clientRequirements/deckData';
import type { CurrentRouteKey, LegacyRouteId } from '../../src/types';

async function activatedFixture() {
  const state=targetFixture(),engagement=state.engagements[0];(prototypeStore as any).state=state;
  const commands=new TargetLifecycleCommands(()=>state,()=>{},async id=>({id,name:`${id}.pdf`,kind:'PDF',mimeType:'application/pdf',size:3,sha256:'a'.repeat(64)}));
  act(state,'manager');commands.pinAcceptedProposal(engagement.id,engagement.proposalId!);prototypeStore.saveAcceptanceCase(acceptance(state));
  act(state,'partner');prototypeStore.decideAcceptanceCase('ACC-TARGET','Accepted','Current acceptance evidence independently reviewed.');prototypeStore.generateEngagementLetter(engagement.id,'ISA 210 External Statutory Audit','IFRS',state.currentPerson,true);
  act(state,'billing');commands.recordAdvance(engagement.id,{amount:engagement.agreedFee/2,date:state.asOfDate,method:'Bank transfer',reference:'FINAL-ALIGN-ADV'});await commands.generateOfficialReceipt(engagement.id);
  act(state,'manager');return {state,engagement,commands};
}

function opinionFixture() {
  const state = targetFixture(), engagement = state.engagements[0];
  engagement.rows = [{ mappedStatementLine: 'Revenue' } as any];
  const actor = state.users.find(user => user.name === engagement.partner && user.role === 'partner')!;
  engagement.auditLifecycle!.opinions.push({ revision: 1, value: 'Clean', focusArea: '', basis: '', selectedByUserId: actor.id, selectedAt: new Date().toISOString(), reportingBasis: partnerReportingBasis(state, engagement) });
  return {state, engagement, opinion: engagement.auditLifecycle!.opinions[0]};
}
it('A6 current clean opinion resolves; missing and legacy unpinned opinions do not', () => {
  const {state,engagement,opinion} = opinionFixture();
  assert.equal(currentPartnerOpinion(state,engagement),opinion);
  delete opinion.reportingBasis; assert.equal(currentPartnerOpinion(state,engagement),undefined);
  engagement.auditLifecycle!.opinions=[]; assert.equal(currentPartnerOpinion(state,engagement),undefined);
});
it('A6 historical opinion cannot survive a new SRM reporting basis', () => {
  const {state,engagement,opinion}=opinionFixture();
  engagement.auditLifecycle!.srms.push({revision:2,artifact:{id:'NEW'} as any,basis:'new',actorUserId:'manager',at:'2026-10-01',notes:'New current review',summary:[]});
  assert.equal(currentPartnerOpinion(state,engagement),undefined); assert.equal(engagement.auditLifecycle!.opinions[0],opinion);
});
it('A6 modified opinion requires current mapped FSLI and meaningful rationale', () => {
  const {state,engagement,opinion}=opinionFixture(); opinion.value='Qualified';
  opinion.basis='A sufficiently detailed basis for the modified opinion.';
  assert.equal(currentPartnerOpinion(state,engagement),undefined);
  opinion.focusArea='Revenue'; opinion.basis='short'; assert.equal(currentPartnerOpinion(state,engagement),undefined);
  opinion.basis='Revenue evidence is incomplete for the material current balance.'; assert.equal(currentPartnerOpinion(state,engagement),opinion);
  opinion.focusArea='Historical FSLI'; assert.equal(currentPartnerOpinion(state,engagement),undefined);
});
it('A6 a different unassigned Partner cannot supply the reporting decision', () => {
  const {state,engagement,opinion}=opinionFixture();
  const assigned=state.users.find(user=>user.id===opinion.selectedByUserId)!;
  state.users.push({...assigned,id:'UNASSIGNED-PARTNER',personId:'OTHER-PERSON'});
  state.roleGrants.push({...state.roleGrants.find(grant=>grant.userId===assigned.id)!,id:'UNASSIGNED-GRANT',userId:'UNASSIGNED-PARTNER'});
  opinion.selectedByUserId='UNASSIGNED-PARTNER';
  assert.equal(currentPartnerOpinion(state,engagement),undefined);
});
it('C5 only the five source categories can be created; legacy types remain read-only', async () => {
  const {state,engagement,commands}=await activatedFixture();
  const input={counterparty:'Synthetic counterparty',relatedFsli:'Cash',ownerUserId:'manager',dueAt:state.asOfDate,critical:true,workpaperIds:[]};
  for(const type of REQUIRED_CONFIRMATION_TYPES)commands.createConfirmation(engagement.id,{...input,type});
  assert.deepEqual(state.confirmations!.map(record=>record.type),[...REQUIRED_CONFIRMATION_TYPES]);
  for(const type of ['Debtor','Other'])assert.throws(()=>commands.createConfirmation(engagement.id,{...input,type} as any),/valid due date, type/);
  const legacy={...state.confirmations![0],id:'LEGACY-DEBTOR',type:'Debtor' as const};state.confirmations!.push(legacy);
  assert.throws(()=>commands.transitionConfirmation(engagement.id,legacy.id,'Requested','Historical item read-only'),/Historical.*read-only/);
  assert.equal(legacy.type,'Debtor');assert.equal(legacy.status,'Draft');
});
it('B2 staff record scoped management correspondence; missing references and client writes fail atomically', async () => {
  const {state,engagement}=await activatedFixture();
  const journal={id:'J-RESPONSE',engagementId:engagement.id,status:'Technical review',reviewedBy:'Layla Rahman',preparedBy:'Adam Khan',revision:1} as any;
  state.adjustmentJournals=[journal];act(state,'manager');
  assert.throws(()=>prototypeStore.recordAdjustmentManagementResponse(journal.id,true,'Accepted correction','','Demo CFO'),/reference/);
  assert.equal(journal.status,'Technical review');
  act(state,'client_finance');assert.throws(()=>prototypeStore.recordAdjustmentManagementResponse(journal.id,true,'Accepted correction','CORR-1','Demo CFO'),/requires|Role/);
  act(state,'manager');prototypeStore.recordAdjustmentManagementResponse(journal.id,true,'Accepted correction','CORR-1','Demo CFO');
  assert.equal(journal.status,'Management accepted');assert.equal(journal.managementResponses[0].reference,'CORR-1');assert.equal(journal.managementResponses[0].recordedByUserId,'manager');assert.ok(journal.managementResponses[0].at);
});

const CURRENT_SECTIONS = [
  'Module 1 — Commercial & CRM',
  'Module 2 — Governance & Planning',
  'Module 3 — Technical Fieldwork',
  'Module 4 — Reporting & Archive',
  'Module 5 — Practice Management',
  'Client Portal',
  'Reference / Specification'
];

it('F current route catalog covers only the five-module surface; legacy entries are redirect metadata', () => {
  const currentKeys = Object.keys(CURRENT_ROUTE_CATALOG) as CurrentRouteKey[];
  assert.ok(currentKeys.length >= 30, 'the current catalogue covers the whole v2.1 surface');
  for (const key of currentKeys) {
    const info = CURRENT_ROUTE_CATALOG[key];
    assert.ok(CURRENT_SECTIONS.includes(info.section), `${key} sits in a current five-module section`);
    assert.doesNotMatch(info.moduleId, /^(LEGACY|MOD-)/, `${key} carries a current module identity`);
  }
  const legacyIds = Object.keys(RETIRED_ROUTE_REDIRECTS) as LegacyRouteId[];
  assert.equal(legacyIds.length, 18, 'the historical route ids stay enumerated');
  for (const id of legacyIds) {
    assert.ok(CURRENT_ROUTE_CATALOG[RETIRED_ROUTE_REDIRECTS[id]], `${id} redirects into a current route`);
    assert.equal(ROUTE_CATALOG[id].moduleId, 'LEGACY', `${id} no longer claims a product module`);
    assert.equal(ROUTE_CATALOG[id].section, 'Legacy Redirect', `${id} is marked as redirect metadata`);
  }
  const partition = new Set([...currentKeys, ...legacyIds]);
  for (const key of Object.keys(ROUTE_CATALOG)) assert.ok(partition.has(key), `${key} is either current or legacy`);
});

it('F old bookmarks still resolve through the retained redirect map', () => {
  const expectations = [
    ['#audit', 'reviews'], ['#m365-setup', 'documents'], ['#packages', 'delivery'],
    ['#accounting', 'trial-balance'], ['#jobs', 'scheduling'], ['#approvals', 'reviews']
  ] as const;
  for (const [hash, expected] of expectations) {
    const resolved = resolveRouteHash(hash);
    assert.ok(resolved && resolved.route === expected && resolved.redirected, `${hash} redirects to ${expected}`);
  }
  assert.equal(resolveRouteHash('#audit-fieldwork')?.redirected, false, 'current routes resolve directly');
});

it('H prohibited historical labels never appear in active navigation sources (§17)', () => {
  const prohibited = [
    /39 modules/i, /Accounting Workbench/, /Group Consolidation/, /M365 Setup/, /Microsoft 365 Setup/,
    /Firm Administration/, /Jobs & Tasks/, /Job Templates/, /Approvals Centre/
  ];
  const navSources = [
    join(process.cwd(), 'src/components/layout/Shell.tsx'),
    join(process.cwd(), 'src/services/routeCatalog.ts'),
    join(process.cwd(), 'src/services/guards.ts')
  ];
  for (const file of navSources) {
    const source = readFileSync(file, 'utf-8');
    for (const rx of prohibited) assert.doesNotMatch(source, rx, `${file} must not present historical modules as current navigation`);
  }
  for (const key of Object.keys(CURRENT_ROUTE_CATALOG) as CurrentRouteKey[]) {
    const text = `${CURRENT_ROUTE_CATALOG[key].section} ${CURRENT_ROUTE_CATALOG[key].label}`;
    for (const rx of prohibited) assert.doesNotMatch(text, rx, `catalog entry ${key} must not use a historical label`);
  }
});

it('J the requirements presentation covers the eleven states, four opinions and five confirmation types', () => {
  const deck = JSON.stringify(DECK_SLIDES);
  for (const state of [
    'LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING',
    'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE',
    'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY'
  ]) assert.ok(deck.includes(state), `the presentation must present ${state}`);
  for (const opinion of ['Unmodified', 'Qualified', 'Adverse', 'Disclaimer']) assert.ok(deck.includes(opinion), `the presentation must present the ${opinion} opinion`);
  for (const confirmation of [...REQUIRED_CONFIRMATION_TYPES]) assert.ok(deck.includes(confirmation), `the presentation must present the ${confirmation} confirmation type`);
});
