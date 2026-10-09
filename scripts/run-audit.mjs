/**
 * @file Fails `bun audit` only for advisories that the audit exception ledger
 * does not cover.
 *
 * `security/audit-exceptions.json` lists the advisories this repository has
 * accepted for a stated period. The gate fails when `bun audit` reports an
 * advisory the ledger does not name, and when any ledger entry is undated,
 * misdated or past its expiry, whether or not its advisory is still reported,
 * so an exception cannot outlive its review.
 *
 * The decision (`evaluateAudit`) is a pure query; only `main` reads the
 * clock, spawns `bun` and writes to the console.
 */

import {spawnSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const GHSA_PATTERN = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_URL = new URL('../security/audit-exceptions.json', import.meta.url);

/** A `bun audit --json` report that does not have the expected shape. */
export class AuditReportError extends Error {}

/**
 * Read the GitHub advisory identifier from one advisory record.
 *
 * @param {Record<string, unknown>} advisory One entry of Bun's report.
 * @returns {string | null} The `GHSA-…` identifier, or null when none is present.
 *
 * @example
 * advisoryId({url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc'});
 * // => 'GHSA-aaaa-bbbb-cccc'
 */
function advisoryId(advisory) {
  if (typeof advisory.github_advisory_id === 'string') {
    return advisory.github_advisory_id;
  }
  const match = typeof advisory.url === 'string' ? advisory.url.match(GHSA_PATTERN) : null;
  return match ? match[0] : null;
}

/**
 * Flatten Bun's audit report into a list of advisories.
 *
 * Bun keys the report by package name, with an array of advisories per
 * package; a payload that nests that object under `advisories` is accepted
 * too. Anything else is rejected rather than read as clean, so a malformed
 * report cannot pass the gate.
 *
 * @param {unknown} report The parsed `bun audit --json` output.
 * @returns {Array<{package: string, id: string | null, title: string}>}
 * @throws {AuditReportError} When the report or a package entry is malformed.
 *
 * @example
 * parseAdvisories({braces: [{url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc'}]});
 * // => [{package: 'braces', id: 'GHSA-aaaa-bbbb-cccc', title: ''}]
 */
export function parseAdvisories(report) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new AuditReportError('bun audit did not report a JSON object');
  }
  const byPackage = report.advisories ?? report;
  if (byPackage === null || typeof byPackage !== 'object' || Array.isArray(byPackage)) {
    throw new AuditReportError('bun audit reported a malformed advisories value');
  }
  return Object.entries(byPackage).flatMap(([name, entries]) => {
    if (!Array.isArray(entries)) {
      throw new AuditReportError(`bun audit reported a non-array entry for ${name}`);
    }
    return entries.map((advisory) => ({
      package: name,
      id: advisoryId(advisory ?? {}),
      title: typeof advisory?.title === 'string' ? advisory.title : ''
    }));
  });
}

/**
 * Work out when a ledger entry stops covering its advisory.
 *
 * @param {string} expiresAt A `YYYY-MM-DD` calendar date, which covers that
 * whole day.
 * @returns {number | null} The first instant (ms) the entry no longer covers,
 * or null when the value is not a real calendar date.
 *
 * @example
 * expiryBoundary('2026-12-09') === Date.UTC(2026, 11, 10); // => true
 */
function expiryBoundary(expiresAt) {
  const match = DATE_ONLY.exec(expiresAt);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-30 over to March; a round trip rejects it.
  const isRealDate =
    instant.getUTCFullYear() === year && instant.getUTCMonth() === month - 1 && instant.getUTCDate() === day;
  return isRealDate ? instant.getTime() + DAY_MS : null;
}

/**
 * Check every ledger entry, independently of what `bun audit` reports.
 *
 * @param {Array<Record<string, unknown>>} entries The ledger.
 * @param {Date} now The reference time.
 * @returns {string[]} One message per problem; empty when the ledger is sound.
 * @throws {TypeError} When `now` is not a valid date, which would otherwise make
 * every expiry comparison false.
 *
 * @example
 * checkLedger([{id: 'X', advisory: 'GHSA-a', expiresAt: '2026-01-01'}], new Date('2026-06-01'));
 * // => ['Audit exception X for GHSA-a expired on 2026-01-01.']
 */
