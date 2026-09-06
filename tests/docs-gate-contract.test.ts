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

type MakeRule = {prerequisites: string[]; recipe: string[][]};

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
      const recipeLine = line.slice(1).replace(/^[@+-]+/, '');
      for (const rule of active) {
        rule.recipe.push(...commandsIn(recipeLine));
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
      const rule: MakeRule = {prerequisites, recipe: []};
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
  jobs?: Record<string, WorkflowJob>;
};
const makefileRules = parseMakefile(readRepositoryFile('Makefile'));
const packageManifest = JSON.parse(readRepositoryFile('package.json')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const typedocOptions = JSON.parse(readRepositoryFile('typedoc.json')) as {
  emit?: string;
  treatValidationWarningsAsErrors?: boolean;
  validation?: Record<string, boolean>;
  requiredToBeDocumented?: string[];
};

describe('documentation gate wiring', () => {
  it('runs `make all` unconditionally in the CI verify job', () => {
    const verify = workflow.jobs?.['verify'];
    expect(verify).toBeDefined();
    expect(verify?.if).toBeUndefined();
    expect(verify?.['continue-on-error']).toBeUndefined();

    const gateSteps = (verify?.steps ?? []).filter((step) =>
      commandsIn(step.run ?? '').some((tokens) => makeGoals(tokens).includes('all'))
    );

    expect(gateSteps).toHaveLength(1);
    expect(gateSteps[0]?.if).toBeUndefined();
    expect(gateSteps[0]?.['continue-on-error']).toBeUndefined();
  });

  it('requires the documentation gate from `make all`', () => {
    expect(makefileRules.get('all')?.prerequisites).toContain('docs-check');
  });

  it('runs the documentation script from the `docs-check` target', () => {
    expect(makefileRules.get('docs-check')?.recipe).toContainEqual(['bun', 'run', 'docs:check']);
  });

  it('runs TypeDoc against the repository options from the `docs:check` script', () => {
    const script = packageManifest.scripts?.['docs:check'] ?? '';
    const invocations = commandsIn(script).filter((tokens) => path.basename(tokens[0] ?? '') === 'typedoc');

    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toContain('typedoc.json');
    expect(packageManifest.devDependencies?.['typedoc']).toBeDefined();
  });
});

describe('documentation gate options', () => {
  it('fails the build on an undocumented or unresolvable declaration', () => {
    expect(typedocOptions.validation?.['notDocumented']).toBe(true);
    expect(typedocOptions.validation?.['invalidLink']).toBe(true);
    expect(typedocOptions.treatValidationWarningsAsErrors).toBe(true);
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
