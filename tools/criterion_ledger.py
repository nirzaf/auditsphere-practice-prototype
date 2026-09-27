#!/usr/bin/env python3
"""Generate docs/prototype/criterion-evidence-ledger.md from executed test results.

VP-063-E01 / VP-064-E01: every original VP-xxx-ACyy criterion is bound to the
exact tests that assert it (docs/prototype/criterion-map.json) and to the
observed outcome of those tests in a recorded run (TAP logs of `npm run
test:unit` and `npm run test:e2e`). A criterion passes only when every mapped
test exists in the tested source and passed in that run. Link counts and titles
alone are never treated as results.

Usage:
  python3 tools/criterion_ledger.py check
  python3 tools/criterion_ledger.py generate --unit-log U.tap --e2e-log E.tap \
      --sha <tested full SHA> --build-digest <sha256> --run-id <id> --run-date <UTC ISO>
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / 'docs' / 'prototype' / 'criterion-map.json'
LEDGER = ROOT / 'docs' / 'prototype' / 'criterion-evidence-ledger.md'
TRACKER = ROOT / 'docs' / 'Progress_Tracker.md'
SUITE = '*SUITE*'


def criteria_text() -> dict[str, str]:
    text = TRACKER.read_text(encoding='utf-8')
    found: dict[str, str] = {}
    for match in re.finditer(r'^\| (VP-\d{3}-AC\d{2}) \| (.+?) \| (.+?) \|\s*$', text, re.M):
        found.setdefault(match.group(1), match.group(2))
    return found


def story_modules() -> dict[str, list[str]]:
    text = TRACKER.read_text(encoding='utf-8')
    modules: dict[str, list[str]] = {}
    for section in re.split(r'^### (?=VP-\d{3} )', text, flags=re.M)[1:]:
        story = section[:6]
        line = re.search(r'^\*\*Module links:\*\* (.+)$', section, re.M)
        modules[story] = sorted(set(re.findall(r'MOD-\d{2}', line.group(1)))) if line else []
    return modules


def source_tests() -> dict[str, dict]:
    tests: dict[str, dict] = {}
    for path in sorted(glob.glob(str(ROOT / 'tests' / 'unit' / '*.test.ts'))) + [str(ROOT / 'tests' / 'e2e' / 'app.test.ts')]:
        rel = str(Path(path).relative_to(ROOT))
        for number, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
            match = re.match(r"^\s*it\((['`\"])(.+?)\1", line)
            if match:
                if match.group(2) in tests:
                    tests.setdefault('__duplicates__', []).append(match.group(2))
                tests[match.group(2)] = {'file': rel, 'line': number}
    return tests


def title_pattern(name: str) -> re.Pattern:
    parts = re.split(r'\$\{[^}]*\}', name)
    return re.compile('^' + '.+'.join(re.escape(part) for part in parts) + '$')


def parse_tap(path: str) -> dict[str, bool]:
    results: dict[str, bool] = {}
    for line in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        match = re.match(r'^\s*(not ok|ok) \d+ - (.*?)(?: # (?:SKIP|TODO).*)?$', line)
        if match:
            name = match.group(2).strip()
            passed = match.group(1) == 'ok' and '# SKIP' not in line and '# TODO' not in line
            results[name] = results.get(name, True) and passed
    return results


def summary_counts(path: str) -> dict[str, int]:
    counts = {}
    for key in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        match = re.findall(rf'^# {key} (\d+)$', Path(path).read_text(encoding='utf-8', errors='replace'), re.M)
        counts[key] = int(match[-1]) if match else -1
    return counts


def check(mapping: dict, tests: dict, criteria: dict) -> list[str]:
    errors = [f'duplicate test title (results would be ambiguous): {name}' for name in tests.get('__duplicates__', [])]
    if set(mapping) != set(criteria):
        errors.append(f'map/criteria mismatch: missing {sorted(set(criteria) - set(mapping))}, extra {sorted(set(mapping) - set(criteria))}')
    for criterion, entry in mapping.items():
        if not entry['tests']:
            errors.append(f'{criterion}: no mapped test')
        if not entry.get('basis', '').strip():
            errors.append(f'{criterion}: no assertion basis')
        for ref in entry['tests']:
            if ref['name'] == SUITE:
                continue
            if ref['name'] not in tests:
                errors.append(f'{criterion}: mapped test not found in source: {ref["name"]}')
            elif tests[ref['name']]['file'] != ref['file']:
                errors.append(f'{criterion}: mapped test moved files: {ref["name"]}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['check', 'generate'])
    parser.add_argument('--unit-log')
    parser.add_argument('--e2e-log')
    parser.add_argument('--sha')
    parser.add_argument('--build-digest')
    parser.add_argument('--run-id')
    parser.add_argument('--run-date')
    args = parser.parse_args()

    mapping = json.loads(MAP.read_text(encoding='utf-8'))['criteria']
    criteria = criteria_text()
    tests = source_tests()
    errors = check(mapping, tests, criteria)
    if errors:
        print('\n'.join(errors))
        return 1
    if args.mode == 'check':
        print(f'criterion map OK: {len(mapping)} criteria, {len({r["name"] for e in mapping.values() for r in e["tests"]})} distinct test references')
        return 0

    if not all([args.unit_log, args.e2e_log, args.sha, args.build_digest, args.run_id, args.run_date]):
        parser.error('generate requires --unit-log --e2e-log --sha --build-digest --run-id --run-date')
    source_tests_cache = tests
    unit, e2e = parse_tap(args.unit_log), parse_tap(args.e2e_log)
    unit_counts, e2e_counts = summary_counts(args.unit_log), summary_counts(args.e2e_log)
    suite_passed = all(c['fail'] == 0 and c['cancelled'] == 0 and c['skipped'] == 0 and c['tests'] > 0 for c in (unit_counts, e2e_counts))
    modules = story_modules()

    def outcome(ref: dict) -> str:
        if ref['name'] == SUITE:
            return 'PASS' if suite_passed else 'FAIL'
        # Results come only from the run that executes the mapped test's file.
        observed = e2e if ref['file'].startswith('tests/e2e/') else unit
        pattern = title_pattern(ref['name'])
        matches = [passed for name, passed in observed.items() if pattern.match(name)]
        if not matches:
            return 'NOT_RUN'
        return 'PASS' if all(matches) else 'FAIL'

    # VP-063-AC01 is computed, not assumed: every story needs at least one mapped positive
    # journey and one mapped negative (validation/scope/stale/rework) check, all passing.
    negative = re.compile(r'reject|block|den(y|ies|ied)|cannot|stale|invalid|prevent|refus|exclud|forbid|unavailable|duplicate|guard|hid|without|never|revers|return|rework|fail|limit|withdraw|expir|revok|disabled|out-of-scope|outside|missing|unknown|gate', re.I)
    coverage: dict[str, dict] = {}
    for criterion, entry in mapping.items():
        story = coverage.setdefault(criterion[:6], {'positive': set(), 'negative': set()})
        for ref in entry['tests']:
            if ref['name'] == SUITE or criterion.startswith(('VP-063', 'VP-064')):
                continue
            story['negative' if negative.search(ref['name']) else 'positive'].add(ref['name'])
            if ref['file'].startswith('tests/e2e/'):
                story['positive'].add(ref['name'])  # a browser journey is also a positive run of the story
    story_gaps = sorted(story for story, found in coverage.items()
                        if not story.startswith(('VP-063', 'VP-064')) and (not found['positive'] or not found['negative']))
    story_failures = sorted(story for story, found in coverage.items()
                            if any(outcome({'file': source_tests_cache[name]['file'], 'name': name}) != 'PASS' for name in found['positive'] | found['negative']))

    rows, totals = [], {'PASS': 0, 'FAIL': 0, 'NOT_RUN': 0}
    story_state: dict[str, set] = {}
    for criterion in sorted(mapping):
        entry = mapping[criterion]
        results = [(ref, outcome(ref)) for ref in entry['tests']]
        if criterion == 'VP-063-AC01':
            computed = 'PASS' if not story_gaps and not story_failures else 'FAIL'
            results.append(({'file': '*', 'name': f'Computed story coverage (title-keyword heuristic for negative checks, not a proof): {62 - len(story_gaps)}/62 stories with positive and negative mapped checks; gaps {story_gaps or "none"}; failing {story_failures or "none"}'}, computed))
        states = {state for _, state in results}
        aggregate = 'FAIL' if 'FAIL' in states else 'NOT_RUN' if 'NOT_RUN' in states else 'PASS'
        totals[aggregate] += 1
        story_state.setdefault(criterion[:6], set()).add(aggregate)
        refs = '<br>'.join(
            ('Full recorded suite' if ref['name'] == SUITE else ref['name'] if ref['file'] == '*' else f'`{tests[ref["name"]]["file"]}:{tests[ref["name"]]["line"]}` {ref["name"]}') + f' — **{state}**'
            for ref, state in results)
        text = criteria.get(criterion, '').replace('|', '\\|')
        rows.append(f'| {criterion} | {", ".join(modules.get(criterion[:6], [])) or "—"} | {text} | {refs} | {entry["basis"].replace("|", "/")} | **{aggregate}** |')

    stories_passed = sum(1 for states in story_state.values() if states == {'PASS'})
    header = f"""# AuditSphere — Criterion-to-Evidence Ledger (VP-063-E01 / VP-064-E01)

