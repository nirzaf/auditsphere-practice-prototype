export interface ProcedureDraftValues {
  workPerformed: string;
  conclusion: string;
}

export function ProcedureConflictReview({
  title,
  baseVersion,
  serverVersion,
  base,
  local,
  server,
  canRebase,
  rebaseUnavailableMessage,
  busy,
  onDiscard,
  onRebase
}: {
  title: string;
  baseVersion: number;
  serverVersion: number;
  base: ProcedureDraftValues;
  local: ProcedureDraftValues;
  server: ProcedureDraftValues;
  canRebase: boolean;
  rebaseUnavailableMessage: string;
  busy: boolean;
  onDiscard: () => void;
  onRebase: () => void;
}) {
  return <section className="business-fieldwork-conflict" role="alert" aria-label={`Procedure version conflict for ${title}`}>
    <div><strong>Conflict: your base is v{baseVersion}; the server is now v{serverVersion}.</strong>
      <p>Your draft is preserved. Compare the original, your edits, and the current server values before choosing how to continue.</p></div>
    <div className="business-fieldwork-conflict-grid">
      <div><h4>Work performed</h4><p><strong>Base v{baseVersion}</strong><br />{base.workPerformed || 'No work was saved.'}</p>
        <p><strong>Your draft</strong><br />{local.workPerformed || 'No work entered.'}</p><p><strong>Server v{serverVersion}</strong><br />{server.workPerformed || 'No work was saved.'}</p></div>
      <div><h4>Conclusion</h4><p><strong>Base v{baseVersion}</strong><br />{base.conclusion || 'No conclusion was saved.'}</p>
        <p><strong>Your draft</strong><br />{local.conclusion || 'No conclusion entered.'}</p><p><strong>Server v{serverVersion}</strong><br />{server.conclusion || 'No conclusion was saved.'}</p></div>
    </div>
    <div className="business-fieldwork-action-row">
      <button className="btn sm" type="button" disabled={busy} onClick={onDiscard}>Discard draft and use server version</button>
      {canRebase && <button className="btn sm" type="button" disabled={busy || local.workPerformed.trim().length < 10 || local.conclusion.trim().length < 10}
        onClick={onRebase}>Rebase draft onto v{serverVersion} and save</button>}
      {!canRebase && <p className="business-muted">{rebaseUnavailableMessage}</p>}
    </div>
  </section>;
}
