"""MOD-UX-01 identity-line injection (development tool, idempotent).

Adds the shared client · engagement · period · revision identity line to every
module page header, plus the shared lifecycle hint on modules with a multi-step
journey. This is an *additive* change: the existing title, description and
actions stay exactly where they are, so no visible copy moves and no existing
assertion on a heading changes.

Usage:  py -3 tools/inject_module_identity.py [--write]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

MODULES = Path(__file__).resolve().parent.parent / "src" / "components" / "modules"
IMPORT_LINE = "import { ModuleIdentityLine, ModuleLifecycleHint } from '../common/Enterprise';\n"

# Modules that render a full engagement context line. Practice-wide pages
# (dashboard, portfolio, guide, requirements, reports) are deliberately excluded:
# they are not scoped to one engagement and an identity line would mislead.
CONTEXT_MODULES = {
    "ClientDetailView", "EngagementsView", "AuditAcceptanceView", "JobsTasksView",
    "JobTemplatesView", "DocumentsLibraryView", "CommunicationsView", "TimeTrackingView",
    "BudgetsView", "BillingInvoicingView", "ReceivablesView", "AccountingWorkbenchView",
    "FinancialStatementsView", "FinancialPackagesView", "ConsolidationView",
    "AuditPlanningView", "AuditRisksProgramsView", "SamplingView", "WorkpapersView",
    "EvidenceCatalogueView", "FindingsView", "ReviewDeskView", "ApprovalsEQRView",
    "ReleaseCompletionView", "RecordsArchiveView", "M365SetupView",
}

# Modules whose work follows a real multi-step lifecycle, so the hint strip earns
# its space. Single-register modules keep the header only.
HINT_MODULES = {
    "AuditAcceptanceView", "EngagementsView", "DocumentsLibraryView", "BudgetsView",
    "BillingInvoicingView", "ReceivablesView", "AccountingWorkbenchView",
    "FinancialStatementsView", "FinancialPackagesView", "ConsolidationView",
    "AuditPlanningView", "AuditRisksProgramsView", "SamplingView", "WorkpapersView",
    "FindingsView", "ReviewDeskView", "ApprovalsEQRView", "ReleaseCompletionView",
}

# The header block ends with this line at the pagehead's own indentation.
PAGEHEAD_OPEN = re.compile(r"^(?P<indent>[ \t]*)<div className=\"pagehead\">\s*$", re.MULTILINE)
PAGEHEAD_CLOSE = re.compile(r"^(?P<indent>[ \t]*)</div>\s*$", re.MULTILINE)


def inject(source: str, want_hint: bool) -> tuple[str, int]:
    if "ModuleIdentityLine" in source:
        return source, 0
    out = source
    injected = 0
    search_from = 0
    while True:
        opened = PAGEHEAD_OPEN.search(out, search_from)
        if not opened:
            break
        indent = opened.group("indent")
        # Find the header's closing tag at the same indentation.
        closer = None
        for candidate in PAGEHEAD_CLOSE.finditer(out, opened.end()):
            if candidate.group("indent") == indent:
                closer = candidate
                break
        if closer is None:
            break
        additions = [f"{indent}  <ModuleIdentityLine />"]
        if want_hint:
            additions.append(f"{indent}  <ModuleLifecycleHint />")
        out = out[:closer.start()] + "\n".join(additions) + "\n" + out[closer.start():]
        injected += 1
        search_from = closer.end() + sum(len(item) + 1 for item in additions)
    return out, injected


def ensure_import(source: str) -> str:
    if "from '../common/Enterprise'" in source:
        return source
    imports = list(re.finditer(r"^import .*?;\n", source, re.MULTILINE))
    if not imports:
        return source
    anchor = imports[-1]
    return source[:anchor.end()] + IMPORT_LINE + source[anchor.end():]


def main() -> int:
    write = "--write" in sys.argv
    files = blocks = 0
    for path in sorted(MODULES.glob("*.tsx")):
        if path.stem not in CONTEXT_MODULES:
            continue
        original = path.read_text(encoding="utf-8")
        converted, count = inject(original, path.stem in HINT_MODULES)
        if not count:
            print(f"skipped {path.name}: no injectable page header")
            continue
        converted = ensure_import(converted)
        if write:
            path.write_text(converted, encoding="utf-8", newline="\n")
        files += 1
        blocks += count
        print(f"{'wrote' if write else 'would write'} {path.name}: {count} header(s)")
    print(f"\n{files} file(s), {blocks} header(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
