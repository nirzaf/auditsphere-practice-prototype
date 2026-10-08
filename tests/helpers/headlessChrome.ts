import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Stop only the Chrome process tree returned by launchHeadlessChrome. */
export async function stopHeadlessChrome(child: ChildProcess): Promise<void> {
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

/** Remove an isolated Chrome profile, tolerating transient Windows file locks. */
export async function removeHeadlessChromeProfile(profileDirectory: string): Promise<void> {
  let cleanupError: unknown;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      return;
    } catch (reason) {
      if (!reason || typeof reason !== 'object' || !['EPERM', 'EBUSY'].includes(String((reason as NodeJS.ErrnoException).code))) throw reason;
      cleanupError = reason;
      await sleep(250);
    }
  }
  if (cleanupError) console.warn(`Could not remove temporary Chrome profile yet: ${profileDirectory}`, cleanupError);
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
  const profileDirectory = mkdtempSync(join(tmpdir(), options.profilePrefix ?? 'auditsphere-e2e-'));
  const child = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--window-size=${options.windowSize ?? '1440,900'}`,
    `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*',
    `--user-data-dir=${profileDirectory}`, '--no-first-run', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  let spawnError: Error | undefined;
  child.once('error', error => { spawnError = error; });
  const deadline = Date.now() + (options.timeoutMs ?? 30000);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`Chrome could not start: ${spawnError.message}`);
      if (child.exitCode !== null) throw new Error(`Chrome exited before exposing CDP (exit ${child.exitCode}).`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          await response.json();
          return { child, profileDirectory, port };
        }
      } catch { /* Chrome has not bound its debugging endpoint yet. */ }
      await sleep(100);
    }
    throw new Error(`Chrome did not expose its debugging endpoint on 127.0.0.1:${port} within ${options.timeoutMs ?? 30000} ms.`);
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
