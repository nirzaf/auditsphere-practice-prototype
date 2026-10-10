# OWASP ASVS 4.0.3 Level 2 self-assessment — selected chapters

> **Status: INCOMPLETE.** This is an evidence inventory for the no-application-auth, synthetic-data profile. It is not a certification, a production readiness claim, or approval to process real audit records. The application's four self-selected personas do not prove caller identity.

## Scope and method

This checklist includes the 126 Level 2 requirements in the requested chapters, selected using the Level 2 column in the [OWASP ASVS 4.0.3 verification CSV](https://github.com/OWASP/ASVS/blob/51aa459ebf8fc35b455442d9a0ecc401d94e224f/4.0/docs_en/OWASP%20Application%20Security%20Verification%20Standard%204.0.3-en.csv). Counts: V2 15, V3 17, V4 9, V5 30, V7 12, V8 15, V12 15, V13 13. Current status totals: 34 Pass, 39 Fail, and 53 N/A. The descriptions are intentionally not copied from the standard; use the control ID to look up its normative text.

**Status meanings:** Pass = source-level evidence is identified in this pass; it does not replace the story's required browser/E2E or operational verification. Fail = unmet or required evidence has not been collected. N/A = the feature/control is absent from this explicitly scoped application profile; the rationale names the boundary. N/A is not a security assurance.

For Fail entries, no separate owner-approved follow-up stories have been recorded. E06-S01 remains open until each failure is resolved or the owner approves a linked follow-up story. The cross-surface CSP browser sweep passed on 2026-10-10; that result does not close control-specific findings. Controls dependent on tenant policy, Cloudflare settings, privacy/legal policy, or a trusted perimeter need independent operational evidence. Current local engineering evidence includes `npm run test:unit` (201 passed, 1 opt-in stress test skipped), `npm run lint`, `npm run cloud:typecheck`, and `npm run build`; this does not close the external or full-browser acceptance gates.

## Checklist

| ASVS control | Status | Evidence / rationale |
|---|---|---|
| V2.7.1 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.7.2 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.7.3 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.7.4 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.7.5 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.7.6 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.1 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.2 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.3 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.4 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.5 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.8.6 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.9.1 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.9.2 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V2.9.3 | N/A | No application authentication or second-factor verifier exists in the authorized no-auth scope; see docs/quality/testing.md scope. This is not evidence of identity assurance. |
| V3.1.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.2.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.2.2 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.2.3 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.2.4 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.3.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.3.3 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.3.4 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.4.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.4.2 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.4.3 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.4.4 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.4.5 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.5.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.5.2 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.5.3 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V3.7.1 | N/A | No application login/session mechanism exists in the authorized no-auth scope; browser storage contains only workflow context. See src/shared/api/business.ts and docs/quality/testing.md. |
| V4.1.1 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.1.2 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.1.3 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.1.5 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.2.1 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.2.2 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.3.1 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.3.2 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V4.3.3 | Fail | No authenticated identity binds the selected actor/persona to the caller; workflow role checks do not establish trusted access control (worker/index.ts:5-8, worker/business.ts:608-675). |
| V5.1.1 | Fail | The API rejects duplicate query keys, the email provider rejects duplicate scalar `message` fields, and the archive-download form requires exactly one ticket (`worker/index.ts`, `worker/emailProvider/handler.ts`, `tests/unit/securityHeaders.test.ts`, `tests/unit/emailProvider.test.ts`). A complete request-source review remains open; the CSP/browser sweep passed on 2026-10-10. |
| V5.1.2 | Pass | Strict command payload schemas reject unknown fields (worker/business.ts:1417). |
| V5.1.3 | Pass | Business request payloads are schema-validated (worker/business.ts:1417); JSON bodies have a streaming byte ceiling (worker/http.ts:31-65). |
| V5.1.4 | Pass | Command payloads use bounded, typed Zod schemas (worker/business.ts command schema declarations and :1417). |
| V5.1.5 | N/A | The application has no HTTP redirect/forward handler or user-controlled redirect destination; SPA route hashes resolve only through the canonical route catalog (`worker/index.ts`, `src/components/business/BusinessModuleNavigation.tsx`). |
| V5.2.1 | N/A | The product has no user-supplied XML/XPath, SVG, WYSIWYG HTML, or executable template editor in the current UI/API scope; revisit if that input surface is added. |
| V5.2.2 | Pass | Unstructured command text uses schema-defined type and length constraints (worker/business.ts command schema declarations). |
| V5.2.3 | Pass | The email provider validates sender/recipient addresses and rejects CR/LF/NUL in subjects and attachment filenames; sender display names with header breaks are omitted, and repeated scalar message fields fail closed (`worker/emailProvider/handler.ts`, `tests/unit/emailProvider.test.ts`). |
| V5.2.4 | Pass | Static application and Worker code uses no dynamic eval execution; JSON uses JSON.parse (worker/http.ts:31-65). |
| V5.2.5 | N/A | No user-authorable executable template or template engine exists in the current product scope. Documents are composed through typed text APIs (`jsPDF.text`, `docx` `TextRun`); source review found no raw HTML, DOM parser, or dynamic template execution sinks (`worker/commercialDocument.ts`, `worker/proposalDocument.ts`, `worker/reportingDocument.ts`, `worker/reportingRepresentationDocument.ts`). Reassess if user-authored rich templates are introduced. |
| V5.2.6 | N/A | No request URL or file metadata reaches an outbound fetch. Network targets are constants or trusted deployment configuration: Microsoft login/Graph, Cloudflare Email Sending, internal Worker service bindings, and built static assets (`worker/integrations/sharepoint.ts`, `worker/emailProvider/handler.ts`, `worker/businessOutbox.ts`, `worker/index.ts`). Reassess if users can configure remote endpoints. |
| V5.2.7 | N/A | The product has no user-supplied XML/XPath, SVG, WYSIWYG HTML, or executable template editor in the current UI/API scope; revisit if that input surface is added. |
| V5.2.8 | N/A | The product has no user-supplied XML/XPath, SVG, WYSIWYG HTML, or executable template editor in the current UI/API scope; revisit if that input surface is added. |
| V5.3.1 | Pass | Dynamic UI values render through React text nodes; generated PDFs and DOCX use text APIs, and API output is JSON rather than interpolated HTML (`src/`, `worker/commercialDocument.ts`, `worker/proposalDocument.ts`, `worker/reportingDocument.ts`, `worker/reportingRepresentationDocument.ts`). No raw HTML output sink was found in the source review. |
| V5.3.2 | Fail | Control-specific negative-input/security evidence and complete static review remain open; the CSP/browser sweep passed on 2026-10-10 (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V5.3.3 | Pass | Source review found no `dangerouslySetInnerHTML`, HTML insertion APIs, or DOM parsing sinks; React encodes text by default. The 2026-10-10 CDP accessibility sweep also recorded zero CSP violations and zero uncaught browser exceptions (`tests/e2e/accessibility.test.ts`, `docs/plan/stories/E06-S01-security-headers-and-asvs.md`). |
| V5.3.4 | Pass | D1 query sites use prepared statements and bind request-derived values (worker/business*.ts). |
| V5.3.5 | Fail | Control-specific negative-input/security evidence and complete static review remain open; the CSP/browser sweep passed on 2026-10-10 (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V5.3.6 | Pass | JSON request parsing uses JSON.parse, not eval (worker/http.ts:31-65). |
| V5.3.7 | N/A | No LDAP integration or directory query exists in the Worker route inventory (worker/index.ts). |
| V5.3.8 | N/A | The Cloudflare Worker has no operating-system command execution surface; confirm again if runtime architecture changes. |
| V5.3.9 | N/A | The Worker has no local filesystem include/require surface for request data; user file bytes are stored through R2 (worker/business.ts:1990-2129). |
| V5.3.10 | N/A | The product has no user-supplied XML/XPath, SVG, WYSIWYG HTML, or executable template editor in the current UI/API scope; revisit if that input surface is added. |
| V5.4.1 | N/A | TypeScript/JavaScript Worker code has no native pointer arithmetic or printf-style format-string API; revisit if unmanaged/native code is introduced. |
| V5.4.2 | N/A | TypeScript/JavaScript Worker code has no native pointer arithmetic or printf-style format-string API; revisit if unmanaged/native code is introduced. |
| V5.4.3 | Fail | Control-specific negative-input/security evidence and complete static review remain open; the CSP/browser sweep passed on 2026-10-10 (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V5.5.1 | Fail | Control-specific negative-input/security evidence and complete static review remain open; the CSP/browser sweep passed on 2026-10-10 (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V5.5.2 | N/A | No XML parser consumes uploaded OOXML content. Office uploads are inspected as bounded ZIP members and required package paths; generated documents use structured document APIs (`worker/officePackage.ts`, `worker/reportingRepresentationDocument.ts`). Reassess if XML parsing is added. |
| V5.5.3 | Fail | Control-specific negative-input/security evidence and complete static review remain open; the CSP/browser sweep passed on 2026-10-10 (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V5.5.4 | Pass | JSON bodies are parsed with JSON.parse inside a bounded parser (worker/http.ts:31-65). |
| V7.1.1 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.1.2 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.1.3 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.1.4 | Pass | API log events include request ID, registered route, method, status, duration; scheduled events carry UTC timestamps (worker/index.ts:710-718, 770-790). |
| V7.2.1 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.2.2 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.3.1 | Pass | Structured log records use JSON.stringify and stable route/error fields (worker/index.ts:710-718, 770-783). |
| V7.3.3 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.3.4 | Fail | Cloudflare log access/retention configuration and control-specific coverage are not verified; the self-assessment remains open (worker/index.ts, docs/ops/runbook.md). |
| V7.4.1 | Pass | Unexpected errors return a generic service message and request ID (worker/errors.ts:28-46). |
| V7.4.2 | Pass | Matched route handlers have a central exception-to-response boundary (worker/index.ts:766-783). |
| V7.4.3 | Pass | The Worker has a last-resort catch at the route boundary and guarded scheduled-task handlers (worker/index.ts:766-783, 803-839). |
| V8.1.1 | Pass | API response finalization sets Cache-Control: no-store; shared JSON responses also prohibit caching (worker/index.ts:710-724, worker/http.ts:8-12). |
| V8.1.2 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.1.3 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.1.4 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.2.1 | Pass | API responses use no-store at the route boundary (worker/index.ts:710-724). |
| V8.2.2 | Pass | Browser storage persists only workspace/actor/persona/client/engagement IDs and schema version, not business records or credentials (src/shared/api/business.ts:1-15, src/services/businessWorkspace.ts:14-33). |
| V8.2.3 | N/A | Not applicable to the current application surface as defined in the official ASVS 4.0.3 control; reassess if the corresponding feature is introduced. |
| V8.3.1 | Pass | Archive downloads use a five-minute single-use hashed ticket submitted in a bounded same-origin POST form body; unit and browser tests verify the fixed endpoint and reject URL-based bearer tokens (`worker/businessReportingQuery.ts`, `worker/index.ts`, `tests/unit/archiveDownloadTickets.test.ts`, `tests/e2e/businessReporting.test.ts`). Both test suites ran in successful CI deployment run 37943011263. |
| V8.3.2 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.3 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.4 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.5 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.6 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.7 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V8.3.8 | Fail | Privacy inventory, subject rights/notice, access audit completeness, at-rest crypto evidence, and approved retention policy are not demonstrated (docs/ops/runbook.md, docs/ops/integrations.md). |
| V12.1.1 | Pass | File reservations and byte validation cap a file at 25 MiB (worker/business.ts:1168, 1713-1774). |
| V12.1.2 | Pass | OOXML uploads stream every ZIP member and enforce actual decompressed byte ceilings (32 MiB/member, 64 MiB/archive) and a 2,048-member limit; the focused test verifies complete required parts, forged size metadata, member-count rejection, and duplicate-name rejection (`worker/officePackage.ts`, `worker/business.ts:1794-1817`, `tests/unit/officePackage.test.ts`, 4/4 passed). |
| V12.1.3 | Fail | The upload path caps each object but no per-user file-count or storage quota is evidenced; workflow actors are self-selected (worker/business.ts:1168, worker/business.ts:2420-2450). |
| V12.2.1 | Fail | OOXML validation now streams and integrity-checks every ZIP member and requires key package parts, but does not validate the full XML schemas or scan for malware (worker/officePackage.ts, worker/business.ts:1794-1817). |
| V12.3.1 | Pass | R2 object keys are generated from server-controlled reservation IDs and content digests; original filename is metadata (worker/business.ts:2093-2129). |
| V12.3.2 | Pass | Request filenames are metadata and never filesystem paths; staged objects use server-generated R2 keys (worker/business.ts:1990-2129). |
| V12.3.3 | N/A | Application routes do not fetch user-supplied remote file URLs; external integration endpoints are service configuration, not file metadata. |
| V12.3.4 | Pass | Downloads are attachments with encoded filename metadata (worker/business.ts:2778-2787). |
| V12.3.5 | Pass | Untrusted filenames are not passed to OS APIs; Worker stores bytes in R2 (worker/business.ts:1990-2129). |
| V12.3.6 | Pass | App CSP restricts scripts to the same origin and static Worker assets (worker/index.ts:720-725). |
| V12.4.1 | Pass | Uploaded bytes are stored in R2 and served only through scoped Worker routes (worker/business.ts:2769-2787; wrangler.jsonc). Built-in Cloudflare dashboard inspection on 2026-10-09 showed Public Access: Disabled for bucket auditsphere-prototype-files. |
| V12.4.2 | Fail | No antivirus or malware scanning integration runs before staged bytes can be committed (worker/business.ts:2128-2179). |
| V12.5.1 | Pass | File types are allowlisted by verifyBusinessFileBytes; downloads are attachment responses (worker/business.ts:1769-1820, 2782-2787). |
| V12.5.2 | Pass | Downloads set Content-Disposition: attachment, nosniff, and sandbox CSP (worker/business.ts:2782-2787). |
| V12.6.1 | N/A | Application routes do not fetch user-supplied remote file URLs; external integration endpoints are service configuration, not file metadata. |
| V13.1.1 | Fail | Required control-specific evidence or negative testing is not recorded; do not treat code presence as a pass (docs/plan/stories/E06-S01-security-headers-and-asvs.md). |
| V13.1.3 | Pass | The one-time archive capability is submitted in a bounded same-origin POST form body to `/api/archive-download`; the unit and browser assertions reject URL-based tickets (`worker/index.ts`, `tests/unit/archiveDownloadTickets.test.ts`, `tests/e2e/businessReporting.test.ts`). Both test suites ran in successful CI deployment run 37943011263. |
| V13.1.4 | Fail | Authorization uses caller-selected persona/actor context, not a trusted identity (worker/index.ts:5-8, worker/business.ts:608-675). |
| V13.1.5 | Pass | JSON body reader rejects unexpected content types; raw file upload must match the reserved media type (worker/http.ts:31-65, worker/business.ts:2428-2437). |
| V13.2.1 | Fail | Authorization uses caller-selected persona/actor context, not a trusted identity (worker/index.ts:5-8, worker/business.ts:608-675). |
| V13.2.2 | Pass | Business commands are validated by strict Zod schemas before mutation (worker/business.ts:1417). |
| V13.2.3 | N/A | No authenticated cookie-based API session exists in this scope; same-origin checks are still applied to state-changing requests (worker/http.ts:100-108). |
| V13.2.5 | Pass | JSON routes require application/json; upload routes compare declared and reserved media types (worker/http.ts:31-38, worker/business.ts:2428-2437). |
| V13.2.6 | Fail | HSTS is configured in the Worker response path, but current TLS-only edge configuration and deployed protocol behavior were not revalidated (worker/index.ts:700-735). |
| V13.3.1 | N/A | No SOAP or GraphQL routes are registered; the route table is REST/Worker-only (worker/index.ts, worker/router.ts). |
| V13.3.2 | N/A | No SOAP or GraphQL routes are registered; the route table is REST/Worker-only (worker/index.ts, worker/router.ts). |
| V13.4.1 | N/A | No SOAP or GraphQL routes are registered; the route table is REST/Worker-only (worker/index.ts, worker/router.ts). |
| V13.4.2 | N/A | No SOAP or GraphQL routes are registered; the route table is REST/Worker-only (worker/index.ts, worker/router.ts). |

## Current disposition

- **Pass:** 31; **Fail:** 46; **N/A:** 49.
- Access control remains a known scope limitation: this prototype permits self-selected workflow personas and is not suitable for real audit data or unrestricted production access.
- The local Wrangler browser sweep is still blocked by the Windows miniflare-email-store CreateDirectory: Access is denied error documented in E06-S01. Do not substitute the live public Worker for this test.
- Cloudflare email mailbox delivery, SharePoint live connectivity, UAT, and production/perimeter settings remain separate external acceptance gates; see [integration configuration](../ops/integrations.md).

