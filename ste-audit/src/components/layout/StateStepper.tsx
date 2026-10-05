'use client';

import React from 'react';
import {
  ENGAGEMENT_STATES,
  stateIndex,
  STATE_MACHINE_SPEC,
  type EngagementState
} from '@/domain/lifecycle/states';
import { Check, Clock, Lock, ChevronRight, AlertCircle } from 'lucide-react';

interface StateStepperProps {
  currentState: EngagementState;
  onSelectState?: (state: EngagementState) => void;
  userRole: string;
}

export function StateStepper({
  currentState,
  onSelectState,
  userRole
}: StateStepperProps) {
  const currentIdx = stateIndex(currentState);

  const formatStageLabel = (state: string) => {
    return state
      .split('_')
      .map(w => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  };

  const currentSpec = STATE_MACHINE_SPEC.find(s => s.state === currentState);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">
            Canonical 11-Stage Engagement State Machine (Spec §5)
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-800 font-semibold">
            Stage {currentIdx + 1} of 11: <span className="text-blue-600 font-bold">{formatStageLabel(currentState)}</span>
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          Gate: <span className="text-slate-700 font-medium">{currentSpec?.gateToAdvance}</span>
        </div>
      </div>

      {/* Pipeline Stepper Scroll */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center min-w-max space-x-2">
          {ENGAGEMENT_STATES.map((st, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isUpcoming = idx > currentIdx;

            return (
              <React.Fragment key={st}>
                <button
                  onClick={() => onSelectState?.(st)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition ${
                    isCurrent
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                      : isCompleted
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/60'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                  title={`Stage ${idx + 1}: ${st}`}
                >
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isCurrent
                      ? 'bg-white text-blue-600 font-bold'
                      : isCompleted
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {isCompleted ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                  </div>
                  <span>{formatStageLabel(st)}</span>
                </button>

                {idx < ENGAGEMENT_STATES.length - 1 && (
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${
                    idx < currentIdx ? 'text-emerald-500' : 'text-slate-300'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
