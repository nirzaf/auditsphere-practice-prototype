// State adapter: decomposes `PrototypeState` into root documents + entities and
// reassembles it, so the UI keeps its familiar single-object contract while D1
// stores granular rows with independent revisions.
//
// Design: layout is discovered generically at seed time and recorded in a
// manifest, so no enumeration of prototypes types can drift out of date.
//
// See docs/prototype/cloud-full-stack-architecture.md (section "D1 schema").

import type { PrototypeState } from '../src/types';
import { MANIFEST_DOCUMENT_KEY, SCALARS_DOCUMENT_KEY, parseManifest, type WorkspaceManifest } from './env';

export interface DecomposedEntity {
  collection: string;
  entityId: string;
  clientId?: string;
  engagementId?: string;
  payload: Record<string, unknown>;
}

export interface DecomposedState {
  manifest: WorkspaceManifest;
  scalars: Record<string, unknown>;
  rootDocuments: Record<string, Record<string, unknown>>;
  entities: DecomposedEntity[];
}

/** A top-level array whose items all carry a non-empty string `id` is an entity collection. */
const isEntityCollection = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value) && value.every(item =>
    Boolean(item) && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
    && ((item as { id: string }).id).length > 0
  );

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const scopeOf = (collection: string, item: Record<string, unknown>): { clientId?: string; engagementId?: string } => {
  const clientId = (item.clientId ?? (collection === 'clients' ? item.id : undefined) ?? item.client) as string | undefined;
  const engagementId = (item.engagementId ?? (collection === 'engagements' ? item.id : undefined) ?? item.engagement) as string | undefined;
  return {
    ...(typeof clientId === 'string' ? { clientId } : {}),
    ...(typeof engagementId === 'string' ? { engagementId } : {})
  };
};

/**
 * Split state into root documents and entities.
 * Scalar fields (`currentUserId`, `asOfDate`, ...) go into the scalars document so
 * session-adjacent fields never become per-entity rows.
 */
export function decomposeState(state: PrototypeState, schemaVersion: number): DecomposedState {
  const scalars: Record<string, unknown> = {};
  const rootDocuments: Record<string, Record<string, unknown>> = {};
  const entityCollections: string[] = [];
  const rootDocumentKeys: string[] = [];
  const entities: DecomposedEntity[] = [];

  for (const [key, value] of Object.entries(state as unknown as Record<string, unknown>)) {
    if (isEntityCollection(value)) {
      entityCollections.push(key);
      for (const item of value) {
        entities.push({
          collection: key,
          entityId: String(item.id),
          ...scopeOf(key, item),
          payload: item as Record<string, unknown>
        });
      }
      continue;
    }
    if (isPlainObject(value)) {
      rootDocumentKeys.push(key);
      rootDocuments[key] = value;
      continue;
    }
    scalars[key] = value;
  }

  return {
    manifest: { schemaVersion, entityCollections: entityCollections.sort(), rootDocuments: rootDocumentKeys.sort() },
    scalars,
    rootDocuments,
    entities
  };
}

/** Rebuild a `PrototypeState` from its decomposed parts. */
export function assembleState(
  workspaceId: string,
  manifest: WorkspaceManifest,
  scalars: Record<string, unknown>,
  rootDocuments: Record<string, Record<string, unknown>>,
  entitiesByCollection: Record<string, Array<Record<string, unknown>>>
): PrototypeState {
  const state: Record<string, unknown> = { ...scalars };
  for (const key of manifest.rootDocuments) {
    if (rootDocuments[key]) state[key] = rootDocuments[key];
  }
  for (const key of manifest.entityCollections) {
    state[key] = entitiesByCollection[key] ?? [];
  }
  // The seed always carries id/schema/currentUserId; fall back defensively so a
  // partially seeded workspace still hydrates a usable object.
  state.schema ??= manifest.schemaVersion;
  state.id ??= workspaceId;
  return state as unknown as PrototypeState;
}

/** Index one collection by entity id -> serialised payload. */
const indexEntities = (value: unknown): Map<string, string> => {
  const index = new Map<string, string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        const id = (item as { id: string }).id;
        if (id) index.set(id, JSON.stringify(item));
      }
    }
  }
  return index;
};

/**
 * Snapshot every named entity collection before a command runs, so the command's
 * real effect can be derived from the state afterwards. Command authors therefore
 * cannot forget to declare a changed row: persistence follows the data, not a
 * hand-written list. Items are keyed by id and compared per item, so reordering a
 * collection is not mistaken for a change.
 */
export function snapshotEntityCollections(
  state: PrototypeState,
  collections: readonly string[]
): Map<string, Map<string, string>> {
  const record = state as unknown as Record<string, unknown>;
  const snapshot = new Map<string, Map<string, string>>();
  for (const collection of collections) snapshot.set(collection, indexEntities(record[collection]));
  return snapshot;
}

export interface EntityDiff {
  upserts: Array<{ entityKind: string; entityId: string }>;
  removals: Array<{ entityKind: string; entityId: string }>;
  /** Set only when the command introduced collections the manifest did not know. */
  manifest?: WorkspaceManifest;
}

/**
 * Compare the post-command state against a snapshot and report which entities were
 * added or changed (`upserts`) and which disappeared (`removals`). Discovery runs
 * over the whole state so a collection added by a later schema change still starts
 * persisting without a migration; when that happens the extended manifest is
 * returned so the caller can persist it.
 */
export function diffEntityCollections(
  state: PrototypeState,
  manifest: WorkspaceManifest,
  before: Map<string, Map<string, string>>
): EntityDiff {
  const record = state as unknown as Record<string, unknown>;
  const discovered = Object.entries(record)
    .filter(([, value]) => isEntityCollection(value))
    .map(([key]) => key)
    .sort();
  const known = new Set(manifest.entityCollections);
  const grew = discovered.some(key => !known.has(key));
  const nextManifest: WorkspaceManifest | undefined = grew
    ? { ...manifest, entityCollections: discovered }
    : undefined;
  const collections = nextManifest ? nextManifest.entityCollections : manifest.entityCollections;

  const upserts: EntityDiff['upserts'] = [];
  const removals: EntityDiff['removals'] = [];
  for (const collection of collections) {
    const current = indexEntities(record[collection]);
    const previous = before.get(collection) ?? new Map<string, string>();
    for (const [id, json] of current) {
      if (previous.get(id) !== json) upserts.push({ entityKind: collection, entityId: id });
    }
    for (const id of previous.keys()) {
      if (!current.has(id)) removals.push({ entityKind: collection, entityId: id });
    }
  }
  return { upserts, removals, manifest: nextManifest };
}

export { MANIFEST_DOCUMENT_KEY, SCALARS_DOCUMENT_KEY, parseManifest, isEntityCollection, scopeOf };
