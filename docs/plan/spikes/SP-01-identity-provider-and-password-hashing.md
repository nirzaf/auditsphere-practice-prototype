# SP-01 — Identity provider and password-hashing parameters

| Field | Value |
|---|---|
| Time box | 1 agent session + owner input (≤ 2 days elapsed) |
| Blocks | E03-S01, E03-S02 |
| Output | ADR-0005 moved to **Accepted** (or superseded) + "Result" section below filled + any edits to E03 stories |

## Questions to answer
1. **Staff IdP (decision D1):** Is Microsoft Entra ID (the firm's existing tenant, which already hosts app registration "AuditSphere SharePoint UAT") acceptable for staff sign-in? Will the firm create a **separate** app registration for sign-in (recommended — do not reuse the SharePoint app's `Sites.Selected` credential)? Is MFA enforced by Conditional Access for all staff?
2. **Redirect URIs:** staging and production callback URLs (`https://<host>/api/auth/staff/callback`) — depends on D6.
3. **Claims:** confirm ID tokens are RS256, contain `oid`, `tid`, `email` or `preferred_username`, and the JWKS URI for the tenant (`https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys`).
4. **Client accounts:** confirm the spec's temporary-password + forced-reset model is wanted (vs magic-link only). Confirm temp-password lifetime (default 7 days) and lockout policy (default 5 attempts / 15 min).
5. **Hashing cost on Workers:** measure in a throwaway Worker on the firm's Cloudflare plan:
   - PBKDF2-SHA256 via `crypto.subtle.deriveBits` at 600,000 iterations (OWASP Password Storage Cheat Sheet — fetch current recommendation and record its date).
   - scrypt (N=2^17, r=8, p=1) and argon2id (m=19 MiB, t=2, p=1) via `@noble/hashes` (already installed at 2.2.0).
   Record wall time and CPU time p50/p95 over 50 runs each, and the plan's CPU limit.
6. **Session cookie:** confirm `SameSite=Lax` works with the Entra redirect and the SPA (same origin).

## Method
- Read Entra/OIDC docs and OWASP cheat sheets current at the time of the spike; cite URLs and access dates in the result.
- Benchmark code lives only in `docs/plan/spikes/SP-01-bench/` (or a gist) — **not** merged into `worker/`.

## Exit criteria
- Chosen algorithm/parameters with measured CPU time under 50 % of the plan's per-request CPU limit.
- Owner's written answers to Q1, Q2, Q4.
- ADR-0005 updated; E03-S01/S02 ACs edited if anything changed.

## Result — 2026-10-08

### Decisions

- **Staff identity provider:** Microsoft Entra ID, single-tenant OIDC. Use a dedicated sign-in app registration separate from the SharePoint `Sites.Selected` app. The owner has already selected Entra for this project and authorized developer-tenant setup. The tenant's Conditional Access policy must enforce MFA for staff; its current state is not yet verified.
- **Client credentials:** retain the requested temporary-password and forced-reset model. Temporary credentials expire after 7 days; login lockout is 5 failed attempts for 15 minutes.
- **Hash format:** Argon2id v=19, m=19,456 KiB, t=2, p=1, 16-byte random salt, 32-byte output. Store as `argon2id$v=19$m=19456,t=2,p=1$<salt_b64url>$<hash_b64url>`.
- **Sessions:** keep opaque 256-bit cookies, SHA-256 session-token storage, `HttpOnly; Secure; SameSite=Lax; Path=/`, 30-minute staff / 15-minute client idle expiry, and 12-hour absolute expiry.
- **Redirect URIs:** E02-S01 still owns final staging/production hosts. Register the exact `https://<environment-host>/api/auth/staff/callback` values when those hosts are finalized; do not reuse the SharePoint app or guess a production custom hostname.

### Cloudflare Worker benchmark

Ran the benchmark from `docs/plan/spikes/SP-01-bench/` on the developer account's temporary Worker `auditsphere-sp01-hash-bench-20261008`, version `88d77c0c-fef0-437f-aa2c-723ad7b6efe6`, with `cpu_ms=30000`. The Worker used synthetic inputs only, performed 50 derivations per option per run, and reported per-invocation `cpuTime` and `wallTime` from Wrangler tail traces. Repeated runs yielded more than 50 captured samples per option. Percentiles use nearest-rank sorting.

| Candidate | Captured samples | CPU p50 | CPU p95 | Wall p50 | Wall p95 | Notes |
|---|---:|---:|---:|---:|---:|---|
| PBKDF2-HMAC-SHA256, 600,000 iterations | 100 | 1,758 ms | 2,138 ms | 1,787 ms | 2,174 ms | Cloudflare WebCrypto rejects iteration counts above 100,000; measurements used the already-installed Noble implementation. |
| Argon2id, m=19 MiB, t=2, p=1 | 147 | 958 ms | 1,076 ms | 958 ms | 1,079 ms | OWASP-recommended baseline; p95 is 3.6% of the configured 30-second CPU limit. |
| scrypt, N=2^17, r=8, p=1 | 103 | 531 ms | 568 ms | 533 ms | 570 ms | Requires a 128 MiB working set, equal to the Workers memory limit; rejected due to lack of runtime memory headroom. |

Argon2id is selected: it is the current OWASP recommendation at this baseline and provides substantially more memory headroom than the tested scrypt parameters while meeting the CPU budget. OWASP also lists PBKDF2-HMAC-SHA256 at 600,000 iterations; its Worker CPU cost is higher and native WebCrypto does not accept that work factor. Sources checked 2026-10-08: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), and [Microsoft token claim validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).

The temporary benchmark Worker was deleted after measurement. Conditional Access enforcement and the final redirect hostnames remain pre-deployment checks for E03-S02; the selected password algorithm and parameters are final for E03-S01.
