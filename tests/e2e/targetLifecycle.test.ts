import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpTab } from '../helpers/cdp';
import { PROJECT_TEMPLATES, templateUrl } from '../../src/services/projectTemplates';
import { DECK_SLIDES } from '../../src/components/clientRequirements/deckData';
import { unzipSync } from 'fflate';
let vite: ChildProcess, chrome: ChildProcess, tab: CdpTab, profile: string;
const origin = 'http://127.0.0.1:3007',
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function saveEvidence(path: string, data: string | Buffer) {
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(path, data); return; }
    catch (error) {
      if (attempt >= 7 || !['UNKNOWN','EBUSY','EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      await sleep(150);
    }
  }
}
before(
  async () => {
    vite = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3007', '--strictPort'],
      { stdio: 'ignore', env: { ...process.env, VITE_DEMO_API_URL: process.env.TEST_CLOUD_API_URL || '' } }
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
    tab = new CdpTab(ws, origin, process.env.TEST_CLOUD_API_URL ? [new URL(process.env.TEST_CLOUD_API_URL).origin] : []);
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
it('visible Partner reporting flow retains signed LOR and releases the exact five-file bundle', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforePartner:true}))`);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="partner-clearance"]');f.querySelector('[name="notes"]').value='Current SRM and audited evidence independently evaluated for final reporting.';f.requestSubmit()})()`);await sleep(150);
  await tab.evaluate(`location.hash='delivery'`);await sleep(150);
  await tab.evaluate(`document.querySelector('[data-target-form="opinion"]').requestSubmit()`);await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`document.body.innerText.includes('Synthetic Partner signature') && !document.body.innerText.includes('QFC-AUD-SIG-9281')`),true);
  await tab.evaluate(`document.querySelector('[data-target-form="deliverables"]').requestSubmit()`);
  const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}).auditLifecycle)`;
  let lifecycle:any;
  for(let n=0;n<100;n++){lifecycle=await tab.evaluate(inspect);if(lifecycle.deliverables.length===1)break;await sleep(100);}
  assert.equal(lifecycle.deliverables[0].artifacts.length,5);assert.equal(lifecycle.deliverables[0].deliveredAt,undefined);
  await tab.evaluate(`import('/src/services/exportService.ts').then(m=>{const file=new File([m.createPDFBlob('Synthetic executive-signed LOR',['Synthetic fixture only; Managing Director and Finance Executive signatures.'])],'signed-lor.pdf',{type:'application/pdf'});const transfer=new DataTransfer();transfer.items.add(file);const f=document.querySelector('[data-target-form="signed-lor"]');f.querySelector('[name="signedLor"]').files=transfer.files;f.querySelector('[name="executive"]').value='Demo Managing Director';f.querySelector('[name="financeExecutive"]').value='Demo CFO';f.querySelector('[name="inspection"]').value='Synthetic executive signature inspection against this current bundle.';f.requestSubmit()})`);
  for(let n=0;n<100;n++){lifecycle=await tab.evaluate(inspect);if(lifecycle.signedRepresentations?.length===1)break;await sleep(100);}
  assert.equal(lifecycle.signedRepresentations.length,1);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Release Bundle to Client Portal')).click()`);
  await sleep(150);lifecycle=await tab.evaluate(inspect);assert.ok(lifecycle.deliverables[0].deliveredAt);
  assert.equal(lifecycle.signedRepresentations[0].deliverableSetId,lifecycle.deliverables[0].id);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('client_finance'))`);
  await tab.evaluate(`location.hash='portal'`);await sleep(150);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('4. Final Certified Deliverables')).click()`);await sleep(100);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid="client-release-set"]').length`),1);
}, {timeout:60000});
it('critical confirmation transitions through visible forms automatically issue one verified Holding Letter', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`location.hash='confirmations'`);await sleep(150);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="confirmation"]');f.querySelector('[name="counterparty"]').value='Synthetic Confirmation Bank';f.requestSubmit()})()`);
  await sleep(150);
  for(const status of ['Requested','Awaiting']){
    await tab.evaluate(`(()=>{const f=Array.from(document.querySelectorAll('form')).find(f=>f.textContent.includes('Update confirmation: Synthetic Confirmation Bank'));f.querySelector('[name="status"]').value=${JSON.stringify(status)};f.querySelector('[name="note"]').value='Bank confirmation requested and followed up against the current cash balance.';f.requestSubmit()})()`);
    await sleep(200);
  }
  const inspect=`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {criticalConfirmationBlockers}=await import('/src/services/targetLifecycle.ts');return {letters:e.auditLifecycle.holdingLetters||[],blockers:criticalConfirmationBlockers(state,e)}})`;
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate(inspect);if(completed.letters.length===1)break;await sleep(100);}
  assert.equal(completed.letters.length,1);assert.ok(completed.blockers.length>0);
  assert.equal(await tab.evaluate<boolean>(`import('/src/services/artifactStore.ts').then(async m=>(await (await m.loadVerifiedArtifact(${JSON.stringify(completed.letters[0].artifact)})).text()).startsWith('%PDF-'))`),true);
  await tab.command('Page.reload');
  for(let n=0;n<100;n++){if(await tab.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
  assert.equal((await tab.evaluate<any>(inspect)).letters.length,1);
  assert.equal(await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.loadError)`),null);
}, {timeout:60000});
it('two real browser tabs preserve independent procedure edits after reload', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  const port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const target=await fetch(`http://127.0.0.1:${port}/json/new?${origin}`,{method:'PUT'}).then(r=>r.json()) as any;
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve(),{once:true});ws.addEventListener('error',()=>reject(Error('Second tab CDP failed')),{once:true});});
  const other=new CdpTab(ws,origin);
  try {
    await other.command('Runtime.enable');
    for(let n=0;n<100;n++){if(await other.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
    const ids=await tab.evaluate<string[]>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).flatMap(p=>p.procedures).slice(0,2).map(p=>p.id))`);
    assert.equal(ids.length,2);
    const edit=(id:string,label:string)=>`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.updateAuditProcedureExecution(${JSON.stringify(result.engagementId)},${JSON.stringify(id)},${JSON.stringify(label)},'Evidence supports the recorded conclusion.',''))`;
    await Promise.all([tab.evaluate(edit(ids[0],'Independent work in first tab')),other.evaluate(edit(ids[1],'Independent work in second tab'))]);
    const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot();return state.auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).flatMap(p=>p.procedures).filter(p=>${JSON.stringify(ids)}.includes(p.id)).map(p=>p.workPerformed)})`;
    for(let n=0;n<100;n++){const values=await tab.evaluate<string[]>(inspect);if(values.includes('Independent work in second tab'))break;await sleep(50);}
    await sleep(300);
    for(const page of [tab,other])assert.deepEqual(await page.evaluate(inspect),['Independent work in first tab','Independent work in second tab'],JSON.stringify(await page.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>({conflict:s.hasStorageConflict(),stored:JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).flatMap(p=>p.procedures).slice(0,2).map(p=>p.workPerformed)}))`)));
    await other.command('Page.reload');
    for(let n=0;n<100;n++){if(await other.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
    assert.deepEqual(await other.evaluate(inspect),['Independent work in first tab','Independent work in second tab']);
  } finally {other.close();await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);}
}, {timeout:60000});
it('Manager clearance through the visible form automatically generates a current PDF SRM', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforeManager:true}))`);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="manager-clearance"]');const input=f.querySelector('[name="notes"]');input.value='All current workpapers and supporting evidence independently reviewed.';input.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit()})()`);
  const inspect=`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {currentReview}=await import('/src/services/targetLifecycle.ts');return {review:currentReview(state,e),srms:e.auditLifecycle.srms.length}})`;
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate<any>(inspect);if(completed.srms===1)break;await sleep(100);}
  assert.equal(completed.srms,1);assert.equal(completed.review.manager,true);assert.equal(completed.review.srm,true);
  assert.equal(await tab.evaluate<boolean>(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const e=s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {loadVerifiedArtifact}=await import('/src/services/artifactStore.ts');return (await (await loadVerifiedArtifact(e.auditLifecycle.srms[0].artifact)).text()).startsWith('%PDF-')})`),true);
}, {timeout:60000});
it('records payment through the visible form and retries failed receipt/onboarding without duplicating payment', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforeAdvance:true}))`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{window.__receiptWriter=s.lifecycle.artifactWriter;s.lifecycle.artifactWriter=async()=>{throw Error('Injected IndexedDB failure')};const f=document.querySelector('[data-target-form="advance"]');f.querySelector('[name="reference"]').value='UI-RETRY-001';f.querySelector('[name="reference"]').dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit()})`);
  for(let n=0;n<100;n++){if(await tab.evaluate<boolean>(`document.body.innerText.includes('Payment recorded once; receipt/onboarding pending')`))break;await sleep(100);}
  assert.equal(await tab.evaluate<boolean>(`document.body.innerText.includes('Payment recorded once; receipt/onboarding pending')`),true);
  const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});return {payments:e.auditLifecycle.advancePayments.length,receipts:e.auditLifecycle.receiptDocuments.length,folders:state.folders.filter(f=>f.engagementId===e.id).length,onboarding:e.auditLifecycle.onboarding}})`;
  const failed=await tab.evaluate<any>(inspect);assert.equal(failed.payments,1);assert.equal(failed.receipts,0);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.lifecycle.artifactWriter=window.__receiptWriter;Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Generate official receipt').click()})`);
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate<any>(inspect);if(completed.receipts===1)break;await sleep(100);}
  assert.equal(completed.payments,1);assert.equal(completed.receipts,1);assert.equal(completed.folders,5);assert.equal(completed.onboarding.requiresFirstLoginReset,true);
  assert.equal(await tab.evaluate<boolean>(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const e=s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {loadVerifiedArtifact}=await import('/src/services/artifactStore.ts');return (await (await loadVerifiedArtifact(e.auditLifecycle.receiptDocuments[0].artifact)).text()).startsWith('%PDF-')})`),true);
}, {timeout:60000});
it(
  'executes the complete canonical command journey in Chrome with genuine artifacts and rendered checkpoints',
  async () => {
    const result = await tab.evaluate<any>(
      `import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`
    );
    assert.equal(result.checkpoints.length, 17);
    assert.equal(result.artifacts.length, 5);
    assert.ok(result.archive.artifacts.length > 5, 'archive includes workpapers, receipt, SRM and final documents');
    assert.equal(result.review.partner, true);
    assert.deepEqual(result.blockers, []);
    mkdirSync('docs/prototype/evidence', { recursive: true });
    const reportBytes = await tab.evaluate<string>(`import('/src/services/artifactStore.ts').then(async m => {const s = (await import('/src/store/prototypeStore.ts')).prototypeStore.getSnapshot();const a = s.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}).auditLifecycle.deliverables[0].artifacts[0];const bytes = new Uint8Array(await (await m.loadVerifiedArtifact(a)).arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))})`);
    await saveEvidence('docs/prototype/evidence/review-final-report.pdf',Buffer.from(reportBytes,'base64'));
    const zipBytes = await tab.evaluate<string>(`import('/src/services/archivePackage.ts').then(async m => {const s=(await import('/src/store/prototypeStore.ts')).prototypeStore.getSnapshot();const bytes=new Uint8Array(await (await m.createInspectionZip(s,s.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}))).arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))})`);
    const zip = unzipSync(Buffer.from(zipBytes,'base64'));
    const inspection = JSON.parse(new TextDecoder().decode(zip['audit-file-manifest.json']));
    assert.equal(inspection.exportStatus,'Verified');
    assert.ok(Object.keys(zip).some(name=>name.endsWith('target-tb.csv')));
    assert.ok(Object.keys(zip).some(name=>name.endsWith('population.csv')));
    assert.ok(Object.keys(zip).length>10);
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
it('US-M3-002/003 analytical review form validates, saves and restores deliberate going concern assessment', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(module => module.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('[AR Test]')).click()`);
  await sleep(100);
  await tab.evaluate(`Array.from(document.querySelectorAll('.modal-foot button')).find(button => button.textContent.includes('Sign Off')).click()`);
  await sleep(100);
  assert.match(await tab.evaluate<string>(`document.querySelector('.modal [role="alert"]')?.textContent || ''`), /analysis|ISA 570|conclusion/i);
  await tab.evaluate(`{
    const textareas=document.querySelectorAll('.modal textarea');
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(textareas[0],'Revenue supported by current sales ledger and documented management inquiry. Prior-period source is unavailable.');textareas[0].dispatchEvent(new Event('input',{bubbles:true}));
    setter.call(textareas[1],'Twelve-month forecast and committed financing support going concern; sources: accepted TB and management forecast.');textareas[1].dispatchEvent(new Event('input',{bubbles:true}));
    for (const select of document.querySelectorAll('.modal select')) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'true');select.dispatchEvent(new Event('change',{bubbles:true})); }
  }`);
  await sleep(100);
  await tab.evaluate(`Array.from(document.querySelectorAll('.modal-foot button')).find(button => button.textContent.includes('Sign Off')).click()`);
  await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!document.querySelector('.modal #ar-conclusion')`), true);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('[AR Test]')).click()`);
  await sleep(100);
  assert.match(await tab.evaluate<string>(`document.querySelector('#ar-conclusion').value`), /Twelve-month forecast/);
  assert.equal(await tab.evaluate<boolean>(`Array.from(document.querySelectorAll('.modal select')).every(select => select.value === 'true')`), true);
  await tab.evaluate(`document.querySelector('.modal .icon-btn').click()`);
}, {timeout: 30000});

