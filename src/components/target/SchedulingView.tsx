import React, { useState } from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, visibleEngagementIds } from '../../services/guards';
import { isFrozen, practiceEconomics } from '../../services/targetLifecycle';
import type { StaffAllocation } from '../../types/targetLifecycle';
import { Field, TargetForm, value, amount, type TargetViewProps } from './TargetCommon';
import { TimeTrackingView } from '../modules/TimeTrackingView';

interface AllocationDraftRow {
  key: string;
  role: StaffAllocation['role'];
  userId: string;
  phase: StaffAllocation['phase'];
  plannedHours: number;
  chargeRate: number | null;
  costRate: number | null;
  startDate: string;
  endDate: string;
  capacityHours: number | undefined;
  leaveHours: number | undefined;
  leaveNote: string;
  targetUtilizationPct: number | undefined;
}

const ROLES: StaffAllocation['role'][] = ['Partner', 'Manager', 'Senior/Reviewer', 'Preparer/Staff'];
const ROLE_OPTIONS: Array<{ role: StaffAllocation['role']; roles: string[]; defaultId: string; hours: number; rate: number; cost: number }> = [
  { role: 'Partner', roles: ['partner'], defaultId: 'partner', hours: 4, rate: 1000, cost: 500 },
  { role: 'Manager', roles: ['manager'], defaultId: 'manager', hours: 12, rate: 750, cost: 375 },
  { role: 'Senior/Reviewer', roles: ['reviewer', 'manager'], defaultId: 'reviewer', hours: 16, rate: 500, cost: 250 },
  { role: 'Preparer/Staff', roles: ['preparer'], defaultId: 'preparer', hours: 40, rate: 200, cost: 100 }
];

/** R05: the staffing form edits an allocation list (multiple people, phases and date
 *  intervals). Three responsibility tiers and four charge-out grades stay distinct concepts:
 *  grades price time; they never force a fourth person into the team. */
function buildDraftRows(allocations: StaffAllocation[], fallbackDate: string): AllocationDraftRow[] {
  if (allocations.length)
    return allocations.map((a, index) => ({
      key: `row-${index}-${a.userId}-${a.phase}-${a.startDate}`,
      role: a.role,
      userId: a.userId,
      phase: a.phase,
      plannedHours: a.plannedHours,
      chargeRate: a.chargeRate,
      costRate: a.costRate,
      startDate: a.startDate,
      endDate: a.endDate,
      capacityHours: a.capacityHours,
      leaveHours: a.leaveHours,
      leaveNote: a.leaveNote || '',
      targetUtilizationPct: a.targetUtilizationPct
    }));
  return ROLE_OPTIONS.map((row) => ({
    key: `default-${row.defaultId}`,
    role: row.role,
    userId: row.defaultId,
    phase: 'Fieldwork' as const,
    plannedHours: row.hours,
    chargeRate: row.rate,
    costRate: row.cost,
    startDate: fallbackDate,
    endDate: fallbackDate,
    capacityHours: undefined,
    leaveHours: undefined,
    leaveNote: '',
    targetUtilizationPct: 80
  }));
}

