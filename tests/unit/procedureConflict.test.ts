import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProcedureConflictReview } from '../../src/components/business/ProcedureConflictReview';
import { hasProcedureVersionConflict, procedureExpectedVersion } from '../../src/domain/procedureConflict';

it('keeps the draft base version until the user explicitly rebases', () => {
  assert.equal(procedureExpectedVersion(7, 8), 7, 'a normal save keeps its original row precondition');
  assert.equal(procedureExpectedVersion(7, 8, true), 8, 'an explicit rebase uses the reviewed server version');
  assert.equal(procedureExpectedVersion(undefined, 8), 8, 'a new draft starts from the current server row');
  assert.equal(hasProcedureVersionConflict(7, 7), false);
  assert.equal(hasProcedureVersionConflict(7, 8), true);
  assert.equal(hasProcedureVersionConflict(undefined, 8), false);
});

it('renders base, local and server values with deliberate conflict actions', () => {
  const html = renderToStaticMarkup(createElement(ProcedureConflictReview, {
    title: 'Revenue cutoff',
    baseVersion: 7,
    serverVersion: 8,
    base: { workPerformed: 'Original workpaper evidence.', conclusion: 'Original conclusion.' },
    local: { workPerformed: 'Local unsaved workpaper changes.', conclusion: '<script>local text</script>' },
    server: { workPerformed: 'Other reviewer workpaper changes.', conclusion: 'Other reviewer conclusion.' },
    canRebase: true,
    rebaseUnavailableMessage: '',
    busy: false,
    onDiscard() {},
    onRebase() {}
  }));

  assert.match(html, /role="alert"/);
  assert.match(html, /Base v7/);
  assert.match(html, /Local unsaved workpaper changes\./);
  assert.match(html, /Other reviewer workpaper changes\./);
  assert.match(html, /&lt;script&gt;local text&lt;\/script&gt;/, 'local content is rendered as text');
  assert.doesNotMatch(html, /<script>local text<\/script>/);
  assert.match(html, /Discard draft and use server version/);
  assert.match(html, /Rebase draft onto v8 and save/);
});
