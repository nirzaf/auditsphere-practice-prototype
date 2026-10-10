import { jsPDF } from 'jspdf';

export type ReportPdfSection = { heading: string; paragraphs?: string[]; rows?: Array<{ label: string; current?: string; comparative?: string; detail?: string }> };
export type ReportingPdfInput = {
  number: string;
  title: string;
  firmName: string;
  clientName: string;
  engagementCode: string;
  serviceType: string;
  periodStart: string;
  periodEnd: string;
  reportDate?: string;
  sections: ReportPdfSection[];
  signatureBytes?: Uint8Array;
  sealBytes?: Uint8Array;
  partnerName?: string;
};

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
}
function assertPng(bytes: Uint8Array | undefined): asserts bytes is Uint8Array {
  if (!bytes || bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a) throw new Error('A pinned PNG signature and seal are required.');
}

/** Renders real, page-numbered A4 report and firm communications from approved data. */
export function renderReportingPdf(input: ReportingPdfInput): Uint8Array {
  if (!input.number.trim() || !input.title.trim() || !input.firmName.trim() || !input.clientName.trim() || !input.sections.length) throw new Error('The report is missing its document identity or content.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight(), margin = 18;
  let y = 20;
  const ensure = (height: number) => { if (y + height > pageHeight - 22) { doc.addPage(); y = 20; } };
  const write = (text: string, size = 10, options: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...(options.color ?? [38, 48, 58]));
    const lines = doc.splitTextToSize(String(text), pageWidth - margin * 2) as string[];
    for (const line of lines) { ensure(6); doc.text(line, margin, y); y += Math.max(4.5, size * 0.47); }
    y += options.gap ?? 1;
  };
  const measureWrite = (text: string, size: number, options: { bold?: boolean; gap?: number } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text), pageWidth - margin * 2) as string[];
    return lines.length * Math.max(4.5, size * 0.47) + (options.gap ?? 1);
  };
  doc.setProperties({ title: input.title, subject: `${input.engagementCode} · ${input.clientName}`, author: input.firmName, creator: 'AuditSphere' });
  doc.setTextColor(21, 51, 79); write(input.firmName, 16, { bold: true, gap: 2 });
  doc.setTextColor(26, 43, 61); write(input.title, 14, { bold: true, gap: 3 });
  write(`Document: ${input.number}`); write(`Entity: ${input.clientName}`); write(`Engagement: ${input.engagementCode} · ${input.serviceType.replaceAll('_', ' ')}`);
  write(`Reporting period: ${input.periodStart} to ${input.periodEnd}`);
  if (input.reportDate) write(`Auditor’s report date: ${input.reportDate}`, 10, { gap: 5 });
  for (const section of input.sections) {
    ensure(12); y += 2; write(section.heading, 11, { bold: true, color: [21, 51, 79], gap: 1 });
    for (const paragraph of section.paragraphs ?? []) write(paragraph, 9.5, { gap: 1.2 });
    for (const row of section.rows ?? []) {
      const detail = row.detail ? ` · ${row.detail}` : '';
      const numbers = row.current === undefined ? '' : `  ${row.current}${row.comparative === undefined ? '' : `  ·  comparative ${row.comparative}`}`;
      write(`${row.label}${numbers}${detail}`, 9, { gap: 0.2 });
    }
  }
  if (input.signatureBytes || input.sealBytes) {
    assertPng(input.signatureBytes); assertPng(input.sealBytes);
    const disclaimer = 'The image is associated with a self-selected Partner persona. It is not a certificate-based digital signature or identity verification.';
    const approvalBlockHeight = 3
      + measureWrite('Partner approval assets displayed for review', 10, { bold: true, gap: 2 })
      + 23
      + (input.partnerName ? measureWrite(`Partner profile: ${input.partnerName}`, 8, { gap: 2 }) : 0)
      + 28
      + measureWrite(disclaimer, 8);
    ensure(approvalBlockHeight); y += 3; write('Partner approval assets displayed for review', 10, { bold: true, gap: 2 });
    doc.addImage(`data:image/png;base64,${base64(input.signatureBytes)}`, 'PNG', margin, y, 55, 20); y += 23;
    if (input.partnerName) write(`Partner profile: ${input.partnerName}`, 8, { gap: 2 });
    doc.addImage(`data:image/png;base64,${base64(input.sealBytes)}`, 'PNG', margin, y, 24, 24); y += 28;
    write(disclaimer, 8);
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 110, 120);
    doc.text(`${input.number} · Page ${page} of ${doc.getNumberOfPages()}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
  }
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  if (bytes.length < 500 || new TextDecoder().decode(bytes.subarray(0, 8)).slice(0, 5) !== '%PDF-') throw new Error('The reporting PDF did not pass structural validation.');
  return bytes;
}
