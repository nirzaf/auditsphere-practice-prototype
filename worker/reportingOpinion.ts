import type { ReportPdfSection } from './reportingDocument';

export type OpinionAdditionalSection = { heading: string; body: string };
export type OpinionAffectedFsli = { code: string; name: string; amountMinor: string | number | null; explanation: string };

export type OpinionReportText = {
  reportType: string;
  category: string | null;
  aupReportType?: string | null;
  aupProcedureSummary?: string | null;
  rationale?: string | null;
  materialityAssessment?: string | null;
  pervasivenessAssessment?: string | null;
  basisHeading?: string | null;
  basisText?: string | null;
  goingConcernReportingText?: string | null;
  additionalSections?: OpinionAdditionalSection[];
};

export function validateOpinionSelection(input: {
  reportType: string;
  category: string | null;
  affectedFsliCount: number;
  basisText: string | null;
  aupReportType: string | null;
  aupProcedureSummary: string | null;
}): string | null {
  if (input.reportType === 'ISRS_4400_AUP') {
    if (input.category !== null || input.affectedFsliCount || input.basisText?.trim()) {
      return 'An AUP engagement cannot carry an ISA audit opinion, affected audit FSLIs, or an audit-opinion basis.';
    }
    if (!input.aupReportType?.trim() || !input.aupProcedureSummary?.trim()) {
      return 'An AUP engagement needs its approved report type and actual procedure summary; an ISA audit opinion is not available.';
    }
    return null;
  }
  if (input.reportType !== 'ISA_AUDIT') return 'The engagement does not have a supported reporting standard.';
  if (!['UNMODIFIED', 'QUALIFIED', 'DISCLAIMER', 'ADVERSE'].includes(input.category ?? '')) return 'Choose one of the four supported audit opinion categories.';
  if (input.category !== 'UNMODIFIED'
    && (!input.affectedFsliCount || !input.basisText?.trim() || input.basisText.trim().length < 20)) {
    return 'A modified opinion requires at least one affected FSLI and substantive basis text.';
  }
  if (input.category === 'UNMODIFIED' && (input.affectedFsliCount || input.basisText?.trim())) {
    return 'An unmodified opinion cannot contain a modified-opinion basis or affected FSLI.';
  }
  return null;
}

const BASIS_HEADINGS: Record<string, string> = {
  QUALIFIED: 'Basis for Qualified Opinion',
  DISCLAIMER: 'Basis for Disclaimer of Opinion',
  ADVERSE: 'Basis for Adverse Opinion'
};

function formatMinor(value: string | number): string {
  const amount = BigInt(String(value));
  const absolute = amount < 0n ? -amount : amount;
  return `QAR ${amount < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** One canonical, structured projection feeds both the live Partner preview and the generated report PDF. */
export function buildOpinionReportSections(opinion: OpinionReportText, affectedFslis: OpinionAffectedFsli[] = []): ReportPdfSection[] {
  const additional = opinion.additionalSections ?? [];
  if (opinion.reportType === 'ISRS_4400_AUP') {
    return [
      { heading: String(opinion.aupReportType ?? '').trim(), paragraphs: [String(opinion.aupProcedureSummary ?? '')] },
      ...additional.map(section => ({ heading: section.heading, paragraphs: [section.body] }))
    ];
  }

  const category = opinion.category ?? 'UNMODIFIED';
  const opinionLabel = category === 'UNMODIFIED' ? 'Unmodified Opinion' : `${category.charAt(0)}${category.slice(1).toLowerCase()} Opinion`;
  const sections: ReportPdfSection[] = [{
    heading: `Independent Auditor’s Report · ${opinionLabel}`,
    paragraphs: [String(opinion.rationale ?? '')]
  }];

  const basisHeading = opinion.basisHeading || BASIS_HEADINGS[category];
  if (basisHeading) sections.push({ heading: basisHeading, paragraphs: [String(opinion.basisText ?? '')] });
  if (affectedFslis.length) sections.push({
    heading: 'Affected financial statement lines',
    rows: affectedFslis.map(item => ({
      label: `${item.code} · ${item.name}`,
      ...(item.amountMinor === null ? { current: 'Amount not quantified' } : { current: formatMinor(item.amountMinor) }),
      detail: item.explanation
    }))
  });
  if (opinion.materialityAssessment) sections.push({ heading: 'Materiality assessment', paragraphs: [opinion.materialityAssessment] });
  if (opinion.pervasivenessAssessment) sections.push({ heading: 'Pervasiveness assessment', paragraphs: [opinion.pervasivenessAssessment] });
  if (opinion.goingConcernReportingText) sections.push({ heading: 'Material Uncertainty Related to Going Concern', paragraphs: [opinion.goingConcernReportingText] });
  sections.push(...additional.map(section => ({ heading: section.heading, paragraphs: [section.body] })));
  return sections;
}

export function opinionReportingBlockers(reportType: string, goingConcernConclusion: string | null, goingConcernReportingText: string | null): string[] {
  if (reportType !== 'ISA_AUDIT') return [];
  if (goingConcernConclusion === 'INAPPROPRIATE_BASIS') {
    return ['The going-concern assessment concludes the accounting basis is inappropriate; resolve the basis before report preparation.'];
  }
  if (goingConcernConclusion === 'UNASSESSED') {
    return ['The current going-concern assessment is unassessed and needs Partner resolution before report preparation.'];
  }
  if (goingConcernConclusion === 'MATERIAL_UNCERTAINTY' && !goingConcernReportingText?.trim()) {
    return ['The assessed material going-concern uncertainty needs a Partner-completed reporting section.'];
  }
  return [];
}
