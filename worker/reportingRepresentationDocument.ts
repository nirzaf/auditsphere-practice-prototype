import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

export type RepresentationFigure = {
  label: string;
  current: string;
  comparative: string | null;
};

export type RepresentationDocumentInput = {
  clientName: string;
  engagementCode: string;
  periodStart: string;
  periodEnd: string;
  proposedReportDate: string;
  signatories: string[];
  statementSnapshotId: string;
  statementSourceHash: string;
  approvedClauses: string[];
  approvedClausesHash: string;
  figures: RepresentationFigure[];
};

/** Creates an editable draft template; the firm must review its clauses before issue. */
export async function renderRepresentationTemplateDocx(input: RepresentationDocumentInput): Promise<Uint8Array> {
  if (input.approvedClauses.length < 1 || input.approvedClauses.length > 30 || !/^[a-f0-9]{64}$/.test(input.approvedClausesHash)) {
    throw new Error('A firm-approved, hash-pinned representation clause set is required.');
  }
  const children = [
    new Paragraph({ text: 'Management Representation Letter', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: 'DRAFT TEMPLATE · NOT SIGNED · NOT EVIDENCE OF REPRESENTATION', bold: true, color: '9C3A20' })] }),
    new Paragraph({ text: `[Place on ${input.clientName} letterhead]` }),
    new Paragraph({ text: '[Insert management address and date of signature]' }),
    new Paragraph({ text: 'To the Independent Auditor' }),
    new Paragraph({ text: `Subject: ${input.clientName} · ${input.engagementCode} · ${input.periodStart} to ${input.periodEnd}`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: `Proposed auditor’s report date: ${input.proposedReportDate}` }),
    new Paragraph({ text: `This editable draft is for the financial statements of ${input.clientName} for the period ${input.periodStart} to ${input.periodEnd}. Management must complete the letter on the entity’s letterhead, confirm each statement, and sign and date it no later than the auditor’s report date.` }),
    new Paragraph({ text: 'Approved financial statement figures (QAR)', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Statement snapshot ${input.statementSnapshotId} · source SHA-256 ${input.statementSourceHash}` }),
    ...input.figures.map(figure => new Paragraph({
      children: [new TextRun({ text: `${figure.label}: `, bold: true }), new TextRun({ text: `${figure.current}${figure.comparative ? ` · comparative ${figure.comparative}` : ' · comparative not presented' })` })]
    })),
    new Paragraph({ text: 'Firm-approved management representations', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Approved wording set SHA-256: ${input.approvedClausesHash}` }),
    ...input.approvedClauses.map((clause, index) => new Paragraph({ text: `${index + 1}. ${clause}` })),
    new Paragraph({ text: 'Authorised management signatories', heading: HeadingLevel.HEADING_2 }),
    ...input.signatories.flatMap((name, index) => [
      new Paragraph({ text: `${index + 1}. ${name}` }),
      new Paragraph({ text: 'Title / authority: ______________________________________________' }),
      new Paragraph({ text: 'Signature: ______________________________    Date: __________________' })
    ]),
    new Paragraph({ children: [new TextRun({ text: 'Workflow control: retain the signed return as a new immutable file version and complete the independent identity-as-represented, authority, completeness, period, date and consistency review before report release.', italics: true })] })
  ];
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
