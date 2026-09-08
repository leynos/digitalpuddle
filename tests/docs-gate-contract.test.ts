/**
 * @file Contract tests for the chain that runs the documentation gate.
 *
 * Continuous integration runs `make all`, `make all` requires `docs-check`,
 * `docs-check` runs `bun run docs:check`, and that script runs TypeDoc against
 * `typedoc.json` with `notDocumented` validation and warnings promoted to
 * errors. Each test asserts the command that carries one link of that chain
 * rather than a step name or a comment, so deleting any single link fails a
 * test even when the surrounding prose still describes the gate.
 */

import {describe, expect, it} from 'bun:test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parse as parseYaml} from 'yaml';

const repositoryRoot = path.join(import.meta.dir, '..');

const readRepositoryFile = (relativePath: string): string =>
  readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/**
 * Splits a shell script into the argument lists of the commands it runs.
 *
 * Commands are separated by newlines and by the `&&`, `||`, `;` and `|`
 * operators. Quoting is not interpreted: the gate commands under test are
 * plain `make` and `bun` invocations, and a token-level split keeps the
 * assertions exact rather than substring-based.
 */
const commandsIn = (script: string): string[][] =>
  script
    .split('\n')
    .flatMap((line) => line.split(/\s*(?:&&|\|\||;|\|)\s*/))
    .map((fragment) =>
      fragment
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0)
    )
    .filter((tokens) => tokens.length > 0 && !(tokens[0] ?? '').startsWith('#'));

/**
 * Shell keywords that make the commands around them conditional or repeated.
 *
 * A script containing any of these cannot be certified by finding the gate
 * command inside it: `if false; then` followed by the command on its own line
 * reads, line by line, exactly like an unconditional invocation while running
 * nothing.
 */
const SHELL_CONTROL_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'function'
]);

/**
 * A `&` that is not part of `&&` backgrounds the command before it, so the
 * step can succeed before the gate it launched has returned. `commandsIn`
 * does not split on it, which would otherwise leave `make all &` looking like
 * a plain invocation.
 */
const BACKGROUND_OPERATOR = /(?<!&)&(?!&)/;

/**
 * True when a script is exactly one command that runs in the foreground with
 * no control flow around it, so the command runs whenever the script runs and
 * its failure is the script's failure.
 */
const isSingleUnconditionalCommand = (script: string): boolean => {
  if (BACKGROUND_OPERATOR.test(script)) {
    return false;
  }
  const commands = commandsIn(script);
  if (commands.length !== 1) {
    return false;
  }
  return !(commands[0] ?? []).some((token) => SHELL_CONTROL_KEYWORDS.has(token));
};

/** Options that consume the following token, so it is never a goal. */
const MAKE_OPTIONS_WITH_ARGUMENT = new Set(['-C', '-f', '-I', '-j', '-l', '-o', '-W']);

/**
 * Returns the goals a `make` invocation builds, ignoring options and variable
 * overrides. A non-`make` command yields no goals.
 */
const makeGoals = (tokens: string[]): string[] => {
  const [command, ...rest] = tokens;
  if (command === undefined || path.basename(command) !== 'make') {
    return [];
  }
  const goals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    if (MAKE_OPTIONS_WITH_ARGUMENT.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-') || token.includes('=')) {
      continue;
    }
    goals.push(token);
  }
  return goals;
};

type MakeRule = {prerequisites: string[]; recipe: string[][]; ignoredErrorPrefixes: string[]};

/**
 * Parses a Makefile into its explicit rules, joining backslash continuations
 * and stripping the `@`, `-` and `+` recipe prefixes. Variable assignments and
 * conditionals are skipped; the gate is expressed entirely in explicit rules.
 */