export function checkLedger(entries, now) {
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError('Invalid audit reference date');
  }
  const seen = new Set();
  return entries.flatMap((entry) => {
    const label = `Audit exception ${entry.id ?? entry.advisory}`;
    const problems = [];
    if (entry.id !== undefined && seen.has(entry.id)) {
      problems.push(`${label} is listed more than once.`);
    }
    seen.add(entry.id);
    const boundary = typeof entry.expiresAt === 'string' ? expiryBoundary(entry.expiresAt) : null;
    if (boundary === null) {
      problems.push(`${label} for ${entry.advisory} needs an expiresAt calendar date in YYYY-MM-DD form.`);
    } else if (boundary <= now.getTime()) {
      problems.push(`${label} for ${entry.advisory} expired on ${entry.expiresAt}.`);
    }
    return problems;
  });
}

/**
 * Decide whether the audit passes. A pure query: it reads no clock and writes
 * nothing.
 *
 * @param {object} input
 * @param {ReturnType<typeof parseAdvisories>} input.advisories What Bun reported.
 * @param {Array<Record<string, unknown>>} input.ledger The exception ledger.
 * @param {Date} input.now The reference time.
 * @param {number} input.status The exit status of `bun audit`.
 * @returns {{code: number, covered: object[], unexpected: object[], problems: string[]}}
 *
 * @example
 * evaluateAudit({advisories: [], ledger: [], now: new Date(), status: 0}).code; // => 0
 */
export function evaluateAudit({advisories, ledger, now, status}) {
  const allowed = new Set(ledger.map((entry) => entry.advisory));
  const covered = advisories.filter((advisory) => advisory.id !== null && allowed.has(advisory.id));
  const unexpected = advisories.filter((advisory) => !covered.includes(advisory));
  const problems = checkLedger(ledger, now);
  const failed = unexpected.length > 0 || problems.length > 0;
  // With nothing to excuse, Bun's own status stands (for example a failed run).
  const code = failed ? 1 : covered.length === 0 ? status : 0;
  return {code, covered, unexpected, problems};
}

/**
 * Render an outcome as the lines `main` prints.
 *
 * @param {ReturnType<typeof evaluateAudit>} outcome
 * @returns {{out: string[], err: string[]}} Lines for stdout and stderr.
 *
 * @example
 * formatOutcome({code: 0, covered: [], unexpected: [], problems: []}); // => {out: [], err: []}
 */
export function formatOutcome({covered, unexpected, problems}) {
  const err = [...problems];
  if (unexpected.length > 0) {
    err.push('Unexpected vulnerabilities detected by bun audit:');
    err.push(...unexpected.map((advisory) => `- ${advisory.id ?? 'unknown'} (${advisory.package}): ${advisory.title}`));
  }
  const noun = covered.length === 1 ? 'advisory' : 'advisories';
  const out =
    covered.length > 0 && err.length === 0
      ? [`All reported advisories are covered by the audit exception ledger (${covered.length} ${noun}).`]
      : [];
  return {out, err};
}

/**
 * Run `bun audit --json` and parse its report.
 *
 * @param {typeof spawnSync} [spawn] The process runner, replaceable in tests.
 * @returns {{report: unknown, status: number}}
 * @throws {Error} When Bun cannot start, ends on a signal, or prints invalid JSON.
 *
 * @example
 * const {report, status} = runBunAudit();
 */
export function runBunAudit(spawn = spawnSync) {
  const result = spawn('bun', ['audit', '--json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});
  if (result.error) {
    throw result.error;
  }
  if (result.status === null) {
    throw new Error(`bun audit did not exit normally${result.signal ? ` (signal: ${result.signal})` : ''}`);
  }
  const raw = (result.stdout ?? '').trim();
  try {
    return {report: raw === '' ? {} : JSON.parse(raw), status: result.status};
  } catch (error) {
    throw new AuditReportError(`Failed to parse bun audit JSON: ${error.message}`, {cause: error});
  }
}

/**
 * Run the audit, print the outcome and return the exit code.
 *
 * `AUDIT_REFERENCE_DATE` (an ISO date) replaces the clock so the expiry
 * behaviour can be tested deterministically.
 *
 * @param {object} [deps] Replaceable collaborators, for tests.
 * @returns {number} The process exit code.
 *
 * @example
 * process.exit(main());
 */
export function main({spawn = spawnSync, env = process.env, log = console} = {}) {
  try {
    const now = env.AUDIT_REFERENCE_DATE ? new Date(env.AUDIT_REFERENCE_DATE) : new Date();
    const ledger = JSON.parse(readFileSync(LEDGER_URL, 'utf8'));
    const {report, status} = runBunAudit(spawn);
    const outcome = evaluateAudit({advisories: parseAdvisories(report), ledger, now, status});
    const {out, err} = formatOutcome(outcome);
    for (const line of out) log.info(line);
    for (const line of err) log.error(line);
    return outcome.code;
  } catch (error) {
    log.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
