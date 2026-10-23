/** @file Unit tests for Relay-style pagination helpers and invariants. */

import {describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import type {PageArgs} from '../src/graphql/relay.ts';
import {applyRelayPagination} from '../src/graphql/relay.ts';

const nodeListArbitrary = fc.oneof(
  fc.array(fc.string(), {maxLength: 110}),
  fc.constantFrom(0, 99, 100, 101, 102).chain((length) => fc.array(fc.string(), {minLength: length, maxLength: length}))
);
const optionalFirstArbitrary = fc.option(fc.integer({min: 0, max: 110}), {nil: undefined});
const optionalLastArbitrary = fc.option(fc.integer({min: 0, max: 110}), {nil: undefined});
const optionalAfterArbitrary = fc.option(fc.integer({min: 0, max: 112}).map(String), {nil: undefined});
const optionalBeforeArbitrary = fc.option(fc.integer({min: 0, max: 112}).map(String), {nil: undefined});
const pageArgsArbitrary = fc.record({
  first: optionalFirstArbitrary,
  last: optionalLastArbitrary,
  after: optionalAfterArbitrary,
  before: optionalBeforeArbitrary
});

function expectedPageInfo<T>(nodes: T[], args: PageArgs) {
  const afterIndex = args.after === undefined ? -1 : Number(args.after);
  const beforeIndex = args.before === undefined ? nodes.length : Number(args.before);
  const rangeLength = nodes.filter((_, index) => index > afterIndex && index < beforeIndex).length;
  let hasNextPage: boolean;
  if (args.first === undefined) {
    const hasDefaultPageOverflow = args.last === undefined && rangeLength > 100;
    hasNextPage =
      args.before === undefined ? hasDefaultPageOverflow : hasDefaultPageOverflow || beforeIndex < nodes.length - 1;
  } else {
    hasNextPage = rangeLength > args.first;
  }

  const hasPreviousPage =
    args.last === undefined
      ? args.after !== undefined && afterIndex >= 0 && afterIndex < nodes.length
      : rangeLength > args.last;

  return {hasNextPage, hasPreviousPage};
}

describe('applyRelayPagination', () => {
  it('returns the first page with stable cursors', () => {
    const page = applyRelayPagination(['a', 'b', 'c', 'd'], {first: 2});

    expect(page.totalCount).toBe(4);
    expect(page.nodes).toEqual(['a', 'b']);
    expect(page.edges).toEqual([
      {node: 'a', cursor: '0'},
      {node: 'b', cursor: '1'}
    ]);
    expect(page.pageInfo.startCursor).toBe('0');
    expect(page.pageInfo.endCursor).toBe('1');
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(page.pageInfo.hasPreviousPage).toBe(false);
  });

  it('uses the default page size when reporting additional pages', () => {
    const page = applyRelayPagination(
      Array.from({length: 101}, (_, index) => index),
      {}
    );
    const finalPage = applyRelayPagination(
      Array.from({length: 100}, (_, index) => index),
      {}
    );

    expect(page.nodes).toHaveLength(100);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(finalPage.nodes).toHaveLength(100);
    expect(finalPage.pageInfo.hasNextPage).toBe(false);
  });

  it('supports after and last pagination windows', () => {
    const page = applyRelayPagination(['a', 'b', 'c', 'd', 'e'], {after: '1', last: 2});

    expect(page.nodes).toEqual(['d', 'e']);
    expect(page.edges.map((edge) => edge.cursor)).toEqual(['3', '4']);
    expect(page.pageInfo.startCursor).toBe('3');
    expect(page.pageInfo.endCursor).toBe('4');
    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.hasPreviousPage).toBe(true);
  });

  it('reports a previous page after the first edge', () => {
    const page = applyRelayPagination(['a', 'b'], {first: 1, after: '0'});

    expect(page.nodes).toEqual(['b']);
    expect(page.pageInfo.hasPreviousPage).toBe(true);
  });

  it('applies last to the already-trimmed first window', () => {
    const page = applyRelayPagination(['a', 'b', 'c', 'd'], {first: 3, last: 1});

    expect(page.nodes).toEqual(['c']);
    expect(page.edges).toEqual([{node: 'c', cursor: '2'}]);
  });

  it('reports hasNextPage against the untrimmed range when before is provided', () => {
    const page = applyRelayPagination(['a', 'b', 'c', 'd'], {before: '2'});

    expect(page.nodes).toEqual(['a', 'b']);
    expect(page.pageInfo.hasNextPage).toBe(true);
  });

  it('reports when the default page size truncates a before range', () => {
    const page = applyRelayPagination(
      Array.from({length: 102}, (_, index) => index),
      {before: '101'}
    );

    expect(page.nodes).toHaveLength(100);
    expect(page.pageInfo.hasNextPage).toBe(true);
  });

  it('returns an empty page when last is zero', () => {
    const page = applyRelayPagination(['a', 'b', 'c'], {last: 0});

    expect(page.nodes).toEqual([]);
    expect(page.edges).toEqual([]);
    expect(page.pageInfo.startCursor).toBeUndefined();
    expect(page.pageInfo.endCursor).toBeUndefined();
  });

  it('maps nodes before returning them', () => {
    const page = applyRelayPagination([{name: 'a'}, {name: 'b'}], {first: 2}, (node) => node.name.toUpperCase());

    expect(page.nodes).toEqual(['A', 'B']);
    expect(page.edges).toEqual([
      {node: 'A', cursor: '0'},
      {node: 'B', cursor: '1'}
    ]);
  });

  it('preserves pagination invariants across generated windows', async () => {
    await fc.assert(
      fc.asyncProperty(nodeListArbitrary, pageArgsArbitrary, async (nodes, args) => {
        const pageArgs: PageArgs = {};
        if (args.first !== undefined) {
          pageArgs.first = args.first;
        }
        if (args.last !== undefined) {
          pageArgs.last = args.last;
        }
        if (args.after !== undefined) {
          pageArgs.after = args.after;
        }
        if (args.before !== undefined) {
          pageArgs.before = args.before;
        }
        const page = applyRelayPagination(nodes, pageArgs);
        const referencePageInfo = expectedPageInfo(nodes, pageArgs);
        const cursors = page.edges.map((edge) => Number(edge.cursor));

        expect(page.totalCount).toBe(nodes.length);
        expect(page.edges.length).toBe(page.nodes.length);
        expect(page.edges.map((edge) => edge.node)).toEqual(page.nodes);
        expect(
          cursors.every((cursor, index) => {
            if (index === 0) {
              return true;
            }

            const previousCursor = cursors[index - 1];
            return previousCursor !== undefined && cursor === previousCursor + 1;
          })
        ).toBe(true);
        expect(page.pageInfo.startCursor).toBe(page.edges[0]?.cursor);
        expect(page.pageInfo.endCursor).toBe(page.edges.at(-1)?.cursor);
        expect(page.pageInfo.hasNextPage).toBe(referencePageInfo.hasNextPage);
        expect(page.pageInfo.hasPreviousPage).toBe(referencePageInfo.hasPreviousPage);
      })
    );
  });

  it('rejects negative first values', () => {
    expect(() => applyRelayPagination(['a'], {first: -1})).toThrow("value of 'first' must be greater than 0");
  });

  it('rejects negative last values', () => {
    expect(() => applyRelayPagination(['a'], {last: -1})).toThrow("value of 'last' must be greater than 0");
  });

  it('rejects malformed after cursors', () => {
    expect(() => applyRelayPagination(['a'], {after: 'not-an-int'})).toThrow(
      "value of 'after' must be a non-negative integer"
    );
    expect(() => applyRelayPagination(['a'], {after: '-1'})).toThrow("value of 'after' must be a non-negative integer");
  });

  it('rejects malformed before cursors', () => {
    expect(() => applyRelayPagination(['a'], {before: 'not-an-int'})).toThrow(
      "value of 'before' must be a non-negative integer"
    );
    expect(() => applyRelayPagination(['a'], {before: '-1'})).toThrow(
      "value of 'before' must be a non-negative integer"
    );
  });
});
