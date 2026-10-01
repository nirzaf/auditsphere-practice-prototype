import React, { useEffect, useState } from 'react';
import { persistArtifact, artifactSha256 } from '../../services/artifactStore';
import { prototypeStore } from '../../store/prototypeStore';
import type { AuditOpinion } from '../../types/targetLifecycle';
import { hasAnyRole } from '../../services/guards';
import { clientCorrespondenceLines, managementLetterLines } from '../../services/clientOutputs';
import {
  currentDeliverables,
  currentPartnerOpinion,
  currentSignatureAuthorization,
  isFrozen,
  modifiedOpinionBasisLines,
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
  const state = prototypeStore.getReadSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  const opinion = eng ? currentPartnerOpinion(state, eng) : undefined;

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
  const signature = currentSignatureAuthorization(state, eng);
  const signatureHistory = eng.auditLifecycle!.signatureAuthorizations || [];

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
              Prototype workflows for opinion selection, modified opinions and a 60-day archive policy. Primary Currency: <strong>QAR</strong>.
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

            <label className="target-field"><span>Affected Financial Statement Line Item (FSLI)</span>
            <select name="focus" value={selectedFsli || availableFslis[0]} onChange={e => setSelectedFsli(e.target.value)}>
              {availableFslis.map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
            </select></label>

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
                  Live Preview — rendered by the same projection as the generated report:
                </span>
                <div className="sub mt4" style={{ fontStyle: 'italic' }}>
                  {modifiedOpinionBasisLines({
                    value: selectedOpinionType,
                    focusArea: selectedFsli || '[affected FSLI]',
                    basis: opinionRationale
                  }).map((line, index) => (
                    <p key={index} style={{ margin: '2px 0' }}>{line}</p>
                  ))}
                </div>
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
                <p className="caption">Synthetic Partner signature · prototype illustration</p>
                {signature?.signaturePng && <img src={signature.signaturePng} alt="Pinned synthetic Partner signature" style={{ maxWidth: 180, maxHeight: 70 }} />}
              </div>
            </div>
            <div style={{ padding: '6px 12px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 4, color: '#047857', fontWeight: 600, fontSize: '12px' }}>
              STE Audit &amp; Accounting LLC · simulated firm seal
              {signature?.sealPng && <img src={signature.sealPng} alt="Pinned synthetic firm seal" style={{ maxWidth: 90, maxHeight: 90 }} />}
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

      {eng.auditLifecycle!.opinions.filter(record => record !== opinion).map(record => <details className="panel panel-pad" key={record.revision}><summary>Historical opinion revision {record.revision} · {record.value}</summary><p>{record.focusArea} · {record.basis}</p><p>Selected {record.selectedAt} by {state.users.find(u => u.id === record.selectedByUserId)?.name || record.selectedByUserId}. This decision does not authorize the current reporting basis.</p></details>)}
      <details className="panel panel-pad"><summary>Client correspondence preview (same projection as exported bundle)</summary>{clientCorrespondenceLines(state,eng).map((line,i) => <p key={i}>{line}</p>)}</details>
      <details className="panel panel-pad"><summary>Management letter preview (designated observations only)</summary>{managementLetterLines(state,eng).map((line,i) => <p key={i}>{line}</p>)}</details>
      {/* Partner Signature & Firm Seal — the authoritative signature event (R10) */}
      <TargetForm
        title="Partner Signature & Firm Seal (ISA 700 sign-off — authoritative signature event)"
        formId="partner-signature"
        button="Sign & authorize reporting basis (simulated signature / seal)"
        disabled={!hasAnyRole(state, ['partner']) || frozen || !opinion || blockers.length > 0}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={async (data) => {
          const png = async (key: string) => {
            const file = data.get(key) as File | null;
            if (!file?.size) return undefined;
            if (file.type !== 'image/png' || file.size > 1024*1024) throw Error('Choose a PNG illustration under 1 MB.');
            const bytes = new Uint8Array(await file.arrayBuffer());
            return `data:image/png;base64,${btoa(Array.from(bytes,b => String.fromCharCode(b)).join(''))}`;
          };
          prototypeStore.lifecycle.authorizeReportSignature(
            eng.id,
            value(data, 'signatureDate'),
            value(data, 'note'),
            { signaturePng: await png('signaturePng'), sealPng: await png('sealPng') }
          );
        }}
      >
        <p className="sub mb12">
          Selecting an opinion is <strong>not</strong> the signature event. This step records the
          simulated digital signature and firm seal that pin the current opinion revision and
          reporting basis. The signature date starts the 60-day compliance clock, and the compiled
          bundle must carry the same report date.
        </p>
        <Field
          label="Signature date (starts the 60-day compliance clock)"
          name="signatureDate"
          type="date"
          defaultValue={signature?.signatureDate || state.asOfDate}
        />
        <Field label="Signature authorization note" name="note" type="textarea" />
        <label className="target-field"><span>Partner signature PNG illustration (optional, synthetic)</span><input type="file" name="signaturePng" accept="image/png" /></label>
        <label className="target-field"><span>Firm seal PNG illustration (optional, synthetic)</span><input type="file" name="sealPng" accept="image/png" /></label>
        {signatureHistory.map((record) => (
          <p className="caption" key={record.revision}>
            Authorization v{record.revision} · signed {record.signatureDate} · opinion revision{' '}
            {record.opinionRevision} · {record.basis === (opinion ? reportBasis(state, eng) : '') && signature?.revision === record.revision ? 'Current authoritative signature' : 'Historical / superseded'} · {record.note}
          </p>
        ))}
      </TargetForm>

      {/* Compile Mandatory 5-Part Deliverables Package */}
      <TargetForm
        title="Compile Mandatory 5-Part Commercial Deliverables Bundle"
        formId="deliverables"
        button="Compile 5-Part Deliverables Bundle (separate from signature)"
        disabled={!hasAnyRole(state, ['partner']) || frozen || !opinion || !signature || blockers.length > 0}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.generateDeliverables(eng.id, value(data, 'reportDate'))
        }
      >
        <p className="sub mb12">
          Compilation is a separate step from the signature above. The system compiles the complete
          5-part bundle — including the Final Balance Fee Note (remaining 50%) as a Draft invoice —
          and prepares the release. {!signature ? 'The Partner must sign and seal the current reporting basis first.' : `Report date must equal the authorized signature date (${signature.signatureDate}).`}
        </p>

        <Field
          label="Independent Auditor's Report Date (ISA 700 Cut-off — must equal the signature date)"
          name="reportDate"
          type="date"
          defaultValue={signature?.signatureDate || state.asOfDate}
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
                Record Final Delivery &amp; Release Bundle to Client Portal (Freezes Uploads)
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
              This prototype applies a 60-day assembly policy and blocks application edits after closure. Browser storage is not a certified immutable retention system.
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
