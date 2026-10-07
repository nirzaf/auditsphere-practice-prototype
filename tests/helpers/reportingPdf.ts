import { inflateSync } from 'node:zlib';

export type ExtractedPdfText = { pageCount: number; pages: string[][]; strings: string[]; text: string };
const WIN_ANSI_EXTENDED: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ'
};

function decodeLiteral(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      result += character;
      continue;
    }
    const escaped = value[++index];
    if (escaped === undefined) break;
    if (escaped === '\r' || escaped === '\n') {
      if (escaped === '\r' && value[index + 1] === '\n') index += 1;
      continue;
    }
    const simpleEscapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    if (Object.hasOwn(simpleEscapes, escaped)) {
      result += simpleEscapes[escaped];
      continue;
    }
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/.test(value[index + 1] ?? '')) octal += value[++index];
      result += String.fromCharCode(Number.parseInt(octal, 8));
      continue;
    }
    result += escaped;
  }
  return [...result].map(character => WIN_ANSI_EXTENDED[character.charCodeAt(0)] ?? character).join('');
}

function textFromContentStream(content: string): string[] {
  const strings: string[] = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '(') continue;
    const start = index + 1;
    let depth = 1;
    let cursor = start;
    while (cursor < content.length && depth > 0) {
      const character = content[cursor];
      if (character === '\\') {
        cursor += 2;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) break;
    let operator = cursor;
    while (/[\s]/.test(content[operator] ?? '')) operator += 1;
    if (/^Tj\b/.test(content.slice(operator))) strings.push(decodeLiteral(content.slice(start, cursor - 1)));
    index = cursor - 1;
  }
  return strings;
}

/** Extracts visible literal text and page count from the jsPDF reports produced by the Worker. */
export function extractReportingPdfText(bytes: Uint8Array): ExtractedPdfText {
  const pdf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const source = pdf.toString('latin1');
  if (!source.startsWith('%PDF-')) throw new Error('The report artifact is not a PDF document.');

  const pageCount = (source.match(/\/Type \/Page\b/g) ?? []).length;
  const pages: string[][] = [];
  const strings: string[] = [];
  const streamMarkers = /\r?\nstream\r?\n/g;
  let marker: RegExpExecArray | null;
  while ((marker = streamMarkers.exec(source)) !== null) {
    const streamAt = marker.index + (marker[0].startsWith('\r\n') ? 2 : 1);
    const dataStart = streamMarkers.lastIndex;
    const dictionaryStart = source.lastIndexOf('<<', streamAt);
    const dictionary = dictionaryStart < 0 ? '' : source.slice(dictionaryStart, streamAt);
    const length = Number.parseInt(dictionary.match(/\/Length\s+(\d+)/)?.[1] ?? '', 10);
    if (!Number.isSafeInteger(length) || length < 0 || dataStart + length > pdf.length) {
      continue;
    }
    const encoded = pdf.subarray(dataStart, dataStart + length);
    let content: string;
    if (/\/FlateDecode\b/.test(dictionary)) {
      try {
        content = inflateSync(encoded).toString('latin1');
      } catch (error) {
        throw new Error(`Could not inflate a PDF stream at byte ${dataStart}.`, { cause: error });
      }
    }
    else if (!/\/Filter\b/.test(dictionary)) content = encoded.toString('latin1');
    else {
      continue;
    }
    if (/\bBT\b/.test(content) && content.includes('Tj')) {
      const pageStrings=textFromContentStream(content);
      if(pageStrings.length){pages.push(pageStrings);strings.push(...pageStrings);}
    }
  }

  return { pageCount, pages, strings, text: strings.join('\n') };
}
