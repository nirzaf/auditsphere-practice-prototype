import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import type { BusinessEngagementFolder } from '../../src/shared/api/business';
import { BusinessEngagementFolderList } from '../../src/components/business/BusinessEngagementFolderList';

const folders: BusinessEngagementFolder[] = [
  { id: 'admin', code: 'ADMIN_PLANNING', displayName: '01_Administration & Planning', ordinal: 1, fileCount: 2, readOnly: 0, uploadRule: 'Administrative planning records.' },
  { id: 'tb', code: 'TB_SCHEDULES', displayName: '02_Trial Balance & Schedules', ordinal: 2, fileCount: 0, readOnly: 0, uploadRule: 'Trial balance schedules.' },
  { id: 'fieldwork', code: 'FIELDWORK_TESTING', displayName: '03_Fieldwork & Testing', ordinal: 3, fileCount: 1, readOnly: 0, uploadRule: 'Fieldwork and evidence.' },
  { id: 'drafts', code: 'DRAFTS_DELIVERABLES', displayName: '04_Drafts & Deliverables', ordinal: 4, fileCount: 0, readOnly: 0, uploadRule: 'Draft and deliverable files.' },
  { id: 'final', code: 'FINAL_SIGNED_ARCHIVE', displayName: '05_Final Signed Archive', ordinal: 5, fileCount: 0, readOnly: 1, uploadRule: 'Finalization and seal workflow only.' }
];

it('US-GOV-004 renders the ordered folder taxonomy, counts, rules and read-only archive marker', () => {
  const html = renderToStaticMarkup(createElement(BusinessEngagementFolderList, { folders }));
  assert.match(html, /<ol[^>]*aria-label="Engagement folders"/);
  assert.equal((html.match(/<li>/g) ?? []).length, 5);
  assert.ok(html.indexOf('01 · 01_Administration') < html.indexOf('02 · 02_Trial Balance'));
  assert.ok(html.indexOf('02 · 02_Trial Balance') < html.indexOf('03 · 03_Fieldwork'));
  assert.ok(html.indexOf('03 · 03_Fieldwork') < html.indexOf('04 · 04_Drafts'));
  assert.ok(html.indexOf('04 · 04_Drafts') < html.indexOf('05 · 05_Final Signed Archive'));
  assert.match(html, /2 committed files/);
  assert.match(html, /1 committed file/);
  assert.match(html, /Upload rule: Administrative planning records\./);
  assert.match(html, /0 committed files · Read-only; release workflow only/);
  assert.match(html, /Upload rule: Finalization and seal workflow only\./);
});
