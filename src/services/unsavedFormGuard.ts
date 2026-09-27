export interface UnsavedFormGuard {
  label: string;
  isDirty: () => boolean;
  save: () => boolean | Promise<boolean>;
  discard: () => void;
  /** True when discarding cannot close the draft (explicit-only dialogs); navigation must stay. */
  blocksDiscard?: () => boolean;
}
