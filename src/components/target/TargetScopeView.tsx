import React from 'react';
import { SYSTEM_LIFECYCLE_STATES } from '../../services/targetLifecycle';
import type { TargetViewProps } from './TargetCommon';

export function TargetScopeView({ onNavigate }: TargetViewProps) {
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <span className="tag blue mb8">STE AUDIT MANAGEMENT TOOL · SPECIFICATION V2.1</span>
        <h1>Functional Requirements &amp; End-to-End System Workflow Specification</h1>
        <p className="caption">
          Auditing Standards Context: <strong>International Standards on Auditing (ISA) &amp; International Financial Reporting Standards (IFRS)</strong> · 
          Primary Currency: <strong>Qatari Riyal (QAR)</strong>.
        </p>
      </section>

      {/* 1.1 Business Objectives */}
      <section className="panel panel-pad">
        <h3>1.1 Business Objectives &amp; Problem Statement</h3>
        <ul className="mt8" style={{ paddingLeft: 20 }}>
          <li>
            <strong>Elimination of Per-File Licensing Penalties:</strong> Existing commercial platforms enforce rigid licensing tiers (e.g., limits of 130 client files) that charge steep incremental fees for additional files. The in-house platform supports an <strong>unlimited number of client entities, historical engagements, and working papers</strong> with zero subscription penalties.
          </li>
          <li>
            <strong>Unified Engagement Lifecycle:</strong> Centralizes commercial sales, administrative governance, compliance clearance, audit fieldwork execution, multi-tier quality reviews, client deliverable generation, and internal firm practice management into a single cohesive workflow.
          </li>
          <li>
            <strong>Standardized Auditing Governance:</strong> Standardized firm-wide execution in strict alignment with International Standards on Auditing (ISA):
            <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="tag">ISA 210 (Terms &amp; EL)</span>
              <span className="tag">ISA 220 &amp; ISQC 1 (Acceptance &amp; Quality)</span>
              <span className="tag">ISA 230 (60-Day Archival Lock)</span>
              <span className="tag">ISA 320 (Materiality Engine)</span>
              <span className="tag">ISA 505 (Confirmations)</span>
              <span className="tag">ISA 570 (Going Concern)</span>
              <span className="tag">ISA 700 &amp; 705 (Audit Opinion)</span>
            </div>
          </li>
        </ul>
      </section>

      {/* 1.2 User Personas */}
      <section className="panel panel-pad">
        <h3>1.2 User Personas &amp; Operational Matrix</h3>
        <div className="table-wrap mt12">
          <table className="target-table">
            <thead>
              <tr>
                <th>User Role</th>
                <th>Persona</th>
                <th>Functional Scope &amp; Responsibilities</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>PREPARER</strong></td>
                <td>Audit Associate / Junior Auditor</td>
                <td>
                  • Executes assigned financial statement line item (FSLI) audit test procedures.<br />
                  • Uploads digital working papers and inputs physical binder index codes (<code>X-1, Box 3</code>).<br />
                  • Submits completed testing packages for managerial review.<br />
                  • Logs daily operational hours against assigned engagement tasks.
                </td>
              </tr>
              <tr>
                <td><strong>REVIEWER</strong></td>
                <td>Audit Senior / Audit Manager</td>
                <td>
                  • Verifies substantive testing and recalculated schedules.<br />
                  • Issues inline review notes and initiates the rework loop for incomplete tests.<br />
                  • Determines sampling parameters and calculates engagement materiality.<br />
                  • Prepares the Summary Review Memorandum (SRM) for the partner.<br />
                  • Tracks engagement budgets, team hours, and delivery milestones.
                </td>
              </tr>
              <tr>
                <td><strong>APPROVER</strong></td>
                <td>Engagement Partner</td>
                <td>
                  • Evaluates and signs off on the Dual-Key Acceptance Gate (AML/KYC).<br />
                  • Authorizes commercial proposals and executes Engagement Letters.<br />
                  • Clears high-risk (Red) audit areas and formally signs off on the SRM.<br />
                  • Selects the final Audit Opinion, applies digital signatures and firm seals.<br />
                  • Authorizes final deliverable bundles and enforces regulatory file locks.
                </td>
              </tr>
              <tr>
                <td><strong>CLIENT</strong></td>
                <td>Client Coordinator / CFO / MD</td>
                <td>
                  • Accesses an isolated, tokenized external workspace (PBC Portal).<br />
                  • Views requested audit documentation with real-time review status badges.<br />
                  • Uploads requested financial schedules, trial balances, and voucher evidence.<br />
                  • Receives invoices, receipts, holding letters, and final deliverables.<br />
                  • Access freezes automatically upon engagement sign-off.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5 Core Functional Modules */}
      <section className="panel panel-pad">
        <h3>2. Five Core Functional Modules</h3>
        <div className="stack mt12" style={{ gap: 12 }}>
          <div className="borderbox p12">
            <strong>Module 1: Commercial &amp; CRM Pipeline</strong>
            <p className="caption">
              [Lead Ingestion] → [Quote / Proposal] → [Dual-Key Gate] → [EL Issued] → [50% Advance]<br />
              <em>Handshake: Partner Risk Clearance + Deposit Paid</em>
            </p>
          </div>
          <div className="borderbox p12">
            <strong>Module 2: Administration, Governance &amp; Planning</strong>
            <p className="caption">
              [Acceptance / Continuance] → [Taxonomy Provisioning] → [Scheduling] → [TB Ingest] → [3-Tier Materiality]<br />
              <em>Handshake: TB Ingested &amp; Planning Signed Off</em>
            </p>
          </div>
          <div className="borderbox p12">
            <strong>Module 3: Technical Execution &amp; Fieldwork</strong>
            <p className="caption">
              [TB Auto-Mapping] → [Split Dashboard] → [Workprograms] → [Confirmations] → [Review/SRM]<br />
              <em>Handshake: Partner Clearance of SRM</em>
            </p>
          </div>
          <div className="borderbox p12">
            <strong>Module 4: Reporting, Deliverables &amp; File Archive</strong>
            <p className="caption">
              [4-Way Opinion Dropdown] → [5-Part Bundle Release] → [50% Final Fee] → [60-Day Lock]<br />
              <em>Financial &amp; Labor Actuals Feed</em>
            </p>
          </div>
          <div className="borderbox p12">
            <strong>Module 5: Practice Management &amp; Internal Bookkeeping</strong>
            <p className="caption">
              [Time &amp; Charge-Out Rates] → [Realization &amp; Profitability] → [Internal Office Expenses &amp; TB]
            </p>
          </div>
        </div>
      </section>

      {/* 11-State System Machine */}
      <section className="panel panel-pad">
        <h3>5. System State Machine &amp; Lifecycle Transitions</h3>
        <div className="table-wrap mt12">
          <table className="target-table">
            <thead>
              <tr>
                <th>Current State</th>
                <th>Allowed Actions</th>
                <th>Gate / Condition to Advance</th>
                <th>Next State</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_LIFECYCLE_STATES.map((s) => (
                <tr key={s.state}>
                  <td><code>{s.state}</code></td>
                  <td>{s.allowedActions}</td>
                  <td><strong>{s.gateToAdvance}</strong></td>
                  <td><code>{s.nextState}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
