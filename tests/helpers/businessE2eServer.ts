import { createServer, type IncomingMessage } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from './sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const builtAssets = resolve(repositoryRoot, 'dist');

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css': return 'text/css; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.ico': return 'image/x-icon';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': case '.map': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Uint8Array(Buffer.concat(chunks));
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  const hopByHop = new Set(['connection', 'content-length', 'host', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
  for (const [name, value] of Object.entries(request.headers)) {
    if (hopByHop.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (typeof value === 'string') headers.set(name, value);
  }
  return headers;
}

export interface BusinessE2eServer {
  origin: string;
  db: SqliteD1;
  setApiAvailable(available: boolean): void;
  close(): Promise<void>;
}

/** Serves the production Vite bundle and the real Worker handlers on one local origin. */
export async function startBusinessE2eServer(): Promise<BusinessE2eServer> {
  if (!existsSync(join(builtAssets, 'index.html'))) throw new Error('Build the production app before starting the business E2E server.');

  const db = new SqliteD1();
  db.migrate(repositoryRoot);
  const objects = new Map<string, Uint8Array>();
  let apiAvailable = true;
  const files = {
    async put(key: string, body: BodyInit) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, bytes);
      return { key, size: bytes.length, etag: 'e2e-etag', httpEtag: 'e2e-etag', uploaded: new Date() };
    },
    async get(key: string) {
      const stored = objects.get(key);
      if (!stored) return null;
      const bytes = stored.slice();
      return {
        key, size: bytes.length, etag: 'e2e-etag', httpEtag: 'e2e-etag', uploaded: new Date(),
        body: new Response(bytes).body,
        arrayBuffer: async () => bytes.slice().buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
        httpMetadata: {}, customMetadata: {}
      };
    },
    async head(key: string) {
      const bytes = objects.get(key);
      return bytes ? { key, size: bytes.length, etag: 'e2e-etag', httpEtag: 'e2e-etag', uploaded: new Date(), httpMetadata: {}, customMetadata: {} } : null;
    },
    async delete(key: string) { objects.delete(key); }
  } as any;
  const env = {
    DB: db,
    FILES: files,
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
    BUSINESS_SETUP_ENABLED: 'true'
  } as any;

  const server = createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host ?? '127.0.0.1';
      const url = new URL(incoming.url ?? '/', `http://${host}`);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        if (!apiAvailable) {
          const requestId = crypto.randomUUID();
          outgoing.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
          outgoing.end(JSON.stringify({ code: 'UNAVAILABLE', message: 'Business workspace is unavailable. Check the connection and retry.', requestId }));
          return;
        }

        const method = incoming.method ?? 'GET';
        const init: RequestInit = { method, headers: requestHeaders(incoming) };
        if (!['GET', 'HEAD'].includes(method)) init.body = await readRequestBody(incoming);
        const response = await worker.fetch(new Request(url, init), env, {} as any);
        const responseHeaders = Object.fromEntries(response.headers.entries());
        outgoing.writeHead(response.status, responseHeaders);
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }

      let relativePath: string;
      try { relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
      catch {
        outgoing.writeHead(400).end('Invalid path.');
        return;
      }
      const candidate = resolve(builtAssets, relativePath || 'index.html');
      const insideBuild = candidate === builtAssets || candidate.startsWith(`${builtAssets}${sep}`);
      const assetPath = insideBuild && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate : join(builtAssets, 'index.html');
      outgoing.writeHead(200, { 'Content-Type': contentType(assetPath), 'Cache-Control': 'no-store' });
      outgoing.end(readFileSync(assetPath));
    } catch (error) {
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      outgoing.end(error instanceof Error ? error.message : 'Local business E2E server failed.');
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The local business E2E server did not bind a TCP port.');
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    db,
    setApiAvailable(available) { apiAvailable = available; },
    async close() {
      db.close();
      await new Promise<void>((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()));
    }
  };
}
