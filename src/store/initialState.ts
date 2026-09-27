// AuditSphere Comprehensive Initial State & Seed Data
// Covers all 39 functional modules with realistic synthetic data

import { PrototypeState, UserPersona, RoleKey } from '../types';
import { CURRENT_SCHEMA } from '../services/migrations';

export const ALL_PERSONAS: UserPersona[] = [
  { id: 'superuser', role: 'superuser', name: 'AuditSphere Superuser', initials: 'SU', label: 'Superuser · Full Prototype Access', group: 'System / Prototype Testing', email: 'superuser@auditsphere.demo', status: 'Active' },
  { id: 'manager', role: 'manager', name: 'Layla Rahman', initials: 'LR', label: 'Engagement manager', group: 'Professional', email: 'layla.rahman@ste-audit.demo', status: 'Active' },
  { id: 'manager-2', role: 'manager', name: 'Mariam Saeed', initials: 'MS', label: 'Engagement manager (second)', group: 'Professional', email: 'mariam.saeed@ste-audit.demo', status: 'Active' },
  { id: 'partner', role: 'partner', name: 'Daniel James', initials: 'DJ', label: 'Engagement partner', group: 'Professional', email: 'daniel.james@ste-audit.demo', status: 'Active' },
  { id: 'preparer', personId: 'person-adam-khan', role: 'preparer', name: 'Adam Khan', initials: 'AK', label: 'Audit preparer', group: 'Professional', email: 'adam.khan@ste-audit.demo', status: 'Active' },
  { id: 'reviewer', role: 'reviewer', name: 'Sara Malik', initials: 'SM', label: 'Senior reviewer', group: 'Professional', email: 'sara.malik@ste-audit.demo', status: 'Active' },
  { id: 'eqr', role: 'eqr', name: 'Dr. Tariq Al-Sayed', initials: 'TS', label: 'Engagement quality reviewer', group: 'Professional', email: 'tariq.alsayed@ste-audit.demo', status: 'Active' },
  { id: 'eqr-2', role: 'eqr', name: 'Dr. Samira Noor', initials: 'SN', label: 'Engagement quality reviewer (second)', group: 'Professional', email: 'samira.noor@ste-audit.demo', status: 'Active' },
  { id: 'relationship', personId: 'person-amira-qasim', role: 'relationship', name: 'Amira Qasim', initials: 'AQ', label: 'Relationship owner', group: 'Commercial', email: 'amira.qasim@ste-audit.demo', status: 'Active' },
  { id: 'onboarding', role: 'onboarding', name: 'Hana Ali', initials: 'HA', label: 'Onboarding coordinator', group: 'Commercial', email: 'hana.ali@ste-audit.demo', status: 'Active' },
  { id: 'compliance', role: 'compliance', name: 'Yusuf Ahmed', initials: 'YA', label: 'Compliance reviewer', group: 'Commercial', email: 'yusuf.ahmed@ste-audit.demo', status: 'Active' },
  { id: 'billing', role: 'billing', name: 'Leila Hassan', initials: 'LH', label: 'Billing officer', group: 'Operations', email: 'leila.hassan@ste-audit.demo', status: 'Active' },
  { id: 'records', role: 'records', name: 'Farooq Mansour', initials: 'FM', label: 'Records administrator', group: 'Operations', email: 'farooq.mansour@ste-audit.demo', status: 'Active' },
  { id: 'admin', role: 'admin', name: 'Khalid Al-Nuaimi', initials: 'KN', label: 'System administrator', group: 'Operations', email: 'khalid.alnuaimi@ste-audit.demo', status: 'Active' },
  { id: 'client_admin', role: 'client_admin', name: 'Amal Nasser', initials: 'AN', label: 'Client administrator', group: 'Client', email: 'amal.nasser@example-trading.demo', status: 'Active' },
  { id: 'client_finance', role: 'client_finance', name: 'Rami Nasser', initials: 'RN', label: 'Finance contributor', group: 'Client', email: 'rami.nasser@example-trading.demo', status: 'Active' },
  { id: 'client', role: 'client', name: 'Omar Nasser', initials: 'ON', label: 'Management approver', group: 'Client', email: 'omar.nasser@example-trading.demo', status: 'Active' },
  { id: 'client-northstar', role: 'client', name: 'Aisha Saleh', initials: 'AS', label: 'Northstar management approver', group: 'Client', email: 'aisha.saleh@northstar.demo', status: 'Active' },
  // Second same-role people so reassignment/substitution can actually be demonstrated (VP-014, VP-055)
  { id: 'preparer-2', role: 'preparer', name: 'Nadia Rahman', initials: 'NR', label: 'Audit preparer (second)', group: 'Professional', email: 'nadia.rahman@ste-audit.demo', status: 'Active' },
  { id: 'reviewer-2', role: 'reviewer', name: 'Bilal Ahmed', initials: 'BA', label: 'Senior reviewer (second)', group: 'Professional', email: 'bilal.ahmed@ste-audit.demo', status: 'Active' },
  // Multi-role person: same natural person holds preparer + billing duties; SoD still
  // applies by person name, not role label (§5.3)
  { id: 'multirole-1', personId: 'person-adam-khan', role: 'billing', name: 'Adam Khan', initials: 'AK', label: 'Billing officer (also preparer)', group: 'Operations', email: 'adam.khan.billing@ste-audit.demo', status: 'Active' },
  // Disabled identity for lifecycle tests (VP-018)
  { id: 'reviewer-disabled', role: 'reviewer', name: 'Tariq Aziz', initials: 'TA', label: 'Senior reviewer (disabled)', group: 'Professional', email: 'tariq.aziz@ste-audit.demo', status: 'Inactive' },
  // Narrowly scoped group-reporting user: sees one engagement only (VP-019 negative tests)
  { id: 'group-user', role: 'manager', name: 'Mona Khalil', initials: 'MK', label: 'Group accountant (narrow scope)', group: 'Professional', email: 'mona.khalil@ste-audit.demo', status: 'Active' }
];

