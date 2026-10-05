import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { parsePopulation } from '../../services/populationImport';
import { sha256OfFile } from '../../services/fileMetadata';
import { captureSourceOriginal } from '../../services/artifactStore';
import { Field, TargetForm, value, amount, type TargetViewProps } from './TargetCommon';
export function TargetSamplingView(props: TargetViewProps) {
  const s = prototypeStore.getReadSnapshot(),
    e = s.engagements.find((e) => e.id === s.selectedEngagement);
  if (!e) return null;
  const populations = s.samplePopulations.filter((p) => p.engagementId === e.id);
  return (
    <div className="target-stack">
      <p className="caption">Systematic Random uses fractional N/n intervals and a reproducible random start. Stratified uses monetary ranks; Stratified Attribute sampling tests the attributes/strata the reviewer defines below (the prototype's default strata are credit / zero / debit transaction directions, one random item per stratum followed by a random remainder). Sample size is a reviewer decision: the default of 3 is a demonstration placeholder, never a professionally validated recommendation. All prototype methods require professional methodology review.</p>
      <TargetForm
        title="Import a complete sampling population"
        button="Validate & import source"
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={async (d) => {
          const file = d.get('source') as File;
          if (!file?.size) throw Error('Choose a CSV or XLSX population.');
          const bytes = await file.arrayBuffer();
          const parsed = parsePopulation(bytes, file.name);
          if (parsed.errors.length) throw Error(parsed.errors.join(' '));
          return prototypeStore.lifecycle.importPopulation(
            e.id,
            value(d, 'account'),
            file.name,
            await sha256OfFile(file),
            parsed.rows,
            await captureSourceOriginal(file.name, bytes, /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv')
          );
        }}
      >
        <Field label="TB control account" name="account">
          {e.rows.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} · {r.name} · {r.balance}
            </option>
          ))}
        </Field>
        <label className="target-field">
          CSV / XLSX source
          <input name="source" type="file" accept=".csv,.xlsx" required />
        </label>
        <p className="caption">
          Headers: itemRef, date, counterparty, amount; optional description, period, currency. The
          complete source must reconcile to the selected TB account.
        </p>
      </TargetForm>
      {populations.map((p) => (
        <section className="panel panel-pad" key={p.id}>
          <h3>
            {p.area} · {p.description}
          </h3>
          <p>
            Control count: {p.totalPopulationCount} · control value: {p.totalPopulationValue} ·
            selected: {p.selectedCount} / {p.selectedValue}
          </p>
          {p.samplingBasis && (
            <p className="caption">
              Recorded sampling basis: {p.samplingBasis} · size determination: {p.sizeDetermination || 'Not recorded'}
              {p.attributeDefinition ? ` · attributes/strata: ${p.attributeDefinition}` : ''}
            </p>
          )}
          <TargetForm
            title={`Generate sample: ${p.id}`}
            button="Generate reproducible sample"
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(d) =>
              prototypeStore.lifecycle.generateSample(
                e.id,
                p.id,
                value(d, 'method') as 'Random',
                amount(d, 'count'),
                amount(d, 'seed'),
                {
                  samplingBasis: value(d, 'samplingBasis'),
                  sizeDetermination: value(d, 'sizeDetermination'),
                  attributeDefinition: value(d, 'attributeDefinition') || undefined,
                  strataField: value(d, 'strataField') as 'counterparty' | 'month' | 'direction'
                }
              )
            }
          >
            <Field label="Method" name="method">
              {['Monetary Unit Sampling', 'Systematic Random Sampling', 'Stratified Attribute Sampling', 'Random'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Field>
            <Field
              label="Sample size (reviewer-determined)"
              name="count"
              type="number"
              min={1}
              max={p.items.length}
              defaultValue={Math.min(3, p.items.length)}
            />
            <Field label="Integer seed" name="seed" type="number" defaultValue={260930} />
            <Field label="Attribute field for strata" name="strataField"><option value="counterparty">Counterparty</option><option value="month">Transaction month</option><option value="direction">Transaction direction (explicit choice)</option></Field>
            <Field
              label="Sampling basis — why this population and method are appropriate"
              name="samplingBasis"
              type="textarea"
            />
            <Field
              label="Sample-size determination — firm method, calculation or documented professional override"
              name="sizeDetermination"
              type="textarea"
            />
            <Field
              label="Applicable attributes / strata definition (required for Stratified Attribute Sampling)"
              name="attributeDefinition"
              type="textarea"
              required={false}
            />
            <p className="caption">
              The entered count is treated as the reviewer's professional selection. The prototype
              ships no mandatory sample-size formula; a documented override is required to keep the
              selection explainable. Source replacement invalidates dependent samples.
            </p>
          </TargetForm>
          {p.items
            .filter((i) => i.selected)
            .map((i) => (
              <div className="panel panel-pad mt16" key={i.id}>
                <h4>
                  {i.itemRef} · {i.counterparty} · {i.amount}
                </h4>
                <p>
                  {i.tested ? `${i.result} · audited ${i.auditedAmount}` : 'Untested'} · Physical
                  index: {i.physicalReference?.indexCode || 'Missing'}
                </p>
                <TargetForm
                  title={`Test ${i.itemRef}`}
                  button="Record sample test"
                  onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                  onCommit={(d) =>
                    prototypeStore.recordSampleItemTest(
                      p.id,
                      i.id,
                      amount(d, 'audited'),
                      value(d, 'notes')
                    )
                  }
                >
                  <Field
                    label="Audited amount"
                    name="audited"
                    type="number"
                    step="0.01"
                    defaultValue={i.auditedAmount ?? i.amount}
                  />
                  <Field label="Test work and conclusion" name="notes" type="textarea" />
                </TargetForm>
                <TargetForm
                  title={`Physical evidence for ${i.itemRef}`}
                  button="Link physical index"
                  onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                  onCommit={(d) =>
                    prototypeStore.lifecycle.attachPhysicalReference(
                      e.id,
                      value(d, 'workpaper'),
                      p.id,
                      i.id,
                      {
                        indexCode: value(d, 'index'),
                        box: value(d, 'box') || undefined,
                        description: value(d, 'description'),
                        locationNote: value(d, 'location')
                      }
                    )
                  }
                >
                  <Field label="Workpaper" name="workpaper">
                    {e.workpapers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </Field>
                  <Field label="Physical index" name="index" defaultValue="X-1" />
                  <Field label="Box reference (optional)" name="box" required={false} />
                  <Field label="Evidence description" name="description" />
                  <Field label="Location note (optional)" name="location" required={false} />
                </TargetForm>
                <TargetForm title={`Digital evidence for ${i.itemRef}`} button="Link digital sample evidence" onRegisterUnsavedForm={props.onRegisterUnsavedForm} onCommit={d => prototypeStore.lifecycle.attachDigitalSampleEvidence(e.id, p.id, i.id, value(d,'document'), value(d,'mode') as 'Digital' | 'Hybrid')}>
                  <Field label="Evidence mode" name="mode"><option value="Digital">Digital only</option><option value="Hybrid">Hybrid · digital and physical</option></Field>
                  <Field label="Accepted evidence document" name="document">{s.documents.filter(d => d.engagementId === e.id).map(d => <option key={d.id} value={d.id}>{d.name} · v{d.version}</option>)}</Field>
                </TargetForm>
              </div>
            ))}
        </section>
      ))}
      <button className="btn" onClick={() => props.onNavigate('confirmations')}>
        Next: external confirmations
      </button>
    </div>
  );
}
