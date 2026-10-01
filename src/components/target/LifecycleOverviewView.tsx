import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, visibleEngagementIds, visibleClientIds } from '../../services/guards';
import {
  ENGAGEMENT_WORKFLOW_SUBSTEPS,
  engagementProgress,
  SYSTEM_LIFECYCLE_STATES,
  computeSystemState,
  getLifecycleDisplayStatus
} from '../../services/targetLifecycle';
import type { TargetViewProps } from './TargetCommon';

export function LifecycleOverviewView({ onNavigate }: TargetViewProps) {
  const state = prototypeStore.getReadSnapshot(),
    visible = visibleEngagementIds(state),
    engagements = state.engagements.filter((e) => visible === 'ALL' || visible.includes(e.id));
  const selected = engagements.find((e) => e.id === state.selectedEngagement);
  const clients = visibleClientIds(state);
  const commercialVisible = (clientId?: string) => clients === 'ALL' || Boolean(clientId && clients.includes(clientId));

  const activeSystemState = selected ? computeSystemState(state, selected) : SYSTEM_LIFECYCLE_STATES[0];
  const clientEntity = selected ? state.clients.find((c) => c.id === selected.client) : null;
  const stages = selected
    ? engagementProgress(state, selected)
    : ENGAGEMENT_WORKFLOW_SUBSTEPS.map((s) => ({ ...s, status: 'Not Started' as const, blockers: [] as string[] }));

  const currentIndex = selected
    ? SYSTEM_LIFECYCLE_STATES.findIndex((s) => s.state === activeSystemState.state)
    : -1;
  const nextSystemState =
    currentIndex >= 0 && currentIndex < SYSTEM_LIFECYCLE_STATES.length - 1
      ? SYSTEM_LIFECYCLE_STATES[currentIndex + 1]
      : undefined;
  const nextStateLabel =
    !selected
      ? '—'
      : activeSystemState.state === 'ARCHIVED_READ_ONLY' || activeSystemState.nextState === 'TERMINAL'
        ? 'Terminal'
        : (nextSystemState?.label ?? 'Terminal');

  return (
    <div className="target-overview stack" style={{ gap: 24 }}>
      <section className="panel panel-pad"><h3>Pre-engagement commercial queue</h3>{state.leads.filter(l => commercialVisible(l.convertedClientId) && (!l.convertedClientId || !engagements.some(e => e.client === l.convertedClientId))).map(l => <p key={l.id}>{l.name || l.id} · Lead Ingestion · validate entity/contact before proposal.</p>)}{state.proposals.filter(p => commercialVisible(p.clientId) && !engagements.some(e => e.proposalId === p.id)).map(p => <p key={p.id}>{p.title} · {p.dispatchHistory?.some(d => d.revision === p.revision && d.simulatedOutcome === 'Delivered (simulated)') ? 'Dual-Key Pending' : 'Proposal Generation'} · revision {p.revision}</p>)}</section>
      {/* Title & System Purpose */}
      <div className="page-title">
        <div>
          <span className="tag blue mb8">SYSTEM ARCHITECTURE &amp; WORKFLOW SPECIFICATION V2.1</span>
          <h1>STE Audit Management Tool</h1>
          <p className="sub">
            International Standards on Auditing (ISA) &amp; IFRS Workflow Platform · Primary Currency: <strong>Qatari Riyal (QAR)</strong> · 
            Unlimited Client Entities, Historical Engagements, and Working Papers with zero per-file licensing penalties.
          </p>
        </div>
      </div>

      {/* SECTION 2: PROJECT MODULES CONNECTIVITY ARCHITECTURE */}
      <section className="panel panel-pad" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div className="flex-between mb12">
          <div>
            <h3 style={{ margin: 0 }}>Core Modules Connectivity Architecture</h3>
            <p className="caption">Strict handshakes ensure compliance and administrative gates are satisfied before fieldwork begins:</p>
          </div>
          <span className="tag green">5 CONNECTED MODULES</span>
        </div>

        <div className="grid5 mt16" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {/* Module 1 */}
          <div className="borderbox p12 bg-white" style={{ borderRadius: 6, borderTop: '4px solid #0284c7' }}>
            <span className="caption" style={{ color: '#0284c7', fontWeight: 700 }}>MODULE 1</span>
            <h4 style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>Commercial &amp; CRM Pipeline</h4>
            <div className="caption text-muted mb8">Lead Ingestion → Quote / Proposal → Dual-Key Gate → EL Issued → 50% Advance</div>
            <button className="btn sm ghost w-full" onClick={() => onNavigate('acquisition')}>
              Open Commercial CRM
            </button>
          </div>

          {/* Module 2 */}
          <div className="borderbox p12 bg-white" style={{ borderRadius: 6, borderTop: '4px solid #8b5cf6' }}>
            <span className="caption" style={{ color: '#8b5cf6', fontWeight: 700 }}>MODULE 2</span>
            <h4 style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>Governance &amp; Planning</h4>
            <div className="caption text-muted mb8">Acceptance Gate → 5-Folder Taxonomy → Scheduling → TB Ingest → 3-Tier Materiality</div>
            <button className="btn sm ghost w-full" onClick={() => onNavigate('audit-planning')}>
              Open Governance &amp; Planning
            </button>
          </div>

          {/* Module 3 */}
          <div className="borderbox p12 bg-white" style={{ borderRadius: 6, borderTop: '4px solid #10b981' }}>
            <span className="caption" style={{ color: '#10b981', fontWeight: 700 }}>MODULE 3</span>
            <h4 style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>Technical Fieldwork</h4>
            <div className="caption text-muted mb8">TB Auto-Mapping → Split Dashboard (P/L &amp; B/S) → Workprograms → Confirmations → Review / SRM</div>
            <button className="btn sm ghost w-full" onClick={() => onNavigate('financial-statements')}>
              Open Split Dashboard
            </button>
          </div>

          {/* Module 4 */}
          <div className="borderbox p12 bg-white" style={{ borderRadius: 6, borderTop: '4px solid #f59e0b' }}>
            <span className="caption" style={{ color: '#f59e0b', fontWeight: 700 }}>MODULE 4</span>
            <h4 style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>Reporting &amp; Archive</h4>
            <div className="caption text-muted mb8">4-Way Opinion Dropdown → 5-Part Bundle → 50% Final Fee → 60-Day Lock</div>
            <button className="btn sm ghost w-full" onClick={() => onNavigate('delivery')}>
              Open Opinion &amp; Bundle
            </button>
          </div>

          {/* Module 5 */}
          <div className="borderbox p12 bg-white" style={{ borderRadius: 6, borderTop: '4px solid #06b6d4' }}>
            <span className="caption" style={{ color: '#06b6d4', fontWeight: 700 }}>MODULE 5</span>
            <h4 style={{ margin: '4px 0 6px 0', fontSize: '13px' }}>Practice Management</h4>
            <div className="caption text-muted mb8">Tiered Rates (1000/750/500/200) → Realization → Monthly TB &amp; AR Aging</div>
            <button className="btn sm ghost w-full" onClick={() => onNavigate('reports')}>
              Open Practice Analytics
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 5: 11-STAGE END-TO-END SYSTEM STATE MACHINE */}
      <section className="panel panel-pad">
        <div
          className="flex-between mb16"
          style={{
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: 12
          }}
        >
          <div style={{ minWidth: 260, flex: '1 1 320px' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>
              End-to-End System State Machine &amp; Lifecycle Transitions
            </h3>
            <div className="caption" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>
                <span className="text-muted">Current Engagement: </span>
                <strong>
                  {selected
                    ? clientEntity
                      ? `${clientEntity.name} (${selected.id})`
                      : selected.id
                    : 'No engagement selected'}
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="text-muted">Active State: </span>
                {selected ? (
                  <>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: '#bfdbfe',
                        color: '#1e40af'
                      }}
                    >
                      {activeSystemState.label}
                    </span>
                    <span className="text-muted font-medium" style={{ fontSize: '11.5px' }}>
                      Stage {currentIndex + 1} of {SYSTEM_LIFECYCLE_STATES.length}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">None (Select an engagement below)</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 320, minWidth: 200 }}>
              <span className="caption text-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>
                Current Gate to Advance:
              </span>
              <div className="caption font-medium" style={{ color: '#1e293b', lineHeight: 1.4 }}>
                {selected ? activeSystemState.gateToAdvance : '—'}
              </div>
            </div>
            <div style={{ minWidth: 160 }}>
              <span className="caption text-muted" style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>
                Next State:
              </span>
              <div className="caption font-medium" style={{ color: '#1e293b', lineHeight: 1.4 }}>
                {selected ? nextStateLabel : '—'}
              </div>
            </div>
          </div>
        </div>

        <ol
          className="target-stage-grid"
          aria-label="System lifecycle state machine"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}
        >
          {SYSTEM_LIFECYCLE_STATES.map((stageDef, index) => {
            const displayStatus = getLifecycleDisplayStatus(index, currentIndex);

            let cardBg = '#f8fafc';
            let cardBorder = '1px solid #e2e8f0';
            let numColor = '#64748b';
            let badgeBg = '#f1f5f9';
            let badgeColor = '#475569';
            let cardOpacity = 1;
            let cardShadow = 'none';

            if (displayStatus === 'ACTIVE') {
              cardBg = '#eff6ff';
              cardBorder = '2px solid #0284c7';
              numColor = '#0284c7';
              badgeBg = '#bfdbfe';
              badgeColor = '#1e40af';
              cardOpacity = 1;
              cardShadow = '0 1px 3px rgba(2, 132, 199, 0.15)';
            } else if (displayStatus === 'CLEARED') {
              cardBg = '#f0fdf4';
              cardBorder = '1px solid #86efac';
              numColor = '#16a34a';
              badgeBg = '#bbf7d0';
              badgeColor = '#166534';
              cardOpacity = 1;
            } else if (displayStatus === 'NEXT') {
              cardBg = '#f8fafc';
              cardBorder = '1px solid #93c5fd';
              numColor = '#0284c7';
              badgeBg = '#e0f2fe';
              badgeColor = '#0369a1';
              cardOpacity = 1;
            } else {
              // NOT STARTED
              cardBg = '#f8fafc';
              cardBorder = '1px solid #e2e8f0';
              numColor = '#94a3b8';
              badgeBg = '#f1f5f9';
              badgeColor = '#64748b';
              cardOpacity = 0.75;
            }

            return (
              <li
                key={stageDef.state}
                className="borderbox p12"
                style={{
                  borderRadius: 6,
                  background: cardBg,
                  border: cardBorder,
                  boxShadow: cardShadow,
                  opacity: cardOpacity
                }}
              >
                <div className="flex-between mb4">
                  <span className="caption mono font-medium" style={{ color: numColor }}>
                    {String(index + 1).padStart(2, '0')}. {stageDef.module.split(':')[0]}
                  </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      letterSpacing: '0.02em'
                    }}
                  >
                    {displayStatus}
                  </span>
                </div>

                <strong style={{ fontSize: '13px', display: 'block', marginBottom: 4 }}>
                  {stageDef.label}
                </strong>
                <p className="caption text-muted mb4" style={{ margin: '0 0 6px 0', fontSize: '11px' }}>
                  <strong>Allowed Actions:</strong> {stageDef.allowedActions}
                </p>
                <div className="caption" style={{ fontSize: '10.5px', color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 4 }}>
                  <strong>Gate to Advance:</strong> {stageDef.gateToAdvance}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* SECTION 1.2: USER PERSONAS & RESPONSIBILITY MATRIX */}
      <section className="panel panel-pad">
        <h3>User Personas &amp; Operational Responsibility Matrix</h3>
        <p className="caption mb12">
          Strict Separation of Duties (SoD) across Preparer, Reviewer, Approver, and Client external workspaces:
        </p>

        <div className="table-wrap">
          <table className="target-table">
            <thead>
              <tr>
                <th style={{ width: '15%' }}>User Role</th>
                <th style={{ width: '25%' }}>Designated Persona</th>
                <th style={{ width: '60%' }}>Functional Scope &amp; Responsibilities</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="tag blue">PREPARER</span></td>
                <td>
                  <strong>Audit Associate / Junior Auditor</strong>
                  <div className="caption text-muted">Simulated: Adam Khan (AK)</div>
                </td>
                <td className="caption">
                  • Executes assigned financial statement line item (FSLI) audit test procedures.<br />
                  • Uploads digital working papers and inputs physical binder index codes (<code>X-1, Box 3</code>).<br />
                  • Submits completed testing packages for managerial review.<br />
                  • Logs daily operational hours against assigned engagement tasks.
                </td>
              </tr>
              <tr>
                <td><span className="tag purple">REVIEWER</span></td>
                <td>
                  <strong>Audit Senior / Audit Manager</strong>
                  <div className="caption text-muted">Simulated: Sara Malik (SM) / Layla Rahman (LR)</div>
                </td>
                <td className="caption">
                  • Verifies substantive testing and recalculated schedules.<br />
                  • Issues inline review notes and initiates the rework loop for incomplete tests.<br />
                  • Determines sampling parameters and calculates engagement materiality.<br />
                  • Prepares the <strong>Summary Review Memorandum (SRM)</strong> for the partner.<br />
                  • Tracks engagement budgets, team hours, and delivery milestones.
                </td>
              </tr>
              <tr>
                <td><span className="tag amber">APPROVER</span></td>
                <td>
                  <strong>Engagement Partner</strong>
                  <div className="caption text-muted">Simulated: Daniel James (DJ)</div>
                </td>
                <td className="caption">
                  • Evaluates and signs off on the <strong>Dual-Key Acceptance Gate</strong> (AML/KYC).<br />
                  • Authorizes commercial proposals and executes Engagement Letters.<br />
                  • Clears high-risk (Red) audit areas and formally signs off on the SRM.<br />
                  • Selects the final <strong>Audit Opinion</strong>, applies digital signatures and firm seals.<br />
                  • Authorizes final deliverable bundles and enforces regulatory file locks.
                </td>
              </tr>
              <tr>
                <td><span className="tag green">CLIENT</span></td>
                <td>
                  <strong>Client Coordinator / CFO / MD</strong>
                  <div className="caption text-muted">Simulated: Omar Nasser (ON)</div>
                </td>
                <td className="caption">
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

      {/* Engagements Scope Switcher */}
      {engagements.length > 0 && (
        <section className="panel panel-pad">
          <h3>Authorized Engagements in Scope</h3>
          <p className="caption mb8">Switch active engagement context:</p>
          <div className="target-buttons">
            {engagements.map((e) => (
              <button
                className={`btn sm ${e.id === selected?.id ? 'primary' : 'ghost'}`}
                key={e.id}
                onClick={() => {
                  prototypeStore.setSelectedEngagement(e.id);
                  onNavigate('overview');
                }}
              >
                {state.clients.find((c) => c.id === e.client)?.name} · FY {e.year} ({e.id})
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
