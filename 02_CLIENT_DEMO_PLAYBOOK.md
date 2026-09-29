# Current demo playbook

Use [Canonical audit lifecycle rehearsal](docs/prototype/target-lifecycle-demo.md). It supersedes the historical presets and 39-module chapters below. [Executed evidence and limits](docs/prototype/target-lifecycle-report.md).

---

# Client demonstration playbook

[Master index](00_MASTER_INDEX.md) · [39 module guides](01_MODULE_INDEX.md) · [Role reference](reference/ROLE_HANDOFF_GUIDE.md)

**Purpose:** show what the prototype can do, how a person uses each module and what happens next. These are planned rehearsal paths, not a freshly executed certification. Do not advertise a pending control as working. Use the module guide's residual-gap note when deciding the live agenda.

## 1. Preflight

Use the current React/Vite app, not a historical standalone HTML screenshot. Record full source/build identity, browser and viewport. Check the current package scripts. Use only synthetic data; fix the demo clock at **2026-09-23**. Start with one editing tab and preserve any local data before resetting. The seeded `superuser` identity opens every module from one tab and is useful for rehearsing long paths; present it as a testing shortcut whose overrides are logged, and switch back to ordinary personas for any access, scope or independence boundary.

Confirm the available presets in the existing chooser: `full-practice`, `accounting-only`, `audit-findings`, `two-component-consolidation`, `blocked-rework`, `empty-practice`. A scenario loads seeded records; it does not mean the presenter performed those business decisions. Explain that distinction.

Scenario loading, identity/client/engagement switching and reset all pass through the unsaved-draft Save/Discard/Stay decision first; **Reset Demo State** additionally requires an explicit destructive confirmation. The replaced payload is retained as a recovery backup and can be downloaded (**Export current state** / **Export preserved payload**) and returned through **Import validated JSON**. Practice that path before the meeting rather than mid-demo.

Download one supported generated sample before the meeting and verify it opens correctly. Keep a disclosed backup of screenshots or files for a failed environment, but do not substitute that fallback for a claimed live feature. Confirm the selected browser supports the app's local storage/IndexedDB behavior.

## 2. Opening statement

“This is a synthetic, browser-local walkthrough of the planned user experience. We can change demonstration records and show reviews, files, calculations and handoffs. No real Microsoft connection, message, payment, signature, ledger posting or client-data transaction is performed. Some remaining acceptance edge cases are separately tracked.”

## 3. Recommended chapters

| Chapter | Preset / context | Module order | Visible outcome |
|---|---|---|---|
| Overview and client workspace | full-practice / manager / CL-001 | 01 → 02 → 17 | Scope-aware dashboard and linked client records. |
| Acquire and start an engagement | full-practice / relationship → compliance/onboarding → partner → client management | 03 → 04 → 27 | Lead, proposal response and separate professional acceptance. |
| Organize and collaborate | full-practice / manager → preparer | 05 → 06 → 07 → 11 | Manual job/template/tasks, internal discussion and basic local communications. |
| Request and review information | full-practice / preparer → client_finance → independent reviewer | 10 → 09 → 08 → 33 | One request thread, versioned response, reviewed evidence and scoped portal. |
| Prepare client financial output | accounting-only / ENG-26002 / preparer → reviewer → client management | 20 → 21 → 22 → 23 → 24 → 25 | Source import, optional mapped dimensions, journals carrying revision-pinned support, through a reviewed genuine financial package whose lineage names the exact TB/GL revisions; no client-ledger posting. |
| Perform the audit | audit-findings / permitted engagement | 28 → 29 → 30 → 31 → 32 → 34 → 35 → 36 | Deliberate plan, linked risks/tests/evidence, exceptions and independent decisions. |
| Release and keep records | blocked-rework then a legitimately completed fixture | 37 → 38 | Visible blocker, lawful local rework, exact release and archive history. |
| Run the firm's finances | full-practice / preparer → manager/reviewer → billing | 12 → 13 → 14 → 15 → 16 | Approved time, budget, issued demo invoice, offline receipt/aging/report. |
| Show bounded group reporting | two-component-consolidation / manager → independent partner | 26 | Exact component pins, rate, elimination and reviewed JSON output. |
| Administer the installation | full-practice / admin, then permitted client/staff | 18 → 19 → 39 | Simulated setup, separate identities/grants and prospective settings. |

