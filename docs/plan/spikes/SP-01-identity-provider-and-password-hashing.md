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

## Result
*(fill in)*
