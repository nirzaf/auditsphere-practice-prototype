import { argon2idAsync } from '../../../../node_modules/@noble/hashes/argon2.js';
import { pbkdf2Async } from '../../../../node_modules/@noble/hashes/pbkdf2.js';
import { sha256 } from '../../../../node_modules/@noble/hashes/sha2.js';
import { scryptAsync } from '../../../../node_modules/@noble/hashes/scrypt.js';

const encoder = new TextEncoder();
const samplePassword = 'Synthetic audit benchmark password 123!';
const fixedSalt = encoder.encode('AuditSphere-SP01-benchmark-salt-v1');

async function derive(algorithm) {
  if (algorithm === 'pbkdf2') {
    await pbkdf2Async(sha256, samplePassword, fixedSalt, { c: 600_000, dkLen: 32 });
  } else if (algorithm === 'argon2id') {
    await argon2idAsync(samplePassword, fixedSalt, { m: 19 * 1024, t: 2, p: 1, dkLen: 32 });
  } else if (algorithm === 'scrypt') {
    await scryptAsync(samplePassword, fixedSalt, { N: 2 ** 17, r: 8, p: 1, dkLen: 32, maxmem: 140 * 1024 * 1024 });
  } else {
    throw new Error('Unsupported benchmark algorithm.');
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || request.headers.get('x-bench-key') !== env.BENCH_KEY) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const body = await request.json();
      const { algorithm, sample } = body;
      if (!['pbkdf2', 'argon2id', 'scrypt'].includes(algorithm) || !Number.isInteger(sample) || sample < 0 || sample >= 50) {
        return Response.json({ error: 'Invalid sample request.' }, { status: 400 });
      }
      await derive(algorithm);
      console.log(`HASH_BENCH ${algorithm} ${sample}`);
      return Response.json({ algorithm, sample });
    } catch (error) {
      console.log(`HASH_BENCH_ERROR ${String(error)}`);
      return Response.json({ error: 'Benchmark derivation failed.' }, { status: 503 });
    }
  }
};
