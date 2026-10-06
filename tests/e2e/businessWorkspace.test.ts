import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpTab } from '../helpers/cdp.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';

let server: BusinessE2eServer | undefined;
let chrome: ChildProcess | undefined;
let profileDirectory = '';
let browserPort = '';
let tab: CdpTab | undefined;
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function chromeExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    ...(process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ] : [
      '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
    ])
  ];
  return candidates.find(path => path && existsSync(path));
}

async function waitFor(label: string, predicate: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tab!.evaluate<boolean>(predicate)) return;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}. Current page text: ${await tab!.evaluate<string>('document.body.innerText')}`);
}

async function fillFields(values: Record<string, string>): Promise<void> {
  const result = await tab!.evaluate<{ missing: string[]; values: Record<string, string>; valid: boolean }>(`(() => {
    const values = ${JSON.stringify(values)};
    const missing = [];
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id);
      if (!element) { missing.push(id); continue; }
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (!(element instanceof HTMLSelectElement)) element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const form = Object.values(values).length ? document.getElementById(Object.keys(values)[0])?.closest('form') : null;
    return { missing, values: Object.fromEntries(Object.keys(values).map(id => [id, document.getElementById(id)?.value ?? ''])), valid: form?.checkValidity() ?? false };
  })()`);
  assert.deepEqual(result.missing, [], 'the expected visible form controls exist');
  for (const [id, value] of Object.entries(values)) assert.equal(result.values[id], value, `${id} accepted its new value`);
  assert.equal(result.valid, true, 'required fields and native validation pass before submit');
}

async function clickButton(label: string): Promise<void> {
  const clicked = await tab!.evaluate<boolean>(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `visible enabled button "${label}" was available`);
}

async function chooseOption(selectId: string, predicate: string): Promise<string> {
  const selected = await tab!.evaluate<string>(`(() => {
    const control = document.getElementById(${JSON.stringify(selectId)});
    if (!(control instanceof HTMLSelectElement)) return '';
    const option = [...control.options].find(item => ${predicate});
    if (!option) return '';
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(control, option.value);
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  })()`);
  assert.ok(selected, `a matching option was available in #${selectId}`);
  return selected;
}

before(async () => {
  server = await startBusinessE2eServer();
  const executable = chromeExecutable();
  assert.ok(executable, 'Chrome or Edge is available for the browser acceptance journey.');
  profileDirectory = mkdtempSync(join(tmpdir(), 'auditsphere-business-e2e-'));
  chrome = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1440,900',
    '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profileDirectory}`,
    '--no-first-run', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { browserPort = readFileSync(join(profileDirectory, 'DevToolsActivePort'), 'utf8').split('\n')[0]; }
    catch { /* Chrome has not written its port file yet. */ }
    if (browserPort) break;
    await sleep(100);
  }
  assert.ok(browserPort, 'Chrome exposes its DevTools port.');
  const target = await fetch(`http://127.0.0.1:${browserPort}/json/new?${server.origin}`, { method: 'PUT' }).then(response => response.json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('The business E2E browser could not connect over CDP.')), { once: true });
  });
  tab = new CdpTab(socket, server.origin);
  await tab.command('Runtime.enable');
  await tab.command('Page.enable');
  await tab.command('Network.enable');
  await tab.blockExternalHttp();
  await tab.command('Page.navigate', { url: server.origin });
  await waitFor('the production workspace landing screen', `document.querySelector('#production-workspace-heading')?.innerText === 'Open your business workspace'`);
}, { timeout: 45000 });

