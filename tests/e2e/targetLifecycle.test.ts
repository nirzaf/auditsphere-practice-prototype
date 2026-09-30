import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpTab } from '../helpers/cdp';
import { PROJECT_TEMPLATES, templateUrl } from '../../src/services/projectTemplates';
let vite: ChildProcess, chrome: ChildProcess, tab: CdpTab, profile: string;
const origin = 'http://127.0.0.1:3007',
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
before(
  async () => {
    vite = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3007', '--strictPort'],
      { stdio: 'ignore' }
    );
    for (let n = 0; n < 100; n++) {
      if (
        await fetch(origin)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await sleep(100);
    }
    const path =
      process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    assert.ok(existsSync(path));
    profile = mkdtempSync(join(tmpdir(), 'auditsphere-target-'));
    chrome = spawn(
      path,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--window-size=1440,1000',
        '--remote-debugging-port=0',
        '--remote-allow-origins=*',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        'about:blank'
      ],
      { stdio: 'ignore' }
    );
    let port = '';
    for (let n = 0; n < 100; n++) {
      try {
        port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      } catch {}
      if (port) break;
      await sleep(100);
    }
    assert.ok(port);
    const target = (await fetch(`http://127.0.0.1:${port}/json/new?${origin}`, {
      method: 'PUT'
    }).then((r) => r.json())) as any;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(Error('CDP failed')), { once: true });
    });
    tab = new CdpTab(ws, origin);
    await tab.command('Runtime.enable');
    await tab.command('Page.enable');
    await tab.command('Network.enable');
    await tab.blockExternalHttp();
    for (let n = 0; n < 100; n++) {
      if (await tab.evaluate<boolean>('!!document.querySelector(".sidebar")')) return;
      await sleep(100);
    }
    throw Error('React shell did not render');
  },
  { timeout: 30000 }
);
after(async () => {
  tab?.close();
  for (const child of [chrome, vite])
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((r) => child.once('exit', () => r()));
      child.kill('SIGTERM');
      await exited;
    }
  if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});