These chapters cover every original module. They are a navigable agenda, not a mandate to rebuild completed baseline functions or run a single enormous transaction. A short presentation can use a disclosed subset; mark other modules NOT_RUN rather than “demonstrated.”

## 4. How to use every module

Open the corresponding [module rehearsal guide](01_MODULE_INDEX.md). Each includes route/workspace, candidate component, role sequence, starting preset, five specific steps, expected result, error/rework case and task links. Explain the purpose, perform a meaningful action, show its persisted result, switch to the next responsible person, then show at least one important denial or stale-input consequence.

## 5. Required failure/rework stops

Show same-natural-person review denial; an invalid TB/GL preview that does not overwrite accepted source; a reasoned PBC replacement with prior evidence retained; a changed source making a previously reviewed output stale; a journal whose pinned evidence, workpaper or finding revision moved, shown excluded from statements and packages with its stated reason until it is re-pinned and independently re-reviewed; a significant unresolved finding blocking release; and failed/unknown simulated mail that does not pretend delivery or silently retry.

Use legitimate completion steps to resolve a blocker. Do not pre-clear missing evidence, change stored approval flags, weaken guards or introduce a hidden “make ready” action just for the meeting. Seeded baseline decisions must be visibly described as fixture data.

## 6. Fixed arithmetic — dedicated examples, not all default seed values

| Example | Inputs | Expected result |
|---|---|---|
| Eight-account QAR TB | Cash 10,000; AR 5,000; equipment 8,000; expense 3,000; AP -3,000; loan -7,000; opening equity -10,000; revenue -6,000. | Signed total 0; assets 23,000; liabilities 10,000; profit 3,000. |
| Depreciation adjustment | One balanced 500 adjustment not yet reflected in the source. | Assets 22,500; profit 2,500. A replacement already reflecting it does not charge it again. |
| Budget/time | Planned 600 minutes at QAR 200/hour; approved actual 660 minutes; cost QAR 80/hour. | Planned value 2,000; actual value 2,200; variance +60 minutes; cost 880. Missing cost stays unavailable. |
| Receivable at 2026-09-23 | QAR 1,000 issued invoice due 2026-08-15, credit 100, allocated receipt 300. | Outstanding 600, 31–60 days. Future-effective receipts do not reduce past balances. |
| Unallocated receipt | Receipt 500, allocated 300. | Unallocated 200, not automatically applied elsewhere. |
| Group elimination | Reviewed same-currency receivable/payable pair 1,000. | Both group assets/liabilities reduce 1,000; components unchanged. Unmatched 100 is visible, not plugged. |

The existing broader presets may have different amounts (for example the group preset describes a QAR 50,000 elimination). Do not force their totals to equal the dedicated fixture above. Use a clearly named test/demo fixture and explicit currency for each story. Source: [S06: Presenter scenarios](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/demo-scenarios.md).

## 7. Client output and storage explanation

A supported financial package can produce genuine watermarked XLSX/DOCX/PDF files with local hashes. The current group output is JSON. Registered library documents and workpaper evidence retain metadata/digests but their original bytes stay in-session; accepted PBC response bytes persist in browser-local IndexedDB; generated financial and archive artifacts have their own IndexedDB paths. Explain the per-feature distinctions in [scope/storage guidance](reference/SCOPE_AND_STORAGE_BOUNDARIES.md).

## 8. Close the presentation

Summarize demonstrated modules and the user's next actions. Keep three lists separate: **demonstrated now**, **remaining prototype work/acceptance**, **outside this prototype's scope**. Record observations in [module-demo signoff](tracking/MODULE_DEMO_SIGNOFF.md) and link defects to their existing task cards.

Do not equate “the client saw a useful demo” with “all 256 original criteria pass,” professional methodology acceptance or production readiness.
