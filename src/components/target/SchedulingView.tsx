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

        <div className="row mt12" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="panel panel-pad" style={{ flex: '1 1 180px', background: '#f8fafc' }}>
            <span className="caption">1. Period Cutoff</span>
            <strong>December 31, {eng.year}</strong>
            <div className="caption text-muted">Statutory year-end cutoff</div>
          </div>
          <div className="panel panel-pad" style={{ flex: '1 1 180px', background: '#f8fafc' }}>
            <span className="caption">2. Fieldwork Commencement</span>
            <strong>January Week 1, {eng.year + 1}</strong>
            <div className="caption text-muted">Onsite testing begins</div>
          </div>
          <div className="panel panel-pad" style={{ flex: '1 1 180px', background: '#f8fafc' }}>
            <span className="caption">3. Draft Report Target</span>
            <strong>February 15, {eng.year + 1}</strong>
            <div className="caption text-muted">SRM &amp; manager review</div>
          </div>
          <div className="panel panel-pad" style={{ flex: '1 1 180px', background: '#f8fafc' }}>
            <span className="caption">4. Final Signed Report</span>
            <strong>March 15, {eng.year + 1}</strong>
            <div className="caption text-muted">Partner opinion &amp; bundle</div>
          </div>
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
          <small>Hours utilization against budget</small>
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
