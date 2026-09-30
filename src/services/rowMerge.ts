/** Three-way browser-tab merge. Different records/fields survive; conflicting edits fail closed. */
export function mergeIndependentEdits<T>(base: T, local: T, remote: T, path = ''): T {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (equal(local, remote) || equal(base, remote)) return structuredClone(local);
  if (equal(base, local) && path) return structuredClone(remote);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const keyed = [...base, ...local, ...remote].every((x: any) => x && typeof x === 'object' && typeof x.id === 'string');
    if (keyed) {
      const ids = [...new Set([...remote, ...local].map(x => x.id))];
      return ids.map(id => mergeIndependentEdits(base.find(x => x.id === id), local.find(x => x.id === id), remote.find(x => x.id === id), `${path}[${id}]`)).filter(x => x !== undefined) as T;
    }
    const prefix = (a: unknown[]) => a.length >= base.length && base.every((x,i) => equal(x, a[i]));
    if (prefix(local) && prefix(remote)) return [...base, ...remote.slice(base.length), ...local.slice(base.length).filter(x => !remote.slice(base.length).some(y => equal(x,y)))] as T;
    const suffix = (a: unknown[]) => a.length >= base.length && base.every((x,i) => equal(x, a[a.length-base.length+i]));
    if (suffix(local) && suffix(remote)) {
      const remoteNew = remote.slice(0,remote.length-base.length);
      return [...local.slice(0,local.length-base.length).filter(x=>!remoteNew.some(y=>equal(x,y))),...remoteNew,...base] as T;
    }
  }
  if (base && local && remote && !Array.isArray(local) && typeof base === 'object' && typeof local === 'object' && typeof remote === 'object') {
    if (path.includes('.procedures[') && !path.slice(path.indexOf('.procedures[') + 12).includes('.')) throw new Error(`Conflicting same-row revision at ${path}`);
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      // Identity and navigation are session-local, not shared business edits.
      result[key] = !path && ['currentUserId','currentRole','currentPerson','selectedEngagement'].includes(key) ? (local as any)[key] : mergeIndependentEdits((base as any)[key], (local as any)[key], (remote as any)[key], `${path}.${key}`);
    }
    return result as T;
  }
  throw new Error(`Conflicting same-row revision at ${path}; reload or preserve the local draft.`);
}
