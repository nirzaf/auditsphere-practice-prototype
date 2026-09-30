// AuditSphere Genuine File Export Service
// Supports XLSX, DOCX, and PDF creation with watermark
// VP-035, VP-041, VP-042, VP-046

import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { jsPDF } from 'jspdf';

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// 1. Genuine XLSX Export
export function createXLSXBlob(
  title: string,
  sheetData: Array<Array<string | number>> | Array<Record<string, any>>
): Blob {
  const wb = XLSX.utils.book_new();

  const headerMeta: Array<Array<string | number>> = [
    ['AuditSphere · Synthetic Role Prototype'],
    [`Artifact: ${title}`],
    ['WATERMARK: DEMONSTRATION RECORD ONLY — NO LEGAL CERTIFICATION'],
    ['Generated on:', new Date().toISOString()],
    []
  ];

  let ws: XLSX.WorkSheet;
  if (Array.isArray(sheetData) && sheetData.length > 0 && !Array.isArray(sheetData[0])) {
    const records = sheetData as Array<Record<string, any>>;
    const keys = Array.from(new Set(records.flatMap(r => Object.keys(r))));
    const dataRows = [
      keys,
      ...records.map(r => keys.map(k => r[k] ?? ''))
    ];
    ws = XLSX.utils.aoa_to_sheet([...headerMeta, ...dataRows]);
  } else {
    ws = XLSX.utils.aoa_to_sheet([...headerMeta, ...(sheetData as Array<Array<string | number>>)]);
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Financial Data');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return blob;
}

export function exportToXLSX(title: string, sheetData: Array<Array<string | number>> | Array<Record<string, any>>, fileName = 'AuditSphere_Export.xlsx') {
  downloadBlob(createXLSXBlob(title, sheetData), fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

// 2. Genuine DOCX Export
export async function createDOCXBlob(
  title = 'AuditSphere Deliverable Package',
  lines: string[] = []
): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'AuditSphere Practice Platform',
            heading: HeadingLevel.TITLE
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'DEMONSTRATION RECORD ONLY · SYNTHETIC DATA',
                bold: true,
                color: '777777',
                size: 20
              })
            ]
          }),
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1
          }),
          new Paragraph({
            text: `Generated: ${new Date().toLocaleDateString('en-GB')} · Scope: Demonstrative only`
          }),
          ...lines.map(line => new Paragraph({ text: line }))
        ]
      }
    ]
  });

  return Packer.toBlob(doc);
}

export async function exportToDOCX(fileName = 'AuditSphere_Package.docx', title = 'AuditSphere Deliverable Package', lines: string[] = []) {
  downloadBlob(await createDOCXBlob(title, lines), fileName.endsWith('.docx') ? fileName : `${fileName}.docx`);
}

// 3. Genuine PDF Export
export function createPDFBlob(
  title = 'AuditSphere Statement',
  lines: string[] = []
): Blob {
  const doc = new jsPDF();

  // Watermark header
  doc.setFontSize(16);
  doc.setTextColor(9, 126, 116); // --teal
  doc.text('AuditSphere · Role Portals', 20, 20);

  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text('DEMONSTRATION RECORD ONLY — NOT A LEGAL OPINION', 20, 28);

  doc.setFontSize(14);
  doc.setTextColor(24, 46, 52); // --ink
  doc.text(title, 20, 40);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${new Date().toISOString()} · Status: Local Demo Release`, 20, 48);

  // Content lines
  let y = 60;
  lines.flatMap(line => doc.splitTextToSize(line, 170)).forEach(line => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(line, 20, y);
    y += 6;
  });

  // Footer
  if (lines.some(line => /SYNTHETIC DEMO SEAL|SIGNATORIES AND CREDENTIALS/.test(line))) {
    if (y > 220) { doc.addPage(); y = 30; }
    doc.setDrawColor(43, 108, 176); doc.setTextColor(43, 108, 176); doc.setLineWidth(0.6);
    doc.circle(160, y + 20, 17); doc.circle(160, y + 20, 14);
    doc.setFontSize(8); doc.text('STE AUDIT', 160, y + 17, { align: 'center' }); doc.text('DEMO SEAL', 160, y + 23, { align: 'center' });
    doc.setFont('helvetica', 'italic'); doc.setFontSize(17); doc.text('Demo Partner', 24, y + 20);
    doc.line(24, y + 24, 88, y + 24); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Synthetic visual signature and seal — no legal certification', 24, y + 45);
  }
  doc.setFontSize(8);
  doc.setTextColor(170, 170, 170);
  doc.text('AuditSphere Prototype v2.0 · Qatar Synthetic Accounting & Audit Scenario', 20, 285);

  return doc.output('blob');
}

export function exportToPDF(fileName = 'AuditSphere_Statement.pdf', title = 'AuditSphere Statement', lines: string[] = []) {
  downloadBlob(createPDFBlob(title, lines), fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

// 4. CSV Helper
export function exportToCSV(fileName = 'AuditSphere_Export.csv', dataOrRows: string[][] | string = '') {
  let content = '';
  if (typeof dataOrRows === 'string') {
    content = dataOrRows;
  } else if (Array.isArray(dataOrRows)) {
    content = dataOrRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
}

export const exportService = {
  createPDFBlob,
  createDOCXBlob,
  createXLSXBlob,
  exportPDF: (fileName: string, title: string, lines: string[]) => exportToPDF(fileName, title, lines),
  exportDOCX: (fileName: string, title: string, lines: string[]) => exportToDOCX(fileName, title, lines),
  exportXLSX: (fileName: string, title: string, data: any) => exportToXLSX(title, data, fileName),
  exportCSV: (fileName: string, rows: string[][]) => exportToCSV(fileName, rows)
};