it('checks US-UIUX-001 responsive scope and captures twelve required surfaces', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`);
  const routes = ['overview','proposals','onboarding','audit-planning','financial-statements','audit-fieldwork','reviews','delivery','records','reports','portal','client-requirements'];
  const results: any[] = [];
  const folder = 'docs/prototype/evidence/visual-parity';
  mkdirSync(folder, { recursive: true });
  for (const width of [320,390,760,960,1000,1024,1440,1920]) {
    await tab.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const route of routes) {
      await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona(${JSON.stringify(route==='portal'?'client_finance':'superuser')});location.hash=${JSON.stringify(route)}})`);
      await sleep(120);
      const result = await tab.evaluate<any>(`({route:location.hash,width:innerWidth,documentWidth:document.documentElement.scrollWidth, main:!!document.querySelector('main'), hiddenIdentity:!document.querySelector('#role-select')?.getClientRects().length, hiddenSearch:!document.querySelector('.search-trigger')?.getClientRects().length, font:getComputedStyle(document.body).fontFamily, text:getComputedStyle(document.body).color, topbar:getComputedStyle(document.querySelector('.topbar')).backgroundColor, title:document.querySelector('main h1,main h2')?.textContent, overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>e.tagName+'.'+e.className)})`);
      assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[role=alertdialog]')`), false, 'navigation must not silently stall at an unsaved dialog');
      assert.equal(result.route, `#${route}`, 'the requested surface must be active');
      results.push(result);
      assert.ok(result.main && result.title, `${route} renders at ${width}`);
      assert.ok(result.documentWidth <= width + 1, `${route} at ${width}: ${JSON.stringify(result)}`);
      if (width >= 960) assert.equal(await tab.evaluate<boolean>(`document.querySelector('.sidebar').getBoundingClientRect().right <= document.querySelector('.shell').getBoundingClientRect().left + 1`),true,`sidebar must not overlap ${route} at ${width}`);
      assert.equal(result.hiddenIdentity,true,'normal experience hides identity utility');
      assert.equal(result.hiddenSearch,true,'normal experience hides global search utility');
      if ([390,1440].includes(width)) {
        const screenshot = await tab.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
        await saveEvidence(`${folder}/${route}-${width}.png`,Buffer.from(screenshot.data,'base64'));
      }
    }
  }
  await saveEvidence(`${folder}/responsive-results.json`,JSON.stringify(results,null,2));
  assert.deepEqual(tab.exceptions,[]);
}, { timeout: 120000 });