it(
  'executes the complete canonical command journey in Chrome with genuine artifacts and rendered checkpoints',
  async () => {
    const result = await tab.evaluate<any>(
      `import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`
    );
    assert.equal(result.checkpoints.length, 17);
    assert.equal(result.artifacts.length, 5);
    assert.equal(result.archive.artifacts.length, 5);
    assert.equal(result.review.partner, true);
    assert.deepEqual(result.blockers, []);
    mkdirSync('docs/prototype/evidence', { recursive: true });
    writeFileSync(
      'docs/prototype/evidence/target-browser-journey.json',
      JSON.stringify(
        {
          mode: 'Chrome command-level lifecycle with rendered checkpoints; not a click-by-click user acceptance',
          ...result,
          review: {
            manager: result.review.manager,
            srm: result.review.srm,
            partner: result.review.partner
          }
        },
        null,
        2
      )
    );
    await tab.command('Page.reload');
    await sleep(700);
    assert.equal(
      await tab.evaluate<boolean>(
        `JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements[0].auditLifecycle.archiveControl.freezeStatus==='Frozen'`
      ),
      true
    );
    assert.equal(
      await tab.evaluate<boolean>(
        `document.querySelector('main')?.textContent.includes('Firm expenses')`
      ),
      true
    );
    assert.deepEqual(tab.exceptions, []);
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('records');location.hash='records'})`
    );
    await sleep(150);
    assert.equal(
      await tab.evaluate<boolean>(
        `document.querySelector('[data-testid=target-lifecycle-header]').textContent.includes('Generate the final balance invoice')`
      ),
      false
    );
    const capture = await tab.command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    writeFileSync(
      'docs/prototype/evidence/target-frozen-archive.png',
      Buffer.from(capture.data, 'base64')
    );
    assert.deepEqual(tab.blockedExternalRequests, []);
  },
  { timeout: 60000 }
);
it(
  'renders the lifecycle overview, retired redirects and mobile layout without exposing client staff economics',
  async () => {
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('manager');location.hash='overview'})`
    );
    await sleep(150);
    assert.equal(
      await tab.evaluate<number>(
        `document.querySelectorAll('[aria-label="System lifecycle state machine"] > li').length`
      ),
      11
    );
    await tab.command('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(100);
    assert.equal(
      await tab.evaluate<boolean>('document.documentElement.scrollWidth<=innerWidth+1'),
      true
    );
    await tab.evaluate(`location.hash='quality'`);
    await sleep(150);
    assert.equal(await tab.evaluate<string>('location.hash'), '#reviews');
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client_finance');location.hash='scheduling'})`
    );
    await sleep(150);
    assert.equal(await tab.evaluate<string>('location.hash'), '#portal');
    assert.equal(
      await tab.evaluate<boolean>(
        `/Manager conclusion|Charge-out|Summary Review Memorandum/.test(document.querySelector('main').textContent)`
      ),
      false
    );
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('client-northstar'))`);
    await sleep(150);
    assert.equal(await tab.evaluate<boolean>(`/Synthetic Target Audit Ltd|Audit supporting evidence/.test(document.querySelector('main').textContent)`),false,'client without an engagement grant sees no foreign client records');
    assert.deepEqual(tab.exceptions, []);
  },
  { timeout: 10000 }
);
it('checks US-UIUX-001 responsive scope and captures twelve required surfaces', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`);
  const routes = ['overview','proposals','onboarding','audit-planning','financial-statements','audit-fieldwork','reviews','delivery','records','reports','portal','client-requirements'];
  const results: any[] = [];
  const folder = 'docs/prototype/evidence/visual-parity';
  mkdirSync(folder, { recursive: true });
  for (const width of [320,390,760,1024,1440,1920]) {
    await tab.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const route of routes) {
      await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona(${JSON.stringify(route==='portal'?'client_finance':'superuser')});location.hash=${JSON.stringify(route)}})`);
      await sleep(120);
      const result = await tab.evaluate<any>(`({route:location.hash,width:innerWidth,documentWidth:document.documentElement.scrollWidth, main:!!document.querySelector('main'), hiddenIdentity:!document.querySelector('#role-select')?.getClientRects().length, hiddenSearch:!document.querySelector('.search-trigger')?.getClientRects().length, font:getComputedStyle(document.body).fontFamily, text:getComputedStyle(document.body).color, topbar:getComputedStyle(document.querySelector('.topbar')).backgroundColor, title:document.querySelector('main h1,main h2')?.textContent, overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>e.tagName+'.'+e.className)})`);
      assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[role=alertdialog]')`), false, 'navigation must not silently stall at an unsaved dialog');
      assert.equal(result.route, `#${route}`, 'the requested surface must be active');
      results.push(result);
      writeFileSync(`${folder}/responsive-results.json`,JSON.stringify(results,null,2));
      assert.ok(result.main && result.title, `${route} renders at ${width}`);
      assert.ok(result.documentWidth <= width + 1, `${route} at ${width}: ${JSON.stringify(result)}`);
      assert.equal(result.hiddenIdentity,true,'normal experience hides identity utility');
      assert.equal(result.hiddenSearch,true,'normal experience hides global search utility');
      if ([390,1440].includes(width)) {
        const screenshot = await tab.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        writeFileSync(`${folder}/${route}-${width}.png`,Buffer.from(screenshot.data,'base64'));
      }
    }
  }
  assert.deepEqual(tab.exceptions,[]);
}, { timeout: 120000 });

it('offers native workflow templates with working downloads and keeps source examples off the client portal', async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='confirmations'})`);
  await sleep(150);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid=project-templates] a[download]').length`), 9);
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true`);
  await sleep(100);
  assert.equal(await tab.evaluate<boolean>(`document.documentElement.scrollWidth<=innerWidth+1`), true, 'expanded native template panel fits mobile');
  const templateCapture = await tab.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('docs/prototype/evidence/visual-parity/confirmation-templates-390.png', Buffer.from(templateCapture.data, 'base64'));
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true; const search=document.querySelector('[data-testid=project-templates] input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(search,'Cash');search.dispatchEvent(new Event('input',{bubbles:true}));`);
  await sleep(100);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid=project-templates] a[download]').length`), 1);
  for (const template of PROJECT_TEMPLATES) {
    const response = await fetch(`${origin}${templateUrl(template)}`);
    assert.equal(response.status, 200, template.file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(`public/templates/${template.file}`), `${template.file}: download must preserve original Office bytes`);
  }
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client_finance');location.hash='portal'})`);
  await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[data-testid=project-templates]')`), false);
  assert.deepEqual(tab.exceptions, []);
}, { timeout: 10000 });
