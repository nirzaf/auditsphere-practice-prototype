import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CdpTab } from '../helpers/cdp.js';
import { launchHeadlessChrome, stopHeadlessChrome } from '../helpers/headlessChrome.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

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
    const first = document.getElementById(Object.keys(values)[0]);
    const form = first?.closest('form');
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

async function pressRouteKey(key: 'Home' | 'ArrowDown'): Promise<void> {
  const windowsVirtualKeyCode = key === 'Home' ? 36 : 40;
  await tab!.evaluate(`document.getElementById('business-route-select')?.focus()`);
  await tab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode });
  await tab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode });
}

async function setViewport(width: number, height: number, mobile: boolean): Promise<void> {
  await tab!.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  try {
    await waitFor(`${width} by ${height} viewport`, `window.innerWidth === ${width} && window.innerHeight === ${height}`);
  } catch (error) {
    const metrics = await tab!.evaluate(`JSON.stringify((() => {
      const width = screen.width;
      const overflow = [...document.querySelectorAll('body *')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          if (rect.right <= width + 1 && rect.left >= -1) return false;
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) return false;
          }
          return true;
        })
        .map(element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: typeof element.className === 'string' ? element.className.slice(0, 100) : undefined,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            overflowX: style.overflowX,
            text: (element.textContent || '').trim().slice(0, 100)
          };
        })
        .sort((a, b) => b.right - a.right)
        .slice(0, 16);
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screenWidth: width,
        screenHeight: screen.height,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale } : null,
        devicePixelRatio: window.devicePixelRatio,
        hasFocus: document.hasFocus(),
        overflow
      };
    })())`);
    throw new Error(`${error instanceof Error ? error.message : String(error)}; viewport metrics: ${metrics}; requested mobile emulation: ${mobile}`);
  }
}

async function installAxe(): Promise<void> {
  const source = readFileSync(fileURLToPath(new URL('../vendor/axe.min.js', import.meta.url)), 'utf8');
  await tab!.evaluate(source);
  const installed = await tab!.evaluate<boolean>('Boolean(window.axe && typeof window.axe.run === "function")');
  assert.equal(installed, true, 'vendored axe-core is available inside the isolated page');
  const version = await tab!.evaluate<string>('window.axe.version');
  assert.equal(version, '4.14.0', 'the vendored axe-core version matches the reviewed license record');
}

async function scan(label: string): Promise<AxeViolation[]> {
  console.log(`ACCESSIBILITY_SCAN ${label}`);
  const result = await tab!.evaluate<{ violations: AxeViolation[] }>(`(async () => {
    const report = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }
    });
    return { violations: report.violations.map(({ id, impact, help, nodes }) => ({
      id, impact, help, nodes: nodes.map(node => ({ target: node.target.map(String), failureSummary: node.failureSummary }))
    })) };
  })()`);
  const actionable = result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  if (actionable.length) console.error(`ACCESSIBILITY_BLOCKERS ${label}: ${JSON.stringify(actionable)}`);
  const moderate = result.violations.filter(item => item.impact === 'moderate');
  if (moderate.length) console.log(`ACCESSIBILITY_MODERATE ${label}: ${JSON.stringify(moderate)}`);
  return result.violations;
}

