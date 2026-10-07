import { jsPDF } from 'jspdf';

export interface ProposalDocumentInput {
  id: string;
  revision: number;
  createdAt: string;
  mode: 'QUOTE' | 'FULL_PROPOSAL';
  scope: string;
  feeMinor: number;
  validUntil: string;
  timeline: Array<{ name: string; date: string }>;
  client: { legalName: string; tradingName: string | null; registrationNumber: string | null };
  engagement: { code: string; periodStart: string; periodEnd: string; type: string };
  firm: {
    legalName: string;
    registrationNumber: string;
    address: string;
    profileText: string;
    methodologyText: string;
    credentialsText?: string;
    industryPortfolioText?: string;
  };
  firmEvidence: {
    credentials: Array<{ originalName: string; sha256: string }>;
    industryPortfolio: Array<{ originalName: string; sha256: string }>;
  };
  team: Array<{ displayName: string; grade: string; originalName: string; sha256: string }>;
}

export class ProposalDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProposalDocumentError';
  }
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function containsArabic(text: string): boolean {
  return /\p{Script=Arabic}/u.test(text);
}

function currencyMinor(value: number): string {
  const minor = BigInt(value);
  const whole = (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `QAR ${whole}.${(minor % 100n).toString().padStart(2, '0')}`;
}

function stablePdfFileId(input: ProposalDocumentInput): string {
  const source = `${input.id}:${input.revision}:${input.createdAt}`;
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35].map(seed => {
    let hash = seed;
    for (let index = 0; index < source.length; index += 1) {
      hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }).join('').toUpperCase();
}

export function renderProposalPdf(input: ProposalDocumentInput, arabicFontBytes?: Uint8Array): Uint8Array {
  if (input.mode === 'FULL_PROPOSAL' && (input.firm.credentialsText?.trim().length ?? 0) < 10) {
    throw new ProposalDocumentError('FIRM_CREDENTIALS_REQUIRED', 'A comprehensive proposal needs current, firm-verified credential content. Add at least 10 characters to the Partner-approved firm profile and retry.');
  }
  if (input.mode === 'FULL_PROPOSAL' && (input.firm.industryPortfolioText?.trim().length ?? 0) < 10) {
    throw new ProposalDocumentError('FIRM_PORTFOLIO_REQUIRED', 'A comprehensive proposal needs relevant, firm-verified industry portfolio content. Add at least 10 characters to the Partner-approved firm profile and retry.');
  }
  if (input.mode === 'FULL_PROPOSAL' && !input.firmEvidence.credentials.length) {
    throw new ProposalDocumentError('FIRM_CREDENTIAL_EVIDENCE_REQUIRED', 'Select at least one committed firm credential evidence file before rendering a comprehensive proposal.');
  }
  if (input.mode === 'FULL_PROPOSAL' && !input.firmEvidence.industryPortfolio.length) {
    throw new ProposalDocumentError('FIRM_PORTFOLIO_EVIDENCE_REQUIRED', 'Select at least one committed industry portfolio evidence file before rendering a comprehensive proposal.');
  }
  const searchableText = JSON.stringify(input);
  const arabic = containsArabic(searchableText);
  if (arabic && !arabicFontBytes?.length) {
    throw new ProposalDocumentError('ARABIC_FONT_UNAVAILABLE', 'This proposal contains Arabic text, but the approved Arabic font asset could not be loaded. Restore the Noto Sans Arabic asset and retry document generation.');
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setCreationDate(new Date(input.createdAt));
  doc.setFileId(stablePdfFileId(input));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 17;
  const usableWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 20;
  const lineHeight = 5.2;

  if (arabic && arabicFontBytes) {
    doc.addFileToVFS('NotoSansArabic.ttf', base64(arabicFontBytes));
    doc.addFont('NotoSansArabic.ttf', 'NotoSansArabic', 'normal');
  }
  const fontFamily = arabic ? 'NotoSansArabic' : 'helvetica';
  let y = 22;

  const drawLine = (text: string, options: { size?: number; gap?: number; centered?: boolean; label?: boolean } = {}) => {
    const size = options.size ?? 10;
    doc.setFont(fontFamily, !arabic && options.label ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, usableWidth) as string[];
    for (const line of lines) {
      if (y + lineHeight > bottom) {
        doc.addPage();
        y = 22;
      }
      const rtl = arabic && containsArabic(line);
      const x = options.centered ? pageWidth / 2 : rtl ? pageWidth - margin : margin;
      doc.text(line, x, y, {
        align: options.centered ? 'center' : rtl ? 'right' : 'left',
        ...(rtl ? { isInputRtl: true } : {})
      });
      y += lineHeight;
    }
    y += options.gap ?? 0;
  };

  const drawSection = (title: string) => {
    y += 2;
    drawLine(title, { size: 12, gap: 1, label: true });
  };

  doc.setTextColor(21, 51, 79);
  drawLine(input.firm.legalName, { size: 18, centered: true, gap: 1, label: true });
  doc.setTextColor(41, 55, 68);
  drawLine(input.firm.address, { size: 9, centered: true, gap: 1 });
  drawLine(`Commercial Registration: ${input.firm.registrationNumber}`, { size: 9, centered: true, gap: 4 });
  drawLine(input.mode === 'QUOTE' ? 'QUOTATION' : 'COMPREHENSIVE AUDIT PROPOSAL', { size: 15, centered: true, gap: 2, label: true });
  drawLine(`Proposal ${input.id} · Revision ${input.revision}`, { size: 9, centered: true, gap: 4 });

  drawSection('Client and engagement');
  drawLine(`Client: ${input.client.legalName}${input.client.tradingName ? ` (${input.client.tradingName})` : ''}`);
  if (input.client.registrationNumber) drawLine(`Client registration: ${input.client.registrationNumber}`);
  drawLine(`Engagement: ${input.engagement.code} · ${input.engagement.type.replaceAll('_', ' ')}`);
  drawLine(`Reporting period: ${input.engagement.periodStart} to ${input.engagement.periodEnd}`);
  drawLine(`Offer valid through: ${input.validUntil}`, { gap: 1 });

  drawSection('Scope of services');
  drawLine(input.scope, { gap: 1 });

  drawSection('Timeline');
  for (const milestone of input.timeline) drawLine(`• ${milestone.date} — ${milestone.name}`);

  drawSection('Professional fees and payment terms');
  const advanceMinor = Math.floor(input.feeMinor / 2) + (input.feeMinor % 2);
  const finalMinor = input.feeMinor - advanceMinor;
  drawLine(`Total professional fee: ${currencyMinor(input.feeMinor)}`, { size: 11, label: true });
  drawLine(`Advance (50%): ${currencyMinor(advanceMinor)}`);
  drawLine(`Final balance (50%): ${currencyMinor(finalMinor)}`);
  drawLine('Payment percentages are fixed at 50% / 50%; the final amount is the residual so minor units reconcile exactly.', { size: 9, gap: 1 });

  drawSection('Firm profile');
  drawLine(input.firm.profileText, { gap: 1 });
  if (input.mode === 'FULL_PROPOSAL') {
    drawSection('Firm credentials');
    drawLine(input.firm.credentialsText!.trim(), { gap: 1 });
    for (const file of input.firmEvidence.credentials) drawLine(`Supporting credential file: ${file.originalName} · SHA-256 ${file.sha256}`, { size: 8 });
    drawSection('Relevant industry portfolio');
    drawLine(input.firm.industryPortfolioText!.trim(), { gap: 1 });
    for (const file of input.firmEvidence.industryPortfolio) drawLine(`Supporting portfolio file: ${file.originalName} · SHA-256 ${file.sha256}`, { size: 8 });
  }
  drawSection('Approved methodology');
  drawLine(input.firm.methodologyText, { gap: 1 });

  if (input.mode === 'FULL_PROPOSAL') {
    drawSection('Assigned engagement team');
    for (const member of input.team) {
      drawLine(`${member.displayName} — ${member.grade}`);
      drawLine(`Approved CV attachment: ${member.originalName} · SHA-256 ${member.sha256}`, { size: 8, gap: 1 });
    }
    drawLine('The approved CV files identified above are retained as separate, exact-version attachments.', { size: 9, gap: 1 });
  }

  const pageCount = doc.getNumberOfPages();
  const maxPages = input.mode === 'QUOTE' ? 2 : 30;
  if (pageCount > maxPages) {
    throw new ProposalDocumentError('PROPOSAL_EXCEEDS_PAGE_LIMIT', input.mode === 'QUOTE'
      ? 'This quotation needs more than two pages. Shorten the scope or firm profile and generate it again.'
      : 'This proposal exceeds the 30-page safety limit. Reduce the supplied content and generate it again.');
  }

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 110, 120);
    const footer = `Proposal ${input.id} · Revision ${input.revision} · Page ${page} of ${pageCount}`;
    doc.text(footer, pageWidth / 2, pageHeight - 9, { align: 'center' });
  }
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const signature = new TextDecoder().decode(bytes.subarray(0, 8));
  if (bytes.length < 500 || !/^%PDF-\d\.\d/.test(signature)) {
    throw new ProposalDocumentError('PDF_VALIDATION_FAILED', 'The generated proposal did not pass its PDF signature and size check.');
  }
  return bytes;
}
