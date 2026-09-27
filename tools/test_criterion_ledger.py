#!/usr/bin/env python3
"""Tests for tools/criterion_ledger.py (no app run; temporary files only)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ORIGINAL = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('criterion_ledger', ORIGINAL / 'tools/criterion_ledger.py')
ledger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger)


class CriterionLedgerTests(unittest.TestCase):
    def test_current_map_covers_all_256_criteria_with_existing_tests(self):
        mapping = json.loads(ledger.MAP.read_text(encoding='utf-8'))['criteria']
        self.assertEqual([], ledger.check(mapping, ledger.source_tests(), ledger.criteria_text()))
        self.assertEqual(256, len(mapping))

    def test_check_rejects_missing_tests_basis_and_criteria(self):
        criteria = {'VP-001-AC01': 'x', 'VP-001-AC02': 'y'}
        mapping = {'VP-001-AC01': {'tests': [{'file': 'tests/unit/none.test.ts', 'name': 'does not exist'}], 'basis': ''}}
        errors = ledger.check(mapping, {}, criteria)
        self.assertTrue(any('map/criteria mismatch' in error for error in errors))
        self.assertTrue(any('no assertion basis' in error for error in errors))
        self.assertTrue(any('not found in source' in error for error in errors))

    def test_todo_tests_block_full_suite_criteria(self):
        import subprocess, sys
        with tempfile.TemporaryDirectory() as tmp:
            unit, e2e = Path(tmp) / 'unit.tap', Path(tmp) / 'e2e.tap'
            for log, todo in ((unit, 1), (e2e, 0)):
                log.write_text(f'TAP version 13\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo {todo}\n', encoding='utf-8')
            original = ledger.LEDGER.read_text(encoding='utf-8')
            try:
                run = subprocess.run([sys.executable, str(ORIGINAL / 'tools/criterion_ledger.py'), 'generate', '--unit-log', str(unit), '--e2e-log', str(e2e),
                                      '--sha', 'x', '--build-digest', 'x', '--run-id', 'x', '--run-date', 'x'], capture_output=True, text=True)
                text = ledger.LEDGER.read_text(encoding='utf-8')
            finally:
                ledger.LEDGER.write_text(original, encoding='utf-8')
            self.assertNotEqual(0, run.returncode)
            row = next(line for line in text.splitlines() if line.startswith('| VP-063-AC04 |'))
            self.assertIn('Full recorded suite — **FAIL**', row)

    def test_source_titles_unescape_quotes_like_the_runtime(self):
        tests = ledger.source_tests()
        self.assertIn("allows a manager to correct another author's inbound note with retained history (VP-027-E02)", tests)
        self.assertFalse([title for title in tests if title.endswith('\\')], 'no title is truncated at an escaped quote')

    def test_tap_parsing_marks_failures_skips_and_templated_titles(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / 'run.tap'
            log.write_text('\n'.join([
                'TAP version 13',
                '    ok 1 - denies writes when Suspended',
                '    not ok 2 - denies writes when Closed',
                '    ok 3 - optional path # SKIP not supported',
                'ok 4 - plain title',
                '# tests 4', '# pass 2', '# fail 1', '# skipped 1', '# cancelled 0', '# todo 0',
            ]), encoding='utf-8')
            results = ledger.parse_tap(str(log))
            self.assertTrue(results['plain title'])
            self.assertFalse(results['optional path'])
            pattern = ledger.title_pattern('denies writes when ${lifecycleStatus}')
            self.assertEqual([True, False], [results[name] for name in results if pattern.match(name)])
            self.assertEqual(1, ledger.summary_counts(str(log))['fail'])


if __name__ == '__main__':
    unittest.main()
