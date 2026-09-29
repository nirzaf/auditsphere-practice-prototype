import { exportToCSV } from '../../services/exportService';
import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { firmTrialBalance, practiceEconomics } from '../../services/targetLifecycle';
import { visibleEngagementIds } from '../../services/guards';
import {
  ActionButton,
  Field,
  TargetForm,
  value,
  amount,
  type TargetViewProps
} from './TargetCommon';
export function PracticeView(props: TargetViewProps & { ledger?: boolean }) {
  const s = prototypeStore.getSnapshot(),
    visible = visibleEngagementIds(s),
    engagements = s.engagements.filter((e) => visible === 'ALL' || visible.includes(e.id));
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>{props.ledger ? 'Firm expenses & ledger' : 'Practice analytics'}</h2>
        <p className="caption">
          Synthetic practice information. Unknown staff rates remain unknown; approved time forms
          actual hours. Firm expenses are separate from client audit trial balances.
        </p>
        {!props.ledger && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Budget hours</th>
                  <th>Actual hours</th>
                  <th>Budget value</th>
                  <th>WIP value</th>
                  <th>Actual cost</th>
                  <th>Profitability</th>
                  <th>Realization</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => {
                  const m = practiceEconomics(s, e);
                  return (
                    <tr key={e.id}>
                      <td>
                        {e.id} · {e.period}
                      </td>
                      <td>{m.budgetHours}</td>
                      <td>{m.actualHours}</td>
                      <td>{m.budgetValue ?? 'Unknown'}</td>
                      <td>{m.wip ?? 'Unknown'}</td>
                      <td>{m.actualCost ?? 'Unknown'}</td>
                      <td>{m.profit ?? 'Unknown'}</td>
                      <td>{m.realization ?? 'Unknown'}</td>
                      <td>{m.utilization ?? 'Unknown'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {props.ledger && (
        <>
          <TargetForm
            title="Post a balanced firm expense"
            button="Post firm expense"
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(d) =>
              prototypeStore.lifecycle.postFirmExpense({
                date: value(d, 'date'),
                category: value(d, 'category') as 'Office rent',
                amount: amount(d, 'amount'),
                description: value(d, 'description'),
                reference: value(d, 'reference')
              })
            }
          >
            <Field label="Date" name="date" type="date" defaultValue={s.asOfDate} />
            <Field label="Expense account" name="category">
              {['Office rent', 'Staff salaries', 'Petty cash', 'Other expenses'].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Field>
            <Field label="Amount" name="amount" type="number" step="0.01" min={0.01} />
            <p>Firm ledger currency: {s.firmSettings.currency}</p>
            <Field label="Description" name="description" />
            <Field label="Unique reference" name="reference" />
          </TargetForm>
          <section className="panel panel-pad">
            <h3>Firm trial balance</h3>
            <ActionButton
              action={() =>
                exportToCSV('AuditSphere_Firm_Trial_Balance.csv', [
                  ['Account', 'Currency', 'Debit', 'Credit', 'Balance'],
                  ...firmTrialBalance(s).map((r) => [
                    r.account,
                    s.firmSettings.currency,
                    String(r.debit),
                    String(r.credit),
                    String(r.balance)
                  ])
                ])
              }
            >
              Export firm TB CSV
            </ActionButton>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {firmTrialBalance(s).map((r) => (
                  <tr key={r.account}>
                    <td>{r.account}</td>
                    <td>{r.debit}</td>
                    <td>{r.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <details className="panel panel-pad" open>
            <summary>Posting history</summary>
            {s.firmLedger?.map((e) => (
              <p key={e.id}>
                {e.date} · {e.reference} · {e.description} · {e.actorUserId} ·{' '}
                {e.lines.map((l) => `${l.account}: Dr ${l.debit} Cr ${l.credit}`).join(' / ')}
              </p>
            ))}
          </details>
        </>
      )}
      <button
        className="btn"
        onClick={() => props.onNavigate(props.ledger ? 'reports' : 'practice-ledger')}
      >
        {props.ledger ? 'Review practice analytics' : 'Review firm ledger'}
      </button>
    </div>
  );
}
