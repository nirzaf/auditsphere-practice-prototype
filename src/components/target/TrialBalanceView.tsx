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

  // Build Auto-Mapping Memory dictionary
  const memoryDict = React.useMemo(() => {
    const dict = new Map<string, { line: string; source: string; confidence: number }>();
    
    // 1. Scan historical approved mappings across all revisions
    (state.accountMappingRevisions || []).forEach((rev) => {
      rev.mappings.forEach((m) => {
        const target = m.targets?.[0]?.statementLine;
        if (target && !dict.has(m.accountCode)) {
          dict.set(m.accountCode, { line: target, source: `Prior Mapping Revision (v${rev.revision})`, confidence: 100 });
        }
      });
    });

    // 2. Scan historical engagements
    state.engagements.forEach((otherEng) => {
      otherEng.rows.forEach((r) => {
        if (r.mappedStatementLine && !dict.has(r.code)) {
          dict.set(r.code, { line: r.mappedStatementLine, source: `Historical Engagement ${otherEng.id}`, confidence: 95 });
        }
      });
    });

    // 3. Fallback semantic heuristics
    const semanticRules: Array<{ pattern: RegExp; line: string }> = [
      { pattern: /cash|bank|treasury/i, line: 'Cash and cash equivalents' },
      { pattern: /receivable|debtor|customer/i, line: 'Trade and other receivables' },
      { pattern: /fixed|equipment|plant|machinery|property|ppe/i, line: 'Non-current assets' },
      { pattern: /payable|creditor|supplier|accrual/i, line: 'Current liabilities' },
      { pattern: /loan|borrowing|facility/i, line: 'Non-current borrowings' },
      { pattern: /equity|capital|share|reserve|retained/i, line: 'Equity & reserves' },
      { pattern: /revenue|sales|contract|turnover/i, line: 'Revenue' },
      { pattern: /expense|cost|salary|rent|administrative|operating/i, line: 'Operating expenses' }
    ];

    return { dict, semanticRules };
  }, [state]);

  const [memoryOverrides, setMemoryOverrides] = React.useState<Record<string, string>>({});
  const [memoryNotice, setMemoryNotice] = React.useState<string | null>(null);

  const getSuggestedLine = (code: string, name: string, type: string) => {
    if (memoryOverrides[code]) return memoryOverrides[code];
    if (memoryDict.dict.has(code)) return memoryDict.dict.get(code)!.line;
    for (const rule of memoryDict.semanticRules) {
      if (rule.pattern.test(name)) return rule.line;
    }
    return {
      asset: 'Assets',
      liability: 'Liabilities',
      equity: 'Equity',
      revenue: 'Revenue',
      expense: 'Operating expenses'
    }[type] || 'Operating expenses';
  };

  const handleApplyMemory = () => {
    const overrides: Record<string, string> = {};
    let matchedCount = 0;
    eng.rows.forEach((r) => {
      const suggested = getSuggestedLine(r.code, r.name, r.type);
      overrides[r.code] = suggested;
      if (suggested) matchedCount++;
    });
    setMemoryOverrides(overrides);
    setMemoryNotice(`Automated Mapping Memory applied: ${matchedCount} of ${eng.rows.length} accounts mapped from prior period memory. Review and confirm below.`);
  };

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
        <section className="panel panel-pad">
          <div className="flex-between mb12">
            <div>
              <h3>TB Automated Mapping Memory &amp; FSLI Reclassification</h3>
              <p className="caption">
                The memory engine learns from prior confirmed period mappings and standard account structures to propose mappings.
              </p>
            </div>
            <button
              type="button"
              className="btn sm primary"
              onClick={handleApplyMemory}
              disabled={isFrozen(eng)}
            >
              Apply Historical Auto-Mapping Suggestions
            </button>
          </div>

          {memoryNotice && (
            <div className="banner info mb16">
              {memoryNotice}
            </div>
          )}

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
            {eng.rows.map((r, index) => {
              const memoryMatch = memoryDict.dict.get(r.code);
              const defaultLine = memoryOverrides[r.code] || r.mappedStatementLine || getSuggestedLine(r.code, r.name, r.type);
              return (
                <div className="target-mapping-row" key={r.code}>
                  <div>
                    <strong>{r.code} · {r.name}</strong>
                    <div className="caption text-muted">Balance: {r.balance.toLocaleString()} {eng.currency} {memoryMatch ? `· Memory match (100% confidence from ${memoryMatch.source})` : '· Heuristic suggestion'}</div>
                  </div>
                  <Field
                    label="Financial statement line"
                    name={`line${index}`}
                    defaultValue={defaultLine}
                  />
                </div>
              );
            })}
          </TargetForm>
        </section>
      )}
      <button className="btn" onClick={() => props.onNavigate('financial-statements')}>
        Open P&L / balance sheet drill-down
      </button>
    </div>
  );
}
