import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpTab } from '../helpers/cdp.js';
import { launchHeadlessChrome, stopHeadlessChrome } from '../helpers/headlessChrome.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';
import { authSessionCookie, bootstrapBusinessFixture, setBrowserAuthSession } from '../helpers/authSession.js';

let server: BusinessE2eServer | undefined;
let chrome: ChildProcess | undefined;
let profileDirectory = '';
let browserPort = 0;
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

/** Seeds isolated data outside the public API, then injects a real session as the browser's sign-in fixture. */
async function createAuthenticatedWorkspace(name: string, partnerName = 'QA Partner'):
Promise<{ workspaceId: string; actorProfileId: string }> {
  assert.ok(server && tab);
  const workspace = await bootstrapBusinessFixture(server.db, {
    name, currency: 'QAR', timezone: 'Asia/Qatar',
    initialPartner: {
      displayName: partnerName,
      naturalPersonKey: `QA-${name.replace(/[^A-Za-z0-9]/g, '-').toUpperCase()}`,
      email: `partner.${Date.now()}@example.invalid`
    }
  });
  const { workspaceId, actorProfileId } = workspace;
  await installFirmAdminTestSession(workspaceId, actorProfileId);
  await tab.command('Page.reload');
  await waitFor(`the authenticated workspace ${name}`, `document.querySelector('#business-workspace-heading')?.innerText === ${JSON.stringify(name)} && document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER')`);
  return { workspaceId, actorProfileId };
}

