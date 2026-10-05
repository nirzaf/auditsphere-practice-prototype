# Current role handoffs

Relationship → commercial reviewer/client → Billing → acceptance recommender/Partner → Admin/client contributor → Preparer/Manager → SRM/Partner → Billing/Records → firm finance. [Detailed target journey](../docs/prototype/target-lifecycle-demo.md). EQR is not a mandatory target role; historical roles below are retained for source history.

---

# Role handoffs and synthetic personas

[Module index](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md)

The seeded store carries **23 persona entries across 15 distinct role keys**: the 14 product role keys plus the reserved `superuser` testing key. Persona entries are not necessarily distinct natural people or simultaneous authenticated users. The role selector is a simulation, not a real login. Older browser state gains the reserved persona through the schema v28 upgrade. Source: [S13: Synthetic personas and records](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/initialState.ts).

| Persona key | Synthetic name | Role key | Presentation use / boundary |
|---|---|---|---|
| `manager` | Layla Rahman | `manager` | Engagement manager; broad staff presentation |
| `manager-2` | Mariam Saeed | `manager` | Different natural person for eligible independent work |
| `partner` | Daniel James | `partner` | Engagement partner / professional decisions |
| `preparer` | Adam Khan | `preparer` | Preparation; same natural person as multirole-1 |
| `reviewer` | Sara Malik | `reviewer` | Senior review where eligible |
| `eqr` | Dr. Tariq Al-Sayed | `eqr` | Independent EQR where assigned and eligible |
| `eqr-2` | Dr. Samira Noor | `eqr` | Second EQR persona |
| `relationship` | Amira Qasim | `relationship` | Lead/client/proposal commercial work |
| `onboarding` | Hana Ali | `onboarding` | Onboarding coordination |
| `compliance` | Yusuf Ahmed | `compliance` | Compliance evidence/review |
| `billing` | Leila Hassan | `billing` | Firm invoicing and offline receipts; not client accounting authority |
| `records` | Farooq Mansour | `records` | Logical archive/hold/handover |
| `admin` | Khalid Al-Nuaimi | `admin` | System settings and scoped grants; not implicit professional authority |
| `client_admin` | Amal Nasser | `client_admin` | Explicit CL-001 and CL-003 grants |
| `client_finance` | Rami Nasser | `client_finance` | CL-001 PBC contribution |
| `client` | Omar Nasser | `client` | CL-001 management approver |
| `client-northstar` | Aisha Saleh | `client` | CL-002 management approver |
| `preparer-2` | Nadia Rahman | `preparer` | Second preparer for real reassignment |
| `reviewer-2` | Bilal Ahmed | `reviewer` | Second senior reviewer |
| `multirole-1` | Adam Khan | `billing` | Same personId as preparer; cannot self-approve through role switch |
| `reviewer-disabled` | Tariq Aziz | `reviewer` | Inactive identity, negative demonstration only |
| `group-user` | Mona Khalil | `manager` | Narrow ENG-26001 scope; no automatic access to other components |
| `superuser` | AuditSphere Superuser | `superuser` | Reserved presenter/test identity; see “Prototype testing identity” below — not a product role |

## Prototype testing identity

`superuser` exists so one browser tab can trace every supported module, and every
grant-scoped record, without rehearsing fourteen persona switches. It opens every
supported route, sees every synthetic client/engagement and every consolidation
group, and may take actor-restricted actions such as technically reviewing a journal
it prepared. Each such action appends a `Prototype Superuser Override` line to the
local event log and the workspace shows a full-access banner.

It is not a demonstration of authority. Amount validation, revision pinning,
staleness and client-portal disclosure filters behave identically under it, and
an override is never an independent approval. Present separation-of-duties,
scope and expiry boundaries with the ordinary personas above, and label anything
reached only through the testing identity as a fixture shortcut.

## Handoffs to explain aloud

Commercial lead conversion → proposal acceptance → professional engagement acceptance are separate decisions. A client contact is not an access grant. A client administrator is not automatically a management approver. Assignment of a task does not grant professional approval power.

Preparation → submission → independent review → management acknowledgement → partner/EQR approval → release are distinct transitions over exact revisions. Do not use a role switch to clear the preparer's own work, disable a guard, seed a fake approval or hide an unresolved significant issue.

Use the module guide's proposed role order, then confirm the actual current grant and assigned-reviewer requirements. If the selected person is not eligible, show the denial and choose another legitimately eligible synthetic person through the supported administration path.

## Presenter-only tools

Scenario reset, metadata backup/import, the reserved `superuser` identity and the persona chooser must be clearly separated from business actions. Loading a named demonstration fixture is not evidence that a client completed its workflow. Label fixture starting state and all preexisting data before presenting it.

Scenario loading, identity/client/engagement switching and reset all pass through the
unsaved-draft Save/Discard/Stay decision first; reset then asks its own destructive
confirmation and keeps the replaced payload as an exportable recovery backup. An
imported validated JSON file replaces browser state directly, so export or reset
instead of importing over unsaved work.
