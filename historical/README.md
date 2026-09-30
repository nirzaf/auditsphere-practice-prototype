# Historical prototype provenance

These files document earlier AuditSphere product concepts and are retained only for provenance,
migration, regression and audit history. They are not the current STE Audit Management Tool v2.1
product requirements and must not be used to add new visible modules or routes.

Layout:

- `legacy-runtime/` — the former root JavaScript/Python application. Its entrypoints and npm
  build/check scripts are retired and it is not deployed.
- `components/` — removed Administration/M365 screens preserved as inert text.
- `legacy-product-spec/` — the former broad 39-module product documentation: `modules/MOD-*.md`,
  `chunks/*`, `ROLE_GUIDE.md`, `Gap_Closure_User_Stories.md`, `00_MASTER_INDEX.md` and
  `01_MODULE_INDEX.md`, plus the guide projections consumed only by historical fixtures.
- `moduleGuideContent.ts`, `guideProjections.ts` — historical guide fixtures retained for
  regression tests; not imported by the current renderer.

The old root npm/Python build is retired; restore paths and dependencies deliberately before
using this material for comparison. `tools/progress.py` and its test still reference the
pre-move root layout and are retained as provenance tooling only. Current workflow ownership
and removal boundaries are documented in `docs/prototype/legacy-lifecycle-review-resolution.md`.
