#!/usr/bin/env python3
"""Generated task-pack tests only. All writes occur in temporary pack copies."""
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ORIGINAL=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('progress_helper',ORIGINAL/'tools/progress.py')
helper=importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)/'pack'
        shutil.copytree(ORIGINAL,self.root,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        helper.ROOT=self.root
        self.reset_to_initial_pack()
    def reset_to_initial_pack(self):
        # The live pack has since been completed; these state-machine tests exercise the
        # initial NOT_STARTED pack they were written for, rebuilt inside the temporary copy.
        import re
        for task_id,(row,meta,body) in helper.cards().items():
            meta.update(status='NOT_STARTED',owner='',reviewer='',evidence='')
            meta.pop('blocked_reason',None)
            body=re.sub(r'(<!-- TASK_ACCEPTANCE -->.*?<!-- END_TASK_ACCEPTANCE -->)',lambda m:m[1].replace('- [x]','- [ ]').replace('- [X]','- [ ]'),body,flags=re.S)
            helper.write_card(self.root/row['file'],meta,body)
        helper.refresh()
    def tearDown(self):
        helper.ROOT=ORIGINAL;self.tmp.cleanup()
    def test_initial_pack_is_valid(self):
        errors,stats=helper.validate()
        self.assertEqual([],errors)
        self.assertEqual(52,stats['tasks'])
        self.assertEqual(39,stats['module_guides'])
        self.assertEqual(256,stats['criterion_locators'])
    def test_dependency_blocks_start(self):
        with self.assertRaisesRegex(ValueError,'WAITING'):
            helper.change_status('DEMO-001','IN_PROGRESS',owner='Test owner')
    def test_completion_needs_real_review_fields(self):
        helper.change_status('VP-048','IN_PROGRESS',owner='Test owner')
        helper.change_status('VP-048','IN_REVIEW')
        with self.assertRaisesRegex(ValueError,'reviewer and evidence'):
            helper.change_status('VP-048','COMPLETED')
    def test_complete_only_after_acceptance_checks(self):
        helper.change_status('VP-048','IN_PROGRESS',owner='Test owner')
        helper.change_status('VP-048','IN_REVIEW')
        with self.assertRaisesRegex(ValueError,'four acceptance'):
            helper.change_status('VP-048','COMPLETED',reviewer='Other reviewer',evidence='Synthetic test evidence')
        row,meta,body=helper.cards()['VP-048']
        helper.write_card(self.root/row['file'],meta,body.replace('- [ ]','- [x]'))
        helper.change_status('VP-048','COMPLETED',reviewer='Other reviewer',evidence='Synthetic test evidence')
        self.assertEqual('COMPLETED',helper.cards()['VP-048'][1]['status'])
        self.assertEqual([],helper.validate()[0])
    def test_stale_index_is_detected(self):
        row,meta,body=helper.cards()['VP-048']
        meta['owner']='Changed owner'
        helper.write_card(self.root/row['file'],meta,body)
        self.assertTrue(any('index stale' in e for e in helper.validate()[0]))
        helper.refresh();self.assertEqual([],helper.validate()[0])
    def test_missing_internal_link_is_detected(self):
        with (self.root/'README.md').open('a',encoding='utf-8') as out:
            out.write('\n[Broken](missing.md)\n')
        self.assertTrue(any('missing link target' in e for e in helper.validate()[0]))
    def test_missing_original_criterion_is_detected(self):
        path=self.root/'tracking/SOURCE_TRACEABILITY.md'
        path.write_text(path.read_text(encoding='utf-8').replace('`VP-001-AC01`',''),encoding='utf-8')
        self.assertTrue(any('256 unique' in e for e in helper.validate()[0]))
    def test_blocker_requires_reason(self):
        with self.assertRaisesRegex(ValueError,'reason'):
            helper.change_status('VP-048','BLOCKED',owner='Test owner')
    def test_unknown_status_transition_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Invalid transition'):
            helper.change_status('VP-048','COMPLETED',owner='Test owner')
    def test_unknown_card_file_is_detected(self):
        (self.root/'chunks/00_Foundation/UNEXPECTED.md').write_text('# Unexpected task\n')
        self.assertTrue(any('inventory differs' in e for e in helper.validate()[0]))
    def test_module_guides_are_complete(self):
        self.assertEqual(39,len(list((self.root/'modules').glob('MOD-*.md'))))
        self.assertEqual(10,len(list((self.root/'chunks').glob('*/00_INDEX.md'))))
    def test_manifest_dependency_drift_is_detected(self):
        row,meta,body=helper.cards()['VP-003']
        meta['depends_on']=[]
        helper.write_card(self.root/row['file'],meta,body)
        self.assertTrue(any('metadata/manifest mismatch' in e for e in helper.validate()[0]))

if __name__=='__main__':unittest.main(verbosity=2)
