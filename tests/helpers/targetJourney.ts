import { migratePersistedState } from '../../src/services/migrations';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { createInitialState } from '../../src/store/initialState';
import { acceptance } from './targetFixture';
import {
  artifactSha256,
  loadVerifiedArtifact,
  persistArtifact
} from '../../src/services/artifactStore';
import {
  currentReview,
  engagementProgress,
  plusDays,
  targetReleaseBlockers
} from '../../src/services/targetLifecycle';
import { calculateBalanceSheet, calculateIncomeStatement } from '../../src/services/calculations';
export async function runTargetJourney() {
  const baseline = createInitialState();
  store.loadScenario('target-lifecycle');
  let s = (store as any).state as ReturnType<typeof store.getSnapshot>; // Read current records; all journey writes use store commands.
  const checkpoints: string[] = [];
  const mark = (name: string) => checkpoints.push(name);
  const act = (id: string) => store.setPersona(id);
  const route = async (name: string) => {
    location.hash = name;
    await new Promise((r) => setTimeout(r, 60));
    if (
      document.querySelector('[role="alert"]')?.textContent?.includes('outside your access scope')
    )
      throw Error(`Route unavailable: ${name}`);
  };
  const expectBlocked = (fn: () => unknown, pattern: RegExp) => {
    try {
      fn();
    } catch (error) {
      if (pattern.test(String(error))) return;
      throw error;
    }
    throw Error(`Expected guard ${pattern}`);
  };
  act('relationship');
  const lead = {
    ...baseline.leads[0],
    id: 'LEAD-TARGET',
    name: 'Synthetic Target Audit Ltd',
    contact: 'Rami Nasser',
    email: 'rami@example.demo',
    stage: 'Won' as const,
    owner: s.currentPerson,
    value: 1000,
    convertedClientId: undefined
  };
  store.addLead(lead);
  const client = store.convertLead(lead.id)!;
  mark('Lead created and won; client prospect created');
  store.addContact({
    ...baseline.contacts.find((c) => c.name === 'Rami Nasser')!,
    id: 'CONTACT-TARGET',
    clientId: client.id,
    name: 'Rami Nasser',
    active: true
  });
  const item = {
    ...baseline.proposals[0].items[0],
    id: 'ITEM-TARGET',
    rate: 1000,
    amount: 1000,
    serviceRevision: undefined
  };
  const proposal = {
    ...baseline.proposals[0],
    id: 'PROP-TARGET',
    leadId: lead.id,
    clientId: client.id,
    revision: 1,
    preparedBy: s.currentPerson,
    preparedAt: s.asOfDate,
    state: 'Draft' as const,
    totalAmount: 1000,
    items: [item],
    commercialReview: undefined,
    clientResponse: undefined,
    presentedSnapshot: undefined
  };
  store.addProposal(proposal);
  act('manager');
  store.reviewProposal(proposal.id, true, 'Scope and fee reviewed independently.');
  act('relationship');
  store.presentProposal(proposal.id);
  store.recordProposalResponse(proposal.id, {
    responseType: 'Accepted',
    contact: 'Rami Nasser',
    date: s.asOfDate,
    method: 'Email',
    notes: 'Synthetic client accepted the Proposal and EL.',
    evidenceRef: 'CLIENT-EL-ACCEPTANCE'
  });
  mark('Proposal / EL accepted with current revision and evidence');
  act('manager');
  const original = baseline.engagements[0];
  const e = store.addEngagement({
    ...original,
    id: 'ENG-TARGET',
    client: client.id,
    proposalId: proposal.id,
    agreedFee: 1000,
    stage: 'Draft',
    generation: 0,
    sourceVersion: 0,
    rows: [],
    sourceHistory: [],
    workpapers: [],
    reviews: [],
    pbc: [],
    events: [],
    releases: [],
    archive: null,
    acceptance: false,
    terms: true,
    planning: false,
    sourceAccepted: false,
    mappingApproved: false,
    eqrRequired: false,
    lifecycleStatus: 'Active',
    approvals: { manager: null, partner: null, client: null, eqr: null },
    candidate: null,
    professionalAcceptance: undefined
  });
  store.lifecycle.pinAcceptedProposal(e.id, proposal.id);
  // Spec Flow 1 order: Dual-Key Gate (Key 1 accepted proposal + Key 2 Partner clearance)
  // precedes EL pin and 50% advance. Record the acceptance decision first so the
  // advance command's Key-2 check passes; the Declined negative path is exercised right after.
  act('manager');
  store.saveAcceptanceCase({
    ...acceptance(s),
    id: 'ACC-TARGET',
    engagementId: e.id,
    clientId: e.client,
    service: e.service,
    year: e.year
  } as any);
  act('partner');
  store.decideAcceptanceCase(
    'ACC-TARGET',
    'Accepted',
    'Independent Partner acceptance based on complete screening evidence.'
  );
  act('billing');
  store.lifecycle.recordAdvance(e.id, {
    amount: 500,
    date: s.asOfDate,
    method: 'Bank transfer',
    reference: 'ADV-TARGET'
  });
  await store.lifecycle.generateOfficialReceipt(e.id);
  mark('Dual-Key cleared, then 50% advance recorded and genuine receipt PDF persisted');
  // Negative path: a declined mandate blocks workspace provisioning even with an advance on file.
  act('partner');
  store.decideAcceptanceCase(
    'ACC-TARGET',
    'Declined',
    'Synthetic negative test: decline this mandate.'
  );
  expectBlocked(() => store.prepareClientWorkspace(client.id, e.year, e.id), /declined/);
  store.decideAcceptanceCase(
    'ACC-TARGET',
    'Accepted',
    'Independent Partner acceptance based on complete screening evidence.'
  );
  mark('Declined gate exercised, then Partner accepted independent recommendation');
  act('admin');
  store.grantAccess(
    'client_admin',
    'client_admin',
    'Engagement',
    e.id,
    'Authorized synthetic client administrator',
    { requestRef: 'REQ-CLIENT-ADMIN', approvalEvidenceRef: 'APPROVAL-CLIENT-ADMIN' }
  );
  store.grantAccess(
    'client_finance',
    'client_finance',
    'Engagement',
    e.id,
    'Authorized synthetic PBC contributor',
    { requestRef: 'REQ-CLIENT-FINANCE' }
  );
  store.simulateM365Verification('sharepoint', 'success');
  store.prepareClientWorkspace(e.client, e.year, e.id);
  store.lifecycle.verifyWorkspaceAccess(
    e.id,
    'Five folders and selected engagement-scoped client access checked.'
  );
  mark('M365 five-folder workspace prepared and simulated access verified');
  act('manager');
  store.addPbcRequest(e.id, {
    id: 'PBC-TARGET',
    title: 'Audit supporting evidence',
    category: 'Audit evidence',
    owner: s.currentPerson,
    contributor: 'Rami Nasser',
    due: s.asOfDate,
    status: 'Draft',
    version: 1,
    description: 'Upload synthetic evidence for current audit.'
  });
  store.presentPbcRequest(e.id, 'PBC-TARGET');
  act('client_admin');
  store.lifecycle.simulatePasswordChange();
  store.lifecycle.delegatePortal(e.id, 'client_finance');
  act('client_finance');
  store.lifecycle.simulatePasswordChange();
  await route('portal');
  const file = new Blob(
      [
        'Synthetic evidence: cash, revenue, purchases, fixed assets, going concern and analytical review.'
      ],
      { type: 'text/plain' }
    ),
    doc = {
      id: 'DOC-PBC-TARGET',
      name: 'audit-evidence.txt',
      kind: 'PBC',
      mimeType: file.type,
      size: file.size,
      sha256: await artifactSha256(file)
    };
  await persistArtifact(doc, file);
  store.uploadPbcResponse(e.id, 'PBC-TARGET', {
    id: doc.id,
    name: doc.name,
    size: doc.size,
    sha256: doc.sha256,
    type: doc.mimeType
  });
  act('manager');
  store.acceptPbcResponse(e.id, 'PBC-TARGET');
  mark('PBC requested; scoped client uploads bytes; Manager accepts evidence');
  const plan = (version: number) =>
    ({
      id: `PLAN-TARGET-${version}`,
      engagementId: e.id,
      version,
      status: 'Under review',
      benchmark: 'Revenue',
      benchmarkValue: 1000,
      materialityRate: 2,
      performanceMaterialityRate: 75,
      clearlyTrivialRate: 5,
      overallMateriality: 20,
      performanceMateriality: 15,
      clearlyTrivialThreshold: 1,
      rationales: ['Synthetic revenue benchmark rationale'],
      teamAllocations: [
        {
          person: 'Adam Khan',
          role: 'Preparer',
          scheduledStart: s.asOfDate,
          scheduledEnd: s.asOfDate
        }
      ],
      preparedBy: s.currentPerson
    }) as any;
  act('preparer');
  store.saveAuditPlan(plan(1));
  act('partner');
  store.reviewAuditPlan('PLAN-TARGET-1', true, 'Independent initial planning review.');
  act('manager');
  store.lifecycle.saveStaffing(
    e.id,
    [
      { role: 'Partner', userId: 'partner' },
      { role: 'Manager', userId: 'manager' },
      { role: 'Senior/Reviewer', userId: 'reviewer' },
      { role: 'Preparer/Staff', userId: 'preparer' }
    ].map((a) => ({
      ...a,
      phase: 'Fieldwork',
      plannedHours: 10,
      chargeRate: 100,
      costRate: 50,
      startDate: s.asOfDate,
      endDate: s.asOfDate
    })) as any,
    'Initial team and budget'
  );
  mark('Planning PM/TE/SAD and four-role staffing/rates completed');
  act('preparer');
  const rows = [
    { code: '1000', name: 'Cash', type: 'asset', balance: 1500 },
    { code: '3000', name: 'Capital', type: 'equity', balance: -1000 },
    { code: '4000', name: 'Revenue', type: 'revenue', balance: -1000 },
    { code: '5000', name: 'Purchases', type: 'expense', balance: 500 }
  ] as any;
  const source = new Blob([
    'Code,Name,Type,Balance\n1000,Cash,asset,1500\n3000,Capital,equity,-1000\n4000,Revenue,revenue,-1000\n5000,Purchases,expense,500'
  ]);
  store.lifecycle.importMappedTB(e.id, rows, {
    fileName: 'target-tb.csv',
    format: 'CSV',
    sha256: await artifactSha256(source)
  });
  store.lifecycle.confirmMapping(
    e.id,
    rows.map((r: any) => ({ code: r.code, line: r.name }))
  );
  act('manager');
  expectBlocked(() => store.lifecycle.prepareStandardPrograms(e.id), /PM|planning|Approve/);
  act('preparer');
  store.saveAuditPlan(plan(2));
  act('partner');
  store.reviewAuditPlan('PLAN-TARGET-2', true, 'Fresh PM/TE/SAD review against uploaded TB.');
  mark('TB uploaded / mapped; preliminary planning explicitly reconfirmed');
  const income = calculateIncomeStatement(e.rows),
    balance = calculateBalanceSheet(e.rows);
  if (
    income.netProfit !== 500 ||
    Math.abs(balance.totalAssets - balance.totalLiabilities - balance.totalEquity) > 0.005
  )
    throw Error('Financial statements do not reconcile.');
  await route('financial-statements');
  if (!document.querySelector('[data-testid="target-fsli"]'))
    throw Error('FSLI drill-down missing');
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Generate current P&L'))
    ?.click();
  await new Promise((r) => setTimeout(r, 50));
  if (!s.statementSetRevisions?.length) throw Error('Statement snapshot was not generated.');
  mark('P&L / BS generated with reconciled totals and FSLI drill-down rendered');
  store.lifecycle.prepareStandardPrograms(e.id);
  act('preparer');
  const wp = e.workpapers[0],
    evidence = s.evidenceCatalogue.find((i) => i.documentId === doc.id)!;
  store.linkWorkpaperEvidence(e.id, wp.id, doc.id);
  store.signOffAnalyticalReview(e.id, { fsli: 'Revenue', tbSourceVersion: e.sourceVersion,
    mappingRevision: s.accountMappingRevisions?.filter(m => m.engagementId === e.id).at(-1)?.revision,
    planVersion: 2, currentBalance: 1000, priorBalance: 900, varianceAmount: 100, variancePct: 100/900*100,
    analysis: 'Corroborated revenue fluctuation against client evidence and current-period activity.',
    isa570Checklist: { operatingCashFlows: true, debtCovenantsCompliant: true, workingCapitalAdequate: true, noMaterialDisruptions: true, conclusion: 'Twelve-month cash forecast and financing corroborated with the current evidence.' } });

  for (const program of s.auditPrograms.filter((p) => p.engagementId === e.id)) {
    for (const procedure of program.procedures) {
      store.linkEvidenceProcedure(evidence.id, procedure.id);
      store.updateAuditProcedureExecution(
        e.id,
        procedure.id,
        `Performed documented tests in ${program.area} against accepted evidence.`,
        `No exceptions; ${program.area} conclusion supported.`,
        ''
      );
      store.updateAuditProcedureStatus(
        e.id,
        procedure.id,
        'Submitted',
        'Preparer assessment completed.'
      );
    }
  }
  act('manager');
  for (const program of s.auditPrograms.filter((p) => p.engagementId === e.id))
    for (const proc of program.procedures)
      store.updateAuditProcedureStatus(
        e.id,
        proc.id,
        'Cleared',
        'Independent review of documented tests and conclusion.'
      );
  mark('Six fieldwork programs completed and independently cleared');
  act('preparer');
  const populationRows = [500, 500, 500].map(
    (amount, index) =>
      ({
        id: `ROW-${index}`,
        itemRef: `CASH-${index}`,
        date: '2026-09-01',
        counterparty: 'Synthetic cash counterparty',
        amount,
        tested: false,
        result: 'Untested'
      }) as any
  );
  const pop = store.lifecycle.importPopulation(
    e.id,
    '1000',
    'population.csv',
    'a'.repeat(64),
    populationRows
  );
  store.lifecycle.generateSample(e.id, pop, 'Random', 2, 260930);
  const population = s.samplePopulations.find((p) => p.id === pop)!;
  for (const item of population.items.filter((i) => i.selected)) {
    store.recordSampleItemTest(
      pop,
      item.id,
      item.amount,
      'Compared source evidence with recorded amount; satisfactory.'
    );
    store.lifecycle.attachPhysicalReference(e.id, wp.id, pop, item.id, {
      indexCode: 'X-1',
      box: 'BOX-01',
      description: 'Original cash support indexed in physical audit file.'
    });
  }
  mark('Reproducible sample generated, tested and linked to X-1 / BOX-01');
  const confirmation = store.lifecycle.createConfirmation(e.id, {
    type: 'Bank',
    counterparty: 'Synthetic Bank',
    relatedFsli: 'Cash',
    ownerUserId: 'preparer',
    dueAt: s.asOfDate,
    critical: true,
    workpaperIds: [wp.id]
  });
  store.lifecycle.transitionConfirmation(
    e.id,
    confirmation,
    'Requested',
    'Synthetic bank request recorded.'
  );
  store.lifecycle.transitionConfirmation(e.id, confirmation, 'Awaiting', 'Awaiting bank response.');
  store.lifecycle.transitionConfirmation(
    e.id,
    confirmation,
    'Received',
    'Synthetic response received.',
    [doc.id]
  );
  act('manager');
  store.lifecycle.transitionConfirmation(
    e.id,
    confirmation,
    'Reviewed',
    'Independently assessed bank response.'
  );
  store.lifecycle.transitionConfirmation(
    e.id,
    confirmation,
    'Cleared',
    'Bank response reconciled and independently cleared.'
  );
  mark('Critical bank confirmation tracked through independent clearance');
  act('preparer');
  await store.lifecycle.saveFieldworkWorkbook(
    e.id,
    wp.id,
    e.period,
    'Completed all six program areas and reconciled selected samples.',
    'No unresolved exceptions; conclusions supported by accepted evidence.'
  );
  store.submitWorkpaper(e.id, wp.id);
  act('manager');
  store.addReviewNote(e.id, {
    id: 'RN-TARGET',
    wp: wp.id,
    title: 'Clarify sample conclusion',
    body: 'Explain the sampled cash control total.',
    severity: 'Medium',
    status: 'Open',
    raisedBy: s.currentPerson,
    assigned: wp.preparer,
    due: s.asOfDate,
    response: '',
    version: 1,
    history: []
  } as any);
  expectBlocked(() => store.clearReviewNote(e.id, 'RN-TARGET'), /response/);
  act('preparer');
  await store.lifecycle.saveFieldworkWorkbook(
    e.id,
    wp.id,
    e.period,
    'Completed all six areas; cash samples reconcile to 1500 control total.',
    'No exceptions, cash population tested and physical index X-1 verified.'
  );
  store.respondReviewNote(
    e.id,
    'RN-TARGET',
    'Revised workbook documents reconciliation to the 1500 cash control total.'
  );
  store.submitWorkpaper(e.id, wp.id);
  act('manager');
  store.clearReviewNote(e.id, 'RN-TARGET');
  store.clearWorkpaper(
    e.id,
    wp.id,
    'Current revised workbook and point response independently assessed.'
  );
  store.lifecycle.recordManagerClearance(
    e.id,
    'All workpapers, procedures and review points cleared for SRM.'
  );
  await store.lifecycle.generateSRM(
    e.id,
    'Recommend clean opinion; all six areas, samples and confirmations cleared.'
  );
  const reloaded = migratePersistedState(structuredClone(s), createInitialState()).state;
  if (!currentReview(reloaded, reloaded.engagements[0]).srm)
    throw Error('Current SRM became stale during reload normalization.');
  mark('Preparer ready → Manager return → revision → Manager clearance → genuine SRM');
  act('partner');
  store.lifecycle.clearPartner(
    e.id,
    'Current SRM and source basis independently assessed and cleared.'
  );
  expectBlocked(() => store.lifecycle.selectOpinion(e.id, 'Qualified', '', 'short'), /focus|basis/);
  store.lifecycle.selectOpinion(e.id, 'Clean', '', '');
  await store.lifecycle.generateDeliverables(e.id, s.asOfDate);
  store.lifecycle.markDeliverablesDelivered(
    e.id,
    'Synthetic delivery to client recorded; no transmission.'
  );
  mark('Partner clearance, explicit Clean opinion and genuine ML/LOR/Audit Report PDFs');
  act('billing');
  await store.lifecycle.generateBalanceInvoice(e.id);
  mark('Final 50% invoice generated from accepted fee less recognized advance');
  act('records');
  await store.lifecycle.simulateFreeze(e.id, plusDays(s.asOfDate, 59));
  if (e.auditLifecycle!.archiveControl.freezeStatus === 'Frozen') throw Error('Premature freeze');
  await store.lifecycle.simulateFreeze(
    e.id,
    plusDays(e.auditLifecycle!.archiveControl.finalReportDate!, 60)
  );
  mark('59-day negative and 60-day freeze, actual archive copies retained');
  act('superuser');
  expectBlocked(() => store.lifecycle.confirmMapping(e.id, []), /frozen|read-only/);
  await route('records');
  if (!document.querySelector('main')?.textContent?.includes('Frozen'))
    throw Error('Read-only archive not rendered');
  for (const item of [
    e.auditLifecycle!.receiptDocuments[0].artifact,
    wp.generatedArtifact!,
    e.auditLifecycle!.srms[0].artifact,
    ...e.auditLifecycle!.deliverables[0].artifacts,
    e.auditLifecycle!.balanceInvoices[0].artifact,
    ...e.archive!.artifacts!
  ]) {
    const blob = await loadVerifiedArtifact(item);
    if (blob.size !== item.size) throw Error(`Artifact invalid: ${item.name}`);
  }
  act('billing');
  store.lifecycle.postFirmExpense({
    date: s.asOfDate,
    category: 'Office rent',
    amount: 100,
    description: 'Synthetic office rent',
    reference: 'RENT-TARGET'
  });
  await route('reports');
  await route('practice-ledger');
  mark('Practice analytics and separate balanced firm ledger rendered');
  return {
    checkpoints,
    engagementId: e.id,
    archive: e.archive,
    progress: engagementProgress(s, e).map((x) => ({ id: x.id, status: x.status })),
    artifacts: e.auditLifecycle!.deliverables[0].artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      sha256: a.sha256
    })),
    review: currentReview(s, e),
    blockers: targetReleaseBlockers(s, e)
  };
}
