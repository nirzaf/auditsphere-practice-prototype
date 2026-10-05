# Canonical audit lifecycle rehearsal

## Start

Use **Canonical Audit Lifecycle** in the scenario chooser. Preserve any existing local state before resetting. The current scenario starts with no invented clients, paid advances, acceptance decisions, workpapers or completed audit records. Ordinary personas demonstrate authorization; the synthetic superuser is a disclosed testing shortcut and cannot edit a frozen engagement.

## Journey

| Step | Actor / screen | Action and expected handoff |
| --- | --- | --- |
| 1 | Relationship / Leads | Create lead, mark Won, convert to prospect; create its active client contact. |
| 2 | Relationship → Manager / Proposals | Draft audit Proposal/EL with year, scope and fee; independent commercial review; present; manually record client's accepted response and evidence reference. |
| 3 | Manager / Engagement register | Create a draft audit engagement linked to that accepted proposal. |
| 4 | Billing / Advance & balance billing | Pin the accepted revision; record exactly 50% manually with date/method/reference; generate the current receipt PDF. |
| 5 | Manager or Compliance → Partner / Acceptance | Record all five screening checks with evidence and recommendation. Assigned independent Partner accepts; Declined, missing evidence and unresolved conditions block subsequent work. |
| 6 | Admin / M365 configuration | Save synthetic selected-site binding; verify SharePoint; explicitly prepare the selected engagement's five folders. Verify workspace access in Workspace & PBC. |
| 7 | Admin / Administration | Grant existing synthetic client administrator and contributor identities only the selected engagement, with request/approval references. Contacts do not grant access. |
| 8 | Audit team → Client / Workspace & PBC | Draft and send local request. Client simulates mandatory password change; client admin can delegate to an already scoped contributor. Contributor uploads actual synthetic bytes. Manager independently accepts response evidence. |
| 9 | Preparer → Manager / Planning | Save benchmark and explicit PM/TE/SAD rates and rationales; independent review. |
| 10 | Manager / Staffing | Assign Partner, Manager, Senior/Reviewer and Preparer/Staff with phase, dates, hours and charge/cost rates. Blank rates remain Unknown. |
| 11 | Preparer / TB | Upload balanced CSV/genuine Excel, inspect preview and explicitly confirm FSLI mappings. Importing a new TB invalidates prior planning; record and independently review a fresh plan revision. This is source ingestion, not ledger posting. |
| 12 | Audit team / P&L & BS | Generate source-pinned snapshot; select an approved earlier client period if available. Expand FSLIs for accounts, PM, risks, findings and workpapers; open the corresponding audit program. |
| 13 | Manager → Preparer → Manager / Fieldwork | Prepare six areas: Revenue, Purchasing, Fixed Assets, Treasury, Analytical Review, Going Concern. Link accepted evidence, record work/conclusions, submit and independently clear every procedure. Ad-hoc procedures retain insertion rationale. |
| 14 | Preparer / Sampling | Import full population reconciled to its TB control account. Generate Random, Stratified or systematic MUS using a saved seed. MUS can hit an item more than once; display counts are distinct selected items. Test items and link structured X-1/optional box/location to sample and workpaper. |
| 15 | Preparer → Manager / Confirmations | Track Draft → Requested → Awaiting → Received → Reviewed → Cleared with current same-engagement response evidence. Critical outstanding/exception/no-response/cancelled matters block final reporting. A holding letter is not a final report. |
| 16 | Preparer → Manager / Review & SRM | Link current evidence; generate actual XLSX workpaper. Preparer marks ready. Manager returns one point. Preparer generates revised workbook and responds, then marks ready. Manager clears the current point and workbook, records engagement clearance and generates SRM. |
| 17 | Partner / Review & SRM | Independently clear current SRM/basis. Changed TB, plans, evidence, workpaper, samples, findings or confirmations stale downstream review. EQR is not a mandatory target step. |
| 18 | Partner → Manager / Opinion & deliverables | Select Clean, Qualified, Disclaimer or Adverse explicitly. Modified opinions require meaningful basis; Qualified also requires focus area. Generate actual ML/LOR/Audit Report PDFs; record synthetic delivery/sign-off. |
| 19 | Billing | Generate final fee less recognized advance invoice (50% in the canonical example). Preserve it through report reissues; no duplicated demand. |
| 20 | Records / Freeze & archive | Simulate as-of at report date +59: no freeze. Advance to +60: exact final bytes copied/hashed and engagement becomes read-only, including for superuser. Reload and inspect archive/history/downloads. |
| 21 | Partner / Firm finance | Review scoped approved time, WIP, budget/actual hours, costs and ratios. Record balanced firm expenses in the separate firm ledger; export its TB CSV. |

## Executed evidence

[Browser journey JSON](evidence/target-browser-journey.json) records a Chrome **command-level** journey with rendered checkpoints and genuine browser artifacts. It is not a click-by-click acceptance of every form. [Frozen archive screenshot](evidence/target-frozen-archive.png) shows the actual rendered archive. Unit tests exercise gates and deterministic arithmetic separately.

## Boundaries

M365, email, invitations, passwords, payments and delivery are simulations. No real credentials are stored. localStorage/IndexedDB can be cleared or edited by the browser owner; this is not production authentication, server immutability, legal issuance or professional/regulatory acceptance. Generated documents are explicitly illustrative prototype documents.
