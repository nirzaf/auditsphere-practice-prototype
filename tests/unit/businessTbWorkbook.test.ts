import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as XLSX from 'xlsx';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { ApiError } from '../../worker/errors.js';
import { parseTrialBalanceSheet, toSheetRows, type TrialBalanceColumnMap } from '../../worker/businessTb.js';

function workbookBytes(bookType: 'xlsx' | 'xlsm' = 'xlsx'): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Account Code', 'Account Name', 'Balance'],
    ['1000', 'Cash', 100]
  ]), 'Current Year');
  if (bookType === 'xlsm') (workbook as XLSX.WorkBook & { vbaraw?: Uint8Array }).vbaraw = Uint8Array.of(0x01, 0x02, 0x03);
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType }));
}

const signedBalanceMap: TrialBalanceColumnMap = {
  headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, balanceColumn: 2
};

it('reads a selected worksheet from a normal static-value workbook', () => {
  const parsed = toSheetRows(workbookBytes(), 'Current Year');
  assert.equal(parsed.sheetName, 'Current Year');
  assert.deepEqual(parsed.workbook.SheetNames, ['Current Year']);
  assert.equal(parsed.sheet.A2.v, '1000');
  assert.throws(() => toSheetRows(workbookBytes(), 'Missing'), /Choose a worksheet that exists/);
});

it('rejects VBA macro content even when an XLSM workbook is submitted as a workbook file', () => {
  assert.throws(() => toSheetRows(workbookBytes('xlsm')), (error: unknown) =>
    error instanceof ApiError && error.code === 'VALIDATION_FAILED' && /Macro-enabled/.test(error.message));
});

it('rejects Office encrypted-package containers with an actionable export error', () => {
  const compoundFileHeader = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  assert.throws(() => toSheetRows(compoundFileHeader), (error: unknown) =>
    error instanceof ApiError && error.code === 'VALIDATION_FAILED'
      && /Password-protected or legacy binary Excel workbooks/.test(error.message)
      && /remove the password/i.test(error.message)
      && /non-macro XLSX or CSV/.test(error.message));
});

it('rejects ZIP workbooks containing external-link package parts', () => {
  const files = unzipSync(workbookBytes());
  files['xl/externalLinks/externalLink1.xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><externalBook r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></externalLink>'
  );
  const withExternalLink = zipSync(files);
  assert.throws(() => toSheetRows(withExternalLink), (error: unknown) =>
    error instanceof ApiError && error.code === 'VALIDATION_FAILED' && /external links/.test(error.message));
});

it('keeps a configured non-first header row and computes debit/credit columns in signed minor units', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Trial balance as of 31 December'],
    ['Account', 'Name', 'Debit', 'Credit'],
    ['1000', 'Cash', 125.25, 0],
    ['3000', 'Equity', 0, 125.25]
  ]);
  const config: TrialBalanceColumnMap = {
    headerRow: 2, accountCodeColumn: 0, accountNameColumn: 1, debitColumn: 2, creditColumn: 3
  };
  const result = parseTrialBalanceSheet(sheet, config);
  assert.deepEqual(result.errors, []);
  assert.equal(result.debits, 12525);
  assert.equal(result.credits, 12525);
  assert.deepEqual(result.lines.map(line => line.currentMinor), [12525, -12525]);
});

it('rejects formula-only values, duplicate account codes, and amounts with excess precision', () => {
  const formulaSheet = XLSX.utils.aoa_to_sheet([
    ['Account', 'Name', 'Balance'],
    ['1000', 'Cash', 100],
    ['2000', 'Payables', -100]
  ]);
  formulaSheet.C2 = { t: 'n', f: 'SUM(C3:C3)', v: 100 };
  const formulaResult = parseTrialBalanceSheet(formulaSheet, signedBalanceMap);
  assert.ok(formulaResult.errors.some(error => error.code === 'FORMULA_VALUE_REQUIRED' && /C2/.test(error.message)));

  const duplicateSheet = XLSX.utils.aoa_to_sheet([
    ['Account', 'Name', 'Debit', 'Credit'],
    ['1000', 'Cash', 100, 0],
    ['1000', 'Cash duplicate', 0, 100]
  ]);
  const duplicateResult = parseTrialBalanceSheet(duplicateSheet, {
    headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, debitColumn: 2, creditColumn: 3
  });
  assert.ok(duplicateResult.errors.some(error => error.code === 'DUPLICATE_ACCOUNT'));

  const precisionSheet = XLSX.utils.aoa_to_sheet([
    ['Account', 'Name', 'Balance'],
    ['1000', 'Cash', '1.001']
  ]);
  const precisionResult = parseTrialBalanceSheet(precisionSheet, signedBalanceMap);
  assert.ok(precisionResult.errors.some(error => error.code === 'INVALID_ROW' && /more than two decimal places/.test(error.message)));
});

it('rejects a declared non-QAR source currency before reconciliation', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Account', 'Name', 'Balance', 'Currency'],
    ['1000', 'Cash', 100, 'USD'],
    ['2000', 'Equity', -100, 'USD']
  ]);
  const result = parseTrialBalanceSheet(sheet, { ...signedBalanceMap, currencyColumn: 3 });
  assert.equal(result.errors.filter(error => /Currency must be QAR/.test(error.message)).length, 2);

  const qarSheet = XLSX.utils.aoa_to_sheet([
    ['Account', 'Name', 'Balance', 'Currency'],
    ['1000', 'Cash', 100, ' qar '],
    ['2000', 'Equity', -100, 'QAR']
  ]);
  assert.deepEqual(parseTrialBalanceSheet(qarSheet, { ...signedBalanceMap, currencyColumn: 3 }).errors, []);
});

it('enforces the documented 20,000-row and 256-column limits at their boundaries', () => {
  const maxRows = { '!ref': 'A1:A20001' } as XLSX.WorkSheet;
  const rowBoundary = parseTrialBalanceSheet(maxRows, signedBalanceMap);
  assert.ok(rowBoundary.errors.some(error => error.code === 'EMPTY_TRIAL_BALANCE'));
  assert.throws(() => parseTrialBalanceSheet({ '!ref': 'A1:A20002' } as XLSX.WorkSheet, signedBalanceMap), /20,000-row import limit/);

  const maxColumns = { '!ref': 'A1:IV1' } as XLSX.WorkSheet;
  assert.ok(parseTrialBalanceSheet(maxColumns, signedBalanceMap).errors.some(error => error.code === 'EMPTY_TRIAL_BALANCE'));
  assert.throws(() => parseTrialBalanceSheet({ '!ref': 'A1:IW1' } as XLSX.WorkSheet, signedBalanceMap), /256-column parser limit/);
});
