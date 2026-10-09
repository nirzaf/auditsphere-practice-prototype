# Bulk client and contact import

The Client registry provides a Partner APPROVER workflow for importing clients, their primary contacts, group affiliations, and primary contact routes. Import files are committed to the workspace as immutable `TEMPLATE` CSVs. Validation creates a report only; no client, contact, route, or affiliation is created until a Partner applies an error-free run.

## CSV format

Use UTF-8 CSV with a header row. The parser accepts quoted commas, escaped quotes, CRLF/LF line endings, and a UTF-8 BOM. Header names are case-insensitive. Unknown and duplicate headers are rejected.

| Column | Required | Meaning / accepted values |
|---|---:|---|
| `external_ref` | Yes | Unique source identifier within this file; 1–200 characters. Used only to connect subsidiaries and resume a run. |
| `client_code` | Yes | Unique client code; must also be unique against the current workspace. |
| `legal_name` | Yes | Legal entity name. |
| `trading_name` | No | Trading name. |
| `entity_type` | Yes | `HOLDING`, `SUBSIDIARY`, or `STANDALONE`. |
| `parent_external_ref` | No | For a subsidiary, the `external_ref` of its parent in the same file. Other entity types must leave this blank. |
| `relationship` | Required for subsidiaries | Relationship description, such as `Wholly owned subsidiary`; maximum 200 characters. |
| `commercial_registration` | No | Commercial registration number. |
| `tax_id` | No | Tax identifier. |
| `industry` | Yes | Industry description. |
| `address` | Yes | Registered address. |
| `country_code` | Yes | Two-letter ISO-style country code, for example `QA`. |
| `contact_name` | Yes | Primary contact’s full name. |
| `contact_email` | No | Primary contact email; valid email syntax is required when present. |
| `contact_phone` | No | Primary contact phone; at least seven characters when present. At least one of email or phone is required. |
| `contact_title` | Yes | Primary contact title. |
| `contact_role` | Yes | `MD_GM`, `CFO_FINANCE_DIRECTOR`, `CHIEF_ACCOUNTANT_LIAISON`, or `OTHER`. |
| `contact_is_signatory` | No | `true` or `false`; blank defaults to `false`. |
| `effective_from` | Yes | Contact effective date in `YYYY-MM-DD` format. |
| `route_purposes` | No | Optional `|`-separated set of `PROPOSAL`, `EL`, `FINAL_REPORT`, `INVOICE`, `RECEIPT`, `PBC`, and `HOLDING_LETTER`. When blank, routes follow the contact role defaults used by single-client creation. When present, this set replaces those defaults. |

Example using synthetic data:

```csv
external_ref,client_code,legal_name,trading_name,entity_type,parent_external_ref,relationship,commercial_registration,tax_id,industry,address,country_code,contact_name,contact_email,contact_phone,contact_title,contact_role,contact_is_signatory,effective_from,route_purposes
GROUP-001,ACME-GROUP,Acme Example Group,,HOLDING,,,,Manufacturing,Doha QA,QA,Sam Example,sam@example.test,,Managing Director,MD_GM,true,2026-01-01,
ENTITY-002,ACME-QA,Acme Example Qatar,,SUBSIDIARY,GROUP-001,Wholly owned subsidiary,CR-EXAMPLE-02,,Manufacturing,Doha QA,QA,Alex Example,,+97455550123,Finance Director,CFO_FINANCE_DIRECTOR,false,2026-01-01,INVOICE|RECEIPT
ENTITY-003,ACME-OPS,Acme Example Operations,,STANDALONE,,,,Professional services,Doha QA,QA,Taylor Example,taylor@example.test,,Audit liaison,CHIEF_ACCOUNTANT_LIAISON,false,2026-01-01,
```

## Workflow and recovery

1. In the Client registry, select a UTF-8 `.csv` file no larger than 25 MiB and choose **Upload and validate CSV**.
2. Review every reported source row and field. A rejected report cannot be applied; correct the source file and validate the corrected file as a new import.
3. For a zero-error `VALIDATED` run, choose **Apply validated import**. The Worker applies at most 25 client rows in each atomic D1 command batch (below the 500-row contract limit), creates parents before subsidiaries, and records the committed source row-to-client/contact map.
4. If the browser or request stops during apply, retry with the displayed run ID while the page remains open. The row map skips committed rows. A repeated validate of identical bytes is rejected because the source SHA-256 is unique per workspace.

Validation uses the same strict client/contact command schema as single-record entry. Apply uses the same client-create and client-affiliation statement builders, preserving contact role defaults, route rules, and existing business constraints. Audit events are chained for each created client, contact, contact route, and affiliation.

## Incumbent export mapping status

The canonical import contract is available, but the incumbent platform export mapping remains unapproved. The platform name, anonymized source export, real-world column mapping, and day-one data decision must be supplied and reviewed through [SP-03](../plan/spikes/SP-03-incumbent-platform-export.md). Do not infer a source platform or place client records in fixtures. The importer intentionally accepts this canonical schema until the owner-approved mapping is available.

The five-thousand-row validation and application performance targets require a staging workspace and representative synthetic data. Production workspace timing is not an acceptance substitute.
