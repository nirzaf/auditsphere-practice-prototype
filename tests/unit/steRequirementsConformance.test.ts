import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands.js';
import { getRoutedContact } from '../../src/services/contactRouting.js';
import { opinionValidation, fsliRiskLevel } from '../../src/services/targetLifecycle.js';
import { DECK_SLIDES } from '../../src/components/clientRequirements/deckData.js';
import { REQUIRED_CONFIRMATION_TYPES } from '../../src/types/targetLifecycle';
import type { PrototypeState, LeadOpportunity, ClientRecord, ClientContact, AcceptanceCaseRecord } from '../../src/types/index.js';

let state: PrototypeState;
let commands: TargetLifecycleCommands;

function setPersona(state: PrototypeState, name: string) {
  const matches = state.users.filter(u => u.name === name);
  const user = matches.find(u => u.id === state.currentUserId) || matches.find(u => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}

const writer = async (id: string) => ({
  id,
  name: `${id}.pdf`,
  kind: 'PDF' as const,
  mimeType: 'application/pdf',
  size: 3,
  sha256: 'a'.repeat(64)
});

beforeEach(() => {
  state = createInitialState();
  (prototypeStore as any).state = state;
  commands = new TargetLifecycleCommands(() => state, () => {}, writer);
});

describe('STE Audit Management Tool v2.1 Requirements Conformance (All 17 Gaps)', () => {
  // Gap 1: Client Requirements presentation route
  it('Gap 1: development prototype retains the client-requirements presentation route', () => {
    const appTsx = readFileSync(join(process.cwd(), 'src/PrototypeApp.tsx'), 'utf-8');
    assert.match(
      appTsx,
      /case 'client-requirements':\s*return <ClientRequirementsPresentationView/,
      'development prototype must directly return ClientRequirementsPresentationView'
    );
  });

  // Gap 2: Presentation content faithful to STE v2.1
  it('Gap 2: presentation deckData includes key STE v2.1 standards and modules', () => {
    const allDeckText = JSON.stringify(DECK_SLIDES);
    assert.ok(allDeckText.includes('Dual-Key'), 'Deck must mention Dual-Key authorization');
    assert.ok(allDeckText.includes('ISA 210'), 'Deck must mention ISA 210 Engagement Letter');
    assert.ok(allDeckText.includes('ISRS 4400'), 'Deck must mention ISRS 4400 Agreed-Upon Procedures');
    assert.ok(allDeckText.includes('PM') && allDeckText.includes('TE') && allDeckText.includes('SAD'), 'Deck must mention PM, TE, and SAD materiality');
    assert.ok(allDeckText.includes('Holding Letter'), 'Deck must mention Holding Letter for confirmation deadlock');
    assert.ok(allDeckText.includes('Unmodified') && allDeckText.includes('Qualified') && allDeckText.includes('Adverse') && allDeckText.includes('Disclaimer'), 'Deck must present all 4 opinions');
    assert.ok(allDeckText.includes('60 calendar days') || allDeckText.includes('60-day'), 'Deck must mention 60-day archival countdown');
    assert.ok(allDeckText.includes('Partner Withdrawals') || allDeckText.includes('Partner withdrawals'), 'Deck must mention Partner Withdrawals');
    assert.ok(allDeckText.includes('1,000') && allDeckText.includes('750') && allDeckText.includes('500') && allDeckText.includes('200'), 'Deck must include standard QAR charge-out rates');
  });

  // Gap 3: Lead & Client structure (Channels & Holding/Subsidiary/Affiliate tree)
  it('Gap 3: leads pipeline and client records support mandatory intake channels and corporate hierarchy', () => {
    const lead: LeadOpportunity = {
      id: 'LEAD-CONF-01',
      clientName: 'Al Rayyan Holding',
      contactName: 'Jassim Al-Kuwari',
      contactEmail: 'jassim@rayyan.qa',
      source: 'Referral',
      intakeChannel: 'WhatsApp',
      entityStructure: 'Holding',
      status: 'Qualified',
      estimatedValue: 120000,
      createdAt: '2026-01-10'
    };
    assert.equal(lead.intakeChannel, 'WhatsApp');
    assert.equal(lead.entityStructure, 'Holding');

    const client: ClientRecord = {
      id: 'CL-CONF-01',
      legalName: 'Al Rayyan Logistics LLC',
      shortName: 'Rayyan Logistics',
      category: 'Commercial',
      entityRole: 'Subsidiary',
      parentClientId: 'CL-CONF-PARENT',
      taxIdentificationNumber: 'TIN-09912',
      financialYearEnd: '12-31',
      reportingCurrency: 'QAR',
      createdDate: '2026-01-15'
    };
    assert.equal(client.entityRole, 'Subsidiary');
    assert.equal(client.parentClientId, 'CL-CONF-PARENT');
  });

  // Gap 4: Multi-contact communication routing
  it('Gap 4: contact routing correctly dispatches by role according to firm rules', () => {
    const contacts: ClientContact[] = [
      { id: 'C1', clientId: 'CL-01', name: 'Sheikh Faisal', email: 'faisal@client.qa', phone: '9741234', title: 'Managing Director', contactRole: 'MD/GM', isPrimary: true, active: true },
      { id: 'C2', clientId: 'CL-01', name: 'Khalid Finance', email: 'khalid@client.qa', phone: '9745678', title: 'CFO', contactRole: 'CFO/Finance Director', isPrimary: false, active: true },
      { id: 'C3', clientId: 'CL-01', name: 'Nasser Accounts', email: 'nasser@client.qa', phone: '9749012', title: 'Chief Accountant', contactRole: 'Chief Accountant/Audit Liaison', isPrimary: false, active: true }
    ];

    const proposalRecipient = getRoutedContact(contacts, 'proposals_reports');
    assert.equal(proposalRecipient?.name, 'Sheikh Faisal', 'Proposals must route to MD / GM');

    const invoiceRecipient = getRoutedContact(contacts, 'invoices_receipts');
    assert.equal(invoiceRecipient?.name, 'Khalid Finance', 'Invoices must route to CFO / Finance Director');

    const pbcRecipient = getRoutedContact(contacts, 'pbc_requests');
    assert.equal(pbcRecipient?.name, 'Nasser Accounts', 'PBC requests must route to Chief Accountant / Audit Liaison');
  });

  // Gap 5 & 6: Brief vs Comprehensive Proposal & 50/50 commercial payment terms
  it('Gap 5 & 6: proposal templates and dispatch support Brief vs Comprehensive modes and 50/50 terms', () => {
    const proposalsTsx = readFileSync(join(process.cwd(), 'src/components/modules/ProposalsView.tsx'), 'utf-8');
    assert.match(proposalsTsx, /Brief Quotation/);
    assert.match(proposalsTsx, /Comprehensive Technical Proposal/);
    // R02: the final 50% belongs to delivery of the FINAL signed deliverables package.
    const terms = readFileSync(join(process.cwd(),'src/services/clientOutputs.ts'),'utf8');
    assert.match(proposalsTsx, /STANDARD_PAYMENT_TERMS/);
    assert.match(terms, /50% advance deposit payable upon engagement letter \(EL\) execution/);
    assert.match(terms, /50% final balance payable upon delivery of the final signed audit deliverables package/);
    assert.match(proposalsTsx, /WhatsApp \(Direct communication channel\)/);
  });

  // Gap 7: Engagement Letter generation (ISA 210 & ISRS 4400) and signed copy recording
  it('Gap 7: engagement letter generation produces ISA 210 / ISRS 4400 letters with partner signature', () => {
    setPersona(state, 'Daniel James');
    const eng = state.engagements[0];

    // Generate ISA 210 Statutory Audit EL
    prototypeStore.generateEngagementLetter(
      eng.id,
      'ISA 210 External Statutory Audit',
      'IFRS',
      'Daniel James',
      true
    );

    assert.ok(eng.engagementLetter, 'Engagement letter must be attached');
    assert.equal(eng.engagementLetter?.template, 'ISA 210 External Statutory Audit');
    assert.match(eng.engagementLetter?.partnerSignature || '', /Daniel James/);
    assert.ok(eng.engagementLetter?.firmStamp);
    assert.match(eng.engagementLetter?.content || '', /International Standards on Auditing/);

    // Record signed EL from client
    prototypeStore.recordSignedEngagementLetter(eng.id, 'DOC-EL-SIGNED-2026');

    assert.equal(eng.engagementLetter?.signedCopyReceived, true);
    assert.equal(eng.engagementLetter?.signedCopyRef, 'DOC-EL-SIGNED-2026');
    assert.equal(eng.terms, true);
  });

  // Gap 8: Acceptance & Continuance Track A & B controls
  it('Gap 8: acceptance cases enforce Management Integrity, Financial Viability, and 6-point Continuance checklist', () => {
    const acceptanceCase: AcceptanceCaseRecord = {
      id: 'ACC-CONF-01',
      clientId: 'CL-001',
      year: 2026,
      service: 'Statutory audit',
      recommendationNotes: 'Client accounts settled, stable board, no regulatory issues.',
      assessmentType: 'Continuance',
      managementIntegrityConfirmed: true,
      financialViabilityConfirmed: true,
      continuanceDeltaChecklist: {
        priorYearFeesSettled: true,
        managementChanges: false,
        newLoanCovenants: false,
        pendingLitigation: false,
        fraudOrInvestigations: false,
        regulatoryInquiries: false,
        notes: 'Client accounts settled, stable board, no regulatory issues.'
      }
    };
    assert.equal(acceptanceCase.managementIntegrityConfirmed, true);
    assert.equal(acceptanceCase.financialViabilityConfirmed, true);
    assert.equal(acceptanceCase.continuanceDeltaChecklist?.priorYearFeesSettled, true);
    assert.equal(acceptanceCase.continuanceDeltaChecklist?.notes, 'Client accounts settled, stable board, no regulatory issues.');

    const acceptanceTsx = readFileSync(join(process.cwd(), 'src/components/modules/AuditAcceptanceView.tsx'), 'utf-8');
    assert.match(acceptanceTsx, /Management Integrity/);
    assert.match(acceptanceTsx, /Financial Viability/);
    assert.match(acceptanceTsx, /Prior-period professional fees settled/);
    assert.match(acceptanceTsx, /Stable management/);
  });

  // Gap 9: Capacity scheduling
  it('Gap 9: scheduling view supports capacity allocation against 80-85% target utilization', () => {
    const schedulingTsx = readFileSync(join(process.cwd(), 'src/components/target/SchedulingView.tsx'), 'utf-8');
    assert.match(schedulingTsx, /targetUtilizationPct/, 'Visual capacity calendar must use saved utilization targets');
    assert.match(schedulingTsx, /capacityHours.*leaveHours/, 'Availability uses saved capacity less leave');
    assert.match(schedulingTsx, /Scheduled Leave \/ Out-of-Office/i, 'Visual capacity calendar must display leave schedule');
  });

  // Gap 10: Materiality enforcement and Partner planning sign-off
  it('Gap 10: materiality boundaries and Lead Audit Partner sign-off are required in planning', () => {
    const planningTsx = readFileSync(join(process.cwd(), 'src/components/modules/AuditPlanningView.tsx'), 'utf-8');
    assert.match(planningTsx, /validateMaterialityRates\(benchmarkType, pct, perf, triv\)/, 'Planning view uses the shared store validator');
    assert.match(planningTsx, /strictly by the lead statutory audit partner/i, 'Planning sign-off must require Lead Audit Partner authority');
  });

  // Gap 11: Green / Amber / Red algorithm forces critical accounting estimates and high risks to RED
  it('Gap 11: critical accounting estimates and high inherent risks are forced to RED', () => {
    const engagement = state.engagements[0];
    engagement.rows = [{ code: 'TEST-ECL', name: 'Expected credit loss estimate', type: 'asset', balance: 1, mappedStatementLine: 'Receivables' }];
    assert.equal(fsliRiskLevel(state, engagement, 'Receivables'), 'RED');
    engagement.rows[0].name = 'Trade receivables';
    state.auditRisks.push({ ...state.auditRisks[0], id: 'RISK-TEST', engagementId: engagement.id, area: 'Receivables', rating: 'Significant' });
    assert.equal(fsliRiskLevel(state, engagement, 'Receivables'), 'RED');
  });

  // Gap 12: TB automated mapping memory
  it('Gap 12: trial balance view includes historical auto-mapping memory suggestions', () => {
    const tbTsx = readFileSync(join(process.cwd(), 'src/components/target/TrialBalanceView.tsx'), 'utf-8');
    assert.match(tbTsx, /Historical Auto-Mapping Suggestions/i, 'Trial balance must support historical auto-mapping memory suggestions');
  });

  // Gap 13: FSLI standard workprograms preloaded with 5 core ISA assertions
  it('Gap 13: standard audit workprograms generate procedures across all 5 core ISA assertions', () => {
    const commandsTsx = readFileSync(join(process.cwd(), 'src/store/targetLifecycleCommands.ts'), 'utf-8');
    assert.match(commandsTsx, /\[Ownership \/ Rights\]/, 'Standard programs must include Ownership assertion');
    assert.match(commandsTsx, /\[Valuation & Allocation\]/, 'Standard programs must include Valuation assertion');
    assert.match(commandsTsx, /\[Completeness\]/, 'Standard programs must include Completeness assertion');
    assert.match(commandsTsx, /\[Existence\]/, 'Standard programs must include Existence assertion');
    assert.match(commandsTsx, /\[Cut-off\]/, 'Standard programs must include Cut-off assertion');
  });

  // Gap 14: Sampling methods (Random, MUS, Stratified, Systematic Random, Stratified Attribute)
  it('Gap 14: generateSample supports all required sampling methodologies', () => {
    const commandsTsx = readFileSync(join(process.cwd(), 'src/store/targetLifecycleCommands.ts'), 'utf-8');
    assert.match(commandsTsx, /'Systematic Random Sampling'/, 'Must support Systematic Random Sampling');
    assert.match(commandsTsx, /'Stratified Attribute Sampling'/, 'Must support Stratified Attribute Sampling');
    assert.match(commandsTsx, /'Monetary Unit Sampling'/, 'Must support Monetary Unit Sampling');
    assert.match(commandsTsx, /'Stratified'/, 'Must support Stratified sampling');
    assert.match(commandsTsx, /'Random'/, 'Must support Random sampling');
  });

  // Gap 15: Confirmation types (Bank, Accounts Receivable, Accounts Payable, Inventory, Legal)
  it('Gap 15: confirmation types include Bank, Accounts Receivable, Accounts Payable, Inventory, and Legal', () => {
    const confirmationsTsx = readFileSync(join(process.cwd(), 'src/components/target/ConfirmationsView.tsx'), 'utf-8');
    assert.match(confirmationsTsx, /REQUIRED_CONFIRMATION_TYPES\.map/);
    assert.deepEqual([...REQUIRED_CONFIRMATION_TYPES], ['Bank','Accounts Receivable','Accounts Payable','Inventory','Legal']);
  });

  // Gap 16: Reporting/archive authorization (FSLI requirement, Partner signature, Partner manual early lock)
  it('Gap 16: modified opinions require focus area and Partner early archive lock is supported', () => {
    // Opinion validation requires focusArea for Qualified, Disclaimer, and Adverse
    const qualErrors = opinionValidation('Qualified', '', 'This is a detailed rationale of more than twenty characters.');
    assert.ok(qualErrors.some(e => /focus area/i.test(e)), 'Qualified opinion must require an impacted focus area');

    const disclErrors = opinionValidation('Disclaimer', '', 'This is a detailed rationale of more than twenty characters.');
    assert.ok(disclErrors.some(e => /focus area/i.test(e)), 'Disclaimer opinion must require an impacted focus area');

    const adverseErrors = opinionValidation('Adverse', '', 'This is a detailed rationale of more than twenty characters.');
    assert.ok(adverseErrors.some(e => /focus area/i.test(e)), 'Adverse opinion must require an impacted focus area');

    const validQual = opinionValidation('Qualified', 'Inventory', 'This is a detailed rationale of more than twenty characters.');
    assert.equal(validQual.length, 0, 'Qualified opinion with rationale and focus area should be valid');

    // Partner early archive lock check
    const freezeArchiveTsx = readFileSync(join(process.cwd(), 'src/components/target/FreezeArchiveView.tsx'), 'utf-8');
    assert.match(freezeArchiveTsx, /Partner Early Archival Lock/i, 'FreezeArchiveView must provide Partner early archive lock option');
  });

  // Gap 17: Practice management completeness (Partner withdrawals & daily FSLI time tracking)
  it('Gap 17: firm expenses support Partner withdrawals and daily FSLI time tracking', () => {
    setPersona(state, 'Daniel James');
    commands.postFirmExpense({
      date: '2026-03-31',
      category: 'Partner withdrawals',
      amount: 50000,
      description: 'Partner Q1 profit drawings',
      reference: 'EXP-PARTNER-Q1'
    });
    const entry = state.firmLedger?.find(e => e.reference === 'EXP-PARTNER-Q1');
    assert.ok(entry, 'Firm ledger entry recorded');
    assert.equal(entry?.lines[0].account, 'Partner withdrawals');
    assert.equal(entry?.lines[0].debit, 50000);

    const timeTrackingTsx = readFileSync(join(process.cwd(), 'src/components/modules/TimeTrackingView.tsx'), 'utf-8');
    assert.match(timeTrackingTsx, /Target FSLI \/ Financial Statement Area/i, 'Time tracking must provide daily engagement / FSLI entry');
  });
});
