import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { billingSummary, currentDeliverables, isFrozen } from '../../services/targetLifecycle';
import { formatCurrency } from '../../services/calculations';
import { hasAnyRole } from '../../services/guards';
import {
  ActionButton,
  ArtifactLink,
  Field,
  TargetForm,
  value,
  amount,
  type TargetViewProps
} from './TargetCommon';

export function EngagementBillingView({ onNavigate, onRegisterUnsavedForm }: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    engagement = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!engagement) return null;
  const summary = billingSummary(state, engagement),
    lifecycle = engagement.auditLifecycle!,
    canBill = hasAnyRole(state, ['billing']) && !isFrozen(engagement),
    proposals = state.proposals.filter(
      (p) => p.clientId === engagement.client && p.state === 'Accepted'
    ),
    set = currentDeliverables(state, engagement);
  return (
    <div className="target-stack">
      <div className="target-metrics">
        <div className="panel panel-pad">
          <small>Accepted fee</small>
          <strong>
            {summary.fee === null ? 'Not pinned' : formatCurrency(summary.fee, engagement.currency)}
          </strong>
        </div>
        <div className="panel panel-pad">
          <small>Required advance · 50%</small>
          <strong>
            {summary.expectedAdvance === null
              ? 'Unknown'
              : formatCurrency(summary.expectedAdvance, engagement.currency)}
          </strong>
        </div>
        <div className="panel panel-pad">
          <small>Manually recorded advance</small>
          <strong>{formatCurrency(summary.advance, engagement.currency)}</strong>
          <span>
            {summary.complete ? 'Advance / receipt gate complete' : 'Incomplete or receipt stale'}
          </span>
        </div>
        <div className="panel panel-pad">
          <small>Remaining balance</small>
          <strong>
            {summary.balance === null
              ? 'Unknown'
              : formatCurrency(summary.balance, engagement.currency)}
          </strong>
        </div>
      </div>
      <TargetForm
        title="Pin accepted Proposal / Engagement Letter"
        formId="pin-proposal"
        button="Pin accepted revision"
        disabled={!hasAnyRole(state, ['billing', 'manager', 'partner']) || isFrozen(engagement)}
        onRegisterUnsavedForm={onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.pinAcceptedProposal(engagement.id, value(data, 'proposal'))
        }
      >
        <Field
          label="Accepted proposal revision"
          name="proposal"
          defaultValue={engagement.proposalId || proposals[0]?.id || ''}
        >
          <option value="">Choose accepted revision</option>
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · v{p.revision} · {formatCurrency(p.totalAmount, p.currency)}
            </option>
          ))}
        </Field>
      </TargetForm>
      <TargetForm
        title="Record advance manually"
        formId="advance"
        button="Record payment"
        disabled={!canBill || summary.fee === null}
        onRegisterUnsavedForm={onRegisterUnsavedForm}
        onCommit={async (data) => {
          prototypeStore.lifecycle.recordAdvance(engagement.id, {
            amount: amount(data, 'amount'),
            date: value(data, 'date'),
            reference: value(data, 'reference'),
            method: value(data, 'method') as 'Bank transfer'
          });
          try { await prototypeStore.lifecycle.generateOfficialReceipt(engagement.id); }
          catch (error) { throw new Error(`Payment recorded once; receipt/onboarding pending. Use Generate official receipt to retry. ${error instanceof Error ? error.message : ''}`); }
        }}
      >
        <Field
          label="Recorded amount"
          name="amount"
          type="number"
          min={0.01}
          step="0.01"
          defaultValue={summary.expectedAdvance ?? ''}
        />
        <Field label="Payment date" name="date" type="date" defaultValue={state.asOfDate} />
        <Field label="Payment reference" name="reference" />
        <Field label="Method" name="method" defaultValue="Bank transfer">
          {['Bank transfer', 'Cash', 'Cheque', 'Other'].map((method) => (
            <option key={method}>{method}</option>
          ))}
        </Field>
        <p className="target-simulation">
          Manual synthetic payment record. No funds are collected or transferred.
        </p>
      </TargetForm>
      <section className="panel panel-pad">
        <h3>Official receipt & payment history</h3>
        {summary.advance > 0 && !summary.receipt && <p role="status">Payment recorded; receipt pending. Retry receipt generation without recording the payment again.</p>}
        {lifecycle.onboarding && <p>Invitation issued (simulated) to {lifecycle.onboarding.recipient}; first-login reset required.</p>}
        <ActionButton
          disabled={!canBill || summary.advance <= 0}
          action={() => prototypeStore.lifecycle.generateOfficialReceipt(engagement.id)}
        >
          Generate official receipt
        </ActionButton>
        {lifecycle.receiptDocuments.map((r) => (
          <div className="target-record" key={r.artifact.id}>
            <span>
              {r.basis === summary.receipt?.basis
                ? 'Current receipt'
                : 'Historical / stale receipt'}{' '}
              · {r.generatedAt}
            </span>
            <ArtifactLink artifact={r.artifact} />
          </div>
        ))}
        {lifecycle.advancePayments.map((payment) => {
          const receipt = state.receipts.find((r) => r.id === payment.receiptId);
          return (
            <div className="target-record" key={payment.receiptId}>
              <span>
                {receipt?.receiptNumber} · {receipt?.amount} {receipt?.currency} · {receipt?.date} ·{' '}
                {receipt?.externalRef} · {payment.reversed ? 'Reversed' : 'Recorded'}
              </span>
              {!payment.reversed && canBill && (
                <TargetForm
                  title={`Reverse ${payment.receiptId}`}
                  button="Record reversal"
                  onRegisterUnsavedForm={onRegisterUnsavedForm}
                  onCommit={(data) =>
                    prototypeStore.lifecycle.reverseAdvance(
                      engagement.id,
                      payment.receiptId,
                      value(data, 'reason')
                    )
                  }
                >
                  <Field label="Reversal reason" name="reason" />
                </TargetForm>
              )}
            </div>
          );
        })}
      </section>
      <section className="panel panel-pad">
        <h3>Final balance invoice</h3>
        <p>
          {set?.deliveredAt
            ? 'The final audit set has a current recorded delivery/sign-off.'
            : 'Generate and record final report delivery/sign-off before issuing the remaining balance.'}
        </p>
        <ActionButton
          disabled={!canBill || !set?.deliveredAt || !!lifecycle.balanceInvoices.length}
          action={() => prototypeStore.lifecycle.generateBalanceInvoice(engagement.id)}
        >
          Generate final balance invoice
        </ActionButton>
        <button className="btn sm" onClick={() => onNavigate('delivery')}>
          Opinion & deliverables
        </button>
        {lifecycle.balanceInvoices.map((record) => (
          <div className="target-record" key={record.invoiceId}>
            <span>
              {state.invoices.find((i) => i.id === record.invoiceId)?.invoiceNumber} · accepted fee{' '}
              {record.acceptedFee} − recognized advance {record.recognizedAdvance}
            </span>
            <ArtifactLink artifact={record.artifact} />
          </div>
        ))}
      </section>
    </div>
  );
}
