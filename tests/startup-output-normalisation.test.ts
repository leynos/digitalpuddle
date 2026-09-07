/**
 * @file Tests the boundary of the startup-output normaliser.
 *
 * The normaliser exists to remove two specific lines. Removing more would hide
 * a startup diagnostic the snapshot is there to catch, and removing fewer
 * would make the snapshot fail at random on the ordering of two streams. Both
 * mistakes look identical in a passing snapshot, so they are tested directly.
 */
import {describe, expect, it} from 'bun:test';

import {normaliseStartupOutput} from './support/startup-output';

const PORT = 4321;

describe('normaliseStartupOutput', () => {
  it('removes the type-stripping warning and its hint', () => {
    const output = [
      '(node:186) ExperimentalWarning: Transform Types is an experimental feature and might change at any time',
      '(Use `node --trace-warnings ...` to show where the warning was created)',
      'DigitalPuddle baseline server started at http://localhost:4321'
    ].join('\n');

    expect(normaliseStartupOutput(output, PORT)).toBe(
      'DigitalPuddle baseline server started at http://localhost:<PORT>'
    );
  });

  it('keeps an unrelated Node warning', () => {
    // A filter on every `(node:` line would drop this, and a real startup
    // diagnostic would vanish from the snapshot without anything failing.
    const output = '(node:186) Warning: unsafe fallback\nserver started on 4321';

    expect(normaliseStartupOutput(output, PORT)).toBe('(node:186) Warning: unsafe fallback\nserver started on <PORT>');
  });

  it('keeps a deprecation warning, which names a different experimental feature', () => {
    const output = '(node:186) ExperimentalWarning: Type Stripping is an experimental feature\nready on 4321';

    expect(normaliseStartupOutput(output, PORT)).toBe(
      '(node:186) ExperimentalWarning: Type Stripping is an experimental feature\nready on <PORT>'
    );
  });

  it('normalises CRLF line endings so snapshots do not differ by platform', () => {
    const output = 'first line\r\nsecond line on 4321\r\n';

    expect(normaliseStartupOutput(output, PORT)).toBe('first line\nsecond line on <PORT>\n');
  });

  it('replaces every occurrence of the port', () => {
    const output = 'bound 4321, advertised http://localhost:4321/simulation';

    expect(normaliseStartupOutput(output, PORT)).toBe('bound <PORT>, advertised http://localhost:<PORT>/simulation');
  });
});