before(async () => {
  server = await startBusinessE2eServer();
  const executable = chromeExecutable();
  assert.ok(executable, 'Chrome or Edge is available for the isolated accessibility audit.');
  const browser = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-accessibility-e2e-', timeoutMs: 45000 });
  chrome = browser.child;
  profileDirectory = browser.profileDirectory;
  browserPort = browser.port;
  const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${server.origin}`, {
    method: 'PUT', signal: AbortSignal.timeout(10000)
  });
  if (!targetResponse.ok) throw new Error(`Chrome could not create the accessibility page (HTTP ${targetResponse.status}).`);
  const target = await targetResponse.json() as { webSocketDebuggerUrl?: string };
  if (!target.webSocketDebuggerUrl) throw new Error('Chrome did not provide a DevTools WebSocket URL for the accessibility audit.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The accessibility browser did not connect over CDP within 10 seconds.')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('The accessibility browser could not connect over CDP.')); }, { once: true });
  });
  tab = new CdpTab(socket, server.origin);
  await tab.command('Runtime.enable');
  await tab.command('Log.enable');
  await tab.command('Page.enable');
  await tab.command('Network.enable');
  await tab.blockExternalHttp();
  await tab.command('Page.navigate', { url: server.origin });
  await waitFor('the no-auth workspace landing screen', `document.querySelector('#production-workspace-heading')?.innerText === 'Open your business workspace'`);
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
    if (cleanupError) console.warn(`Could not remove temporary accessibility Chrome profile yet: ${profileDirectory}`, cleanupError);
  }
});

it('E06-S01/E06-S04 keeps the workspace, CLIENT portal, and business routes free of CSP violations and critical or serious WCAG 2.2 AA issues', { timeout: 180000 }, async () => {
  assert.ok(tab && server);
  await installAxe();

  const findings: Array<{ screen: string; violation: AxeViolation }> = [];
  const audit = async (screen: string, width: number, height: number, mobile: boolean) => {
    await setViewport(width, height, mobile);
    const pageWidth = await tab!.evaluate<{ clientWidth: number; scrollWidth: number }>(`({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    })`);
    assert.ok(pageWidth.scrollWidth <= pageWidth.clientWidth,
      `${screen} has no horizontal page overflow: ${JSON.stringify(pageWidth)}`);
    for (const violation of await scan(screen)) findings.push({ screen, violation });
  };

  await audit('workspace landing · desktop', 1440, 900, false);
  await audit('workspace landing · mobile', 390, 844, true);
  await clickButton('Create or connect workspace');
  await waitFor('the workspace setup dialog', `document.querySelector('.business-setup-dialog form') !== null`);
  await audit('workspace setup · desktop', 1440, 900, false);
  await audit('workspace setup · mobile', 390, 844, true);

  const unique = Date.now();
  await setViewport(1440, 900, false);
  await fillFields({
    'business-workspace-name': `Accessibility QA ${unique}`,
    'business-partner-name': 'QA Partner',
    'business-partner-key': `QA-ACCESS-${unique}`,
    'business-partner-email': `accessibility.${unique}@example.invalid`
  });
  await clickButton('Create business workspace');
  await waitFor('the synthetic business workspace', `document.querySelector('#business-workspace-heading')?.textContent === ${JSON.stringify(`Accessibility QA ${unique}`)} && document.querySelector('#business-active-persona') !== null`);

  await fillFields({
    'business-standards-name': `QA Standards ${unique}`,
    'business-standards-start': '2026-01-01',
    'business-isa220': 'ISA 220 (Revised), synthetic accessibility fixture',
    'business-isa570': 'ISA 570 (Revised 2024), synthetic accessibility fixture',
    'business-reporting-framework': 'Synthetic accessibility test framework'
  });
  await clickButton('Approve standards profile');
  await waitFor('the synthetic standards profile', `document.body.innerText.includes(${JSON.stringify(`QA Standards ${unique}`)})`);

  await fillFields({
    'business-staff-name': 'QA Accessibility Preparer',
    'business-staff-person-key': `QA-A11Y-PREPARER-${unique}`,
    'business-staff-email': `preparer.a11y.${unique}@example.invalid`,
    'business-staff-grade': 'ASSOCIATE',
    'business-staff-persona': 'PREPARER'
  });
  await clickButton('Add preparer profile');
  await waitFor('the synthetic PREPARER profile', `[...document.querySelectorAll('#business-active-persona option')].some(option => option.textContent?.includes('PREPARER · QA Accessibility Preparer'))`);
  await chooseOption('business-active-persona', `item.textContent?.includes('PREPARER · QA Accessibility Preparer')`);
  await waitFor('the lead intake form for the PREPARER persona', `document.getElementById('business-lead-client-code')?.getClientRects().length > 0`);

  await fillFields({
    'business-lead-client-code': `QA-A11Y-${unique}`,
    'business-lead-client-name': `QA Accessibility Client ${unique} WLL`,
    'business-lead-industry': 'Professional services',
    'business-lead-address': 'Doha, Qatar',
    'business-lead-contact-name': 'QA Finance Contact',
    'business-lead-contact-email': `finance.a11y.${unique}@example.invalid`,
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
  await waitFor('the synthetic linked lead and client', `document.querySelector('.business-lead-list')?.innerText.includes(${JSON.stringify(`QA Accessibility Client ${unique} WLL`)}) && document.querySelector('.business-client-list')?.innerText.includes(${JSON.stringify(`QA Accessibility Client ${unique} WLL`)})`);

  const conversionId = await tab.evaluate<string>(`document.querySelector('.business-lead-list input[id^="business-engagement-code-"]')?.id ?? ''`);
  assert.ok(conversionId, 'the lead has a visible engagement conversion control');
  const conversionCodeAccepted = await tab.evaluate<boolean>(`(() => {
    const input = document.getElementById(${JSON.stringify(conversionId)});
    if (!(input instanceof HTMLInputElement)) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(`QA-A11Y-ENG-${unique}`)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.checkValidity();
  })()`);
  assert.equal(conversionCodeAccepted, true, 'the conversion code passes native field validation');
  await clickButton('Convert to engagement');
  await waitFor('the real lead-ingestion engagement', `document.querySelector('.business-created-engagement')?.innerText.includes('Current state: LEAD_INGESTION')`);

  await chooseOption('business-active-persona', `item.textContent?.includes('APPROVER · QA Partner')`);
  await waitFor('the Partner context', `document.querySelector('.business-actor-summary')?.innerText.includes('APPROVER')`);
  await waitFor('the synthetic client in the Partner directory', `document.querySelector('.business-client-list')?.innerText.includes(${JSON.stringify(`QA Accessibility Client ${unique} WLL`)})`);
  const selectedClient = await tab.evaluate<boolean>(`(() => {
    const name = ${JSON.stringify(`QA Accessibility Client ${unique} WLL`)};
    const button = [...document.querySelectorAll('.business-client-choice')].find(item => item.textContent?.includes(name));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(selectedClient, true, 'the synthetic client is selectable from the visible directory');
  await waitFor('the selected synthetic client contact', `document.querySelector('#business-client-profile-contact')?.innerText.includes('QA Finance Contact')`);
  await chooseOption('business-client-profile-contact', `item.textContent?.includes('QA Finance Contact')`);
  await clickButton('Add CLIENT profile');
  await waitFor('the scoped CLIENT profile', `[...document.querySelectorAll('#business-active-persona option')].some(option => option.textContent?.includes('CLIENT · QA Finance Contact'))`);

  await chooseOption('business-active-persona', `item.textContent?.includes('APPROVER · QA Partner')`);
  await waitFor('the populated staff workspace modules', `document.querySelector('.business-risk-card') !== null && document.querySelector('.business-delivery-card') !== null && document.querySelector('.business-planning-panel') !== null && document.querySelector('.business-tb-panel') !== null && document.querySelector('.business-fieldwork-panel') !== null && document.querySelector('#business-pbc-heading') !== null`);
  await chooseOption('business-selected-client', `item.textContent?.includes(${JSON.stringify(`QA Accessibility Client ${unique} WLL`)})`);
  await waitFor('the Partner-scoped client detail section', `document.querySelector('#route-client-detail')?.textContent?.includes(${JSON.stringify(`QA Accessibility Client ${unique} WLL`)})`);
  const requiredStaffHeadings = [
    'Acceptance and risk', 'Engagement letters and billing', 'Staffing and milestones',
    'Trial balance, materiality and planning handover', 'Audit fieldwork', 'Time, firm ledger and receivables',
    'PBC requests and responses', 'Reporting and final deliverables'
  ];
  await waitFor('all populated staff module headings', `(() => {
    const headings = [...document.querySelectorAll('h2')].map(heading => heading.textContent?.trim() ?? '');
    return ${JSON.stringify(requiredStaffHeadings)}.every(expected => headings.some(heading => heading.includes(expected)));
  })()`);
  const folderSummary = await tab.evaluate<{ heading: boolean; emptyState: boolean }>(`(() => {
    const section = document.querySelector('#business-engagement-folders-heading')?.closest('section');
    return { heading: Boolean(section), emptyState: section?.innerText.includes('The five engagement folders appear after Partner risk clearance.') ?? false };
  })()`);
  assert.deepEqual(folderSummary, { heading: true, emptyState: true }, 'the Documents view locates the selected engagement folder taxonomy and explains the pre-clearance state');
  const staffHeadings = await tab.evaluate<string[]>(`[...document.querySelectorAll('h2')].map(heading => heading.textContent?.trim() ?? '')`);
  for (const heading of requiredStaffHeadings) assert.ok(staffHeadings.some(item => item.includes(heading)), `populated staff view includes ${heading}`);
  await audit('populated staff modules · desktop', 1440, 900, false);
  await audit('populated staff modules · mobile', 390, 844, true);

  const routes = await tab.evaluate<Array<{ value: string; label: string }>>(`
    [...document.querySelectorAll('#business-route-select option')]
      .map(option => ({ value: option.value, label: option.textContent?.trim() ?? '' }))
  `);
  assert.equal(routes.length, 30, 'the navigation exposes all 30 current business routes');
  for (const [viewportIndex, width, height, mobile] of [[0, 1440, 900, false], [1, 390, 844, true]] as const) {
    await setViewport(width, height, mobile);
    for (const [routeIndex, route] of routes.entries()) {
      const targetId = `route-${route.value}`;
      if (viewportIndex === 0 && routeIndex === 0) {
        const selectedRoute = await chooseOption('business-route-select', `item.value === ${JSON.stringify(route.value)}`);
        assert.equal(selectedRoute, route.value, `${route.label} can be selected from the route menu`);
      } else {
        await pressRouteKey(routeIndex === 0 ? 'Home' : 'ArrowDown');
      }
      await waitFor(`${route.label} route focus`, `
        document.querySelector('#business-route-select')?.value === ${JSON.stringify(route.value)}
        && (document.activeElement?.id === ${JSON.stringify(targetId)}
          || document.querySelector('.business-module-unavailable')?.getClientRects().length > 0)
      `);
      const routeState = await tab.evaluate<{ hash: string; selected: string; focused: string; targetVisible: boolean; unavailableText: string; outlineStyle: string; outlineWidth: string; clientWidth: number; scrollWidth: number }>(`(() => {
        const target = document.getElementById(${JSON.stringify(targetId)});
        const style = target ? getComputedStyle(target) : null;
        return {
          hash: window.location.hash,
          selected: document.querySelector('#business-route-select')?.value ?? '',
          focused: document.activeElement?.id ?? '',
          targetVisible: Boolean(target?.getClientRects().length),
          unavailableText: document.querySelector('.business-module-unavailable')?.textContent?.trim() ?? '',
          outlineStyle: style?.outlineStyle ?? '',
          outlineWidth: style?.outlineWidth ?? '',
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        };
      })()`);
      assert.equal(routeState.hash, `#${route.value}`, `${route.label} updates the route hash`);
      assert.equal(routeState.selected, route.value, `${route.label} synchronizes the route selector`);
      if (routeState.focused === targetId) {
        assert.equal(routeState.targetVisible, true, `${route.label} destination is visible in the populated staff workspace`);
        assert.equal(routeState.outlineStyle, 'solid', `${route.label} destination shows a visible focus ring`);
        assert.equal(routeState.outlineWidth, '3px', `${route.label} focus ring is clearly visible`);
      } else {
        assert.match(routeState.unavailableText, /not available in the current workspace context/i,
          `${route.label} reports its missing engagement or persona context`);
      }
      assert.ok(routeState.scrollWidth <= routeState.clientWidth,
        `${route.label} has no horizontal page overflow at ${width}px: ${JSON.stringify(routeState)}`);
    }
  }

  await chooseOption('business-active-persona', `item.textContent?.includes('CLIENT · QA Finance Contact')`);
  await waitFor('the CLIENT portal projection', `document.querySelector('.business-actor-summary')?.innerText.includes('CLIENT') && document.body.innerText.includes('QA Accessibility Client ${unique} WLL')`);
  await audit('CLIENT portal · desktop', 1440, 900, false);
  await audit('CLIENT portal · mobile', 390, 844, true);

  const blockers = findings.filter(({ violation }) => violation.impact === 'critical' || violation.impact === 'serious');
  const moderate = findings.filter(({ violation }) => violation.impact === 'moderate');
  if (moderate.length) console.log(`ACCESSIBILITY_MODERATE_SUMMARY ${JSON.stringify(moderate)}`);
  assert.deepEqual(blockers, [], `new critical/serious accessibility violations must fail E06-S04: ${JSON.stringify(blockers)}`);
  assert.deepEqual(tab.cspViolations, [], `the enforced Worker CSP has no browser violation reports across the public landing/setup surfaces, all business routes, and CLIENT portal: ${JSON.stringify(tab.cspViolations)}`);
  assert.equal(tab.blockedExternalRequests.length, 0, 'the audit loaded no external assets or services');
  assert.deepEqual(tab.exceptions, [], 'the browser journey raised no uncaught JavaScript exceptions');
});
