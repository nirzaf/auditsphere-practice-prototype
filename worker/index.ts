const LIMIT = 750_000;
const TTL = 7 * 24 * 60 * 60;

export function validateSnapshot(state: unknown, schema: number): state is Record<string, unknown> {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const value = state as Record<string, unknown>;
  return value.schema === schema && ['clients', 'contacts', 'engagements', 'users', 'roleGrants', 'proposals', 'leads', 'documents', 'events'].every(key => Array.isArray(value[key])) && typeof value.currentUserId === 'string';
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('CONTENT_TYPE');
  if (Number(request.headers.get('content-length')) > LIMIT) throw new Error('TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_JSON');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMIT) { await reader.cancel(); throw new Error('TOO_LARGE'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(all));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',');
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin && allowed.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' });
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url), now = Math.floor(Date.now() / 1000);
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT 1').first();
        return json({ ok: true, storage: 'D1', mode: 'synthetic-demo', retentionDays: 7 });
      }
      if (url.pathname === '/seeds' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id,title,description FROM demo_seeds ORDER BY id').all();
        return json({ seeds: result.results });
      }
      if (url.pathname === '/workspaces' && request.method === 'POST') {
        const body = await readBody(request) as { seedId?: string } | null;
        if (!body || typeof body.seedId !== 'string') return json({ error: 'Choose an available seed.' }, 400);
        const seed = await env.DB.prepare('SELECT state_json FROM demo_seeds WHERE id=?').bind(body.seedId).first<{ state_json: string }>();
        if (!seed) return json({ error: 'Choose an available seed.' }, 400);
        const state = JSON.parse(seed.state_json);
        state.asOfDate = new Date().toISOString().slice(0, 10);
        const id = crypto.randomUUID(), token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
        const creator = await digest(request.headers.get('CF-Connecting-IP') || 'local-demo');
        const result = await env.DB.prepare(`INSERT INTO demo_workspaces(id,token_hash,creator_hash,seed_id,state_json,created_at,updated_at,expires_at)
          SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM demo_workspaces WHERE expires_at>?)<500
          AND COALESCE((SELECT creations FROM demo_creation_limits WHERE creator_hash=? AND window_start=?),0)<10`)
          .bind(id, await digest(token), creator, body.seedId, JSON.stringify(state), now, now, now + TTL, now, creator, Math.floor(now / 3600)).run();
        if (!result.meta.changes) return json({ error: 'Demo creation limit reached. Resume an existing workspace or try later.' }, 429);
        return json({ id, token, revision: 1, state, expiresAt: now + TTL }, 201);
      }
      const match = /^\/workspaces\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (!match) return json({ error: 'Not found.' }, 404);
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Demo access code required.' }, 401);
      const hash = await digest(token), id = match[1];
      const workspace = await env.DB.prepare('SELECT state_json,revision,expires_at FROM demo_workspaces WHERE id=? AND token_hash=? AND expires_at>?').bind(id, hash, now).first<{ state_json: string; revision: number; expires_at: number }>();
      if (!workspace) return json({ error: 'Workspace not found or expired.' }, 404);
      if (request.method === 'GET') return json({ id, revision: workspace.revision, state: JSON.parse(workspace.state_json), expiresAt: workspace.expires_at });
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM demo_workspaces WHERE id=? AND token_hash=?').bind(id, hash).run();
        return json({ deleted: true });
      }
      if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
      const body = await readBody(request) as { revision?: number; state?: unknown } | null;
      if (!body || !Number.isInteger(body.revision) || !validateSnapshot(body.state, JSON.parse(workspace.state_json).schema)) return json({ error: 'Invalid demo snapshot or schema.' }, 422);
      const result = await env.DB.prepare('UPDATE demo_workspaces SET state_json=?,revision=revision+1,updated_at=? WHERE id=? AND token_hash=? AND revision=? AND expires_at>?').bind(JSON.stringify(body.state), now, id, hash, body.revision, now).run();
      if (!result.meta.changes) return json({ error: 'Another browser saved a newer revision. Reload before continuing.', revision: workspace.revision }, 409);
      return json({ revision: body.revision! + 1, updatedAt: now });
    } catch (error) {
      if (error instanceof Error && error.message === 'TOO_LARGE') return json({ error: 'Demo snapshot exceeds 750 KB. Download a local backup.' }, 413);
      if (error instanceof SyntaxError || error instanceof Error && ['CONTENT_TYPE', 'INVALID_JSON'].includes(error.message)) return json({ error: 'Send a valid JSON request.' }, 400);
      console.error('Demo API request failed', { path: url.pathname, method: request.method });
      return json({ error: 'Demo storage is temporarily unavailable.' }, 503);
    }
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await env.DB.prepare('DELETE FROM demo_workspaces WHERE expires_at<=?').bind(Math.floor(Date.now() / 1000)).run();
    await env.DB.prepare('DELETE FROM demo_creation_limits WHERE window_start<?').bind(Math.floor(Date.now() / 3600000) - 24).run();
  }
};
