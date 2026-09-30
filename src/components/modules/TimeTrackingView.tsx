// Module 12: Staff Time Tracking & Review (VP-028)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, TimeEntryItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, isSuperuserRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { Notice, EmptyTableRow, ActionReason } from '../common/Feedback';
import { formatCurrency, formatMinutesToHours, getEffectiveTimeEntries } from '../../services/calculations';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface TimeTrackingViewProps {
  engagementId?:string;
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const TimeTrackingView: React.FC<TimeTrackingViewProps> = ({ onNavigate, onRegisterUnsavedForm, engagementId }) => {
  const state = prototypeStore.getSnapshot();
  const isSuperuser = isSuperuserRole(state.currentRole);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [entryToReturn, setEntryToReturn] = useState<TimeEntryItem | null>(null);
  const [entryToRevise, setEntryToRevise] = useState<{ entry: TimeEntryItem; mode: 'returned' | 'approved' } | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New time entry form
  const [person, setPerson] = useState(state.currentPerson);
  const [entryDate, setEntryDate] = useState(state.asOfDate);
  const [selectedEngId, setSelectedEngId] = useState(engagementId || state.selectedEngagement);
  const [fsli, setFsli] = useState('Cash and cash equivalents');
  const [taskTitle, setTaskTitle] = useState('Substantive testing of cash and bank');
  const [minutes, setMinutes] = useState(120);
  const [activity, setActivity] = useState('Audit fieldwork');
  const [narrative, setNarrative] = useState('');
  const [billable, setBillable] = useState(true);
  const timeBaseline = useRef({ person, taskTitle, minutes, activity, narrative, billable });
  const returnBaseline = useRef('');

  const times = state.times.filter(t=>!engagementId||t.engagementId===engagementId);
  const effectiveTimes = getEffectiveTimeEntries(times);
  const billingImpactInvoices = entryToRevise?.mode === 'approved'
    ? state.invoices.filter(invoice => invoice.id === entryToRevise.entry.billedInvoiceId || invoice.lines.some(line => line.sourceType === 'Time entry' && line.sourceId === entryToRevise.entry.id))
    : [];

  const saveTimeDraft = () => {
    try {
      if (entryToRevise?.mode === 'returned') {
        prototypeStore.resubmitReturnedTime(entryToRevise.entry.id, { taskTitle, durationMinutes: minutes, activity, narrative, billable });
      } else if (entryToRevise?.mode === 'approved') {
        prototypeStore.correctApprovedTime(entryToRevise.entry.id, minutes, narrative);
      } else {
        const engObj = state.engagements.find(e => e.id === selectedEngId);
        const newEntry: TimeEntryItem = {
          id: `TIME-${crypto.randomUUID()}`,
          person,
          clientId: engObj?.client || 'CL-001',
          engagementId: selectedEngId,
          taskTitle: `[${fsli}] ${taskTitle}`,
          date: entryDate,
          durationMinutes: minutes,
          billable,
          activity,
          fsli,
          auditPhase: /planning/i.test(activity) ? 'Planning' : /review/i.test(activity) ? 'Review' : /report/i.test(activity) ? 'Reporting' : 'Fieldwork',
          narrative: narrative ? `[FSLI: ${fsli}] ${narrative}` : `[FSLI: ${fsli}]`,
          status: 'Submitted'
        };
        prototypeStore.addTimeEntry(newEntry);
      }

      setShowAddModal(false);
      setEntryToRevise(null);
      setNarrative('');
      setNotice({ type: 'success', text: entryToRevise ? 'Time correction submitted for review.' : 'Time entry submitted for review.' });
      setTimeout(() => setNotice(null), 4000);
      timeBaseline.current = { person, taskTitle, minutes, activity, narrative: '', billable };
      return true;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
      return false;
    }
  };

  const handleAddTime = (e: React.FormEvent) => { e.preventDefault(); saveTimeDraft(); };

  const discardTimeDraft = () => {
    setShowAddModal(false); setEntryToRevise(null); setPerson(state.currentPerson); setTaskTitle('Substantive testing of cash and bank'); setMinutes(120); setActivity('Audit fieldwork'); setNarrative(''); setBillable(true);
  };
  const discardReturnDraft = () => { setShowReturnModal(false); setEntryToReturn(null); setReturnReason(''); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const sameTime = () => {
      const modal = document.querySelector('.modal-backdrop');
      const baseline = timeBaseline.current;
      if (!modal) return true;
      return (modal.querySelector('select') as HTMLSelectElement | null)?.value === baseline.person
        && (modal.querySelectorAll('select')[1] as HTMLSelectElement | undefined)?.value === baseline.activity
        && Number((modal.querySelector('input[type="number"]') as HTMLInputElement | null)?.value) === baseline.minutes
        && (modal.querySelector('input[type="text"]') as HTMLInputElement | null)?.value === baseline.taskTitle
        && (modal.querySelector('textarea') as HTMLTextAreaElement | null)?.value === baseline.narrative
        && (modal.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked === baseline.billable;
    };
    onRegisterUnsavedForm({ label: 'time entry or correction', isDirty: () => showAddModal && !sameTime(), save: saveTimeDraft, discard: discardTimeDraft }, 'time-entry-draft');
    onRegisterUnsavedForm({ label: 'time return reason', isDirty: () => showReturnModal && returnReason.trim() !== returnBaseline.current, save: () => { if (!entryToReturn || !returnReason.trim()) return false; try { prototypeStore.reviewTimeEntry(entryToReturn.id, 'Returned', returnReason); discardReturnDraft(); return true; } catch { return false; } }, discard: discardReturnDraft }, 'time-return-draft');
    return () => { onRegisterUnsavedForm(null, 'time-entry-draft'); onRegisterUnsavedForm(null, 'time-return-draft'); };
  }, [onRegisterUnsavedForm, showAddModal, showReturnModal, person, taskTitle, minutes, activity, narrative, billable, entryToReturn, returnReason, entryToRevise]);

  const openNewTimeModal = () => { setEntryToRevise(null); timeBaseline.current = { person, taskTitle, minutes, activity, narrative, billable }; setShowAddModal(true); };

  const openRevision = (entry: TimeEntryItem, mode: 'returned' | 'approved') => {
    timeBaseline.current = { person: entry.person, taskTitle: entry.taskTitle, minutes: entry.durationMinutes, activity: entry.activity, narrative: mode === 'returned' ? entry.narrative || '' : '', billable: entry.billable };
    setEntryToRevise({ entry, mode });
    setTaskTitle(entry.taskTitle);
    setMinutes(entry.durationMinutes);
    setActivity(entry.activity);
    setNarrative(mode === 'returned' ? entry.narrative || '' : '');
    setBillable(entry.billable);
    setPerson(entry.person);
    setShowAddModal(true);
  };

  const handleApprove = (entry: TimeEntryItem) => {
    try {
      prototypeStore.reviewTimeEntry(entry.id, 'Approved');
      setNotice({ type: 'success', text: `Time entry for ${entry.person} (${entry.durationMinutes} min) approved.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToReturn || !returnReason.trim()) return;

    prototypeStore.reviewTimeEntry(entryToReturn.id, 'Returned', returnReason);
    setShowReturnModal(false);
    setEntryToReturn(null);
    setReturnReason('');
  };

  const totalMinutes = effectiveTimes.reduce((s, t) => s + t.durationMinutes, 0);
  const approvedMinutes = effectiveTimes.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Daily Engagement / FSLI Time</h1>
          <p>Record minute-level activity, enforce separation of duties, and manage timesheet approval.</p>
        </div>
        <button className="btn primary sm" onClick={openNewTimeModal}>
          <Icon name="plus" /> Record Time Entry
        </button>
      </div>

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Total Time Recorded</span>
          <div className="metric-val">{totalMinutes} min</div>
          <span className="metric-sub">{formatMinutesToHours(totalMinutes)}</span>
        </div>
        <div className="metric green">
          <span className="metric-label">Approved Time</span>
          <div className="metric-val">{approvedMinutes} min</div>
          <span className="metric-sub">{formatMinutesToHours(approvedMinutes)}</span>
        </div>
        <div className="metric amber">
          <span className="metric-label">Pending Review</span>
          <div className="metric-val">{times.filter(t => t.status === 'Submitted').length}</div>
          <span className="metric-sub">Awaiting manager sign-off</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Practice Timesheet Register ({times.length})</h3>
          <span className="caption">Totals exclude superseded corrections; prior revisions remain listed. Reviewer cannot approve own entries.</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Entry ID</th>
                <th>Date</th>
                <th>Staff Person</th>
                <th>Task / Narrative</th>
                <th>Activity</th>
                <th>Duration</th>
                <th>Billable</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {times.length === 0 && <EmptyTableRow colSpan={9} title="No time entries yet" description="Use “Record Time Entry” to log work against an engagement and FSLI. Entries are submitted for independent review, can be returned with a reason, corrected, and resubmitted; approved time retains its role charge-out rate for practice analytics." />}
              {times.map(t => (
                <tr key={t.id}>
                  <td><b>{t.id}</b></td>
                  <td>{t.date}</td>
                  <td><b>{t.person}</b></td>
                  <td>
                    <b>{t.taskTitle}</b>
                    {t.narrative && <div className="cell-sub">{t.narrative}</div>}
                    {t.returnReason && <div className="rework-note"><StatusBadge status="Returned" /> <span>Returned: {t.returnReason}{t.reviewedBy ? ` — ${t.reviewedBy}` : ''}</span></div>}
                    {t.supersedesId && <div className="cell-sub">Revision of {t.supersedesId}{t.correctionRevision ? ` · correction r${t.correctionRevision}` : ''}</div>}
                  </td>
                  <td>{t.activity}</td>
                  <td>
                    <b>{t.durationMinutes} min</b>
                    <div className="cell-sub">{formatMinutesToHours(t.durationMinutes)}</div>
                  </td>
                  <td>
                    <span className={`tag ${t.billable ? 'blue' : 'gray'}`}>
                      {t.billable ? 'Billable' : 'Non-billable'}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    {t.status === 'Submitted' && (
                      <div className="row" style={{ gap: 6 }}>
                        {hasAnyRole(state, ['manager', 'reviewer', 'partner']) && (t.person !== state.currentPerson || isSuperuser) && (
                          <>
                            <button
                              className="btn sm"
                              onClick={() => handleApprove(t)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn sm ghost"
                              onClick={() => {
                                setEntryToReturn(t);
                                setReturnReason(''); returnBaseline.current = '';
                                setShowReturnModal(true);
                              }}
                            >
                              Return
                            </button>
                          </>
                        )}
                        {hasAnyRole(state, ['manager', 'reviewer', 'partner']) && t.person === state.currentPerson && !isSuperuser && <ActionReason>Self-review not permitted — another reviewer must decide</ActionReason>}
                        {!hasAnyRole(state, ['manager', 'reviewer', 'partner']) && <ActionReason>Awaiting review by a manager, reviewer or partner</ActionReason>}
                      </div>
                    )}
                    {t.status === 'Approved' && (
                      <div className="stack" style={{ gap: 4 }}>
                        <span className="caption">By {t.reviewedBy}{t.reviewedAt ? ` · ${new Date(t.reviewedAt).toLocaleDateString()}` : ''}</span>
                        {(t.person === state.currentPerson || hasAnyRole(state, ['manager', 'partner'])) && <button className="btn sm ghost" onClick={() => openRevision(t, 'approved')}>Correct approved time</button>}
                      </div>
                    )}
                    {t.status === 'Returned' && (t.person === state.currentPerson || isSuperuser) && <button className="btn sm ghost" onClick={() => openRevision(t, 'returned')}>Resubmit correction</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Time Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={discardTimeDraft}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{entryToRevise?.mode === 'approved' ? 'Correct Approved Time' : entryToRevise ? 'Resubmit Returned Time' : 'Record Time Entry'}</h2>
              <button className="icon-btn" onClick={discardTimeDraft}>✕</button>
            </div>
            {billingImpactInvoices.length > 0 && <div className="badge amber" role="status" style={{ margin: '12px 20px 0', padding: '10px 12px', lineHeight: 1.5 }}>
              Billing impact: this approved time is linked to {billingImpactInvoices.map(invoice => `${invoice.invoiceNumber || invoice.id} (${invoice.status}, ${formatCurrency(invoice.amount, invoice.currency)})`).join(', ')}. This correction creates a separate time revision and does not change or reissue those invoices. Review any billing adjustment separately.
            </div>}
            <form onSubmit={handleAddTime}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Entry Date</label>
                    <input
                      type="date"
                      className="input"
                      value={entryDate}
                      onChange={e => setEntryDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Engagement</label>
                    <select
                      className="input"
                      value={selectedEngId}
                      onChange={e => setSelectedEngId(e.target.value)}
                      disabled={!!entryToRevise}
                    >
                      {state.engagements.map(eng => {
                        const cl = state.clients.find(c => c.id === eng.client);
                        return (
                          <option key={eng.id} value={eng.id}>{eng.id} · {cl?.name || eng.client}</option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="grid2">
                  <div>
                    <label className="caption">Target FSLI / Financial Statement Area</label>
                    <select
                      className="input"
                      value={fsli}
                      onChange={e => setFsli(e.target.value)}
                    >
                      <option value="Cash and cash equivalents">Cash and cash equivalents</option>
                      <option value="Trade and other receivables">Trade and other receivables</option>
                      <option value="Property, plant and equipment">Property, plant and equipment</option>
                      <option value="Inventories">Inventories</option>
                      <option value="Trade and other payables">Trade and other payables</option>
                      <option value="Revenue from contracts">Revenue from contracts</option>
                      <option value="Operating and administrative expenses">Operating expenses</option>
                      <option value="Borrowings & debt">Borrowings & debt</option>
                      <option value="Equity & reserves">Equity & reserves</option>
                      <option value="Analytical review & going concern">Analytical review & going concern</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Activity Type</label>
                    <select
                      className="input"
                      value={activity}
                      onChange={e => setActivity(e.target.value)}
                    >
                      <option value="Audit fieldwork">Audit fieldwork</option>
                       <option value="Audit planning">Audit planning</option>
                       <option value="Audit reporting">Audit reporting</option>
                      <option value="Quality review">Quality review</option>
                      <option value="Management">Management & Supervision</option>
                      <option value="Client liaison">Client liaison</option>
                    </select>
                  </div>
                </div>

                <div className="grid2">
                  <div>
                    <label className="caption">Staff Member</label>
                    <select
                      className="input"
                      value={person}
                      onChange={e => setPerson(e.target.value)}
                      disabled={!!entryToRevise}
                    >
                      {state.users.filter(u => u.name === state.currentPerson).map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                    <div className="caption mt4">Each persona records only its own time.</div>
                  </div>
                  <div>
                    <label className="caption">Duration (Minutes)</label>
                    <input
                      type="number"
                      step={15}
                      className="input"
                      value={minutes}
                      onChange={e => setMinutes(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Task Title</label>
                  <input
                    type="text"
                    className="input"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">{entryToRevise?.mode === 'approved' ? 'Correction Reason (Required)' : 'Work Narrative & Findings'}</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Describe specific testing performed, workpaper references, or queries raised..."
                    value={narrative}
                    onChange={e => setNarrative(e.target.value)}
                    required={entryToRevise?.mode === 'approved'}
                  />
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={billable}
                    onChange={e => setBillable(e.target.checked)}
                  />
                  <span>Billable client time</span>
                </label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardTimeDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">{entryToRevise ? 'Submit Correction' : 'Submit Time Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Time Modal */}
      {showReturnModal && entryToReturn && (
        <div className="modal-backdrop" onClick={discardReturnDraft}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Return Time Entry</h2>
              <button className="icon-btn" onClick={discardReturnDraft}>✕</button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Entry</label>
                  <div><b>{entryToReturn.person}: {entryToReturn.taskTitle} ({entryToReturn.durationMinutes} min)</b></div>
                </div>
                <div>
                  <label className="caption">Reason for Return (Required)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specify why this entry needs correction or clarification..."
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardReturnDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Return Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
