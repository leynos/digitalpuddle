/**
 * @file Request journal contracts for future persistence-backed auditing.
 *
 * This module defines the request journal port and a no-op implementation used
 * during the layout transition. Future persistence backends can implement the
 * same append contract while current tests can exercise composition without
 * introducing storage side effects.
 */

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
