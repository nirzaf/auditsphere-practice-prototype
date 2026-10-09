export const CLIENT_IMPORT_COLUMNS = [
  'external_ref', 'client_code', 'legal_name', 'trading_name', 'entity_type', 'parent_external_ref', 'relationship',
  'commercial_registration', 'tax_id', 'industry', 'address', 'country_code', 'contact_name', 'contact_email',
  'contact_phone', 'contact_title', 'contact_role', 'contact_is_signatory', 'effective_from', 'route_purposes'
] as const;

export type ClientImportColumn = typeof CLIENT_IMPORT_COLUMNS[number];
export type ClientImportCsvRow = Record<ClientImportColumn, string> & { sourceRow: number };

const REQUIRED_COLUMNS: ClientImportColumn[] = [
  'external_ref', 'client_code', 'legal_name', 'entity_type', 'industry', 'address', 'country_code', 'contact_name',
  'contact_title', 'contact_role', 'effective_from'
];

interface CsvRecord { values: string[]; sourceRow: number; }

function parseCsvRecords(source: string): CsvRecord[] {
  const rows: CsvRecord[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let rowStart = 1;

  const finishField = () => { row.push(field); field = ''; closedQuote = false; };
  const finishRow = () => {
    finishField();
    if (row.some(value => value.trim() !== '')) rows.push({ values: row, sourceRow: rowStart });
    row = [];
    rowStart = line + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && source[index + 1] !== '\n')) line += 1;
      }
      continue;
    }
    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n' && char !== ' ' && char !== '\t') {
      throw new Error(`Unexpected character after a closing quote at character ${index + 1}.`);
    }
    if (closedQuote && (char === ' ' || char === '\t')) continue;
    if (char === '"') {
      if (field.trim() !== '') throw new Error(`Unexpected quote in an unquoted field at character ${index + 1}.`);
      field = '';
      quoted = true;
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      line += 1;
      finishRow();
    } else field += char;
  }
  if (quoted) throw new Error('The CSV ends inside a quoted field.');
  if (field.length || row.length || closedQuote) finishRow();
  return rows;
}

export function parseClientImportCsv(source: string): ClientImportCsvRow[] {
  const rows = parseCsvRecords(source.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('The CSV must include a header and at least one client row.');
  const header = rows[0]!.values.map(value => value.trim().toLowerCase());
  if (new Set(header).size !== header.length) throw new Error('The CSV header contains duplicate column names.');
  const unknown = header.filter(value => !CLIENT_IMPORT_COLUMNS.includes(value as ClientImportColumn));
  if (unknown.length) throw new Error(`Unknown CSV column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`);
  const missing = REQUIRED_COLUMNS.filter(value => !header.includes(value));
  if (missing.length) throw new Error(`Missing required CSV column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);

  return rows.slice(1).map(({ values, sourceRow }) => {
    if (values.length > header.length) throw new Error(`CSV row ${sourceRow} has more values than the header.`);
    const record = Object.fromEntries(CLIENT_IMPORT_COLUMNS.map(column => [column, ''])) as Record<ClientImportColumn, string>;
    header.forEach((column, cellIndex) => { record[column as ClientImportColumn] = (values[cellIndex] ?? '').trim(); });
    return { ...record, sourceRow };
  });
}
