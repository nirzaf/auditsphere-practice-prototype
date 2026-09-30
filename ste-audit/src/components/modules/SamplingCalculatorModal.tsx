'use client';

import React, { useState } from 'react';
import {
  calculateMusSample,
  calculateSystematicSample,
  calculateAttributeSample,
  type SamplingPopulationItem,
  type SamplingResult
} from '@/domain/sampling';
import { formatQar } from '@/lib/utils';
import { Calculator, Check, X, Shield, ArrowRight, Sparkles } from 'lucide-react';

interface SamplingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  fsliLabel: string;
  tolerableErrorQar: number;
}

export function SamplingCalculatorModal({
  isOpen,
  onClose,
  fsliLabel,
  tolerableErrorQar
}: SamplingCalculatorModalProps) {
  const [method, setMethod] = useState<'Monetary Unit Sampling' | 'Systematic Random' | 'Stratified Attribute'>('Monetary Unit Sampling');
  const [tolerableMisstatement, setTolerableMisstatement] = useState(tolerableErrorQar || 175500);
  const [sampleSize, setSampleSize] = useState(5);
  const [confidenceLevel, setConfidenceLevel] = useState<90 | 95 | 99>(95);
  const [tolerableDeviationRate, setTolerableDeviationRate] = useState(5);
  const [expectedDeviationRate, setExpectedDeviationRate] = useState(1);
  const [seed, setSeed] = useState(42);

  // Sample realistic population for demonstration
  const [population] = useState<SamplingPopulationItem[]>([
    { id: 'item-1', reference: 'EPC-4081', description: 'Lusail Tower Substructure Billing', bookValue: 4200000 },
    { id: 'item-2', reference: 'EPC-4082', description: 'Pearl Marina Jetty Piling Progress', bookValue: 3100000 },
    { id: 'item-3', reference: 'EPC-4083', description: 'West Bay Commercial Fit-out Phase 2', bookValue: 1850000 },
    { id: 'item-4', reference: 'EPC-4084', description: 'Al Khor Logistics Warehouse Slab', bookValue: 980000 },
    { id: 'item-5', reference: 'EPC-4085', description: 'HVAC Ductwork & Chiller Commissioning', bookValue: 720000 },
    { id: 'item-6', reference: 'EPC-4086', description: 'Electrical Substation Feeder Cable', bookValue: 490000 },
    { id: 'item-7', reference: 'EPC-4087', description: 'Fire Suppression Valve Assembly', bookValue: 310000 },
    { id: 'item-8', reference: 'EPC-4088', description: 'Façade Glazing Double-Glazed Panels', bookValue: 240000 },
    { id: 'item-9', reference: 'EPC-4089', description: 'Elevator Shaft Steel Reinforcements', bookValue: 180000 },
    { id: 'item-10', reference: 'EPC-4090', description: 'Stormwater Drainage Infiltration Bed', bookValue: 130000 }
  ]);

  const [result, setResult] = useState<SamplingResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCompute = () => {
    setErrorMsg(null);
    try {
      if (method === 'Monetary Unit Sampling') {
        const res = calculateMusSample(population, {
          tolerableMisstatement,
          seed
        });
        setResult(res);
      } else if (method === 'Systematic Random') {
        const res = calculateSystematicSample(population, {
          sampleSize,
          seed
        });
        setResult(res);
      } else {
        const res = calculateAttributeSample(population, {
          confidenceLevel,
          tolerableDeviationRate,
          expectedPopulationDeviationRate: expectedDeviationRate,
          seed
        });
        setResult(res);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred during sampling computation.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">ISA 530 Audit Sampling Calculator</h3>
              <p className="text-xs text-slate-500">
                FSLI Target: <span className="text-blue-700 font-semibold">{fsliLabel}</span> • Tolerable Error: {formatQar(tolerableErrorQar)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Method Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Select Sampling Method (ISA 530)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['Monetary Unit Sampling', 'Systematic Random', 'Stratified Attribute'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMethod(m); setResult(null); }}
                  className={`p-3 rounded-xl border text-left transition ${
                    method === m
                      ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    {m}
                    {method === m && <Check className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {m === 'Monetary Unit Sampling' && 'PPS value-weighted substantive sample'}
                    {m === 'Systematic Random' && 'Fixed interval k-th transaction picker'}
                    {m === 'Stratified Attribute' && 'Test of controls & compliance rates'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters grid */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Parameters</h4>

            {method === 'Monetary Unit Sampling' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Tolerable Misstatement (QAR)</label>
                  <input
                    type="number"
                    value={tolerableMisstatement}
                    onChange={e => setTolerableMisstatement(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-500">Benchmark: Tolerable Error ({formatQar(tolerableErrorQar)})</span>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">PRNG Deterministic Seed</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={e => setSeed(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-500">Reproducible audit trail identifier</span>
                </div>
              </div>
            )}

            {method === 'Systematic Random' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Target Sample Size (n)</label>
                  <input
                    type="number"
                    value={sampleSize}
                    onChange={e => setSampleSize(Number(e.target.value))}
                    min={1}
                    max={population.length}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">PRNG Seed</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={e => setSeed(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>
            )}

            {method === 'Stratified Attribute' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Confidence Level</label>
                  <select
                    value={confidenceLevel}
                    onChange={e => setConfidenceLevel(Number(e.target.value) as 90 | 95 | 99)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  >
                    <option value={90}>90% (Moderate Assurance)</option>
                    <option value={95}>95% (High Assurance)</option>
                    <option value={99}>99% (Strict Assurance)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Tolerable Deviation Rate (%)</label>
                  <input
                    type="number"
                    value={tolerableDeviationRate}
                    onChange={e => setTolerableDeviationRate(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Expected Deviation Rate (%)</label>
                  <input
                    type="number"
                    value={expectedDeviationRate}
                    onChange={e => setExpectedDeviationRate(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono text-sm focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleCompute}
              className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center space-x-2 transition shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Audit Sample</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}

          {/* Results Display */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500 font-medium">Sample Units Selected</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{result.sampleSize} / {result.populationCount} items</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500 font-medium">Total Sample Value</div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">{formatQar(result.summary.sampleTotalValue)}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500 font-medium">Value Coverage</div>
                  <div className="text-xl font-bold text-blue-700 mt-1">{result.summary.coveragePercentage}%</div>
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-800">Methodology Note:</span> {result.summary.notes}
              </div>

              {/* Table of selected items */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Ref</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5 text-right">Book Value (QAR)</th>
                      <th className="p-2.5 text-center">Hits</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {result.selectedItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-2.5 font-mono text-blue-600 font-medium">{item.reference}</td>
                        <td className="p-2.5 text-slate-700">{item.description}</td>
                        <td className="p-2.5 text-right font-mono text-slate-900 font-semibold">{formatQar(item.bookValue)}</td>
                        <td className="p-2.5 text-center font-bold text-emerald-700">{item.hits}</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Selected
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition"
          >
            Close
          </button>
          {result && (
            <button
              onClick={() => {
                alert(`Sample plan locked with ${result.sampleSize} items. Attached to ${fsliLabel} workprogram.`);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-xs flex items-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>Link to Workprogram</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
