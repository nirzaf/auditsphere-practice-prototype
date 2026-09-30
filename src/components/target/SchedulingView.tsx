import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, visibleEngagementIds } from '../../services/guards';
import { isFrozen, practiceEconomics } from '../../services/targetLifecycle';
import type { StaffAllocation } from '../../types/targetLifecycle';
import { Field, TargetForm, value, amount, type TargetViewProps } from './TargetCommon';
import { TimeTrackingView } from '../modules/TimeTrackingView';

export function SchedulingView(props: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const allocations = eng.auditLifecycle!.staffing.at(-1)?.allocations || [],
    metrics = practiceEconomics(state, eng);
  const milestones = eng.auditLifecycle!.milestones?.at(-1);
  const rows: Array<{
    role: StaffAllocation['role'];
    roles: string[];
    defaultId: string;
    hours: number;
    rate: number;
    cost: number;
  }> = [
    { role: 'Partner', roles: ['partner'], defaultId: 'partner', hours: 4, rate: 1000, cost: 500 },
    { role: 'Manager', roles: ['manager'], defaultId: 'manager', hours: 12, rate: 750, cost: 375 },
    {
      role: 'Senior/Reviewer',
      roles: ['reviewer', 'manager'],
      defaultId: 'reviewer',
      hours: 16,
      rate: 500,
      cost: 250
    },
    {
      role: 'Preparer/Staff',
      roles: ['preparer'],
      defaultId: 'preparer',
      hours: 40,
      rate: 200,
      cost: 100
    }
  ];
  return (
    <div className="target-stack">
      {/* Statutory Reporting Milestones */}
      <section className="panel panel-pad">
        <span className="tag blue mb8">MODULE 2: RESOURCE ALLOCATION &amp; STATUTORY SCHEDULING</span>
        <h2>Resource Allocation &amp; Operational Milestones</h2>
        <p className="caption">
          Tiered Charge-Out Rates Engine: Partner (1,000 QAR/h), Manager (750 QAR/h), Senior (500 QAR/h), Associate (200 QAR/h).
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
                  const isOptimal = util !== null && member.target !== undefined && util >= member.target && util <= member.target + 5;
                  const isHigh = util !== null && member.target !== undefined && util > member.target + 5;
                  return (
                    <tr key={member.name} className="hover-row">
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
                          {isOptimal ? 'Optimal (80–85%)' : isHigh ? 'High Demand' : 'Available Capacity'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
            rows.map((row, index) => ({
              userId: value(data, `user${index}`),
              role: row.role,
              capacityHours: amount(data, `capacity${index}`), leaveHours: amount(data, `leave${index}`), leaveNote: value(data, `leaveNote${index}`), targetUtilizationPct: amount(data, `target${index}`),
              phase: value(data, `phase${index}`) as StaffAllocation['phase'],
              plannedHours: amount(data, `hours${index}`),
              chargeRate:
                value(data, `charge${index}`) === '' ? null : amount(data, `charge${index}`),
              costRate: value(data, `cost${index}`) === '' ? null : amount(data, `cost${index}`),
              startDate: value(data, 'start'),
              endDate: value(data, 'end')
            })),
            value(data, 'reason')
          )
        }
      >
        {rows.map((row, index) => {
          const allocation = allocations.find((a) => a.role === row.role);
          return (
            <div className="target-staff-row" key={row.role}>
              <Field
                label={row.role}
                name={`user${index}`}
                defaultValue={allocation?.userId || row.defaultId}
              >
                {state.users
                  .filter((u) => u.status === 'Active' && row.roles.includes(u.role))
                  .filter((u) => {
                    const visible = visibleEngagementIds(state, u.id);
                    return visible === 'ALL' || visible.includes(eng.id);
                  })
                  .map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Field>
              <Field
                label="Audit phase"
                name={`phase${index}`}
                defaultValue={allocation?.phase || 'Fieldwork'}
              >
                {['Planning', 'Fieldwork', 'Review', 'Reporting'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Field>
              <Field label="Capacity hours for scheduled interval" name={`capacity${index}`} type="number" min={1} defaultValue={allocation?.capacityHours ?? ''} />
              <Field label="Leave hours in interval" name={`leave${index}`} type="number" min={0} defaultValue={allocation?.leaveHours ?? 0} />
              <Field label="Leave dates / note" name={`leaveNote${index}`} required={false} defaultValue={allocation?.leaveNote || ''} />
              <Field label="Target utilization %" name={`target${index}`} type="number" min={0} max={100} defaultValue={allocation?.targetUtilizationPct ?? 80} />
              <Field
                label="Planned hours"
                name={`hours${index}`}
                type="number"
                min={0.25}
                step="0.25"
                defaultValue={allocation?.plannedHours || row.hours}
              />
              <Field
                label="Charge-out / hour (blank = unknown)"
                name={`charge${index}`}
                type="number"
                min={0}
                step="0.01"
                required={false}
                defaultValue={allocation ? (allocation.chargeRate ?? '') : row.rate}
              />
              <Field
                label="Cost / hour (blank = unknown)"
                name={`cost${index}`}
                type="number"
                min={0}
                step="0.01"
                required={false}
                defaultValue={allocation ? (allocation.costRate ?? '') : row.cost}
              />
            </div>
          );
        })}
        <Field
          label="Schedule start"
          name="start"
          type="date"
          defaultValue={allocations[0]?.startDate || state.asOfDate}
        />
        <Field
          label="Schedule end"
          name="end"
          type="date"
          defaultValue={allocations[0]?.endDate || state.asOfDate}
        />
        <Field
          label="Revision reason"
          name="reason"
          defaultValue="Initial audit team and phase budget"
        />
        <p className="caption">
          All rates are synthetic {eng.currency} per hour. Assignment never grants review authority.
          Blank rates remain Unknown.
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
            v{r.revision} · {r.at} · {r.reason}
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
