export interface IconElement { tag: 'path' | 'circle' | 'rect'; d?: string; cx?: string; cy?: string; r?: string; x?: string; y?: string; width?: string; height?: string; rx?: string }

/** One card in a slide's flow. `step` drives the "follow steps" reveal. */
export interface DeckCard {
  step: number;
  tag?: string;
  heading: string;
  body: string[];
  icon?: string;
  /** Dashed outline: a boundary or confirmation point rather than a settled capability. */
  dashed?: boolean;
  /** Full-width closing line of a flow (the outcome the steps lead to). */
  outcome?: boolean;
}

export interface DeckSlide {
  id: string;
  kind: 'cover' | 'flow' | 'coverage';
  title: string;
  subtitle: string;
  /** Uppercase label shown in the slide header. */
  tag: string;
  section: string;
  chapter: string;
  steps?: DeckCard[];
  /** Labelled groups of cards, used where a slide contrasts two tracks. */
  groups?: Array<{ label: string; steps: DeckCard[] }>;
  band?: [string, string];
  note: string;
  review: string;
  boundary?: string;
}