Generated by `python3 tools/criterion_ledger.py generate` from
[`criterion-map.json`](criterion-map.json) and the TAP output of one recorded run. Do not edit by hand.

| Field | Value |
|---|---|
| Tested source SHA | `{args.sha}` |
| Build digest (sha256 of `dist/` file manifest) | `{args.build_digest}` |
| Run | `{args.run_id}` at {args.run_date} |
| Unit run (`npm run test:unit`) | {unit_counts['pass']}/{unit_counts['tests']} pass, {unit_counts['fail']} fail, {unit_counts['skipped']} skipped |
| E2E run (`npm run test:e2e`, Chromium via CDP) | {e2e_counts['pass']}/{e2e_counts['tests']} pass, {e2e_counts['fail']} fail, {e2e_counts['skipped']} skipped |
| Controlled scenario date | 2026-09-23 (fixed `asOfDate`) |
| Criteria PASS / FAIL / NOT_RUN | {totals['PASS']} / {totals['FAIL']} / {totals['NOT_RUN']} of {len(mapping)} |
| Original stories with every criterion PASS | {stories_passed} of {len(story_state)} |
| Review | Claude Code AI self-review (same session), `reviewer_kind=AI_AGENT`, `acceptance_scope=BROWSER_ONLY_PROTOTYPE`, under PROTOTYPE-AGENT-ACCEPTANCE-001 — see `tracking/ACCEPTANCE_EVIDENCE.md` |

A criterion is **PASS** only when every mapped test exists in the tested source and passed in this run.
`Full recorded suite` means the criterion is about the suite itself (for example VP-063-AC04) and passes only
when both runs report zero failures, cancellations and skips. The *basis* column states which assertion in the
mapped tests proves the criterion; historical link-count tables are retained in git history only.

| Criterion | Modules | Original criterion | Executed tests and observed result | Assertion basis | Result |
|---|---|---|---|---|---|
"""
    LEDGER.write_text(header + '\n'.join(rows) + '\n', encoding='utf-8')
    print(json.dumps({'criteria': totals, 'stories_all_pass': stories_passed, 'unit': unit_counts, 'e2e': e2e_counts}))
    return 0 if totals['FAIL'] == 0 and totals['NOT_RUN'] == 0 else 2


if __name__ == '__main__':
    sys.exit(main())
