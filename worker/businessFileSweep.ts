import type { Env } from './env';

const MAX_FILES_PER_SWEEP = 200;
const MAX_OBJECTS_PER_SWEEP = 200;
const STAGED_FILE_MAX_AGE_SECONDS = 24 * 60 * 60;

interface StaleFile {
  id: string;
  workspace_id: string;
  engagement_id: string | null;
  state: 'INITIALIZED' | 'STAGED' | 'VERIFIED' | 'REJECTED';
  version: number;
  updated_at: string;
}

/** Reject abandoned, uncommitted reservations and remove their R2 staging bytes. */
export async function sweepStaleBusinessFiles(env: Env, nowSeconds: number): Promise<void> {
  const cutoff = new Date((nowSeconds - STAGED_FILE_MAX_AGE_SECONDS) * 1000).toISOString();
  const now = new Date(nowSeconds * 1000).toISOString();
  const stale = await env.DB.prepare(`SELECT f.id,f.workspace_id,f.engagement_id,f.state,f.version,f.updated_at
    FROM file_versions f
    WHERE f.state IN ('INITIALIZED','STAGED','VERIFIED','REJECTED') AND f.updated_at<=?
      AND NOT EXISTS (SELECT 1 FROM archive_seals s WHERE s.workspace_id=f.workspace_id AND s.engagement_id=f.engagement_id)
    ORDER BY f.updated_at,f.id LIMIT ?`).bind(cutoff, MAX_FILES_PER_SWEEP).all<StaleFile>();

  let examined = 0;
  let rejected = 0;
  let objectsDeleted = 0;
  let errors = 0;
  let objectBudget = MAX_OBJECTS_PER_SWEEP;

  for (const file of stale.results ?? []) {
    examined += 1;
    if (file.state !== 'REJECTED') {
      const transitioned = await env.DB.prepare(`UPDATE file_versions SET state='REJECTED',version=version+1,updated_at=?,updated_by_actor_id=NULL
        WHERE workspace_id=? AND id=? AND state=? AND version=? AND updated_at<=?
          AND NOT EXISTS (SELECT 1 FROM archive_seals s WHERE s.workspace_id=file_versions.workspace_id
            AND s.engagement_id=file_versions.engagement_id)`)
        .bind(now, file.workspace_id, file.id, file.state, file.version, cutoff).run();
      if (transitioned.meta.changes !== 1) continue;
      rejected += 1;
    }

    if (objectBudget <= 0) continue;
    try {
      const prefix = `workspaces/${file.workspace_id}/files/${file.id}/`;
      const listing = await env.FILES.list({ prefix, limit: objectBudget });
      const keys = listing.objects.map(object => object.key);
      if (keys.length) {
        await env.FILES.delete(keys);
        objectsDeleted += keys.length;
        objectBudget -= keys.length;
      }
    } catch {
      errors += 1;
    }
  }

  console.log(JSON.stringify({ event: 'workspace.file_sweep', examined, rejected, objectsDeleted, errors }));
}