async function installFirmAdminTestSession(workspaceId: string, actorProfileId: string): Promise<void> {
  assert.ok(server && tab);
  await authSessionCookie(server.db, workspaceId, actorProfileId);
  const account = server.db.prepare(`SELECT ua.id,ua.kind FROM user_profile_grants grant_row
    JOIN user_accounts ua ON ua.workspace_id=grant_row.workspace_id AND ua.id=grant_row.user_account_id
    WHERE grant_row.workspace_id=? AND grant_row.actor_profile_id=? AND grant_row.revoked_at IS NULL ORDER BY grant_row.granted_at,grant_row.id LIMIT 1`)
    .bind(workspaceId, actorProfileId).first<{ id: string; kind: string }>();
  assert.ok(account, `a test user account is granted profile ${actorProfileId}`);
  await setBrowserAuthSession(tab, server, workspaceId, actorProfileId);
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
  if (selectId === 'business-active-persona') {
    assert.ok(server && tab);
    const requestedLabel = predicate.match(/includes\(['"](.+?)['"]\)/)?.[1];
    assert.ok(requestedLabel, `the requested session profile label is parseable: ${predicate}`);
    const workspaceName = await tab.evaluate<string>(`document.querySelector('#business-workspace-heading')?.textContent?.trim() ?? ''`);
    const workspaceId = server.db.prepare('SELECT id FROM workspaces WHERE data_mode=? AND name=? ORDER BY created_at DESC LIMIT 1')
      .bind('BUSINESS', workspaceName).first<{ id: string }>()?.id;
    assert.ok(workspaceId, `the active BUSINESS workspace ${workspaceName} exists`);
    const profiles = server.db.prepare(`SELECT ap.id,ap.persona,COALESCE(sm.display_name,c.full_name) AS display_name
      FROM actor_profiles ap LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
      LEFT JOIN contacts c ON c.workspace_id=ap.workspace_id AND c.id=ap.contact_id
      WHERE ap.workspace_id=? AND ap.active=1 ORDER BY ap.created_at,ap.id`).bind(workspaceId).all<{
        id: string; persona: string; display_name: string;
      }>().results;
    const target = profiles.find(profile => `${profile.persona} · ${profile.display_name}`.includes(requestedLabel));
    assert.ok(target, `an active database profile matches ${requestedLabel}`);
    await installFirmAdminTestSession(workspaceId, target.id);
    await tab.command('Page.reload');
    await waitFor(`the session profile ${target.persona} · ${target.display_name}`,
      `document.querySelector('.business-actor-summary')?.innerText.includes(${JSON.stringify(target.persona)}) && document.querySelector('.business-actor-summary')?.innerText.includes(${JSON.stringify(target.display_name)})`);
    return target.id;
  }
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
  const browser = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-business-e2e-', timeoutMs: 45000 });
  chrome = browser.child;
  profileDirectory = browser.profileDirectory;
  browserPort = browser.port;
  const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${server.origin}`, {
    method: 'PUT', signal: AbortSignal.timeout(10000)
  });
  if (!targetResponse.ok) throw new Error(`Chrome could not create the E2E page (HTTP ${targetResponse.status}).`);
  const target = await targetResponse.json() as { webSocketDebuggerUrl?: string };
  if (!target.webSocketDebuggerUrl) throw new Error('Chrome did not provide a DevTools WebSocket URL for the E2E page.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The business E2E browser did not connect over CDP within 10 seconds.')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('The business E2E browser could not connect over CDP.')); }, { once: true });
  });
  tab = new CdpTab(socket, server.origin);
  await tab.command('Runtime.enable');
  await tab.command('Page.enable');
  await tab.command('Network.enable');
  await tab.blockExternalHttp();
  await tab.command('Page.navigate', { url: server.origin });
  await waitFor('the signed-out authentication screen', `document.querySelector('h1')?.innerText === 'Sign in to AuditSphere'`);
  assert.ok(tab.requests.some(url => new URL(url).pathname === '/api/auth/me'), 'the signed-out shell checks authentication first');
  assert.equal(tab.requests.some(url => new URL(url).pathname === '/api/workspaces'), false, 'no business API is called before authentication succeeds');
}, { timeout: 90000 });

after(async () => {
  tab?.close();
  if (chrome) await stopHeadlessChrome(chrome);
  if (server) await server.close();
  if (profileDirectory) {
    let cleanupError: unknown;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        cleanupError = undefined;
        break;
      } catch (reason) {
        cleanupError = reason;
        if (!reason || typeof reason !== 'object' || !['EPERM', 'EBUSY'].includes(String((reason as NodeJS.ErrnoException).code))) throw reason;
        await sleep(250);
      }
    }
    // Windows can retain a transient handle to Chrome's profile after the
    // process tree has exited (for example, from antivirus scanning). The
    // browser scenarios have already closed the profile; do not turn a
    // successful acceptance journey into a failure solely because best-effort
    // temporary-file cleanup is delayed. Keep the path in the warning so a
    // developer can remove it after the handle is released.
    if (cleanupError) console.warn(`Could not remove temporary Chrome profile yet: ${profileDirectory}`, cleanupError);
  }
});

it('US-SYS-001/002/005 authenticates before business data, assigns profiles, persists UI records, and fails closed offline', { timeout: 120000 }, async () => {
  assert.ok(tab && server);

  // Observe: the signed-out auth screen is ready and no business workspace is stored in the browser.
  const landing = await tab.evaluate<{ heading: string; buttons: string[]; preference: string | null }>(`({
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    buttons: [...document.querySelectorAll('button')].map(button => button.innerText.trim()),
    preference: localStorage.getItem('auditsphere.business-context.v1')
  })`);
  assert.equal(landing.heading, 'Sign in to AuditSphere');
  assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('.business-setup-dialog')`), false, 'workspace setup is not exposed to a signed-out user');
  assert.equal(landing.preference, null, 'the isolated browser starts without business context');

  // The shipped Worker exposes the no-auth BUSINESS contract. Legacy demo
  // seed catalog, access-code resume, and snapshot state routes are removed.
  const testOnlyHeaders = { origin: server.origin, 'content-type': 'application/json' };
  const fakeWorkspaceId = '00000000-0000-4000-8000-000000000001';
  const [seedCatalog, seededWorkspace, resume, snapshotState, snapshotEvents, snapshotCommands, snapshotFiles, personaSession, logoutSession] = await Promise.all([
    fetch(`${server.origin}/api/seeds`),
    fetch(`${server.origin}/api/workspaces`, {
      method: 'POST', headers: testOnlyHeaders, body: JSON.stringify({ seedId: 'commercial', name: 'Must not be created' })
    }),
    fetch(`${server.origin}/api/workspaces/resume`, {
      method: 'POST', headers: testOnlyHeaders, body: JSON.stringify({ accessCode: 'legacy.access-code' })
    }),
    fetch(`${server.origin}/api/workspaces/${fakeWorkspaceId}/state`),
    fetch(`${server.origin}/api/workspaces/${fakeWorkspaceId}/events`),
    fetch(`${server.origin}/api/workspaces/${fakeWorkspaceId}/commands`, {
      method: 'POST', headers: testOnlyHeaders, body: JSON.stringify({ command: { type: 'workspace.rename', payload: { name: 'Must not be saved' } } })
    }),
    fetch(`${server.origin}/api/workspaces/${fakeWorkspaceId}/files`),
    fetch(`${server.origin}/api/session/persona`, { method: 'POST', headers: testOnlyHeaders, body: '{}' }),
    fetch(`${server.origin}/api/session/logout`, { method: 'POST', headers: testOnlyHeaders, body: '{}' })
  ]);
  assert.deepEqual([seedCatalog.status, seededWorkspace.status, resume.status, snapshotState.status, snapshotEvents.status,
    snapshotCommands.status, snapshotFiles.status, personaSession.status, logoutSession.status], [404, 404, 400, 404, 404, 401, 401, 404, 404]);

  const unique = Date.now();
  const initialBusinessSession = await createAuthenticatedWorkspace(`QA Workspace ${unique}`);
  await waitFor('the database-backed workspace console', `document.querySelector('#business-workspace-heading')?.innerText === ${JSON.stringify(`QA Workspace ${unique}`)}`);
  await waitFor('the initial APPROVER context and empty client state', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER') && document.body.innerText.includes('No clients are registered.')`);
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
  await waitFor('a new CLIENT profile in the firm directory', `document.querySelector('.business-profile-list')?.innerText.includes('Finance ALPHA') && document.querySelector('.business-profile-list')?.innerText.includes('CLIENT')`);

  const addStaffProfile = async (displayName: string, persona: 'PREPARER' | 'REVIEWER', grade: 'ASSOCIATE' | 'MANAGER') => {
    await fillFields({
      'business-staff-name': displayName,
      'business-staff-person-key': `QA-${persona}-${unique}`,
      'business-staff-email': `${persona.toLowerCase()}.${unique}@example.invalid`,
      'business-staff-grade': grade,
      'business-staff-persona': persona
    });
    await clickButton(`Add ${persona.toLowerCase()} profile`);
    await waitFor(`${persona} profile in the firm directory`, `document.querySelector('.business-profile-list')?.innerText.includes(${JSON.stringify(displayName)}) && document.querySelector('.business-profile-list')?.innerText.includes(${JSON.stringify(persona)})`);
  };
  await addStaffProfile('QA Reviewer', 'REVIEWER', 'MANAGER');
  await addStaffProfile('QA Preparer', 'PREPARER', 'ASSOCIATE');

  const personaInventory = server.db.prepare('SELECT DISTINCT persona FROM actor_profiles WHERE workspace_id=? AND active=1 ORDER BY persona')
    .bind(initialBusinessSession.workspaceId).all<{ persona: string }>().results.map(row => row.persona);
  assert.deepEqual(new Set(personaInventory), new Set(['APPROVER', 'CLIENT', 'PREPARER', 'REVIEWER']));

  // A CLIENT profile can see its own client only and never gets the staff directory form.
  server.setContextResponseDelay(750);
  await chooseOption('business-active-persona', `item.textContent?.includes('CLIENT · Finance ALPHA')`);
  const duringPersonaSwitch = await tab.evaluate<{ selectedClientPersona: boolean; staleInternalDirectoryVisible: boolean; staleOtherClientVisible: boolean }>(`({
    selectedClientPersona: document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') ?? false,
    staleInternalDirectoryVisible: !!document.querySelector('#business-directory-heading'),
    staleOtherClientVisible: document.body.innerText.includes('QA BETA Services LLC')
  })`);
  server.setContextResponseDelay(0);
  assert.equal(duringPersonaSwitch.selectedClientPersona, true, 'the browser selection changes before the delayed context response');
  assert.equal(duringPersonaSwitch.staleInternalDirectoryVisible, false, 'the prior context permissions and cached records are hidden immediately');
  assert.equal(duringPersonaSwitch.staleOtherClientVisible, false, 'the prior broad client list cannot flash under the CLIENT selection');
  await waitFor('CLIENT-scoped Alpha records', `document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') && document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC')`);
  const clientProjection = await tab.evaluate<{ rows: string[]; staffDirectoryVisible: boolean; betaVisible: boolean }>(`({
    rows: [...(document.querySelectorAll('.business-client-list li') ?? [])].map(item => item.innerText),
    staffDirectoryVisible: !!document.querySelector('#business-directory-heading'),
    betaVisible: document.body.innerText.includes('QA BETA Services LLC')
  })`);
  assert.equal(clientProjection.rows.length, 1);
  assert.equal(clientProjection.staffDirectoryVisible, false);
  assert.equal(clientProjection.betaVisible, false);

  // The selected profile comes from the server session; record scope survives reload without an actor in local storage.
  await tab.command('Page.reload');
  await waitFor('the selected CLIENT profile after reload', `document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') && document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC')`);
  const preference = await tab.evaluate<{ workspaceId: string; clientId: string }>(`JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}')`);
  assert.equal(preference.clientId, alphaId);
  assert.equal(preference.workspaceId, initialBusinessSession.workspaceId);
  const authMe = await tab.evaluate<{ activeProfileId: string }>(`fetch('/api/auth/me').then(response => response.json())`);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 2);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 2);
  assert.equal(server.db.prepare("SELECT COUNT(*) AS count FROM actor_profiles WHERE workspace_id=? AND persona IN ('APPROVER','CLIENT','PREPARER','REVIEWER') AND active=1").bind(preference.workspaceId).first<{ count: number }>()?.count, 4);
  assert.equal(server.db.prepare('SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=?').bind(preference.workspaceId, authMe.activeProfileId).first<{ contact_id: string }>()?.contact_id, alphaContactId);

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

  // Observe the restored record workspace, then use the visible directory and route forms.
  await installFirmAdminTestSession(initialBusinessSession.workspaceId, initialBusinessSession.actorProfileId);
  await tab.command('Page.reload');
  await waitFor('the authenticated Partner context after recovery', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER') && document.querySelector('.business-client-list')?.innerText.includes('QA ALPHA Services LLC')`);
  await chooseOption('business-active-persona', `item.textContent?.includes('APPROVER · QA Partner')`);
  await waitFor('the Partner directory with Alpha loaded', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER') && [...document.querySelectorAll('#business-selected-client option')].some(option => option.textContent?.includes('QA ALPHA Services LLC'))`);
  await chooseOption('business-selected-client', `item.textContent?.includes('QA ALPHA Services LLC')`);
  await waitFor('Alpha directory controls', `!!document.querySelector('#business-contact-name') && !!document.querySelector('#business-client-route-purpose')`);
  const routeFormBeforeInput = await tab.evaluate<{ rationaleVisible: boolean; saveDisabled: boolean }>(`({
    rationaleVisible: !!document.querySelector('#business-client-route-rationale'),
    saveDisabled: [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Save recipient route')?.disabled ?? true
  })`);
  assert.equal(routeFormBeforeInput.rationaleVisible, false, 'a primary route without replacement does not ask for alternate rationale');
  assert.equal(routeFormBeforeInput.saveDisabled, true, 'the route form waits for a contact selection');

  await fillFields({
    'business-contact-name': 'QA Finance Alternate',
    'business-contact-title': 'Finance Director',
    'business-contact-role': 'CFO_FINANCE_DIRECTOR',
    'business-contact-email': 'finance.alternate@example.invalid',
    'business-contact-effective-from': '2026-01-01'
  });
  await clickButton('Add contact to client');
  await waitFor('the saved alternate contact', `document.querySelector('.business-record-list')?.innerText.includes('QA Finance Alternate')`);
  await chooseOption('business-client-route-purpose', `item.value === 'INVOICE'`);
  await chooseOption('business-client-route-contact', `item.textContent?.includes('QA Finance Alternate')`);
  await chooseOption('business-client-route-priority', `item.value === 'false'`);
  await waitFor('the required alternate rationale control', `document.querySelector('#business-client-route-rationale')?.required === true`);
  await fillFields({ 'business-client-route-rationale': 'The finance director covers invoice delivery during the CFO absence.' });
  await clickButton('Save recipient route');
  await waitFor('the documented alternate route in the visible list', `document.querySelector('.business-route-list')?.innerText.includes('The finance director covers invoice delivery during the CFO absence.')`);
  const persistedAlternate = server.db.prepare(`SELECT cr.is_primary,cr.rationale FROM contact_routes cr
    JOIN contacts c ON c.workspace_id=cr.workspace_id AND c.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.client_id=? AND cr.purpose='INVOICE' AND c.full_name='QA Finance Alternate'`)
    .bind(preference.workspaceId, alphaId).first<{ is_primary: number; rationale: string | null }>();
  assert.equal(persistedAlternate?.is_primary, 0);
  assert.equal(persistedAlternate?.rationale, 'The finance director covers invoice delivery during the CFO absence.');

  assert.equal(tab.requests.some(url => new URL(url).pathname === '/api/workspaces'), false, 'the browser has no public workspace-bootstrap call');
  assert.ok(tab.requests.some(url => new URL(url).pathname === '/api/auth/me'), 'the app resolves its real authenticated session');
  assert.ok(tab.requests.some(url => new URL(url).pathname.endsWith('/commands')), 'directory and commercial writes used the command API');
  assert.equal(tab.blockedExternalRequests.length, 0, 'the journey made no external HTTP requests');
  assert.deepEqual(tab.exceptions, [], 'the production browser journey raised no uncaught JavaScript exceptions');
});

it('US-ENG-001/002 creates a client-linked lead from the visible forms and advances one real engagement', { timeout: 180000 }, async () => {
  assert.ok(tab && server);
  const unique = Date.now();
  const leadJourney = await createAuthenticatedWorkspace(`Lead Journey ${unique}`, 'QA Lead Partner');
  await waitFor('the empty new workspace', `document.querySelector('#business-workspace-heading')?.textContent === ${JSON.stringify(`Lead Journey ${unique}`)} && document.body.innerText.includes('No clients are registered.')`);
  const preference = await tab.evaluate<{ workspaceId: string }>(`JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}')`);
  assert.equal(preference.workspaceId, leadJourney.workspaceId);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 0);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM leads WHERE workspace_id=?').bind(preference.workspaceId).first<{ count: number }>()?.count, 0);

  await fillFields({
    'business-standards-name': `QA Approved Standards ${unique}`,
    'business-standards-start': '2026-01-01',
    'business-isa220': 'ISA 220 (Revised), approved test profile',
    'business-isa570': 'ISA 570 (Revised 2024), approved test profile',
    'business-reporting-framework': 'Approved synthetic test framework'
  });
  await clickButton('Approve standards profile');
  await waitFor('the immutable standards profile', `document.body.innerText.includes(${JSON.stringify(`QA Approved Standards ${unique}`)})`);

  await fillFields({
    'business-staff-name': 'QA Lead Preparer',
    'business-staff-person-key': `QA-LEAD-PREPARER-${unique}`,
    'business-staff-email': `qa.lead.${unique}@example.invalid`,
    'business-staff-grade': 'ASSOCIATE',
    'business-staff-persona': 'PREPARER'
  });
  await clickButton('Add preparer profile');
  await waitFor('the new PREPARER profile', `document.querySelector('.business-profile-list')?.innerText.includes('QA Lead Preparer')`);
  await chooseOption('business-active-persona', `item.textContent?.includes('PREPARER · QA Lead Preparer')`);
  await waitFor('the PREPARER context', `document.querySelector('.business-actor-summary')?.innerText.includes('PREPARER')`);
  await waitFor('the PREPARER lead intake form', `document.getElementById('business-lead-client-code')?.getClientRects().length > 0`);

  // Record one new-client referral with a real contact, service and period.
  await fillFields({
    'business-lead-client-code': `QA-LEAD-${unique}`,
    'business-lead-client-name': `QA Lead Client ${unique} WLL`,
    'business-lead-industry': 'Professional services',
    'business-lead-address': 'Doha, Qatar',
    'business-lead-contact-name': 'QA Finance Contact',
    'business-lead-contact-email': `finance.${unique}@example.invalid`,
    'business-lead-contact-phone': '',
    'business-lead-contact-title': 'Finance Director',
    'business-lead-contact-role': 'CFO_FINANCE_DIRECTOR',
    'business-lead-source': 'REFERRAL',
    'business-lead-service': 'STATUTORY_AUDIT',
    'business-lead-period-start': '2026-01-01',
    'business-lead-period-end': '2026-12-31',
    'business-lead-fee': '10000000'
  });
  await clickButton('Record lead');
  await waitFor('the linked lead and client', `document.querySelector('.business-lead-list')?.innerText.includes(${JSON.stringify(`QA Lead Client ${unique} WLL`)}) && document.querySelector('.business-client-list')?.innerText.includes(${JSON.stringify(`QA Lead Client ${unique} WLL`)})`);

  const leadIds = await tab.evaluate<string[]>(`[...document.querySelectorAll('.business-lead-list input[id^="business-engagement-code-"]')].map(input => input.id)`);
  assert.equal(leadIds.length, 1, 'one open lead has one conversion control');
  const conversionInputReady = await tab.evaluate<boolean>(`(() => {
    const input = document.getElementById(${JSON.stringify(leadIds[0])});
    return input instanceof HTMLInputElement && input.required && !input.disabled && Boolean(input.getClientRects().length);
  })()`);
  assert.equal(conversionInputReady, true, 'the visible conversion code field is required and editable');
  const conversionCodeAccepted = await tab.evaluate<boolean>(`(() => {
    const input = document.getElementById(${JSON.stringify(leadIds[0])});
    if (!(input instanceof HTMLInputElement)) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(`QA-ENG-${unique}`)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(`QA-ENG-${unique}`)} && input.checkValidity();
  })()`);
  assert.equal(conversionCodeAccepted, true, 'the required engagement code passes native field validation');
  await clickButton('Convert to engagement');
  await waitFor('one linked LEAD_INGESTION engagement', `document.querySelector('.business-created-engagement')?.innerText.includes('Current state: LEAD_INGESTION')`);
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('.business-created-engagement')?.innerText.includes('Current state: PROPOSAL_GENERATION') ?? false`), false);
  await waitFor('the server-projected lead-ingestion stage', `document.querySelector('.business-workflow-state')?.innerText.includes('LEAD INGESTION') && [...(document.querySelector('#business-workflow-engagement')?.options ?? [])].some(option => option.textContent?.includes(${JSON.stringify(`QA-ENG-${unique}`)}))`);
  const leadStage = await tab.evaluate<{ state: string; current: string; request: boolean }>(`({
    state: document.querySelector('.business-workflow-state')?.innerText ?? '',
    current: document.querySelector('.business-workflow-stages > li[data-status="current"] strong')?.textContent?.trim() ?? '',
    request: performance.getEntriesByType('resource').some(entry => entry.name.includes('/engagements/') && entry.name.endsWith('/workflow'))
  })`);
  assert.match(leadStage.state, /LEAD INGESTION/);
  assert.equal(leadStage.current, 'Lead ingestion');
  assert.equal(leadStage.request, true, 'the workflow strip loaded from the server endpoint');
  const leadReadiness = await tab.evaluate<{ status: string; blockerCount: number }>(`(() => {
    const stage = [...(document.querySelectorAll('.business-workflow-stages > li') ?? [])]
      .find(item => item.querySelector('strong')?.textContent?.trim() === 'Lead ingestion');
    return { status: stage?.getAttribute('data-status') ?? '', blockerCount: stage?.querySelectorAll('.business-workflow-blockers li').length ?? 0 };
  })()`);
  assert.deepEqual(leadReadiness, { status: 'current', blockerCount: 0 }, 'the active converted lead and contact have an evaluated, clear intake gate');

  // Advance through the actual profile gate and verify the persisted lifecycle projection.
  await clickButton('Validate profile and enter proposal generation');
  await waitFor('the proposal-generation handoff', `document.querySelector('.business-created-engagement')?.innerText.includes('Current state: PROPOSAL_GENERATION')`);
  await waitFor('the refreshed blocked proposal-generation stage', `document.querySelector('.business-workflow-state')?.innerText.includes('PROPOSAL GENERATION') &&
    document.querySelector('.business-workflow-stages > li[data-status="completed"] strong')?.textContent?.trim() === 'Lead ingestion' &&
    [...document.querySelectorAll('.business-workflow-stages > li[data-status="blocked"]')].some(stage =>
      stage.querySelector('strong')?.textContent?.trim() === 'Proposal generation' && stage.innerText.includes('Create a current proposal revision for this engagement.'))`);
  const proposalReadiness = await tab.evaluate<{ status: string; blockers: string[] }>(`(() => {
    const stage = [...(document.querySelectorAll('.business-workflow-stages > li') ?? [])]
      .find(item => item.querySelector('strong')?.textContent?.trim() === 'Proposal generation');
    return { status: stage?.getAttribute('data-status') ?? '', blockers: [...(stage?.querySelectorAll('.business-workflow-blockers li') ?? [])].map(item => item.innerText.trim()) };
  })()`);
  assert.deepEqual(proposalReadiness, { status: 'blocked', blockers: ['Create a current proposal revision for this engagement.\nResolve in proposals'] });
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  try {
    await waitFor('the mobile workflow projection', `document.querySelector('.business-workflow-card')?.getClientRects().length === 1 && getComputedStyle(document.querySelector('.business-workflow-stages')).gridTemplateColumns.trim().split(/\\s+/).length === 1`);
    const mobileWorkflow = await tab.evaluate<{ width: number; right: number; viewport: number; columns: number }>(`(() => {
      const card = document.querySelector('.business-workflow-card')?.getBoundingClientRect();
      const stages = document.querySelector('.business-workflow-stages');
      return { width: card?.width ?? 0, right: card?.right ?? Infinity, viewport: window.innerWidth,
        columns: getComputedStyle(stages).gridTemplateColumns.trim().split(/\\s+/).length };
    })()`);
    assert.ok(mobileWorkflow.width > 0 && mobileWorkflow.width <= mobileWorkflow.viewport);
    assert.ok(mobileWorkflow.right <= mobileWorkflow.viewport + 1);
    assert.equal(mobileWorkflow.columns, 1, 'the lifecycle stages become a single readable column on mobile');
  } finally {
    await tab.command('Emulation.clearDeviceMetricsOverride');
  }
  await tab.command('Page.reload');
  await waitFor('the reloaded lead and proposal-ready engagement', `document.querySelector('.business-lead-list')?.innerText.includes('CONVERTED') && [...(document.querySelector('#business-proposal-engagement')?.options ?? [])].some(option => option.textContent?.includes(${JSON.stringify(`QA-ENG-${unique}`)}))`);

  const persisted = server.db.prepare(`SELECT l.id AS lead_id,l.status,l.converted_engagement_id,e.lifecycle_state,e.code,
      (SELECT COUNT(*) FROM leads duplicate WHERE duplicate.workspace_id=l.workspace_id AND duplicate.converted_engagement_id=e.id) AS linked_leads
    FROM leads l JOIN engagements e ON e.workspace_id=l.workspace_id AND e.id=l.converted_engagement_id
    WHERE l.workspace_id=? AND e.code=?`).bind(preference.workspaceId, `QA-ENG-${unique}`).first<any>();
  assert.ok(persisted);
  assert.deepEqual({ ...persisted }, {
    lead_id: persisted.lead_id,
    status: 'CONVERTED',
    converted_engagement_id: persisted.converted_engagement_id,
    lifecycle_state: 'PROPOSAL_GENERATION',
    code: `QA-ENG-${unique}`,
    linked_leads: 1
  });
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM engagements WHERE workspace_id=? AND code=?').bind(preference.workspaceId, `QA-ENG-${unique}`).first<{ count: number }>()?.count, 1);

  // US-ENG-001 / US-ENG-007: PBC request creation must use a visible,
  // purpose-specific route to an active Chief Accountant / Audit Liaison.
  await chooseOption('business-active-persona', `item.textContent?.includes('APPROVER · QA Lead Partner')`);
  await waitFor('the approver context', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER')`);
  await waitFor('the new client in the selected-client context', `[...(document.querySelector('#business-selected-client')?.options ?? [])].some(option => option.textContent?.includes(${JSON.stringify(`QA Lead Client ${unique} WLL`)}))`);
  await chooseOption('business-selected-client', `item.textContent?.includes(${JSON.stringify(`QA Lead Client ${unique} WLL`)})`);
  await waitFor('the selected client directory', `document.querySelector('#business-contact-name') !== null`);
  await fillFields({
    'business-contact-name': 'QA Chief Accountant',
    'business-contact-title': 'Chief Accountant',
    'business-contact-role': 'CHIEF_ACCOUNTANT_LIAISON',
    'business-contact-email': `qa.pbc.${unique}@example.invalid`,
    'business-contact-effective-from': '2026-01-01'
  });
  await clickButton('Add contact to client');
  await waitFor('the active Chief Accountant contact', `document.querySelector('.business-record-list')?.innerText.includes('QA Chief Accountant')`);
  await chooseOption('business-client-route-purpose', `item.value === 'PBC'`);
  await chooseOption('business-client-route-contact', `item.textContent?.includes('QA Chief Accountant')`);
  await chooseOption('business-client-route-priority', `item.value === 'true'`);
  await clickButton('Save recipient route');
  await waitFor('the saved primary PBC recipient route', `document.querySelector('.business-route-list')?.innerText.includes('PBC')`);

  await waitFor('the PBC engagement selector', `[...(document.querySelector('#business-pbc-engagement')?.options ?? [])].some(option => option.textContent?.includes(${JSON.stringify(`QA-ENG-${unique}`)}))`);
  await chooseOption('business-pbc-engagement', `item.textContent?.includes(${JSON.stringify(`QA-ENG-${unique}`)})`);
  await waitFor('the PBC recipient selector populated from the configured route', `([...document.querySelector('#business-pbc-contact')?.options ?? []].some(option => option.textContent?.includes('QA Chief Accountant')))`);
  const pbcFormState = await tab.evaluate<{ recipient: string; requestDisabled: boolean }>(`(() => ({
    recipient: document.querySelector('#business-pbc-contact')?.selectedOptions[0]?.textContent?.trim() ?? '',
    requestDisabled: [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Create request')?.disabled ?? true
  }))()`);
  assert.equal(pbcFormState.recipient, 'Select a configured PBC route', 'the route is visible but must be explicitly selected');
  assert.equal(pbcFormState.requestDisabled, false, 'the request action is enabled only after a configured route is available');
  await chooseOption('business-pbc-contact', `item.textContent?.includes('QA Chief Accountant')`);
  await fillFields({
    'business-pbc-title': 'Year-end bank statements',
    'business-pbc-category': 'BANK_STATEMENT',
    'business-pbc-due': '2026-10-20',
    'business-pbc-description': 'Provide the complete statements for all operating bank accounts for the audit period.'
  });
  const selectedPbcRecipient = await tab.evaluate<string>(`document.querySelector('#business-pbc-contact')?.selectedOptions[0]?.textContent?.trim() ?? ''`);
  assert.ok(selectedPbcRecipient.includes('QA Chief Accountant'), 'the explicitly selected PBC recipient matches the saved route');
  await clickButton('Create request');
  await waitFor('the Worker lifecycle gate to reject the early PBC request', `[...document.querySelectorAll('.business-alert[role="alert"]')].some(alert => alert.innerText.includes('PBC requests can be created after the engagement letter and risk handover enter advance billing'))`);
  const prematurePbcRequestCount = server.db.prepare(`SELECT COUNT(*) AS count FROM pbc_requests
    WHERE workspace_id=? AND engagement_id=? AND title='Year-end bank statements'`).bind(preference.workspaceId, persisted.converted_engagement_id).first<any>()?.count;
  assert.equal(prematurePbcRequestCount, 0, 'the early request is rejected atomically despite having a valid visible recipient route');
  assert.equal(tab.blockedExternalRequests.length, 0);
  assert.deepEqual(tab.exceptions, []);
});

