# Scope and storage boundaries for the client presentation

[Master index](../00_MASTER_INDEX.md)

The current prototype is a browser-only visualization. It illustrates intended workflows with synthetic records and bounded local commands. It is not production authentication, enforceable multi-user authorization, real ledger posting, professional assurance or live external integration. These boundaries come from [S01: Original 64-story contract](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/Gap_Closure_User_Stories.md) and [S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md).

## Included

All 39 original functional areas: practice/CRM, simple manual work, documents and PBC, client portal, basic communication simulation, firm time/budgets/billing/offline receipts, import-first client accounting, supported two-component consolidation, audit preparation/review, exact local release/archive and administration. Ordinary deterministic calculations, scoped metadata search, responsive browser layouts, hashes, basic technical retry/error handling and manual human decisions remain included.

## Excluded — do not create “pending integration” tasks for these

No application AI/agents/model integrations/semantic search; native mobile application; online payment/bank-feed initiation; signature capture/eSignature provider; tax preparation/filing/tax workspace; payroll execution/administration; workflow/close automation, recurring jobs or reminders; inbox sync/Triage/automatic email retries; non-M365 business integrations; Microsoft Purview; certification/encryption-management project. Historic imported tax/salary account labels and their legitimate financial values remain intact.

Microsoft screens simulate Entra/Graph/SharePoint/basic outgoing mail and optional OneDrive only. `liveConnected` stays false. SharePoint is the canonical simulated document library; optional OneDrive is not a second archive. No credentials, OAuth, real invitation, tenant write or email is required to present the app.

## Do not apply one storage statement to every feature

| Record / file class | Current evidence / rehearsal rule |
|---|---|
| Library registration of an original file | Metadata plus local digest can survive; do not promise original byte download after reload where bytes were not retained. |
| Workpaper/session upload | Check actual in-memory/IndexedDB lifecycle for that specific action. Guidance must say when the user must reselect the original. |
| PBC response | Newer repository evidence records versioned bytes and digests in IndexedDB across reload; validate that exact path instead of repeating the old universal metadata-only claim. |
| Generated financial package | Genuine XLSX/DOCX/PDF bytes and SHA-256 manifest are saved browser-locally; a failed batch must not leave a successful revision. Each revision also records the exact TB and, where GL intake is configured, GL source revision plus digest; a changed GL lineage marks the saved revision stale. |
| Adjustment journal support | Links to evidence, workpaper or finding are stored as exact revisions, not live pointers. When the pinned source is replaced, superseded or becomes inadequate, the journal is excluded from statements/packages with a visible reason until it is re-pinned and independently re-reviewed. |
| Group output | Current supported output is a watermarked, digest-verified JSON package with current input fingerprints and independent review; do not advertise it as an implemented group PDF/XLSX pack. |
| Local archive | Copies of released artifact bytes/digests are stored locally. Holds/retention are application metadata, not provider locks or guaranteed physical preservation. |
| Metadata recovery export | Does not automatically contain all blobs. Inspect export content and explain exactly what can be recovered. |

Browser storage can be cleared or modified outside the app. Do not upload real client or employee data for the demonstration. Use synthetic files only. Export/reset/scenario tools belong to presenter controls and must warn before discarding work.

## Professional decisions

Example percentages and financial fixtures are chosen demonstration inputs, not legally/professionally approved rates. A system calculation does not conclude audit opinion, fraud, materiality appropriateness, disclosure adequacy or evidence sufficiency. Distinct natural people must make preparation and independent review decisions; changing Adam Khan's role label does not make him a second person.

## Prototype testing identity

The seeded `superuser` persona is a presenter/test shortcut, not an implemented role and not an authorization model: it reaches every supported route and records a labelled `Prototype Superuser Override` event when it acts on its own work. Business validation, revision pinning and client-portal disclosure filters still apply to it. Use it only to navigate; use the ordinary personas to demonstrate access and segregation boundaries (see [role handoffs](ROLE_HANDOFF_GUIDE.md)).

## Important non-gaps

Missing real SharePoint/bank/mail/signing integrations are exclusions. Printer-driver certification is not a browser prototype task. Unsupported associate/minority/advanced consolidation methods are declared limits, not authorization to expand scope. A stale limitations paragraph is not proof an already-tested UI feature is missing.
