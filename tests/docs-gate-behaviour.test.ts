/**
 * @file Behavioural tests for the documentation gate.
 *
 * The contract tests in `docs-gate-contract.test.ts` assert the commands and
 * options that wire the gate together. These tests run the gate itself, with
 * the repository's own `typedoc.json`, over a fixture entry point in a
 * temporary directory: a documented fixture passes and writes nothing, and
 * each class of finding the gate claims to catch makes it exit non-zero.
 *
 * The fixture is what varies; the options are the repository's, so a setting
 * removed from `typedoc.json` shows up here as a fixture that stops failing.
 */

import {afterEach, describe, expect, it} from 'bun:test';
import {mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.join(import.meta.dir, '..');
const typedocBinary = path.join(repositoryRoot, 'node_modules', '.bin', 'typedoc');

/**
 * TypeDoc parses and resolves a whole entry point, which is slower than a unit
 * test and slower still on a loaded machine. The deadline is generous on
 * purpose: it exists to stop a hung process, not to measure anything.
 */
const GATE_TIMEOUT_MS = 180_000;

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map(async (root) => rm(root, {force: true, recursive: true})));
});

/** The repository's TypeDoc options, with the fields the fixture overrides named. */
type TypedocOptions = {
  $schema?: string;
  entryPoints?: string[];
  tsconfig?: string;
  name?: string;
  [option: string]: unknown;
};

const FIXTURE_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true
  },
  include: ['index.ts']
};

/**
 * Writes a fixture package whose entry point is `entry`, documented with the
 * repository's TypeDoc options. Only the entry point, the options and a
 * minimal `tsconfig.json` are written, so any file found afterwards is one the
 * gate emitted.
 */
const createFixture = async (entry: string): Promise<{root: string; optionsPath: string}> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digitalpuddle-docs-gate-'));
  fixtureRoots.push(root);

  const options = JSON.parse(readFileSync(path.join(repositoryRoot, 'typedoc.json'), 'utf8')) as TypedocOptions;
  delete options.$schema;
  options.entryPoints = [path.join(root, 'index.ts')];
  options.tsconfig = path.join(root, 'tsconfig.json');
  // Without a name TypeDoc warns that it found no package.json, and the gate
  // promotes warnings to failures.
  options.name = 'documentation-gate-fixture';

  const optionsPath = path.join(root, 'typedoc.json');
  await Promise.all([
    writeFile(path.join(root, 'index.ts'), entry, 'utf8'),
    writeFile(path.join(root, 'tsconfig.json'), JSON.stringify(FIXTURE_TSCONFIG), 'utf8'),
    writeFile(optionsPath, JSON.stringify(options), 'utf8')
  ]);

  return {root, optionsPath};
};

type GateResult = {exitCode: number; output: string};

/** Runs the gate over a fixture and returns its exit code and combined output. */
const runGate = async (entry: string): Promise<GateResult & {root: string}> => {
  const {root, optionsPath} = await createFixture(entry);
  const gate = Bun.spawn([typedocBinary, '--options', optionsPath], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(gate.stdout).text(),
    new Response(gate.stderr).text(),
    gate.exited
  ]);

  return {root, exitCode, output: `${stdout}${stderr}`};
};

const DOCUMENTED_ENTRY = `/**
 * Fixture entry point for the documentation gate's behavioural tests.
 *
 * @module
 */

/** An identifier the fixture's exported function accepts and returns. */
export type FixtureName = string;

/** Returns its argument unchanged. See {@link FixtureName}. */
export const echo = (name: FixtureName): FixtureName => name;
`;

describe('documentation gate behaviour', () => {
  it(
    'passes a documented entry point and emits nothing',
    async () => {
      const {root, exitCode, output} = await runGate(DOCUMENTED_ENTRY);

      expect(exitCode).toBe(0);
      expect(output.trim()).toBe('');
      expect([...(await readdir(root))].sort()).toEqual(['index.ts', 'tsconfig.json', 'typedoc.json']);
    },
    GATE_TIMEOUT_MS
  );

  it(
    'fails an undocumented exported declaration',
    async () => {
      const undocumented = DOCUMENTED_ENTRY.replace(
        "/** An identifier the fixture's exported function accepts and returns. */\n",
        ''
      );
      const {exitCode, output} = await runGate(undocumented);

      expect(exitCode).not.toBe(0);
      expect(output).toContain('FixtureName');
      expect(output).toContain('does not have any documentation');
    },
    GATE_TIMEOUT_MS
  );

  it(
    'fails a reference to a symbol that does not exist',
    async () => {
      const brokenLink = DOCUMENTED_ENTRY.replace('{@link FixtureName}', '{@link NoSuchSymbol}');
      const {exitCode, output} = await runGate(brokenLink);

      expect(exitCode).not.toBe(0);
      expect(output).toContain('Failed to resolve link');
      expect(output).toContain('NoSuchSymbol');
    },
    GATE_TIMEOUT_MS
  );

  it(
    'fails a warning that is not a validation finding',
    async () => {
      const unknownTag = DOCUMENTED_ENTRY.replace(
        ' * @module\n',
        ' * @file A tag TypeDoc does not know.\n * @module\n'
      );
      const {exitCode, output} = await runGate(unknownTag);

      expect(exitCode).not.toBe(0);
      expect(output).toContain('unknown block tag @file');
    },
    GATE_TIMEOUT_MS
  );
});
