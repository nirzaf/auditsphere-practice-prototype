import { readFile } from 'node:fs/promises';

const endpoint = 'https://auditsphere-sp01-hash-bench-20261008.quadrate-lk.workers.dev';
const key = (await readFile(new URL('../../../../.sp01-bench-key', import.meta.url), 'utf8')).trim();
const delayArgument = process.argv.find((argument) => argument.startsWith('--delay-ms='));
const delayMs = delayArgument ? Number(delayArgument.slice('--delay-ms='.length)) : 0;

async function measure(algorithm, count) {
  let completed = 0;
  const errors = [];
  for (let sample = 0; sample < count; sample++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bench-key': key },
        body: JSON.stringify({ algorithm, sample }),
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) {
        errors.push({ sample, status: response.status, body: await response.text() });
        break;
      }
      const result = await response.json();
      if (result.algorithm !== algorithm || result.sample !== sample) throw new Error('Worker returned a mismatched sample.');
      completed++;
    } catch (error) {
      errors.push({ sample, error: String(error) });
      break;
    }
    if (delayMs > 0 && sample + 1 < count) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { algorithm, samples: completed, errors };
}

const requestedAlgorithms = process.argv.slice(2).filter((argument) => !argument.startsWith('--delay-ms='));
const algorithms = requestedAlgorithms.length ? requestedAlgorithms : ['pbkdf2', 'argon2id', 'scrypt'];
const results = [];
for (const algorithm of algorithms) results.push(await measure(algorithm, 50));
console.log(JSON.stringify(results, null, 2));
