import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_TEMPLATES, templatesForRoute, templateUrl } from '../../src/services/projectTemplates';

it('every offered source template is a real Office file with a safe native download URL', () => {
  assert.equal(new Set(PROJECT_TEMPLATES.map(template => template.file)).size, PROJECT_TEMPLATES.length);
  for (const template of PROJECT_TEMPLATES) {
    assert.ok(!template.file.includes('..') && !template.file.includes('~$'));
    const bytes = readFileSync(`public/templates/${template.file}`);
    assert.ok(bytes.length > 512, template.file);
    const zip = bytes.subarray(0, 2).toString() === 'PK';
    const ole = bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
    assert.ok(template.format === 'DOC' ? ole || zip : zip, `${template.file} has its native Office signature`);
    assert.equal(decodeURIComponent(templateUrl(template)), `/templates/${template.file}`);
  }
});

it('templates stay in owning audit workflows and QFC forms require the matching jurisdiction', () => {
  assert.equal(templatesForRoute('portal').length, 0);
  assert.equal(templatesForRoute('overview').length, 0);
  assert.equal(templatesForRoute('practice-ledger').length, 0);
  assert.equal(templatesForRoute('engagements', 'Qatar').some(template => template.qfcOnly), false);
  assert.equal(templatesForRoute('engagements', 'Qatar Financial Centre').filter(template => template.qfcOnly).length, 5);
  assert.ok(templatesForRoute('proposals').some(template => template.category === 'Proposal'));
  assert.ok(templatesForRoute('delivery').some(template => template.category === 'Representation letter'));
  assert.ok(templatesForRoute('audit-fieldwork').some(template => /Revenue/.test(template.title)));
  assert.ok(!PROJECT_TEMPLATES.some(template => /loan-amortization|~\$/.test(template.file)));
});