export function createInitialState(): PrototypeState {
  const state: PrototypeState = {
    schema: CURRENT_SCHEMA,
    asOfDate: '2026-09-23',
    selectedEngagement: 'ENG-26001',
    currentRole: 'manager',
    currentUserId: 'manager',
    currentPerson: 'Layla Rahman',
    users: ALL_PERSONAS,
    roleGrants: [
      { userId: 'superuser', role: 'superuser', scopeKind: 'Global' },
      { userId: 'manager', role: 'manager', scopeKind: 'Global' },
      { userId: 'manager-2', role: 'manager', scopeKind: 'Global' },
      { userId: 'partner', role: 'partner', scopeKind: 'Global' },
      { userId: 'preparer', role: 'preparer', scopeKind: 'Global' },
      { userId: 'preparer-2', role: 'preparer', scopeKind: 'Global' },
      { userId: 'reviewer', role: 'reviewer', scopeKind: 'Global' },
      { userId: 'reviewer-2', role: 'reviewer', scopeKind: 'Global' },
      { userId: 'eqr', role: 'eqr', scopeKind: 'Global' },
      { userId: 'eqr-2', role: 'eqr', scopeKind: 'Global' },
      { userId: 'relationship', role: 'relationship', scopeKind: 'Global' },
      { userId: 'onboarding', role: 'onboarding', scopeKind: 'Global' },
      { userId: 'compliance', role: 'compliance', scopeKind: 'Global' },
      { userId: 'billing', role: 'billing', scopeKind: 'Global' },
      { userId: 'records', role: 'records', scopeKind: 'Global' },
      { userId: 'admin', role: 'admin', scopeKind: 'Global' },
      // Client identities carry explicit per-client grants; Amal holds two entity
      // grants to exercise multi-entity portal switching (VP-025).
      { userId: 'client_admin', role: 'client_admin', scopeKind: 'Client', scopeId: 'CL-001' },
      { userId: 'client_admin', role: 'client_admin', scopeKind: 'Client', scopeId: 'CL-003' },
      { userId: 'client_finance', role: 'client_finance', scopeKind: 'Client', scopeId: 'CL-001' },
      { userId: 'client', role: 'client', scopeKind: 'Client', scopeId: 'CL-001' },
      { userId: 'client-northstar', role: 'client', scopeKind: 'Client', scopeId: 'CL-002' },
      // Narrow group-reporting scope: consolidation components only, no sibling access.
      { userId: 'group-user', role: 'manager', scopeKind: 'Engagement', scopeId: 'ENG-26001' }
    ],
    roleGrantHistory: [],

    // Module 02: Clients
    clients: [
      {
        id: 'CL-001',
        code: 'EXP-TRAD',
        name: 'Example Trading Entity',
        clientType: 'Company',
        profileRevision: 0,
        tradingName: 'Example Trading Co. W.L.L.',
        initials: 'ET',
        industry: 'Trading & distribution',
        contact: 'Omar Nasser',
        email: 'omar.nasser@example-trading.demo',
        phone: '+974 4411 2233',
        jurisdiction: 'Qatar Financial Centre (QFC)',
        registrationNumber: 'QFC-00892',
        status: 'Active',
        risk: 'Moderate',
        revenue: 600000,
        relationshipOwner: 'Amira Qasim',
        partner: 'Daniel James',
        manager: 'Layla Rahman',
        notes: 'Long-standing commercial trading client. FY 2026 external audit.',
        relationshipGroupId: 'GRP-REL-01',
        customFields: { 'Tax Card Number': 'TC-8921-QA', 'CR Expiry Date': '2027-12-31' }
      },
      {
        id: 'CL-002',
        code: 'NORTH-SRV',
        name: 'Northstar Services',
        clientType: 'Company',
        profileRevision: 0,
        tradingName: 'Northstar IT Consulting',
        initials: 'NS',
        color: 'purple',
        industry: 'Professional services',
        contact: 'Aisha Saleh',
        email: 'aisha.saleh@northstar.demo',
        phone: '+974 4422 3344',
        jurisdiction: 'State of Qatar (MOCI)',
        registrationNumber: 'CR-104928',
        status: 'Active',
        risk: 'Low',
        revenue: 1800000,
        relationshipOwner: 'Amira Qasim',
        partner: 'Daniel James',
        manager: 'Layla Rahman',
        notes: 'Annual accounts compilation engagement.'
      },
      {
        id: 'CL-003',
        code: 'CEDAR-MFG',
        name: 'Cedar Manufacturing',
        clientType: 'Company',
        profileRevision: 0,
        tradingName: 'Cedar Industrial Plants',
        initials: 'CM',
        color: 'blue',
        industry: 'Manufacturing',
        contact: 'Noah Williams',
        email: 'noah.w@cedar-mfg.demo',
        phone: '+974 4433 4455',
        jurisdiction: 'Qatar Science & Technology Park',
        registrationNumber: 'QSTP-7721',
        status: 'Active',
        risk: 'Moderate',
        revenue: 2400000,
        relationshipOwner: 'Amira Qasim',
        partner: 'Daniel James',
        manager: 'Layla Rahman',
        notes: 'Manufacturing entity, subsidiary of Example Trading Entity for consolidation.'
      },
      {
        id: 'CL-004',
        code: 'HARBOR-LOG',
        name: 'Harbor Logistics',
        clientType: 'Company',
        profileRevision: 0,
        tradingName: 'Harbor Freight & Customs',
        initials: 'HL',
        color: 'amber',
        industry: 'Transport & logistics',
        contact: 'Riya Ahmed',
        email: 'riya@harbor-logistics.demo',
        phone: '+974 4455 6677',
        jurisdiction: 'Hamad Port Free Zone',
        registrationNumber: 'QFZ-9912',
        status: 'Active',
        risk: 'Low',
        revenue: 1200000,
        relationshipOwner: 'Amira Qasim',
        partner: 'Daniel James',
        manager: 'Layla Rahman',
        notes: 'Internal audit and process risk review.'
      },
      // Similar-name control: distinct legal entity, must never auto-merge (VP-006).
      {
        id: 'CL-005',
        code: 'EXP-TRAD-SVC',
        name: 'Example Trading Services',
        clientType: 'Company',
        profileRevision: 0,
        tradingName: 'Example Trading Services W.L.L.',
        initials: 'ES',
        color: 'teal',
        industry: 'Trading & distribution',
        contact: 'Omar Nasser',
        email: 'omar.nasser@example-trading-services.demo',
        phone: '+974 4411 2299',
        jurisdiction: 'State of Qatar (MOCI)',
        registrationNumber: 'CR-112233',
        status: 'Prospect',
        risk: 'Low',
        revenue: 250000,
        relationshipOwner: 'Amira Qasim',
        partner: 'Daniel James',
        manager: 'Layla Rahman',
        notes: 'Similarly named prospect used for duplicate/similar-name warning tests. Separate legal entity from CL-001.'
      }
    ],

    contacts: [
      { id: 'CNT-01', clientId: 'CL-001', name: 'Omar Nasser', email: 'omar.nasser@example-trading.demo', phone: '+974 4411 2233', title: 'Chief Financial Officer', isPrimary: true, active: true },
      { id: 'CNT-02', clientId: 'CL-001', name: 'Amal Nasser', email: 'amal.nasser@example-trading.demo', phone: '+974 4411 2234', title: 'Finance Administrator', isPrimary: false, active: true, portalAccessRequested: true },
      { id: 'CNT-03', clientId: 'CL-001', name: 'Rami Nasser', email: 'rami.nasser@example-trading.demo', phone: '+974 4411 2235', title: 'Senior Accountant', isPrimary: false, active: true, portalAccessRequested: true },
      { id: 'CNT-04', clientId: 'CL-002', name: 'Aisha Saleh', email: 'aisha.saleh@northstar.demo', title: 'Managing Director', isPrimary: true, active: true }
    ],
    clientContactNominations: [],

    relationshipGroups: [
      { id: 'GRP-REL-01', name: 'Example Holdings Alliance', description: 'Cross-entity commercial relationship group (non-authorizing)', clientIds: ['CL-001', 'CL-003'] }
    ],

    customFields: [
      { id: 'cf_tax_card', label: 'Tax Card Number', type: 'text' },
      { id: 'cf_cr_expiry', label: 'CR Expiry Date', type: 'date' },
      { id: 'cf_entity_tier', label: 'Entity Tier', type: 'choice', options: ['Tier 1 Public', 'Tier 2 SME', 'Free Zone'] }
    ],

    // Module 03: Leads
    leads: [
      { id: 'LD-001', name: 'Aspen Retail', contact: 'Mira Thomas', email: 'mira@aspen.demo', service: 'Annual accounts', value: 850000, currency: 'QAR', stage: 'Inquiry', owner: 'Amira Qasim', accepted: false, terms: false, notes: 'Initial retail inventory inquiry.' },
      { id: 'LD-002', name: 'Summit Engineering', contact: 'Zayd Hasan', email: 'zayd@summit.demo', service: 'External audit', value: 1400000, currency: 'QAR', stage: 'Discovery', owner: 'Amira Qasim', accepted: false, terms: false, notes: 'Large engineering contractor.' },
      { id: 'LD-003', name: 'Orchid Hospitality', contact: 'Lena James', email: 'lena@orchid.demo', service: 'External audit', value: 1800000, currency: 'QAR', stage: 'Evaluation', owner: 'Amira Qasim', accepted: false, terms: false, notes: 'Hotel chain RFP response submitted.' },
      { id: 'LD-004', name: 'Atlas Technology', contact: 'Hana Ali', email: 'hana@atlas.demo', service: 'Internal audit', value: 1200000, currency: 'QAR', stage: 'Proposal', owner: 'Amira Qasim', accepted: true, terms: false, notes: 'Commercial terms agreed in principle.' }
    ],

    // Module 04: Proposals
    proposals: [
      {
        id: 'PROP-001',
        leadId: 'LD-002',
        clientId: 'CL-001',
        title: 'Example Trading · Statutory Audit FY2026',
        revision: 2,
        preparedBy: 'Amira Qasim',
        preparedAt: '2026-09-10',
        currency: 'QAR',
        totalAmount: 600000,
        terms: 'Payment 30 days upon milestone issue. Scope limited to agreed audit program.',
        period: 'Year ended 31 December 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31',
        templateId: 'PT-AUDIT-BASE', templateRevision: 1,
        state: 'Accepted',
        items: [
          { id: 'PI-01', serviceId: 'SVC-AUDIT', serviceName: 'Statutory Financial Statement Audit', description: 'Full scope audit under ISA & QFC regulations', scope: 'Financial statements year ended 31 Dec 2026', exclusions: 'Tax preparation, payroll processing, bookkeeping and future-period recurring work.', deliverables: 'Independent Auditor Report, Management Letter', clientResponsibilities: 'Provide complete accounting records and timely management responses.', dependencies: 'Engagement acceptance and complete supporting records.', period: 'Year ended 31 December 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', feeModel: 'Fixed', quantity: 1, rate: 500000, amount: 500000 },
          { id: 'PI-02', serviceId: 'SVC-REVIEW', serviceName: 'Interim Review Procedures', description: 'Mid-year analytical review', scope: 'Q2 2026 statements', exclusions: 'Audit opinion, tax preparation and payroll processing.', deliverables: 'Interim Review Memorandum', clientResponsibilities: 'Provide interim records and management explanations.', dependencies: 'Current interim ledger.', period: 'Quarter ended 30 June 2026', periodStart: '2026-04-01', periodEnd: '2026-06-30', feeModel: 'Fixed', quantity: 1, rate: 100000, amount: 100000 }
        ],
        commercialReview: { reviewedBy: 'Layla Rahman', reviewedAt: '2026-09-12', approved: true, notes: 'Fee conforms to approved firm schedule.' },
        clientResponse: { responseType: 'Accepted', contact: 'Omar Nasser', date: '2026-09-14', method: 'Email', notes: 'Confirmed acceptance of scope and fees.', evidenceRef: 'DOC-PROP-ACC-01' }
      }
    ],
    proposalServices: [
      { id: 'SVC-AUDIT', name: 'External audit', description: 'Independent audit of historical financial statements.', scope: 'Audit of the financial statements for the reporting period stated in the proposal.', exclusions: 'Tax preparation, payroll processing, bookkeeping and future-period recurring work.', deliverables: 'Independent auditor report and management letter.', clientResponsibilities: 'Provide complete accounting records, supporting documents and timely management responses.', dependencies: 'Engagement acceptance, complete records and access to responsible client contacts.', period: 'Year ended 31 December 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', feeModel: 'Fixed', quantity: 1, rate: 12500, currency: 'QAR', active: true, revision: 1 },
      { id: 'SVC-REVIEW', name: 'Interim review', description: 'Limited review procedures over interim financial information.', scope: 'Review of interim financial information for the agreed period.', exclusions: 'Audit opinion, tax preparation and payroll processing.', deliverables: 'Interim review memorandum.', clientResponsibilities: 'Provide interim trial balance, schedules and management explanations.', dependencies: 'Current interim ledger and timely responses.', period: 'Quarter ended 30 June 2026', periodStart: '2026-04-01', periodEnd: '2026-06-30', feeModel: 'Fixed', quantity: 1, rate: 5000, currency: 'QAR', active: true, revision: 1 },
      { id: 'SVC-ACCOUNTING', name: 'Accounting support', description: 'Client accounting records support for an agreed period.', scope: 'Specified accounting support tasks for the period and records identified in this proposal.', exclusions: 'Audit or assurance conclusion, tax filing and payroll processing.', deliverables: 'Agreed accounting schedules and issue log.', clientResponsibilities: 'Provide source records and approve management judgments.', dependencies: 'Availability of complete source records and client approvals.', period: '01 January – 31 December 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', feeModel: 'Time & Materials', quantity: 10, rate: 250, currency: 'QAR', active: true, revision: 1 }
    ],
    proposalTemplates: [
      { id: 'PT-AUDIT-BASE', name: 'Statutory audit proposal', description: 'Base commercial content for a historical-period audit engagement.', serviceId: 'SVC-AUDIT', serviceRevision: 1, title: 'Statutory Audit Proposal', scope: 'Audit of the financial statements for the stated reporting period.', exclusions: 'Tax preparation, payroll processing, bookkeeping and future-period recurring work.', deliverables: 'Independent auditor report and management letter.', clientResponsibilities: 'Provide complete accounting records, supporting documents and timely management responses.', dependencies: 'Engagement acceptance, complete records and access to responsible client contacts.', period: 'Year ended 31 December 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', feeModel: 'Fixed', quantity: 1, rate: 12500, currency: 'QAR', terms: 'Fees are stated in the selected currency. Payment is due within 30 days of invoice. Scope changes require written agreement.', revision: 1, active: true },
      { id: 'PT-REVIEW-BASE', name: 'Interim review proposal', description: 'Base content for a limited interim review.', serviceId: 'SVC-REVIEW', serviceRevision: 1, title: 'Interim Review Proposal', scope: 'Review of interim financial information for the stated period.', exclusions: 'Audit opinion, tax preparation and payroll processing.', deliverables: 'Interim review memorandum.', clientResponsibilities: 'Provide interim trial balance, schedules and management explanations.', dependencies: 'Current interim ledger and timely responses.', period: 'Quarter ended 30 June 2026', periodStart: '2026-04-01', periodEnd: '2026-06-30', feeModel: 'Fixed', quantity: 1, rate: 5000, currency: 'QAR', terms: 'Fees are stated in the selected currency. Payment is due within 30 days of invoice. Scope changes require written agreement.', revision: 1, active: true }
    ],

    // Module 04: Engagements
    engagements: [
      {
        id: 'ENG-26001',
        client: 'CL-001',
        service: 'External audit',
        stage: 'Review',
        year: 2026,
        mode: 'External books',
        period: '01 Jan – 31 Dec 2026',
        due: '2026-09-28',
        manager: 'Layla Rahman',
        partner: 'Daniel James',
        team: ['Layla Rahman', 'Daniel James', 'Adam Khan', 'Sara Malik'],
        agreedFee: 600000,
        currency: 'QAR',
        proposalId: 'PROP-001',
        acceptance: true,
        terms: true,
        planning: true,
        sourceAccepted: true,
        mappingApproved: true,
        generation: 3,
        packageRevision: 3,
        builtGeneration: 3,
        sourceVersion: 1,
        eqrRequired: true,
        opinion: 'Unmodified — illustrative only',
        candidate: null,
        releases: [],
        archive: null,
        approvals: {
          manager: null,
          client: null,
          partner: null,
          eqr: null
        },
        eqrConcerns: [
          {
            id: 'EQR-01',
            text: 'Confirm management representation letter has been signed by both CEO and CFO.',
            resolved: true,
            raisedBy: 'Dr. Tariq Al-Sayed',
            raisedAt: '2026-09-18T10:00:00Z',
            resolvedBy: 'Layla Rahman',
            resolvedAt: '2026-09-20T14:30:00Z'
          }
        ],
        rows: [
          { code: '1000', name: 'Cash and bank balances', type: 'asset', balance: 1000000, dimensionDept: 'Treasury', mappedStatementLine: 'Cash and cash equivalents' },
          { code: '1100', name: 'Trade and other receivables', type: 'asset', balance: 500000, dimensionDept: 'Sales', mappedStatementLine: 'Trade and other receivables' },
          { code: '1500', name: 'Property, plant and equipment', type: 'asset', balance: 800000, dimensionDept: 'Operations', mappedStatementLine: 'Non-current assets' },
          { code: '2000', name: 'Trade and other payables', type: 'liability', balance: -300000, dimensionDept: 'Procurement', mappedStatementLine: 'Current liabilities' },
          { code: '2500', name: 'Bank borrowings', type: 'liability', balance: -700000, dimensionDept: 'Treasury', mappedStatementLine: 'Non-current borrowings' },
          { code: '3000', name: 'Share capital & retained earnings', type: 'equity', balance: -1000000, dimensionDept: 'Corporate', mappedStatementLine: 'Equity & reserves' },
          { code: '4000', name: 'Revenue from contracts', type: 'revenue', balance: -600000, dimensionDept: 'Commercial', mappedStatementLine: 'Revenue' },
          { code: '5000', name: 'Operating and administrative expenses', type: 'expense', balance: 300000, dimensionDept: 'Operations', mappedStatementLine: 'Operating expenses' }
        ],
        adjustment: 50000,
        journalState: 'Applied',
        sourceReflection: false,
        supplements: true,
        reconciliations: [
          {
            name: 'Cash & bank',
            ref: 'REC-01',
            accountCode: '1000',
            sourceBalance: 1000000,
            supportingBalance: 1000000,
            status: 'Cleared',
            evidence: 'Bank statements and 2 confirmations received',
            items: [
              { id: 'RI-01', date: '2026-12-31', description: 'Outstanding cheque #44019', amount: -15200, type: 'Timing item', evidenceDoc: 'DOC-REC-01' },
              { id: 'RI-02', date: '2026-12-31', description: 'Deposit in transit batch #8812', amount: 15200, type: 'Timing item', evidenceDoc: 'DOC-REC-02' }
            ]
          },
          { name: 'Trade receivables', ref: 'REC-02', accountCode: '1100', sourceBalance: 500000, supportingBalance: 500000, status: 'Cleared', evidence: 'Ageing schedule tied to trial balance' },
          { name: 'Property, plant and equipment', ref: 'REC-03', accountCode: '1500', sourceBalance: 800000, supportingBalance: 800000, status: 'Cleared', evidence: 'Asset register and depreciation schedule' },
          { name: 'Equity & reserves', ref: 'REC-04', accountCode: '3000', sourceBalance: -1000000, supportingBalance: -1000000, status: 'Cleared', evidence: 'Opening equity and current period result' }
        ],
        workpapers: [
          {
            id: 'WP-A1',
            title: 'Cash & bank',
            objective: 'Agree cash balances to the ledger, reconcile bank statements, verify confirmations/cut-off, and confirm presentation/disclosures.',
            assertion: 'Existence · Completeness · Rights & obligations · Presentation',
            risk: 'Unreconciled cash balances, unrecorded transactions, omitted bank accounts, or improper classification of restricted funds.',
            version: 2,
            status: 'Cleared',
            applicable: true,
            evidenceRefs: ['DOC-002'],
            preparer: 'Adam Khan',
            reviewer: 'Sara Malik',
            conclusion: 'Agreed all bank balances to general ledger and trial balance. Reconciled statements and inspected direct bank confirmations. Tested cut-off transactions with no exceptions noted.',
            guidelines: [
              { title: 'Independent Bank Confirmation', desc: 'Direct 100% circularisation required for all open bank accounts.', mandatory: true },
              { title: 'Bank Reconciliation Testing', desc: 'Test clearance of reconciling items in subsequent bank statements.', mandatory: true },
              { title: 'Cash Cut-Off Procedures', desc: 'Sample 5 receipts and 5 disbursements before and after year-end.', mandatory: true }
            ],
            template: {
              name: 'WP-A1 Cash and Bank Audit Schedule',
              ref: 'TPL-WP-A1-v2.0',
              version: '2.0',
              format: 'Excel (.xlsx) / CSV',
              instructions: 'Reconcile all bank accounts, record circularisation results, and clear cut-off samples.',
              csv: 'GL Code,Bank Name,Account Number,Currency,GL Balance,Bank Stmt Balance,Diff\n1000,Commercial Bank,QA00CBQA0001234567,QAR,750000.00,750000.00,0.00\n1010,Qatar National Bank,QA00QNB0009876543,QAR,250000.00,250000.00,0.00'
            },
            workingPaper: {
              file: 'WP-A1_Cash_and_Bank_Audit_Schedule.xlsx',
              name: 'WP-A1_Cash_and_Bank_Audit_Schedule.xlsx',
              size: 45200,
              version: 2,
              uploadedAt: '2026-09-21T09:30:00.000Z',
              uploadedBy: 'Adam Khan',
              local: false
            },
            supportingEvidence: [
              {
                id: 'EVD-A1-01',
                pbcId: 'PBC-02',
                title: 'Bank statement and reconciliation',
                file: 'Bank_Statement_December.pdf',
                source: 'PBC-02',
                status: 'Accepted',
                linkedAt: '2026-09-21T09:15:00.000Z'
              }
            ],
            clearance: {
              clearedBy: 'Sara Malik',
              clearedAt: '2026-09-21T10:00:00.000Z',
              sourceVersion: 1,
              generation: 3,
              version: 2,
              notes: 'Bank confirmation and year-end reconciliation agreed to trial balance. Substantive testing cleared.'
            },
            clearanceHistory: []
          },
          {
            id: 'WP-B1',
            title: 'Trade receivables',
            objective: 'Evaluate year-end receivables and supporting ageing.',
            assertion: 'Existence · Valuation',
            risk: 'Overstated or unrecoverable receivables',
            version: 2,
            status: 'Cleared',
            applicable: true,
            preparer: 'Adam Khan',
            reviewer: 'Sara Malik',
            conclusion: 'Synthetic ageing agrees to the selected trial balance.',
            guidelines: [{ title: 'Debtor Confirmation', desc: 'Sample confirmation of material debtors.', mandatory: true }],
            template: { name: 'WP-B1 Trade Receivables Schedule', ref: 'TPL-WP-B1-v1.0', version: '1.0', format: 'Excel (.xlsx)', instructions: 'Reconcile debtor balance.', csv: '' },
            workingPaper: { file: 'WP-B1_Trade_Receivables_Schedule.xlsx', name: 'WP-B1_Trade_Receivables_Schedule.xlsx', size: 38400, version: 2, uploadedAt: '2026-09-21T09:45:00Z', uploadedBy: 'Adam Khan', local: false },
            supportingEvidence: [],
            clearance: { clearedBy: 'Sara Malik', clearedAt: '2026-09-21T10:15:00Z', sourceVersion: 1, generation: 3, version: 2, notes: 'Aged debtors reconciled to trial balance; confirmations cleared.' },
            clearanceHistory: []
          },
          {
            id: 'WP-C1',
            title: 'Fixed assets',
            objective: 'Review equipment cost and the supported depreciation adjustment.',
            assertion: 'Valuation · Rights',
            risk: 'Unsupported depreciation assumptions',
            version: 3,
            status: 'Changes required',
            applicable: true,
            preparer: 'Adam Khan',
            reviewer: 'Sara Malik',
            conclusion: 'Depreciation proposal is linked to asset schedule; reviewer response pending.',
            guidelines: [{ title: 'Depreciation Testing', desc: 'Recalculate depreciation based on approved useful life.', mandatory: true }],
            template: { name: 'WP-C1 Fixed Asset Register', ref: 'TPL-WP-C1-v1.0', version: '1.0', format: 'Excel (.xlsx)', instructions: 'Verify asset additions and depreciation rates.', csv: '' },
            workingPaper: { file: 'WP-C1_Fixed_Asset_Register.xlsx', name: 'WP-C1_Fixed_Asset_Register.xlsx', size: 52100, version: 3, uploadedAt: '2026-09-21T08:50:00Z', uploadedBy: 'Adam Khan', local: false },
            supportingEvidence: [],
            clearance: null,
            clearanceHistory: []
          },
          {
            id: 'WP-F1',
            title: 'Completion & disclosures',
            objective: 'Tie final statements and complete the disclosure review.',
            assertion: 'Presentation · Completeness',
            risk: 'Missing financial statement disclosures',
            version: 1,
            status: 'Changes required',
            applicable: true,
            preparer: 'Adam Khan',
            reviewer: 'Sara Malik',
            conclusion: 'Final disclosures require management confirmation and independent clearance.',
            guidelines: [{ title: 'Disclosure Checklist', desc: 'Verify all required IFRS disclosures.', mandatory: true }],
            template: { name: 'WP-F1 Disclosure Checklist', ref: 'TPL-WP-F1-v1.0', version: '1.0', format: 'Excel (.xlsx)', instructions: 'Complete disclosure review.', csv: '' },
            workingPaper: null,
            supportingEvidence: [],
            clearance: null,
            clearanceHistory: []
          }
        ],
        reviews: [
          {
            id: 'RN-001',
            wp: 'WP-C1',
            title: 'Support the depreciation assumptions',
            body: 'Document the useful-life rationale supporting the QAR 500 depreciation adjustment. Link the updated asset schedule.',
            severity: 'High',
            status: 'Open',
            raisedBy: 'Sara Malik',
            assigned: 'Adam Khan',
            due: '2026-09-23',
            response: '',
            version: 3,
            history: []
          },
          {
            id: 'RN-002',
            wp: 'WP-F1',
            title: 'Confirm related-party disclosures',
            body: 'Obtain management confirmation and explain the applicability of the related-party note.',
            severity: 'Medium',
            status: 'Open',
            raisedBy: 'Sara Malik',
            assigned: 'Adam Khan',
            due: '2026-09-24',
            response: '',
            version: 1,
            history: []
          }
        ],
        pbc: [
          { id: 'PBC-01', title: 'Year-end trial balance', category: 'Financial records', status: 'Accepted', due: '2026-09-18', owner: 'Omar Nasser', contributor: 'Rami Nasser', file: 'FY2026_Trial_Balance.csv', version: 1 },
          { id: 'PBC-02', title: 'Bank statement and reconciliation', category: 'Cash & bank', status: 'Accepted', due: '2026-09-20', owner: 'Omar Nasser', contributor: 'Rami Nasser', file: 'Bank_Statement_December.pdf', version: 1 },
          { id: 'PBC-03', title: 'Fixed-asset register and useful lives', category: 'Fixed assets', status: 'Requested', due: '2026-09-23', owner: 'Omar Nasser', contributor: 'Rami Nasser', file: '', version: 0 },
          { id: 'PBC-04', title: 'Related-party confirmation', category: 'Disclosures', status: 'Requested', due: '2026-09-24', owner: 'Omar Nasser', contributor: 'Rami Nasser', file: '', version: 0 }
        ],
        annual: { confirmed: [], decision: null, nextId: null },
        questionnaire: { answers: { 0: true, 1: true, 2: true, 3: true }, status: 'Completed' },
        events: [
          { text: 'Financial package v3 prepared for review', ref: 'ENG-26001', time: 'Sample · 09:40', type: 'file' },
          { text: 'Sara raised a depreciation review point', ref: 'RN-001', time: 'Sample · 09:20', type: 'message' },
          { text: 'Trial balance accepted and mapped', ref: 'ENG-26001', time: 'Sample · 08:45', type: 'checkcircle' }
        ]
      },
      {
        id: 'ENG-26002',
        client: 'CL-002',
        service: 'Annual accounts',
        stage: 'Accounting',
        year: 2026,
        mode: 'Client accounting records',
        period: '01 Jan – 31 Dec 2026',
        due: '2026-10-15',
        manager: 'Layla Rahman',
        partner: 'Daniel James',
        team: ['Layla Rahman', 'Daniel James', 'Adam Khan'],
        agreedFee: 150000,
        currency: 'QAR',
        acceptance: true,
        terms: true,
        planning: true,
        sourceAccepted: true,
        mappingApproved: true,
        generation: 1,
        packageRevision: 1,
        builtGeneration: 1,
        sourceVersion: 1,
        eqrRequired: false,
        opinion: 'Compilation report',
        releases: [],
        approvals: { manager: null, client: null, partner: null, eqr: null },
        rows: [
          { code: '1000', name: 'Bank current account', type: 'asset', balance: 400000 },
          { code: '1100', name: 'Accounts receivable', type: 'asset', balance: 350000 },
          { code: '2000', name: 'Creditors and accruals', type: 'liability', balance: -150000 },
          { code: '3000', name: 'Retained capital', type: 'equity', balance: -450000 },
          { code: '4000', name: 'Consulting fees', type: 'revenue', balance: -800000 },
          { code: '5000', name: 'Consultant costs & software', type: 'expense', balance: 650000 }
        ],
        adjustment: 0,
        journalState: 'Applied',
        sourceReflection: true,
        supplements: true,
        reconciliations: [],
        workpapers: [],
        reviews: [],
        pbc: [],
        annual: { confirmed: [], decision: null, nextId: null },
        questionnaire: { answers: { 0: true, 1: true, 2: true, 3: true }, status: 'Completed' },
        events: []
      },
      // Second engagement for the SAME client: sibling-exclusion negative tests
      // (VP-019) must hide this engagement from narrow ENG-26001 grants and vice versa.
      {
        id: 'ENG-26003',
        client: 'CL-001',
        service: 'Annual accounts',
        stage: 'Accounting',
        year: 2025,
        mode: 'Client accounting records',
        period: '01 Jan – 31 Dec 2025',
        due: '2026-08-30',
        manager: 'Layla Rahman',
        partner: 'Daniel James',
        team: ['Layla Rahman', 'Nadia Rahman'],
        agreedFee: 120000,
        currency: 'QAR',
        acceptance: true,
        terms: true,
        planning: true,
        sourceAccepted: true,
        mappingApproved: false,
        generation: 1,
        packageRevision: 1,
        builtGeneration: 1,
        sourceVersion: 1,
        eqrRequired: false,
        opinion: 'Compilation report',
        releases: [],
        approvals: { manager: null, client: null, partner: null, eqr: null },
        rows: [
          { code: '1000', name: 'Cash and bank balances', type: 'asset', balance: 600000 },
          { code: '1100', name: 'Trade and other receivables', type: 'asset', balance: 200000 },
          { code: '2000', name: 'Trade and other payables', type: 'liability', balance: -150000 },
          { code: '3000', name: 'Share capital & retained earnings', type: 'equity', balance: -500000 },
          { code: '4000', name: 'Revenue from contracts', type: 'revenue', balance: -400000 },
          { code: '5000', name: 'Operating and administrative expenses', type: 'expense', balance: 250000 }
        ],
        adjustment: 0,
        journalState: 'Applied',
        sourceReflection: true,
        supplements: true,
        reconciliations: [],
        workpapers: [],
        reviews: [],
        pbc: [],
        annual: { confirmed: [], decision: null, nextId: null },
        questionnaire: { answers: { 0: true, 1: true, 2: true, 3: true }, status: 'Completed' },
        events: []
      }
    ],

    // Module 05: Jobs & Tasks
    jobs: [
      {
        id: 'JOB-2601',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        title: 'Statutory Audit Fieldwork & Substantive Testing',
        description: 'Execution of substantive testing across material areas.',
        owner: 'Layla Rahman',
        startDate: '2026-09-01',
        dueDate: '2026-09-25',
        budgetHours: 40,
        status: 'In progress',
        createdAt: '2026-09-01'
      },
      {
        id: 'JOB-2602',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        title: 'PBC Information Gathering & Document Verification',
        description: 'Collect bank statements, asset register and customer confirmations.',
        owner: 'Adam Khan',
        startDate: '2026-09-01',
        dueDate: '2026-09-20',
        budgetHours: 15,
        status: 'Completed',
        createdAt: '2026-09-01'
      }
    ],

    jobTasks: [
      { id: 'TSK-101', jobId: 'JOB-2601', title: 'Bank balances reconciliation & circularisation', assignee: 'Adam Khan', status: 'Completed', order: 1 },
      { id: 'TSK-102', jobId: 'JOB-2601', title: 'Trade receivables confirmation & ageing testing', assignee: 'Adam Khan', status: 'Completed', order: 2 },
      { id: 'TSK-103', jobId: 'JOB-2601', title: 'Fixed assets register verification and depreciation recalculation', assignee: 'Adam Khan', status: 'In progress', order: 3 },
      { id: 'TSK-103-1', jobId: 'JOB-2601', parentTaskId: 'TSK-103', title: 'Inspect purchase invoices for asset additions exceeding QAR 10,000', assignee: 'Adam Khan', status: 'Completed', order: 1 },
      { id: 'TSK-103-2', jobId: 'JOB-2601', parentTaskId: 'TSK-103', title: 'Verify depreciation useful life schedule with technical team', assignee: 'Adam Khan', status: 'In progress', order: 2 },
      { id: 'TSK-104', jobId: 'JOB-2601', title: 'Financial statement tie-out and disclosure review', assignee: 'Sara Malik', status: 'Not started', order: 4 }
    ],

    // Module 06: Job Templates
    jobTemplates: [
      {
        id: 'TPL-JOB-01',
        name: 'Standard Financial Statement Audit',
        service: 'External audit',
        description: 'Standard 4-phase audit workflow with one level of substantive subtasks.',
        defaultJobTitle: 'Statutory Audit Execution',
        status: 'Published',
        revision: 1,
        tasks: [
          { title: 'Planning & Materiality Determination', roleSuggestion: 'manager', subtasks: ['Establish preliminary materiality benchmark', 'Assess significant business and fraud risks'] },
          { title: 'Cash & Banking Verification', roleSuggestion: 'preparer', subtasks: ['Obtain direct bank confirmations', 'Reconcile year-end bank reconciliation statements'] },
          { title: 'Substantive Analytical Procedures', roleSuggestion: 'preparer', subtasks: ['Revenue variance vs budget', 'Payroll trend comparison'] },
          { title: 'Review & Reporting Clearance', roleSuggestion: 'reviewer', subtasks: ['Clear senior review points', 'Complete partner clearance memo'] }
        ]
      },
      {
        id: 'TPL-JOB-02',
        name: 'Annual Accounts Compilation Workflow',
        service: 'Annual accounts',
        description: 'Standard compilation and tax-free statutory accounts package preparation.',
        defaultJobTitle: 'Annual Accounts Compilation',
        status: 'Published',
        revision: 1,
        tasks: [
          { title: 'Trial Balance Intake & Mapping', roleSuggestion: 'preparer', subtasks: ['Import CSV/XLSX trial balance', 'Map unmapped GL accounts to standard chart'] },
          { title: 'Draft Financial Statements', roleSuggestion: 'preparer', subtasks: ['Compile Balance Sheet and P&L', 'Prepare notes to the financial statements'] }
        ]
      }
    ],

    // Module 07: Contextual Comments
    comments: [
      {
        id: 'COM-01',
        subjectType: 'engagement',
        subjectId: 'ENG-26001',
        author: 'Layla Rahman',
        authorRole: 'manager',
        createdAt: '2026-09-21T10:00:00Z',
        text: 'Initial fieldwork review underway. Fixed asset depreciation requires extra corroboration before partner sign-off.',
        visibility: 'internal',
        mentions: ['Adam Khan', 'Sara Malik']
      },
      {
        id: 'COM-02',
        subjectType: 'job',
        subjectId: 'JOB-2601',
        author: 'Adam Khan',
        authorRole: 'preparer',
        createdAt: '2026-09-22T08:30:00Z',
        text: 'Bank statements received and reconciled. Proceeding to fixed assets testing.',
        visibility: 'internal'
      }
    ],

    // Module 10 & 18: Documents & SharePoint
    documents: [
      {
        id: 'DOC-001',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        name: 'FY2026_Trial_Balance.csv',
        folderPath: '/Engagements/2026/Accounting/',
        version: 1,
        size: 14200,
        classification: 'Client provided',
        visibility: 'Client shared',
        source: 'SharePoint',
        linkedPbcId: 'PBC-01',
        uploadedBy: 'Omar Nasser',
        uploadedAt: '2026-09-18T09:00:00Z'
      },
      {
        id: 'DOC-002',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        name: 'Bank_Statement_December.pdf',
        folderPath: '/Engagements/2026/Audit/Cash/',
        version: 1,
        size: 215000,
        classification: 'Client provided',
        visibility: 'Client shared',
        source: 'SharePoint',
        linkedPbcId: 'PBC-02',
        linkedWorkpaperId: 'WP-A1',
        linkedJobId: 'JOB-2602',
        uploadedBy: 'Omar Nasser',
        uploadedAt: '2026-09-20T11:20:00Z'
      },
      {
        id: 'DOC-003',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        name: 'WP-A1_Cash_and_Bank_Audit_Schedule.xlsx',
        folderPath: '/Engagements/2026/Audit/Workpapers/',
        version: 2,
        size: 45200,
        classification: 'Working paper',
        visibility: 'Internal',
        source: 'SharePoint',
        linkedWorkpaperId: 'WP-A1',
        uploadedBy: 'Adam Khan',
        uploadedAt: '2026-09-21T09:30:00Z'
      },
      {
        id: 'DOC-004',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        name: 'Draft_Financial_Statements_v3.pdf',
        folderPath: '/Engagements/2026/Deliverables/',
        version: 3,
        size: 380000,
        classification: 'Deliverable',
        visibility: 'Client shared',
        source: 'SharePoint',
        uploadedBy: 'Layla Rahman',
        uploadedAt: '2026-09-22T14:00:00Z'
      }
    ],

    // Module 11: Communications
    communications: [
      {
        id: 'COMM-01',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        direction: 'Outbound',
        channel: 'Email',
        participants: 'Layla Rahman -> Omar Nasser',
        summary: 'Audit information request: Year-end trial balance and bank statements',
        body: 'Dear Omar,\n\nPlease find our PBC request for the FY2026 external audit attached. Kindly upload the bank reconciliations at your earliest convenience.',
        author: 'Layla Rahman',
        date: '2026-09-15T09:00:00Z',
        visibility: 'Client visible',
        status: 'Simulated accepted',
        relatedRequestId: 'PBC-01'
      },
      {
        id: 'COMM-02',
        clientId: 'CL-001',
        engagementId: 'ENG-26001',
        direction: 'Inbound',
        channel: 'Meeting',
        participants: 'Omar Nasser, Daniel James, Layla Rahman',
        summary: 'Planning & preliminary materiality meeting',
        body: 'Discussed timeline for completion by end of September. Client agreed on timetable for management representations.',
        author: 'Layla Rahman',
        date: '2026-09-16T14:30:00Z',
        visibility: 'Internal',
        status: 'Recorded manually'
      }
    ],

    emailTemplates: [
      {
        id: 'TPL-EM-01',
        name: 'PBC Document Request Notice',
        subject: 'AuditSphere: Document Request for {client_name}',
        body: 'Dear {client_contact},\n\nPlease access your client portal to review request "{request_title}" due on {due_date}.\n\nThank you,\nSTE Audit Team',
        placeholders: ['{client_name}', '{client_contact}', '{request_title}', '{due_date}']
      },
      {
        id: 'TPL-EM-02',
        name: 'Deliverable Available for Approval',
        subject: 'AuditSphere: Package Ready for Management Review - {client_name}',
        body: 'Dear {client_contact},\n\nThe financial reporting package for FY2026 has been uploaded for your review and acknowledgement.\n\nBest regards,\nSTE Audit & Accounting',
        placeholders: ['{client_name}', '{client_contact}']
      }
    ],

    // Module 12: Time Tracking
    times: [
      { id: 'TIME-01', person: 'Adam Khan', clientId: 'CL-001', engagementId: 'ENG-26001', taskTitle: 'Bank reconciliations & circularisations', date: '2026-09-21', durationMinutes: 180, budgetVersion: 1, billingRatePerHour: 200, costRatePerHour: 80, currency: 'QAR', billable: true, activity: 'Audit fieldwork', narrative: 'Tested cut-off and agreed confirmation balances.', status: 'Approved', reviewedBy: 'Layla Rahman', reviewedAt: '2026-09-22T08:00:00Z' },
      { id: 'TIME-02', person: 'Adam Khan', clientId: 'CL-001', engagementId: 'ENG-26001', taskTitle: 'Fixed-asset register verification', date: '2026-09-21', durationMinutes: 180, budgetVersion: 1, billingRatePerHour: 200, costRatePerHour: 80, currency: 'QAR', billable: true, activity: 'Audit fieldwork', narrative: 'Drafted depreciation adjustment workpaper.', status: 'Approved', reviewedBy: 'Layla Rahman', reviewedAt: '2026-09-22T08:00:00Z' },
      { id: 'TIME-03', person: 'Sara Malik', clientId: 'CL-001', engagementId: 'ENG-26001', taskTitle: 'Review of WP-A1 and WP-C1', date: '2026-09-21', durationMinutes: 120, billable: true, activity: 'Quality review', narrative: 'Senior review completed; raised RN-001 on depreciation.', status: 'Approved', reviewedBy: 'Layla Rahman', reviewedAt: '2026-09-22T08:00:00Z' },
      { id: 'TIME-04', person: 'Layla Rahman', clientId: 'CL-001', engagementId: 'ENG-26001', taskTitle: 'Manager clearance and planning tie-out', date: '2026-09-22', durationMinutes: 180, billable: true, activity: 'Management', narrative: 'Review of financial package and summary memo.', status: 'Submitted' }
    ],

    // Module 13: Budgets
    budgets: [
      {
        id: 'BDG-26001',
        engagementId: 'ENG-26001',
        version: 1,
        currency: 'QAR',
        status: 'Approved',
        lines: [
          { id: 'BL-01', roleOrActivity: 'Audit fieldwork', staffName: 'Adam Khan', plannedMinutes: 1200, billingRatePerHour: 200, costRatePerHour: 80 },
          { id: 'BL-02', roleOrActivity: 'Quality review', staffName: 'Sara Malik', plannedMinutes: 480, billingRatePerHour: 350, costRatePerHour: 140 },
          { id: 'BL-03', roleOrActivity: 'Management', staffName: 'Layla Rahman', plannedMinutes: 360, billingRatePerHour: 500, costRatePerHour: 220 }
        ]
      }
    ],

    // Module 14: Invoices & Credits
    invoices: [
      {
        id: 'INV-26001',
        clientId: 'CL-001',
        eng: 'ENG-26001',
        invoiceNumber: 'INV-2026-001',
        description: 'Statutory audit FY2026 · First milestone (50%)',
        amount: 300000,
        paid: 300000,
        currency: 'QAR',
        status: 'Paid',
        due: '2026-09-15',
        issueDate: '2026-09-01',
        preparedBy: 'Leila Hassan',
        lines: [
          { id: 'IL-01', description: 'Statutory audit kickoff and interim procedures', quantity: 1, rate: 300000, amount: 300000, sourceType: 'Fixed service', sourceId: 'PROP-001:PI-01:r2' }
        ],
        commercialApproval: { by: 'Layla Rahman', at: '2026-08-30', basis: 'Contractual agreed milestone' }
      },
      {
        id: 'INV-26002',
        clientId: 'CL-001',
        eng: 'ENG-26001',
        invoiceNumber: 'INV-2026-002',
        description: 'Statutory audit FY2026 · Substantive fieldwork & draft report',
        amount: 200000,
        paid: 0,
        currency: 'QAR',
        status: 'Issued',
        due: '2026-08-15', // Overdue for aging testing: 31-60 days bucket at 23 Sep 2026!
        issueDate: '2026-08-01',
        preparedBy: 'Leila Hassan',
        lines: [
          { id: 'IL-02', description: 'Fieldwork completion and draft reporting candidate', quantity: 1, rate: 200000, amount: 200000, sourceType: 'Fixed service', sourceId: 'PROP-001:PI-01:r2' }
        ],
        commercialApproval: { by: 'Layla Rahman', at: '2026-07-31', basis: 'Approved milestone' }
      },
      {
        id: 'INV-26003',
        clientId: 'CL-002',
        eng: 'ENG-26002',
        invoiceNumber: 'INV-2026-003',
        description: 'Annual compilation retainer',
        amount: 150000,
        paid: 0,
        currency: 'QAR',
        status: 'Draft',
        due: '2026-10-15',
        preparedBy: 'Leila Hassan',
        lines: [
          { id: 'IL-03', description: 'Annual accounts compilation retainer', quantity: 1, rate: 150000, amount: 150000, sourceType: 'Fixed service' }
        ]
      }
    ],

    creditNotes: [
      {
        id: 'CRD-01',
        invoiceId: 'INV-26002',
        clientId: 'CL-001',
        creditNumber: 'CRN-2026-001',
        amount: 20000,
        reason: 'Commercial fee adjustment agreed by partner',
        status: 'Issued',
        issueDate: '2026-08-20',
        preparedBy: 'Leila Hassan',
        reviewedBy: 'Layla Rahman'
      }
    ],

    // Module 15: Receivables & Offline Receipts
    receipts: [
      {
        id: 'RCPT-01',
        clientId: 'CL-001',
        receiptNumber: 'REC-2026-001',
        amount: 300000,
        currency: 'QAR',
        date: '2026-09-12',
        method: 'Bank transfer',
        externalRef: 'CBQ-TRF-992144',
        notes: 'Full settlement of milestone invoice INV-2026-001',
        allocatedAmount: 300000,
        allocations: [
          { invoiceId: 'INV-26001', amount: 300000, allocatedAt: '2026-09-12T10:00:00Z' }
        ]
      },
      {
        id: 'RCPT-02',
        clientId: 'CL-001',
        receiptNumber: 'REC-2026-002',
        amount: 80000,
        currency: 'QAR',
        date: '2026-09-18',
        method: 'Bank transfer',
        externalRef: 'QNB-TRF-881122',
        notes: 'Partial payment towards INV-2026-002 (QAR 60,000 allocated, QAR 20,000 unallocated)',
        allocatedAmount: 60000,
        allocations: [
          { invoiceId: 'INV-26002', amount: 60000, allocatedAt: '2026-09-18T14:00:00Z' }
        ]
      }
    ],

    // Module 21: General Ledger
    glTransactions: [
      { id: 'GL-01', journalId: 'JRN-01', lineId: 'L1', date: '2026-01-15', accountCode: '1000', accountName: 'Cash and bank balances', debit: 250000, credit: 0, currency: 'QAR', description: 'Customer receipt' },
      { id: 'GL-02', journalId: 'JRN-01', lineId: 'L2', date: '2026-01-15', accountCode: '1100', accountName: 'Trade and other receivables', debit: 0, credit: 250000, currency: 'QAR', description: 'Customer settlement' },
      { id: 'GL-03', journalId: 'JRN-02', lineId: 'L1', date: '2026-06-30', accountCode: '5000', accountName: 'Operating expenses', debit: 300000, credit: 0, currency: 'QAR', description: 'Rent and utilities payment' },
      { id: 'GL-04', journalId: 'JRN-02', lineId: 'L2', date: '2026-06-30', accountCode: '1000', accountName: 'Cash and bank balances', debit: 0, credit: 300000, currency: 'QAR', description: 'Rent and utilities payment' }
    ],

    // Module 22: Adjustment Journals
    adjustmentJournals: [
      {
        id: 'AJ-01',
        engagementId: 'ENG-26001',
        title: 'Depreciation of Fixed Assets adjustment',
        status: 'Management accepted',
        preparedBy: 'Adam Khan',
        reviewedBy: 'Sara Malik',
        managementAcceptedBy: 'Omar Nasser',
        reflectionStatus: 'Not reflected',
        reflectionSourceVersion: 1,
        evidenceRef: 'WP-C1',
        lines: [
          { accountCode: '5000', accountName: 'Operating and administrative expenses (Depreciation)', type: 'debit', amount: 50000 },
          { accountCode: '1500', accountName: 'Property, plant and equipment (Accumulated Dep.)', type: 'credit', amount: 50000 }
        ]
      }
    ],

    // Module 26: Consolidation
    consolidationGroups: [
      {
        id: 'GRP-01',
        name: 'Example Group Holdings',
        period: 'FY 2026',
        currency: 'QAR',
        reportingBasis: 'IFRS',
        manager: 'Layla Rahman',
        status: 'In progress',
        components: [
          { componentId: 'ENG-26001', role: 'Parent', legalEntityName: 'Example Trading Entity (Parent)', currency: 'QAR', ownershipPercent: 100, packageRevisionPinned: 3, status: 'Ready' },
          { componentId: 'ENG-26002', role: 'Subsidiary', legalEntityName: 'Northstar Services (Subsidiary)', currency: 'QAR', ownershipPercent: 100, packageRevisionPinned: 1, status: 'Ready' }
        ],
        fxRates: { 'QAR': 1.0, 'USD': 3.64, 'EUR': 3.95 },
        eliminations: [
          {
            id: 'ELIM-01',
            title: 'Elimination of Intercompany Management Fee',
            counterpartyA: 'Example Trading Entity',
            counterpartyB: 'Northstar Services',
            amount: 50000,
            currency: 'QAR',
            status: 'Approved',
            revision: 1,
            preparedByUserId: 'manager',
            explanation: 'Eliminate management service receivable and payable balance.',
            evidenceRef: 'SYNTHETIC-INTERCOMPANY-RECON-01',
            approvedPerimeterRevision: 1,
            approvedComponentPins: [
              { componentId: 'ENG-26001', packageRevision: 3, sourceVersion: 1 },
              { componentId: 'ENG-26002', packageRevision: 1, sourceVersion: 1 }
            ],
            approvedFxRates: { QAR: { rate: 1, revision: 0 } },
            approvalEvidenceRef: 'SYNTHETIC-GROUP-ELIM-REVIEW-01',
            lines: [
              { account: 'Trade and other payables', type: 'debit', amount: 50000 },
              { account: 'Trade and other receivables', type: 'credit', amount: 50000 }
            ]
          }
        ]
      }
    ],

    // Module 29: Risks & Programs
    auditRisks: [
      { id: 'RSK-01', engagementId: 'ENG-26001', title: 'Cash & Bank Valuation & Existence', area: 'Cash & bank', assertions: ['Existence', 'Completeness'], description: 'Risk of unrecorded bank transactions or misstated balances.', rationale: 'Material liquidity balance.', response: 'Direct bank circularisations and cut-off verification.', owner: 'Adam Khan', rating: 'Significant', linkedProcedureIds: ['PRC-01', 'PRC-02'] },
      { id: 'RSK-02', engagementId: 'ENG-26001', title: 'Trade Receivables Recoverability', area: 'Receivables', assertions: ['Valuation', 'Existence'], description: 'Risk of overdue debt becoming uncollectible.', rationale: 'Customer aging > 90 days.', response: 'Circulate debtor confirmations and review subsequent receipts.', owner: 'Adam Khan', rating: 'Medium', linkedProcedureIds: ['PRC-03'] },
      { id: 'RSK-03', engagementId: 'ENG-26001', title: 'Fixed Asset Valuation & Depreciation', area: 'Fixed assets', assertions: ['Valuation'], description: 'Risk of inappropriate useful lives or unrecorded impairment.', rationale: 'Heavy equipment fleet.', response: 'Audit depreciation schedule against industry benchmark useful lives.', owner: 'Adam Khan', rating: 'Medium', linkedProcedureIds: ['PRC-04'] }
    ],

    auditPrograms: [
      {
        id: 'PRG-01',
        engagementId: 'ENG-26001',
        area: 'Cash and Bank Balances',
        objective: 'Substantive testing to substantiate existence and ownership of bank accounts.',
        procedures: [
          { id: 'PRC-01', engagementId: 'ENG-26001', linkedRiskIds: ['RSK-01'], ref: 'P-1.1', title: 'Direct Bank Confirmation Circularisation', instructions: 'Send independent confirmation requests to all banks.', assignee: 'Adam Khan', requiredEvidence: 'Bank response letters', status: 'Cleared', workPerformed: 'Obtained standard confirmation from CBQ and QNB agreeing to trial balance.', conclusion: 'Satisfactory' },
          { id: 'PRC-02', engagementId: 'ENG-26001', linkedRiskIds: ['RSK-01'], ref: 'P-1.2', title: 'Bank Reconciliation Testing & Cut-off', instructions: 'Sample cheques and deposits for 5 days pre/post year end.', assignee: 'Adam Khan', requiredEvidence: 'Bank statements and reconciliations', status: 'Cleared', workPerformed: 'Cleared reconciling items in January 2027 bank statement.', conclusion: 'Satisfactory' }
        ]
      },
      {
        id: 'PRG-02',
        engagementId: 'ENG-26001',
        area: 'Fixed Assets and Depreciation',
        objective: 'Substantiate equipment cost, additions and depreciation recalculation.',
        procedures: [
          { id: 'PRC-04', engagementId: 'ENG-26001', linkedRiskIds: ['RSK-03'], ref: 'P-3.1', title: 'Depreciation Recalculation & Asset Register Tie-out', instructions: 'Recalculate depreciation expense and tie to ledger.', assignee: 'Adam Khan', requiredEvidence: 'Fixed asset register', status: 'Exceptions noted', workPerformed: 'Recalculated depreciation. Identified QAR 500 under-accrual. Proposed adjustment AJ-01.', hasExceptions: true, conclusion: 'Adjustment proposed' }
        ]
      },
      {
        id: 'PRG-03',
        engagementId: 'ENG-26001',
        area: 'Trade Receivables',
        objective: 'Substantiate recoverability and existence of year-end receivables.',
        procedures: [
          { id: 'PRC-03', engagementId: 'ENG-26001', linkedRiskIds: ['RSK-02'], ref: 'P-2.1', title: 'Receivables confirmation and subsequent receipts', instructions: 'Confirm material customer balances and inspect subsequent cash receipts.', assignee: 'Adam Khan', requiredEvidence: 'Customer confirmations and bank receipts', status: 'In progress', workPerformed: 'Confirmation requests prepared for material balances.', conclusion: 'Pending evidence review' }
        ]
      }
    ],

    // Module 31: Populations & Sampling
    samplePopulations: [
      {
        id: 'POP-01',
        engagementId: 'ENG-26001',
        sourceRevision: 1,
        sourceFileName: 'Seeded population excerpt',
        sourceComplete: false,
        sourceHistory: [],
        area: 'Trade Receivables Sampling',
        accountCode: '1100',
        period: 2026,
        currency: 'QAR',
        description: 'Customer balances outstanding as of 31 Dec 2026',
        totalPopulationCount: 45,
        totalPopulationValue: 500000,
        selectedCount: 3,
        selectedValue: 500000,
        items: [
          { id: 'SAMP-01', itemRef: 'CUST-001', date: '2026-12-10', counterparty: 'Customer A (Al-Doha Trading)', amount: 250000, tested: true, selected: true, result: 'Satisfactory', notes: 'Positive confirmation received agreeing balance.' },
          { id: 'SAMP-02', itemRef: 'CUST-002', date: '2026-12-15', counterparty: 'Customer B (Gulf Tech W.L.L.)', amount: 175000, tested: true, selected: true, result: 'Satisfactory', notes: 'Positive confirmation received.' },
          { id: 'SAMP-03', itemRef: 'CUST-003', date: '2026-09-18', counterparty: 'Customer C (Pearl Logistics)', amount: 75000, tested: true, selected: true, result: 'Satisfactory', notes: 'Verified subsequent clearance in January bank statements.' }
        ]
      }
    ],

    // Module 33: Evidence
    evidenceCatalogue: [
      { id: 'EVD-01', title: 'Commercial Bank Year-End Statement', documentId: 'DOC-002', version: 1, adequacyStatus: 'Adequate', receivedDate: '2026-09-20', owner: 'Adam Khan', linkedProcedures: ['PRC-01', 'PRC-02'] },
      { id: 'EVD-02', title: 'Fixed Asset Register Excel Schedule', documentId: 'DOC-003', version: 2, adequacyStatus: 'Adequate', receivedDate: '2026-09-21', owner: 'Adam Khan', linkedProcedures: ['PRC-04'] }
    ],

    // Module 34: Findings
    findings: [
      {
        id: 'FND-01',
        engagementId: 'ENG-26001',
        type: 'Monetary misstatement',
        title: 'Fixed Asset Depreciation Under-accrual',
        description: 'Equipment acquired in Q1 was depreciated at 10% instead of standard 20% useful life policy.',
        affectedAccount: '5000 - Operating and administrative expenses',
        assertion: 'Valuation',
        amount: 50000,
        currency: 'QAR',
        disposition: 'Management agreed',
        proposedCorrection: 'Record QAR 500 depreciation adjustment (AJ-01).',
        managementResponse: 'Management agreed to reflect the depreciation adjustment in the final financial statements.',
        owner: 'Adam Khan',
        linkedProcedureId: 'PRC-04',
        linkedWorkpaperId: 'WP-C1',
        linkedJournalId: 'AJ-01'
      }
    ],

    // Module 18: Microsoft 365 Setup (NO Purview!)
    m365Config: {
      tenantName: 'ste-audit-demo.onmicrosoft.com',
      tenantId: 'd48e8912-3211-4091-a1b2-9901882299aa',
      permittedUserGroups: ['STE Audit Staff', 'Client Finance Contacts'],
      permittedUsers: [{ userId: 'manager', role: 'manager' }, { userId: 'partner', role: 'partner' }],
      sharePointSite: 'https://ste-audit.demo.sharePoint.com/sites/ClientEngagements',
      sharePointLibrary: 'EngagementDocuments',
      folderRoot: '/ClientEngagements/2026',
      mailSenderAccount: 'notifications@ste-audit.demo',
      oneDriveEnabled: true,
      configRevision: 1,
      verificationResults: {},
      status: 'Not configured',
      liveConnected: false // Strictly false as per spec
    },

    // Module 39: Firm Settings
    firmSettings: {
      firmName: 'STE Audit & Accounting',
      firmLegalName: 'STE Audit & Accounting LLC',
      jurisdiction: 'State of Qatar',
      currency: 'QAR',
      timezone: 'UTC+03:00 (Asia/Qatar)',
      invoiceNumberPrefix: 'INV-2026-',
      invoiceNextNumber: 4,
      creditNumberPrefix: 'CRN-2026-',
      creditNextNumber: 2,
      paymentTermsDays: 30,
      locale: 'en-GB'
    },

    events: [
      { text: 'Initial demonstration state loaded', ref: 'SYS-INIT', time: 'Today · 08:00', type: 'checkcircle' }
    ],

    folders: [
      { path: '/Engagements/2026/', label: 'All 2026 Engagements' },
      { path: '/Engagements/2026/Accounting/', label: 'Accounting & Trial Balances' },
      { path: '/Engagements/2026/Audit/', label: 'Audit Substantive Testing' },
      { path: '/Engagements/2026/Deliverables/', label: 'Published Deliverables' },
      { path: '/PBC/', label: 'Client PBC Submissions' },
      { path: '/Clients/CL-001/2026/01_Acceptance/', label: '01 Acceptance & KYC', clientId: 'CL-001' },
      { path: '/Clients/CL-001/2026/02_Planning/', label: '02 Audit Planning', clientId: 'CL-001' },
      { path: '/Clients/CL-001/2026/03_Fieldwork/', label: '03 Substantive Fieldwork', clientId: 'CL-001' },
      { path: '/Clients/CL-001/2026/04_Deliverables/', label: '04 Signed Deliverables', clientId: 'CL-001' },
      { path: '/Clients/CL-001/2026/05_Correspondence/', label: '05 Client Communications', clientId: 'CL-001' }
    ]
  };
  for (const client of state.clients) {
    const engagements = state.engagements.filter(engagement => engagement.client === client.id);
    const chartRows = new Map(engagements.flatMap(engagement => engagement.rows).map(row => [row.code, row]));
    client.accountingProfile = {
      revision: 1,
      chartRevision: 1,
      legalEntityName: client.name,
      reportingBasis: 'IFRS',
      baseCurrency: 'QAR',
      accounts: [...chartRows.values()].map(row => ({ code: row.code, name: row.name, type: row.type, posting: true, active: true })),
      periodBooks: engagements.map(engagement => ({
        id: `PB-${engagement.id}`,
        name: engagement.period,
        bookName: engagement.mode,
        startDate: `${engagement.year}-01-01`,
        endDate: `${engagement.year}-12-31`,
        ownerEngagementId: engagement.id,
        status: 'Open' as const
      })),
      dimensions: [{ id: `DIM-DEPT-${client.id}`, name: 'Department', values: [...new Set(engagements.flatMap(engagement => engagement.rows.map(row => row.dimensionDept).filter((value): value is string => Boolean(value))))], active: true }],
      history: []
    };
    for (const engagement of engagements) {
      engagement.accountingPeriodBookId = `PB-${engagement.id}`;
      engagement.accountingProfileRevision = 1;
      engagement.accountingChartRevision = 1;
    }
  }
  for (const engagement of state.engagements) {
    engagement.packageHistory = [];
    engagement.sourceHistory = engagement.rows.length ? [{
      version: engagement.sourceVersion || 1,
      rows: structuredClone(engagement.rows),
      importedAt: state.asOfDate,
      importedBy: 'Synthetic baseline fixture',
      fileName: `seed-${engagement.id}.csv`,
      format: 'Legacy',
      accountingProfileRevision: engagement.accountingProfileRevision,
      accountingChartRevision: engagement.accountingChartRevision,
      periodBookId: engagement.accountingPeriodBookId
    }] : [];
  }

  state.accountMappingRevisions = state.engagements.filter(e => e.id === 'ENG-26001').map(engagement => ({
    engagementId: engagement.id,
    revision: 1,
    status: 'Approved' as const,
    preparedBy: 'preparer',
    reviewedBy: 'reviewer',
    mappings: engagement.rows.map(row => {
      let statementLine = 'Operating expenses';
      if (row.type === 'asset') {
        statementLine = row.code.startsWith('10') ? 'Cash and cash equivalents' : row.code.startsWith('11') ? 'Trade receivables' : row.code.startsWith('15') ? 'Property and equipment' : 'Other current assets';
      } else if (row.type === 'liability') {
        statementLine = row.code.startsWith('25') ? 'Borrowings' : 'Trade payables';
      } else if (row.type === 'equity') {
        statementLine = 'Share capital and reserves';
      } else if (row.type === 'revenue') {
        statementLine = 'Revenue';
      } else if (row.type === 'expense') {
        statementLine = row.code.startsWith('5') ? 'Cost of sales' : row.code.startsWith('7') ? 'Finance costs' : row.code.startsWith('8') ? 'Income tax' : 'Operating expenses';
      }
      return {
        accountCode: row.code,
        targets: [{ statementLine, percentage: 100 }]
      };
    })
  }));

  state.simulatedInvitations = [
    {
      id: 'INV-2026-001',
      email: 'tariq.mansoor@example.demo',
      name: 'Tariq Mansoor',
      role: 'preparer',
      scopeKind: 'Global',
      status: 'Pending',
      invitedAt: '2026-09-20T09:00:00Z',
      invitedBy: 'Daniel James',
      expiresAt: '2026-09-27T09:00:00Z'
    },
    {
      id: 'INV-2026-002',
      email: 'elena.rostova@example.demo',
      name: 'Elena Rostova',
      role: 'reviewer',
      scopeKind: 'Engagement',
      scopeId: 'ENG-26001',
      status: 'Expired',
      invitedAt: '2026-08-20T10:00:00Z',
      invitedBy: 'Daniel James',
      expiresAt: '2026-08-27T10:00:00Z'
    },
    {
      id: 'INV-2026-003',
      email: 'khalid.kuwari@client.demo',
      name: 'Khalid Al-Kuwari',
      role: 'client',
      scopeKind: 'Client',
      scopeId: 'CL-001',
      status: 'Revoked',
      invitedAt: '2026-09-10T11:00:00Z',
      invitedBy: 'Layla Rahman',
      expiresAt: '2026-09-17T11:00:00Z',
      revokedAt: '2026-09-12T14:30:00Z',
      revokedBy: 'Layla Rahman',
      revocationReason: 'Onboarding role reassigned by client management'
    },
    {
      id: 'INV-2026-004',
      email: 'mona.sulaiti@client.demo',
      name: 'Mona Al-Sulaiti',
      role: 'client',
      scopeKind: 'Client',
      scopeId: 'CL-002',
      status: 'Accepted',
      invitedAt: '2026-09-15T08:00:00Z',
      invitedBy: 'Sara Malik',
      expiresAt: '2026-09-22T08:00:00Z'
    }
  ];

  state.identityStatusHistory = [
    {
      id: 'ID-EVT-01',
      timestamp: '2026-09-10T11:00:00Z',
      action: 'Invited',
      userId: 'INV-2026-003',
      userName: 'Khalid Al-Kuwari',
      role: 'client',
      actor: 'Layla Rahman',
      reason: 'Client finance contributor onboarding invitation'
    },
    {
      id: 'ID-EVT-02',
      timestamp: '2026-09-12T14:30:00Z',
      action: 'InvitationRevoked',
      userId: 'INV-2026-003',
      userName: 'Khalid Al-Kuwari',
      role: 'client',
      actor: 'Layla Rahman',
      reason: 'Onboarding role reassigned by client management'
    },
    {
      id: 'ID-EVT-03',
      timestamp: '2026-09-20T09:00:00Z',
      action: 'Invited',
      userId: 'INV-2026-001',
      userName: 'Tariq Mansoor',
      role: 'preparer',
      actor: 'Daniel James',
      reason: 'New engagement team audit senior candidate'
    }
  ];

  state.auditProgramTemplates = [
    {
      id: 'TPL-PRG-REV',
      name: 'Revenue & Trade Receivables Audit Program',
      area: 'Revenue & Receivables',
      description: 'Standard substantive audit testing program for revenue recognition, debtor circularisation, and cut-off verification under ISA 240 / 315 / 505.',
      version: 1,
      status: 'Published',
      procedures: [
        {
          title: 'Debtor Confirmation Circularisation',
          objective: 'Confirm existence and accuracy of year-end trade receivables balances with third-party debtors.',
          instructions: 'Sample key accounts above performance materiality and circularise positive confirmation requests; reconcile signed client confirmations.',
          defaultAssertions: ['Existence', 'Rights and Obligations', 'Accuracy'],
          requiredEvidenceType: 'Third-party debtor confirmations'
        },
        {
          title: 'Substantive Analytical Procedures on Revenue',
          objective: 'Corroborate reported revenue against monthly sales volume, contract pricing, and seasonality trends.',
          instructions: 'Perform monthly variance analysis and compare gross margins across product lines against prior year benchmarks.',
          defaultAssertions: ['Occurrence', 'Completeness', 'Accuracy'],
          requiredEvidenceType: 'Monthly revenue ledger and billing analytics'
        },
        {
          title: 'Year-End Sales Cut-off Testing',
          objective: 'Verify revenue and cost of sales are recorded in the proper accounting period.',
          instructions: 'Select 15 sales invoices and delivery notes immediately before and after year-end date; verify shipping terms.',
          defaultAssertions: ['Cut-off', 'Completeness'],
          requiredEvidenceType: 'Shipping documents and post-year-end credit notes'
        }
      ]
    },
    {
      id: 'TPL-PRG-CASH',
      name: 'Cash, Bank & Financing Audit Program',
      area: 'Cash & Borrowings',
      description: 'Comprehensive audit procedures for cash, cash equivalents, bank reconciliations, and debt covenants under ISA 500 / 505.',
      version: 1,
      status: 'Published',
      procedures: [
        {
          title: 'Bank Balance Confirmation Certificates',
          objective: 'Obtain direct independent bank confirmations for all operative and dormant accounts.',
          instructions: 'Request bank certificates confirming balances, security charges, guarantees, and authorised signatories as of year-end.',
          defaultAssertions: ['Existence', 'Rights and Obligations', 'Valuation and Allocation'],
          requiredEvidenceType: 'Standard bank confirmation letters'
        },
        {
          title: 'Bank Reconciliation Clearance & Outstanding Items',
          objective: 'Verify accuracy and validity of year-end bank reconciliations and timing differences.',
          instructions: 'Inspect year-end bank reconciliation; test reconciling items and trace unpresented cheques to post-year-end bank statements.',
          defaultAssertions: ['Accuracy', 'Completeness'],
          requiredEvidenceType: 'Year-end bank statement and subsequent clearing evidence'
        }
      ]
    },
    {
      id: 'TPL-PRG-PPE',
      name: 'Property, Plant & Equipment Program',
      area: 'Fixed Assets',
      description: 'Physical inspection, ownership verification, additions testing, and depreciation recalculation procedures.',
      version: 1,
      status: 'Published',
      procedures: [
        {
          title: 'Fixed Asset Additions & Vouching',
          objective: 'Verify capital additions exceed capitalisation threshold and are properly supported.',
          instructions: 'Select sample of asset additions exceeding QAR 10,000; inspect purchase invoices, title deeds, and capital approvals.',
          defaultAssertions: ['Existence', 'Rights and Obligations', 'Valuation and Allocation'],
          requiredEvidenceType: 'Vendor invoices and ownership title documentation'
        },
        {
          title: 'Depreciation Recalculation & Useful Life Review',
          objective: 'Verify depreciation expense complies with accounting policies and rates.',
          instructions: 'Perform independent recomputation of depreciation by asset class; test for fully depreciated assets still in service.',
          defaultAssertions: ['Accuracy', 'Valuation and Allocation'],
          requiredEvidenceType: 'Fixed asset register and recomputation schedules'
        }
      ]
    },
    {
      id: 'TPL-PRG-PAY',
      name: 'Purchases, Payables & Accruals Program',
      area: 'Purchases & Payables',
      description: 'Search for unrecorded liabilities, supplier statement reconciliations, and expense accruals testing.',
      version: 1,
      status: 'Published',
      procedures: [
        {
          title: 'Search for Unrecorded Liabilities',
          objective: 'Detect unrecorded liabilities or understated trade payables at reporting date.',
          instructions: 'Review bank payments and unpaid vendor invoices for 45 days after year-end; examine matching goods received notes.',
          defaultAssertions: ['Completeness', 'Cut-off'],
          requiredEvidenceType: 'Subsequent bank payments and unvouched vendor invoices'
        },
        {
          title: 'Supplier Statement Reconciliations',
          objective: 'Verify trade payables balance agrees to external supplier statements.',
          instructions: 'Obtain year-end statements from top 10 suppliers by volume; reconcile differences to invoices in transit.',
          defaultAssertions: ['Completeness', 'Obligations', 'Valuation and Allocation'],
          requiredEvidenceType: 'Vendor account statements and reconciliation workpapers'
        }
      ]
    }
  ];

  for (const group of state.consolidationGroups) {
    for (const component of group.components) {
      const engagement = state.engagements.find(e => e.id === component.componentId);
      if (engagement && component.packageRevisionPinned === engagement.packageRevision) {
        component.packageRows = structuredClone(engagement.rows);
        component.status = 'Ready';
        component.packageReview = {
          componentId: component.componentId,
          packageRevision: engagement.packageRevision,
          sourceVersion: engagement.sourceVersion,
          reportingBasis: group.reportingBasis || 'IFRS',
          period: group.period,
          reviewedByUserId: state.users.find(user => user.name === group.manager)?.id || state.currentUserId,
          reviewedAt: state.asOfDate,
          evidenceRef: `SYNTHETIC-REVIEW-${group.id}-${component.componentId}`
        };
      }
    }
  }
  const cashWp = state.engagements.find(item => item.id === 'ENG-26001')?.workpapers.find(item => item.id === 'WP-A1');
  state.workpaperTemplates = cashWp ? [{
    id: 'TPL-WP-CASH-01', name: 'Cash and bank substantive schedule', version: 1, status: 'Published', publishedBy: 'Audit Methodology',
    objective: cashWp.objective, assertion: cashWp.assertion, risk: cashWp.risk, scope: 'Reconcile cash accounts and test confirmations and cut-off.',
    guidelines: structuredClone(cashWp.guidelines), template: structuredClone(cashWp.template), procedureRefs: ['PRC-01'],
    sampleFileName: 'WP-A1_Cash_and_Bank_Audit_Template.xlsx'
  }] : [];
  return state;
}