it('offers native workflow templates with working downloads and keeps source examples off the client portal', async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='confirmations'})`);
  await sleep(150);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid=project-templates] a[download]').length`), 4);
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: false });
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true`);
  await sleep(100);
  assert.equal(await tab.evaluate<boolean>(`document.documentElement.scrollWidth<=innerWidth+1`), true, 'expanded native template panel fits mobile');
  const templateCapture = await tab.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('docs/prototype/evidence/visual-parity/confirmation-templates-390.png', Buffer.from(templateCapture.data, 'base64'));
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true; const search=document.querySelector('[data-testid=project-templates] input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(search,'Bank');search.dispatchEvent(new Event('input',{bubbles:true}));`);
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

it('creates a cloud demo from Presenter controls, autosaves a guarded change and resumes it', { skip: !process.env.TEST_CLOUD_API_URL, timeout: 30000 }, async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='proposals'})`);
  await sleep(150);
  await tab.evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Presenter / Demo Controls').click()`);
  for (let n=0;n<50;n++) { if (await tab.evaluate<boolean>(`!!document.querySelector('[data-testid=cloud-demo-controls] option')`)) break; await sleep(100); }
  assert.ok(await tab.evaluate<boolean>(`!!document.querySelector('[data-testid=cloud-demo-controls] option')`), JSON.stringify({ blocked: tab.blockedExternalRequests, failures: tab.networkFailures, requests: tab.requests.slice(-10) }));
  await tab.evaluate(`[...document.querySelectorAll('[data-testid=cloud-demo-controls] button')].find(button=>button.textContent==='Start new cloud demo').click()`);
  for (let n=0;n<70;n++) { if (await tab.evaluate<boolean>(`import('/src/services/cloudDemo.ts').then(m=>m.cloudDemoSnapshot().mode==='saved')`)) break; await sleep(100); }
  assert.equal(await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().clients[0]?.name)`), 'Synthetic Demo Trading LLC', await tab.evaluate<string>(`document.querySelector('[data-testid=cloud-demo-controls]').textContent+'; unsaved dialog: '+!!document.querySelector('[role=dialog]')`));
  const code = await tab.evaluate<string>(`import('/src/services/cloudDemo.ts').then(m=>m.cloudDemoAccessCode())`);
  const [id, token] = code.split('.');
  try {
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const client=s.getSnapshot().clients[0];s.updateClient({...client,notes:'Browser cloud save verified.'},client.profileRevision||0)})`);
    for (let n=0;n<70;n++) { if (await tab.evaluate<boolean>(`import('/src/services/cloudDemo.ts').then(m=>m.cloudDemoSnapshot().mode==='saved'&&m.cloudDemoSnapshot().revision>=2)`)) break; await sleep(100); }
    const remote = await (await fetch(process.env.TEST_CLOUD_API_URL+`/workspaces/${id}`, {headers:{Authorization:`Bearer ${token}`}})).json() as any;
    assert.equal(remote.state.clients[0].notes, 'Browser cloud save verified.');
    await tab.evaluate(`import('/src/services/cloudDemo.ts').then(m=>m.disconnectCloudDemo())`);
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.loadScenario('target-lifecycle'))`);
    await tab.evaluate(`import('/src/services/cloudDemo.ts').then(m=>m.resumeCloudDemo(${JSON.stringify(code)}))`);
    assert.equal(await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().clients[0].notes)`), 'Browser cloud save verified.');
    const remoteChange = await fetch(process.env.TEST_CLOUD_API_URL+`/workspaces/${id}`, {method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({revision:remote.revision,state:remote.state})});
    assert.equal(remoteChange.status,200);
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const client=s.getSnapshot().clients[0];s.updateClient({...client,notes:'Local edit must survive a cloud conflict.'},client.profileRevision||0)})`);
    for (let n=0;n<70;n++) { if (await tab.evaluate<boolean>(`import('/src/services/cloudDemo.ts').then(m=>m.cloudDemoSnapshot().mode==='conflict')`)) break; await sleep(100); }
    assert.equal(await tab.evaluate<string>(`import('/src/services/cloudDemo.ts').then(m=>m.cloudDemoSnapshot().mode)`),'conflict');
    assert.equal(await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().clients[0].notes)`),'Local edit must survive a cloud conflict.');
    await tab.evaluate(`import('/src/services/cloudDemo.ts').then(m=>m.reloadCloudDemo())`);
    assert.equal(await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().clients[0].notes)`),'Browser cloud save verified.');
    await tab.command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
    await sleep(100);
    assert.equal(await tab.evaluate<boolean>(`document.querySelector('.topbar').getBoundingClientRect().bottom<=document.querySelector('.contextbar').getBoundingClientRect().top+1`),true,'mobile presenter header must not overlap context');
    assert.equal(await tab.evaluate<boolean>(`document.documentElement.scrollWidth<=innerWidth+1`), true);
    const capture=await tab.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    writeFileSync('docs/prototype/evidence/visual-parity/cloud-demo-390.png',Buffer.from(capture.data,'base64'));
    await tab.evaluate(`import('/src/services/cloudDemo.ts').then(m=>m.disconnectCloudDemo())`);
  } finally { await fetch(process.env.TEST_CLOUD_API_URL+`/workspaces/${id}`, {method:'DELETE',headers:{Authorization:`Bearer ${token}`}}); }
  assert.deepEqual(tab.exceptions, []);
});

it('F14 visible AJE authoring hands off through independent review, client decision and TB reflection', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('admin');s.grantAccess('client','client','Engagement',s.getSnapshot().selectedEngagement,'Authorized synthetic management approver',{requestRef:'REQ-AJE-APPROVER',approvalEvidenceRef:'APPROVAL-AJE-APPROVER'})})`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('preparer');location.hash='findings'})`);
  await sleep(150);
  const fill = async (heading: string, fields: Record<string,string>) => {
    await tab.evaluate(`{
      const form=[...document.querySelectorAll('[data-testid="adjustment-panel"] form')].find(f=>f.querySelector('h3').textContent.startsWith(${JSON.stringify(heading)}));
      if(!form) throw Error('Visible AJE form missing: '+${JSON.stringify(heading)});
      for(const [name,value] of Object.entries(${JSON.stringify(fields)})){const input=form.elements.namedItem(name);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      form.requestSubmit();
    }`);
    await sleep(180);
  };
  const accounts=await tab.evaluate<string[]>(`[...document.querySelectorAll('[data-testid="adjustment-panel"] select[name="debit"] option')].map(o=>o.value)`);
  await fill('Propose balanced AJE',{title:'Browser verified AJE',debit:accounts[0],credit:accounts[1],amount:'10',rationale:'Current ledger and invoice support this balanced reclassification.'});
  const status = () => tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().adjustmentJournals.find(j=>j.title==='Browser verified AJE')?.status || '')`);
  assert.equal(await status(),'Draft');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('manager'))`);await sleep(150);
  await fill('Independent review',{decision:'approve',note:'Independent review of ledger and invoice completed.'});assert.equal(await status(),'Technical review');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client');location.hash='portal'})`);await sleep(150);
  await fill('Management decision',{decision:'accept',note:'Management accepts the supported correction.'});assert.equal(await status(),'Management accepted');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('manager');location.hash='findings'})`);await sleep(150);
  await fill('Current TB reflection',{reflection:'reflected',evidence:'Client revised ledger and current TB reviewed.'});assert.equal(await status(),'Reporting included');
  assert.deepEqual(tab.exceptions,[]);
},{timeout:30000});

it('F22 renders all detailed notes equally in React and the standalone presentation', async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='client-requirements'})`);await sleep(150);
  await tab.evaluate(`document.querySelector('button[title="Toggle CPA Discussion Notes (N)"]').click()`);await sleep(80);
  for(let i=0;i<DECK_SLIDES.length;i++) {
    const slide=DECK_SLIDES[i];
    const text=await tab.evaluate<string>(`document.querySelector('aside[role="dialog"]').textContent`);
    assert.ok(text.includes(slide.title),slide.id+' title');
    assert.ok(text.includes(slide.note || ''),slide.id+' detailed notes');
    if(i<DECK_SLIDES.length-1){await tab.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next →').click()`);await sleep(80);}
  }
  await tab.command('Page.navigate',{url:origin+'/Client_Requirements.html'});await sleep(250);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('main section').length`),17);
  for(const slide of DECK_SLIDES) assert.equal(await tab.evaluate<boolean>(`document.getElementById(${JSON.stringify(slide.id)}).textContent.includes(${JSON.stringify(slide.note)})`),true,slide.id+' standalone detail');
  await tab.command('Page.navigate',{url:origin+'/#overview'});await sleep(300);
  assert.deepEqual(tab.exceptions,[]);
},{timeout:15000});
