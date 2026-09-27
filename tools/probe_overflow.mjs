// Development probe: reports the widest offending element on a route at a given
// viewport, so a page-level horizontal overflow can be traced to its source.
// Usage: node tools/probe_overflow.mjs <route> <width> [height]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const route = process.argv[2] || 'proposals';
const width = Number(process.argv[3] || 1024);
const height = Number(process.argv[4] || 900);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' };
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(dist, urlPath === '/' ? 'index.html' : urlPath.slice(1));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const chromePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(existsSync);
const profileDir = mkdtempSync(join(tmpdir(), 'overflow-probe-'));
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });

const activePortPath = join(profileDir, 'DevToolsActivePort');
let debugPort;
for (let i = 0; i < 100 && !debugPort; i++) {
  try {
    const candidate = readFileSync(activePortPath, 'utf8').trim().split(/\r?\n/, 1)[0];
    if (/^\d+$/.test(candidate)) debugPort = candidate;
  } catch {}
  if (!debugPort) await new Promise(r => setTimeout(r, 100));
}

const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (message.id) pending.get(message.id)?.(message); if (message.id) pending.delete(message.id); });
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, message => message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

await command('Page.enable');
await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 500 });
await command('Page.navigate', { url: `${baseUrl}/#overview` });
await new Promise(r => setTimeout(r, 1500));
await evaluate(`location.hash = '#${route}'`);
await new Promise(r => setTimeout(r, 1200));

const report = await evaluate(`(() => {
  const docWidth = document.documentElement.scrollWidth;
  const offenders = [];
  const viewport = window.innerWidth;
  for (const element of document.querySelectorAll('#app-root *')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const right = rect.right + window.scrollX;
    if (right > viewport + 1 || rect.width > viewport + 1) {
      const style = getComputedStyle(element);
      offenders.push({
        tag: element.tagName.toLowerCase(),
        cls: (element.className || '').toString().slice(0, 90),
        id: element.id || undefined,
        width: Math.round(rect.width),
        right: Math.round(right),
        display: style.display,
        overflowX: style.overflowX,
        text: (element.innerText || '').replace(/\\s+/g, ' ').slice(0, 70)
      });
    }
  }
  offenders.sort((a, b) => b.right - a.right);
  return { viewport, docWidth, bodyScroll: document.body.scrollWidth, count: offenders.length, top: offenders.slice(0, 14) };
})()`);

console.log(JSON.stringify(report, null, 2));
ws.close();
chrome.kill('SIGTERM');
await new Promise(r => setTimeout(r, 300));
rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
server.close();
process.exit(0);
