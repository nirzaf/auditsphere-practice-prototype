import { argon2idAsync } from '@noble/hashes/argon2.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { BREACHED_SHA1 } from './breachedTop10k';
import { fromBase64Url, toBase64Url } from './tokens';

export interface PasswordParams { m: number; t: number; p: number }
const CURRENT: PasswordParams = { m: 19_456, t: 2, p: 1 };
const DUMMY = 'argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
// Offline SHA-1 hashes derived from SecLists' 10k-most-common.txt, itself sourced from known common/leaked passwords.
const BREACHED = new Set(BREACHED_SHA1.trim().split(/\s+/));

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function hashPassword(password: string, params: PasswordParams = CURRENT): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const digest = await argon2idAsync(password, salt, { ...params, version: 0x13, dkLen: 32, maxmem: 32 * 1024 * 1024 });
  return `argon2id$v=19$m=${params.m},t=${params.t},p=${params.p}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const match = /^argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(stored);
    if (!match) return false;
    const [, m, t, p, saltPart, hashPart] = match;
    const params = { m: Number(m), t: Number(t), p: Number(p) };
    if (params.m < 8 || params.m > 65_536 || params.t < 1 || params.t > 10 || params.p < 1 || params.p > 4) return false;
    const expected = fromBase64Url(hashPart);
    if (expected.length !== 32) return false;
    const actual = await argon2idAsync(password, fromBase64Url(saltPart), { ...params, version: 0x13, dkLen: 32, maxmem: 32 * 1024 * 1024 });
    return constantTimeEqual(actual, expected);
  } catch { return false; }
}

export function needsRehash(stored: string): boolean {
  const match = /^argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
  return !match || Number(match[1]) !== CURRENT.m || Number(match[2]) !== CURRENT.t || Number(match[3]) !== CURRENT.p;
}

export async function verifyAgainstDummy(password: string, stored?: string | null): Promise<boolean> {
  return verifyPassword(password, stored || DUMMY);
}

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}

export async function checkPasswordPolicy(password: string, options: { email: string }): Promise<{ valid: boolean; reason?: 'LENGTH' | 'EMAIL' | 'BREACHED' }> {
  const digest = bytesToHex(sha1(new TextEncoder().encode(password)));
  if (BREACHED.has(digest)) return { valid: false, reason: 'BREACHED' };
  if (password.length < 12 || password.length > 256) return { valid: false, reason: 'LENGTH' };
  const localPart = options.email.trim().toLowerCase().split('@')[0];
  if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) return { valid: false, reason: 'EMAIL' };
  return { valid: true };
}