it('US-ENG-003 renders and approves an exact quote revision, then fails closed when email is unconfigured', { timeout: 120000 }, async () => {
  assert.ok(tab && server);

  const unique = Date.now();
  const quoteJourney = await createAuthenticatedWorkspace(`Quote Journey ${unique}`, 'QA Commercial Partner');
  await waitFor('the empty commercial workspace', `document.querySelector('#business-workspace-heading')?.textContent === ${JSON.stringify(`Quote Journey ${unique}`)} && document.body.innerText.includes('No clients are registered.')`);
  const preference = await tab.evaluate<{ workspaceId: string }>(`JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}')`);
  assert.equal(preference.workspaceId, quoteJourney.workspaceId);

  await fillFields({
    'business-standards-name': `QA Standards ${unique}`,
    'business-standards-start': '2026-01-01',
    'business-isa220': 'ISA 220 (Revised), approved synthetic profile',
    'business-isa570': 'ISA 570 (Revised 2024), approved synthetic profile',
    'business-reporting-framework': 'Approved synthetic reporting framework'
  });
  await clickButton('Approve standards profile');
  await waitFor('the approved standards profile', `document.body.innerText.includes(${JSON.stringify(`QA Standards ${unique}`)})`);

  await fillFields({
    'business-firm-legal-name': 'Example Audit Practice WLL',
    'business-firm-registration': `QA-REG-${unique}`,
    'business-firm-address': 'Doha, Qatar',
    'business-firm-profile-text': 'Synthetic test firm profile for verifying quote rendering only.',
    'business-firm-methodology': 'Synthetic methodology summary for isolated browser acceptance; no real firm claim.'
  });
  await clickButton('Save firm profile');
  await waitFor('the approved synthetic firm profile', `document.body.innerText.includes('Partner-approved firm content · v1')`);

  const addStaffProfile = async (displayName: string, persona: 'PREPARER' | 'REVIEWER', grade: 'ASSOCIATE' | 'MANAGER') => {
    await fillFields({
      'business-staff-name': displayName,
      'business-staff-person-key': `QA-${persona}-${unique}`,
      'business-staff-email': `${persona.toLowerCase()}.${unique}@example.invalid`,
      'business-staff-grade': grade,
      'business-staff-persona': persona
    });
    await clickButton(`Add ${persona.toLowerCase()} profile`);
    await waitFor(`${persona} profile in the directory`, `document.querySelector('.business-profile-list')?.innerText.includes(${JSON.stringify(displayName)})`);
  };
  await addStaffProfile('QA Quote Reviewer', 'REVIEWER', 'MANAGER');
  await addStaffProfile('QA Quote Preparer', 'PREPARER', 'ASSOCIATE');
  await chooseOption('business-active-persona', `item.textContent?.includes('PREPARER · QA Quote Preparer')`);
  await waitFor('the PREPARER context', `document.querySelector('.business-actor-summary')?.innerText.includes('PREPARER')`);
  await waitFor('the new-versus-existing client selector', `document.getElementById('business-lead-client-mode')?.getClientRects().length > 0 && [...document.querySelectorAll('#business-lead-client-mode option')].some(option => option.value === 'NEW')`);
  await chooseOption('business-lead-client-mode', `item.value === 'NEW'`);
  await waitFor('new-prospect lead intake controls', `!!document.getElementById('business-lead-client-code')`);

  await fillFields({
    'business-lead-client-code': `QA-QUOTE-${unique}`,
    'business-lead-client-name': `QA Quote Client ${unique} WLL`,
    'business-lead-industry': 'Professional services',
    'business-lead-address': 'Doha, Qatar',
    'business-lead-contact-name': 'QA Finance Contact',
    'business-lead-contact-email': `quote.finance.${unique}@example.invalid`,
    'business-lead-contact-phone': '',
    'business-lead-contact-title': 'Finance Director',
    'business-lead-contact-role': 'MD_GM',
    'business-lead-source': 'REFERRAL',
    'business-lead-service': 'STATUTORY_AUDIT',
    'business-lead-period-start': '2026-01-01',
    'business-lead-period-end': '2026-12-31',
    'business-lead-fee': '10000001'
  });
  await clickButton('Record lead');
  await waitFor('the real linked lead', `document.querySelector('.business-lead-list')?.innerText.includes(${JSON.stringify(`QA Quote Client ${unique} WLL`)})`);
  const conversionControl = await tab.evaluate<string>(`document.querySelector('.business-lead-list input[id^="business-engagement-code-"]')?.id ?? ''`);
  assert.ok(conversionControl);
  const codeAccepted = await tab.evaluate<boolean>(`(() => {
    const input = document.getElementById(${JSON.stringify(conversionControl)});
    if (!(input instanceof HTMLInputElement)) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(`QA-QUOTE-ENG-${unique}`)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.checkValidity();
  })()`);
  assert.equal(codeAccepted, true);
  await clickButton('Convert to engagement');
  await waitFor('the LEAD_INGESTION engagement', `document.querySelector('.business-created-engagement')?.innerText.includes('Current state: LEAD_INGESTION')`);
  await clickButton('Validate profile and enter proposal generation');
  await waitFor('the proposal-generation state', `document.querySelector('.business-created-engagement')?.innerText.includes('Current state: PROPOSAL_GENERATION')`);

  await chooseOption('business-active-persona', `item.textContent?.includes('REVIEWER · QA Quote Reviewer')`);
  await waitFor('the Reviewer proposal form and proposal-ready engagement', `document.querySelector('.business-actor-summary')?.innerText.includes('REVIEWER') && [...(document.querySelector('#business-proposal-engagement')?.options ?? [])].some(option => option.textContent?.includes(${JSON.stringify(`QA-QUOTE-ENG-${unique}`)}))`);
  await chooseOption('business-proposal-engagement', `item.textContent?.includes(${JSON.stringify(`QA-QUOTE-ENG-${unique}`)})`);
  await fillFields({
    'business-proposal-mode': 'QUOTE',
    'business-proposal-fee': '10000001',
    'business-proposal-valid-until': '2026-11-01',
    'business-proposal-milestone': 'Draft audited financial statements',
    'business-proposal-milestone-date': '2027-02-15',
    'business-proposal-scope': 'Statutory audit of the synthetic client financial statements for the stated reporting period.'
  });
  await clickButton('Add milestone');
  await fillFields({
    'business-proposal-milestone-1': 'Final signed report',
    'business-proposal-milestone-date-1': '2027-03-01'
  });
  await clickButton('Create proposal revision');
  await waitFor('the exact quote split and saved revision', `document.querySelector('.business-command-message')?.innerText.includes('QAR minor-unit terms split to 5000001 advance and 5000000 final') && document.querySelector('.business-proposal-list')?.innerText.includes('Quotation · Revision 1')`);

  const proposal = server.db.prepare(`SELECT pv.id AS proposal_version_id,pv.fee_minor,pv.revision,pv.mode,pv.advance_bps,pv.final_bps,
      p.id AS proposal_id,e.id AS engagement_id,e.client_id,e.lifecycle_state
    FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
    JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.id=pv.engagement_id
    WHERE pv.workspace_id=? AND e.code=?`).bind(preference.workspaceId, `QA-QUOTE-ENG-${unique}`).first<any>();
  assert.ok(proposal);
  assert.deepEqual({ fee: proposal.fee_minor, revision: proposal.revision, mode: proposal.mode, advanceBps: proposal.advance_bps, finalBps: proposal.final_bps },
    { fee: 10000001, revision: 1, mode: 'QUOTE', advanceBps: 5000, finalBps: 5000 });
  const timeline = server.db.prepare(`SELECT timeline_json FROM proposal_versions WHERE workspace_id=? AND id=?`)
    .bind(preference.workspaceId, proposal.proposal_version_id).first<any>()?.timeline_json;
  assert.deepEqual(JSON.parse(timeline), [
    { name: 'Draft audited financial statements', date: '2027-02-15' },
    { name: 'Final signed report', date: '2027-03-01' }
  ], 'the proposal revision preserves its complete multi-milestone timetable');

  // Observe the proposal card before queueing its document job; then run the isolated Worker scheduler.
  assert.equal(await tab.evaluate<boolean>(`[...document.querySelectorAll('.business-proposal-list li')].some(item => item.innerText.includes('Document NOT GENERATED') && [...item.querySelectorAll('button')].some(button => button.innerText.trim() === 'Generate verified PDF' && !button.disabled))`), true);
  await clickButton('Generate verified PDF');
  await waitFor('the queued proposal document job', `document.querySelector('.business-command-message')?.innerText.includes('Document job')`);
  await server.runScheduled();
  await waitFor('the committed generated PDF state', `document.querySelector('.business-proposal-list')?.innerText.includes('Document SUCCEEDED') && document.querySelector('.business-proposal-list')?.innerText.includes('Partner approval PENDING')`);
  const artifact = server.db.prepare(`SELECT j.status,j.result_file_id,f.state,f.purpose,f.media_type,f.sha256,f.size_bytes,f.immutable
    FROM outbox_jobs j JOIN file_versions f ON f.workspace_id=j.workspace_id AND f.id=j.result_file_id
    WHERE j.workspace_id=? AND j.kind='GENERATE_DOCUMENT' AND j.aggregate_id=? ORDER BY j.created_at DESC LIMIT 1`)
    .bind(preference.workspaceId, proposal.proposal_version_id).first<any>();
  assert.deepEqual({ status: artifact?.status, state: artifact?.state, purpose: artifact?.purpose, mediaType: artifact?.media_type, immutable: artifact?.immutable },
    { status: 'SUCCEEDED', state: 'COMMITTED', purpose: 'GENERATED', mediaType: 'application/pdf', immutable: 1 });
  assert.ok(artifact.sha256 && artifact.size_bytes > 500);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM proposal_artifacts WHERE workspace_id=? AND proposal_version_id=?')
    .bind(preference.workspaceId, proposal.proposal_version_id).first<any>()?.count, 1);

  await chooseOption('business-active-persona', `item.textContent?.includes('APPROVER')`);
  await waitFor('the Partner approval action for the generated revision', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER') && [...document.querySelectorAll('.business-proposal-list button')].some(button => button.innerText.trim() === 'Approve this exact revision')`);
  await clickButton('Approve this exact revision');
  await waitFor('approval pinned to the exact generated revision', `document.querySelector('.business-proposal-list')?.innerText.includes('Partner approval APPROVE')`);

  assert.equal(await tab.evaluate<boolean>(`(() => {
    const route = document.querySelector('.business-proposal-list select[id^="business-proposal-route-"]');
    const button = [...document.querySelectorAll('.business-proposal-list button')].find(item => item.innerText.trim() === 'Queue approved proposal email');
    return route instanceof HTMLSelectElement && Boolean(route.value) && Boolean(button && !button.disabled);
  })()`), true, 'the displayed default proposal route is selected and dispatch is actionable');
  await clickButton('Queue approved proposal email');
  await waitFor('the queued dispatch state', `document.querySelector('.business-proposal-list')?.innerText.includes('dispatch QUEUED')`);
  await server.runScheduled();
  await waitFor('the visible unconfigured-provider failure', `document.querySelector('.business-proposal-list')?.innerText.includes('dispatch FAILED') && document.querySelector('.business-proposal-list [role="status"]')?.innerText.includes('email provider not configured')`);
  await tab.command('Page.reload');
  await waitFor('the persisted provider failure after reload', `document.querySelector('.business-proposal-list')?.innerText.includes('dispatch FAILED') && document.querySelector('.business-proposal-list [role="alert"]')?.innerText.includes('engagement remains in proposal generation')`);
  await waitFor('the current engagement acceptance panel after reload', `document.querySelectorAll('.business-risk-card .business-key-status').length === 2`);
  const pendingKeys = await tab.evaluate<string[]>(`[...document.querySelectorAll('.business-risk-card .business-key-status')]
    .map(item => [item.querySelector('span')?.textContent?.trim(), item.querySelector('strong')?.textContent?.trim().toUpperCase()].join(' ')).sort()`);
  assert.deepEqual(pendingKeys, ['Client commercial key PENDING', 'Partner risk key PENDING'],
    'proposal provider failure cannot produce either acceptance key');
  assert.equal(server.db.prepare('SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?')
    .bind(preference.workspaceId, proposal.engagement_id).first<any>()?.lifecycle_state, 'PROPOSAL_GENERATION');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM engagement_letter_drafts WHERE workspace_id=? AND engagement_id=?')
    .bind(preference.workspaceId, proposal.engagement_id).first<any>()?.count, 0, 'no letter render is created before both keys are current');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM engagement_letters WHERE workspace_id=? AND engagement_id=?')
    .bind(preference.workspaceId, proposal.engagement_id).first<any>()?.count, 0, 'no engagement letter is issued before both keys are current');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM invoices WHERE workspace_id=? AND engagement_id=?')
    .bind(preference.workspaceId, proposal.engagement_id).first<any>()?.count, 0, 'no advance invoice exists before letter issuance');
  assert.equal(server.db.prepare("SELECT status FROM dispatches WHERE workspace_id=? AND engagement_id=? AND purpose='PROPOSAL' ORDER BY created_at DESC LIMIT 1")
    .bind(preference.workspaceId, proposal.engagement_id).first<any>()?.status, 'FAILED');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE workspace_id=? AND command_type IN (\'proposal.dispatch\',\'proposal.dispatch.retry\')')
    .bind(preference.workspaceId).first<any>()?.count, 1, 'no provider-less retry or duplicate dispatch was recorded');
  await chooseOption('business-active-persona', `item.textContent?.includes('REVIEWER · QA Quote Reviewer')`);
  await waitFor('the Reviewer risk dossier editor and its evidence upload', `document.querySelector('[aria-label="Risk assessment evidence upload"] input[type="file"]')?.getClientRects().length === 1`);
  const syntheticRiskEvidencePath = join(tmpdir(), `auditsphere-risk-evidence-${unique}.pdf`);
  try {
    writeFileSync(syntheticRiskEvidencePath, Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
    const documentNode = await tab.command<{ root: { nodeId: number } }>('DOM.getDocument', { depth: -1 });
    const uploadInput = await tab.command<{ nodeId: number }>('DOM.querySelector', {
      nodeId: documentNode.root.nodeId, selector: `#risk-evidence-upload-${proposal.engagement_id}`
    });
    assert.ok(uploadInput.nodeId, 'the risk evidence upload is scoped to the selected engagement');
    await tab.command('DOM.setFileInputFiles', { files: [syntheticRiskEvidencePath], nodeId: uploadInput.nodeId });
    await waitFor('the committed risk evidence acknowledgement', `document.querySelector('[aria-label="Risk assessment evidence upload"] [role="status"]')?.innerText.includes('verified and committed')`);
    const riskEvidence = server.db.prepare(`SELECT client_id,engagement_id,purpose,state,immutable,media_type,size_bytes
      FROM file_versions WHERE workspace_id=? AND original_name=? ORDER BY version DESC LIMIT 1`)
      .bind(preference.workspaceId, `auditsphere-risk-evidence-${unique}.pdf`).first<any>();
    assert.deepEqual({ clientId: riskEvidence?.client_id, engagementId: riskEvidence?.engagement_id, purpose: riskEvidence?.purpose,
      state: riskEvidence?.state, immutable: riskEvidence?.immutable, mediaType: riskEvidence?.media_type },
    { clientId: proposal.client_id, engagementId: proposal.engagement_id, purpose: 'EVIDENCE', state: 'COMMITTED', immutable: 1, mediaType: 'application/pdf' });
    await waitFor('the uploaded file in the UBO evidence selector', `document.querySelector('#risk-evidence-UBO-${proposal.engagement_id}')?.innerText.includes(${JSON.stringify(`auditsphere-risk-evidence-${unique}.pdf`)})`);
  } finally {
    rmSync(syntheticRiskEvidencePath, { force: true });
  }
  assert.equal(tab.blockedExternalRequests.length, 0, 'the synthetic provider-less journey made no external HTTP calls');
  assert.deepEqual(tab.exceptions, [], 'the commercial browser journey raised no uncaught JavaScript exceptions');
});
