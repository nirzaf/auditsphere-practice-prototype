# Retired screen removal

Removed unused legacy screens and presentation components from the source tree. Current lifecycle screens retain their shared store, domain controls and old-link redirects. Historical fixtures and domain tests remain reference material.

Removed files:

- `src/components/clientRequirements/DeckContents.tsx`
- `src/components/clientRequirements/DeckIcon.tsx`
- `src/components/clientRequirements/DetailDrawer.tsx`
- `src/components/clientRequirements/ModuleDetail.tsx`
- `src/components/clientRequirements/SlideCover.tsx`
- `src/components/clientRequirements/SlideCoverage.tsx`
- `src/components/clientRequirements/SlideFlow.tsx`
- `src/components/clientRequirements/StepCard.tsx`
- `src/components/clientRequirements/clientRequirements.css`
- `src/components/modules/AccountingWorkbenchView.tsx`
- `src/components/modules/ApprovalsEQRView.tsx`
- `src/components/modules/BillingInvoicingView.tsx`
- `src/components/modules/BudgetsView.tsx`
- `src/components/modules/ClientPortalView.tsx`
- `src/components/modules/ClientRequirementsView.tsx`
- `src/components/modules/CommunicationsView.tsx`
- `src/components/modules/ConsolidationView.tsx`
- `src/components/modules/DashboardView.tsx`
- `src/components/modules/DocumentsLibraryView.tsx`
- `src/components/modules/FinancialPackagesView.tsx`
- `src/components/modules/FinancialStatementsView.tsx`
- `src/components/modules/JobTemplatesView.tsx`
- `src/components/modules/JobsTasksView.tsx`
- `src/components/modules/ModuleCatalogueView.tsx`
- `src/components/modules/ReceivablesView.tsx`
- `src/components/modules/RecordsArchiveView.tsx`
- `src/components/modules/ReleaseCompletionView.tsx`
- `src/components/modules/ReportingCentreView.tsx`
- `src/components/modules/RequirementsView.tsx`
- `src/components/modules/ReviewDeskView.tsx`
- `src/components/modules/SamplingView.tsx`
- `src/components/modules/WorkpapersView.tsx`
- `src/components/walkthrough/WalkthroughDock.tsx`
- `src/components/walkthrough/walkthrough.css`

Deployment uses the current working tree. The deployment build checks TypeScript and produces the production assets; no additional tests were run for this removal.
