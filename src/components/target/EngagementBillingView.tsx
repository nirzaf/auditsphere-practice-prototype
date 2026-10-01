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
  const state = prototypeStore.getReadSnapshot(),
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
        <h3>Final balance fee note (remaining 50%)</h3>
        <p>
          The final 50% balance fee note is compiled automatically <strong>with</strong> the
          5-part final deliverables bundle (status <em>Draft</em>) and becomes{' '}
          <strong>Issued</strong> when the Partner records final delivery/release. There is no
          second normal billing step.
        </p>
        <p>
          {set?.deliveredAt
            ? 'The final audit set has a current recorded delivery/sign-off; the linked balance fee note is issued.'
            : 'Record final report delivery/sign-off in Opinion & Deliverables to issue the balance fee note.'}
        </p>
        <ActionButton
          disabled={!canBill || !set?.deliveredAt || !!lifecycle.balanceInvoices.length}
          action={() => prototypeStore.lifecycle.generateBalanceInvoice(engagement.id)}
        >
          Recover missing balance invoice record (history/recovery path only)
        </ActionButton>
        <button className="btn sm" onClick={() => onNavigate('delivery')}>
          Opinion &amp; deliverables
        </button>
        {[...new Map(lifecycle.balanceInvoices.map(record=>[record.invoiceId,record])).values()].map((record) => {
          const invoice = state.invoices.find((i) => i.id === record.invoiceId);
          return (
            <div className="target-record" key={record.invoiceId}>
              <span>
                {invoice?.invoiceNumber} · accepted fee {record.acceptedFee} − recognized advance{' '}
                {record.recognizedAdvance} · status {invoice?.status}
              </span>
              <ArtifactLink artifact={record.artifact} />
              {lifecycle.balanceInvoices.filter(history=>history.invoiceId===record.invoiceId && history.deliverableId!==record.deliverableId).map(history=><p key={history.deliverableId} className="caption">Historical bundle {history.deliverableId} · same invoice obligation <ArtifactLink artifact={history.artifact} /></p>)}
              <p>Paid {formatCurrency(invoice?.paid || 0,engagement.currency)} · outstanding {formatCurrency(Math.max(0,(invoice?.amount || 0)-(invoice?.paid || 0)),engagement.currency)}</p>
              <TargetForm title="Record final-fee settlement (offline simulation)" formId="final-fee-payment" button="Record and allocate final-fee payment" disabled={!hasAnyRole(state,['billing','manager','partner']) || invoice?.status !== 'Issued'} onRegisterUnsavedForm={onRegisterUnsavedForm} onCommit={data => {
                const reference=value(data,'reference').trim(), paid=amount(data,'amount');
                if (!reference || !Number.isFinite(paid) || paid <= 0 || paid > (invoice!.amount-invoice!.paid)) throw Error('Record a unique payment reference and a positive amount within the outstanding final fee.');
                const existing=prototypeStore.getSnapshot().receipts.find(r=>r.clientId===engagement.client && r.externalRef===reference);
                if (existing && (existing.amount !== paid || existing.allocations.some(a=>!a.reversed))) throw Error('That reference already has a payment/allocation. Use its history rather than record it twice.');
                const id=existing?.id || `FINAL-PAY-${crypto.randomUUID()}`;
                if (!existing) prototypeStore.addReceipt({id,clientId:engagement.client,receiptNumber:id,amount:paid,currency:engagement.currency,date:value(data,'date'),method:'Bank transfer',externalRef:reference,reference,notes:'Offline synthetic final-fee payment; no funds collected.',allocatedAmount:0,allocations:[]});
                prototypeStore.allocateReceipt(id,record.invoiceId,paid);
              }}>
                <Field label="Final-fee amount" name="amount" type="number" min={0.01} step="0.01" defaultValue={Math.max(0,(invoice?.amount||0)-(invoice?.paid||0))} />
                <Field label="Final-fee payment date" name="date" type="date" defaultValue={state.asOfDate} />
                <Field label="Final-fee payment reference" name="reference" />
                <p className="caption">Partial payments are supported. If allocation fails after saving, retry with the same reference and amount to reuse that receipt.</p>
              </TargetForm>
              {state.receipts.flatMap(receipt=>receipt.allocations.map((allocation,index)=>({receipt,allocation,index}))).filter(x=>x.allocation.invoiceId===record.invoiceId).map(({receipt,allocation,index})=><div key={`${receipt.id}-${index}`}>
                <p>{receipt.externalRef}: {allocation.amount} {receipt.currency} · {allocation.reversed ? `Reversed: ${allocation.reversalReason}` : 'Allocated'}</p>
                {!allocation.reversed && <TargetForm title={`Reverse final-fee allocation ${receipt.externalRef}`} formId="final-fee-reversal" button="Reverse final-fee allocation" disabled={!hasAnyRole(state,['billing','manager','partner'])} onRegisterUnsavedForm={onRegisterUnsavedForm} onCommit={data=>prototypeStore.reverseAllocation(receipt.id,index,value(data,'reason'))}><Field label="Final-fee reversal reason" name="reason" /></TargetForm>}
              </div>)}
            </div>
          );
        })}
      </section>
    </div>
  );
}
