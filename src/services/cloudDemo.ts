import { prototypeStore } from '../store/prototypeStore';

const API = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_DEMO_API_URL?.replace(/\/$/, '') || '';
const KEY = 'ste-auditsphere-cloud-demo-v1';
type Connection = { id: string; token: string; revision: number; expiresAt: number };
type Workspace = Connection & { state: unknown };
export type CloudDemoStatus = { mode: 'local' | 'loading' | 'saved' | 'saving' | 'offline' | 'conflict'; message: string; revision?: number };
let connection: Connection | null = null;
let status: CloudDemoStatus = { mode: 'local', message: 'Local demo' };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let saving = false, applying = false, initialized = false;

function publish(next: CloudDemoStatus) { status = next; listeners.forEach(listener => listener()); }
export const cloudDemoConfigured = () => Boolean(API);
export const cloudDemoSnapshot = () => status;
export function subscribeCloudDemo(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function remember() { if (connection) localStorage.setItem(KEY, JSON.stringify(connection)); }
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(API + path, { ...options, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', ...(connection ? { Authorization: `Bearer ${connection.token}` } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Cloud demo request failed.'), { status: response.status });
  return body;
}
export async function cloudDemoSeeds(): Promise<Array<{ id: string; title: string; description: string }>> {
  return (await request('/seeds')).seeds;
}
function apply(workspace: Workspace) {
  applying = true;
  try { prototypeStore.importStateJSON(JSON.stringify(workspace.state)); }
  finally { applying = false; }
  connection = { id: workspace.id, token: workspace.token || connection!.token, revision: workspace.revision, expiresAt: workspace.expiresAt };
  remember();
  publish({ mode: 'saved', message: 'Cloud demo saved', revision: connection.revision });
}
export async function startCloudDemo(seedId: string) {
  if (saving) throw new Error('Wait for the current cloud save to finish.');
  clearTimeout(timer);
  publish({ mode: 'loading', message: 'Creating synthetic cloud demo…' });
  try { apply(await request('/workspaces', { method: 'POST', body: JSON.stringify({ seedId }) })); }
  catch (error) { publish({ mode: connection ? 'offline' : 'local', message: error instanceof Error ? error.message : 'Could not create cloud demo.' }); throw error; }
}
export async function resumeCloudDemo(code: string) {
  if (saving) throw new Error('Wait for the current cloud save to finish.');
  clearTimeout(timer);
  const [id, token] = code.trim().split('.');
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Enter a valid demo access code.');
  const previous = connection;
  connection = { id, token, revision: 0, expiresAt: 0 };
  publish({ mode: 'loading', message: 'Resuming cloud demo…' });
  try { apply(await request(`/workspaces/${id}`)); }
  catch (error) { connection = previous; publish({ mode: previous ? 'offline' : 'local', message: error instanceof Error ? error.message : 'Could not resume.' }); throw error; }
}
export function cloudDemoAccessCode() { return connection ? `${connection.id}.${connection.token}` : ''; }
export async function reloadCloudDemo() {
  if (!connection || saving) throw new Error('Cloud demo is unavailable or saving.');
  clearTimeout(timer);
  apply(await request(`/workspaces/${connection.id}`));
}
export function disconnectCloudDemo() {
  if (saving) throw new Error('Wait for the current cloud save to finish.');
  clearTimeout(timer); connection = null; localStorage.removeItem(KEY);
  publish({ mode: 'local', message: 'Disconnected; current demo remains local.' });
}
export async function saveCloudDemo() {
  if (!connection || applying || saving || status.mode === 'conflict') return;
  clearTimeout(timer); saving = true;
  const target = connection, payload = prototypeStore.exportStateJSON();
  publish({ mode: 'saving', message: 'Saving cloud demo…', revision: target.revision });
  let succeeded = false;
  try {
    const result = await request(`/workspaces/${target.id}`, { method: 'PUT', body: JSON.stringify({ revision: target.revision, state: JSON.parse(payload) }) });
    target.revision = result.revision; remember(); succeeded = true;
    publish({ mode: 'saved', message: 'Cloud demo saved', revision: target.revision });
  } catch (error) {
    const conflict = (error as { status?: number }).status === 409;
    publish({ mode: conflict ? 'conflict' : 'offline', message: error instanceof Error ? error.message : 'Cloud save unavailable; local work is preserved.', revision: target.revision });
  } finally {
    saving = false;
    if (succeeded && connection === target && prototypeStore.exportStateJSON() !== payload) timer = setTimeout(() => void saveCloudDemo(), 500);
  }
}
export async function initializeCloudDemo() {
  if (initialized || !API) return;
  initialized = true;
  prototypeStore.subscribe(() => {
    if (!connection || applying || status.mode === 'conflict' || status.mode === 'loading') return;
    clearTimeout(timer); timer = setTimeout(() => void saveCloudDemo(), 500);
  });
  try {
    const cached = localStorage.getItem(KEY);
    if (!cached) return;
    const parsed = JSON.parse(cached) as Connection;
    if (!/^[a-f0-9-]{36}$/.test(parsed.id) || !/^[a-f0-9]{64}$/.test(parsed.token) || !Number.isInteger(parsed.revision)) return;
    connection = parsed;
    const remote = await request(`/workspaces/${connection.id}`);
    if (remote.revision !== connection.revision) publish({ mode: 'conflict', message: 'The cloud has a newer revision. Local work is preserved; reload explicitly to use it.', revision: remote.revision });
    else publish({ mode: 'saved', message: 'Cloud demo connected. Local edits will autosave.', revision: connection.revision });
  } catch (error) { publish({ mode: 'offline', message: error instanceof Error ? error.message : 'Cloud unavailable; local demo remains usable.' }); }
}
