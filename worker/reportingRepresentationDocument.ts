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
  figures: RepresentationFigure[];
};

/** Creates an editable draft template; the firm must review its clauses before issue. */
export async function renderRepresentationTemplateDocx(input: RepresentationDocumentInput): Promise<Uint8Array> {
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
    new Paragraph({ text: 'Management representations (review against the firm-approved wording before issue)', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: '1. We have fulfilled our responsibilities for the preparation and fair presentation of the financial statements in accordance with the applicable financial reporting framework, including the accounting policies and disclosures approved for this engagement.' }),
    new Paragraph({ text: '2. We have provided the auditor with access to all information and records relevant to the preparation of the financial statements, all requested explanations, and unrestricted access to persons from whom the auditor determined it necessary to obtain evidence.' }),
    new Paragraph({ text: '3. We have recorded all transactions and events in the accounting records and reflected them in the financial statements. We have disclosed known or suspected fraud, non-compliance with laws and regulations, related parties, commitments, guarantees and subsequent events requiring adjustment or disclosure.' }),
    new Paragraph({ text: '4. We have provided the schedule of uncorrected misstatements, confirmed that each is immaterial individually and in aggregate, and disclosed our reasons for not correcting them.' }),
    new Paragraph({ text: '5. We have disclosed all information relevant to the use of the going-concern basis, our plans for future action, and any material uncertainties that may cast significant doubt on the entity’s ability to continue as a going concern.' }),
    new Paragraph({ text: '6. The financial statement figures above agree to the identified approved statement snapshot. Any disagreement, omitted representation, or change through the report date must be raised with the auditor before this letter is signed.' }),
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
