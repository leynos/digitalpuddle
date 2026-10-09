/**
 * @file Behavioural tests for the audit exception runner.
 *
 * `evaluateAudit` decides the exit code of `bun run audit` from the advisories
 * `bun audit` reported and the dated ledger in `security/audit-exceptions.json`.
 * These tests drive it with constructed advisories: a covered advisory passes
 * until its entry expires, and an advisory the ledger does not name fails.
 */

import {describe, expect, it, spyOn} from 'bun:test';

import {evaluateAudit} from '../scripts/run-audit.mjs';

const BRACES = 'GHSA-vfj7-8cjw-p6xm';
const OTHER = 'GHSA-aaaa-bbbb-cccc';

const advisory = (id) => ({github_advisory_id: id, name: 'example', severity: 'high'});

/** Run `evaluateAudit` with console output silenced and captured. */
function evaluate(payload, now) {
  const errors = spyOn(console, 'error').mockImplementation(() => {});
  const info = spyOn(console, 'info').mockImplementation(() => {});
  try {
    return {code: evaluateAudit(payload, {now}), errors: errors.mock.calls.flat()};
  } finally {
    errors.mockRestore();
    info.mockRestore();
  }
}

describe('audit exception runner', () => {
  it('passes the covered braces advisory before its entry expires', () => {
    const {code} = evaluate({advisories: [advisory(BRACES)], status: 1}, new Date('2026-10-09T00:00:00Z'));
    expect(code).toBe(0);
  });

  it('fails the covered braces advisory once its entry has expired', () => {
    const {code, errors} = evaluate({advisories: [advisory(BRACES)], status: 1}, new Date('2026-12-10T00:00:00Z'));
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('expired');
  });

  it('fails an advisory the ledger does not cover, even beside a covered one', () => {
    const {code} = evaluate(
      {advisories: [advisory(BRACES), advisory(OTHER)], status: 1},
      new Date('2026-10-09T00:00:00Z')
    );
    expect(code).toBe(1);
  });

  it('keeps bun audit status when it reports nothing', () => {
    expect(evaluate({advisories: [], status: 0}, new Date('2026-10-09T00:00:00Z')).code).toBe(0);
    expect(evaluate({advisories: [], status: 1}, new Date('2026-10-09T00:00:00Z')).code).toBe(1);
  });
});
