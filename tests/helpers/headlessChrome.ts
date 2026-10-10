import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Stop only the Chrome instance returned by launchHeadlessChrome. */
export async function stopHeadlessChrome(child: ChildProcess, port?: number): Promise<void> {
  if (port) {
    try {
      const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (version.ok) {
        const endpoint = (await version.json() as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl;
        if (endpoint) {
          const socket = new WebSocket(endpoint);
          const opened = await Promise.race([
            new Promise<boolean>(resolve => {
              socket.addEventListener('open', () => resolve(true), { once: true });
              socket.addEventListener('error', () => resolve(false), { once: true });
            }),
            sleep(1000).then(() => false)
          ]);
          if (opened && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
            await Promise.race([
              new Promise<void>(resolve => socket.addEventListener('close', () => resolve(), { once: true })),
              sleep(1000)
            ]);
          }
          socket.close();
        }
      }
    } catch { /* Fall back to terminating the owned process tree below. */ }
  }
  const exited = child.exitCode === null
    ? new Promise<void>(resolve => child.once('exit', () => resolve()))
    : Promise.resolve();
  if (process.platform === 'win32' && child.pid) {
    await Promise.race([
      new Promise<void>(resolve => {
        execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], () => resolve());
      }),
      sleep(5000)
    ]);
  } else if (child.exitCode === null) {
    child.kill('SIGTERM');
  }
  if (child.exitCode === null) await Promise.race([exited, sleep(5000)]);
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(1000)]);
  }
  await sleep(500);
}

export interface HeadlessChromeInstance {
  child: ChildProcess;
  profileDirectory: string;
  port: number;
}

async function reserveLoopbackPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => resolve());
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local Chrome debugging port.');
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return address.port;
}

/** Launch Chrome and wait for its bound CDP endpoint instead of racing the DevToolsActivePort file. */
export async function launchHeadlessChrome(
  executable: string,
  options: { windowSize?: string; profilePrefix?: string; timeoutMs?: number } = {}
): Promise<HeadlessChromeInstance> {
  if (!existsSync(executable)) throw new Error(`Chrome executable does not exist: ${executable}`);
  const port = await reserveLoopbackPort();
  // Some sandboxed Windows hosts expose a temp directory where Chrome can
  // create files but cannot atomically rename its profile databases. Keep the
  // disposable profile under the checked-out repo, where the test runner has
  // write access, so Chrome can bring up its DevTools endpoint reliably.
  const profileRoot = fileURLToPath(new URL('../..', import.meta.url));
  const profileDirectoryRoot = join(profileRoot, '.tmp-e2e-profiles');
  mkdirSync(profileDirectoryRoot, { recursive: true });
  const profileDirectory = mkdtempSync(join(profileDirectoryRoot, options.profilePrefix ?? 'auditsphere-e2e-'));
  const child = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--window-size=${options.windowSize ?? '1440,900'}`,
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*',
    `--user-data-dir=${profileDirectory}`, '--no-first-run', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  let spawnError: Error | undefined;
  let stderrOutput = '';
  let endpointError = 'the endpoint has not returned a response';
  child.once('error', error => { spawnError = error; });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => { stderrOutput = (stderrOutput + String(chunk)).slice(-4000); });
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  try {
    while (Date.now() < deadline) {
      const stderr = stderrOutput.trim() ? ` Browser stderr: ${stderrOutput.trim()}` : '';
      if (spawnError) throw new Error(`Chrome could not start: ${spawnError.message}.${stderr}`);
      if (child.exitCode !== null) throw new Error(`Chrome exited before exposing CDP (exit ${child.exitCode}).${stderr}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          await response.json();
          return { child, profileDirectory, port };
        }
      } catch (error) {
        endpointError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
      await sleep(100);
    }
    const stderr = stderrOutput.trim() ? ` Browser stderr: ${stderrOutput.trim()}` : '';
    throw new Error(`Chrome did not expose its debugging endpoint on 127.0.0.1:${port} within ${options.timeoutMs ?? 30000} ms. Last endpoint request: ${endpointError}.${stderr}`);
  } catch (error) {
    await stopHeadlessChrome(child);
    let cleanupError: unknown;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        cleanupError = undefined;
        break;
      } catch (reason) {
        cleanupError = reason;
        await sleep(100);
      }
    }
    if (cleanupError) console.warn(`Chrome profile cleanup was deferred for ${profileDirectory}: ${String(cleanupError)}`);
    throw error;
  }
}
