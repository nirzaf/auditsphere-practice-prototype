// Module 35: Review Desk & Clearance Workflow (VP-055)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, ReviewNoteItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { eligibleReviewAssignees, visibleEngagementIds } from '../../services/guards';
import { exportService } from '../../services/exportService';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

import { StatusBadge } from '../common/Enterprise';
interface ReviewDeskViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ReviewDeskView: React.FC<ReviewDeskViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="message" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to inspect reviewer notes and query resolution.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const reviews = selectedEng.reviews;
  const eligibleAssignees = eligibleReviewAssignees(state, selectedEng.id);

  const [selectedNote, setSelectedNote] = useState<ReviewNoteItem | null>(null);
  const [selectedNoteEngagementId, setSelectedNoteEngagementId] = useState(selectedEng.id);
  const [queueFilter, setQueueFilter] = useState<'engagement' | 'assigned' | 'scoped'>('engagement');
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [reassignmentTargets, setReassignmentTargets] = useState<Record<string, string>>({});
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New review point form
  const [subjectType, setSubjectType] = useState<'workpaper' | 'finding'>('workpaper');
  const [targetWp, setTargetWp] = useState('WP-A1');
  const [assignee, setAssignee] = useState(eligibleAssignees.find(user => user.role === 'preparer')?.name || eligibleAssignees[0]?.name || '');
  const [queryText, setQueryText] = useState('');

  // Response form
  const [responseText, setResponseText] = useState('');
  const [evidenceDoc, setEvidenceDoc] = useState(state.documents.find(document => document.engagementId === selectedEng?.id)?.id || '');
  const raiseBaseline = useRef({ subjectType, targetWp, assignee, queryText });
  const responseBaseline = useRef({ responseText, evidenceDoc, noteId: selectedNote?.id || '' });

  const handleRaiseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;

    const newNote: ReviewNoteItem = {
      id: `RN-0${reviews.length + 1}`,
      wp: targetWp,
      subjectType,
      title: queryText.slice(0, 40),
      body: queryText,
      author: state.currentPerson,
      raisedBy: state.currentPerson,
      assigned: assignee,
      due: '2026-10-15',
      response: '',
      severity: 'Medium',
      version: 1,
      text: queryText,
      status: 'Open',
      history: [
        {
          actor: state.currentPerson,
          action: 'Raised review query',
          time: 'Today · 10:00',
          text: queryText
        }
      ]
    };

    prototypeStore.addReviewNote(selectedEng.id, newNote);
    setShowRaiseModal(false);
    setQueryText('');
  };

  const handleRespondSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !responseText.trim()) return;

    prototypeStore.respondReviewNote(selectedNoteEngagementId, selectedNote.id, responseText, evidenceDoc);
    setShowRespondModal(false);
    setSelectedNote(null);
    setResponseText('');
  };

  const discardRaiseDraft = () => { setShowRaiseModal(false); setSubjectType('workpaper'); setTargetWp(selectedEng.workpapers[0]?.id || ''); setAssignee(eligibleAssignees.find(user => user.role === 'preparer')?.name || eligibleAssignees[0]?.name || ''); setQueryText(''); };
  const discardResponseDraft = () => { setShowRespondModal(false); setSelectedNote(null); setResponseText(''); setEvidenceDoc(state.documents.find(document => document.engagementId === selectedEng.id)?.id || ''); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'new review point draft', isDirty: () => showRaiseModal && (subjectType !== raiseBaseline.current.subjectType || targetWp !== raiseBaseline.current.targetWp || assignee !== raiseBaseline.current.assignee || queryText !== raiseBaseline.current.queryText), save: () => { if (!queryText.trim()) return false; prototypeStore.addReviewNote(selectedEng.id, { id: `RN-0${reviews.length + 1}`, wp: targetWp, subjectType, title: queryText.slice(0, 40), body: queryText, author: state.currentPerson, raisedBy: state.currentPerson, assigned: assignee, due: '2026-10-15', response: '', severity: 'Medium', version: 1, text: queryText, status: 'Open', history: [{ actor: state.currentPerson, action: 'Raised review query', time: 'Today · 10:00', text: queryText }] }); discardRaiseDraft(); return true; }, discard: discardRaiseDraft }, 'review-raise-draft');
    onRegisterUnsavedForm({ label: 'review response draft', isDirty: () => showRespondModal && (responseText !== responseBaseline.current.responseText || evidenceDoc !== responseBaseline.current.evidenceDoc || selectedNote?.id !== responseBaseline.current.noteId), save: () => { if (!selectedNote || !responseText.trim()) return false; prototypeStore.respondReviewNote(selectedNoteEngagementId, selectedNote.id, responseText, evidenceDoc); discardResponseDraft(); return true; }, discard: discardResponseDraft }, 'review-response-draft');
    return () => { onRegisterUnsavedForm(null, 'review-raise-draft'); onRegisterUnsavedForm(null, 'review-response-draft'); };
  }, [onRegisterUnsavedForm, showRaiseModal, showRespondModal, subjectType, targetWp, assignee, queryText, selectedNote, selectedNoteEngagementId, responseText, evidenceDoc, selectedEng.id, reviews.length]);

  const handleOpenRespond = (engagementId: string, note: ReviewNoteItem) => {
    setSelectedNote(note);
    setSelectedNoteEngagementId(engagementId);
    setEvidenceDoc(state.documents.find(document => document.engagementId === engagementId)?.id || '');
    responseBaseline.current = { responseText: '', evidenceDoc: state.documents.find(document => document.engagementId === engagementId)?.id || '', noteId: note.id };
    setShowRespondModal(true);
  };

  const handleClearNote = (engagementId: string, noteId: string) => {
    try {
      prototypeStore.clearReviewNote(engagementId, noteId);
      setNotice({ type: 'success', text: `Review note ${noteId} cleared successfully.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleReassign = (engagementId: string, note: ReviewNoteItem, assigneeUserId: string) => {
    const reason = window.prompt('Reason for reassigning this review point:');
    if (reason === null) return;
    try {
      prototypeStore.reassignReviewNote(engagementId, note.id, assigneeUserId, reason);
      setNotice({ type: 'success', text: `Review note ${note.id} reassigned.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const allowedEngagementIds = visibleEngagementIds(state);
  const queueRows = state.engagements
    .filter(engagement => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(engagement.id))
    .flatMap(engagement => engagement.reviews.map(note => ({ engagementId: engagement.id, note })))
    .filter(row => queueFilter === 'scoped' || queueFilter === 'assigned' && (row.note.assignedUserId === state.currentUserId || (!row.note.assignedUserId && (row.note.assignee || row.note.assigned) === state.currentPerson)) || queueFilter === 'engagement' && row.engagementId === selectedEng.id);
  const filteredQueueRows = queueRows.filter(({ note }) => (statusFilter === 'All' || note.status === statusFilter) && (severityFilter === 'All' || note.severity === severityFilter));

  const handleExportQueue = () => exportService.exportCSV(`Review_Queue_${state.asOfDate}`, [
    ['Engagement', 'Note ID', 'Subject Type', 'Subject ID', 'Assignee', 'Status', 'Severity', 'Due', 'Query', 'Response', 'Response Evidence'],
    ...filteredQueueRows.map(({ engagementId, note }) => [engagementId, note.id, note.subjectType === 'finding' ? 'Finding' : 'Workpaper', note.wp, note.assignee || note.assigned, note.status, note.severity, note.due, note.text || note.body, note.response, note.responseEvidence || ''])
  ]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagement Review Desk</h1>
          <p>Multi-tiered review queries, evidentiary responses, and independent sign-off gates.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={() => { raiseBaseline.current = { subjectType, targetWp, assignee, queryText }; setShowRaiseModal(true); }}>
            <Icon name="plus" /> Raise Review Note
          </button>
        </div>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <h3>Review Queue ({filteredQueueRows.length} of {queueRows.length})</h3>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <label className="caption">Queue scope
                <select aria-label="Review queue scope" className="input" value={queueFilter} onChange={e => setQueueFilter(e.target.value as typeof queueFilter)}>
                  <option value="engagement">Selected engagement</option>
                  <option value="assigned">Assigned to me</option>
                  <option value="scoped">All permitted engagements</option>
                </select>
              </label>
              <label className="caption">Status
                <select aria-label="Review status filter" className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  {['All', 'Open', 'Responded', 'Reopened', 'Cleared'].map(status => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="caption">Severity
                <select aria-label="Review severity filter" className="input" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                  {['All', 'High', 'Medium', 'Low'].map(severity => <option key={severity}>{severity}</option>)}
                </select>
              </label>
              <button className="btn sm ghost" onClick={handleExportQueue}>Export filtered queue</button>
            </div>
          </div>
          <span className="caption">Only notes in your granted engagement scope appear. Responders cannot clear their own query.</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Note ID</th>
                <th>Subject</th>
                <th>Author</th>
                <th>Assignee</th>
                <th>Review Query</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueueRows.map(({ engagementId, note: r }) => (
                <tr key={`${engagementId}:${r.id}`}>
                  <td><b>{r.id}</b></td>
                  <td><span className="mono">{engagementId} · {r.subjectType === 'finding' ? 'Finding' : 'Workpaper'} {r.wp}</span></td>
                  <td>{r.author}</td>
                  <td><b>{r.assignee || r.assigned}</b>{r.assignmentHistory && r.assignmentHistory.length > 1 && <div className="caption">{r.assignmentHistory.length} assignment events</div>}</td>
                  <td>
                    <b>{r.text}</b>
                    {r.response && (
                      <div className="cell-sub" style={{ color: 'var(--teal-dark)', marginTop: 4 }}>
                        <strong>{r.status === 'Reopened' ? 'Prior response:' : 'Response:'}</strong> {r.response}
                        {r.responseEvidence && <span> (Evidence: {r.responseEvidence})</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${r.status === 'Cleared' ? 'green' : r.status === 'Responded' ? 'blue' : 'amber'}`}>
                      <StatusBadge status={r.status} />
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {['Open', 'Reopened'].includes(r.status) && (
                        <button
                          className="btn sm"
                          onClick={() => handleOpenRespond(engagementId, r)}
                        >
                          Respond
                        </button>
                      )}
                      {r.status === 'Responded' && (
                        <button
                          className="btn sm primary"
                          onClick={() => handleClearNote(engagementId, r.id)}
                        >
                          Clear Note
                        </button>
                      )}
                      {r.status === 'Cleared' && (
                        <span className="caption">Cleared</span>
                      )}
                      {hasAnyRole(state, ['manager', 'reviewer', 'partner']) && r.status !== 'Cleared' && eligibleReviewAssignees(state, engagementId).length > 0 && <>
                        <select aria-label={`Reassign ${engagementId} ${r.id}`} className="input" value={reassignmentTargets[`${engagementId}:${r.id}`] || r.assignedUserId || eligibleReviewAssignees(state, engagementId).find(user => user.name === (r.assignee || r.assigned))?.id || ''} onChange={event => setReassignmentTargets({ ...reassignmentTargets, [`${engagementId}:${r.id}`]: event.target.value })}>
                          {eligibleReviewAssignees(state, engagementId).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                        <button className="btn sm ghost" onClick={() => handleReassign(engagementId, r, reassignmentTargets[`${engagementId}:${r.id}`] || r.assignedUserId || eligibleReviewAssignees(state, engagementId).find(user => user.name === (r.assignee || r.assigned))?.id || '')}>Reassign</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredQueueRows.length === 0 && <tr><td colSpan={7} className="caption">No review points match these filters in your permitted scope.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raise Modal */}
      {showRaiseModal && (
        <div className="modal-backdrop" onClick={discardRaiseDraft}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Raise Review Point</h2>
              <button type="button" className="icon-btn" aria-label="Close raise review point dialog" onClick={discardRaiseDraft}>✕</button>
            </div>
            <form onSubmit={handleRaiseSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Review Subject Type</label>
                    <select aria-label="Review subject type" className="input" value={subjectType} onChange={e => { const next = e.target.value as typeof subjectType; setSubjectType(next); setTargetWp(next === 'finding' ? state.findings.find(finding => finding.engagementId === selectedEng.id)?.id || '' : selectedEng.workpapers[0]?.id || ''); }}>
                      <option value="workpaper">Workpaper</option>
                      <option value="finding">Finding</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Target {subjectType === 'finding' ? 'Finding' : 'Workpaper'}</label>
                    <select
                      className="input"
                      aria-label="Review subject"
                      value={targetWp}
                      onChange={e => setTargetWp(e.target.value)}
                    >
                      {subjectType === 'finding' && !state.findings.some(finding => finding.engagementId === selectedEng.id) && <option value="">No findings in this engagement</option>}
                      {subjectType === 'finding' ? state.findings.filter(finding => finding.engagementId === selectedEng.id).map(finding => <option key={finding.id} value={finding.id}>{finding.id} - {finding.title}</option>) : selectedEng.workpapers.map(workpaper => <option key={workpaper.id} value={workpaper.id}>{workpaper.id} - {workpaper.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Assigned Preparer</label>
                    <select
                      className="input"
                      value={assignee}
                      onChange={e => setAssignee(e.target.value)}
                    >
                      {eligibleAssignees.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Review Query Description</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Specify evidence gap, calculation ambiguity, or required disclosure clarification..."
                    value={queryText}
                    onChange={e => setQueryText(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardRaiseDraft}>Cancel</button>
                <button type="submit" className="btn primary sm" disabled={!targetWp}>Raise Query</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Respond Modal */}
      {showRespondModal && selectedNote && (
        <div className="modal-backdrop" onClick={discardResponseDraft}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
            <h2>Respond to {selectedNote.id} ({selectedNote.subjectType === 'finding' ? 'Finding' : 'Workpaper'} {selectedNote.wp})</h2>
              <button type="button" className="icon-btn" aria-label="Close review response dialog" onClick={discardResponseDraft}>✕</button>
            </div>
            <form onSubmit={handleRespondSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="borderbox" style={{ background: '#f8fafc', padding: 12 }}>
                  <span className="caption">Query Raised by {selectedNote.author}:</span>
                  <div style={{ marginTop: 4, fontWeight: 500 }}>{selectedNote.text}</div>
                </div>
                <div>
                  <label className="caption">Fieldwork Response & Correction Details</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Describe testing performed, corrective journal proposed, or schedule revised..."
                    value={responseText}
                    onChange={e => setResponseText(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Linked Supporting Evidence Document</label>
                  <input
                    type="text"
                    className="input"
                    value={evidenceDoc}
                    onChange={e => setEvidenceDoc(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardResponseDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Submit Response</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