const parseMakefile = (text: string): Map<string, MakeRule> => {
  const rules = new Map<string, MakeRule>();
  const lines = text.split('\n');
  let active: MakeRule[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? '';
    while (line.endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      line = `${line.slice(0, -1)} ${lines[index] ?? ''}`;
    }

    if (line.startsWith('\t')) {
      const prefix = (/^[@+-]+/.exec(line.slice(1)) ?? [''])[0];
      const recipeLine = line.slice(1).slice(prefix.length);
      for (const rule of active) {
        rule.recipe.push(...commandsIn(recipeLine));
        if (prefix.includes('-')) {
          rule.ignoredErrorPrefixes.push(recipeLine.trim());
        }
      }
      continue;
    }

    const ruleMatch = /^([^\t#=][^:=]*):(?!=)(.*)$/.exec(line);
    if (ruleMatch === null) {
      if (line.trim().length > 0) {
        active = [];
      }
      continue;
    }

    const targets = (ruleMatch[1] ?? '')
      .trim()
      .split(/\s+/)
      .filter((target) => target.length > 0);
    const prerequisites = (ruleMatch[2] ?? '')
      .replace(/#.*$/, '')
      .trim()
      .split(/\s+/)
      .filter((prerequisite) => prerequisite.length > 0);

    active = targets.map((target) => {
      const rule: MakeRule = {prerequisites, recipe: [], ignoredErrorPrefixes: []};
      rules.set(target, rule);
      return rule;
    });
  }

  return rules;
};

type WorkflowStep = {
  name?: string;
  run?: string;
  if?: unknown;
  'continue-on-error'?: unknown;
};

type WorkflowJob = {
  steps?: WorkflowStep[];
  if?: unknown;
  'continue-on-error'?: unknown;
};

const workflow = parseYaml(readRepositoryFile('.github/workflows/ci.yml')) as {
  on?: {push?: {branches?: string[]} | null};
  jobs?: {verify?: WorkflowJob};
};
const makefileRules = parseMakefile(readRepositoryFile('Makefile'));
const packageManifest = JSON.parse(readRepositoryFile('package.json')) as {
  scripts?: Record<string, string>;
  devDependencies?: {typedoc?: string};
};
const typedocOptions = JSON.parse(readRepositoryFile('typedoc.json')) as {
  entryPoints?: string[];
  entryPointStrategy?: string;
  emit?: string;
  treatWarningsAsErrors?: boolean;
  treatValidationWarningsAsErrors?: boolean;
  validation?: Record<string, boolean>;
  requiredToBeDocumented?: string[];
};

describe('gate command recognition', () => {
  const accepted: Record<string, string> = {
    'a bare invocation': 'make all',
    'an invocation with an option': 'make -s all',
    'an invocation with a variable override': 'make MDLINT=markdownlint-cli2 all'
  };

  const rejected: Record<string, string> = {
    'a backgrounded invocation': 'make all &',
    'a backgrounded invocation inside a chain': 'make all & wait',
    'an invocation whose failure is swallowed': 'make all || true',
    'an invocation guarded by a condition': 'if false; then\n  make all\nfi',
    'an invocation among others': 'make all\nmake build',
    'an invocation in a loop': 'for goal in all; do\n  make $goal\ndone'
  };

  for (const [description, script] of Object.entries(accepted)) {
    it(`accepts ${description}`, () => {
      expect(isSingleUnconditionalCommand(script)).toBe(true);
      expect(makeGoals(commandsIn(script)[0] ?? [])).toContain('all');
    });
  }

  for (const [description, script] of Object.entries(rejected)) {
    it(`rejects ${description}`, () => {
      expect(isSingleUnconditionalCommand(script)).toBe(false);
    });
  }
});

describe('documentation gate wiring', () => {
  it('runs `make all` unconditionally in the CI verify job', () => {
    const verify = workflow.jobs?.verify;
    expect(verify).toBeDefined();
    expect(verify?.if).toBeUndefined();
    expect(verify?.['continue-on-error']).toBeUndefined();

    // The step's whole script must be the invocation, not merely contain it.
    // A script of `if false; then` / `make all` / `fi` contains a line that
    // reads as the gate and runs nothing.
    const gateSteps = (verify?.steps ?? []).filter((step) => {
      const script = step.run ?? '';
      if (!isSingleUnconditionalCommand(script)) {
        return false;
      }
      const [command] = commandsIn(script);
      return makeGoals(command ?? []).includes('all');
    });

    expect(gateSteps).toHaveLength(1);
    expect(gateSteps[0]?.if).toBeUndefined();
    expect(gateSteps[0]?.['continue-on-error']).toBeUndefined();
  });

  it('runs on pull requests and on pushes to `main`', () => {
    // Presence, not truth: `pull_request:` parses to null, and a condition
    // written as `if: false` parses to a boolean whose string form is `False`.
    // Every check here is for a key that exists or a value that is absent.
    const triggers = Object.keys(workflow.on ?? {});

    expect(triggers).toContain('pull_request');
    expect(triggers).toContain('push');
    expect(workflow.on?.push?.branches).toContain('main');
  });

  it('requires the documentation gate from `make all`', () => {
    expect(makefileRules.get('all')?.prerequisites).toContain('docs-check');
  });

  it('generates the resolver types before the gate reads them', () => {
    expect(makefileRules.get('docs-check')?.prerequisites).toContain('typecheck');
  });

  it('runs the documentation script from the `docs-check` target', () => {
    // The whole recipe, not one of its lines: a recipe that wraps the command
    // in `if false; then` … `fi`, or appends `|| true`, still contains a line
    // that reads as the gate.
    expect(makefileRules.get('docs-check')?.recipe).toEqual([['bun', 'run', 'docs:check']]);
  });

  it('lets a gate failure reach make', () => {
    expect(makefileRules.get('docs-check')?.ignoredErrorPrefixes).toEqual([]);
  });

  it('runs TypeDoc against the repository options from the `docs:check` script', () => {
    const script = packageManifest.scripts?.['docs:check'] ?? '';
    const invocations = commandsIn(script).filter((tokens) => path.basename(tokens[0] ?? '') === 'typedoc');

    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toContain('typedoc.json');
    expect(packageManifest.devDependencies?.typedoc).toBeDefined();
  });
});

describe('documentation gate options', () => {
  it('reads the published entry point', () => {
    expect(typedocOptions.entryPoints).toEqual(['src/index.ts']);
    expect(typedocOptions.entryPointStrategy).toBe('resolve');
  });

  it('enables every validation the gate depends on', () => {
    expect(typedocOptions.validation).toEqual({
      notDocumented: true,
      notExported: false,
      invalidLink: true,
      invalidPath: true,
      rewrittenLink: true,
      unusedMergeModuleWith: true
    });
  });

  it('turns every warning into a failure', () => {
    expect(typedocOptions.treatValidationWarningsAsErrors).toBe(true);
    expect(typedocOptions.treatWarningsAsErrors).toBe(true);
  });

  it('writes no documentation artefacts', () => {
    expect(typedocOptions.emit).toBe('none');
  });

  it('requires documentation on every exported declaration kind', () => {
    expect(typedocOptions.requiredToBeDocumented).toEqual(
      expect.arrayContaining([
        'Accessor',
        'Class',
        'Enum',
        'EnumMember',
        'Function',
        'Interface',
        'Method',
        'Property',
        'TypeAlias',
        'Variable'
      ])
    );
  });
});
