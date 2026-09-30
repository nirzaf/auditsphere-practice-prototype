import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { parsePopulation } from '../../services/populationImport';
import { sha256OfFile } from '../../services/fileMetadata';
import { Field, TargetForm, value, amount, type TargetViewProps } from './TargetCommon';
export function TargetSamplingView(props: TargetViewProps) {
  const s = prototypeStore.getSnapshot(),
    e = s.engagements.find((e) => e.id === s.selectedEngagement);
  if (!e) return null;
  const populations = s.samplePopulations.filter((p) => p.engagementId === e.id);
  return (
    <div className="target-stack">
      <TargetForm
        title="Import a complete sampling population"
        button="Validate & import source"
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={async (d) => {
          const file = d.get('source') as File;
          if (!file?.size) throw Error('Choose a CSV or XLSX population.');
          const parsed = parsePopulation(await file.arrayBuffer(), file.name);
          if (parsed.errors.length) throw Error(parsed.errors.join(' '));
          return prototypeStore.lifecycle.importPopulation(
            e.id,
            value(d, 'account'),
            file.name,
            await sha256OfFile(file),
            parsed.rows
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
                amount(d, 'seed')
              )
            }
          >
            <Field label="Method" name="method">
              {['Monetary Unit Sampling', 'Systematic Random Sampling', 'Stratified Attribute Sampling', 'Random'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Field>
            <Field
              label="Sample size"
              name="count"
              type="number"
              min={1}
              max={p.items.length}
              defaultValue={Math.min(3, p.items.length)}
            />
            <Field label="Integer seed" name="seed" type="number" defaultValue={260930} />
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