after(async () => {
  tab?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise<void>(resolve => chrome!.once('exit', () => resolve()));
    chrome.kill('SIGTERM');
    await exited;
  }
  if (server) await server.close();
  if (profileDirectory) rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

it('US-SYS-001/002/005 creates a real workspace, assigns all personas, persists UI records, and fails closed offline', { timeout: 90000 }, async () => {
  assert.ok(tab && server);

  // Observe: the production shell is ready, with no workspace preference or local business fixture.
  const landing = await tab.evaluate<{ heading: string; buttons: string[]; preference: string | null }>(`({
    heading: document.querySelector('#production-workspace-heading')?.textContent?.trim() ?? '',
    buttons: [...document.querySelectorAll('button')].map(button => button.innerText.trim()),
    preference: localStorage.getItem('auditsphere.business-context.v1')
  })`);
  assert.equal(landing.heading, 'Open your business workspace');
  assert.ok(landing.buttons.includes('Create or connect workspace'));
  assert.equal(landing.preference, null, 'the isolated browser starts without business context');

  // Plan/Act/Verify: the setup action should open the required real Partner form.
  await clickButton('Create or connect workspace');
  await waitFor('the workspace setup form', `document.querySelector('#business-partner-email') !== null`);
  const emptyForm = await tab.evaluate<{ required: number; blank: boolean; defaults: string[] }>(`(() => {
    const form = document.querySelector('.business-setup-dialog form');
    return {
      required: form?.querySelectorAll('[required]').length ?? 0,
      blank: [...(form?.querySelectorAll('input[required]') ?? [])].every(input => input.value === ''),
      defaults: [...document.querySelectorAll('.business-static-fields strong')].map(item => item.textContent?.trim() ?? '')
    };
  })()`);
  assert.equal(emptyForm.required, 4);
  assert.equal(emptyForm.blank, true);
  assert.deepEqual(emptyForm.defaults, ['QAR', 'Asia/Qatar']);

  const unique = Date.now();
  await fillFields({
    'business-workspace-name': `QA Workspace ${unique}`,
    'business-partner-name': 'QA Partner',
    'business-partner-key': `QA-PARTNER-${unique}`,
    'business-partner-email': 'partner.qa@example.invalid'
  });
  await clickButton('Create business workspace');
  await waitFor('the database-backed workspace console', `document.querySelector('#business-workspace-heading')?.innerText === ${JSON.stringify(`QA Workspace ${unique}`)}`);
  await waitFor('the initial APPROVER context and empty client state', `document.querySelector('#business-active-persona')?.selectedOptions[0]?.textContent?.includes('APPROVER') && document.body.innerText.includes('No clients are registered.')`);
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('.business-console-alert') === null`), true);

  const createClient = async (suffix: string) => {
    await fillFields({
      'business-client-code': `QA-${suffix}-${unique}`,
      'business-client-name': `QA ${suffix} Services LLC`,
      'business-client-type': 'STANDALONE',
      'business-client-industry': 'Professional services',
      'business-client-address': 'Doha, Qatar',
      'business-primary-contact-name': `Finance ${suffix}`,
      'business-primary-contact-email': `finance.${suffix.toLowerCase()}@example.invalid`,
      'business-primary-contact-role': 'CFO_FINANCE_DIRECTOR'
    });
    await clickButton('Create client');
    await waitFor(`saved client ${suffix}`, `document.querySelector('.business-client-list')?.innerText.includes(${JSON.stringify(`QA ${suffix} Services LLC`)})`);
  };

  await createClient('ALPHA');
  await createClient('BETA');

  const alphaId = await chooseOption('business-selected-client', `item.textContent?.includes(${JSON.stringify(`QA-ALPHA-${unique}`)})`);
  await waitFor('Alpha contact details to load', `document.querySelector('#business-client-profile-contact')?.innerText.includes('Finance ALPHA')`);
  const alphaContactId = await chooseOption('business-client-profile-contact', `item.textContent?.includes('Finance ALPHA')`);
  await clickButton('Add CLIENT profile');
  await waitFor('a new CLIENT profile in the selector', `([...document.querySelectorAll('#business-active-persona option')].some(option => option.textContent?.includes('CLIENT · Finance ALPHA')))`);

  const addStaffProfile = async (displayName: string, persona: 'PREPARER' | 'REVIEWER', grade: 'ASSOCIATE' | 'MANAGER') => {
    await fillFields({
      'business-staff-name': displayName,
      'business-staff-person-key': `QA-${persona}-${unique}`,
      'business-staff-email': `${persona.toLowerCase()}.${unique}@example.invalid`,
      'business-staff-grade': grade,
      'business-staff-persona': persona
    });
    await clickButton(`Add ${persona.toLowerCase()} profile`);
    await waitFor(`${persona} profile in the selector`, `([...document.querySelectorAll('#business-active-persona option')].some(option => option.textContent?.includes(${JSON.stringify(`${persona} · ${displayName}`)})))`);
  };
  await addStaffProfile('QA Reviewer', 'REVIEWER', 'MANAGER');
  await addStaffProfile('QA Preparer', 'PREPARER', 'ASSOCIATE');

  const personaInventory = await tab.evaluate<string[]>(`[...document.querySelectorAll('#business-active-persona option')].filter(option => option.value).map(option => option.textContent?.split(' · ')[0] ?? '').filter(Boolean)`);
  assert.deepEqual(new Set(personaInventory), new Set(['APPROVER', 'CLIENT', 'PREPARER', 'REVIEWER']));

  // A CLIENT profile can see its own client only and never gets the staff directory form.
  await chooseOption('business-active-persona', `item.textContent?.includes('CLIENT · Finance ALPHA')`);
  await waitFor('CLIENT-scoped Alpha records', `document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') && document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC')`);
  const clientProjection = await tab.evaluate<{ rows: string[]; staffDirectoryVisible: boolean; betaVisible: boolean }>(`({
    rows: [...(document.querySelectorAll('.business-client-list li') ?? [])].map(item => item.innerText),
    staffDirectoryVisible: !!document.querySelector('#business-directory-heading'),
    betaVisible: document.body.innerText.includes('QA BETA Services LLC')
  })`);
  assert.equal(clientProjection.rows.length, 1);
  assert.equal(clientProjection.staffDirectoryVisible, false);
  assert.equal(clientProjection.betaVisible, false);

  // Persona selection and business records survive a browser reload through local preference + Worker DB.
  await tab.command('Page.reload');
  await waitFor('the selected CLIENT profile after reload', `document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') && document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC')`);
  const preference = await tab.evaluate<{ workspaceId: string; actorId: string; persona: string; clientId: string }>(`JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}')`);
  assert.equal(preference.persona, 'CLIENT');
  assert.equal(preference.clientId, alphaId);
  assert.ok(preference.workspaceId && preference.actorId);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 2);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 2);
  assert.equal(server.db.prepare("SELECT COUNT(*) AS count FROM actor_profiles WHERE workspace_id=? AND persona IN ('APPROVER','CLIENT','PREPARER','REVIEWER') AND active=1").bind(preference.workspaceId).first<{ count: number }>()?.count, 4);
  assert.equal(server.db.prepare('SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=?').bind(preference.workspaceId, preference.actorId).first<{ contact_id: string }>()?.contact_id, alphaContactId);

  // Backend failure is visible and retryable; no browser/demo records appear while offline.
  server.setApiAvailable(false);
  await tab.command('Page.reload');
  await waitFor('the retryable unavailable state', `document.querySelector('[role="alert"]')?.innerText.includes('Business workspace is unavailable')`);
  const offline = await tab.evaluate<{ retry: boolean; clientRows: number; storedPreference: boolean }>(`({
    retry: [...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Retry' && !button.disabled),
    clientRows: document.querySelectorAll('.business-client-list li').length,
    storedPreference: !!localStorage.getItem('auditsphere.business-context.v1')
  })`);
  assert.equal(offline.retry, true);
  assert.equal(offline.clientRows, 0);
  assert.equal(offline.storedPreference, true);
  server.setApiAvailable(true);
  await clickButton('Retry');
  await waitFor('successful recovery without recreating records', `document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC') && !document.querySelector('[role="alert"]')`);

  assert.ok(tab.requests.some(url => new URL(url).pathname === '/api/workspaces'), 'the browser used the real Worker bootstrap endpoint');
  assert.ok(tab.requests.some(url => new URL(url).pathname.endsWith('/commands')), 'directory and commercial writes used the command API');
  assert.equal(tab.blockedExternalRequests.length, 0, 'the journey made no external HTTP requests');
  assert.deepEqual(tab.exceptions, [], 'the production browser journey raised no uncaught JavaScript exceptions');
});
