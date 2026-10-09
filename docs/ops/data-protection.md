# Data protection inventory and residency decision

**Status:** preliminary inventory for firm/legal review. It is not a legal assessment or approval to use real client data. Reviewed 2026-10-08.

## Processing inventory

This inventory is derived from the current Worker migrations and architecture. It identifies data classes, likely purpose, stores and expected processors; the firm must confirm controller/processor roles, lawful basis, retention and transfer terms before production data is used.

| Data class | Examples and current locations | Purpose | Potential processor / recipient | Retention decision |
|---|---|---|---|---|
| Client organization and contact details | `clients` (legal/trading name, registration/tax identifiers, address, industry); `contacts` (name, email, phone, title, relationship); `contact_routes` | Client administration and authorised communication | Cloudflare Worker + D1; Cloudflare Email service or separately selected email API if enabled | Firm to confirm contact retention and deletion/archival policy |
| Prospect and commercial records | `leads`, proposals, proposal versions, acceptance/engagement-letter records and dispatch metadata; may contain contact names/emails and correspondence | Intake, proposal, acceptance and engagement administration | Cloudflare Worker + D1/R2; configured mail processor for outbound messages | Firm to confirm lead and declined-proposal retention |
| Staff and access context | `staff_members` (name/email/grade), `actor_profiles` (persona and staff/contact link), actor IDs on business records; existing app currently lets a user select a persona and is not a production identity system | Assign work and attribute recorded actions | Cloudflare Worker + D1; Microsoft Entra only if the future OIDC story is implemented | Firm to set account lifecycle and access-log periods; authenticated access is a production gate |
| Engagement, audit and accounting records | `engagements`, risk/ownership records, confirmations, workpapers, trial-balance lines, sampling/fieldwork/review/reporting tables, and related revisions | Deliver audit/accounting work and preserve its evidence | Cloudflare Worker + D1; Cloudflare R2 for uploaded, generated, released and archived files | Firm/legal adviser to confirm professional and contractual retention term; never infer from a UI hold flag |
| Uploaded and generated file content | R2 object bytes; D1 `file_versions` contains names, MIME type, size, SHA-256, purpose, object key and engagement/client links | PBC exchange, evidence, generated reports, release and archive | Cloudflare R2 and Worker; optional SharePoint mirror only if enabled | Firm to confirm retention and access policy; verify R2 locks separately and do not describe app metadata as external preservation |
| Audit, operational and queued-work metadata | D1 `audit_events` (`actor_user_id`, command/entity/scope IDs and optional `details_json`); `operational_access_events`; `outbox_jobs` JSON payloads/status/error codes; structured Worker logs | Accountability, replay/idempotency, monitoring and support | Cloudflare D1/Workers observability; email/alert provider if configured | Define distinct audit, security, delivery and platform-log periods; inspect payloads for unnecessary personal data |
| Browser and request context | Current UI stores workspace/selected actor/persona/scope locally; request headers currently carry actor/persona; Worker logs request ID, route pattern, method, status and duration | Select local workspace and diagnose requests | User's browser and Cloudflare Workers | Keep synthetic-only until E03 authentication removes self-selection and derives actor from a session |
| Outbound communications | Recipient address, message content and status held by dispatch/outbox records; provider can receive message and attachment data | User-requested proposal, engagement and client communications | Cloudflare Email service or the specifically configured API provider; recipient's mail service | Confirm message and provider-log retention; no outbound production delivery without sender/domain approval |

No live tenant was queried for this inventory. Optional Microsoft integrations and live client data remain disabled for prototype acceptance. Table names above are implementation pointers, not a complete records schedule; migrations and payload contents must be reviewed again before go-live.

## Cloudflare data-location findings

Checked against Cloudflare's current product documentation on 2026-10-08:

- D1 defaults to a primary location near database creation. Its current location hints include `apac`, but location hints are best-effort and Cloudflare does not offer a Middle East (`me`) D1 location. D1 creation-time jurisdictions are `eu`, `fedramp`, and `us`; they cannot be changed after database creation. A D1 jurisdiction governs database storage/operation, not where Workers may access it.
- R2 location hints also include `apac` but are not guarantees. R2 storage jurisdictions are `eu`, `fedramp`, and `us`; the jurisdiction is immutable after bucket creation. Jurisdiction-bound R2 can be accessed by a Worker only when the binding includes the jurisdiction.
- D1/R2 therefore expose no documented Qatar or GCC jurisdiction. An `apac` hint is not a residency guarantee. Cloudflare's Data Localization Suite separately controls selected traffic processing and metadata/log locations, but availability and compatibility vary by product and are not a Qatar D1/R2 storage location.

These technical facts do not determine whether Qatar PDPPL, QFC rules, client contracts or professional requirements permit the proposed processing and transfers. The firm and its legal adviser must decide applicable regimes, processor terms, lawful basis, transfer safeguards and whether non-Qatar storage is acceptable before resource creation.

## Owner and legal-adviser decisions (D5)

Record an explicit answer for each item; until answered, keep E02-S01 resources uncreated and do not put real client data in the prototype.

| Decision | Required answer |
|---|---|
| Applicable law and client commitments | Confirm whether Qatar PDPPL, QFC Data Protection Regulations/Rules, client contracts, professional rules or other requirements apply to this firm and each client category. |
| Storage and processing location | State whether Qatar/GCC residency is mandatory, or whether the firm accepts Cloudflare's available D1/R2 jurisdictions and the specific selected jurisdiction. If Qatar/GCC is mandatory, select a storage provider/architecture that can meet it before provisioning. |
| Cross-border processing | Legal adviser to document whether and on what terms Workers processing, remote access, logs/analytics, email delivery, Entra and any SharePoint transfer may cross borders. |
| Retention | Confirm the default engagement/archive retention period, exceptions, legal holds and separate periods for contacts/leads, auth/security events, email receipts, backups and platform logs. |
| Roles and notices | Confirm whether the practice is controller or processor for each data flow, lawful basis/purpose, required notices and data-subject request process. |
| Subprocessors | Approve Cloudflare, Microsoft and the selected mail provider; record contracts/DPA, data categories, support access and transfer mechanism. |

### Working notes from official sources

- Qatar's legal portal lists Law No. 13 of 2016 on Protecting Personal Data Privacy, and the National Cyber Security Agency lists it among its publications. Have counsel confirm the authoritative Official Gazette text and any subsequent instruments.
- QFC's Data Protection Regulations 2021 factsheet describes six principles: lawful/fair/transparent processing; specified purposes; minimisation; accuracy; storage limitation; and appropriate security. It says firms must determine controller/processor status for each process. Counsel must determine whether the QFC regime applies here.
- This note records sources and questions, not an interpretation of the laws or a statement that a selected Cloudflare location is legally acceptable.

## Sources

- Qatar Law No. 13 of 2016, listed in Al Meezan's English legislation portal: https://www.almeezan.qa/EnglishLawsList.aspx?language=en
- Qatar National Cyber Security Agency publication: https://ncsa.gov.qa/en/publications/
- QFC Data Protection Office resources: https://www.qfc.qa/en/resource-centre
- Cloudflare D1 data location: https://developers.cloudflare.com/d1/configuration/data-location/
- Cloudflare R2 data location: https://developers.cloudflare.com/r2/reference/data-location/
- Cloudflare Data Localization Suite compatibility: https://developers.cloudflare.com/data-localization/compatibility/
