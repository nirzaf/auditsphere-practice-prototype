import React from 'react';

const PILLARS: Array<[string, string]> = [
  ['Prepare', 'Client records → financial statements'],
  ['Review', 'Evidence → professional judgment'],
  ['Control', 'Approval → agreed handover'],
];

export const SlideCover: React.FC<{ onStart: () => void; onCoverage: () => void }> = ({ onStart, onCoverage }) => (
  <div className="cr-cover">
    <p className="cr-cover-kicker">BUSINESS REQUIREMENTS</p>
    <h2 className="cr-cover-title">One engagement.</h2>
    <p className="cr-cover-sub">Accounting, audit and practice workflows</p>
    <ul className="cr-pillars">
      {PILLARS.map(([name, text]) => (
        <li key={name}><strong>{name}</strong><span>{text}</span></li>
      ))}
    </ul>
    <div className="cr-band" role="note">
      <span className="cr-band-label">FOR CLIENT REVIEW</span>
      <span className="cr-band-text">Agree the business workflow, responsibilities and approval points.</span>
    </div>
    <p className="cr-cover-foot">Requirements view — not confirmation that every live handover is complete.</p>
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <button className="btn primary" onClick={onStart}>Start the walkthrough</button>
      <button className="btn ghost" onClick={onCoverage}>See all 39 modules</button>
    </div>
  </div>
);
