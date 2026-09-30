'use client';

import React, { useState } from 'react';
import {
  computeMateriality,
  validateRounding,
  type MaterialityComputation,
  type RoundingValidation
} from '@/domain/materiality';
import { MATERIALITY_BENCHMARKS, type MaterialityBenchmark } from '@/domain/constants';
import { formatQar } from '@/lib/utils';
import { Calculator, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Stamp } from 'lucide-react';

interface MaterialityEngineViewProps {
  currentRevision?: {
    benchmark: MaterialityBenchmark;
    benchmarkValue: number;
    materialityRate: number;
    planningMateriality: number;
    tolerableErrorRate: number;
    tolerableError: number;
    sadRate: number;
    sadThreshold: number;
    rationale: string;
  };
  userRole: string;
  onSaveRevision?: (comp: MaterialityComputation, appliedPm: number, appliedTe: number) => void;
}

export function MaterialityEngineView({
  currentRevision,
  userRole,
  onSaveRevision
}: MaterialityEngineViewProps) {
  const [benchmark, setBenchmark] = useState<MaterialityBenchmark>(currentRevision?.benchmark ?? 'PROFIT_BEFORE_TAX');
  const [benchmarkValue, setBenchmarkValue] = useState<number>(currentRevision?.benchmarkValue ?? 4500000);
  const [materialityRate, setMaterialityRate] = useState<number>(currentRevision?.materialityRate ?? 6.0);
  const [tolerableErrorRate, setTolerableErrorRate] = useState<number>(currentRevision?.tolerableErrorRate ?? 65);
  const [sadRate, setSadRate] = useState<number>(currentRevision?.sadRate ?? 4);
  const [rationale, setRationale] = useState<string>(
    currentRevision?.rationale ?? 'Normalized profit before tax adopted as primary benchmark reflecting operating performance in Qatar contracting.'
  );

  // Manual rounding inputs
  const [appliedPm, setAppliedPm] = useState<number>(currentRevision?.planningMateriality ?? 270000);
  const [appliedTe, setAppliedTe] = useState<number>(currentRevision?.tolerableError ?? 175500);
  const [partnerSignedOff, setPartnerSignedOff] = useState<boolean>(false);

  const band = MATERIALITY_BENCHMARKS[benchmark];

  // Live computation
  let computation: MaterialityComputation | null = null;
  let computationError: string | null = null;

  try {
    computation = computeMateriality({
      benchmark,
      benchmarkValue,
      materialityRate,
      tolerableErrorRate,
      sadRate,
      rationale
    });
  } catch (err: unknown) {
    computationError = err instanceof Error ? err.message : 'Invalid materiality parameters';
  }

  // Rounding validation
  const roundingPmVal: RoundingValidation = computation
    ? validateRounding(computation.planningMateriality, appliedPm)
    : { varianceQar: 0, variancePct: 0, withinTolerance: true, partnerSignOffRequired: false, violations: [] };

  const roundingTeVal: RoundingValidation = computation
    ? validateRounding(computation.tolerableError, appliedTe)
    : { varianceQar: 0, variancePct: 0, withinTolerance: true, partnerSignOffRequired: false, violations: [] };

  const roundingBlocked = !roundingPmVal.withinTolerance || !roundingTeVal.withinTolerance;
  const needsPartnerSignoff = roundingPmVal.partnerSignOffRequired || roundingTeVal.partnerSignOffRequired;

  const handleSyncComputed = () => {
    if (computation) {
      setAppliedPm(computation.planningMateriality);
      setAppliedTe(computation.tolerableError);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            <span>ISA 320 3-Tier Materiality Engine</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict jurisdiction benchmark bands with automated ±5.0% practical rounding control &amp; Partner sign-off gate.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
            Active Revision #1 (Approved)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Benchmark & Rates inputs */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
            1. Benchmark &amp; Base Selection
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Standard Benchmark (ISA 320)</label>
            <select
              value={benchmark}
              onChange={e => setBenchmark(e.target.value as MaterialityBenchmark)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {Object.entries(MATERIALITY_BENCHMARKS).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label} ({item.min}% – {item.max}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Benchmark Base Amount (QAR)</label>
            <input
              type="number"
              value={benchmarkValue}
              onChange={e => setBenchmarkValue(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-700 mb-1">
              <span>Materiality Rate (%)</span>
              <span className="text-blue-600 font-bold">{materialityRate}%</span>
            </div>
            <input
              type="range"
              min={band.min}
              max={band.max}
              step={0.1}
              value={materialityRate}
              onChange={e => setMaterialityRate(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Min: {band.min}%</span>
              <span>Max: {band.max}%</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              2. Derived Threshold Rates
            </h4>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1">
                <span>Tolerable Error (TE / Performance)</span>
                <span className="text-blue-600 font-bold">{tolerableErrorRate}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={75}
                step={1}
                value={tolerableErrorRate}
                onChange={e => setTolerableErrorRate(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Band: 50% (High Inherent Risk) to 75% (Low Risk)</span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-700 mb-1">
                <span>SAD Threshold (Clearly Trivial)</span>
                <span className="text-blue-600 font-bold">{sadRate}%</span>
              </div>
              <input
                type="range"
                min={3}
                max={5}
                step={0.5}
                value={sadRate}
                onChange={e => setSadRate(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Band: 3% to 5% of PM</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Planning Rationale</label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              rows={3}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Middle & Right: Calculated Results & Rounding Guard */}
        <div className="lg:col-span-2 space-y-6">
          {computationError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{computationError}</span>
            </div>
          )}

          {computation && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">Planning Materiality (PM)</div>
                <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">{formatQar(computation.planningMateriality)}</div>
                <div className="text-[11px] text-slate-500 mt-1">{computation.materialityRate}% of base</div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">Tolerable Error (TE)</div>
                <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">{formatQar(computation.tolerableError)}</div>
                <div className="text-[11px] text-slate-500 mt-1">{computation.tolerableErrorRate}% of PM</div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                <div className="text-xs text-slate-500 font-medium">SAD Threshold (Trivial)</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">{formatQar(computation.sadThreshold)}</div>
                <div className="text-[11px] text-slate-500 mt-1">{computation.sadRate}% of PM</div>
              </div>
            </div>
          )}

          {/* Practical Rounding Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Practical Rounding Tolerance (±5.0% Limit)</h3>
                <p className="text-xs text-slate-500">
                  Per spec §4.2.4, manually rounding PM/TE is permitted strictly within ±5.0% variance and requires formal Partner sign-off.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncComputed}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
              >
                Reset to Computed
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Applied PM (QAR)</label>
                <input
                  type="number"
                  value={appliedPm}
                  onChange={e => setAppliedPm(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <div className="text-[11px] mt-1 flex justify-between">
                  <span className="text-slate-500">Variance: {roundingPmVal.varianceQar > 0 ? `+${roundingPmVal.varianceQar}` : roundingPmVal.varianceQar} QAR</span>
                  <span className={roundingPmVal.withinTolerance ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                    {roundingPmVal.variancePct}% {roundingPmVal.withinTolerance ? '(Within ±5%)' : '(Exceeded!)'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Applied TE (QAR)</label>
                <input
                  type="number"
                  value={appliedTe}
                  onChange={e => setAppliedTe(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <div className="text-[11px] mt-1 flex justify-between">
                  <span className="text-slate-500">Variance: {roundingTeVal.varianceQar > 0 ? `+${roundingTeVal.varianceQar}` : roundingTeVal.varianceQar} QAR</span>
                  <span className={roundingTeVal.withinTolerance ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                    {roundingTeVal.variancePct}% {roundingTeVal.withinTolerance ? '(Within ±5%)' : '(Exceeded!)'}
                  </span>
                </div>
              </div>
            </div>

            {roundingBlocked && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>
                  Hard Blocker: Practical rounding variance exceeds the ±5.0% threshold. You must adjust the applied figure to sit within tolerance.
                </span>
              </div>
            )}

            {needsPartnerSignoff && !roundingBlocked && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-amber-900 font-semibold flex items-center space-x-2">
                    <Stamp className="w-4 h-4 text-amber-600" />
                    <span>Partner Electronic Sign-Off Required for Rounded Variance</span>
                  </div>
                  {userRole === 'APPROVER' ? (
                    <button
                      type="button"
                      onClick={() => setPartnerSignedOff(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                        partnerSignedOff
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      {partnerSignedOff ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>{partnerSignedOff ? 'Partner Signed' : 'Sign Off as Partner'}</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-700 italic font-medium">
                      Awaiting Partner sign-off (Switch to APPROVER persona)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Visual Risk Stratification Matrix Preview */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-xs">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              3. Visual Risk Stratification Tiers (§4.2.4)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <div className="flex items-center space-x-1.5 text-emerald-800 font-bold text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Green (Low Risk)</span>
                </div>
                <div className="text-[11px] text-slate-700 mt-1 font-medium">Balance &lt; TE ({formatQar(appliedTe)})</div>
                <div className="text-[10px] text-slate-500 mt-1">Assigned to: Junior staff testing</div>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                <div className="flex items-center space-x-1.5 text-amber-800 font-bold text-xs">
                  <div className="w-2 h-2 rounded-full bg-amber-600" />
                  <span>Amber (Moderate Risk)</span>
                </div>
                <div className="text-[11px] text-slate-700 mt-1 font-medium">Between TE &amp; PM</div>
                <div className="text-[10px] text-slate-500 mt-1">Assigned to: Senior substantive testing</div>
              </div>

              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl">
                <div className="flex items-center space-x-1.5 text-rose-800 font-bold text-xs">
                  <div className="w-2 h-2 rounded-full bg-rose-600" />
                  <span>Red (Critical / High Risk)</span>
                </div>
                <div className="text-[11px] text-slate-700 mt-1 font-medium">Balance &gt; PM or complex estimate</div>
                <div className="text-[10px] text-slate-500 mt-1">Manager execution + Partner review</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
