/**
 * Database Seeder for STE Audit Management Tool.
 * Realistic Qatari corporate group: Al Rayyan Global Holdings Q.P.S.C. & Doha Pearl Contracting W.L.L.
 * Encompasses full 11-stage lifecycle data, RBAC personas, FSLIs, workprograms, review notes, confirmations, and practice ledger.
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

try {
  process.loadEnvFile('.env');
} catch {}

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function seedDatabase() {
  console.log('--- Cleaning existing test data ---');
  await prisma.firmLedgerLineItem.deleteMany();
  await prisma.firmLedgerEntry.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.deliverableArtifact.deleteMany();
  await prisma.deliverableSet.deleteMany();
  await prisma.opinionSelection.deleteMany();
  await prisma.holdingLetter.deleteMany();
  await prisma.confirmation.deleteMany();
  await prisma.reviewNote.deleteMany();
  await prisma.evidenceRef.deleteMany();
  await prisma.auditProcedure.deleteMany();
  await prisma.workProgram.deleteMany();
  await prisma.samplePlan.deleteMany();
  await prisma.analyticalReview.deleteMany();
  await prisma.trialBalanceRow.deleteMany();
  await prisma.fsli.deleteMany();
  await prisma.engagementFolder.deleteMany();
  await prisma.staffAllocation.deleteMany();
  await prisma.materialityRevision.deleteMany();
  await prisma.acceptanceScreening.deleteMany();
  await prisma.dualKeyGate.deleteMany();
  await prisma.pbcUpload.deleteMany();
  await prisma.pbcRequest.deleteMany();
  await prisma.portalInvitation.deleteMany();
  await prisma.document.deleteMany();
  await prisma.auditTrailEntry.deleteMany();
  await prisma.engagementStateTransition.deleteMany();
  await prisma.archiveRecord.deleteMany();
  await prisma.clientAccessGrant.deleteMany();
  await prisma.engagement.deleteMany();
  await prisma.proposalLineItem.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  console.log('--- Seeding RBAC Users ---');
  const userPartner = await prisma.user.create({
    data: {
      id: 'usr-partner-01',
      email: 'khalid.althani@ste-audit.qa',
      role: 'APPROVER',
      name: 'Sheikh Khalid Al-Thani',
      personId: 'person-khalid-01',
      status: 'ACTIVE'
    }
  });

  const userReviewer = await prisma.user.create({
    data: {
      id: 'usr-reviewer-01',
      email: 'fatima.alkuwari@ste-audit.qa',
      role: 'REVIEWER',
      name: 'Fatima Al-Kuwari, CPA',
      personId: 'person-fatima-02',
      status: 'ACTIVE'
    }
  });

  const userSenior = await prisma.user.create({
    data: {
      id: 'usr-senior-01',
      email: 'ahmed.mansoor@ste-audit.qa',
      role: 'REVIEWER',
      name: 'Ahmed Mansoor',
      personId: 'person-ahmed-03',
      status: 'ACTIVE'
    }
  });

  const userPreparer = await prisma.user.create({
    data: {
      id: 'usr-preparer-01',
      email: 'tariq.mansoor@ste-audit.qa',
      role: 'PREPARER',
      name: 'Tariq Al-Mansoor',
      personId: 'person-tariq-04',
      status: 'ACTIVE'
    }
  });

  const userClient = await prisma.user.create({
    data: {
      id: 'usr-client-01',
      email: 'rashid.nuaimi@dohapearl.qa',
      role: 'CLIENT',
      name: 'Rashid Al-Nuaimi',
      personId: 'person-rashid-05',
      status: 'ACTIVE'
    }
  });

  const userAdmin = await prisma.user.create({
    data: {
      id: 'usr-admin-01',
      email: 'admin@ste-audit.qa',
      role: 'ADMIN',
      name: 'System Administrator',
      personId: 'person-admin-06',
      status: 'ACTIVE'
    }
  });

  console.log('--- Seeding Qatari Corporate Group & Clients ---');
  const clientHolding = await prisma.client.create({
    data: {
      id: 'cli-holding-01',
      legalName: 'Al Rayyan Global Holdings Q.P.S.C.',
      legalNameArabic: 'شركة الريان القابضة العالمية ش.م.ع.ق',
      crNumber: '54109',
      tin: '000541090001',
      country: 'Qatar',
      relationship: 'HOLDING',
      status: 'ACTIVE'
    }
  });

  const clientDohaPearl = await prisma.client.create({
    data: {
      id: 'cli-dohapearl-01',
      legalName: 'Doha Pearl Contracting W.L.L.',
      legalNameArabic: 'شركة لؤلؤة الدوحة للمقاولات ذ.م.م',
      crNumber: '104829',
      tin: '0001048290001',
      country: 'Qatar',
      relationship: 'SUBSIDIARY',
      parentClientId: clientHolding.id,
      status: 'ACTIVE'
    }
  });

  const clientAlKhors = await prisma.client.create({
    data: {
      id: 'cli-alkhors-02',
      legalName: 'Al Khors Industrial Supplies W.L.L.',
      legalNameArabic: 'شركة الخور للتوريدات الصناعية ذ.م.م',
      crNumber: '88214',
      tin: '0000882140001',
      country: 'Qatar',
      relationship: 'SUBSIDIARY',
      parentClientId: clientHolding.id,
      status: 'ACTIVE'
    }
  });

  const contactMD = await prisma.clientContact.create({
    data: {
      id: 'cnt-md-01',
      clientId: clientDohaPearl.id,
      name: 'Eng. Nasser Al-Attiyah',
      email: 'nasser.attiyah@dohapearl.qa',
      phone: '+974 4499 1100',
      title: 'Managing Director & Board Member',
      routingRole: 'MANAGING_DIRECTOR',
      isPrimary: true,
      active: true
    }
  });

  const contactCFO = await prisma.clientContact.create({
    data: {
      id: 'cnt-cfo-01',
      clientId: clientDohaPearl.id,
      name: 'Rashid Al-Nuaimi',
      email: 'rashid.nuaimi@dohapearl.qa',
      phone: '+974 4499 1120',
      title: 'Chief Financial Officer',
      routingRole: 'CFO',
      isPrimary: false,
      active: true
    }
  });

  const contactLiaison = await prisma.clientContact.create({
    data: {
      id: 'cnt-liaison-01',
      clientId: clientDohaPearl.id,
      name: 'Omar Farooq',
      email: 'omar.farooq@dohapearl.qa',
      phone: '+974 4499 1135',
      title: 'Chief Accountant & Audit Liaison',
      routingRole: 'AUDIT_LIAISON',
      isPrimary: false,
      active: true
    }
  });

  // 4. Commercial CRM Lead
  const lead = await prisma.lead.create({
    data: {
      id: 'lead-2026-001',
      channel: 'IN_PERSON',
      companyName: 'Doha Pearl Contracting W.L.L.',
      contactName: 'Eng. Nasser Al-Attiyah',
      contactEmail: 'nasser.attiyah@dohapearl.qa',
      contactPhone: '+974 4499 1100',
      stage: 'WON',
      convertedClientId: clientDohaPearl.id,
      notes: 'Statutory audit requirement for Lusail Tower EPC contract renewal and QDB credit covenants.',
      capturedByUserId: userPartner.id
    }
  });

  // 5. Commercial Proposal (Brief Quotation & Technical Proposal with 50/50 terms)
  const proposal = await prisma.proposal.create({
    data: {
      id: 'prop-2026-001',
      clientId: clientDohaPearl.id,
      leadId: lead.id,
      mode: 'COMPREHENSIVE_TECHNICAL',
      revision: 1,
      title: 'Statutory External Audit & IFRS Compliance Services - FY 2026',
      scope: 'Independent audit of the financial statements in accordance with International Standards on Auditing (ISA) and IFRS, including QFMA/MOCI statutory filings.',
      reportingYear: 2026,
      currency: 'QAR',
      totalFee: 120000,
      paymentTerms: '50/50',
      state: 'ACCEPTED',
      dispatchedVia: 'Email',
      dispatchedAt: new Date('2026-08-01T10:00:00Z'),
      acceptedRevision: 1,
      clientAcceptanceEvidenceRef: 'Signed-Proposal-Letter-DohaPearl-2026.pdf',
      lineItems: {
        create: [
          {
            description: 'Phase 1: Planning, Internal Controls Assessment & Materiality Stratification',
            quantity: 1,
            rate: 35000,
            amount: 35000
          },
          {
            description: 'Phase 2: Substantive Year-End Audit Procedures & Construction Contract Testing',
            quantity: 1,
            rate: 65000,
            amount: 65000
          },
          {
            description: 'Phase 3: ISA 700 Deliverables Package, Management Letter & Tax Pack Support',
            quantity: 1,
            rate: 20000,
            amount: 20000
          }
        ]
      }
    }
  });

  // 6. Documents (Advance Invoice & Receipt)
  const docInvoice = await prisma.document.create({
    data: {
      id: 'doc-inv-2026-001',
      category: 'ADVANCE_INVOICE',
      clientId: clientDohaPearl.id,
      fileName: 'INV-2026-001_DohaPearl_50Pct_Advance.pdf',
      mimeType: 'application/pdf',
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      storageKey: 'invoices/2026/INV-2026-001.pdf',
      sizeBytes: 184500,
      createdByUserId: userReviewer.id
    }
  });

  const docReceipt = await prisma.document.create({
    data: {
      id: 'doc-rcpt-2026-001',
      category: 'OFFICIAL_RECEIPT',
      clientId: clientDohaPearl.id,
      fileName: 'RCPT-2026-001_QNB_Wire_Confirmation.pdf',
      mimeType: 'application/pdf',
      sha256: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
      storageKey: 'receipts/2026/RCPT-2026-001.pdf',
      sizeBytes: 142000,
      createdByUserId: userReviewer.id
    }
  });

  console.log('--- Seeding Engagement & State Machine ---');
  // 7. Engagement (Currently in FIELDWORK_EXECUTION state)
  const engagement = await prisma.engagement.create({
    data: {
      id: 'eng-2026-001',
      clientId: clientDohaPearl.id,
      proposalId: proposal.id,
      service: 'Statutory Financial Audit',
      reportingYear: 2026,
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-12-31T23:59:59Z'),
      currency: 'QAR',
      agreedFee: 120000,
      letterTemplate: 'ISA 210 External Statutory Audit',
      state: 'FIELDWORK_EXECUTION',
      lifecycleStatus: 'Active',
      partnerUserId: userPartner.id,
      managerUserId: userReviewer.id,
      reviewerUserId: userSenior.id,
      preparerUserIds: [userPreparer.id],
      targetFieldworkStart: new Date('2026-09-01T00:00:00Z'),
      targetDraftReport: new Date('2026-10-15T00:00:00Z'),
      targetFinalReport: new Date('2026-11-01T00:00:00Z'),
      advanceRequiredQar: 60000,
      advanceRecordedQar: 60000,
      advanceReceiptDocumentId: docReceipt.id
    }
  });

  // 8. Dual-Key Acceptance Gatekeeper (ISA 220) linked to engagement
  await prisma.dualKeyGate.create({
    data: {
      id: 'gate-2026-001',
      engagementId: engagement.id,
      proposalId: proposal.id,
      key1Approved: true,
      key1ProposalRevision: 1,
      key1EvidenceRef: 'DOC-PROP-SIGNED-001',
      key1RecordedByUserId: userReviewer.id,
      key1RecordedAt: new Date('2026-08-05T09:30:00Z'),
      key2Approved: true,
      key2Decision: 'ACCEPTED',
      key2DecisionByUserId: userPartner.id,
      key2DecisionAt: new Date('2026-08-05T14:00:00Z'),
      key2DecisionNotes: 'Dual-key clearance confirmed: Client signed proposal accepted and Partner AML/KYC checks cleared.'
    }
  });

  // 9. 5-Tier Directory Taxonomy Provisioning
  const folderTaxonomy = [
    '01_Administration & Planning',
    '02_Trial Balance & Schedules',
    '03_Fieldwork & Testing',
    '04_Drafts & Deliverables',
    '05_Final Signed Archive'
  ];
  for (const folderName of folderTaxonomy) {
    const key = folderName.slice(0, 2);
    await prisma.engagementFolder.create({
      data: {
        engagementId: engagement.id,
        folderKey: key,
        displayName: folderName,
        storagePath: `engagements/${engagement.id}/${folderName}`
      }
    });
  }

  // 10. Acceptance & Continuance Screening (Track A)
  await prisma.acceptanceScreening.create({
    data: {
      id: 'scr-2026-001',
      engagementId: engagement.id,
      track: 'TRACK_A_NEW_CLIENT',
      uboCompleted: true,
      amlKycCompleted: true,
      kycDocsRef: 'KYC-DOHA-PEARL-2026.zip',
      managementIntegrityAssessed: true,
      financialViabilityAssessed: true,
      independenceConfirmed: true,
      conflictsCleared: true,
      priorYearFeesSettled: true,
      riskRating: 'MEDIUM',
      conditions: ['Obtain direct construction contract verifications for projects exceeding 15M QAR.'],
      recommendedByUserId: userReviewer.id,
      recommendationNotes: 'Acceptance recommended: UBO confirmed and QCB credit registry clear.',
      decision: 'ACCEPTED',
      decisionByUserId: userPartner.id,
      decisionAt: new Date('2026-08-20T10:00:00Z'),
      decisionNotes: 'Partner risk clearance granted.'
    }
  });

  // 11. ISA 320 Materiality Calculation
  await prisma.materialityRevision.create({
    data: {
      id: 'mat-2026-001',
      engagementId: engagement.id,
      revision: 1,
      benchmark: 'PROFIT_BEFORE_TAX',
      benchmarkValue: 4500000,
      materialityRate: 6.0,
      planningMateriality: 270000,
      tolerableErrorRate: 65,
      tolerableError: 175500,
      sadRate: 4,
      sadThreshold: 10800,
      rationale: 'Normalized profit before tax adopted as primary benchmark reflecting shareholder equity value in construction contracting operations.',
      approvedByUserId: userPartner.id,
      approvedAt: new Date('2026-08-25T11:00:00Z')
    }
  });

  // 12. Staff Resource Allocation
  await prisma.staffAllocation.createMany({
    data: [
      {
        engagementId: engagement.id,
        userId: userPartner.id,
        chargeOutRole: 'PARTNER',
        phase: 'PLANNING',
        plannedHours: 12,
        startDate: new Date('2026-08-15'),
        endDate: new Date('2026-11-15'),
        assignedByUserId: userPartner.id
      },
      {
        engagementId: engagement.id,
        userId: userReviewer.id,
        chargeOutRole: 'MANAGER',
        phase: 'FIELDWORK',
        plannedHours: 40,
        startDate: new Date('2026-08-15'),
        endDate: new Date('2026-11-15'),
        assignedByUserId: userPartner.id
      },
      {
        engagementId: engagement.id,
        userId: userSenior.id,
        chargeOutRole: 'SENIOR',
        phase: 'FIELDWORK',
        plannedHours: 80,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-10-31'),
        assignedByUserId: userPartner.id
      },
      {
        engagementId: engagement.id,
        userId: userPreparer.id,
        chargeOutRole: 'JUNIOR',
        phase: 'FIELDWORK',
        plannedHours: 120,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-10-31'),
        assignedByUserId: userPartner.id
      }
    ]
  });

  console.log('--- Seeding FSLIs & Trial Balance ---');
  // 13. Financial Statement Line Items (FSLIs) - Split P/L and B/S
  const fsliRevenue = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'REV-01',
      label: 'Contract Revenue & EPC Billings',
      section: 'PROFIT_AND_LOSS',
      currentYear: 48500000,
      priorYear: 42100000,
      riskStratum: 'RED',
      riskReason: 'Balance ≥ Planning Materiality (270,000 QAR); IFRS 15 percentage of completion estimate'
    }
  });

  const fsliCogs = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'EXP-01',
      label: 'Direct Construction Costs & Subcontracting',
      section: 'PROFIT_AND_LOSS',
      currentYear: 36200000,
      priorYear: 31800000,
      riskStratum: 'RED',
      riskReason: 'Balance ≥ Planning Materiality (270,000 QAR); complex subcontractor valuations'
    }
  });

  const fsliAdminExp = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'EXP-02',
      label: 'General & Administrative Expenses',
      section: 'PROFIT_AND_LOSS',
      currentYear: 5400000,
      priorYear: 4800000,
      riskStratum: 'AMBER',
      riskReason: 'Balance between Tolerable Error and Planning Materiality'
    }
  });

  const fsliPpe = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'AST-01',
      label: 'Property, Plant & Heavy Equipment',
      section: 'BALANCE_SHEET',
      currentYear: 18400000,
      priorYear: 16900000,
      riskStratum: 'RED',
      riskReason: 'Heavy crane and fleet equipment valuation; impairment review required'
    }
  });

  const fsliAr = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'AST-02',
      label: 'Trade Accounts Receivable & Retentions',
      section: 'BALANCE_SHEET',
      currentYear: 14200000,
      priorYear: 12500000,
      riskStratum: 'RED',
      riskReason: 'Significant retention balances aged > 365 days; IFRS 9 ECL model testing'
    }
  });

  const fsliCash = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'AST-03',
      label: 'Cash & Bank Balances',
      section: 'BALANCE_SHEET',
      currentYear: 8750000,
      priorYear: 6100000,
      riskStratum: 'RED',
      riskReason: 'Critical liquidity account; mandatory 100% bank confirmation coverage'
    }
  });

  const fsliAp = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'LIA-01',
      label: 'Trade Payables & Accrued Expenses',
      section: 'BALANCE_SHEET',
      currentYear: 11500000,
      priorYear: 9800000,
      riskStratum: 'RED',
      riskReason: 'Search for unrecorded liabilities around period-end cut-off'
    }
  });

  const fsliEquity = await prisma.fsli.create({
    data: {
      engagementId: engagement.id,
      code: 'EQU-01',
      label: 'Share Capital & Statutory Reserve',
      section: 'BALANCE_SHEET',
      currentYear: 10000000,
      priorYear: 10000000,
      riskStratum: 'GREEN',
      riskReason: 'Balance unchanged, verified against commercial register'
    }
  });

  // 14. Trial Balance Rows Mapping
  await prisma.trialBalanceRow.createMany({
    data: [
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '40100',
        accountName: 'Lump Sum EPC Project Revenue',
        section: 'PROFIT_AND_LOSS',
        fsliId: fsliRevenue.id,
        currentYear: 32000000,
        priorYear: 28000000,
        mappingSource: 'Historical memory: auto-matched 98%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '40200',
        accountName: 'Civil Works & Infrastructure Contracting',
        section: 'PROFIT_AND_LOSS',
        fsliId: fsliRevenue.id,
        currentYear: 16500000,
        priorYear: 14100000,
        mappingSource: 'Historical memory: auto-matched 99%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '50100',
        accountName: 'Direct Materials Consumed (Cement & Steel)',
        section: 'PROFIT_AND_LOSS',
        fsliId: fsliCogs.id,
        currentYear: 18200000,
        priorYear: 15900000,
        mappingSource: 'Historical memory: auto-matched 97%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '50200',
        accountName: 'MEP Subcontracting Fees',
        section: 'PROFIT_AND_LOSS',
        fsliId: fsliCogs.id,
        currentYear: 18000000,
        priorYear: 15900000,
        mappingSource: 'Fuzzy match 94%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '10100',
        accountName: 'Qatar National Bank (QNB) Operating A/C',
        section: 'BALANCE_SHEET',
        fsliId: fsliCash.id,
        currentYear: 7500000,
        priorYear: 5200000,
        mappingSource: 'Exact match 100%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '10200',
        accountName: 'Commercial Bank of Qatar (CBQ) Deposit A/C',
        section: 'BALANCE_SHEET',
        fsliId: fsliCash.id,
        currentYear: 1250000,
        priorYear: 900000,
        mappingSource: 'Exact match 100%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '12100',
        accountName: 'Trade Receivables - Government & Private Clients',
        section: 'BALANCE_SHEET',
        fsliId: fsliAr.id,
        currentYear: 10400000,
        priorYear: 9100000,
        mappingSource: 'Exact match 100%'
      },
      {
        engagementId: engagement.id,
        sourceRevision: 1,
        accountCode: '12200',
        accountName: 'Contract Retentions Receivable',
        section: 'BALANCE_SHEET',
        fsliId: fsliAr.id,
        currentYear: 3800000,
        priorYear: 3400000,
        mappingSource: 'Exact match 100%'
      }
    ]
  });

  console.log('--- Seeding WorkPrograms & Substantive Testing ---');
  // 15. Substantive Workprograms & Procedures
  const wpRevenue = await prisma.workProgram.create({
    data: {
      engagementId: engagement.id,
      fsliId: fsliRevenue.id,
      title: 'Substantive Audit Program — Contract Revenue (IFRS 15)'
    }
  });

  const wpCash = await prisma.workProgram.create({
    data: {
      engagementId: engagement.id,
      fsliId: fsliCash.id,
      title: 'Substantive Audit Program — Cash & Bank Balances (ISA 505)'
    }
  });

  const wpAr = await prisma.workProgram.create({
    data: {
      engagementId: engagement.id,
      fsliId: fsliAr.id,
      title: 'Substantive Audit Program — Trade Receivables & Retentions'
    }
  });

  const procRev1 = await prisma.auditProcedure.create({
    data: {
      workProgramId: wpRevenue.id,
      ref: 'REV-P-01',
      title: 'IFRS 15 Percentage of Completion Recalculation',
      instructions: 'Recalculate input-method percentage of completion based on certified engineer interim payment certificates (IPCs) and cumulative incurred cost vs total estimated costs.',
      assertions: ['Valuation', 'Cut-off', 'Completeness'],
      status: 'SUBMITTED',
      assignedToUserId: userPreparer.id,
      workPerformed: 'Tested 5 major EPC contracts representing 82% of revenue. Vouched costs to supplier billings and compared IPCs against client revenue recognition schedule.',
      conclusion: 'Percentage of completion is materially stated in accordance with IFRS 15.',
      submittedByUserId: userPreparer.id,
      submittedAt: new Date('2026-09-18T16:00:00Z')
    }
  });

  const wpDoc1 = await prisma.document.create({
    data: {
      category: 'WORKING_PAPER',
      clientId: clientDohaPearl.id,
      fileName: 'WP_REV_01_Lusail_Tower_IPC12.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sha256: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
      storageKey: 'workpapers/WP_REV_01_Lusail_Tower.xlsx',
      sizeBytes: 345000,
      createdByUserId: userPreparer.id
    }
  });

  await prisma.evidenceRef.create({
    data: {
      procedureId: procRev1.id,
      kind: 'DIGITAL',
      description: 'Lusail Tower IPC 12 & Engineer Certification',
      documentId: wpDoc1.id,
      linkedByUserId: userPreparer.id
    }
  });

  await prisma.evidenceRef.create({
    data: {
      procedureId: procRev1.id,
      kind: 'PHYSICAL',
      description: 'Original stamped client contract dossiers and performance guarantees',
      physicalIndex: 'X-1',
      physicalBox: 'Box 3',
      physicalShelf: 'Shelf B',
      linkedByUserId: userPreparer.id
    }
  });

  const procAr1 = await prisma.auditProcedure.create({
    data: {
      workProgramId: wpAr.id,
      ref: 'AR-P-01',
      title: 'Debtors Positive Circularization & Subsequent Settlement',
      instructions: 'Circulate positive confirmation requests for all debtors exceeding Tolerable Error (175,500 QAR). For non-responses, perform alternative testing via subsequent bank receipts.',
      assertions: ['Existence', 'Rights & Obligations', 'Valuation'],
      status: 'UNDER_REWORK',
      assignedToUserId: userPreparer.id,
      workPerformed: 'Dispatched 8 debtor confirmations. 5 received with no exceptions. 3 pending subsequent receipt matching.',
      conclusion: 'Additional vouching needed for Qatari Diar retention balance.',
      submittedByUserId: userPreparer.id,
      submittedAt: new Date('2026-09-20T11:00:00Z')
    }
  });

  // 16. Review Note (Mandatory rework rejection loop)
  await prisma.reviewNote.create({
    data: {
      engagementId: engagement.id,
      procedureId: procAr1.id,
      raisedByUserId: userReviewer.id,
      raisedAgainstUserId: userPreparer.id,
      text: 'Mandatory Rework: Retention receivable of 1,250,000 QAR on Qatari Diar contract is aged over 420 days. Obtain certified snag-list clearance or client correspondence proving recoverability under IFRS 9 ECL provisions.',
      status: 'OPEN',
      raisedAt: new Date('2026-09-22T14:30:00Z')
    }
  });

  // 17. Confirmations Dashboard
  await prisma.confirmation.createMany({
    data: [
      {
        engagementId: engagement.id,
        type: 'BANK',
        counterparty: 'Qatar National Bank (QNB) - West Bay Corporate Branch',
        relatedFsliId: fsliCash.id,
        status: 'RECEIVED',
        critical: true,
        dueAt: new Date('2026-09-25T00:00:00Z'),
        receivedAt: new Date('2026-09-21T09:00:00Z'),
        notes: 'Standard bank certificate received confirming 7,500,000 QAR balance and no encumbrances.'
      },
      {
        engagementId: engagement.id,
        type: 'BANK',
        counterparty: 'Commercial Bank of Qatar (CBQ) - Grand Hamad Branch',
        relatedFsliId: fsliCash.id,
        status: 'RECEIVED',
        critical: true,
        dueAt: new Date('2026-09-25T00:00:00Z'),
        receivedAt: new Date('2026-09-22T15:00:00Z'),
        notes: 'Confirmed 1,250,000 QAR deposit certificate with 4.85% annual profit rate.'
      },
      {
        engagementId: engagement.id,
        type: 'LEGAL',
        counterparty: 'Al Rayyan Legal Advisors & International Advocates',
        status: 'RECEIVED',
        critical: true,
        dueAt: new Date('2026-09-28T00:00:00Z'),
        receivedAt: new Date('2026-09-24T11:00:00Z'),
        notes: 'Counsel confirmed ongoing labor dispute capped at maximum 120,000 QAR liability, adequately provided for.'
      },
      {
        engagementId: engagement.id,
        type: 'ACCOUNTS_RECEIVABLE',
        counterparty: 'Lusail Real Estate Development Co.',
        relatedFsliId: fsliAr.id,
        status: 'RECEIVED',
        critical: false,
        dueAt: new Date('2026-09-30T00:00:00Z'),
        receivedAt: new Date('2026-09-25T17:00:00Z'),
        notes: 'Agreed with no difference.'
      }
    ]
  });

  // 18. PBC Requests for Client Portal
  await prisma.pbcRequest.create({
    data: {
      id: 'pbc-req-001',
      engagementId: engagement.id,
      clientId: clientDohaPearl.id,
      title: 'FY2026 Signed Board Minutes & Shareholder Resolutions',
      description: 'Please upload copies of all certified board meeting minutes for FY2026 approving bank facilities and capital expenditures.',
      assignedContactId: contactMD.id,
      status: 'APPROVED',
      dueAt: new Date('2026-09-10T00:00:00Z'),
      createdByUserId: userReviewer.id
    }
  });

  await prisma.pbcRequest.create({
    data: {
      id: 'pbc-req-002',
      engagementId: engagement.id,
      clientId: clientDohaPearl.id,
      title: 'QNB & CBQ Bank Statements (December 2026)',
      description: 'Official PDF bank statements for all operating and deposit accounts covering December 1 to December 31, 2026.',
      assignedContactId: contactCFO.id,
      status: 'APPROVED',
      dueAt: new Date('2026-09-15T00:00:00Z'),
      createdByUserId: userReviewer.id
    }
  });

  await prisma.pbcRequest.create({
    data: {
      id: 'pbc-req-003',
      engagementId: engagement.id,
      clientId: clientDohaPearl.id,
      title: 'Subcontractor IPC Certificates for Lusail Tower',
      description: 'Please attach engineer certificates and progress billing claims submitted by Al Khors Industrial and MEP subcontractors for Q4.',
      assignedContactId: contactLiaison.id,
      status: 'REJECTED_REUPLOAD',
      rejectionReason: 'Mandatory Auditor Note: The attached document is missing the consulting engineer stamp on claim #14. Please re-upload the officially endorsed copy.',
      dueAt: new Date('2026-09-28T00:00:00Z'),
      createdByUserId: userReviewer.id,
      rejectedByUserId: userReviewer.id,
      rejectedAt: new Date('2026-09-23T10:00:00Z')
    }
  });

  await prisma.pbcRequest.create({
    data: {
      id: 'pbc-req-004',
      engagementId: engagement.id,
      clientId: clientDohaPearl.id,
      title: 'IFRS 9 Expected Credit Loss (ECL) Model & Aging Schedule',
      description: 'Detailed accounts receivable aging report categorized into 0-30, 31-60, 61-90, 91-180, and 180+ days with client provisioning matrix.',
      assignedContactId: contactCFO.id,
      status: 'PENDING_UPLOAD',
      dueAt: new Date('2026-10-05T00:00:00Z'),
      createdByUserId: userReviewer.id
    }
  });

  console.log('--- Seeding Practice Time Entries & Firm Ledger ---');
  // 19. Time Entries
  await prisma.timeEntry.createMany({
    data: [
      {
        engagementId: engagement.id,
        userId: userPartner.id,
        chargeOutRole: 'PARTNER',
        date: new Date('2026-08-20'),
        hours: 6,
        phase: 'PLANNING',
        narrative: 'Client acceptance, risk assessment & materiality sign-off',
        billable: true,
        approved: true
      },
      {
        engagementId: engagement.id,
        userId: userReviewer.id,
        chargeOutRole: 'MANAGER',
        date: new Date('2026-08-25'),
        hours: 15,
        phase: 'PLANNING',
        narrative: 'Trial balance ingestion, FSLI fuzzy mapping, audit program planning',
        billable: true,
        approved: true
      },
      {
        engagementId: engagement.id,
        userId: userSenior.id,
        chargeOutRole: 'SENIOR',
        date: new Date('2026-09-10'),
        hours: 32,
        phase: 'FIELDWORK',
        narrative: 'Supervising substantive testing on revenue and debtor circularization',
        billable: true,
        approved: true
      },
      {
        engagementId: engagement.id,
        userId: userPreparer.id,
        chargeOutRole: 'JUNIOR',
        date: new Date('2026-09-15'),
        hours: 48,
        phase: 'FIELDWORK',
        narrative: 'Testing IFRS 15 contracts, bank reconciliation matching, physical binder indexing',
        billable: true,
        approved: true
      }
    ]
  });

  // 20. Firm Practice Ledger
  await prisma.firmLedgerEntry.create({
    data: {
      date: new Date('2026-08-10'),
      description: '50% Advance Audit Fee Received — Doha Pearl Contracting W.L.L.',
      reference: 'RCPT-2026-001',
      createdByUserId: userPartner.id,
      lines: {
        create: [
          { account: 'CASH', debit: 60000, credit: 0 },
          { account: 'OTHER_EXPENSES', debit: 0, credit: 60000 }
        ]
      }
    }
  });

  await prisma.firmLedgerEntry.create({
    data: {
      date: new Date('2026-08-31'),
      description: 'Office Rent & Utilities (West Bay Tower 18th Floor)',
      reference: 'RENT-AUG-2026',
      createdByUserId: userPartner.id,
      lines: {
        create: [
          { account: 'OFFICE_RENT', debit: 22000, credit: 0 },
          { account: 'CASH', debit: 0, credit: 22000 }
        ]
      }
    }
  });

  await prisma.firmLedgerEntry.create({
    data: {
      date: new Date('2026-08-31'),
      description: 'Monthly Staff Payroll & Statutory Pension Contributions',
      reference: 'PAYROLL-AUG-2026',
      createdByUserId: userPartner.id,
      lines: {
        create: [
          { account: 'STAFF_SALARIES', debit: 38000, credit: 0 },
          { account: 'STAFF_BENEFITS', debit: 6500, credit: 0 },
          { account: 'CASH', debit: 0, credit: 44500 }
        ]
      }
    }
  });

  console.log('✅ Seed completed successfully! All 5 Modules populated with realistic Qatari data.');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
