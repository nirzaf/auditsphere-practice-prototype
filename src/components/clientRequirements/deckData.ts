// Generated from the reviewed Client Requirements presentation. Edit freely: this file is the source of truth for the deck.
import type { DeckSlide } from './deckTypes';

export const DECK_SLIDES: DeckSlide[] = [
  {
    "id": "s01",
    "title": "AuditSphere — business requirements",
    "section": "Client review",
    "chapter": "Overview",
    "note": "This presentation explains the business requirements in the existing AuditSphere discovery using accounting and engagement language. It focuses on what staff and clients need to do, what should be checked, and what may move to the next stage.",
    "review": "Confirm that the workflows match the practice’s intended services and the client’s reporting needs.",
    "boundary": "A business requirement is not proof of completed live delivery. The final review page identifies handovers that still need confirmation.",
    "tag": "BUSINESS REQUIREMENTS",
    "subtitle": "Accounting, audit and practice workflows",
    "kind": "cover"
  },
  {
    "id": "s02",
    "title": "Connected work. Separate financial responsibilities.",
    "section": "Purpose & scope",
    "chapter": "Overview",
    "note": "The practice’s own billing and accounting must remain separate from client financial information. Group consolidation uses approved component information without changing each component’s books. AuditSphere is an import-first preparation and assurance workspace rather than a day-to-day client payroll, inventory or payment system.",
    "review": "Confirm the accounting services and group reporting work that belong in scope.",
    "tag": "PURPOSE & SCOPE",
    "subtitle": "Keep practice finances, client accounts and group reporting distinct.",
    "kind": "flow",
    "band": [
      "SCOPE BOUNDARY",
      "Client payroll, stock operations and bank-payment initiation remain outside the scope."
    ],
    "steps": [
      {
        "tag": "FIRM",
        "heading": "Firm’s own books",
        "body": [
          "Time and fees",
          "Invoices and receipts",
          "Practice accounts"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "CLIENT",
        "heading": "Client accounting",
        "body": [
          "Trial balance and ledger",
          "Reporting adjustments",
          "Entity financial statements"
        ],
        "icon": "i02",
        "step": 2
      },
      {
        "tag": "GROUP",
        "heading": "Group reporting",
        "body": [
          "Approved component packs",
          "Currency translation",
          "Consolidated results"
        ],
        "icon": "i03",
        "step": 3
      }
    ]
  },
  {
    "id": "s03",
    "title": "The engagement journey, end to end",
    "section": "Business lifecycle",
    "chapter": "Overview",
    "note": "The lifecycle connects commercial work, professional acceptance, accounts preparation, audit evidence, review, release and records. Accounting-only work and audit work follow their own agreed service scopes. A later stage must not be treated as complete merely because the earlier stage is complete.",
    "review": "Confirm the start and finish of each service, and who is responsible for every handover.",
    "boundary": "Delivery and archive creation need separate confirmation; the existing review did not establish that every handover happens automatically.",
    "tag": "BUSINESS LIFECYCLE",
    "subtitle": "Start with a client need; finish with controlled reporting and retained evidence.",
    "kind": "flow",
    "band": [
      "BUSINESS SEQUENCE",
      "Each handover has its own checks; the journey is not an automatic chain."
    ],
    "steps": [
      {
        "tag": "01",
        "heading": "Acquire & accept",
        "body": [
          "Proposal and professional acceptance"
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "02",
        "heading": "Set the engagement",
        "body": [
          "Service, period, team and conditions"
        ],
        "icon": "i05",
        "step": 2
      },
      {
        "tag": "03",
        "heading": "Prepare & investigate",
        "body": [
          "Accounts, evidence and audit work"
        ],
        "icon": "i01",
        "step": 3
      },
      {
        "tag": "04",
        "heading": "Review & approve",
        "body": [
          "Current reports and supporting evidence"
        ],
        "icon": "i06",
        "step": 4
      },
      {
        "heading": "Release the approved report",
        "body": [
          "Confirm the delivery arrangements."
        ],
        "icon": "i07",
        "step": 5
      },
      {
        "heading": "Assemble the engagement record",
        "body": [
          "Confirm archiving and retention arrangements."
        ],
        "icon": "i08",
        "dashed": true,
        "step": 6
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
    "title": "Make responsibilities clear",
    "section": "People & access",
    "chapter": "Acceptance & setup",
    "note": "Clients use a restricted workspace for their assigned requests and permitted information. Staff need access appropriate to their client and engagement responsibilities. Required independence and approval authority must not be replaced by a broad administrator label or by having prepared the work.",
    "review": "Agree the client contacts, preparers, reviewers and final approvers for the engagement.",
    "tag": "PEOPLE & ACCESS",
    "subtitle": "Separate client participation, preparation and review responsibilities.",
    "kind": "flow",
    "band": [
      "CONFIDENTIALITY",
      "People should see only the clients, engagements and actions they are authorized to access."
    ],
    "steps": [
      {
        "tag": "CLIENT ROLE",
        "heading": "Client contact",
        "body": [
          "Provide requested records",
          "Answer queries",
          "Respond to management requests"
        ],
        "icon": "i04",
        "step": 1
      },
      {
        "tag": "PREPARATION",
        "heading": "Preparer / auditor",
        "body": [
          "Prepare accounts or audit work",
          "Explain changes",
          "Submit supporting evidence"
        ],
        "icon": "i12",
        "step": 2
      },
      {
        "tag": "REVIEW ROLE",
        "heading": "Reviewer / partner",
        "body": [
          "Challenge the work",
          "Resolve review matters",
          "Approve within authority"
        ],
        "icon": "i06",
        "step": 3
      }
    ]
  },
  {
    "id": "s07",
    "title": "Win the work. Then authorize the work.",
    "section": "Client acquisition & acceptance",
    "chapter": "Acceptance & setup",
    "note": "A proposal covers the commercial scope, deliverables, period and fee. Professional acceptance considers the required evaluation responses and clearances, with the decision made by the appropriate partner. Conditional acceptance must retain its conditions rather than being treated as unrestricted permission to begin.",
    "review": "Agree the acceptance criteria, required clearances and conditions that must be resolved before work starts.",
    "boundary": "Automatic activation of an engagement after acceptance was not established. Keep the start-work decision explicit.",
    "tag": "CLIENT ACQUISITION & ACCEPTANCE",
    "subtitle": "Commercial agreement and professional acceptance are separate decisions.",
    "kind": "flow",
    "band": [
      "KEY DISTINCTION",
      "An accepted proposal does not, by itself, authorize professional work."
    ],
    "groups": [
      {
        "label": "COMMERCIAL AGREEMENT",
        "steps": [
          {
            "heading": "Client need",
            "body": [
              "Lead and service enquiry"
            ],
            "step": 1
          },
          {
            "heading": "Proposal",
            "body": [
              "Scope, deliverables and fee"
            ],
            "step": 2
          },
          {
            "heading": "Client response",
            "body": [
              "Commercial outcome"
            ],
            "step": 3
          }
        ]
      },
      {
        "label": "PROFESSIONAL ACCEPTANCE",
        "steps": [
          {
            "heading": "Evaluation",
            "body": [
              "Answers and required clearances"
            ],
            "step": 4
          },
          {
            "heading": "Partner decision",
            "body": [
              "Accept, set conditions or decline"
            ],
            "step": 5
          },
          {
            "heading": "Work permission",
            "body": [
              "Check engagement conditions"
            ],
            "step": 6
          }
        ]
      }
    ]
  },
  {
    "id": "s08",
    "title": "Agree the engagement before preparing the accounts",
    "section": "Engagement & reporting setup",
    "chapter": "Acceptance & setup",
    "note": "The client, legal entity, service, period, reporting basis and currency provide the accounting context. The team must resolve the applicable start-work conditions and confirm its authority. Accounts preparation should not mix periods, currencies or entities unintentionally.",
    "review": "Confirm the reporting period, basis, currency, account structure and team responsibilities.",
    "tag": "ENGAGEMENT & REPORTING SETUP",
    "subtitle": "Identify whose information is being used, for which service and period.",
    "kind": "flow",
    "band": [
      "REQUIRED OUTCOME",
      "The engagement, imported records and financial statements must use the same reporting context."
    ],
    "steps": [
      {
        "tag": "ENGAGEMENT",
        "heading": "Define the work",
        "body": [
          "Client and legal entity",
          "Service and reporting period",
          "Assigned team"
        ],
        "icon": "i05",
        "step": 1
      },
      {
        "tag": "ACCOUNTING",
        "heading": "Define the accounts",
        "body": [
          "Reporting basis and currency",
          "Chart of accounts",
          "Statement classifications"
        ],
        "icon": "i01",
        "step": 2
      },
      {
        "tag": "START-WORK REVIEW",
        "heading": "Clear the start conditions",
        "body": [
          "Acceptance and terms",
          "Required independence checks",
          "Unresolved holds"
        ],
        "icon": "i11",
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
    "title": "Request the right evidence from the right person",
    "section": "Client evidence requests",
    "chapter": "Client information",
    "note": "A provided-by-client request should state the objective, entity, period, expected format, control totals and acceptance criteria. The named client contact supplies documents and responds to follow-up questions. Receiving a file is distinct from deciding that its contents are adequate for accounting or audit work.",
    "review": "Agree the evidence requested, the client owner, the due date and who accepts the response.",
    "boundary": "Confirm the live document exchange and receipt arrangements before relying on them for an engagement.",
    "tag": "CLIENT EVIDENCE REQUESTS",
    "subtitle": "A clear request links the purpose, required information, owner and due date.",
    "kind": "flow",
    "band": [
      "PBC REQUIREMENTS",
      "Provided-by-client information needs both a receipt check and an evidence-quality review."
    ],
    "steps": [
      {
        "tag": "REQUEST",
        "heading": "Request records",
        "body": [
          "Purpose and period",
          "Due date and format",
          "Named client owner"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "RESPONSE",
        "heading": "Client responds",
        "body": [
          "Upload the requested files",
          "Explain the information",
          "Answer follow-up queries"
        ],
        "icon": "i04",
        "step": 2
      },
      {
        "tag": "REVIEW",
        "heading": "Review the evidence",
        "body": [
          "Confirm what was received",
          "Assess suitability",
          "Request clarification if needed"
        ],
        "icon": "i06",
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
    "title": "Turn account balances into financial statements",
    "section": "Account classification & mapping",
    "chapter": "Accounts preparation",
    "note": "Mapping determines where an adjusted account balance appears in the financial statements. Where a balance is allocated across presentation lines, the allocation and rationale must be complete and approved. The resulting statement amounts should remain traceable to the adjusted accounts.",
    "review": "Agree the statement classifications and how any account splits are reviewed.",
    "tag": "ACCOUNT CLASSIFICATION & MAPPING",
    "subtitle": "Connect adjusted account balances to the appropriate statement line items.",
    "kind": "flow",
    "band": [
      "COMPLETENESS",
      "Every relevant balance needs an approved classification; do not hide unexplained amounts."
    ],
    "steps": [
      {
        "tag": "INPUT",
        "heading": "Adjusted accounts",
        "body": [
          "Account descriptions",
          "Adjusted amounts",
          "Reporting currency"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "ACCOUNTING DECISION",
        "heading": "Approve the classification",
        "body": [
          "Statement destination",
          "Any allocation or split",
          "Rationale for the treatment"
        ],
        "icon": "i17",
        "step": 2
      },
      {
        "tag": "OUTPUT",
        "heading": "Financial-statement lines",
        "body": [
          "Presentation line items",
          "Section totals",
          "Reconciled amounts"
        ],
        "icon": "i16",
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
    "title": "Plan audit work around risk and materiality",
    "section": "Audit planning",
    "chapter": "Audit & assurance",
    "note": "The engagement records the benchmark, materiality decisions and rationale. Risks are linked to account or disclosure areas, assertions and the proposed response. The audit program organizes the procedures that will be performed, while professional decisions remain with the practitioner.",
    "review": "Confirm the audit methodology, materiality approach, risk assessment and required procedures.",
    "boundary": "Accounts preparation and audit are separate service responsibilities; completing accounts does not automatically complete an audit.",
    "tag": "AUDIT PLANNING",
    "subtitle": "Audit work has its own scope, judgments and evidence requirements.",
    "kind": "flow",
    "band": [
      "PRACTITIONER’S ROLE",
      "Audit planning supports the practitioner’s decisions; it does not form an audit opinion."
    ],
    "steps": [
      {
        "tag": "PROFESSIONAL JUDGMENT",
        "heading": "Set materiality",
        "body": [
          "Benchmark and rationale",
          "Overall and performance materiality",
          "Clearly trivial threshold"
        ],
        "icon": "i14",
        "step": 1
      },
      {
        "tag": "RISK ASSESSMENT",
        "heading": "Assess risks",
        "body": [
          "Account or disclosure area",
          "Relevant assertions",
          "Planned audit response"
        ],
        "icon": "i18",
        "step": 2
      },
      {
        "tag": "FIELDWORK PLAN",
        "heading": "Select the procedures",
        "body": [
          "Agreed audit program",
          "Engagement-specific procedures",
          "Workpapers to support the work"
        ],
        "icon": "i02",
        "step": 3
      }
    ]
  },
  {
    "id": "s18",
    "title": "Connect each audit test to its evidence",
    "section": "Audit populations, sampling & fieldwork",
    "chapter": "Audit & assurance",
    "note": "A population identifies its source, extraction context, purpose, control total and exclusions. Selections, item testing, confirmations and area assessments build on that context. The reviewer needs a clear connection from the planned procedure to evidence and the recorded results.",
    "review": "Agree how completeness, selection methods, exceptions and conclusions will be documented.",
    "boundary": "An imported general ledger is not automatically an accepted audit population. Confirmation dispatch and response arrangements should also be confirmed.",
    "tag": "AUDIT POPULATIONS, SAMPLING & FIELDWORK",
    "subtitle": "Make it clear what was tested, why it was selected and what was found.",
    "kind": "flow",
    "band": [
      "EVIDENCE CHAIN",
      "Population → selected item → procedure → evidence → exception or conclusion."
    ],
    "steps": [
      {
        "tag": "POPULATION",
        "heading": "Establish the population",
        "body": [
          "Source and extraction basis",
          "Control totals and exclusions",
          "Purpose and assertion"
        ],
        "icon": "i01",
        "step": 1
      },
      {
        "tag": "TESTING",
        "heading": "Perform the work",
        "body": [
          "Select items for testing",
          "Record tests and confirmations",
          "Link supporting evidence"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "EVALUATION",
        "heading": "Assess the results",
        "body": [
          "Investigate exceptions",
          "Assess differences",
          "Document the area conclusion"
        ],
        "icon": "i02",
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
    "title": "Bring significant completion matters into the review",
    "section": "Audit completion",
    "chapter": "Audit & assurance",
    "note": "Completion work records analytical review, going-concern assessment and subsequent-event considerations. Significant variances require investigation and support; the practitioner records the judgments about uncertainty, disclosure and reporting. A change in an assessment should prompt consideration of renewed review.",
    "review": "Agree the completion evidence and any additional final-review or engagement-quality-review requirements.",
    "boundary": "The complete final-opinion, signing and engagement-quality-review process was not established in the earlier review; confirm the required route.",
    "tag": "AUDIT COMPLETION",
    "subtitle": "The final review needs supported assessments, not only completed task labels.",
    "kind": "flow",
    "band": [
      "DECISION OWNERSHIP",
      "Professional conclusions and the final opinion remain the practitioner’s responsibility."
    ],
    "steps": [
      {
        "heading": "Analytical review",
        "body": [
          "Investigate significant variances.",
          "Retain explanations and evidence."
        ],
        "icon": "i16",
        "step": 1
      },
      {
        "heading": "Going concern",
        "body": [
          "Record the practitioner’s assessment.",
          "Support the disclosure decision."
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "heading": "Subsequent events",
        "body": [
          "Assess identified events.",
          "Document the reporting consequences."
        ],
        "icon": "i05",
        "step": 3
      },
      {
        "heading": "Completion evidence → practitioner assessment → required final review",
        "body": [],
        "step": 4,
        "outcome": true
      }
    ]
  },
  {
    "id": "s21",
    "title": "Approval belongs to the version that was reviewed",
    "section": "Review & approval",
    "chapter": "Review & release",
    "note": "Approval identifies the report or workpaper and the information considered at the time. When the target or relevant information changes, the earlier approval can remain part of the history while no longer authorizing the current version. Release must rely on a current, applicable approval.",
    "review": "Agree which changes require renewed review and who may grant final approval.",
    "tag": "REVIEW & APPROVAL",
    "subtitle": "Do not use yesterday’s approval for a changed financial report.",
    "kind": "flow",
    "band": [
      "CORE CONTROL",
      "The approval history stays visible even when a changed report requires a fresh review."
    ],
    "steps": [
      {
        "tag": "APPROVED VERSION",
        "heading": "What was approved?",
        "body": [
          "The exact report or workpaper",
          "Its supporting information",
          "The reviewer’s decision"
        ],
        "icon": "i02",
        "step": 1
      },
      {
        "tag": "CHANGE CHECK",
        "heading": "Has anything changed?",
        "body": [
          "Figures or source information",
          "The report or workpaper",
          "Applicable review conditions"
        ],
        "icon": "i19",
        "step": 2
      },
      {
        "tag": "OUTCOME",
        "heading": "Is approval still valid?",
        "body": [
          "Use the current approval",
          "Or request review again",
          "Preserve the earlier decision"
        ],
        "icon": "i15",
        "step": 3
      }
    ]
  },
  {
    "id": "s22",
    "title": "Release only the current approved report",
    "section": "Controlled issue & delivery",
    "chapter": "Review & release",
    "note": "Before issue, the reporting package must match the current approval and required release evidence. The issue record should identify the package and the person authorizing release. Actual delivery and acknowledgement are separate business matters that must be established before reliance.",
    "review": "Agree the final approver, release conditions, delivery channel and evidence of receipt.",
    "boundary": "The previous review established an issue record and a planned delivery, not a completed client delivery.",
    "tag": "CONTROLLED ISSUE & DELIVERY",
    "subtitle": "Keep the approval, issue decision and actual delivery distinct.",
    "kind": "flow",
    "band": [
      "DO NOT CONFLATE",
      "An issue record or planned delivery is not proof that the client received the report."
    ],
    "steps": [
      {
        "tag": "READY",
        "heading": "Confirm readiness",
        "body": [
          "Current approved package",
          "Required release evidence",
          "Authorized release decision"
        ],
        "icon": "i06",
        "step": 1
      },
      {
        "tag": "ISSUED",
        "heading": "Record the issue",
        "body": [
          "Identify the approved version",
          "Record who authorized it",
          "Preserve the release record"
        ],
        "icon": "i15",
        "step": 2
      },
      {
        "tag": "DELIVERY TO CONFIRM",
        "heading": "Confirm how the recipient receives the final report.",
        "body": [],
        "icon": "i07",
        "dashed": true,
        "step": 3,
        "outcome": true
      }
    ]
  },
  {
    "id": "s23",
    "title": "Retain a complete and reviewable engagement record",
    "section": "File assembly & records",
    "chapter": "Review & release",
    "note": "Records assembly brings the engagement documents and supporting information into a reviewable file inventory. The current complete assembly should be reviewed under an approved records profile. Retention, protection, holds and eventual disposition require agreed responsibilities and evidence beyond a file-complete label.",
    "review": "Agree the record contents, custodian, retention policy and any legal-hold responsibilities.",
    "boundary": "Automatic archive creation after issue and external retention protection were not established. Do not imply a retention period or legal conclusion from this presentation.",
    "tag": "FILE ASSEMBLY & RECORDS",
    "subtitle": "Keep the record of what supported the reporting and review decisions.",
    "kind": "flow",
    "band": [
      "CONFIRMATION NEEDED",
      "A complete engagement file does not, by itself, prove that retention protection is in place."
    ],
    "steps": [
      {
        "tag": "COLLECT",
        "heading": "Assemble the file",
        "body": [
          "Engagement documents",
          "Submitted work and decisions",
          "Structured supporting records"
        ],
        "icon": "i08",
        "step": 1
      },
      {
        "tag": "CHECK",
        "heading": "Review completeness",
        "body": [
          "Required references present",
          "Current assembly version",
          "Explain anything missing"
        ],
        "icon": "i06",
        "step": 2
      },
      {
        "tag": "GOVERN",
        "heading": "Apply the records policy",
        "body": [
          "Approved retention profile",
          "Custodian responsibilities",
          "Agreed protection and hold process"
        ],
        "icon": "i20",
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
    "title": "Manage the practice’s time, billing and receivables",
    "section": "Practice finance",
    "chapter": "Group & practice",
    "note": "Budgets set expected effort and fees and are compared with recorded time; practice time and agreed fee information support billing. Invoice preparation, approval, issue and receipt allocation are separate actions, with checks for duplicated billing sources and over-allocation. The firm’s financial responsibilities remain separate from client accounts and consolidation.",
    "review": "Agree fee sources, finance review responsibilities, receipt allocation and the expected receivables reports.",
    "boundary": "Recording a receipt is not initiating a bank payment. The exact automatic posting to the firm’s ledger was not established in the earlier review.",
    "tag": "PRACTICE FINANCE",
    "subtitle": "The firm’s commercial cycle runs alongside the client engagement.",
    "kind": "flow",
    "band": [
      "BILLING CONTROL",
      "Do not bill the same source twice or allocate more than the receipt or invoice balance."
    ],
    "steps": [
      {
        "tag": "CAPTURE",
        "heading": "Record work & fees",
        "body": [
          "Time and approved fee sources",
          "Client billing account"
        ],
        "icon": "i21",
        "step": 1
      },
      {
        "tag": "BILL",
        "heading": "Prepare & review invoice",
        "body": [
          "Quantity, rate and tax",
          "Required finance approval"
        ],
        "icon": "i02",
        "step": 2
      },
      {
        "tag": "COLLECT",
        "heading": "Record & allocate receipts",
        "body": [
          "Match receipts to invoices",
          "Apply relevant credit notes"
        ],
        "icon": "i01",
        "step": 3
      },
      {
        "tag": "MONITOR",
        "heading": "Review the balance",
        "body": [
          "Remaining receivable",
          "Firm’s own accounting records"
        ],
        "icon": "i16",
        "step": 4
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
