import type { Env } from '../env';
import { fromBase64Url, toBase64Url } from './tokens';

const MAX_CACHE_AGE = 24 * 60 * 60 * 1000;
const UNKNOWN_KID_REFRESH_INTERVAL = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 5 * 60;

export interface AuthDeps {
  fetch: typeof fetch;
  now: () => number;
  randomBytes: (length: number) => Uint8Array;
}

export function createAuthDeps(_env: Env): AuthDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    randomBytes: length => crypto.getRandomValues(new Uint8Array(length))
  };
}

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}
interface OidcJwk extends JsonWebKey { kid?: string; alg?: string; use?: string; }
interface JwkSet { keys: OidcJwk[]; }
interface CacheEntry<T> { value: T; expiresAt: number; }
const discoveryCache = new Map<string, CacheEntry<DiscoveryDocument>>();
const jwksCache = new Map<string, CacheEntry<JwkSet>>();
const jwksRefreshAt = new Map<string, number>();

export function clearOidcCachesForTests(): void {
  discoveryCache.clear(); jwksCache.clear(); jwksRefreshAt.clear();
}

function randomString(deps: AuthDeps, bytes = 32): string {
  return toBase64Url(deps.randomBytes(bytes));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function tenantConfig(env: Env): { tenant: string; clientId: string; clientSecret: string; redirectUri: string } {
  const { OIDC_TENANT_ID: tenant, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: clientSecret, OIDC_REDIRECT_URI: redirectUri } = env;
  if (!tenant || !clientId || !clientSecret || !redirectUri) throw new Error('OIDC is not configured');
  let redirect: URL;
  try { redirect = new URL(redirectUri); } catch { throw new Error('OIDC redirect URI is invalid'); }
  if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost' && redirect.hostname !== '127.0.0.1') throw new Error('OIDC redirect URI must use HTTPS');
  return { tenant: tenant.toLowerCase(), clientId, clientSecret, redirectUri: redirect.toString() };
}

export async function signStateCookie(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)));
  return `${encoded}.${toBase64Url(signature)}`;
}

export async function verifyStateCookie(value: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [encoded, signature, extra] = value.split('.');
    if (!encoded || !signature || extra) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(encoded));
    if (!valid) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

async function fetchJson<T>(deps: AuthDeps, url: string): Promise<T> {
  const response = await deps.fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('OIDC provider request failed');
  return await response.json() as T;
}

export async function getDiscovery(env: Env, deps: AuthDeps): Promise<DiscoveryDocument> {
  const { tenant } = tenantConfig(env);
  const cached = discoveryCache.get(tenant);
  if (cached && cached.expiresAt > deps.now()) return cached.value;
  const value = await fetchJson<DiscoveryDocument>(deps, `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`);
  const expectedIssuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  for (const endpoint of [value.authorization_endpoint, value.token_endpoint, value.jwks_uri]) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com') throw new Error('OIDC discovery endpoint is not trusted');
  }
  if (value.issuer !== expectedIssuer) throw new Error('OIDC issuer does not match configured tenant');
  discoveryCache.set(tenant, { value, expiresAt: deps.now() + MAX_CACHE_AGE });
  return value;
}

async function getJwks(uri: string, deps: AuthDeps, force = false): Promise<JwkSet> {
  const cached = jwksCache.get(uri);
  if (!force && cached && cached.expiresAt > deps.now()) return cached.value;
  const value = await fetchJson<JwkSet>(deps, uri);
  if (!Array.isArray(value.keys)) throw new Error('OIDC key set is invalid');
  jwksCache.set(uri, { value, expiresAt: deps.now() + MAX_CACHE_AGE });
  return value;
}

function decodeJwtPart(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('OIDC token is invalid');
  return parsed as Record<string, unknown>;
}

export interface VerifiedIdToken {
  oid: string;
  email?: string;
  preferredUsername?: string;
  emailVerified: boolean;
  displayName: string;
}

export async function verifyIdToken(token: string, env: Env, nonce: string, deps: AuthDeps): Promise<VerifiedIdToken> {
  const { tenant, clientId } = tenantConfig(env);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('OIDC token is invalid');
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('OIDC token signing algorithm is invalid');
  const discovery = await getDiscovery(env, deps);
  let key = (await getJwks(discovery.jwks_uri, deps)).keys.find(candidate => candidate.kid === header.kid && candidate.kty === 'RSA' && (!candidate.alg || candidate.alg === 'RS256') && (!candidate.use || candidate.use === 'sig'));
  if (!key) {
    const lastRefresh = jwksRefreshAt.get(discovery.jwks_uri);
    if (lastRefresh !== undefined && deps.now() - lastRefresh < UNKNOWN_KID_REFRESH_INTERVAL) throw new Error('OIDC signing key is unknown');
    jwksRefreshAt.set(discovery.jwks_uri, deps.now());
    key = (await getJwks(discovery.jwks_uri, deps, true)).keys.find(candidate => candidate.kid === header.kid && candidate.kty === 'RSA' && (!candidate.alg || candidate.alg === 'RS256') && (!candidate.use || candidate.use === 'sig'));
  }
  if (!key) throw new Error('OIDC signing key is unknown');
  const imported = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, fromBase64Url(parts[2]), signed)) throw new Error('OIDC token signature is invalid');

  const now = Math.floor(deps.now() / 1000);
  const audience = claims.aud;
  if (claims.iss !== discovery.issuer || claims.tid !== tenant) throw new Error('OIDC tenant or issuer is invalid');
  if (!(audience === clientId || Array.isArray(audience) && audience.includes(clientId))) throw new Error('OIDC audience is invalid');
  if (claims.azp !== undefined && claims.azp !== clientId) throw new Error('OIDC authorized party is invalid');
  if (Array.isArray(audience) && audience.length > 1 && claims.azp !== clientId) throw new Error('OIDC authorized party is invalid');
  if (typeof claims.exp !== 'number' || claims.exp <= now - CLOCK_SKEW_SECONDS) throw new Error('OIDC token is expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + CLOCK_SKEW_SECONDS) throw new Error('OIDC token is not yet valid');
  if (typeof claims.iat !== 'number' || claims.iat > now + CLOCK_SKEW_SECONDS || claims.iat < now - 24 * 60 * 60 - CLOCK_SKEW_SECONDS) throw new Error('OIDC token issue time is invalid');
  if (claims.nonce !== nonce) throw new Error('OIDC nonce is invalid');
  if (typeof claims.oid !== 'string' || !claims.oid) throw new Error('OIDC object identifier is missing');
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const preferredUsername = typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined;
  return {
    oid: claims.oid,
    email,
    preferredUsername,
    emailVerified: claims.email_verified === true,
    displayName: typeof claims.name === 'string' ? claims.name.slice(0, 200) : ''
  };
}

export function newOidcValues(deps: AuthDeps): { state: string; nonce: string; verifier: string } {
  return { state: randomString(deps), nonce: randomString(deps), verifier: randomString(deps, 48) };
}

export function getOidcConfig(env: Env) { return tenantConfig(env); }
