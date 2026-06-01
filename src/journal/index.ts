/** @file Request journal contracts for future persistence-backed auditing. */

export type JournalEntry = {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly occurredAt: Date;
};

export interface RequestJournal {
  append(entry: JournalEntry): void | Promise<void>;
}

export const createNoopRequestJournal = (): RequestJournal => ({
  append: (_entry) => undefined
});
