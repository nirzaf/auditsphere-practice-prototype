// Module 32: Comprehensive 6-Tab Workpaper Workspace (VP-052)
// 6 Tabs: Overview, Guidelines, Template/Data, Working Paper Upload/Preview, Supporting Evidence, Clearance & History
// Pure browser prototype: local version incrementing, separation of duties, dynamic template parsing, no alerts.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, isSuperuserRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { sha256OfFile } from '../../services/fileMetadata';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface WorkpapersViewProps {
  onNavigate: (route: RouteKey) => void;
  searchTargetId?: string;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const WorkpapersView: React.FC<WorkpapersViewProps> = ({ onNavigate, searchTargetId, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const workpapers = selectedEng?.workpapers || [];
  const [selectedWpId, setSelectedWpId] = useState<string>(workpapers.some(workpaper => workpaper.id === searchTargetId) ? searchTargetId! : workpapers[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'guidelines' | 'template' | 'preview' | 'evidence' | 'clearance'>('overview');
  const [clearanceNotes, setClearanceNotes] = useState('Satisfactory completion of all testing procedures and evidence tie-out.');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newRevisionFile, setNewRevisionFile] = useState<File | null>(null);
  const revisionBaseline = useRef(newRevisionFile);
  const templates = state.workpaperTemplates || [];
  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [templatePreparerId, setTemplatePreparerId] = useState(state.users.find(user => user.role === 'preparer' && user.status === 'Active')?.id || '');
  const [templateReviewerId, setTemplateReviewerId] = useState(state.users.find(user => user.role === 'reviewer' && user.status === 'Active')?.id || '');
  const [evidenceDocId, setEvidenceDocId] = useState(state.documents.find(document => document.engagementId === selectedEng?.id)?.id || '');
  const [assignmentRole, setAssignmentRole] = useState<'preparer' | 'reviewer'>('reviewer');
  const [assignmentUserId, setAssignmentUserId] = useState(state.users.find(user => user.id === 'reviewer-2' && user.status === 'Active')?.id || '');
  const [assignmentReason, setAssignmentReason] = useState('');
  const wp = workpapers.find(w => w.id === selectedWpId) || workpapers[0];
  const csvData = (() => {
    if (!wp?.template?.csv) return null;
    const lines = wp.template.csv.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;
    return { headers: lines[0].split(',').map(h => h.trim()), rows: lines.slice(1).map(line => line.split(',').map(c => c.trim())) };
  })();

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="checkboard" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to access the audit workpapers workspace.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleClearWorkpaper = () => {
    try {
      prototypeStore.clearWorkpaper(selectedEng.id, wp.id, clearanceNotes);
      triggerNotice('success', `Workpaper ${wp.id} successfully cleared by ${prototypeStore.getSnapshot().currentPerson}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleSaveDraft = (event: React.MouseEvent<HTMLButtonElement>) => {
    const panel = event.currentTarget.closest('.panel');
    try {
      prototypeStore.updateWorkpaper(selectedEng.id, wp.id, {
        applicable: wp.applicable,
        scope: panel?.querySelector<HTMLTextAreaElement>('[aria-label="Workpaper scope"]')?.value,
        workPerformed: panel?.querySelector<HTMLTextAreaElement>('[aria-label="Work performed"]')?.value,
        conclusion: panel?.querySelector<HTMLTextAreaElement>('[aria-label="Workpaper conclusion"]')?.value
      });
      triggerNotice('success', `Workpaper v${prototypeStore.getSnapshot().engagements.find(item => item.id === selectedEng.id)?.workpapers.find(item => item.id === wp.id)?.version} saved.`);
    } catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not save workpaper.'); }
  };

  const handleLinkEvidence = () => {
    try { prototypeStore.linkWorkpaperEvidence(selectedEng.id, wp.id, evidenceDocId); triggerNotice('success', `Evidence ${evidenceDocId} linked at its current revision.`); }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not link evidence.'); }
  };

  const handleUnlinkEvidence = (documentId: string) => {
    const reason = window.prompt(`Why remove ${documentId} from ${wp.id}?`);
    if (reason === null) return;
    try { prototypeStore.unlinkWorkpaperEvidence(selectedEng.id, wp.id, documentId, reason); triggerNotice('success', `${documentId} removed; the reason is retained in history.`); }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not remove evidence.'); }
  };

  const handleReassign = () => {
    try { prototypeStore.reassignWorkpaper(selectedEng.id, wp.id, assignmentRole, assignmentUserId, assignmentReason); setAssignmentReason(''); triggerNotice('success', `${assignmentRole} assignment updated.`); }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not reassign workpaper.'); }
  };

  const handleSubmitWorkpaper = () => {
    try { prototypeStore.submitWorkpaper(selectedEng.id, wp.id); triggerNotice('success', `Workpaper v${wp.version} submitted for independent review.`); }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not submit workpaper.'); }
  };

  const handleToggleApplicability = () => {
    const updated = !wp.applicable;
    const rationale = updated ? undefined : window.prompt('Why is this workpaper not applicable?');
    if (!updated && rationale === null) return;
    prototypeStore.updateWorkpaper(selectedEng.id, wp.id, { applicable: updated, rationale: rationale || undefined });
    triggerNotice('success', `Workpaper ${wp.id} marked as ${updated ? 'applicable' : 'not applicable'}.`);
  };

  const saveRevisionDraft = async (): Promise<boolean> => {
    if (!newRevisionFile) return false;

    try {
      const sha256 = await sha256OfFile(newRevisionFile);
      prototypeStore.replaceWorkpaperRevision(selectedEng.id, wp.id, {
        name: newRevisionFile.name,
        size: newRevisionFile.size,
        sha256
      });
      triggerNotice('success', `Replacement metadata recorded for v${wp.version + 1}; digest ${sha256.slice(0, 12)}…. Original bytes are not persisted.`);
      setShowUploadModal(false);
      setNewRevisionFile(null);
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };
  const handleUploadRevisionSubmit = async (e: React.FormEvent) => { e.preventDefault(); await saveRevisionDraft(); };

  const discardRevisionDraft = () => { setShowUploadModal(false); setNewRevisionFile(null); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'workpaper replacement revision draft', isDirty: () => showUploadModal && newRevisionFile !== revisionBaseline.current, save: saveRevisionDraft, discard: discardRevisionDraft }, 'workpaper-revision-draft');
    return () => onRegisterUnsavedForm(null, 'workpaper-revision-draft');
  }, [onRegisterUnsavedForm, showUploadModal, newRevisionFile]);
  const openRevisionModal = () => { revisionBaseline.current = newRevisionFile; setShowUploadModal(true); };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Workpaper Workspace</h1>
          <p>Structured 6-tab audit documentation, substantive schedules, and independent reviewer clearance.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('reviews')}>
            <Icon name="message" /> Review Desk ({selectedEng.reviews.filter(r => r.status !== 'Cleared').length})
          </button>
          <button className="btn primary sm" onClick={() => onNavigate('delivery')}>
            <Icon name="shield" /> Release Gates
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="panel panel-pad"
          style={{
            background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: notice.type === 'success' ? '#86efac' : '#fca5a5',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            padding: '10px 16px'
          }}
        >
          <b>{notice.type === 'success' ? '✓ ' : '⚠ '}</b>
          {notice.text}
        </div>
      )}

      <div className="panel panel-pad">
        <h3>Create from a published workpaper template</h3>
        <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
          <label className="caption">Template<select className="input" aria-label="Published workpaper template" value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.filter(item => item.status === 'Published').map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
          <label className="caption">Preparer<select className="input" aria-label="Workpaper preparer" value={templatePreparerId} onChange={event => setTemplatePreparerId(event.target.value)}>{state.users.filter(user => user.role === 'preparer' && user.status === 'Active').map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className="caption">Reviewer<select className="input" aria-label="Workpaper reviewer" value={templateReviewerId} onChange={event => setTemplateReviewerId(event.target.value)}>{state.users.filter(user => ['reviewer', 'manager', 'partner', 'eqr'].includes(user.role) && user.status === 'Active').map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
          <button className="btn primary sm" disabled={!templates.some(item => item.id === templateId && item.status === 'Published') || !hasAnyRole(state, ['manager', 'partner'])} onClick={() => { try { const id = prototypeStore.createWorkpaperFromTemplate(selectedEng.id, templateId, templatePreparerId, templateReviewerId); setSelectedWpId(id); setActiveTab('overview'); triggerNotice('success', `${id} created with fresh work state.`); } catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not create workpaper.'); } }}>Create workpaper</button>
          {templates.find(item => item.id === templateId)?.sampleFileName && <a className="btn sm ghost" href={`/templates/${encodeURIComponent(templates.find(item => item.id === templateId)!.sampleFileName!)}`} download>Download genuine sample XLSX</a>}
        </div>
        <p className="caption mt8">A new workpaper keeps the published template revision and starts without evidence, uploaded files, conclusions or clearance.</p>
      </div>

      <div className="grid-main">
        {/* Left: Workpapers List */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Engagement Workpapers ({workpapers.length})</h3>
              <span className="caption">Gen {selectedEng.generation}</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Lead Schedule</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workpapers.map(w => (
                    <tr
                      key={w.id}
                      className={w.id === wp?.id ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedWpId(w.id)}
                    >
                      <td>
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="mono bold">{w.id}</span>
                          <b>{w.title}</b>
                        </div>
                        <div className="cell-sub">{w.assertion} · Rev v{w.version}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            w.status === 'Cleared'
                              ? 'green'
                              : w.status === 'Not applicable'
                              ? 'gray'
                              : w.status === 'Changes required'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Active Workpaper Tabs */}
        {wp && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">{wp.id} · {wp.assertion.toUpperCase()}</span>
                  <h2>{wp.title}</h2>
                  <div className="cell-sub mt4">
                    Assigned Preparer: <b>{wp.preparer}</b> · Reviewer: <b>{wp.reviewer}</b>
                  </div>
                  {wp.sourceProcedureRefs?.length ? <div className="cell-sub">Source procedures: {wp.sourceProcedureRefs.join(', ')}</div> : null}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className={`btn sm ${wp.applicable ? 'ghost' : 'primary'}`}
                    onClick={handleToggleApplicability}
                  >
                    {wp.applicable ? 'Mark N/A' : 'Mark Applicable'}
                  </button>
                  <span
                    className={`badge ${
                      wp.status === 'Cleared'
                        ? 'green'
                        : wp.status === 'Not applicable'
                        ? 'gray'
                        : 'amber'
                    }`}
                  >
                    {wp.status}
                  </span>
                </div>
              </div>

              {/* 6 Tabs */}
              <div className="tabs mt20">
                {[
                  { key: 'overview', label: '1. Objective & Scope' },
                  { key: 'guidelines', label: '2. Testing Guidelines' },
                  { key: 'template', label: '3. Lead Schedule Data' },
                  { key: 'preview', label: '4. Artifact & Revision' },
                  { key: 'evidence', label: '5. Pinned Evidence' },
                  { key: 'clearance', label: '6. Clearance & History' }
                ].map(t => (
                  <button
                    key={t.key}
                    className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.key as any)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: Objective */}
            {activeTab === 'overview' && (
              <div className="panel panel-pad">
                <h4>Audit Objective</h4>
                <p className="sub mt8">{wp.objective}</p>
                <h4 className="mt16">Testing Scope</h4>
                <textarea className="input mt8" aria-label="Workpaper scope" rows={2} defaultValue={wp.scope || ''} placeholder="Define this workpaper's scope" />
                <h4 className="mt16">Key Audit Risk</h4>
                <p className="sub mt8">{wp.risk || 'Risk of material misstatement due to management override or valuation errors.'}</p>
                <h4 className="mt16">Work performed</h4>
                <textarea className="input mt8" aria-label="Work performed" rows={3} defaultValue={wp.workPerformed || ''} placeholder="Record procedures performed and results" />
                <h4 className="mt16">Auditor Conclusion</h4>
                <textarea className="input mt8" aria-label="Workpaper conclusion" rows={3} defaultValue={wp.conclusion || ''} placeholder="Record the conclusion supported by the work" />
                <div className="row mt12" style={{ gap: 8 }}>
                  <button className="btn sm" onClick={handleSaveDraft}>Save workpaper revision</button>
                  <span className="caption">Saving changes advances the revision and invalidates any previous submission or clearance.</span>
                </div>
                {wp.sourceTemplateId && <p className="caption mt8">Created from {wp.sourceTemplateId} v{wp.sourceTemplateVersion}.</p>}
                {wp.submittedVersion === wp.version && <p className="caption mt8">Submitted revision v{wp.submittedVersion} by {wp.submittedBy}.</p>}
                <button className="btn primary sm mt12" disabled={!wp.applicable || wp.status === 'Submitted' || !wp.workingPaper || wp.workingPaper.version !== wp.version} onClick={handleSubmitWorkpaper}>Submit for independent review</button>
              </div>
            )}

            {/* Tab 2: Guidelines */}
            {activeTab === 'guidelines' && (
              <div className="panel panel-pad">
                <h3>Standard Audit Methodology Guidelines</h3>
                <p className="sub" style={{ marginBottom: 12 }}>
                  ISA testing directives applicable to {wp.title}.
                </p>
                <div className="stack" style={{ gap: 10 }}>
                  {wp.guidelines && wp.guidelines.length > 0 ? (
                    wp.guidelines.map((g, idx) => (
                      <div key={idx} className="borderbox" style={{ padding: 12 }}>
                        <div className="between">
                          <b>{g.title}</b>
                          {g.mandatory && <span className="badge amber">Mandatory ISA</span>}
                        </div>
                        <p className="sub mt4">{g.desc}</p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="borderbox" style={{ padding: 12 }}>
                        <b>1. Assertion Verification</b>
                        <p className="sub mt4">Verify that all material balances exist, are rights of the entity, and are completely recorded at accurate cutoff valuation.</p>
                      </div>
                      <div className="borderbox" style={{ padding: 12 }}>
                        <b>2. Independent Confirmation</b>
                        <p className="sub mt4">Obtain external confirmation letters from registered financial institutions and key third-party counterparties.</p>
                      </div>
                      <div className="borderbox" style={{ padding: 12 }}>
                        <b>3. Cutoff & Subsequent Events</b>
                        <p className="sub mt4">Inspect transactions occurring in the post-balance-sheet window to verify completeness and identify any subsequent adjusting events.</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Template / Data */}
            {activeTab === 'template' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Embedded Tabular Schedule / Template Data</h3>
                    <p className="sub">
                      {wp.template?.name || 'Lead Schedule'} · Ref: {wp.template?.ref || wp.id}
                    </p>
                  </div>
                  {wp.template?.instructions && (
                    <span className="caption text-muted">{wp.template.instructions}</span>
                  )}
                </div>

                <div className="tablewrap mt16">
                  {csvData ? (
                    <table>
                      <thead>
                        <tr>
                          {csvData.headers.map((h, i) => (
                            <th key={i}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.rows.map((row, rI) => (
                          <tr key={rI}>
                            {row.map((cell, cI) => (
                              <td key={cI} className={cI === 0 ? 'mono bold' : ''}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Account Code</th>
                          <th>Account Description</th>
                          <th>Per Trial Balance</th>
                          <th>Mapped Line</th>
                          <th>Audit Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEng.rows.map(row => (
                          <tr key={row.code}>
                            <td><span className="mono bold">{row.code}</span></td>
                            <td><b>{row.name}</b></td>
                            <td>{Math.abs(row.balance).toLocaleString('en-GB')} {row.balance < 0 ? 'Cr' : 'Dr'} {selectedEng.currency || 'QAR'}</td>
                            <td>{row.mappedStatementLine}</td>
                            <td><span className="badge green">0.00</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Working Paper Upload / Preview */}
            {activeTab === 'preview' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Working Paper Artifact Preview</h3>
                    <p className="sub">
                      {wp.workingPaper?.name || wp.documentName || `${wp.id}_Fieldwork.xlsx`} · Version {wp.version}
                    </p>
                  </div>
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      setNewRevisionFile(null);
                      openRevisionModal();
                    }}
                  >
                    <Icon name="plus" size="sm" /> Upload Replacement Revision
                  </button>
                </div>
                <div className="borderbox mt16" style={{ background: '#f8fafc', padding: 20, minHeight: 140 }}>
                  <div className="between">
                    <b>{wp.workingPaper?.name || wp.documentName || `${wp.id}_Fieldwork.xlsx`}</b>
                    <span className="mono">
                      {wp.workingPaper?.sha ? `SHA-256: ${wp.workingPaper.sha.slice(0, 16)}…` : 'No file digest recorded'}
                    </span>
                  </div>
                  <p className="sub mt12" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    === AUDIT WORKING PAPER ARCHIVE ===<br />
                    Lead Schedule: {wp.id}<br />
                    Objective: {wp.objective}<br />
                    Testing procedures executed by {wp.preparer}.<br />
                    Artifact revision v{wp.version} registered in SharePoint canonical engagement hierarchy.<br />
                    Clearance State: {wp.status}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 5: Supporting Evidence */}
            {activeTab === 'evidence' && (
              <div className="panel panel-pad">
                <h3>Version-Pinned Supporting Evidence Documents</h3>
                <p className="sub" style={{ marginBottom: 16 }}>
                  Direct evidence links registered in SharePoint and pinned to this workpaper.
                </p>
                <div className="row mb12" style={{ gap: 8 }}>
                  <select className="input" aria-label="Workpaper evidence document" value={evidenceDocId} onChange={event => setEvidenceDocId(event.target.value)}>{state.documents.filter(document => document.engagementId === selectedEng.id).map(document => <option key={document.id} value={document.id}>{document.id} · {document.name} v{document.version}</option>)}</select>
                  <button className="btn sm" disabled={!evidenceDocId || wp.evidenceRefs?.includes(evidenceDocId)} onClick={handleLinkEvidence}>Pin evidence revision</button>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {(wp.evidenceRefs && wp.evidenceRefs.length > 0) ? (
                    wp.evidenceRefs.map(ref => (
                      <div key={ref} className="between borderbox" style={{ padding: 12 }}>
                        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                          <Icon name="file" />
                          <div>
                            <b>{ref}</b>
                            <div className="cell-sub">Document v{wp.evidenceRevisions?.[ref] ?? state.documents.find(d => d.id === ref)?.version ?? 'unknown'} · {state.documents.find(d => d.id === ref)?.sha ? 'Recorded SHA-256 for in-session source file' : 'Sample evidence metadata · original bytes not available'}</div>
                            {state.documents.find(d => d.id === ref)?.brokenLink && <div className="tag red" role="status">Reference unavailable</div>}
                          </div>
                        </div>
                        {state.documents.find(d => d.id === ref)?.brokenLink ? <span className="badge red">Unavailable</span> : <span className="badge green">Adequate</span>}
                        <button className="btn sm ghost" aria-label={`Unpin ${ref} from ${wp.id}`} onClick={() => handleUnlinkEvidence(ref)}>Unpin</button>
                      </div>
                    ))
                  ) : (
                    <div className="cell-sub text-muted">No external evidence attachments pinned yet.</div>
                  )}
                </div>
                {(wp.evidenceLinkHistory || []).length > 0 && <div className="caption mt12">Evidence link history: {(wp.evidenceLinkHistory || []).map(item => `${item.action} ${item.documentId} v${item.version} by ${state.users.find(user => user.id === item.actorId)?.name || item.actorId} · ${item.reason}`).join(' · ')}</div>}
              </div>
            )}

            {/* Tab 6: Clearance & History */}
            {activeTab === 'clearance' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Independent Clearance Gate & Sign-off</h3>
                    <p className="sub">
                      Separation of duties: Preparer ({wp.preparer}) cannot clear their own workpaper.
                    </p>
                  </div>
                  <span className={`badge ${wp.status === 'Cleared' ? 'green' : 'amber'}`}>
                    {wp.status}
                  </span>
                </div>

                {hasAnyRole(state, ['manager', 'partner']) && <div className="borderbox mt12" style={{ padding: 12 }}>
                  <h4>Reassign workpaper responsibility</h4>
                  <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <select className="input" aria-label="Assignment role" value={assignmentRole} onChange={event => setAssignmentRole(event.target.value as 'preparer' | 'reviewer')}><option value="preparer">Preparer</option><option value="reviewer">Reviewer</option></select>
                    <select className="input" aria-label="New workpaper assignee" value={assignmentUserId} onChange={event => setAssignmentUserId(event.target.value)}>{state.users.filter(user => user.status === 'Active' && (assignmentRole === 'preparer' ? user.role === 'preparer' : ['reviewer', 'manager', 'partner', 'eqr'].includes(user.role))).map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select>
                    <input className="input" aria-label="Reassignment reason" value={assignmentReason} onChange={event => setAssignmentReason(event.target.value)} placeholder="Reason for reassignment" />
                    <button className="btn sm" disabled={!assignmentReason.trim()} onClick={handleReassign}>Save reassignment</button>
                  </div>
                  {(wp.assignmentHistory || []).length > 0 && <details className="mt8"><summary>Assignment history ({wp.assignmentHistory!.length})</summary><ul>{wp.assignmentHistory!.map((item, index) => <li key={index}>{item.role}: {item.from || 'Unassigned'} → {state.users.find(user => user.id === item.to)?.name || item.to} · {item.reason} · {item.assignedAt}</li>)}</ul></details>}
                </div>}

                {wp.clearance ? (
                  <div className="borderbox mt16" style={{ background: '#f0fdf4', padding: 16 }}>
                    <div className="between">
                      <b style={{ color: 'var(--teal-dark)' }}>Cleared by {wp.clearance.clearedBy}</b>
                      <span>{new Date(wp.clearance.clearedAt).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="sub mt8">Source Version: v{wp.clearance.sourceVersion} · Generation: {wp.clearance.generation}</p>
                    <p className="sub mt4"><strong>Clearance Notes:</strong> {wp.clearance.notes}</p>
                  </div>
                ) : (
                  <div className="borderbox mt16" style={{ padding: 16 }}>
                    <h4>Clear Workpaper as Independent Reviewer</h4>
                    <p className="sub mt8">
                      Logged in persona: <b>{prototypeStore.getSnapshot().currentPerson}</b>
                      {prototypeStore.getSnapshot().currentPerson === wp.preparer && (
                        <span className="tag red sm" style={{ marginLeft: 8 }}>
                          Preparer (cannot sign off own workpaper)
                        </span>
                      )}
                    </p>
                    <div className="mt12">
                      <label className="caption">Clearance Review Memo</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={clearanceNotes}
                        onChange={e => setClearanceNotes(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn primary sm mt12"
                      disabled={wp.status !== 'Submitted' || wp.submittedVersion !== wp.version || (wp.reviewer !== state.currentPerson && !isSuperuserRole(state.currentRole))}
                      onClick={handleClearWorkpaper}
                    >
                      Sign & Clear Workpaper
                    </button>
                    {wp.status !== 'Submitted' && <p role="status" className="caption mt8">Only the exact submitted revision can be cleared by its assigned reviewer.</p>}
                  </div>
                )}

                <h4 className="mt20">Clearance History & Revisions</h4>
                <div className="stack mt8" style={{ gap: 6 }}>
                  {wp.clearanceHistory && wp.clearanceHistory.length > 0 ? (
                    wp.clearanceHistory.map((h, i) => (
                      <div key={i} className="cell-sub borderbox" style={{ padding: 8 }}>
                        Cleared by {h.clearedBy} on {new Date(h.clearedAt).toLocaleString('en-GB')} (Workpaper v{h.version}, Source v{h.sourceVersion})
                      </div>
                    ))
                  ) : (
                    <span className="caption">No prior clearance records.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Replacement Revision Modal */}
      {showUploadModal && wp && (
        <div className="modal-backdrop" onClick={discardRevisionDraft}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Upload Replacement Workpaper Revision</h2>
              <button type="button" className="icon-btn" aria-label="Close workpaper revision dialog" onClick={discardRevisionDraft}>✕</button>
            </div>
            <form onSubmit={handleUploadRevisionSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Target Workpaper</label>
                  <div><b>{wp.id} · {wp.title}</b> (Current v{wp.version})</div>
                </div>
                <div>
                  <label className="caption">Choose replacement file</label>
                  <input
                    type="file"
                    className="input"
                    onChange={e => setNewRevisionFile(e.target.files?.[0] || null)}
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    The browser records a digest and size; original bytes are not uploaded or saved. A replacement invalidates prior clearances.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardRevisionDraft}>Cancel</button>
                <button type="submit" className="btn primary sm" disabled={!newRevisionFile}>Record Revision v{wp.version + 1} Metadata</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
