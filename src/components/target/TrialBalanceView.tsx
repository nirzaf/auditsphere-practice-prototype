import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { TBImportWizard } from '../modules/TBImportWizard';
import { Field, TargetForm, value, type TargetViewProps } from './TargetCommon';
import { hasAnyRole } from '../../services/guards';
import { isFrozen } from '../../services/targetLifecycle';

export function TrialBalanceView(props: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  return (
    <div className="target-stack">
      <div className="panel panel-pad">
        <h2>Trial balance source ingestion</h2>
        <p>
          Upload CSV or a genuine Excel workbook for {eng.period}. This imports a source snapshot;
          it does not post to a client ledger.
        </p>
        <TBImportWizard
          engagementId={eng.id}
          onCommitted={() => {}}
          onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        />
      </div>
      {eng.rows.length > 0 && (
        <TargetForm
          title="Confirm FSLI mappings"
          formId="mapping"
          button="Confirm current mapping"
          disabled={
            !hasAnyRole(state, ['preparer', 'manager', 'reviewer', 'partner']) || isFrozen(eng)
          }
          onRegisterUnsavedForm={props.onRegisterUnsavedForm}
          onCommit={(data) =>
            prototypeStore.lifecycle.confirmMapping(
              eng.id,
              eng.rows.map((r, index) => ({ code: r.code, line: value(data, `line${index}`) }))
            )
          }
        >
          {eng.rows.map((r, index) => (
            <div className="target-mapping-row" key={r.code}>
              <span>
                {r.code} · {r.name} · {r.balance.toLocaleString()}
              </span>
              <Field
                label="Financial statement line"
                name={`line${index}`}
                defaultValue={
                  r.mappedStatementLine ||
                  {
                    asset: 'Assets',
                    liability: 'Liabilities',
                    equity: 'Equity',
                    revenue: 'Revenue',
                    expense: 'Operating expenses'
                  }[r.type]
                }
              />
            </div>
          ))}
        </TargetForm>
      )}
      <button className="btn" onClick={() => props.onNavigate('financial-statements')}>
        Open P&L / balance sheet drill-down
      </button>
    </div>
  );
}
