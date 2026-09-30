import React, { useEffect, useState } from 'react';
import { persistArtifact, artifactSha256 } from '../../services/artifactStore';
import { prototypeStore } from '../../store/prototypeStore';
import type { AuditOpinion } from '../../types/targetLifecycle';
import { hasAnyRole } from '../../services/guards';
import {
  currentDeliverables,
  isFrozen,
  reportBasis,
  targetReleaseBlockers,
  plusDays
} from '../../services/targetLifecycle';
import {
  ActionButton,
  ArtifactLink,
  Field,
  TargetForm,
  value,
  type TargetViewProps
} from './TargetCommon';

export function OpinionDeliverablesView(props: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  const opinion = eng?.auditLifecycle?.opinions.at(-1);

  // Local state for interactive conditional qualification builder
  const [selectedOpinionType, setSelectedOpinionType] = useState<AuditOpinion>(
    opinion?.value || 'Clean'
  );
  const [selectedFsli, setSelectedFsli] = useState<string>(opinion?.focusArea || '');
  const [opinionRationale, setOpinionRationale] = useState<string>(opinion?.basis || '');
  useEffect(() => {
    setSelectedOpinionType(opinion?.value || 'Clean');
    setSelectedFsli(opinion?.focusArea || '');
    setOpinionRationale(opinion?.basis || '');
  }, [eng?.id, opinion?.revision]);
  if (!eng) return null;
  const set = currentDeliverables(state, eng), blockers = targetReleaseBlockers(state, eng), frozen = isFrozen(eng), archiveControl = eng.auditLifecycle!.archiveControl;

  const availableFslis = [
    ...new Set(
      eng.rows
        .map((r) => r.mappedStatementLine)
        .filter((l): l is string => Boolean(l && l !== 'Unmapped'))
    )
  ];
  if (!availableFslis.length) {
    availableFslis.push('Revenue / Sales', 'Accounts Receivable', 'Inventory', 'Property, Plant & Equipment', 'Going Concern Uncertainty');
  }

  const isModified = selectedOpinionType !== 'Clean';

  return (
    <div className="target-stack">
      {/* Header & Standards Context */}
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <span className="tag blue mb8">MODULE 4: REPORTING, DELIVERABLES & ARCHIVE</span>
            <h2>Audit Opinion & 5-Part Commercial Deliverables Package</h2>
            <p className="caption">
              Strict compliance with <strong>ISA 700</strong> (Forming an Opinion), <strong>ISA 705</strong> (Modifications to the Opinion), 
              and <strong>ISA 230</strong> (Audit Documentation 60-Day Archival Lock). Primary Currency: <strong>QAR</strong>.
            </p>
          </div>
          <div className="text-right">
            <span className={`tag ${frozen ? 'red' : set ? 'green' : 'amber'}`}>
              {frozen ? 'ISA 230 LOCKED (READ-ONLY)' : set ? '5-PART BUNDLE GENERATED' : 'OPINION PENDING'}
            </span>
          </div>
        </div>

        {blockers.length > 0 && (
          <div className="target-blockers mt16" role="status">
            <h3>Reporting Release Blockers ({blockers.length})</h3>
            <p className="caption mb8">All operational gates must be cleared before the Engagement Partner can authorize release:</p>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 4-Way Opinion Dropdown & Conditional Qualification Builder */}
      <TargetForm
        title="Engagement Partner Opinion Selection (ISA 700 / 705)"
        formId="opinion"
        button="Sign & Record Audit Opinion"
        disabled={!hasAnyRole(state, ['partner']) || frozen}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) => {
          const op = value(data, 'opinion') as AuditOpinion;
          const focus = value(data, 'focus');
          const bas = value(data, 'basis');
          prototypeStore.lifecycle.selectOpinion(eng.id, op, focus, bas);
        }}
      >
        <div className="target-field">
          <span>Audit Opinion Category (Partner Exclusive)</span>
          <select
            name="opinion"
            value={selectedOpinionType}
            onChange={(e) => setSelectedOpinionType(e.target.value as AuditOpinion)}
          >
            <option value="Clean">1. Clean / Unqualified Opinion (ISA 700)</option>
            <option value="Qualified">2. Qualified Opinion (ISA 705 - Material Misstatement / Limitation)</option>
            <option value="Disclaimer">3. Disclaimer of Opinion (ISA 705 - Pervasive Scope Limitation)</option>
            <option value="Adverse">4. Adverse Opinion (ISA 705 - Material & Pervasive Misstatement)</option>
          </select>
        </div>

        {isModified && (
          <div className="borderbox p16 mt12 bg-amber-subtle" style={{ borderRadius: 6, border: '1px solid var(--amber-border, #f59e0b)' }}>
            <h4 style={{ color: '#b45309', margin: '0 0 8px 0' }}>
              ⚠️ Conditional Qualification Builder (Mandatory for {selectedOpinionType} Opinion)
            </h4>
            <p className="caption mb12">
              ISA 705 requires an explicit Basis for Modification paragraph describing the specific quantitative and qualitative matters.
            </p>

            <Field label="Affected Financial Statement Line Item (FSLI)" name="focus" defaultValue={selectedFsli || availableFslis[0]}>
              {availableFslis.map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
            </Field>

            <label className="target-field mt12">
              <span>Quantitative / Qualitative Rationale (min 20 characters, injected into report)</span>
              <textarea
                name="basis"
                rows={3}
                required
                value={opinionRationale}
                onChange={(e) => setOpinionRationale(e.target.value)}
                placeholder="Detail the quantification of misstatement, lack of audit evidence, or scope limitation requiring this modified opinion..."
              />
            </label>

            {opinionRationale.trim().length > 0 && (
              <div className="mt12 p12 bg-white" style={{ borderRadius: 4, border: '1px dashed #cbd5e1' }}>
                <span className="caption" style={{ fontWeight: 600, color: '#475569' }}>
                  Live Preview: "Basis for {selectedOpinionType} Opinion" (ISA 705 Paragraph):
                </span>
                <p className="sub mt4" style={{ fontStyle: 'italic' }}>
                  "The financial statements do not adequately reflect the required valuation of {selectedFsli || '[FSLI]'} in accordance with IFRS. {opinionRationale}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Digital Credentials Preview */}
        <div className="mt16 p16 borderbox" style={{ background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <h4>Partner Digital Credentials & Firm Seal</h4>
          <div className="row mt8" style={{ gap: 20, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="firmavatar" style={{ background: '#0284c7', color: '#fff', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {eng.partner ? eng.partner.split(' ').map(n => n[0]).join('') : 'LP'}
              </div>
              <div>
                <strong>{eng.partner || 'Daniel James'}, Engagement Partner</strong>
                <p className="caption">Digital Signature Key: QFC-AUD-SIG-9281 · Licensed Signatory</p>
              </div>
            </div>
            <div style={{ padding: '6px 12px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 4, color: '#047857', fontWeight: 600, fontSize: '12px' }}>
              ✓ STE Audit &amp; Accounting LLC Firm Stamp Verified
            </div>
          </div>
        </div>
      </TargetForm>

      {/* Recorded Opinion Summary */}
      {opinion && (
        <section className="panel panel-pad">
          <div className="flex-between">
            <div>
              <h3>
                Active Opinion: {opinion.value} (Revision {opinion.revision})
              </h3>
              <p className="caption">
                Authorized by Partner {state.users.find((u) => u.id === opinion.selectedByUserId)?.name || 'Daniel James'} on {opinion.selectedAt}
              </p>
            </div>
            <span className={`tag ${opinion.value === 'Clean' ? 'green' : 'amber'}`}>
              {opinion.value === 'Clean' ? 'UNQUALIFIED' : 'MODIFIED OPINION'}
            </span>
          </div>

          {opinion.value !== 'Clean' && (
            <div className="mt12 p12 borderbox bg-amber-subtle" style={{ borderRadius: 4 }}>
              <strong>Basis for {opinion.value} Opinion:</strong>
              <p className="mt4"><strong>Affected FSLI:</strong> {opinion.focusArea}</p>
              <p className="sub mt4">{opinion.basis}</p>
            </div>
          )}
        </section>
      )}

      {/* Compile Mandatory 5-Part Deliverables Package */}
      <TargetForm
        title="Compile Mandatory 5-Part Commercial Deliverables Bundle"
        formId="deliverables"
        button="Authorize & Compile 5-Part Deliverables Bundle"
        disabled={!hasAnyRole(state, ['partner']) || frozen || !opinion || blockers.length > 0}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.generateDeliverables(eng.id, value(data, 'reportDate'))
        }
      >
        <p className="sub mb12">
          Upon Partner authorization, the system compiles the complete 5-part bundle, embeds digital credentials, triggers the remaining 50% fee invoice, and prepares the PBC freeze.
        </p>

        <Field
          label="Independent Auditor's Report Date (ISA 700 Cut-off)"
          name="reportDate"
          type="date"
          defaultValue={state.asOfDate}
        />
      </TargetForm>

      {/* 5-Part Deliverables Bundle Display */}
      {eng.auditLifecycle!.deliverables.map((d) => (
        <section className="panel panel-pad" key={d.id} data-testid="deliverables-bundle">
          <div className="flex-between">
            <div>
              <h3>
                Certified Deliverables Bundle v{d.revision} ·{' '}
                {d.basis === reportBasis(state, eng) && set ? 'Current & Certified' : 'Historical Revision'}
              </h3>
              <p className="caption">
                Report Date: {d.reportDate} · Opinion: {eng.auditLifecycle!.opinions.find(item => item.revision === d.opinionRevision)?.value} · Compiled: {d.generatedAt}
              </p>
            </div>
            <span className="tag green">5-PART CERTIFIED BUNDLE</span>
          </div>

          <div className="stack mt16" style={{ gap: 12 }}>
            {d.artifacts.map((a, index) => {
              const deliverableNames = [
                'Deliverable 1: Independent Auditor’s Report & Audited Financial Statements',
                'Deliverable 2: Management Letter (Internal Control Deficiencies)',
                'Deliverable 3: Letter of Representation (LOR for Client Letterhead)',
                'Deliverable 4: Management Correspondences Audit Trail',
                'Deliverable 5: Final Balance Fee Note (Remaining 50% Invoice)'
              ];
              const label = deliverableNames[index] || a.name;
              return (
                <div key={a.id} className="borderbox p12 flex-between" style={{ background: '#f8fafc', borderRadius: 6 }}>
                  <div>
                    <strong>{label}</strong>
                    <div className="caption text-muted">
                      Filename: {a.name} · SHA-256: {a.sha256 ? `${a.sha256.slice(0, 16)}...` : 'Verified'} · Format: {a.kind}
                    </div>
                  </div>
                  <ArtifactLink artifact={a} />
                </div>
              );
            })}
          </div>

          <div className="mt16 pt12 border-top flex-between">
            <span className="caption">
              Status:{' '}
              {d.deliveredAt
                ? `Dispatched to Client Portal on ${d.deliveredAt}`
                : 'Ready for formal release to client'}
            </span>
            {!d.deliveredAt && (
              <ActionButton
                disabled={frozen || !hasAnyRole(state, ['partner'])}
                action={() =>
                  prototypeStore.lifecycle.markDeliverablesDelivered(
                    eng.id,
                    'Authorized 5-part bundle released to client portal; upload privileges frozen.'
                  )
                }
              >
                Lead Partner Authorization: Release Bundle to Client Portal (Freezes Uploads)
              </ActionButton>
            )}
          </div>
        </section>
      ))}

      {set && !set.deliveredAt && <TargetForm title="Retain executive-signed representation letter" formId="signed-lor" button="Verify and retain signed LOR" disabled={frozen || !hasAnyRole(state, ['manager', 'partner'])} onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={async data => {
          const file = data.get('signedLor');
          if (!(file instanceof File) || !file.size) throw new Error('Select the signed representation file.');
          if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) throw new Error('Use a PDF or Word representation letter.');
          const artifact: import('../../types').GeneratedArtifactRecord = { id: `SIGNED-LOR-${crypto.randomUUID()}`, name: file.name, kind: file.type === 'application/pdf' ? 'PDF' : 'DOCX', mimeType: file.type, size: file.size, sha256: await artifactSha256(file) };
          await persistArtifact(artifact, file);
          await prototypeStore.lifecycle.recordSignedRepresentation(eng.id, set.id, artifact, value(data, 'executive'), value(data, 'financeExecutive'), value(data, 'inspection'));
        }}>
        <p>Export the Word draft onto client letterhead, obtain executive management signatures, then retain the signed copy against this bundle revision.</p>
        <label className="target-field">Signed PDF or Word letter<input type="file" name="signedLor" accept=".pdf,.docx" required /></label>
        <Field label="Executive management signatory" name="executive" />
        <Field label="Finance executive signatory" name="financeExecutive" />
        <Field label="Signature inspection and source reference" name="inspection" type="textarea" />
        {eng.auditLifecycle!.signedRepresentations?.filter(record => record.deliverableSetId === set.id).map(record => <p key={record.revision}>v{record.revision} · {record.executive} / {record.financeExecutive} · {record.at} <ArtifactLink artifact={record.artifact} /></p>)}
      </TargetForm>}
      {/* 60-Day Compliance Archival Timer (ISA 230) */}
      <section className="panel panel-pad" style={{ background: frozen ? '#fef2f2' : '#f0fdf4', border: frozen ? '1px solid #f87171' : '1px solid #86efac' }}>
        <div className="flex-between">
          <div>
            <h3>ISA 230 Regulatory Archival Lock</h3>
            <p className="caption">
              International Standards on Auditing (ISA 230) require final audit documentation assembly within 60 days of the report date, followed by immutable permanent locking.
            </p>
          </div>
          <span className={`tag ${frozen ? 'red' : 'green'}`}>
            {frozen ? 'FILE SEALED & LOCKED' : archiveControl.freezeStatus === 'Counting Down' ? 'COUNTDOWN ACTIVE' : 'AWAITING DELIVERY'}
          </span>
        </div>

        <div className="target-metrics mt12">
          <div className="panel panel-pad">
            <small>Report Signature Date</small>
            <strong>{archiveControl.finalReportDate || set?.reportDate || 'Pending release'}</strong>
          </div>
          <div className="panel panel-pad">
            <small>60-Day Archival Due Date</small>
            <strong>
              {archiveControl.freezeDueDate || (set?.reportDate ? plusDays(set.reportDate, 60) : 'Not started')}
            </strong>
          </div>
          <div className="panel panel-pad">
            <small>Countdown Status</small>
            <strong>{archiveControl.freezeStatus}</strong>
          </div>
        </div>

        {!frozen && (
          <div className="mt16 row" style={{ gap: 12 }}>
            <button className="btn sm primary" onClick={() => props.onNavigate('records')}>
              Open Archival Countdown &amp; Permanent Seal
            </button>
            <button className="btn sm ghost" onClick={() => props.onNavigate('billing')}>
              View 50% Balance Invoice &amp; Receivables
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
