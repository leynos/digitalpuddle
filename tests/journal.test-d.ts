/** @file Compile-time tests for request journal contracts. */
import type {createNoopRequestJournal, JournalEntry, RequestJournal} from '../src/journal/index.ts';

declare const entry: JournalEntry;

entry satisfies {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly occurredAt: Date;
};

declare const journal: RequestJournal;

journal satisfies {
  append(entry: JournalEntry): void | Promise<void>;
};

declare const createJournal: typeof createNoopRequestJournal;

createJournal satisfies () => RequestJournal;