export function SchedulingView(props: TargetViewProps) {
  const state = prototypeStore.getReadSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  const [draftEngagementId, setDraftEngagementId] = useState(eng?.id || '');
  const [draftRows, setDraftRows] = useState<AllocationDraftRow[]>(() =>
    buildDraftRows(eng?.auditLifecycle!.staffing.at(-1)?.allocations || [], state.asOfDate)
  );
  if (!eng) return null;
  if (eng.id !== draftEngagementId) {
    setDraftEngagementId(eng.id);
    setDraftRows(buildDraftRows(eng.auditLifecycle!.staffing.at(-1)?.allocations || [], state.asOfDate));
  }
  const allocations = eng.auditLifecycle!.staffing.at(-1)?.allocations || [],
    metrics = practiceEconomics(state, eng);
  const milestones = eng.auditLifecycle!.milestones?.at(-1);

  const addRow = () => {
    const option = ROLE_OPTIONS[ROLE_OPTIONS.length - 1];
    setDraftRows((rows) => [
      ...rows,
      {
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: option.role,
        userId: option.defaultId,
        phase: 'Fieldwork',
        plannedHours: option.hours,
        chargeRate: option.rate,
        costRate: option.cost,
        startDate: rows[0]?.startDate || state.asOfDate,
        endDate: rows[0]?.endDate || state.asOfDate,
        capacityHours: undefined,
        leaveHours: undefined,
        leaveNote: '',
        targetUtilizationPct: 80
      }
    ]);
  };
  const removeRow = (key: string) => setDraftRows((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));

  // R06: date-axis capacity calendar over the saved allocations, one row per person and one
  // column per week, showing overlapping engagement allocations and recorded leave.
  const calendar = (() => {
    if (!allocations.length) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const allowed = visibleEngagementIds(state);
    const peopleIds = new Set(allocations.map(a => a.userId));
    const scopedAllocations = state.engagements.filter(other => !isFrozen(other) && (allowed === 'ALL' || allowed.includes(other.id))).flatMap(other => (other.auditLifecycle?.staffing.at(-1)?.allocations || []).filter(a => peopleIds.has(a.userId)).map(a => ({ ...a, engagementId: other.id })));
    const start = Math.min(...scopedAllocations.map((a) => toUtc(a.startDate)));
    const end = Math.max(...scopedAllocations.map((a) => toUtc(a.endDate)));
    const firstWeekStart = start - ((new Date(start).getUTCDay() + 6) % 7) * dayMs; // Monday
    const weeks: Array<{ start: number; days: string[] }> = [];
    for (let weekStart = firstWeekStart; weekStart <= end; weekStart += 7 * dayMs)
      weeks.push({
        start: weekStart,
        days: Array.from({ length: 7 }, (_, d) => new Date(weekStart + d * dayMs).toISOString().slice(0, 10))
      });
    const people = [...new Map(allocations.map((a) => [a.userId, a])).values()].map((a) => ({
      userId: a.userId,
      name: state.users.find((u) => u.id === a.userId)?.name || a.userId,
      leaveIntervals: [...new Map(scopedAllocations.filter(x => x.userId === a.userId && x.leaveHours).map(x => [`${x.startDate}|${x.endDate}|${x.leaveHours}|${x.leaveNote}`, `${x.startDate}–${x.endDate}: ${x.leaveHours} h ${x.leaveNote || ''}`])).values()],
      weekly: weeks.map(({ days }) => {
        let hours = 0;
        let capacity = 0, leave = 0, capacityKnown = false;
        for (const allocation of scopedAllocations.filter((x) => x.userId === a.userId)) {
          const from = Math.max(toUtc(allocation.startDate), toUtc(days[0]));
          const to = Math.min(toUtc(allocation.endDate), toUtc(days[6]));
          if (to < from) continue;
          const spanDays = Math.floor((toUtc(allocation.endDate) - toUtc(allocation.startDate)) / dayMs) + 1;
          const overlapDays = Math.floor((to - from) / dayMs) + 1;
          hours += (allocation.plannedHours / spanDays) * overlapDays;
        }
        // Availability is person-level, not additive across repeated phase/engagement rows.
        // Prorating interval leave does not assert specific absence dates.
        for (const day of days) {
          const active = scopedAllocations.filter(x => x.userId === a.userId && x.startDate <= day && x.endDate >= day);
          const fraction = (x: StaffAllocation) => Math.floor((toUtc(x.endDate)-toUtc(x.startDate))/dayMs)+1;
          if (active.some(x => x.capacityHours !== undefined)) { capacityKnown = true; capacity += Math.max(0,...active.map(x => (x.capacityHours || 0)/fraction(x))); }
          leave += Math.max(0,...active.map(x => (x.leaveHours || 0)/fraction(x)));
        }
        return { hours: Math.round(hours*10)/10, capacity: capacityKnown ? Math.round(capacity*10)/10 : undefined, leave: Math.round(leave*10)/10 };
      })
    }));
    return { weeks: weeks.map((w) => new Date(w.start).toISOString().slice(0, 10)), people, engagements: [...new Set(scopedAllocations.map(a => a.engagementId))].join(', ') };
  })();

  return (
    <div className="target-stack">
      {/* Statutory Reporting Milestones */}
      <section className="panel panel-pad">
        <span className="tag blue mb8">MODULE 2: RESOURCE ALLOCATION &amp; STATUTORY SCHEDULING</span>
        <h2>Resource Allocation &amp; Operational Milestones</h2>
        <p className="caption">
          Tiered Charge-Out Rates Engine: Partner (1,000 QAR/h), Manager (750 QAR/h), Senior (500 QAR/h), Associate (200 QAR/h). Responsibility tiers (Partner oversight / Manager-review / Preparer execution) are distinct from these four charge-out grades.
        </p>

        <div className="grid4 mt12">
          {(['cutoff', 'fieldwork', 'draft', 'final'] as const).map((key, index) => <div className="panel panel-pad" key={key}>
            <span className="caption">{['Period cutoff', 'Fieldwork commencement', 'Draft report target', 'Final report target'][index]}</span>
            <strong>{milestones?.[key] || 'Not scheduled'}</strong>
          </div>)}
        </div>
        <TargetForm title="Engagement statutory milestones" formId="milestones" button="Save milestone revision" disabled={!hasAnyRole(state, ['manager', 'partner']) || isFrozen(eng, state.asOfDate)} onRegisterUnsavedForm={props.onRegisterUnsavedForm}
          onCommit={data => prototypeStore.lifecycle.saveMilestones(eng.id, { cutoff: value(data, 'cutoff'), fieldwork: value(data, 'fieldwork'), draft: value(data, 'draft'), final: value(data, 'final') }, value(data, 'reason'))}>
          {(['cutoff', 'fieldwork', 'draft', 'final'] as const).map(key => <Field key={key} label={key} name={key} type="date" defaultValue={milestones?.[key] || ''} />)}
          <Field label="Milestone revision reason" name="reason" />
        </TargetForm>
        {/* Visual Capacity Calendar & Team Availability Schedule */}
        <div className="mt20 borderbox p16" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div className="flex-between mb12">
            <div>
              <h3 style={{ margin: 0 }}>Visual Capacity &amp; Resource Availability Calendar</h3>
              <p className="caption">Recorded interval capacity less leave · saved target utilization</p>
            </div>
            <span className="tag green">RECORDED AVAILABILITY</span>
          </div>

          <div className="tablewrap">
            <table className="target-table">
              <thead>
                <tr>
                  <th>Assigned Professional</th>
                  <th>Practice Role</th>
                  <th className="text-right">Interval Capacity</th>
                  <th className="text-right">Allocated Hours</th>
                  <th className="text-right">Projected Utilization</th>
                  <th>Scheduled Leave / Out-of-Office</th>
                  <th>Capacity Status</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map(a => ({ name: state.users.find(u => u.id === a.userId)?.name || a.userId, role: a.role,
                  rate: a.chargeRate === null ? 'Unknown rate' : `${a.chargeRate} ${eng.currency}/h`,
                  capacity: a.capacityHours, allocated: a.plannedHours, leave: a.leaveNote || `${a.leaveHours || 0} hours`,
                  target: a.targetUtilizationPct, available: a.capacityHours === undefined ? undefined : a.capacityHours - (a.leaveHours || 0)
                })).map((member) => {
                  const util = member.available && member.available > 0 ? Math.round((member.allocated / member.available) * 100) : null;
                  const target = member.target ?? 80;
                  const isOptimal = util !== null && util >= target && util <= target + 5;
                  const isHigh = util !== null && util > target + 5;
                  return (
                    <tr key={`${member.name}-${member.role}`} className="hover-row">
                      <td><strong>{member.name}</strong></td>
                      <td>
                        <span>{member.role}</span>
                        <div className="caption text-muted">{member.rate}</div>
                      </td>
                      <td className="text-right mono">{member.capacity === undefined ? 'Unknown' : `${member.capacity} hrs`}</td>
                      <td className="text-right mono">{member.allocated} hrs</td>
                      <td className="text-right mono font-medium" style={{ color: isOptimal ? '#15803d' : isHigh ? '#7c3aed' : '#b45309' }}>
                        {util === null ? 'Unknown' : `${util}%`}
                      </td>
                      <td>
                        <span className="caption" style={{ color: member.leave === 'None scheduled' ? '#64748b' : '#0284c7' }}>
                          {member.leave}
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${isOptimal ? 'green' : isHigh ? 'purple' : 'amber'}`}>
                          {util === null ? 'Unknown' : isOptimal ? `Optimal (${target}–${target + 5}%)` : isHigh ? 'High Demand' : 'Available Capacity'}
                        </span>
                        <small style={{display:'block'}}>Saved target {target}–{target + 5}%</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {calendar ? (
            <div className="mt16">
              <h4 style={{ margin: '0 0 6px 0' }}>Week-axis allocation calendar (saved allocations)</h4>
              <p className="caption mb8">Allocated hours across authorized engagements {calendar.engagements}, spread across each interval's days; editing and saving an allocation re-shapes affected weeks. Leave is recorded for the allocation interval, not inferred as exact absence dates.</p>
              <div className="tablewrap">
                <table className="target-table">
                  <thead>
                    <tr>
                      <th>Professional</th>
                      {calendar.weeks.map((week) => (
                        <th key={week} className="text-right">wk {week.slice(5)}</th>
                      ))}
                      <th>Leave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendar.people.map((person) => (
                      <tr key={person.userId} className="hover-row">
                        <td><strong>{person.name}</strong></td>
                        {person.weekly.map(({hours,capacity,leave}, index) => {
                          const over = capacity !== undefined && hours > capacity - leave;
                          return (
                            <td
                              key={index}
                              className="text-right mono"
                              style={{ background: hours === 0 ? undefined : over ? '#fee2e2' : '#dcfce7' }}
                              title={`Week commencing ${calendar.weeks[index]}: ${hours} planned, ${capacity ?? 'unrecorded'} capacity, ${leave} prorated interval leave hours`}
                            >
                              {hours === 0 ? '·' : hours}
                              <small style={{display:'block'}}>cap {capacity ?? '—'} · leave {leave}</small>
                            </td>
                          );
                        })}
                        <td>
                          <span className="caption" style={{ color: person.leaveIntervals.length ? '#0284c7' : '#64748b' }}>
                            {person.leaveIntervals.join('; ') || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="caption mt16">Save an allocation to populate the week-axis capacity calendar.</p>
          )}

          <div className="grid4 mt16">{allocations.map((a,i) => <div className="borderbox p12" key={i}><strong>{a.phase}</strong><p>{a.startDate} → {a.endDate}</p><p>{a.plannedHours} hours · {state.users.find(u => u.id === a.userId)?.name}</p></div>)}</div>
        </div>
      </section>
      <TargetForm
        title="Engagement staffing, hours & rates"
        button="Save scheduling revision"
        formId="staffing"
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        disabled={!hasAnyRole(state, ['manager', 'partner']) || isFrozen(eng)}
        onCommit={(data) =>
          prototypeStore.lifecycle.saveStaffing(
            eng.id,
            draftRows.map((row) => ({
              userId: value(data, `user-${row.key}`),
              role: value(data, `role-${row.key}`) as StaffAllocation['role'],
              capacityHours: value(data, `capacity-${row.key}`) === '' ? undefined : amount(data, `capacity-${row.key}`),
              leaveHours: value(data, `leave-${row.key}`) === '' ? undefined : amount(data, `leave-${row.key}`),
              leaveNote: value(data, `leaveNote-${row.key}`) || undefined,
              targetUtilizationPct: value(data, `target-${row.key}`) === '' ? undefined : amount(data, `target-${row.key}`),
              phase: value(data, `phase-${row.key}`) as StaffAllocation['phase'],
              plannedHours: amount(data, `hours-${row.key}`),
              chargeRate: value(data, `charge-${row.key}`) === '' ? null : amount(data, `charge-${row.key}`),
              costRate: value(data, `cost-${row.key}`) === '' ? null : amount(data, `cost-${row.key}`),
              startDate: value(data, `start-${row.key}`),
              endDate: value(data, `end-${row.key}`)
            })),
            value(data, 'reason')
          )
        }
      >
        <p className="caption">
          Add one row per person, phase and date interval (e.g. two associates with separate
          Fieldwork allocations, or a Manager holding Planning and Review hours). Capacity, leave
          and target utilization must stay consistent per person across their rows.
        </p>
        {draftRows.map((row) => {
          const option = ROLE_OPTIONS.find((r) => r.role === row.role) || ROLE_OPTIONS[ROLE_OPTIONS.length - 1];
          const updateRow = (patch: Partial<AllocationDraftRow>) =>
            setDraftRows((rows) => rows.map((existing) => (existing.key === row.key ? { ...existing, ...patch } : existing)));
          const eligibleUsers = state.users
            .filter((u) => u.status === 'Active' && option.roles.includes(u.role))
            .filter((u) => {
              const visible = visibleEngagementIds(state, u.id);
              return visible === 'ALL' || visible.includes(eng.id);
            });
          return (
            <fieldset key={row.key} className="target-staff-row" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
              <legend className="caption">Allocation row · {row.role}</legend>
              <label className="target-field">
                <span>Responsibility tier</span>
                <select name={`role-${row.key}`} value={row.role} onChange={(e) => {
                  const nextRole = e.target.value as StaffAllocation['role'];
                  const nextOption = ROLE_OPTIONS.find((r) => r.role === nextRole) || option;
                  const stillEligible = eligibleUsers.some((u) => u.id === row.userId && nextOption.roles.includes(u.role));
                  updateRow({ role: nextRole, userId: stillEligible ? row.userId : nextOption.defaultId });
                }}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <Field label="Assigned professional" name={`user-${row.key}`} defaultValue={row.userId}>
                {eligibleUsers.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </Field>
              <Field label="Audit phase" name={`phase-${row.key}`} defaultValue={row.phase}>
                {['Planning', 'Fieldwork', 'Review', 'Reporting'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Field>
              <Field label="Planned hours" name={`hours-${row.key}`} type="number" min={0.25} step="0.25" defaultValue={row.plannedHours} />
              <Field label="Row start" name={`start-${row.key}`} type="date" defaultValue={row.startDate} />
              <Field label="Row end" name={`end-${row.key}`} type="date" defaultValue={row.endDate} />
              <Field label="Capacity hours for scheduled interval (per person)" name={`capacity-${row.key}`} type="number" min={1} required={false} defaultValue={row.capacityHours ?? ''} />
              <Field label="Leave hours in interval (per person)" name={`leave-${row.key}`} type="number" min={0} required={false} defaultValue={row.leaveHours ?? ''} />
              <Field label="Leave dates / note" name={`leaveNote-${row.key}`} required={false} defaultValue={row.leaveNote} />
              <Field label="Target utilization %" name={`target-${row.key}`} type="number" min={0} max={100} required={false} defaultValue={row.targetUtilizationPct ?? 80} />
              <Field label="Charge-out / hour (blank = unknown)" name={`charge-${row.key}`} type="number" min={0} step="0.01" required={false} defaultValue={row.chargeRate ?? option.rate} />
              <Field label="Cost / hour (blank = unknown)" name={`cost-${row.key}`} type="number" min={0} step="0.01" required={false} defaultValue={row.costRate ?? option.cost} />
              <div className="target-buttons mt8">
                <button type="button" className="btn xs danger" onClick={() => removeRow(row.key)} disabled={draftRows.length <= 1}>
                  Remove allocation
                </button>
              </div>
            </fieldset>
          );
        })}
        <div className="target-buttons">
          <button type="button" className="btn sm" onClick={addRow} disabled={!hasAnyRole(state, ['manager', 'partner']) || isFrozen(eng)}>
            Add allocation row
          </button>
        </div>
        <Field
          label="Revision reason"
          name="reason"
          defaultValue="Initial audit team and phase budget"
        />
        <p className="caption">
          All rates are synthetic {eng.currency} per hour. Assignment never grants review authority.
          Blank rates remain Unknown. At least one allocation per responsibility tier
          (Partner, Manager, Senior/Reviewer, Preparer/Staff) is required; extra rows for multiple
          associates or additional phases are expected.
        </p>
      </TargetForm>
      <div className="target-metrics">
        <div className="panel panel-pad">
          <small>Budget / approved actual hours</small>
          <strong>
            {metrics.budgetHours} / {metrics.actualHours}
          </strong>
        </div>
        <div className="panel panel-pad">
          <small>Budget charge-out value</small>
          <strong>
            {metrics.budgetValue ?? 'Unknown'} {eng.currency}
          </strong>
        </div>
        <div className="panel panel-pad">
          <small>Hours utilization against available capacity</small>
          <strong>
            {metrics.utilization === null ? 'Unknown' : `${metrics.utilization.toFixed(1)}%`}
          </strong>
        </div>
      </div>
      <details className="panel panel-pad">
        <summary>Scheduling history · {eng.auditLifecycle!.staffing.length} revisions</summary>
        {eng.auditLifecycle!.staffing.map((r) => (
          <p key={r.revision}>
            v{r.revision} · {r.at} · {r.reason} · {r.allocations.length} allocations
          </p>
        ))}
      </details>
      <TimeTrackingView
        engagementId={eng.id}
        onNavigate={props.onNavigate}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm || (() => {})}
      />
    </div>
  );
}
