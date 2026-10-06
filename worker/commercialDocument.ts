import { jsPDF } from 'jspdf';

export type CommercialDocumentInput = {
  kind: 'ENGAGEMENT_LETTER' | 'INVOICE' | 'RECEIPT' | 'CONFIRMATION_REQUEST' | 'HOLDING_LETTER';
  number: string;
  createdAt: string;
  firmName: string;
  clientName: string;
  engagementCode: string;
  serviceType: string;
  periodStart: string;
  periodEnd: string;
  feeMinor: number;
  clauses?: string;
  dueDate?: string;
  subtotalMinor?: number;
  taxMinor?: number;
  taxPolicyName?: string;
  paymentReference?: string;
  receivedOn?: string;
  allocatedMinor?: number;
  isReversal?: boolean;
  signature?: { bytes: Uint8Array; partnerName: string };
  sealBytes?: Uint8Array;
  noticeText?: string;
};

export class CommercialDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CommercialDocumentError';
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function money(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new CommercialDocumentError('INVALID_DOCUMENT_AMOUNT', 'The document contains an invalid QAR minor-unit amount.');
  const minor = BigInt(value);
  return `QAR ${(minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(minor % 100n).toString().padStart(2, '0')}`;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

/** Renders the exact text and image bytes pinned to a committed commercial revision. */
export function renderCommercialPdf(input: CommercialDocumentInput): Uint8Array {
  if (!input.number.trim() || !input.clientName.trim() || !input.firmName.trim()) {
    throw new CommercialDocumentError('INVALID_DOCUMENT_SNAPSHOT', 'The commercial document is missing a required party or number.');
  }
  if (input.kind === 'ENGAGEMENT_LETTER'
    && (!input.signature || !isPng(input.signature.bytes) || !input.sealBytes || !isPng(input.sealBytes) || !input.clauses?.trim())) {
    throw new CommercialDocumentError('ENGAGEMENT_ASSET_INVALID', 'The engagement letter needs its pinned PNG signature, PNG seal and approved clauses.');
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setCreationDate(new Date(input.createdAt));
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = 22;
  const line = (value: string, size = 10, gap = 0, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, width - margin * 2) as string[];
    for (const text of lines) {
      if (y > height - 24) { doc.addPage(); y = 22; }
      doc.text(text, margin, y);
      y += 5.3;
    }
    y += gap;
  };
  doc.setTextColor(21, 51, 79);
  line(input.firmName, 17, 2, true);
  doc.setTextColor(37, 50, 62);
  const title = input.kind === 'ENGAGEMENT_LETTER' ? 'ENGAGEMENT LETTER'
    : input.kind === 'INVOICE' ? 'ADVANCE INVOICE'
      : input.kind === 'CONFIRMATION_REQUEST' ? 'EXTERNAL CONFIRMATION REQUEST'
        : input.kind === 'HOLDING_LETTER' ? 'HOLDING LETTER — OUTSTANDING CRITICAL CONFIRMATIONS'
          : input.isReversal ? 'PAYMENT REVERSAL RECEIPT' : 'PAYMENT RECEIPT';
  line(title, 14, 2, true);
  line(`Document number: ${input.number}`);
  line(`Client: ${input.clientName}`);
  line(`Engagement: ${input.engagementCode} · ${input.serviceType.replaceAll('_', ' ')}`);
  line(`Reporting period: ${input.periodStart} to ${input.periodEnd}`, 10, 4);

  if (input.kind === 'ENGAGEMENT_LETTER') {
    line('Agreed professional fee', 11, 1, true);
    line(money(input.feeMinor), 12, 3);
    line('Approved engagement terms', 11, 1, true);
    line(input.clauses ?? '', 10, 4);
    line('Partner signature image', 10, 1, true);
    const signature = input.signature!;
    const sigData = `data:image/png;base64,${toBase64(signature.bytes)}`;
    doc.addImage(sigData, 'PNG', margin, y, 56, 22);
    y += 27;
    line(`Partner profile: ${signature.partnerName}`, 9, 3);
    line('Firm seal', 10, 1, true);
    doc.addImage(`data:image/png;base64,${toBase64(input.sealBytes!)}`, 'PNG', margin, y, 28, 28);
    y += 34;
    line('The signature is an image associated with a self-selected Partner profile. It is not a certificate-based digital signature.', 8, 0);
  } else if (input.kind === 'INVOICE') {
    line('Advance invoice amount', 11, 1, true);
    line(`Subtotal: ${money(input.subtotalMinor ?? 0)}`);
    line(`Tax (${input.taxPolicyName ?? 'approved workspace policy'}): ${money(input.taxMinor ?? 0)}`);
    line(`Total due: ${money(input.feeMinor)}`, 12, 2, true);
    line(`Due date: ${input.dueDate ?? 'Not set'}`);
  } else if (input.kind === 'CONFIRMATION_REQUEST' || input.kind === 'HOLDING_LETTER') {
    line(input.kind === 'CONFIRMATION_REQUEST' ? 'To the independent external party' : 'To client management', 11, 1, true);
    line(input.noticeText ?? '', 10, 2);
    line(input.kind === 'CONFIRMATION_REQUEST'
      ? 'Please respond directly to the auditor using the independently verified contact route. A client-provided copy alone is not treated as an independently verified response.'
      : 'Please provide the outstanding direct third-party confirmations listed above. This notice does not change the confirmation scope or release requirements.', 9, 0);
  } else {
    line(input.isReversal ? 'Reversed verified payment' : 'Verified payment', 11, 1, true);
    line(`${input.isReversal ? 'Reversed amount' : 'Received'}: ${money(input.feeMinor)} on ${input.receivedOn ?? ''}`);
    line(`Reference: ${input.paymentReference ?? ''}`);
    line(`Allocated to this invoice: ${money(input.allocatedMinor ?? 0)}`);
    line('Receipt issuance records the verified payment evidence on file; it does not confirm settlement of any unallocated cash.', 9, 0);
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 120);
    doc.text(`${input.number} · Page ${page} of ${doc.getNumberOfPages()}`, width / 2, height - 10, { align: 'center' });
  }
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  if (bytes.length < 500 || !/^%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.subarray(0, 8)))) {
    throw new CommercialDocumentError('PDF_VALIDATION_FAILED', 'The generated commercial PDF did not pass validation.');
  }
  return bytes;
}
