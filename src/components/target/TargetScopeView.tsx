import React from 'react';
import { TARGET_STAGES } from '../../services/targetLifecycle';
import type { TargetViewProps } from './TargetCommon';
export function TargetScopeView({ onNavigate }: TargetViewProps) {
  return (
    <section className="panel panel-pad">
      <h1>Target audit lifecycle</h1>
      <p>
        Demonstrate one synthetic engagement from lead through archive. Commercial agreement and
        advance payment precede the independent Partner acceptance decision. Each later review is
        pinned to current sources.
      </p>
      <ol>
        {TARGET_STAGES.map((s) => (
          <li key={s.id}>
            <button className="btn ghost sm" onClick={() => onNavigate(s.route)}>
              {s.label}
            </button>{' '}
            · {s.owner}
          </li>
        ))}
      </ol>
      <h2>Simulation boundaries</h2>
      <p>
        This prototype stores metadata in localStorage and generated/uploaded artifacts in
        IndexedDB. Persona switching demonstrates local permissions. M365 workspaces, invitations,
        portal password changes, communications, payments and delivery are simulated. No real tenant
        provisioning, mail, funds, signature, legal issuance or regulatory retention is performed.
      </p>
      <p>
        TB, mapping, planning, evidence, workpaper, sample, confirmation and finding changes
        invalidate later review. EQR is not a mandatory step. Modified opinions need a recorded
        basis; critical confirmations block final reporting. Freezing at report date + 60 days
        blocks engagement changes, including prototype superuser writes.
      </p>
    </section>
  );
}
