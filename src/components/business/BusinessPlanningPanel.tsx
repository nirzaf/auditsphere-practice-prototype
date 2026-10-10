import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import type { BusinessCapacity, BusinessContextResponse, BusinessPlanningWorkspace, BusinessWorkspacePreference } from '../../shared/api/business';
import { getBusinessCapacity, getBusinessPlanningWorkspace, newBusinessIdempotencyKey, runBusinessCommand } from '../../services/businessWorkspace';
import { suggestMilestones, type SuggestedMilestones } from '../../shared/milestoneDefaults';

type EngagementRef = { id: string; clientId: string; code: string; clientName: string; lifecycleState: string; periodEnd: string };
type MilestoneCode = 'FIELDWORK_START' | 'DRAFT_REPORT' | 'FINAL_REPORT' | 'STATUTORY_CUTOFF';

function parseDailySchedule(value: string): Array<{ date: string; minutes: number }> {
  const rows = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})\s*(?:,|=|:)\s*(\d+)$/);
    if (!match) throw new Error('Enter each workday as YYYY-MM-DD, minutes on its own line.');
    return { date: match[1], minutes: Number(match[2]) };
  });
  if (!rows.length) throw new Error('Enter at least one explicit workday and its planned minutes.');
  return rows;
}

export function BusinessPlanningPanel({
  workspaceId, selected, context, engagement, onChanged
}: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: EngagementRef;
  onChanged: () => void;
}) {
  const scope = useMemo(() => ({ ...selected, clientId: engagement.clientId, engagementId: engagement.id }),
    [selected.actorId, selected.persona, selected.clientId, engagement.clientId, engagement.id]);
  const today = new Date().toISOString().slice(0, 10);
  const [capacityDate, setCapacityDate] = useState(today);
  const [capacityRangeEnd, setCapacityRangeEnd] = useState(today);
  const [workspace, setWorkspace] = useState<BusinessPlanningWorkspace | null>(null);
  const [capacity, setCapacity] = useState<BusinessCapacity | null>(null);
  const [loadedScope, setLoadedScope] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [staffMemberId, setStaffMemberId] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState(today);
  const [scheduledMinutes, setScheduledMinutes] = useState('480');
  const [assignmentPersona, setAssignmentPersona] = useState<'PREPARER' | 'REVIEWER' | 'APPROVER'>('PREPARER');
  const [assignmentPhase, setAssignmentPhase] = useState('FIELDWORK');
  const [assignmentStart, setAssignmentStart] = useState(today);
  const [assignmentEnd, setAssignmentEnd] = useState(today);
  const [assignmentMinutes, setAssignmentMinutes] = useState('240');
  const [dailySchedule, setDailySchedule] = useState(`${today}, 240`);
  const [milestoneCode, setMilestoneCode] = useState<MilestoneCode>('STATUTORY_CUTOFF');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [milestoneSource, setMilestoneSource] = useState('');
  const [suggestedSchedule, setSuggestedSchedule] = useState<SuggestedMilestones | null>(null);
  const [leaveMinutes, setLeaveMinutes] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [exceptionMinutes, setExceptionMinutes] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');

  const scopeKey = [workspaceId, context.actor.id, context.actor.persona, context.actor.clientId ?? scope.clientId, engagement.id].join('|');
  const data = loadedScope === scopeKey ? workspace : null;
  const staff = data?.staff ?? [];
  const capacityGrid = useMemo(() => {
    const dates: string[] = [];
    const byStaff = new Map<string, Map<string, BusinessCapacity['staffDays'][number]>>();
    for (const day of capacity?.staffDays ?? []) {
      if (!dates.includes(day.workDate)) dates.push(day.workDate);
      const row = byStaff.get(day.staffMemberId) ?? new Map<string, BusinessCapacity['staffDays'][number]>();
      row.set(day.workDate, day);
      byStaff.set(day.staffMemberId, row);
    }
    dates.sort();
    return { dates, byStaff };
  }, [capacity]);
  const selectedStaff = staff.find(item => item.id === staffMemberId) ?? staff[0];
  const selectedCapacity = capacity?.staffDays.find(day => day.staffMemberId === selectedStaff?.id && day.workDate === availabilityDate);
  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setWorkspace(null);
    setCapacity(null);
    setLoadedScope('');
    Promise.all([
      getBusinessPlanningWorkspace(workspaceId, engagement.id, scope, controller.signal),
      getBusinessCapacity(workspaceId, scope, capacityDate, capacityRangeEnd < capacityDate ? capacityDate : capacityRangeEnd, controller.signal)
    ]).then(([plan, days]) => {
      if (controller.signal.aborted) return;
      setWorkspace(plan);
      setCapacity(days);
      setLoadedScope(scopeKey);
      setStaffMemberId(current => plan.staff.some(item => item.id === current) ? current : plan.staff[0]?.id ?? '');
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Planning records could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, scope.actorId, scope.persona, scope.clientId, scope.engagementId, capacityDate, capacityRangeEnd, refresh, scopeKey]);

  async function command(type: string, payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      await runBusinessCommand(workspaceId, scope, { type, payload }, newBusinessIdempotencyKey());
      setMessage(success);
      setRefresh(value => value + 1);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The planning command could not be saved.');
    } finally { setBusy(false); }
  }

  async function setAvailability(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff) return;
    const minutes = Number(scheduledMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) { setError('Scheduled minutes must be between 0 and 1,440.'); return; }
    await command('staffing.availability.set', { staffMemberId: selectedStaff.id, workDate: availabilityDate, scheduledMinutes: minutes,
      ...(selectedCapacity?.availabilityVersion ? { expectedVersion: selectedCapacity.availabilityVersion } : {}) }, 'Staff capacity saved.');
  }

  async function assignStaff(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff) return;
    try {
      const days = parseDailySchedule(dailySchedule);
      const plannedMinutes = Number(assignmentMinutes);
      await command('staffing.assign', { engagementId: engagement.id, staffMemberId: selectedStaff.id, persona: assignmentPersona,
        phase: assignmentPhase, startDate: assignmentStart, endDate: assignmentEnd, plannedMinutes, dailyMinutes: days }, 'Capacity-checked staff assignment saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter an explicit daily schedule.'); }
  }

  async function saveMilestone(event: FormEvent) {
    event.preventDefault();
    if (!milestoneDate || !milestoneSource.trim()) { setError('Enter the date and its firm-approved source.'); return; }
    const prior = data?.milestones.find(item => item.code === milestoneCode);
    await command('milestone.set', { engagementId: engagement.id, code: milestoneCode, targetDate: milestoneDate,
      sourceReference: milestoneSource, ...(prior ? { expectedVersion: prior.version } : {}) }, 'Milestone saved with its source reference.');
  }

  function prefillSuggestedSchedule() {
    try {
      setSuggestedSchedule(suggestMilestones(engagement.periodEnd));
      setError('');
      setMessage('Suggested dates are ready to review. They are not saved until you submit this schedule.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suggested dates could not be calculated.');
    }
  }

  async function saveSuggestedSchedule(event: FormEvent) {
    event.preventDefault();
    if (!suggestedSchedule) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await runBusinessCommand<{
        applied: Array<{ code: string }>;
        preserved: string[];
        skipped: Array<{ code: string; reason: string }>;
      }>(workspaceId, scope, { type: 'milestone.applyDefaults', payload: {
        engagementId: engagement.id, periodEnd: engagement.periodEnd, overwrite: false, suggestedDates: suggestedSchedule
      } }, newBusinessIdempotencyKey());
      const applied = result.result.applied.length;
      const preserved = result.result.preserved.length;
      const skipped = result.result.skipped.length;
      setMessage(`Schedule saved: ${applied} suggested milestones applied, ${preserved} existing dates preserved, ${skipped} blocked by the statutory cutoff.`);
      setRefresh(value => value + 1);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The suggested milestone schedule could not be saved.');
    } finally { setBusy(false); }
  }

  async function recordLeave(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff) return;
    await command('staffing.leave.record', { staffMemberId: selectedStaff.id, workDate: availabilityDate,
      minutes: Number(leaveMinutes), reason: leaveReason }, 'Approved leave recorded against staff capacity.');
  }

  async function approveException(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff) return;
    await command('staffing.capacityException.approve', { staffMemberId: selectedStaff.id, workDate: availabilityDate,
      excessMinutes: Number(exceptionMinutes), reason: exceptionReason }, 'Partner-approved capacity exception recorded.');
  }

  return <section id="route-audit-planning" className="business-directory-card business-planning-panel" aria-labelledby="business-planning-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">PLANNING · US-GOV-003</p><h2 id="business-planning-heading">Staffing and milestones</h2>
        <p className="business-muted">{engagement.clientName} · {engagement.code} · {engagement.lifecycleState.replaceAll('_', ' ')}</p></div>
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-command-message" role="status">{message}</p>}
    {loading ? <p role="status">Loading current planning records…</p> : !data ? <p className="business-muted">Planning records are not available in this request context.</p> : <>
      <div className="business-form-grid">
        <label className="business-field" htmlFor="business-planning-capacity-date"><span>Capacity date</span><input id="business-planning-capacity-date" type="date" value={availabilityDate} onChange={event => { setAvailabilityDate(event.target.value); setCapacityDate(event.target.value); }} /></label>
        <label className="business-field" htmlFor="business-planning-staff"><span>Staff member</span><select id="business-planning-staff" value={selectedStaff?.id ?? ''} onChange={event => setStaffMemberId(event.target.value)}>
          {staff.map(person => <option key={person.id} value={person.id}>{person.displayName} · {person.grade}</option>)}
        </select></label>
        <label className="business-field" htmlFor="business-planning-capacity-end"><span>Range end date</span><input id="business-planning-capacity-end" type="date" value={capacityRangeEnd} onChange={event => setCapacityRangeEnd(event.target.value)} /></label>
      </div>

      {context.allowedActions.includes('staffing.manage') && <form className="business-form business-commercial-form" onSubmit={setAvailability}>
        <h3>Record actual daily capacity</h3>
        <p className="business-note">Available minutes are scheduled minutes less Partner-approved leave. No capacity is inferred for unrecorded days.</p>
        <div className="business-form-grid"><label className="business-field" htmlFor="business-planning-scheduled"><span>Scheduled minutes</span><input id="business-planning-scheduled" type="number" min="0" max="1440" step="1" required value={scheduledMinutes} onChange={event => setScheduledMinutes(event.target.value)} /></label>
          <div className="business-field" aria-live="polite"><span>Current day</span><strong>{selectedCapacity ? `${selectedCapacity.availableMinutes ?? 0} available · ${selectedCapacity.assignedMinutes} assigned` : 'No schedule recorded'}</strong></div></div>
        <button className="btn sm" type="submit" disabled={busy || !selectedStaff}>{busy ? 'Saving…' : 'Save working schedule'}</button>
      </form>}

      {capacity && capacity.staffDays.length > 0 && <section className="business-capacity-calendar" aria-label="Capacity calendar">
        <h3>Capacity calendar · {capacity.from} to {capacity.to}</h3>
        <div className="business-capacity-scroll">
          <table>
            <caption className="business-muted">Each cell shows available / assigned minutes for the working day. Colour and title show the capacity status.</caption>
            <thead><tr><th scope="col">Staff</th>{capacityGrid.dates.map(date => <th scope="col" key={date}>{date}</th>)}</tr></thead>
            <tbody>
              {[...capacityGrid.byStaff.entries()].map(([memberId, days]) => {
                const sample = capacity.staffDays.find(day => day.staffMemberId === memberId)!;
                return <tr key={memberId}>
                  <th scope="row">{sample.displayName} · {sample.grade}</th>
                  {capacityGrid.dates.map(date => {
                    const day = days.get(date);
                    if (!day) return <td key={date} data-status="NONE">—</td>;
                    const label = `${day.availableMinutes ?? 0} / ${day.assignedMinutes}${day.approvedLeaveMinutes ? ` · leave ${day.approvedLeaveMinutes}` : ''}`;
                    return <td key={date} data-status={day.capacityStatus} title={day.capacityStatus.replaceAll('_', ' ')}>{label}</td>;
                  })}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>}

      <form id="route-scheduling" className="business-form business-commercial-form" onSubmit={assignStaff}>
        <h3>Assign a staff member to this engagement</h3>
        <p className="business-note">Enter every assigned day explicitly. Planned daily minutes must sum to the assignment total and fit the recorded capacity.</p>
        <div className="business-form-grid">
          <label className="business-field" htmlFor="business-planning-persona"><span>Assigned persona</span><select id="business-planning-persona" value={assignmentPersona} onChange={event => setAssignmentPersona(event.target.value as typeof assignmentPersona)}><option value="PREPARER">PREPARER</option><option value="REVIEWER">REVIEWER</option><option value="APPROVER">APPROVER</option></select></label>
          <label className="business-field" htmlFor="business-planning-phase"><span>Engagement phase</span><select id="business-planning-phase" value={assignmentPhase} onChange={event => setAssignmentPhase(event.target.value)}>{['COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="business-field" htmlFor="business-planning-start"><span>Start date</span><input id="business-planning-start" type="date" required value={assignmentStart} onChange={event => setAssignmentStart(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-end"><span>End date</span><input id="business-planning-end" type="date" required value={assignmentEnd} onChange={event => setAssignmentEnd(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-minutes"><span>Total planned minutes</span><input id="business-planning-minutes" type="number" min="1" max="1000000" step="1" required value={assignmentMinutes} onChange={event => setAssignmentMinutes(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-days"><span>Explicit daily schedule</span><textarea id="business-planning-days" rows={3} required value={dailySchedule} onChange={event => setDailySchedule(event.target.value)} /><small>One line per day: YYYY-MM-DD, minutes</small></label>
        </div>
        <button className="btn sm primary" type="submit" disabled={busy || !selectedStaff}>{busy ? 'Saving…' : 'Check capacity and assign'}</button>
      </form>

      {isPartner && <div className="business-form-grid">
        <form className="business-form business-commercial-form" onSubmit={recordLeave}>
          <h3>Approve leave against recorded capacity</h3>
          <label className="business-field" htmlFor="business-planning-leave"><span>Leave minutes</span><input id="business-planning-leave" type="number" min="1" max="1440" required value={leaveMinutes} onChange={event => setLeaveMinutes(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-leave-reason"><span>Approval reason</span><input id="business-planning-leave-reason" minLength={10} maxLength={2000} required value={leaveReason} onChange={event => setLeaveReason(event.target.value)} /></label>
          <button className="btn sm" type="submit" disabled={busy || !selectedStaff}>Approve leave</button>
        </form>
        <form className="business-form business-commercial-form" onSubmit={approveException}>
          <h3>Approve an actual over-capacity exception</h3>
          <label className="business-field" htmlFor="business-planning-excess"><span>Excess minutes</span><input id="business-planning-excess" type="number" min="1" max="1440" required value={exceptionMinutes} onChange={event => setExceptionMinutes(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-excess-reason"><span>Approval reason</span><input id="business-planning-excess-reason" minLength={10} maxLength={2000} required value={exceptionReason} onChange={event => setExceptionReason(event.target.value)} /></label>
          <button className="btn sm" type="submit" disabled={busy || !selectedStaff}>Approve capacity exception</button>
        </form>
      </div>}

      <form className="business-form business-commercial-form" onSubmit={saveMilestone}>
        <h3>Record a sourced milestone</h3>
        <div className="business-form-grid"><label className="business-field" htmlFor="business-planning-milestone-code"><span>Milestone</span><select id="business-planning-milestone-code" value={milestoneCode} onChange={event => setMilestoneCode(event.target.value as MilestoneCode)}>
          <option value="FIELDWORK_START">Fieldwork start</option><option value="DRAFT_REPORT">Draft report</option><option value="FINAL_REPORT">Final report</option>{isPartner && <option value="STATUTORY_CUTOFF">Firm-supplied statutory cutoff</option>}
        </select></label>
          <label className="business-field" htmlFor="business-planning-milestone-date"><span>Target date</span><input id="business-planning-milestone-date" type="date" required value={milestoneDate} onChange={event => setMilestoneDate(event.target.value)} /></label>
          <label className="business-field" htmlFor="business-planning-milestone-source"><span>Source reference</span><input id="business-planning-milestone-source" maxLength={1000} required value={milestoneSource} onChange={event => setMilestoneSource(event.target.value)} placeholder="Firm-approved engagement timetable" /></label>
        </div>
        <p className="business-note">Draft and final report dates require a recorded cutoff and cannot exceed it. The system does not invent statutory dates.</p>
        <button className="btn sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save sourced milestone'}</button>
      </form>

      <section className="business-form business-commercial-form" aria-labelledby="business-planning-suggestions-heading">
        <div className="business-section-heading"><div><h3 id="business-planning-suggestions-heading">Suggested milestone schedule</h3>
          <p className="business-note">Suggestions use period end {engagement.periodEnd}, a Sunday work-week start, and 46 / 74 calendar-day report offsets. Statutory cutoffs are never inferred.</p></div>
          <button className="btn sm" type="button" disabled={busy} onClick={prefillSuggestedSchedule}>Suggest dates</button></div>
        {suggestedSchedule && <form onSubmit={saveSuggestedSchedule}>
          <p className="business-note" role="status">Review and edit the suggested dates. Nothing is saved until you submit this schedule. Draft and final dates require a firm-supplied statutory cutoff.</p>
          <div className="business-form-grid">
            <label className="business-field" htmlFor="business-planning-suggested-fieldwork"><span>Fieldwork start</span><input id="business-planning-suggested-fieldwork" type="date" required value={suggestedSchedule.FIELDWORK_START} onChange={event => setSuggestedSchedule(current => current ? { ...current, FIELDWORK_START: event.target.value } : current)} /></label>
            <label className="business-field" htmlFor="business-planning-suggested-draft"><span>Draft report</span><input id="business-planning-suggested-draft" type="date" required value={suggestedSchedule.DRAFT_REPORT} onChange={event => setSuggestedSchedule(current => current ? { ...current, DRAFT_REPORT: event.target.value } : current)} /></label>
            <label className="business-field" htmlFor="business-planning-suggested-final"><span>Final report</span><input id="business-planning-suggested-final" type="date" required value={suggestedSchedule.FINAL_REPORT} onChange={event => setSuggestedSchedule(current => current ? { ...current, FINAL_REPORT: event.target.value } : current)} /></label>
          </div>
          <button className="btn sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save suggested schedule'}</button>
        </form>}
      </section>

      <div className="business-form-grid">
        <div><h3>Assigned staff</h3>{data.assignments.length ? <ul className="business-record-list">{data.assignments.map(item => <li key={item.id}><strong>{item.displayName} · {item.persona} · {item.phase}</strong><span>{item.startDate} to {item.endDate} · {item.plannedMinutes} minutes</span><small>{item.dailyMinutes.map(day => `${day.date}: ${day.minutes} min`).join(' · ')}</small></li>)}</ul> : <p className="business-muted">No staff assignments are recorded.</p>}</div>
        <div><h3>Milestones</h3>{data.milestones.length ? <ul className="business-record-list">{data.milestones.map(item => <li key={item.id}><strong>{item.code.replaceAll('_', ' ')} · {item.targetDate}</strong><small>{item.sourceReference}{item.approvedByActorId ? ' · Partner approved' : ''}</small></li>)}</ul> : <p className="business-muted">No sourced milestones are recorded.</p>}</div>
      </div>
    </>}
  </section>;
}
