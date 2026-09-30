// Generated from the reviewed Client Requirements presentation. Edit freely: this file is the source of truth for the deck.
import type { DeckSlide } from './deckTypes';

export const DECK_SLIDES: DeckSlide[] = [
  {
    "id": "s01",
    "title": "STE Audit Management Tool v2.1 — Functional Requirements",
    "section": "System Architecture",
    "chapter": "Overview",
    "note": "Standardized firm-wide execution in strict alignment with International Standards on Auditing (ISA 210, 220, 230, 320, 505, 570, 700 & 705) and IFRS. Primary currency: Qatari Riyal (QAR). Supports unlimited client entities, historical engagements, and working papers with zero subscription penalties.",
    "review": "Confirm compliance with ISA standards, unlimited entity scaling, and elimination of per-file commercial licensing penalties.",
    "boundary": "The visual prototype simulates full end-to-end data models, calculations, and regulatory gates in this browser workspace.",
    "tag": "STE SPECIFICATION V2.1",
    "subtitle": "ISA & IFRS Workflow Platform · Primary Currency: QAR · Unlimited Scale",
    "kind": "cover"
  },
  {
    "id": "s02",
    "title": "Five Core Functional Modules & Operational Handshakes",
    "section": "Core Architecture",
    "chapter": "Overview",
    "note": "The platform centralizes commercial sales, administrative governance, compliance clearance, audit fieldwork execution, multi-tier quality reviews, client deliverable generation, and internal firm practice management into a single, cohesive workflow across 5 strict functional modules.",
    "review": "Verify that data boundaries and handshakes between Module 1 (Commercial), Module 2 (Planning), Module 3 (Fieldwork), Module 4 (Reporting), and Module 5 (Practice) prevent premature execution.",
    "tag": "5 CONNECTED MODULES",
    "subtitle": "Strict handshakes ensure compliance and administrative gates are satisfied before testing begins.",
    "kind": "flow",
    "band": [
      "MODULE HANDSHAKES",
      "Commercial Dual-Key → Planning Signed Off & TB Ingested → SRM Cleared → 5-Part Bundle & 60-Day Lock."
    ],
    "steps": [
      {
        "tag": "MODULE 1",
        "heading": "Commercial & CRM Pipeline",
        "body": [
          "Lead Ingestion across 5 channels",
          "Brief Quote vs Comprehensive Proposal",
          "Dual-Key Gate & 50% Advance"
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "MODULE 2",
        "heading": "Governance & Planning",
        "body": [
          "Acceptance & Continuance Checklists",
          "5-Folder Taxonomy Provisioning",
          "Capacity Scheduling & 3-Tier Materiality"
        ],
        "icon": "i05",
        "step": 2
      },
      {
        "tag": "MODULE 3",
        "heading": "Technical Fieldwork",
        "body": [
          "TB Auto-Mapping & Split Dashboard",
          "FSLI Assertion Programs & Ad-Hoc Steps",
          "Confirmations & Summary Review Memo"
        ],
        "icon": "i01",
        "step": 3
      },
      {
        "tag": "MODULE 4 & 5",
        "heading": "Reporting, Lock & Practice",
        "body": [
          "ISA 700/705 4-Way Opinion Dropdown",
          "5-Part Deliverables & 60-Day Lock",
          "Tiered Rates & Internal Practice Ledger"
        ],
        "icon": "i06",
        "step": 4
      }
    ]
  },
  {
    "id": "s03",
    "title": "11-Stage End-to-End System State Machine",
    "section": "System Lifecycle",
    "chapter": "Overview",
    "note": "The onboarding and audit execution path enforces an automated state machine across 11 discrete states: LEAD_INGESTION → PROPOSAL_GENERATION → DUAL_KEY_PENDING → ADVANCE_BILLING → PORTAL_ACTIVE_PLANNING → FIELDWORK_EXECUTION → MANAGERIAL_REVIEW → PARTNER_APPROVAL → DELIVERABLE_RELEASE → COMPLIANCE_COUNTDOWN → ARCHIVED_READ_ONLY.",
    "review": "Confirm that each lifecycle state transition enforces its mandatory gate conditions before advancing.",
    "boundary": "Locked terminal state (ARCHIVED_READ_ONLY) enforces permanent read-only status and blocks any modification.",
    "tag": "11-STATE MACHINE",
    "subtitle": "Sequential state transitions with strict gate conditions governing engagement progression.",
    "kind": "flow",
    "band": [
      "STATE MACHINE GOVERNANCE",
      "Lead Ingestion → Dual-Key Clearance → 50% Deposit → Fieldwork → SRM → 5-Part Release → 60-Day Archive."
    ],
    "steps": [
      {
        "tag": "STATES 01–03",
        "heading": "Onboarding & Dual-Key",
        "body": [
          "LEAD_INGESTION (Contact data)",
          "PROPOSAL_GENERATION (Quote/Proposal)",
          "DUAL_KEY_PENDING (Client + Partner)"
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "STATES 04–06",
        "heading": "Billing & Fieldwork",
        "body": [
          "ADVANCE_BILLING (50% deposit paid)",
          "PORTAL_ACTIVE_PLANNING (TB & Materiality)",
          "FIELDWORK_EXECUTION (Testing & Evidence)"
        ],
        "icon": "i05",
        "step": 2
      },
      {
        "tag": "STATES 07–09",
        "heading": "Review & Deliverables",
        "body": [
          "MANAGERIAL_REVIEW (Zero open notes & SRM)",
          "PARTNER_APPROVAL (Opinion & Signature)",
          "DELIVERABLE_RELEASE (5-Part Bundle)"
        ],
        "icon": "i06",
        "step": 3
      },
      {
        "tag": "STATES 10–11",
        "heading": "Compliance & Archive",
        "body": [
          "COMPLIANCE_COUNTDOWN (60-day timer)",
          "ARCHIVED_READ_ONLY (Permanent lock)",
          "Immutable regulatory audit trail"
        ],
        "icon": "i08",
        "step": 4
      }
    ]
  },
  {
    "id": "s04",
    "title": "See the whole practice at a glance",
    "section": "Practice overview & search",
    "chapter": "Practice workspace",
    "note": "The practice dashboard summarises work, overdue items and portfolio position for the person’s permitted clients and engagements, and each counter should agree with the list behind it. Global search finds clients, jobs, tasks and documents by code or name and opens the actual record. A record the person is not permitted to see contributes no title, count or ordering.",
    "review": "Confirm which roles need the dashboard, which counters matter most, and what each role may search for.",
    "boundary": "Search is a local metadata search over the workspace records, not an AI or semantic search service. A dashboard counter of zero does not by itself mean an engagement is ready.",
    "tag": "PRACTICE OVERVIEW",
    "subtitle": "One scoped view of the firm, and a fast route to the exact record.",
    "kind": "flow",
    "band": [
      "SCOPE",
      "Every count and result must match what that person is permitted to see."
    ],
    "steps": [
      {
        "tag": "OVERVIEW",
        "heading": "Practice dashboard",
        "body": [
          "Scoped work and deadlines",
          "Overdue and open counts",
          "Filter by client or person"
        ],
        "icon": "i09",
        "step": 1
      },
      {
        "tag": "FIND",
        "heading": "Global search",
        "body": [
          "Search clients, jobs, tasks and documents",
          "Filter by record type"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "OPEN",
        "heading": "Exact record",
        "body": [
          "Land on the record itself",
          "Return to where you were",
          "Only permitted items appear"
        ],
        "icon": "i10",
        "step": 3
      }
    ]
  },
  {
    "id": "s05",
    "title": "Keep one complete client record",
    "section": "Client records (CRM)",
    "chapter": "Practice workspace",
    "note": "A client record holds the legal entity, client code, relationship owner and the contacts responsible for particular matters, with effective dates where responsibilities change. Related engagements, requests, documents, invoices and communications are reachable from the same client view so the team works from one shared history. Inactive or archived clients remain referable from historical records.",
    "review": "Agree the client information the practice must hold, who may edit it and how duplicates are prevented.",
    "boundary": "Relationship groups and custom values are for organising information only and do not authorise access to any client’s records.",
    "tag": "CLIENT RECORDS",
    "subtitle": "Clients, contacts and related work stay linked to one shared identity.",
    "kind": "flow",
    "band": [
      "IDENTITY",
      "A relationship group or custom field organises information; it never grants access."
    ],
    "steps": [
      {
        "tag": "PROFILE",
        "heading": "Client profile",
        "body": [
          "Legal entity and client code",
          "Relationship owner",
          "Custom information fields"
        ],
        "icon": "i11",
        "step": 1
      },
      {
        "tag": "CONTACTS",
        "heading": "Contacts and roles",
        "body": [
          "Primary and named contacts",
          "Responsibilities and dates",
          "Relationship groups"
        ],
        "icon": "i04",
        "step": 2
      },
      {
        "tag": "CLIENT VIEW",
        "heading": "Connected activity",
        "body": [
          "Engagements, invoices, files",
          "Requests and communications",
          "One shared history"
        ],
        "icon": "i10",
        "step": 3
      }
    ]
  },
  {
    "id": "s06",
    "title": "User Personas & Operational Responsibility Matrix",
    "section": "Governance & Roles",
    "chapter": "Acceptance & setup",
    "note": "Strict Separation of Duties (SoD) across four primary personas: PREPARER (Junior Auditor), REVIEWER (Audit Senior / Manager), APPROVER (Engagement Partner), and CLIENT (Client Coordinator / CFO). Each persona possesses explicit functional scopes and authority boundaries.",
    "review": "Confirm that permission enforcement prevents preparers from approving their own work and restricts opinion authorization to the Partner.",
    "tag": "USER PERSONAS (SEC 1.2)",
    "subtitle": "Strict Separation of Duties across Preparer, Reviewer, Approver, and Client workspaces.",
    "kind": "flow",
    "band": [
      "AUTHORITY SEPARATION",
      "Preparer executes → Reviewer verifies & challenges → Approver signs & authorizes → Client interacts in portal."
    ],
    "steps": [
      {
        "tag": "PREPARER",
        "heading": "Associate / Junior Auditor",
        "body": [
          "Executes assigned FSLI audit procedures",
          "Uploads digital files & inputs index [X-1, Box 3]",
          "Submits packages for managerial review"
        ],
        "icon": "i12",
        "step": 1
      },
      {
        "tag": "REVIEWER",
        "heading": "Senior / Audit Manager",
        "body": [
          "Verifies substantive tests & recalculated schedules",
          "Issues inline review notes & rework loops",
          "Calculates materiality & compiles SRM memo"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "APPROVER",
        "heading": "Engagement Partner",
        "body": [
          "Signs off Dual-Key Gate (AML/KYC)",
          "Executes Engagement Letter & signs SRM",
          "Authorizes final opinion, seal & 60-day lock"
        ],
        "icon": "i15",
        "step": 3
      },
      {
        "tag": "CLIENT",
        "heading": "Client Coordinator / CFO",
        "body": [
          "Accesses isolated tokenized workspace",
          "Uploads schedules & voucher evidence",
          "Access freezes upon report release"
        ],
        "icon": "i04",
        "step": 4
      }
    ]
  },
  {
    "id": "s07",
    "title": "Flow 1: Lead Ingestion to Dual-Key Client Onboarding",
    "section": "Commercial & CRM Pipeline",
    "chapter": "Acceptance & setup",
    "note": "Leads ingested across 5 channels (Phone, WhatsApp, Email, Web Forms, Referral). Commercial scope offers Brief Quotation (1-2 pages) or Comprehensive Technical Proposal. The Dual-Key Gate strictly blocks Engagement Letter generation until Key 1 (Commercial Approval) AND Key 2 (Partner AML/KYC Clearance) are confirmed active.",
    "review": "Verify that Key 1 and Key 2 are independent and that missing either key halts the onboarding pipeline.",
    "boundary": "Engagement Letter cannot be generated until commercial terms are accepted AND partner risk clearance is signed.",
    "tag": "DUAL-KEY GATEKEEPER",
    "subtitle": "Commercial fee acceptance and partner AML/KYC clearance are mandatory prerequisites.",
    "kind": "flow",
    "band": [
      "DUAL-KEY HANDSHAKE",
      "Key 1 (Commercial quote acceptance) + Key 2 (Partner AML/KYC clearance) = Pipeline Cleared."
    ],
    "groups": [
      {
        "label": "KEY 1: COMMERCIAL APPROVAL",
        "steps": [
          {
            "heading": "Lead Ingestion (5 Channels)",
            "body": [
              "Phone, WhatsApp, Email, Web, Referral",
              "Holding → Subsidiary → Affiliate tree",
              "Multi-contact directory with role routing"
            ],
            "step": 1
          },
          {
            "heading": "Commercial Proposal Engine",
            "body": [
              "Brief Quotation (1–2 pages, 50/50 terms)",
              "Comprehensive Technical Proposal (CVs & ISA)",
              "Dispatched via Email / WhatsApp link"
            ],
            "step": 2
          },
          {
            "heading": "Client Commercial Sign-Off",
            "body": [
              "Digital confirmation of scope and quote fee",
              "Activates Key 1 in state machine"
            ],
            "step": 3
          }
        ]
      },
      {
        "label": "KEY 2: PARTNER RISK CLEARANCE",
        "steps": [
          {
            "heading": "Acceptance & Continuance Risk",
            "body": [
              "New Client: AML/KYC, UBO, Integrity & Viability",
              "Continuance: 5-point delta checklist & prior fees"
            ],
            "step": 4
          },
          {
            "heading": "Partner Risk Sign-Off",
            "body": [
              "Partner executes digital acceptance gate",
              "Activates Key 2 in state machine"
            ],
            "step": 5
          },
          {
            "heading": "Dual-Key Handshake Cleared",
            "body": [
              "Auto-generates ISA 210 Engagement Letter",
              "Issues 50% advance invoice immediately"
            ],
            "step": 6
          }
        ]
      }
    ]
  },
  {
    "id": "s08",
    "title": "Engagement Letter Engine (ISA 210) & 50% Advance Billing",
    "section": "Engagement Setup & Invoicing",
    "chapter": "Acceptance & setup",
    "note": "Automatically pulls standardized templates based on engagement type: External Statutory Audit (ISA 210) or Internal Audit / Agreed-Upon Procedures (ISRS 4400). Applies Partner digital stamp and signature upon generation. Recording client settlement of 50% advance automatically issues official receipt voucher and provisions isolated client portal.",
    "review": "Confirm support for ISA 210 and ISRS 4400 templates, automated receipt vouchers, and mandatory password reset on portal provisioning.",
    "tag": "ISA 210 & ADVANCE BILLING",
    "subtitle": "Contractual agreement, partner credentials, advance settlement, and portal provisioning.",
    "kind": "flow",
    "band": [
      "BILLING & PORTAL TRIGGER",
      "50% Advance settled → Official receipt voucher generated → Client portal workspace provisioned."
    ],
    "steps": [
      {
        "tag": "TEMPLATES",
        "heading": "ISA 210 / ISRS 4400 Letter",
        "body": [
          "External Statutory Audit template",
          "Agreed-Upon Procedures template (ISRS 4400)",
          "Applies Partner digital signature & seal"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "ADVANCE INVOICE",
        "heading": "50% Commercial Deposit",
        "body": [
          "50% Advance commercial invoice issued",
          "Recorded with cheque / bank transfer reference",
          "Payment receipts dispatched automatically"
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "CLIENT PORTAL",
        "heading": "Workspace Provisioned",
        "body": [
          "Isolated external workspace created",
          "Credentials emailed with mandatory password reset",
          "Document upload window activates"
        ],
        "icon": "i04",
        "step": 3
      }
    ]
  },
  {
    "id": "s09",
    "title": "Organise and coordinate the work",
    "section": "Jobs, templates & collaboration",
    "chapter": "Practice workspace",
    "note": "A published job template supplies a repeatable structure of tasks. A manager creates a job from it, choosing people and dates, and the job pins the template revision it used. Jobs and tasks show owner, status and history; a parent cannot be completed while a required child task is open. Internal notes and mentions keep team discussion with the job and are never visible to client users.",
    "review": "Confirm the standard job templates, who may author them, and how assignment and completion are checked.",
    "boundary": "Templates do not copy prior evidence, approvals or completed work, and assignment does not grant professional approval authority. A mention is a local notice, not an email or chat service.",
    "tag": "WORK & COLLABORATION",
    "subtitle": "Plan the work once, assign it clearly and keep the team’s discussion with the record.",
    "kind": "flow",
    "band": [
      "MANUAL CONTROL",
      "Templates copy structure only; people and dates are chosen deliberately for each job."
    ],
    "steps": [
      {
        "tag": "TEMPLATE",
        "heading": "Reusable job templates",
        "body": [
          "Draft, publish and revise",
          "Tasks with one level of subtasks"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "JOBS",
        "heading": "Jobs and tasks",
        "body": [
          "Owners, dates and status",
          "Reassign with a reason",
          "Parent completes after children"
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "TEAM",
        "heading": "Internal collaboration",
        "body": [
          "Notes and staff mentions",
          "Read state and attribution",
          "Hidden from client users"
        ],
        "icon": "i04",
        "step": 3
      }
    ]
  },
  {
    "id": "s10",
    "title": "Keep communications on the record",
    "section": "Communications",
    "chapter": "Practice workspace",
    "note": "Communications are drafted from approved templates to existing client contacts, with placeholders resolved before use. The outcome is recorded as accepted, failed or unknown, and an uncertain outcome is verified before the same message is sent again. Calls, meetings and received messages can be noted manually with a visibility setting and linked to the related job, so the same history appears from the client and job views.",
    "review": "Agree the approved templates, who may send on the practice’s behalf, and the visibility rules for each type of entry.",
    "boundary": "The requirements do not establish a live mail provider, inbox synchronisation or automatic retry. Recording a message is not evidence that the client received it.",
    "tag": "COMMUNICATIONS",
    "subtitle": "Client and team communications are recorded against the client, engagement and job.",
    "kind": "flow",
    "band": [
      "TRUTHFUL STATUS",
      "A message must not be shown as delivered unless delivery was actually confirmed."
    ],
    "steps": [
      {
        "tag": "DRAFT",
        "heading": "Prepare the message",
        "body": [
          "Choose an existing contact",
          "Use an approved template",
          "Attach registered documents"
        ],
        "icon": "i13",
        "step": 1
      },
      {
        "tag": "OUTCOME",
        "heading": "Record what happened",
        "body": [
          "Accepted, failed or unknown",
          "Keep the attempt reference",
          "Verify before repeating"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "LINK",
        "heading": "Keep it connected",
        "body": [
          "Calls and meetings noted",
          "Visibility set per entry",
          "Shown in client and job history"
        ],
        "icon": "i10",
        "step": 3
      }
    ]
  },
  {
    "id": "s11",
    "title": "PBC Portal: 5-Folder Taxonomy & Real-Time Upload Lifecycle",
    "section": "Client evidence requests",
    "chapter": "Client information",
    "note": "PBC requests are structured under a strict 5-folder taxonomy: Legal, Finance & Accounting, Operations, Tax & Statutory, and HR & Payroll. Real-time status badges reflect Pending Upload, Under Review, Approved, or Rejected / Re-upload Required. When an item is rejected, a specific rejection reason is mandatory. Automatic upload freeze locks submissions once all items are approved.",
    "review": "Confirm 5-folder taxonomy, first-login password change simulation, mandatory rejection reason, and automated upload freeze.",
    "boundary": "PBC requests isolate client upload access and prevent deletion of already approved audit evidence.",
    "tag": "PBC WORKSPACE & WORKFLOW",
    "subtitle": "5-Folder taxonomy, 4 user-facing statuses, rejection audit trail, and automatic freeze.",
    "kind": "flow",
    "band": [
      "PBC GOVERNANCE",
      "5 Folders → Pending / Under Review / Approved / Rejected → Mandatory Rejection Reason → Upload Freeze on completion."
    ],
    "steps": [
      {
        "tag": "TAXONOMY",
        "heading": "5-Folder Taxonomy",
        "body": [
          "Legal (Constitutive & Contracts)",
          "Finance & Accounting (TB, GL, Schedules)",
          "Operations, Tax & Statutory, HR & Payroll"
        ],
        "icon": "i08",
        "step": 1
      },
      {
        "tag": "STATUS BADGES",
        "heading": "Real-Time Upload States",
        "body": [
          "Pending Upload & Under Review",
          "Approved (Locks item permanently)",
          "Rejected / Re-upload Required with reason"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "SECURITY & FREEZE",
        "heading": "Access & Upload Freeze",
        "body": [
          "First-login simulated password reset",
          "Automatic upload freeze upon 100% approval",
          "Maintains immutable evidence custody"
        ],
        "icon": "i20",
        "step": 3
      }
    ]
  },
  {
    "id": "s12",
    "title": "Check the accounting records before using them",
    "section": "Trial balance & general ledger",
    "chapter": "Client information",
    "note": "Accounting records enter through the trial-balance or general-ledger intake process, not simply through a document request. Checks establish whether the information is balanced, consistent, complete in its stated context and free of duplicate source entries. Professional acceptance of the source remains a separate decision from those checks.",
    "review": "Agree which source records and control totals will be used, and who resolves discrepancies.",
    "boundary": "Do not assume that every uploaded file becomes accounting data or that a balanced trial balance is sufficient audit evidence.",
    "tag": "TRIAL BALANCE & GENERAL LEDGER",
    "subtitle": "Preserve the original information and make any problems explainable.",
    "kind": "flow",
    "band": [
      "IMPORTANT DISTINCTION",
      "An uploaded spreadsheet is not automatically an accepted accounting source."
    ],
    "steps": [
      {
        "tag": "RECEIVE",
        "heading": "Identify the source",
        "body": [
          "Trial balance or general ledger",
          "Entity, period and currency",
          "Original records retained"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "CHECK",
        "heading": "Check the records",
        "body": [
          "Balance and control totals",
          "Account consistency",
          "Duplicate or incomplete information"
        ],
        "icon": "i14",
        "step": 2
      },
      {
        "tag": "PROFESSIONAL DECISION",
        "heading": "Accept for preparation",
        "body": [
          "Resolve reported issues",
          "Confirm the appropriate source",
          "Use it for the agreed work"
        ],
        "icon": "i15",
        "step": 3
      }
    ]
  },
  {
    "id": "s13",
    "title": "Explain differences and support significant balances",
    "section": "Reconciliations & schedules",
    "chapter": "Accounts preparation",
    "note": "Reconciliations connect the account balance with the underlying records and reconciling items. Valuations and specialist schedules record the inputs, assumptions and supporting evidence behind the assessment. These schedules support accounting and audit work; they do not represent a payroll or inventory transaction-processing service.",
    "review": "Confirm the schedules, valuation methods and evidence required for the client’s accounts.",
    "boundary": "The specific method and its approval must be agreed for the engagement; the presentation does not certify a professional methodology.",
    "tag": "RECONCILIATIONS & SCHEDULES",
    "subtitle": "Use analyses to support preparation and review—not to bypass professional judgment.",
    "kind": "flow",
    "band": [
      "REVIEW REQUIREMENT",
      "Keep the source, assumptions and supporting evidence attached to the conclusion."
    ],
    "steps": [
      {
        "tag": "RECONCILE",
        "heading": "Reconciliations",
        "body": [
          "Bank and account balances",
          "Reconciling items",
          "Explained differences"
        ],
        "icon": "i14",
        "step": 1
      },
      {
        "tag": "ASSESS",
        "heading": "Valuations",
        "body": [
          "Expected credit losses",
          "Inventory valuation",
          "Documented assumptions"
        ],
        "icon": "i16",
        "step": 2
      },
      {
        "tag": "SUPPORT",
        "heading": "Specialist schedules",
        "body": [
          "Assets, payroll and loans",
          "Equity and tax schedules",
          "Supporting evidence"
        ],
        "icon": "i02",
        "step": 3
      },
      {
        "heading": "Reviewed analysis → explanation or supported correction → accounting / audit work",
        "body": [],
        "step": 4,
        "outcome": true
      }
    ]
  },
  {
    "id": "s14",
    "title": "Make every reporting adjustment explainable",
    "section": "Journals & adjustments",
    "chapter": "Accounts preparation",
    "note": "A proposed journal should identify the affected accounts, balanced amounts, rationale and evidence. Required management decisions and independent review precede its use in the agreed reporting adjustments. The adjusted balances are distinguishable from the original imported records.",
    "review": "Agree the approval route for adjustments, including returned items, reversals and management responses.",
    "boundary": "Do not assume that an approved reporting adjustment is automatically posted back into the client’s own bookkeeping system.",
    "tag": "JOURNALS & ADJUSTMENTS",
    "subtitle": "A correction needs a reason, supporting evidence and the required decisions.",
    "kind": "flow",
    "band": [
      "CONTROL REQUIREMENT",
      "An adjustment must not be applied twice or silently replace the original records."
    ],
    "steps": [
      {
        "tag": "PREPARE",
        "heading": "Propose a correction",
        "body": [
          "Affected accounts",
          "Balanced journal lines",
          "Reason and supporting evidence"
        ],
        "icon": "i12",
        "step": 1
      },
      {
        "tag": "REVIEW",
        "heading": "Obtain decisions",
        "body": [
          "Required management response",
          "Appropriate reviewer approval",
          "Resolve returned items"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "ADJUSTED BALANCES",
        "heading": "Use the approved adjustment",
        "body": [
          "Apply to the reporting work",
          "Preserve the source records",
          "Retain the approval history"
        ],
        "icon": "i01",
        "step": 3
      }
    ]
  },
  {
    "id": "s15",
    "title": "Financial Statement Split Dashboard & Analytical Drill-Down",
    "section": "Account classification & mapping",
    "chapter": "Accounts preparation",
    "note": "Interactive dual-pane financial statement engine: Upper P&L (Revenue to Net Profit) and Lower Balance Sheet (Assets, Liabilities, Equity). Dynamically computes Current Year (CY) vs Prior Year (PY) variances, provides row-level concurrency guards, and direct [AR Test] and [Audit Workprogram] drill-down actions.",
    "review": "Verify split P&L and Balance Sheet presentation, CY/PY variance thresholds, and direct links to substantive fieldwork.",
    "boundary": "Financial statement figures reflect adjusted trial balance postings and must preserve the immutable audit trail.",
    "tag": "FINANCIAL STATEMENT DRILL-DOWN",
    "subtitle": "Upper P&L / Lower Balance Sheet layout with CY/PY variance and audit program linkage.",
    "kind": "flow",
    "band": [
      "FINANCIAL STATEMENT ARCHITECTURE",
      "Upper P&L + Lower Balance Sheet → CY/PY Variance % → Direct [AR Test] & [Workprogram] Drill-Down."
    ],
    "steps": [
      {
        "tag": "LAYOUT",
        "heading": "Split Dashboard Engine",
        "body": [
          "Upper pane: Income Statement (P&L)",
          "Lower pane: Balance Sheet (BS)",
          "Integrated CY and PY comparatives"
        ],
        "icon": "i16",
        "step": 1
      },
      {
        "tag": "ANALYTICS",
        "heading": "Variance & Risk Scans",
        "body": [
          "Automatic CY vs PY variance calculation",
          "Highlights significant fluctuations",
          "Row concurrency conflict detection"
        ],
        "icon": "i14",
        "step": 2
      },
      {
        "tag": "DRILL-DOWN",
        "heading": "Direct Fieldwork Links",
        "body": [
          "Direct [AR Test] substantive execution",
          "Direct [Audit Workprogram] navigation",
          "Connected Preparer → Manager review loop"
        ],
        "icon": "i10",
        "step": 3
      }
    ]
  },
  {
    "id": "s16",
    "title": "Prepare a complete, reviewable reporting package",
    "section": "Financial statements & supporting information",
    "chapter": "Accounts preparation",
    "note": "The financial package combines the adjusted accounts, approved mapping, reporting context and supplied supplementary information. Review includes consistency across the statements, notes, relevant comparatives and supporting amounts. The current package should be submitted for the appropriate review; passing calculations does not itself constitute approval.",
    "review": "Confirm the expected statements, notes, comparative information and delivery formats.",
    "tag": "FINANCIAL STATEMENTS & SUPPORTING INFORMATION",
    "subtitle": "Financial reporting combines statements, supporting information and review evidence.",
    "kind": "flow",
    "band": [
      "NOT THE SAME",
      "A package that passes its arithmetic checks still needs the required human review and approval."
    ],
    "steps": [
      {
        "tag": "PREPARE",
        "heading": "Assemble the inputs",
        "body": [
          "Adjusted trial balance",
          "Approved classifications",
          "Notes and comparative information"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "CHECK",
        "heading": "Check the package",
        "body": [
          "Period and currency agree",
          "Statements and notes cross-cast",
          "Explain outstanding checks"
        ],
        "icon": "i14",
        "step": 2
      },
      {
        "tag": "REVIEW-READY OUTPUT",
        "heading": "Submit the reporting package",
        "body": [
          "Financial statements",
          "Supporting reports and evidence",
          "Current version for review"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s17",
    "title": "Flow 2: 3-Tier Materiality Calculation & Account Risk Stratification",
    "section": "Audit planning",
    "chapter": "Audit & assurance",
    "note": "Computes Overall Materiality (OM) using strict ISA benchmarks: PBT (5–10%), Revenue (0.5–2%), Assets (0.5–1%), or Equity (1–2%). Tolerable Error / Performance Materiality (TE: 50–75% of OM), Summary of Audit Differences (SAD: 3–5% of OM). Rounding rule within ±5% of exact calculation. Account Risk Stratification: Green (<TE), Amber (TE..PM), Red (>PM), with mandatory override forcing critical accounting estimates and high inherent-risk accounts to RED. Requires formal Partner sign-off.",
    "review": "Confirm benchmark range validation, TE 50-75%, SAD 3-5%, rounding constraint, Red override for critical estimates, and partner-only planning approval.",
    "boundary": "Audit planning and materiality parameters cannot be locked without formal Engagement Partner digital sign-off.",
    "tag": "MATERIALITY & RISK ENGINE (FLOW 2)",
    "subtitle": "OM benchmarks, TE (50–75%), SAD (3–5%), Green/Amber/Red logic with high-risk override.",
    "kind": "flow",
    "band": [
      "ISA PLANNING BENCHMARKS",
      "Benchmark (PBT/Rev/Assets/Eq) → OM → TE (50-75%) → SAD (3-5%) → High-Risk RED Override → Partner Sign-off."
    ],
    "steps": [
      {
        "tag": "BENCHMARKS",
        "heading": "Overall Materiality (OM)",
        "body": [
          "PBT (5–10%), Revenue (0.5–2%)",
          "Assets (0.5–1%), Equity (1–2%)",
          "Hard range enforcement & ±5% rounding"
        ],
        "icon": "i14",
        "step": 1
      },
      {
        "tag": "TE & SAD",
        "heading": "Performance & Trivial Thresholds",
        "body": [
          "Tolerable Error (TE): 50%–75% of OM",
          "Summary of Audit Differences (SAD): 3%–5%",
          "Clearly trivial posting boundary"
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "STRATIFICATION",
        "heading": "Account Risk & Partner Sign-Off",
        "body": [
          "Green (<TE), Amber (TE..PM), Red (>PM)",
          "Mandatory RED override for critical estimates",
          "Formal Engagement Partner digital sign-off"
        ],
        "icon": "i18",
        "step": 3
      }
    ]
  },
  {
    "id": "s18",
    "title": "Flow 3: FSLI Workprograms & 3-Engine Sampling Methodology",
    "section": "Audit populations, sampling & fieldwork",
    "chapter": "Audit & assurance",
    "note": "Standardized FSLI audit programs preloaded with the 5 core ISA assertions: Ownership, Valuation, Completeness, Existence, and Cut-off, with support for ad-hoc procedures. Integrated sampling engine provides Monetary Unit Sampling (MUS), Systematic Random Sampling, and Stratified Attribute Sampling. Workpapers enforce structured referencing format (e.g. X-1, Box 3).",
    "review": "Verify 5 assertion procedures per FSLI, ad-hoc procedural expansion, 3 sampling engines, and workpaper box-reference indexing.",
    "boundary": "Sample selections and test findings are permanently linked to the underlying general ledger population.",
    "tag": "FSLI PROGRAMS & SAMPLING (FLOW 3)",
    "subtitle": "5 ISA assertions (Ownership, Valuation, Completeness, Existence, Cut-off) & 3 sampling algorithms.",
    "kind": "flow",
    "band": [
      "FIELDWORK WORKPROGRAMS & SAMPLING",
      "5 Assertions → MUS / Systematic Random / Stratified Attribute → Structured WP References."
    ],
    "steps": [
      {
        "tag": "ASSERTIONS",
        "heading": "5 Core ISA Assertions",
        "body": [
          "Ownership & Rights/Obligations",
          "Valuation & Allocation, Completeness",
          "Existence and Cut-off procedures"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "SAMPLING",
        "heading": "3 Sampling Algorithms",
        "body": [
          "Monetary Unit Sampling (MUS)",
          "Systematic Random Sampling (interval)",
          "Stratified Attribute Sampling"
        ],
        "icon": "i14",
        "step": 2
      },
      {
        "tag": "EVIDENCE",
        "heading": "Workpaper Referencing",
        "body": [
          "Structured references (e.g., X-1, Box 3)",
          "Ad-hoc custom audit procedures",
          "Preparer execution & Senior review stamps"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s19",
    "title": "Keep workpapers, findings and responses together",
    "section": "Workpapers & findings",
    "chapter": "Audit & assurance",
    "note": "Working content records the objective, procedure, evidence, work performed and conclusion. Submission identifies the version the reviewer considers. Findings and management responses explain the correction outcome, while revised work must remain distinguishable from the previously submitted work.",
    "review": "Agree how workpaper submissions, review matters, management responses and revised conclusions are handled.",
    "boundary": "Finding responses are not a substitute for a separately agreed longer-term remediation and follow-up process.",
    "tag": "WORKPAPERS & FINDINGS",
    "subtitle": "Distinguish work in progress from the version submitted for review.",
    "kind": "flow",
    "band": [
      "REVIEW INTEGRITY",
      "A later edit must not silently replace the work that the reviewer previously considered."
    ],
    "steps": [
      {
        "tag": "PREPARE",
        "heading": "Working paper",
        "body": [
          "Objective and procedure",
          "Work performed",
          "Evidence and conclusion"
        ],
        "icon": "i12",
        "step": 1
      },
      {
        "tag": "REVIEW RECORD",
        "heading": "Submit for review",
        "body": [
          "Keep the submitted version",
          "Identify review matters",
          "Retain supporting evidence"
        ],
        "icon": "i02",
        "step": 2
      },
      {
        "tag": "FOLLOW-UP",
        "heading": "Resolve the findings",
        "body": [
          "Management response",
          "Correction outcome",
          "Updated conclusion where needed"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s20",
    "title": "Confirmation Controls (5 Types), Holding Letter Blocker & SRM",
    "section": "Audit completion",
    "chapter": "Audit & assurance",
    "note": "Independent confirmations tracked across 5 mandatory categories: Bank, Accounts Receivable (AR), Accounts Payable (AP), Inventory, and Legal. Outstanding critical confirmations automatically trigger the Holding Letter generation and block release. Summary of Review Matters (SRM) aggregates PM/TE/SAD, risks, findings, AJEs, and critical confirmations for Partner clearance.",
    "review": "Confirm tracking for Bank, AR, AP, Inventory, Legal; Holding Letter generation; and comprehensive SRM synthesis.",
    "boundary": "Audit report release cannot proceed if critical confirmations remain outstanding without an authorized Holding Letter rationale.",
    "tag": "CONFIRMATIONS & SRM SYNTHESIS",
    "subtitle": "5 confirmation classes, Holding Letter blocker, and Summary of Review Matters (SRM).",
    "kind": "flow",
    "band": [
      "COMPLETENESS & CLEARANCE",
      "Bank / AR / AP / Inventory / Legal → Outstanding Blocker → Holding Letter → SRM Synthesis."
    ],
    "steps": [
      {
        "tag": "CONFIRMATIONS",
        "heading": "5 Confirmation Categories",
        "body": [
          "Bank, Accounts Receivable (AR)",
          "Accounts Payable (AP), Inventory",
          "Legal representation letters"
        ],
        "icon": "i10",
        "step": 1
      },
      {
        "tag": "BLOCKER",
        "heading": "Holding Letter Gatekeeper",
        "body": [
          "Critical confirmations flagged in system",
          "Unreceived letters block report release",
          "Generates ISA Holding Letter to management"
        ],
        "icon": "i18",
        "step": 2
      },
      {
        "tag": "SRM SUMMARY",
        "heading": "Summary of Review Matters",
        "body": [
          "Synthesizes OM/TE/SAD & risks",
          "Aggregates AJEs & unadjusted differences",
          "Senior/Manager review before Partner sign-off"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s21",
    "title": "Flow 4: ISA 700/705 4-Way Opinion Engine & Partner Authorization",
    "section": "Review & approval",
    "chapter": "Review & release",
    "note": "Audit Opinion selection dropdown enforcing the 4 ISA standards: Unmodified (Clean), Qualified, Disclaimer, or Adverse. For Qualified, Disclaimer, or Adverse opinions, the engine strictly enforces the selection of affected FSLI account areas and mandatory minimum 20-character rationale. Review loop allows Preparer → Reviewer return/rework, with final opinion authorization strictly restricted to the Engagement Partner.",
    "review": "Confirm 4-way opinion dropdown, mandatory FSLI and rationale for Qualified/Disclaimer/Adverse, and partner-only sign-off.",
    "boundary": "Only an authorized Engagement Partner can digitally sign and lock the statutory audit opinion.",
    "tag": "OPINION SELECTION (FLOW 4)",
    "subtitle": "Unmodified, Qualified, Disclaimer, Adverse with mandatory FSLI rationale and Partner sign-off.",
    "kind": "flow",
    "band": [
      "ISA 700 / 705 OPINION LOGIC",
      "4-Way Dropdown → FSLI & Rationale for Qualified/Disclaimer/Adverse → Partner-Exclusive Sign-Off."
    ],
    "steps": [
      {
        "tag": "4 OPINIONS",
        "heading": "ISA 700 / 705 Opinions",
        "body": [
          "Unmodified (Clean Opinion)",
          "Qualified (Material not Pervasive)",
          "Disclaimer (Lack of Evidence) & Adverse (Pervasive)"
        ],
        "icon": "i15",
        "step": 1
      },
      {
        "tag": "RATIONALE",
        "heading": "Mandatory FSLI & Rationale",
        "body": [
          "Target FSLI selection required for non-clean",
          "Min 20-character professional justification",
          "Enforced before report generation"
        ],
        "icon": "i12",
        "step": 2
      },
      {
        "tag": "PARTNER GATE",
        "heading": "Partner Sign-Off & Rework",
        "body": [
          "Preparer → Senior → Manager rework loop",
          "Partner-exclusive digital signature authority",
          "Locks final opinion and deliverables"
        ],
        "icon": "i04",
        "step": 3
      }
    ]
  },
  {
    "id": "s22",
    "title": "Mandatory 5-Part Deliverables Release Bundle & Settlement",
    "section": "Controlled issue & delivery",
    "chapter": "Review & release",
    "note": "Final audit release generates the mandatory 5-part commercial and technical bundle: 1. Independent Auditor's Report (signed & stamped with dynamic Partner credentials), 2. Audited Financial Statements, 3. Management Letter (Internal Control Deficiencies), 4. Communication with TCWG, and 5. Final 50% Balance Settlement Commercial Invoice. Final release authorization strictly belongs to the Engagement Partner.",
    "review": "Verify exact 5-part bundle generation, dynamic partner signature credentials, and partner-only release authorization.",
    "boundary": "Deliverables cannot be dispatched or client portal access granted to final reports without partner digital authorization.",
    "tag": "5-PART DELIVERABLES BUNDLE",
    "subtitle": "Audit report, audited FS, management letter, TCWG letter, and final 50% billing invoice.",
    "kind": "flow",
    "band": [
      "COMMERCIAL & AUDIT RELEASE",
      "5 Deliverables Generated → Dynamic Partner Credentials → Final 50% Invoice Issued."
    ],
    "steps": [
      {
        "tag": "BUNDLE",
        "heading": "5 Mandatory Deliverables",
        "body": [
          "1. Independent Auditor's Report",
          "2. Audited Financial Statements",
          "3. Management Letter & 4. TCWG Letter"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "CREDENTIALS",
        "heading": "Dynamic Partner Credentials",
        "body": [
          "Assigned Engagement Partner name & title",
          "Digital firm seal and stamp application",
          "Partner-exclusive authorization control"
        ],
        "icon": "i15",
        "step": 2
      },
      {
        "tag": "SETTLEMENT",
        "heading": "Final 50% Commercial Balance",
        "body": [
          "Final 50% invoice generated automatically",
          "Tied to engagement commercial fee total",
          "Official receipt voucher upon clearance"
        ],
        "icon": "i01",
        "step": 3
      }
    ]
  },
  {
    "id": "s23",
    "title": "ISA 230 Electronic File Freeze: 60-Day Lock & Partner Early Lock",
    "section": "File assembly & records",
    "chapter": "Review & release",
    "note": "Conforms strictly to ISA 230 audit documentation assembly: 60-calendar-day countdown begins immediately upon audit report sign-off date. Once expired, the engagement file permanently freezes into immutable read-only state. In addition, the Engagement Partner possesses a manual early freeze command to lock the working papers at any point prior to the 60-day limit.",
    "review": "Confirm 60-day countdown timer from report date, Partner manual early lock capability, and immutable read-only enforcement.",
    "boundary": "Once frozen, working papers, trial balances, and audit conclusions become strictly read-only.",
    "tag": "ISA 230 FILE ASSEMBLY & FREEZE",
    "subtitle": "60-Calendar-day countdown lock + Engagement Partner manual early lock command.",
    "kind": "flow",
    "band": [
      "RETENTION & ARCHIVE GATE",
      "Report Date → 60-Day Countdown OR Partner Manual Early Lock → Immutable Read-Only Freeze."
    ],
    "steps": [
      {
        "tag": "COUNTDOWN",
        "heading": "60-Day Countdown Timer",
        "body": [
          "Begins on audit report sign-off date",
          "Displays days remaining until automatic freeze",
          "Conforms to ISA 230 retention rules"
        ],
        "icon": "i05",
        "step": 1
      },
      {
        "tag": "EARLY LOCK",
        "heading": "Partner Early Lock",
        "body": [
          "Engagement Partner manual freeze command",
          "Bypasses remaining countdown on demand",
          "Applies instantaneous immutable lock"
        ],
        "icon": "i20",
        "step": 2
      },
      {
        "tag": "IMMUTABLE",
        "heading": "Read-Only Archive State",
        "body": [
          "All working papers & schedules frozen",
          "Modifications and uploads blocked",
          "Browser-local prototype disclosure visible"
        ],
        "icon": "i08",
        "step": 3
      }
    ]
  },
  {
    "id": "s24",
    "title": "Consolidate approved components, not client books",
    "section": "Group reporting",
    "chapter": "Group & practice",
    "note": "Consolidation starts with an approved group perimeter and approved component reporting information. The applicable method governs currency translation and group adjustments, including intercompany eliminations. An independent reviewer considers the balanced group result and its supporting inputs.",
    "review": "Agree the group perimeter, component approval requirements, currency approach and review responsibilities.",
    "boundary": "Group-report delivery and archiving need separate confirmation; do not assume the entity-report release route applies automatically.",
    "tag": "GROUP REPORTING",
    "subtitle": "Keep a clear bridge from each component to the consolidated result.",
    "kind": "flow",
    "band": [
      "SEPARATE BOOKS",
      "Group consolidation must not alter the component clients’ original books."
    ],
    "steps": [
      {
        "tag": "COMPONENTS",
        "heading": "Approve the group inputs",
        "body": [
          "Consolidation perimeter",
          "Approved component packs",
          "Ownership and reporting basis"
        ],
        "icon": "i03",
        "step": 1
      },
      {
        "tag": "CONSOLIDATION",
        "heading": "Prepare the group result",
        "body": [
          "Required currency translation",
          "Intercompany matching",
          "Group elimination entries"
        ],
        "icon": "i14",
        "step": 2
      },
      {
        "tag": "GROUP REVIEW",
        "heading": "Review the consolidated result",
        "body": [
          "Balanced group totals",
          "Trace amounts to components",
          "Independent approval"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s25",
    "title": "Flow 5: Practice Management, Tiered Charge-Out Rates & Profitability",
    "section": "Practice finance",
    "chapter": "Group & practice",
    "note": "Operational practice management engine operating in Qatari Riyal (QAR). Standard charge-out rates: Partner 1,000 QAR/hr, Senior Manager/Manager 750 QAR/hr, Senior Auditor 500 QAR/hr, Junior Auditor 200 QAR/hr. Computes gross engagement margin, internal firm P&L, firm trial balance including operational expenses and Partner Withdrawals, AR aging buckets (Current, 30, 60, 90+ days), and daily engagement/FSLI staff time entry.",
    "review": "Confirm 1,000/750/500/200 QAR rate structure, Partner Withdrawals equity/expense line, and daily FSLI time tracking.",
    "boundary": "Firm operational finances and partner equity withdrawals are strictly isolated from client engagement trust ledgers.",
    "tag": "PRACTICE FINANCE (FLOW 5)",
    "subtitle": "1,000/750/500/200 QAR rates, Partner Withdrawals, Firm P&L/TB, AR aging & daily FSLI time entry.",
    "kind": "flow",
    "band": [
      "PRACTICE MANAGEMENT & PROFITABILITY",
      "Standard Rates → Daily FSLI Time → Firm P&L & Partner Withdrawals → AR Aging."
    ],
    "steps": [
      {
        "tag": "RATES",
        "heading": "Tiered Charge-Out Rates (QAR)",
        "body": [
          "Partner: 1,000 QAR / hr",
          "Manager: 750 QAR / hr, Senior: 500 QAR / hr",
          "Junior Auditor: 200 QAR / hr"
        ],
        "icon": "i21",
        "step": 1
      },
      {
        "tag": "TIME & EXPENSES",
        "heading": "Daily FSLI Time & Expenses",
        "body": [
          "Daily time entry per engagement & FSLI",
          "Operational expense ledger & postings",
          "Dedicated Partner Withdrawals account"
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "PROFITABILITY",
        "heading": "Firm P&L, TB & AR Aging",
        "body": [
          "Real-time engagement margin & realization",
          "Firm Trial Balance & internal P&L",
          "AR aging buckets (Current, 30, 60, 90+)"
        ],
        "icon": "i16",
        "step": 3
      }
    ]
  },
  {
    "id": "s26",
    "title": "Report on the practice’s performance",
    "section": "Reporting & analytics",
    "chapter": "Group & practice",
    "note": "The reporting centre offers a role-appropriate catalogue of practice reports covering work in progress, time, billing, receivables and records. A user filters by client, period or currency, opens the underlying records and compares totals before exporting or printing. A filtered report must not include another client’s information, and figures that lack the rates needed to be derived are shown as unavailable.",
    "review": "Confirm the reports each role needs, the definitions of approved time, work in progress and invoiced amounts, and export formats.",
    "boundary": "These are reports on the practice’s recorded information. They are not statutory accounts, AI analytics or a live business-intelligence connection.",
    "tag": "REPORTING & ANALYTICS",
    "subtitle": "Reports explain the practice’s own records and reconcile to their source.",
    "kind": "flow",
    "band": [
      "RECONCILE",
      "Every report figure should agree with the records it summarises."
    ],
    "steps": [
      {
        "tag": "CATALOGUE",
        "heading": "Choose the report",
        "body": [
          "Practice, billing and records reports",
          "Catalogue suited to the role"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "FILTER",
        "heading": "Scope and check",
        "body": [
          "Client, date and currency",
          "Open the source records",
          "Compare totals and counts"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "SHARE",
        "heading": "Export or print",
        "body": [
          "Export data for review",
          "Print a clear layout",
          "Only the permitted scope"
        ],
        "icon": "i13",
        "step": 3
      }
    ]
  },
  {
    "id": "s27",
    "title": "Close the period without losing the history",
    "section": "Period close, reopening & restatement",
    "chapter": "Group & practice",
    "note": "Period closure is tied to the required current reviews. Reopening and restatement are governed changes that preserve a link to the earlier reporting record rather than replacing history. Work for the next period requires its own setup and the applicable continuance or acceptance decisions.",
    "review": "Agree the period-close checklist, reopening authority and restatement approval route.",
    "boundary": "Do not assume an automatic next-year engagement or automatic carry-forward of every prior approval.",
    "tag": "PERIOD CLOSE, REOPENING & RESTATEMENT",
    "subtitle": "A correction to past reporting must remain distinguishable from the original.",
    "kind": "flow",
    "band": [
      "NEXT PERIOD",
      "A new reporting period needs its own context and the applicable acceptance and review decisions."
    ],
    "steps": [
      {
        "tag": "CLOSE",
        "heading": "Close the period",
        "body": [
          "Complete the applicable reviews.",
          "Confirm the package being closed."
        ],
        "icon": "i15",
        "step": 1
      },
      {
        "tag": "REOPEN",
        "heading": "Reopen with a reason",
        "body": [
          "Follow the controlled change route.",
          "Retain the earlier reporting history."
        ],
        "icon": "i19",
        "step": 2
      },
      {
        "tag": "RESTATE",
        "heading": "Record a restatement",
        "body": [
          "Keep the original and revised record.",
          "Identify what changed and why."
        ],
        "icon": "i12",
        "step": 3
      }
    ]
  },
  {
    "id": "s28",
    "title": "Make document sharing appropriate for the engagement",
    "section": "Client access & document workspace",
    "chapter": "Operational controls",
    "note": "Staff and client participation depends on an approved access arrangement. Engagement documents belong in the agreed workspace, with access limited to the appropriate parties. Before live use, confirm that document exchange and receipt work as intended for the correct engagement.",
    "review": "Confirm the approved document location, client contacts, access owner and receipt arrangements.",
    "boundary": "The earlier review did not verify a live document-sharing arrangement. This page describes the business readiness requirement, not a confirmed connection.",
    "tag": "CLIENT ACCESS & DOCUMENT WORKSPACE",
    "subtitle": "People, documents and their access permissions must match the agreed scope.",
    "kind": "flow",
    "band": [
      "READINESS",
      "Saving an access or sharing arrangement is not proof that document exchange is ready for use."
    ],
    "steps": [
      {
        "tag": "PEOPLE",
        "heading": "Agree who can participate",
        "body": [
          "Named staff and client contacts",
          "Permitted client engagements",
          "Access kept current"
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "DOCUMENTS",
        "heading": "Agree where files belong",
        "body": [
          "Approved document workspace",
          "Appropriate client separation",
          "Clear evidence ownership"
        ],
        "icon": "i08",
        "step": 2
      },
      {
        "tag": "BEFORE USE",
        "heading": "Confirm the working handover",
        "body": [
          "Check the exchange works",
          "Confirm receipt of files",
          "Confirm client access is appropriate"
        ],
        "icon": "i15",
        "step": 3
      }
    ]
  },
  {
    "id": "s29",
    "title": "Connect Microsoft 365 for documents and mail",
    "section": "Microsoft 365 setup",
    "chapter": "Operational controls",
    "note": "An administrator records the document site, library, mail sender and people mapping, then tests document storage and mail separately. Optional personal storage is enabled only deliberately. Each test states whether it succeeded, failed or is unknown, and a failure or disconnection can be recovered without stopping unrelated engagement work. Access to any client’s documents is still governed by the separate engagement access arrangement.",
    "review": "Confirm the tenant, document locations, mail sender and who is responsible for each connection.",
    "boundary": "The discovery did not establish live connection to Microsoft services. Results shown are simulated, and a completed setup is not proof that live document exchange or mail is ready.",
    "tag": "MICROSOFT 365 SETUP",
    "subtitle": "Set up the document workspace and mail sender, and show every check honestly.",
    "kind": "flow",
    "band": [
      "SEPARATE CHECKS",
      "A mail test failing does not invalidate the document workspace, and the reverse."
    ],
    "steps": [
      {
        "tag": "CONNECT",
        "heading": "Set up the tenant",
        "body": [
          "Site, library and sender",
          "People and role mapping",
          "Optional personal storage"
        ],
        "icon": "i11",
        "step": 1
      },
      {
        "tag": "CHECK",
        "heading": "Test each service",
        "body": [
          "Document storage test",
          "Mail sender test",
          "A failed test stays visible"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "RECOVER",
        "heading": "Reconnect safely",
        "body": [
          "Disconnect or change site",
          "Recover from a failure",
          "Other work continues"
        ],
        "icon": "i10",
        "step": 3
      }
    ]
  },
  {
    "id": "s30",
    "title": "Administer the firm’s settings",
    "section": "Firm administration",
    "chapter": "Operational controls",
    "note": "Firm settings such as numbering, payment terms, time zone and service defaults are changed by an authorised administrator with a reason, and each change is kept as a revision. New drafts use the new defaults, while issued invoices and released reports keep the values they had when created. User access is managed separately and an administrator role does not carry professional approval authority.",
    "review": "Confirm who may change firm settings, which defaults the practice needs, and how numbering conflicts are handled.",
    "boundary": "Settings are not a route to tax, payroll, payment initiation or automated features, and they must not rewrite historic records.",
    "tag": "FIRM ADMINISTRATION",
    "subtitle": "Firm-wide defaults have one owner and take effect for future work.",
    "kind": "flow",
    "band": [
      "SEPARATE AUTHORITY",
      "System administration does not confer professional review or approval powers."
    ],
    "steps": [
      {
        "tag": "SETTINGS",
        "heading": "Set firm defaults",
        "body": [
          "Numbering and prefixes",
          "Payment terms and time zone",
          "Service defaults"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "FUTURE WORK",
        "heading": "Apply prospectively",
        "body": [
          "New drafts use new values",
          "Reason and revision kept",
          "Invalid values rejected"
        ],
        "icon": "i21",
        "step": 2
      },
      {
        "tag": "HISTORY",
        "heading": "Protect what was issued",
        "body": [
          "Issued invoices unchanged",
          "Released reports unchanged",
          "Access managed separately"
        ],
        "icon": "i02",
        "step": 3
      }
    ]
  },
  {
    "id": "s31",
    "title": "Make exceptions visible and recoverable",
    "section": "Shared business controls",
    "chapter": "Operational controls",
    "note": "The business user needs a truthful status when work cannot proceed. Missing or changed information may require correction and renewed review. An uncertain delivery or processing outcome should be verified before the same action is repeated, so duplicate effects are not mistaken for successful recovery.",
    "review": "Agree how outstanding issues are reported and who decides that it is safe to continue.",
    "tag": "SHARED BUSINESS CONTROLS",
    "subtitle": "Do not hide missing information, changed inputs or uncertain outcomes.",
    "kind": "flow",
    "band": [
      "TRUTHFUL STATUS",
      "“In progress,” “blocked” and “complete” must reflect what has actually happened."
    ],
    "steps": [
      {
        "tag": "NEEDS ATTENTION",
        "heading": "Information is incomplete",
        "body": [
          "Show what is missing.",
          "Resolve it before progressing."
        ],
        "icon": "i18",
        "step": 1
      },
      {
        "tag": "REVIEW AGAIN",
        "heading": "Information has changed",
        "body": [
          "Identify the affected work.",
          "Recheck the required approvals."
        ],
        "icon": "i19",
        "step": 2
      },
      {
        "tag": "CONFIRM OUTCOME",
        "heading": "An outcome is uncertain",
        "body": [
          "Keep the work visibly unresolved.",
          "Verify before repeating the action."
        ],
        "icon": "i22",
        "step": 3
      }
    ]
  },
  {
    "id": "s32",
    "title": "Every module, mapped to its requirement",
    "section": "Module coverage",
    "chapter": "Client review",
    "note": "This page lists all 39 AuditSphere modules and the slides in this presentation that set out their business requirement. It is a navigation aid: where a module supports several requirements, more than one slide is shown. The numbers on the right are slide numbers.",
    "review": "Check that every module the practice expects to use appears here against a requirement that matches how the firm works.",
    "boundary": "Listing a module against a requirement is not a statement that its behaviour has been demonstrated or accepted for live use.",
    "tag": "MODULE COVERAGE",
    "subtitle": "All 39 AuditSphere modules and the slide that sets out their business requirement.",
    "kind": "coverage"
  },
  {
    "id": "s33",
    "title": "Confirm the handovers before relying on live use",
    "section": "Client confirmation points",
    "chapter": "Client review",
    "note": "The discovery did not establish every end-to-end handover. These confirmation points are important to the business workflow and should remain visible rather than being presented as completed capabilities. Agreement on the process and demonstration in the intended operating setting are separate from a requirements presentation.",
    "review": "Record the responsible owner and acceptance evidence for each relevant handover.",
    "boundary": "This is not a claim that all listed items are missing. It is a statement that their complete behavior was not confirmed by the previous review.",
    "tag": "CLIENT CONFIRMATION POINTS",
    "subtitle": "Review these business boundaries without assuming they are already complete.",
    "kind": "flow",
    "band": [
      "CONFIRM BEFORE USE",
      "These handovers were not fully established by the prior review; agree and demonstrate them."
    ],
    "steps": [
      {
        "heading": "Permission to start",
        "body": [
          "How acceptance leads to an active engagement."
        ],
        "icon": "i11",
        "dashed": true,
        "step": 1
      },
      {
        "heading": "Report delivery",
        "body": [
          "How issue becomes confirmed client receipt."
        ],
        "icon": "i07",
        "dashed": true,
        "step": 2
      },
      {
        "heading": "Records handover",
        "body": [
          "How the issued work becomes the retained file."
        ],
        "icon": "i08",
        "dashed": true,
        "step": 3
      },
      {
        "heading": "Group reporting",
        "body": [
          "How group reports are delivered and archived."
        ],
        "icon": "i03",
        "dashed": true,
        "step": 4
      },
      {
        "heading": "Document exchange",
        "body": [
          "How the correct parties share and receive files."
        ],
        "icon": "i17",
        "dashed": true,
        "step": 5
      },
      {
        "heading": "Final audit review",
        "body": [
          "Required opinion, signing and review arrangements."
        ],
        "icon": "i06",
        "dashed": true,
        "step": 6
      }
    ]
  },
  {
    "id": "s34",
    "title": "Connected work. Clear accountability.",
    "section": "Requirements summary",
    "chapter": "Client review",
    "note": "The requirements connect client acquisition, accounts preparation, audit work, review and controlled reporting, supported by practice finance and records. The three financial responsibilities remain separate throughout. Client sign-off should focus on scope, responsibilities, evidence, approval rules and the handovers that still need demonstration.",
    "review": "Confirm the requirements and record any amendments before treating the workflow as agreed.",
    "tag": "REQUIREMENTS SUMMARY",
    "subtitle": "Understand what comes in, what is reviewed and what may move to the next stage.",
    "kind": "flow",
    "band": [
      "THE OBJECTIVE",
      "Connect the professional lifecycle while keeping evidence, judgment and accountability clear."
    ],
    "steps": [
      {
        "tag": "01",
        "heading": "Clear scope",
        "body": [
          "The right client, service and reporting period."
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "02",
        "heading": "Reliable preparation",
        "body": [
          "Trace balances and evidence to the report."
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "03",
        "heading": "Current approval",
        "body": [
          "Review the version that will be issued."
        ],
        "icon": "i06",
        "step": 3
      },
      {
        "tag": "04",
        "heading": "Controlled handover",
        "body": [
          "Confirm delivery and records responsibilities."
        ],
        "icon": "i15",
        "step": 4
      },
      {
        "tag": "CLIENT REVIEW",
        "heading": "Confirm scope · responsibilities · approval points · outstanding handovers",
        "body": [],
        "step": 5,
        "outcome": true
      }
    ]
  }
];
