import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, isClientRole } from '../../services/guards';
import { isFrozen } from '../../services/targetLifecycle';
import { ActionButton, Field, TargetForm, amount, value, type TargetViewProps } from './TargetCommon';

export function AdjustmentPanel(props: Pick<TargetViewProps, 'onRegisterUnsavedForm'>) {
  const state = prototypeStore.getSnapshot(), eng = state.engagements.find(e => e.id === state.selectedEngagement);
  if (!eng) return null;
  const client = isClientRole(state.currentRole), frozen = isFrozen(eng);
  const journals = state.adjustmentJournals.filter(j => j.engagementId === eng.id && (!client || j.status !== 'Draft'));
  return <section className="panel panel-pad" data-testid="adjustment-panel">
    <h3>Adjusting journals · {eng.currency}</h3>
    {!client && <TargetForm title="Propose balanced AJE" button="Save balanced journal" disabled={frozen || !hasAnyRole(state, ['preparer', 'reviewer', 'manager', 'partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => {
      const debit = eng.rows.find(r => r.code === value(d, 'debit'))!, credit = eng.rows.find(r => r.code === value(d, 'credit'))!;
      if (!debit || !credit || debit.code === credit.code) throw new Error('Choose two distinct current TB accounts.');
      const finding = state.findings.find(f => f.engagementId === eng.id && f.id === value(d,'finding'));
      prototypeStore.addAdjustmentJournal({ id: `AJE-${crypto.randomUUID()}`, engagementId: eng.id, title: value(d, 'title'), preparedBy: state.currentPerson, status: 'Draft', reflectionStatus: 'Not reflected', reflectedInClientBooks: false, rationale: value(d, 'rationale'), supportLinks: finding ? { finding: {id:finding.id,revision:finding.revision || 1} } : undefined, lines: [{ accountCode: debit.code, accountName: debit.name, type: 'debit', amount: amount(d, 'amount') }, { accountCode: credit.code, accountName: credit.name, type: 'credit', amount: amount(d, 'amount') }] });
    }}>
      <Field label="Journal title" name="title" />
      <Field label="Debit account" name="debit">{eng.rows.map(r => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}</Field>
      <Field label="Credit account" name="credit">{eng.rows.map(r => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}</Field>
      <Field label="Balanced amount" name="amount" type="number" min={0.01} step="0.01" />
      <Field label="Source and adjustment rationale" name="rationale" type="textarea" />
      <Field label="Related finding (optional)" name="finding" required={false}><option value="">No linked finding</option>{state.findings.filter(f => f.engagementId === eng.id).map(f => <option key={f.id} value={f.id}>{f.id} · {f.title}</option>)}</Field>
    </TargetForm>}
    {journals.map(j => <div className="target-record" key={j.id}>
      <h4>{j.title} · v{j.revision || 1} · {j.status}</h4>
      <p>{j.lines.map(l => `${l.type} ${l.accountCode}: ${l.amount}`).join(' / ')} · {j.rationale}</p>
      {j.status === 'Rejected' && !client && <TargetForm title={`Amend returned journal ${j.id}`} button="Save new journal revision" disabled={frozen || !hasAnyRole(state,['preparer','manager','partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => prototypeStore.amendAdjustmentJournal(j.id, {title:value(d,'title'),lines:j.lines,rationale:value(d,'rationale')},value(d,'reason'))}>
        <Field label="Amended title" name="title" defaultValue={j.title} /><Field label="Amended source and rationale" name="rationale" type="textarea" defaultValue={j.rationale} /><Field label="Reason for rework" name="reason" type="textarea" />
      </TargetForm>}
      {j.status === 'Draft' && !client && <TargetForm title={`Independent review ${j.id}`} button="Record technical review" disabled={frozen || !hasAnyRole(state, ['reviewer', 'manager', 'partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => prototypeStore.reviewAdjustmentJournal(j.id, value(d,'decision') === 'approve', value(d,'note'))}>
        <Field label="Decision" name="decision"><option value="approve">Approve</option><option value="return">Return for rework</option></Field><Field label="Review rationale" name="note" type="textarea" />
      </TargetForm>}
      {j.status === 'Technical review' && !client && <TargetForm title={`Management response ${j.id}`} button="Record evidenced management response" disabled={frozen || !hasAnyRole(state,['reviewer','manager','partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => prototypeStore.recordAdjustmentManagementResponse(j.id, value(d,'decision') === 'accept', value(d,'note'), value(d,'reference'), value(d,'respondent'))}>
        <Field label="Management response" name="decision"><option value="accept">Accepted correction</option><option value="reject">Declined correction</option></Field><Field label="Management respondent" name="respondent" /><Field label="Correspondence / evidence reference" name="reference" /><Field label="Recorded response" name="note" type="textarea" />
      </TargetForm>}
      {j.managementResponses?.map((response,index)=><p key={index}>Management {response.accepted?'accepted':'declined'} · {response.respondent} · {response.reference} · recorded {response.at} by {state.users.find(u=>u.id===response.recordedByUserId)?.name || response.recordedByUserId}</p>)}
      {j.status === 'Management accepted' && !client && <TargetForm title={`Current TB reflection ${j.id}`} button="Record reflection and include" disabled={frozen || !hasAnyRole(state, ['manager','reviewer','partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => {
        const reflected = value(d,'reflection') === 'reflected';
        prototypeStore.updateAdjustmentJournal({ ...j, reflectionStatus: reflected ? 'Reflected in TB' : 'Not reflected', reflectedInClientBooks: reflected, reflectionSourceVersion: eng.sourceVersion, reflectionEvidenceRef: value(d,'evidence') });
        if (reflected) prototypeStore.markAdjustmentJournalReportingIncluded(j.id);
      }}>
        <Field label="Reflection status" name="reflection"><option value="not">Not reflected · applied in reporting</option><option value="reflected">Reflected in current TB · no second adjustment</option></Field><Field label="Reflection evidence / source reference" name="evidence" />
      </TargetForm>}
    </div>)}
    {client && !hasAnyRole(state,['client']) && <p>Only the scoped authorized management approver can accept or reject adjustments.</p>}
  </section>;
}
