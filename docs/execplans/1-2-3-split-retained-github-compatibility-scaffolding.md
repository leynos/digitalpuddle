# Split retained GitHub compatibility scaffolding from DigitalPuddle production surfaces (1.2.3)

This ExecPlan (execution plan) is a living document. The sections `Constraints`,
`Tolerances`, `Risks`, `Progress`, `Surprises & discoveries`, `Decision log`,
`Outcomes & retrospective`, `Conformance basis`, and `Verification plan` must
be kept up to date as work proceeds.

Status: DRAFT (expert design review applied; awaiting user approval)

Branch: `1-2-3-split-retained-github-compatibility-scaffolding`

Roadmap item: `1.2.3` in `docs/roadmap.md`.

## Purpose / big picture

DigitalPuddle is a local DigitalOcean API simulator. It was imported from
Simulacat Core, a GitHub API simulator built on the Simulacrum
`@simulacrum/foundation-simulator` backplane. The imported GitHub code is still
wired into the running server:

- REST handlers, served against the whole 11 MB GitHub REST description
  mounted at `/` (13 operations have real handlers; Foundation answers the
  other operations, roughly 1,100, with mock responses);
- a GraphQL endpoint;
- OAuth stubs;
- GitHub entity schemas;
- their tests.

Architecture decision record (ADR) 0005 keeps that code as a working adaptation
baseline. It is also the only code in the repository that exercises
Foundation's OpenAPI path and the patched Foundation dependency. ADR 0005 also
requires the GitHub scaffolding to be split from DigitalPuddle's production
surfaces before the first release.

Today a contributor cannot tell, from the file tree or from any gate, which
code is DigitalPuddle and which is borrowed GitHub scaffolding. GitHub modules
sit in the directories the technical design reserves for DigitalOcean work
(`src/store/`, `src/handlers/user.ts`, `src/domain/`). The private admin route
module `src/admin/routes.ts` imports the GitHub store type. The router
composition module `src/extend-api.ts` mounts `/graphql` and the OAuth stubs
next to DigitalPuddle's own routes. The package root `src/index.ts` exports
five GitHub entity schemas. Nothing stops new DigitalPuddle code from taking
fresh dependencies on GitHub code, and each one makes the eventual deletion
more expensive.

After this change:

1. Every retained GitHub source module, schema asset, code-generation
   configuration, and GitHub-specific test lives in one of two transitional
   fixture directories: `src/transitional/github/` and
   `tests/transitional/github/`. A *fixture*, in this plan, is retained code
   kept only so that the baseline keeps running. It is not product surface.
   Every TypeScript module in those directories carries the marker phrase
   `Transitional GitHub compatibility fixture` in its `@file` block.
2. Production code reaches the fixture through exactly one edge: the
   composition root `src/simulation.ts` imports the seam
   `src/transitional/github/index.ts`. The *composition root* is the one module
   that wires adapters together. The *seam* is the fixture's single entry
   module.
3. A new architecture fitness test,
   `tests/transitional/github/boundary.test.ts`, runs during `make test`. An
   *architecture fitness test* is an ordinary test that checks a structural
   rule of the code base rather than run-time behaviour. This one fails if:
   - production code imports fixture code;
   - fixture code imports the composition root;
   - confined packages or GitHub asset names appear outside the fixture;
   - GitHub asset files exist outside the fixture;
   - a fixture module lacks its marker.

   It is built on a reusable, fixture-agnostic module-boundary harness in
   `tests/support/module-boundaries/`.
4. GitHub artefacts that no gate uses are deleted:
   - the 1.1 MB `schema/schema.docs.graphql`;
   - the floating GitHub REST refresh script `sync.ts` and its
     `sync:schema:rest` package script;
   - the five `github*Schema` re-exports from the package root.
5. Run-time behaviour is unchanged. The server still starts and still serves
   `/simulation`, `/health`, `/_digitalpuddle/capabilities`, `/graphql`, the
   OAuth stubs, and the GitHub REST mock routes. Every moved test passes with
   its original assertions and snapshots.
6. Retiring the fixture becomes a scheduled, rehearsed task, not an
   aspiration. A deletion manifest lists every touchpoint outside the two
   fixture directories. The manifest is rehearsed on a scratch copy, recorded
   in the ADR 0005 amendment, and owned by a proposed new roadmap task, 2.1.3.

Observable success:

- A contributor runs `bun test tests/transitional/github/boundary.test.ts` and
  sees it pass.
- Adding `import type {ExtendedSimulationStore} from '../transitional/github';`
  to `src/admin/routes.ts` makes it fail with
  `production-imports-fixture: src/admin/routes.ts -> src/transitional/github/index.ts`.
  The specifier is a directory, deliberately.
- The deletion manifest names every file that must change when the fixture
  goes. The rehearsal shows that nothing outside the manifest breaks.

## Constraints

- Implementation begins only after the user explicitly approves this plan.
- Keep Simulacrum (`@simulacrum/foundation-simulator`) as the HTTP backplane
  (ADR 0001). Do not change the patched dependency or its patch file.
- Preserve run-time behaviour. The routes, status codes, response bodies, log
  event names, and startup banners must not change. Moved tests keep their
  assertions, and moved snapshot files stay byte-identical. The only intended
  observable changes are the removals authorized below.
- `simulation()` keeps its name, parameter shape, default port 3300, and
  defaulting behaviour. `GitHubSimulatorArgs` and `InitialState` keep their
  names and structure and stay exported from `src/index.ts`.
- Authorized public-surface changes. The package is pre-1.0 (version `0.1.0`),
  has no release tags, and has no known external consumers, so these are made
  without aliases or deprecation shims:
  - remove the five `github*Schema` exports from `src/index.ts`;
  - delete the `schema/schema.docs.graphql` asset and narrow the `SchemaFile`
    type (reachable through `GitHubSimulatorArgs.apiSchema`) by its
    `'schema.docs.graphql'` member;
  - remove the `sync:schema:rest` package script and `sync.ts`;
  - remove `schema` from the `package.json` `files` list (its retained
    contents move under `src/`, which is already published);
  - move the definitions of `GitHubSimulatorArgs` and `InitialState` into the
    fixture, re-exported unchanged.
- Authorized internal changes, each made with every caller in the same commit:
  - `extendRouter` in `src/extend-api.ts` becomes generic in its store type
    and stops registering GitHub routes;
  - the dead `registerCapabilitiesRoute` re-export in `src/extend-api.ts` is
    removed;
  - `DigitalPuddleAdminRouter` and `extendDigitalPuddleAdminRoutes` in
    `src/admin/routes.ts` drop the unused store parameter;
  - the REST error-logging helpers move from `src/rest/index.ts` to
    `src/handlers/error-logging.ts`;
  - the GitHub `openapi` and `extendStore` functions are renamed
    `createGitHubOpenApiConfig` and `extendGitHubStore`;
  - `createGitHubOpenApiConfig` accepts `apiSchema: string | undefined` and
    applies the `api.github.com.json` default internally;
  - the `graphql-codegen` invocation in `package.json` gains
    `--config src/transitional/github/codegen.ts`.
- No new runtime or development dependencies. Reuse `typescript` (development,
  `^6.0.3`) and `fast-check` (development, `^4.10.2`).
- Do not alter the DigitalOcean artefacts or their provenance:
  `src/openapi/digitalocean.openapi.json`,
  `src/openapi/digitalocean.openapi.provenance.json`, and the
  `github.com/digitalocean/openapi` provenance URLs in snapshots.
- Do not edit `.grepai/` files, `CHANGELOG.md` (inherited upstream Simulacrum
  history), or completed ExecPlans under `docs/execplans/`.
- `AGENTS.md` rules apply:
  - no code file over 400 lines, except the existing over-length tests
    `tests/graphql.test.ts` (671 lines) and `tests/entities.test.ts` (503),
    which move unchanged and are recorded as inherited exceptions;
  - every module starts with a `@file` block;
  - en-GB-oxendict spelling;
  - Markdown wrapped at 80 columns;
  - Biome and Oxlint clean;
  - `make check-fmt`, `make typecheck`, `make lint`, and `make test` pass
    after every milestone.
- Tests use `bun:test`. Property tests use `fast-check` with
  `propertyTestSeed` from `tests/support/property-test-seed.ts`. New servers
  listen on port `0`, not a fixed port.
- Hexagonal dependency rule for the harness: the pure policy module must not
  import `node:` modules, `typescript`, or Bun APIs. Only the scanner adapter
  touches the filesystem, Git, and the TypeScript compiler.

If satisfying the objective requires violating a constraint, stop, record the
conflict in `Decision log`, set the status to `BLOCKED`, and escalate.

## Tolerances (exception triggers)

Comparison base: `889431f` (the `main` head this branch was cut from). ExecPlan
files are excluded from every count, including this file. Vendored schema
assets are excluded from line counts and governed by the asset rule below.

Categories, assigned by path, one category per file:

- Code:
  - `src/**/*.ts`, except `src/transitional/github/codegen.ts`;
  - `tests/**`, `scripts/**`, `bin/**`, and `example/**`;
  - root `*.ts` files, except `codegen.ts` and `tsdown.config.ts`;
  - `Makefile` (executable build logic).
- Configuration:
  - `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`,
    `.oxlintrc.json`, `typedoc.json`, and `tsdown.config.ts`;
  - `codegen.ts` and `src/transitional/github/codegen.ts`;
  - `.github/**`.
- Documentation: `**/*.md` except `docs/execplans/**`.
- Vendored schema assets (excluded from line counts): `schema/*.json`,
  `schema/*.graphql`, `src/transitional/github/schema/*.json`, and
  `src/transitional/github/schema/*.graphql`. The only permitted asset changes
  are:
  - a byte-identical rename of `api.github.com.json` and
    `schema.docs-enterprise.graphql` (checked with `sha256sum`);
  - the deletion of `schema.docs.graphql`.

Counting commands, run from the repository root. Renames are detected with
`-M`, so a pure move counts as zero lines:

```bash
git diff -M --name-only 889431f...HEAD -- . ':(exclude)docs/execplans/**' | wc -l
git diff -M --numstat 889431f...HEAD -- . ':(exclude)docs/execplans/**' \
  ':(exclude)schema/*.json' ':(exclude)schema/*.graphql' \
  ':(exclude)src/transitional/github/schema/*.json' \
  ':(exclude)src/transitional/github/schema/*.graphql'
```

Classify each `--numstat` row by the category rules and sum per category. Code
and documentation are measured in net lines (additions minus deletions).
Configuration is measured in churn (additions plus deletions), because most of
its edits are path rewrites with zero net change.

- Files: stop and escalate if more than 100 non-ExecPlan paths change. The
  estimate is 88:
  - 25 moved `src/` modules;
  - 4 new `src/` modules (`package-root.ts`, `handlers/error-logging.ts`,
    the fixture `routes.ts` and `index.ts`);
  - 5 edited `src/` modules;
  - 4 schema paths plus the moved `codegen.ts`;
  - 16 moved test files plus 1 moved snapshot;
  - 4 edited production tests;
  - 9 new test and support modules;
  - 2 deleted root files;
  - 7 configuration files;
  - 10 documentation files.
- Code: stop and escalate above 1,100 net lines. The estimate is 850:
  - harness policy, about 140;
  - scanner adapter, about 170;
  - policy table and property tests, about 160;
  - scanner fixture and property tests, about 170;
  - fixture boundary test, about 110;
  - `package-root.ts` and its test, about 70;
  - package-surface and bundle-asset tests and shared build helper, about
    130;
  - marker and import-path edits, about 40 net;
  - deleted `sync.ts` and `schema.docs.graphql` cases, about -90.
- Configuration: stop and escalate above 150 lines of churn. The estimate is
  80.
- Documentation: stop and escalate above 450 net lines. The estimate is 320.
  This covers:
  - the developers' and users' guides;
  - technical design §16;
  - the ADR 0005 and ADR 0008 amendments;
  - the migration guide;
  - the dependency-policy exception note;
  - the fixture `README.md` with its deletion manifest;
  - the roadmap.
- Interface: stop and escalate if any public or internal signature change
  beyond those authorized in `Constraints` is needed.
- Dependencies: stop and escalate if any dependency must be added, removed, or
  re-ranged.
- Behaviour: stop and escalate if a moved test needs an assertion change, if a
  moved snapshot's content changes, or if a production test needs an assertion
  change other than an import path or type annotation.
- Architecture: stop and escalate if a production module other than
  `src/simulation.ts` needs a run-time value from the fixture, or needs a
  fixture type that it cannot reach through the composition root's re-exports.
  Type exposure through `src/simulation.ts` and `src/index.ts` is expected; see
  `Transitional public contract`.
- Iterations: stop and escalate if a gate still fails after three fix
  attempts within one milestone.
- Time: stop and escalate if a milestone takes more than one working day of
  agent time.
- Ambiguity: stop and present options if a module cannot be classified from
  the evidence in `Context and orientation`.

Each category is enforced independently. Spare capacity in one category does
not offset an overrun in another.

Historical evidence informing these budgets:

- The predecessor plan
  `docs/execplans/1-2-2-introduce-target-source-layout-incrementally.md` used
  one combined budget (35 files or 1,200 net lines) and never recorded measured
  counts.
- `docs/execplans/1-3-1-pinned-digital-ocean-open-api-artefact.md` recorded a
  scope overrun "accepted" with no numbers.
- Neither plan recorded a budget increase, so there is no repeated-increase
  pattern.

The lessons applied here:

- Use separate category budgets, an explicit counting command, and a measured
  count at each milestone boundary in `Progress`.
- Size the file budget from a per-path recount, which the design review
  supplied, rather than an estimate. This task is mostly moves, and renames
  cost little in lines but a lot in paths.

## Risks

- Risk: schema assets resolve from different directories in source and in the
  bundle.
  - `getSchema` computes the package root as
    `path.join(import.meta.dirname, '..')`. That works today because both
    `src/utils.ts` and `dist/index.*` sit one level under the root.
  - A future second bundle entry, such as one under `dist/cli/`, would break
    the assumption silently.
  - Severity: high. Likelihood: medium.
  - Mitigation (`D4`):
    - `src/package-root.ts` computes the root from its own depth-one
      location;
    - it verifies that the root contains a `package.json` whose `name` is
      `digitalpuddle`, and throws a descriptive error otherwise;
    - the CommonJS and ESM bundles are both exercised against the moved
      assets in `EP-M5`.
- Risk: Bun writes a missing snapshot without failing unless `CI` is set,
  which would hide a behaviour change.
  - Severity: high. Likelihood: medium.
  - The design review's probe on Bun 1.4.4 confirmed this behaviour, and that
    `CI=true` refuses to create snapshots.
  - Mitigation:
    - run every milestone's `make test` as `CI=true make test`;
    - check that the summary still reports `13 snapshots` and no `added`;
    - move each `.snap` with `git mv` in the same commit as its test;
    - confirm with `git status --porcelain` and
      `git diff -M100% --summary`.
- Risk: the import scanner misses an edge, so the fitness test passes
  vacuously.
  - The planning-time probe showed that `ts.preProcessFile` misses
    `export * as ns from` and `export type * as ns from`.
  - It also misses imports that follow a regular-expression literal
    containing a backtick.
  - Lexical path normalization resolves directory and extensionless
    specifiers (`'../transitional/github'`) incorrectly, yet the repository's
    `moduleResolution: "bundler"` accepts them.
  - Severity: high. Likelihood: high if ignored.
  - Mitigation (`D2`):
    - use an AST walk over `ts.createSourceFile`;
    - resolve specifiers with `ts.resolveModuleName` and the repository's
      own compiler options;
    - make unresolved relative specifiers a reported violation;
    - add scanner fixtures for every form;
    - add a scanner resolution property test;
    - add a permanent directory-specifier negative control.
- Risk: the generated GraphQL resolver types go stale or point at moved
  modules.
  - Codegen writes `src/__generated__/resolvers-types.ts` with a mapper import
    of `'../graphql/to-graphql-shapes'`. That import breaks as soon as
    `src/graphql/` moves.
  - The old gitignored file stays on disk in existing checkouts and is still
    inside the `tsconfig.json` include.
  - Severity: medium. Likelihood: high.
  - Mitigation:
    - move the codegen configuration and output in the same milestone as the
      GraphQL modules (`EP-M4`);
    - delete `src/__generated__/` explicitly;
    - make `make clean` remove both the old and the new paths;
    - ignore `**/__generated__/**` in Oxlint.
- Risk: deleting the fixture later breaks more than the import graph shows.
  The boundary test cannot see the following:
  - the public types of `simulation()`;
  - the GitHub seed in `example/start.ts`;
  - the GitHub seed in `tests/base.test.ts` and
    `tests/simulation-layout.test.ts`;
  - the codegen step in `check:types`, `generate`, and `prepack`;
  - the Biome overrides.

  Severity: medium. Likelihood: certain. Mitigation:
  - a deletion manifest in `src/transitional/github/README.md`, rehearsed on
    a scratch copy in `EP-M6`, recorded in the ADR 0005 amendment, and owned
    by the proposed roadmap task 2.1.3;
  - a `Transitional public contract` subsection in this plan.
- Risk: the change is large and hard to review.
  - Severity: medium. Likelihood: high.
  - Mitigation:
    - separate the refactor-in-place milestone (`EP-M3`) from the
      pure-move milestone (`EP-M4`), so the moves appear as exact or
      near-exact renames;
    - describe the move table in the pull request.
- Risk: Bun versions differ.
  - The host runs Bun 1.4.4, while CI and `packageManager` pin Bun 1.3.11.
  - Severity: low. Likelihood: low.
  - Mitigation: the plan no longer relies on `test.failing` (`D10`). Snapshot
    behaviour under `CI=true` is re-checked in CI on the pull request.
- Risk: fixed test ports collide with other worktrees on this host.
  - Severity: low. Likelihood: medium.
  - Mitigation: the new OAuth and bundle tests listen on port `0`.

## Progress

- [x] (2026-11-15) Branch renamed to
  `1-2-3-split-retained-github-compatibility-scaffolding`; Lody session titled.
- [x] (2026-11-15) Reconnaissance of `src/`, `tests/`, configuration, docs,
  and predecessor ExecPlans completed (three read-only survey agents).
- [x] (2026-11-15) Baseline gates recorded on the unmodified tree. All four
  pass, and `make test` reports 272 pass, 0 fail, 13 snapshots, 25 files.
- [x] (2026-11-15) Draft plan committed (`2aa50b8`).
- [x] (2026-11-15) Expert design review (structure and contracts, failure
  modes and verification, alternatives and viability) applied. Verdict: proceed
  with conditions. Every condition is folded into this revision (see
  `Decision log` D11-D16).
- [x] (2026-11-15) Branch pushed and draft pull request opened:
  <https://github.com/leynos/digitalpuddle/pull/119>.
- [ ] Plan approved by the user.
- [ ] `EP-M1` module-boundary harness and fixture boundary test with the exact
  baseline violation list.
- [ ] `EP-M2` unused GitHub artefacts deleted.
- [ ] `EP-M3` refactor in place: single composition root, generic router,
  package-root helper, production error-logging helpers, and fixture-owned
  argument types.
- [ ] `EP-M4` GitHub source, tests, assets, and codegen moved into the fixture
  directories; the boundary test reports no violations.
- [ ] `EP-M5` package root narrowed; bundle paths verified for CommonJS and
  ESM.
- [ ] `EP-M6` documentation, ADR amendments, deletion rehearsal, and roadmap
  updates.

## Surprises & discoveries

- Observation: `src/utils.ts` resolves bundled schemas through
  `import.meta.dirname` plus one parent directory. Evidence: `src/utils.ts:40`.
  Impact: the loader cannot move deeper without a depth-independent root helper
  (`D4`).
- Observation: `src/admin/routes.ts` imports the GitHub store type only to
  type a parameter that `extendDigitalPuddleAdminRoutes` ignores
  (`_simulationStore`). Evidence: `src/admin/routes.ts:11,18,42`. Impact: the
  parameter is dropped rather than made generic (`D5`).
- Observation: `src/handlers/user.ts` (GitHub) imports the run-time value
  `jsonValueSchema` from `src/openapi/artifact.ts` (DigitalPuddle). Evidence:
  `src/handlers/user.ts:12`. Impact: this is the allowed direction (fixture
  depends on production), so the edge is kept.
- Observation: `schema/schema.docs.graphql` has no run-time consumer.
  Evidence: `tests/utils.test.ts:59` and type tests name it; `src/` mentions it
  only in the `getSchema` default table at `src/utils.ts:6,37`. Impact: it is
  deleted (`D6`).
- Observation: `sync.ts` is unused by any gate. It imports `effection`, which
  is not declared in `package.json`, and it refreshes a GitHub fixture from a
  floating `main` branch. Evidence: `sync.ts:8,28`; `package.json:72`. Impact:
  it is deleted (`D6`). It must go before any asset-name rule can pass, because
  it mentions `api.github.com.json`.
- Observation: no test enforces module boundaries today. The nearest checks
  are `tests/runtime-layout.test.ts:18` and type-level assertions. Evidence:
  survey of `tests/`. Impact: the harness is new (`D2`, `D3`).
- Observation: `ts.preProcessFile` (TypeScript 6.0.3) misses some import
  forms:
  - it returns no specifier for `export * as ns from './x.ts'` or
    `export type * as n from './y.ts'`;
  - it misses an `import` that follows `const r = /\`/;`.

  Evidence: probes recorded in `Artefacts and notes`. Impact: the scanner uses
  an AST walk instead (`D2`, revised).
- Observation: Foundation's `openapi` option is optional, so a server can
  start without any OpenAPI document. Evidence:
  `node_modules/@simulacrum/foundation-simulator/dist/index.d.mts:47`. Impact:
  `D1`'s rationale rests on ADR 0005 and on keeping Foundation's OpenAPI path
  exercised, not on the server being unable to start.
- Observation: `docs/complexity-antipatterns-and-refactoring-strategies.md`,
  named in the task brief, does not exist in this repository. Evidence:
  `ls docs/`. Impact: none. The relevant guidance comes from `AGENTS.md`
  "Refactoring Heuristics" and the Simulacrum guide §§8 and 30.
- Observation: `src/__generated__/resolvers-types.ts` is absent until
  `bun run generate` runs, so a bare `bun test` fails on module resolution.
  Evidence: `.gitignore:13`; `src/graphql/connections.ts:20`. Impact: always run
  `make typecheck` before `make test` in a fresh worktree.
- Observation: `make spelling` rewrites `typos.toml` from the shared policy
  base on every run, and it checks only Markdown files that Git tracks.
  Evidence: running it modified `typos.toml`. An untracked draft passed the
  gate but failed after commit on backticked identifiers spelt in US English.
  Impact:
  - commit the refreshed `typos.toml` (`f1da2c9`);
  - commit documentation before trusting the spelling gate;
  - use Oxford spellings (`normalizer`, `analyse`) even inside code spans.

## Decision log

- D1. Decision: quarantine the GitHub scaffolding now, and retire it in a
  scheduled follow-on task, rather than delete it in this task. Rationale:
  - The roadmap success criterion permits "marked as transitional fixtures".
  - ADR 0005 keeps the code as the working adaptation baseline.
  - The fixture is the only in-repository exercise of Foundation's OpenAPI
    path: response validation, `notImplemented` mocks, `quick` mode, and the
    patched dependency. Deleting it now would leave that path untested until
    roadmap 2.1.1 serves `/v2`.

  Rejected alternative: delete everything now and keep a minimal Foundation
  server serving `/simulation`, `/health`, and `/_digitalpuddle/capabilities`.
  The design review rated this the strongest alternative.
  - It gains: about 5,000 fewer lines, 12 MB fewer assets, no codegen step,
    and six fewer dependencies.
  - It gives up: the baseline and the Foundation OpenAPI coverage, and it
    needs an ADR 0005 amendment.

  The user may choose it instead at approval; see
  `Open questions for the approver`. Date/Author: 2026-11-15, planning agent;
  revised after design review.
- D2. Decision (revised after design review): enforce the boundary with a
  `bun:test` architecture fitness test. The scanner walks the TypeScript syntax
  tree (`ts.createSourceFile`) and resolves every specifier with
  `ts.resolveModuleName`, using the compiler options parsed from
  `tsconfig.json`. No lint rule is added. Rationale:
  - The rule needs an allowlist (the composition root and the seam) and
    repository-wide facts: packages, asset names, and asset files.
  - Biome's `noRestrictedImports` and Oxlint's `no-restricted-imports` match
    specifier strings with gitignore-style patterns. They cannot express "only
    `src/simulation.ts`, only via the seam", and they match relative
    specifiers fragilely.
  - `ts.preProcessFile` was the first choice but misses forms (see
    `Surprises & discoveries`).
  - The AST walk covers `ImportDeclaration`, `ExportDeclaration` (including
    `export * as`), `ImportEqualsDeclaration`, `ImportTypeNode`, `import()`
    and `require()` calls with a literal argument, and string-named
    `ModuleDeclaration`s.
  - `ts.resolveModuleName` applies the same resolution as `tsc`, so directory,
    extensionless, and `.js`-to-`.ts` specifiers resolve exactly as the
    compiler sees them.
  - Both APIs come from the installed `typescript` package.
  - One owner per concern: the test owns the boundary.

  Rejected alternatives: `dependency-cruiser` (a new dependency, and already
  rejected in 1.2.2); regular expressions; `preProcessFile`; and an Oxlint
  rule. Date/Author: 2026-11-15, planning agent.
- D3. Decision (revised after design review): split the harness from the
  fixture policy.
  - A generic harness lives under `tests/support/module-boundaries/`: a pure
    `policy.ts` and an adapter `scan.ts`.
  - The GitHub fixture's policy constants and its repository boundary test
    live inside the fixture, at
    `tests/transitional/github/boundary-policy.ts` and
    `tests/transitional/github/boundary.test.ts`.

  Rationale:
  - The hexagonal split keeps the rule testable with generated inputs and no
    filesystem access.
  - Placing the GitHub-specific policy inside the fixture means it is deleted
    with the fixture, and it may name the forbidden assets without an
    exemption set.
  - Generic names (`confinedPackages`, `confinedAssetNames`, and the
    `fixture`-based violation kinds) let roadmap 1.4.3 reuse the harness for
    "no public handler calls an engine adapter directly" without a rewrite.
    Nothing beyond the naming is built for that future.

  Date/Author: 2026-11-15, planning agent.
- D4. Decision: add `src/package-root.ts`, a depth-one helper that returns the
  package root directory and verifies it. The fixture's schema loader resolves
  assets through it. Rationale:
  - `import.meta.dirname` is `src/` for the helper in source and `dist/` in
    the bundle, and both sit one level under the root.
  - The `package.json` name check turns a future layout change into an
    immediate, descriptive error instead of a later `ENOENT`.

  Rejected alternatives: probing upwards for `package.json` at every call;
  importing the 11 MB JSON into the bundle; and a fixture-local depth constant,
  which is wrong in one of the two layouts. Date/Author: 2026-11-15, planning
  agent.
- D5. Decision (revised after design review): `src/simulation.ts` composes the
  GitHub routes itself:

  ```ts
  (router, store) => {
    extendRouter(args.extend?.extendRouter)(router, store);
    registerGitHubCompatibilityRoutes(router, store);
  }
  ```

  The supporting changes are:
  - `extendRouter` becomes `<Store>(extend) => (router, store) => void` with
    no GitHub knowledge;
  - `extendDigitalPuddleAdminRoutes(router)` drops its unused store
    parameter;
  - the fixture's `routes.ts` imports `FoundationRouter` from
    `src/admin/routes.ts`, its one exported definition.

  Rationale:
  - The resulting route order is identical: request logger, caller extension,
    `/health`, admin routes, `/graphql`, then the OAuth stubs.
  - It avoids a second positional callback of the same type, which could be
    swapped silently.
  - It leaves one deletion site.

  Date/Author: 2026-11-15, planning agent.
- D6. Decision: delete the GitHub artefacts that no gate uses, first, before
  any move:
  - `schema/schema.docs.graphql`, with its `getSchema` overload and its test
    cases;
  - `sync.ts`;
  - the `sync:schema:rest` script.

  Then move `api.github.com.json`, `schema.docs-enterprise.graphql`, and the
  schema `README.md` into the fixture byte-identically. The README is rewritten
  as the fixture `README.md`, carrying the deletion manifest. Rationale:
  - This implements "removed when no longer used by gates".
  - Deleting first shrinks the move set and removes the `api.github.com.json`
    mention in `sync.ts`, which would otherwise keep the asset-name rule red
    after the moves.

  Rejected alternative: trimming `api.github.com.json` to the 13 handled
  operations. That would need a `$ref`-closure tool for a file that is going to
  be deleted. Date/Author: 2026-11-15, planning agent.
- D7. Decision: remove the five `github*Schema` re-exports from `src/index.ts`.
  Keep `simulation`, `GitHubSimulatorArgs`, and `InitialState` with their
  current names. Rationale:
  - The package root is a production surface.
  - No consumer uses the schema re-exports through the root.
  - The package is pre-1.0 and unreleased.
  - The argument types stay because `simulation()`'s signature references
    them. Renaming them now would be churn without a DigitalOcean replacement
    to rename towards; their JSDoc will state that the seed is the
    transitional GitHub fixture.

  Date/Author: 2026-11-15, planning agent.
- D8. Decision (revised after design review): helpers move or stay according
  to whether they are GitHub-specific or a DigitalPuddle contract.
  - Moving with the fixture: `src/graphql/relay.ts`, because DigitalOcean list
    routes use `links.pages` and `meta.total`, not Relay connections; and
    `src/utils.ts` (`getSchema`), because it is a GitHub-asset loader.
  - Staying in production as `src/handlers/error-logging.ts`, beside
    `src/handlers/types.ts`: the GitHub-agnostic REST error-logging helpers
    (`errorDetails`, `logRestHandlerError`, `withErrorLogging`,
    `withErrorLoggingForHandlers`, `RestErrorValue`). They wrap Foundation
    handler maps and emit the DigitalPuddle event
    `digitalpuddle.rest.handler.error`, which roadmap 2.1.1 handlers need.

  Consequence: `tests/logging.test.ts` is not split; only its import path
  changes. Roadmap 2.1.1 must build a production OpenAPI-to-Foundation adapter,
  because the inherited `src/rest` adapter becomes fixture code. The
  developers' guide and technical design §16 record this. Date/Author:
  2026-11-15, planning agent.
- D9. Decision: no formal proof (LemmaScript).
  Rationale: see `Formal verification decision`. The design review concurred
  and redirected the verification effort to the scanner and path resolution.
  Date/Author: 2026-11-15, planning agent.
- D10. Decision (revised after design review): drive the red stage with an
  exact baseline violation list, not `test.failing`.
  - `EP-M1` asserts `toEqual(expectedViolationsAtBaseline)`, a hand-written,
    sorted list of formatted violation lines for `889431f`.
  - Each later milestone shrinks the list in the same commit as the change
    that removes the violations. It reaches `[]` at the end of `EP-M4`.

  Rationale:
  - `test.failing` passes on any thrown error, including a scanner crash, so
    it proves nothing about why the test is red.
  - Its behaviour on CI's Bun 1.3.11 is unprobed.
  - A shrinking list makes each milestone's structural effect a reviewable
    diff.

  Date/Author: 2026-11-15, planning agent.
- D11. Decision: define `GitHubSimulatorArgs` and `InitialState` inside the
  fixture (`src/transitional/github/simulation-args.ts`). `src/simulation.ts`
  re-exports them from the seam with `export type`. Rationale: the public type
  exposure of GitHub shapes then appears as the visible root-to-seam edge
  rather than as an invisible type-level dependency. See
  `Transitional public contract`. Date/Author: 2026-11-15, design review.
- D12. Decision: add the violation kind `fixture-imports-composition-root`.
  It applies when a fixture source module imports `src/simulation.ts` or
  `src/index.ts`. Rationale: it prevents a seam-to-root cycle, which would make
  the fixture impossible to delete cleanly. Date/Author: 2026-11-15, design
  review.
- D13. Decision: confine packages by family:
  - `graphql`;
  - `graphql-*`;
  - `@graphql-tools/*`;
  - `@graphql-codegen/*`;
  - `@octokit/*`;
  - `@faker-js/faker`.

  `assert-ts` is not confined. Rationale:
  - Family patterns catch future additions such as `@graphql-tools/schema`.
  - Confining `@faker-js/faker` is deliberate. Technical design §7.2 requires
    "a seeded ID allocator rather than raw randomness". A DigitalOcean store
    that wants Faker must make that decision explicitly by editing the policy
    and recording why.
  - The failure message names the policy file and that procedure.
  - `assert-ts` is a general assertion helper with no GitHub or determinism
    implication.

  Date/Author: 2026-11-15, design review.
- D14. Decision: move the GraphQL Codegen configuration to
  `src/transitional/github/codegen.ts`. The `generate` script becomes
  `graphql-codegen --config src/transitional/github/codegen.ts`. Rationale:
  - The configuration is fixture tooling, so it should be deleted with the
    fixture.
  - Moving it removes the need for a "transitional root file" category.

  Date/Author: 2026-11-15, design review.
- D15. Decision: propose a new roadmap task, 2.1.3 "Retire the transitional
  GitHub compatibility fixture", requiring 2.1.1.
  - Its success line: the deletion manifest has been executed; the confined
    dependencies are removed; the fixture boundary test and policy are
    deleted; and a DigitalOcean-derived OpenAPI smoke test replaces the
    fixture's Foundation OpenAPI coverage.

  Rationale:
  - The earlier trigger ("when the composition root stops needing the GitHub
    REST document") could not be checked, because Foundation's `openapi`
    option is optional.
  - "First release" is undefined for a `0.1.0` package with no tags.
  - An ADR records a decision but does not schedule work.
  - Adding the task is within this plan's approval scope, but the user may
    reject or re-place it.

  Date/Author: 2026-11-15, design review.
- D16. Decision: run milestone tests as `CI=true make test` and assert the
  snapshot count. Rationale: Bun only refuses to create snapshots when `CI` is
  set, so this turns a silently re-created snapshot into a failure.
  Date/Author: 2026-11-15, design review.

## Open questions for the approver

These are the user's decisions. The plan proceeds on the stated default if
approval is given without comment.

1. Quarantine now and retire in 2.1.3 (default), or delete the fixture outright
   in this task (`D1` alternative)?
2. Add roadmap task 2.1.3 as proposed (default), place it elsewhere, or keep
   retirement unscheduled (`D15`)?
3. Keep the public names `simulation`, `GitHubSimulatorArgs`, and
   `InitialState` until the DigitalOcean store lands (default), or rename them
   now (`D7`)?
4. Keep the roughly 1,100 mocked GitHub REST operations at `/` unchanged
   (default), or narrow them? Narrowing is a behaviour change outside this
   task's constraints.

## Outcomes & retrospective

Not started. To be completed at each milestone and at closure.

## Context and orientation

Inspected base revision: `889431f` ("Remove the tool list from AGENTS.md
(#118)"). Line numbers below refer to that revision. Relocate a symbol with
`git grep -n '<symbol>'`.

### Toolchain and gates

The toolchain:

- Bun: `packageManager` and CI pin `bun@1.3.11`; Bun 1.4.4 is installed on
  the host.
- TypeScript: `^6.0.3`, with 6.0.3 installed.
- `tsconfig.json`: strict, with `moduleResolution: "bundler"` and
  `allowImportingTsExtensions`. It includes `src/**/*.ts`, `tests/**/*.ts`,
  `example/**/*.ts`, `codegen.ts`, `sync.ts`, `tsdown.config.ts`, and
  `process-env.d.ts`.
- Tests use `bun:test`. `bun test --max-concurrency=1 tests` runs every
  `*.test.ts` and `*.test.mjs` file under `tests/` recursively, in one process.
- `*.test-d.ts` files are compile-time type tests, checked only by `tsc`
  during `make typecheck`.
- Property tests use `fast-check` with `propertyTestSeed` (13 101).

The gate targets in `Makefile`:

- `make check-fmt`: the Biome format check and `mdtablefix --check`.
- `make typecheck`: `bun run generate`, then `tsc --noEmit`.
- `make docs-check`: the TypeDoc zero-tolerance documentation gate on
  `src/index.ts`.
- `make lint`: interrogate for `scripts/`, Biome lint, and Oxlint with the
  `ai-deslop` and Unicorn rules.
- `make test`.
- `make spelling`: `typos` over tracked Markdown.
- `make all`: all of the above. CI runs `make all`, then Markdown lint,
  `bun run audit`, and `make build`.

`make build` runs tsdown, producing ESM and CommonJS output, checked with
`attw` and `publint`. Markdown is validated with `make markdownlint` and
Mermaid with `make nixie`.

### Current assembly and data flow

`src/index.ts` is the package facade. It re-exports:

- `simulation`, `GitHubSimulatorArgs`, and `InitialState` from
  `src/simulation.ts`;
- the five GitHub schemas from `src/store/entities.ts`.

`simulation(args)` in `src/simulation.ts:118`:

1. parses the GitHub seed with `githubInitialStoreSchema`;
2. composes the store with `extendStore` from `src/store/index.ts`;
3. calls `createFoundationSimulationServer`.

Two failure reasons are logged as `digitalpuddle.simulation.assembly_failed`:
`schema-validation-failed` and `store-composition-failed`.

`createFoundationSimulationServer` receives two GitHub-bearing inputs:

- `extendRouter(args.extend?.extendRouter)` from `src/extend-api.ts:76`. It
  registers, in order:
  - the opt-in request logger;
  - the caller extension;
  - `/health`;
  - the admin routes (`extendDigitalPuddleAdminRoutes` from
    `src/admin/routes.ts`);
  - `/graphql` (`createHandler` from `src/graphql/handler.ts`, which loads
    `schema.docs-enterprise.graphql` at registration time);
  - the OAuth stubs `/login/oauth/authorize`, `/login/oauth/access_token`,
    and `/api/v3/app/installations/:id/access_tokens`.
- `openapi(…)` from `src/rest/index.ts:316`, called with:
  - the parsed seed;
  - the API root (`'/'` by default);
  - the schema (`'api.github.com.json'` by default);
  - the caller's handler extension.

  This loads the GitHub REST description through `getSchema` (`src/utils.ts`)
  and builds 13 GitHub operation handlers, two of which come from
  `src/handlers/user.ts`. The handlers are wrapped with
  `withErrorLoggingForHandlers`.

No DigitalOcean `/v2` route is served yet.

The production modules (`src/openapi/`, `src/admin/`,
`src/handlers/unsupported.ts`, and the `worker`, `engines`, `journal`,
`scenarios`, and `cli` skeletons) do not import GitHub code, apart from the
type-only edge at `src/admin/routes.ts:11`. `FoundationRouter` is defined three
times: in `src/simulation.ts:30`, `src/extend-api.ts:16-17`, and
`src/admin/routes.ts:14-17`, which is the only exported definition.

### Classification and destination of current files

GitHub scaffolding, which moves into the fixture with its sub-paths kept:

- `src/store/index.ts`, `src/store/entities.ts`, and
  `src/store/entities/{blob,branch,installation,organization,repository,shared}.ts`
  move to `src/transitional/github/store/…`.
- `src/rest/index.ts` (minus the error-logging helpers) and
  `src/rest/utils.ts` move to `src/transitional/github/rest/…`.
- `src/graphql/{connections,handler,owners,relay,resolvers,to-graphql,to-graphql-shapes}.ts`
  and `src/graphql/converters/{organization,repository,user}.ts` move to
  `src/transitional/github/graphql/…`.
- `src/domain/user.ts` moves to `src/transitional/github/domain/user.ts`.
- `src/handlers/user.ts` moves to `src/transitional/github/handlers/user.ts`.
- `src/utils.ts` moves to `src/transitional/github/schema-files.ts`.
- The GitHub route block of `src/extend-api.ts` (lines 19-23 and 104-137)
  moves to a new `src/transitional/github/routes.ts` in `EP-M3`, while still at
  its original depth, and moves into the fixture in `EP-M4`.
- The `GitHubSimulatorArgs` and `InitialState` definitions move from
  `src/simulation.ts` to `src/transitional/github/simulation-args.ts`.
- `schema/api.github.com.json` and `schema/schema.docs-enterprise.graphql`
  move to `src/transitional/github/schema/`. `schema/README.md` is replaced by
  `src/transitional/github/README.md`.
- `codegen.ts` moves to `src/transitional/github/codegen.ts`, and its output
  moves to `src/transitional/github/__generated__/resolvers-types.ts`.
- `schema/schema.docs.graphql` and `sync.ts` are deleted.

DigitalPuddle production, which stays:

- `src/index.ts`;
- `src/simulation.ts` (the composition root);
- `src/extend-api.ts` (after `D5`);
- `src/admin/*` and `src/openapi/*`;
- `src/handlers/types.ts`, `src/handlers/unsupported.ts`, and the new
  `src/handlers/error-logging.ts`;
- the new `src/package-root.ts`;
- `src/worker/`, `src/engines/`, `src/journal/`, `src/scenarios/`, and
  `src/cli/`;
- `sync-digitalocean-openapi.ts` and `bin/start.cjs`;
- `example/start.ts`, which consumes the GitHub seed through the package root
  and is listed in the deletion manifest.

After the move, the empty `src/store/`, `src/rest/`, `src/graphql/`, and
`src/domain/` directories disappear. Roadmap 1.4.2 recreates `src/store/` for
DigitalOcean state, and 2.1.1 creates a production OpenAPI adapter.

GitHub tests, which move to `tests/transitional/github/` with their names kept
unless stated:

- `graphql.test.ts`, `graphql-converters.test.ts`, and
  `graphql-contracts.test-d.ts`;
- `relay.test.ts` and `relay.test-d.ts`;
- `installations.test.ts`, `repositories.test.ts`, and `user.test.ts`;
- `user-handler-contracts.test-d.ts`;
- `entities.test.ts`, `rest-utils.test.ts`, and `domain.test.ts`;
- `overload-contracts.test-d.ts`;
- `utils.test.ts`, renamed `schema-files.test.ts`;
- `handlers-layout.test.ts`, renamed `user-handlers.test.ts`, with its
  snapshot moved and renamed alongside.

One mixed test is split. The two OAuth cases in `tests/base.test.ts` (lines
65-84) move to a new `tests/transitional/github/oauth-routes.test.ts`, which
listens on port `0`. `base.test.ts` keeps its other cases and their assertions
unchanged, including `/hello-world`. Its `GitHubExtendStoreInput` import
becomes a type derived from the package root:
`NonNullable<NonNullable<GitHubSimulatorArgs['extend']>['extendStore']>`.

Production tests whose imports change: `tests/logging.test.ts` (the error
helpers now come from `src/handlers/error-logging.ts`),
`tests/simulation-layout.test.ts`, and `tests/base.test.ts`.

### Transitional public contract

Until roadmap 1.4.2 and 2.1.1 replace the assembly, the public signature of
`simulation()` is GitHub-shaped:

- its parameter type `GitHubSimulatorArgs` refers to the GitHub seed,
  `SchemaFile`, the GitHub store extension input, and the GitHub store type;
- its return type is `FoundationSimulator<ExtendedSimulationStore>`;
- `InitialState` is the GitHub seed type.

These types are defined in the fixture and re-exported through the seam,
`src/simulation.ts`, and `src/index.ts`. The bundled `.d.cts` and `.d.mts`
files therefore contain GitHub shapes. `INV-surface` covers run-time exports
only. This exposure is intended, documented in the users' guide, and listed in
the deletion manifest.

### Documentation and skills to consult

Documents:

- `docs/digitalpuddle-technical-design.md` §4 (assembly) and §16 (repository
  layout, including the transitional paragraph at lines 755-765).
- `docs/adrs/adr-0005-transitional-simulacat-boundaries.md` (the transition
  policy).
- `docs/adrs/adr-0008-oxlint-plugin-strategy.md`, which references
  `src/__generated__/` and the REST and GraphQL `null` rationale.
- `docs/developers-guide.md`: §1 (repository shape and inherited modules),
  "GraphQL code generation", §4 (testing), and §9 (transitional rules).
- `docs/users-guide.md`: "Current status", "OAuth authorization", and
  "Transitional GraphQL organization query".
- `docs/migration-from-simulacat-core.md`.
- `docs/dependency-policy-exception-braces-nested-patterns.md:44`, which
  names `src/store/entities.ts`.
- `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`
  §8 (separate domain rules from protocol adapters) and §30 (organize the
  simulator by responsibility).
- `docs/documentation-style-guide.md`: spelling, wrapping, ADR amendments,
  and table captions.

Skills:

- `execplans`;
- `hexagonal-architecture`, for the dependency rule and the policy-versus-
  adapter split;
- `typescript-router`, routing to `typescript-testing`, `fast-check`,
  `typescript-modules-and-packaging` (package surface and bundle checks), and
  `typescript-quality-tools` (one owner per static concern);
- `codegraph-mcp`, running its impact and related-tests queries before each
  move;
- `biome-typescript`;
- `en-gb-oxendict-style`;
- `commit-message`;
- `pr-creation`.

## Conformance basis

Upstream artefacts, all inspected at `889431f`:

- There is no Terms of Reference document in this repository.
- Technical design: `docs/digitalpuddle-technical-design.md` (status
  "Proposed"), §4 "Core architectural position", §7.2 (seeded state), and §16
  "Repository layout".
- ADRs: ADR 0001 (Simulacrum backplane), ADR 0005 (transitional Simulacat
  boundaries), and ADR 0008 (Oxlint plugin strategy, which is affected by the
  generated path).
- Roadmap: `docs/roadmap.md` task 1.2.3, which requires 1.2.2 (done).
- Standards: `AGENTS.md` and `docs/documentation-style-guide.md`.

Derived requirements:

- `REQ-split`: retained GitHub schemas, GraphQL helpers, REST handlers, and
  tests are either inside a named transitional fixture area or deleted (roadmap
  1.2.3 success line; ADR 0005 consequence 5).
- `REQ-unused-removed`: GitHub artefacts not used by any gate are deleted
  (roadmap 1.2.3).
- `REQ-direction`: production code does not depend on fixture code, except at
  one composition root (ADR 0005 decision; technical design §4 "one assembly
  point").
- `REQ-marked`: every fixture module is visibly marked (roadmap 1.2.3).
- `REQ-behaviour`: the working Simulacrum baseline keeps running (ADR 0005;
  ADR 0001).
- `REQ-surface`: the package root's run-time surface presents DigitalPuddle,
  not GitHub schemas (technical design §16 facade paragraph).
- `REQ-retirement`: the fixture's removal is scheduled, enumerated, and
  rehearsed (ADR 0005 consequence 5, made actionable).
- `REQ-docs`: the design, the ADRs, and the guides describe the new layout
  (the user brief; `AGENTS.md`).

Observed gaps:

- `GAP-mixed-dirs`: GitHub modules occupy target DigitalPuddle directories.
- `GAP-admin-edge`: `src/admin/routes.ts:11` imports the GitHub store type.
- `GAP-router-mix`: `src/extend-api.ts` mounts GitHub routes beside
  DigitalPuddle routes.
- `GAP-root-exports`: `src/index.ts` exports five GitHub schemas.
- `GAP-unused-assets`: `schema/schema.docs.graphql` and `sync.ts` are not used
  by any gate.
- `GAP-no-guard`: nothing prevents new production-to-GitHub dependencies.
- `GAP-no-exit`: no task, trigger, or checklist owns the fixture's deletion.

Trace links:

```plaintext
ADR-0005 -> REQ-direction + GAP-no-guard -> EP-M1 -> tests/transitional/github/boundary.test.ts (baseline list)
ROADMAP-1.2.3 -> REQ-unused-removed + GAP-unused-assets -> EP-M2 -> baseline list shrinks; schema-files tests
ADR-0005 -> REQ-direction + GAP-admin-edge + GAP-router-mix -> EP-M3 -> baseline list shrinks; base/logging tests
ADR-0005 -> REQ-split + REQ-marked + GAP-mixed-dirs -> EP-M4 -> boundary.test.ts reports []; moved suites green
TDD-§16 -> REQ-surface + GAP-root-exports -> EP-M5 -> tests/package-surface.test.ts
ADR-0001 + ADR-0005 -> REQ-behaviour -> EP-M2..EP-M5 -> moved assertions unchanged; CI=true snapshot count 13
ADR-0005 -> REQ-retirement + GAP-no-exit -> EP-M6 -> deletion rehearsal transcript; roadmap 2.1.3
REQ-docs -> EP-M4 (paths) + EP-M6 (narrative) -> guides, design §16, ADR 0005/0008 amendments, roadmap
```

## Verification plan

### Abstract model

A *module* is a repository-relative file path `p`. The scanner reports, for
each module:

- its *import facts*;
- its source text;
- its leading `/** … */` block.

There are three kinds of import fact:

- `resolved`: a local file reached through `ts.resolveModuleName`, carrying
  the repository-relative path of the resolved file;
- `unresolved`: a relative specifier that resolution could not reach,
  carrying the lexically normalized path;
- `package`: a bare specifier, reduced to `name` or `@scope/name`. Built-ins
  (`node:*` and Node core names) are dropped.

The scanner also lists every repository file name, from
`git ls-files -z --cached --others --exclude-standard`, so that the asset-file
rule sees `schema/`.

A *policy* names:

- the fixture roots `F`, given as directory paths without trailing slashes:
  `src/transitional/github` and `tests/transitional/github`;
- the composition roots `C` (`src/simulation.ts`) and the package facade
  `src/index.ts`;
- the seams `S` (`src/transitional/github/index.ts`), where every seam is
  inside a fixture root;
- the confined package patterns `P`, as in `D13`;
- the confined asset names `A`: `api.github.com.json`,
  `schema.docs-enterprise.graphql`, and `schema.docs.graphql`;
- the marker `M`: `Transitional GitHub compatibility fixture`;
- the allowed-unresolved prefixes `U`: `dist/`, which is build output that
  `bin/start.cjs` loads.

`inFixture(p)` holds when `p === r || p.startsWith(r + '/')` for some `r` in
`F`.

A *violation* is one of the following kinds:

- `production-imports-fixture`: a resolved edge `p -> q` where
  `inFixture(q)`, `¬inFixture(p)`, and `p ∉ C`.
- `composition-root-bypasses-seam`: a resolved edge `p -> q` where `p ∈ C`,
  `inFixture(q)`, and `q ∉ S`.
- `fixture-imports-composition-root`: a resolved edge `p -> q` where
  `inFixture(p)`, `p` is under `src/`, and `q ∈ C ∪ {src/index.ts}`.
- `confined-package-outside-fixture`: a module `p` with `¬inFixture(p)` that
  imports a package matching `P`.
- `confined-asset-name-outside-fixture`: a module `p` with `¬inFixture(p)`
  whose text contains a name in `A`.
- `confined-asset-file-outside-fixture`: a repository file whose basename is
  in `A` and whose path is not in a fixture root.
- `fixture-module-unmarked`: a TypeScript module `p` with `inFixture(p)`
  whose leading block lacks `M`.
- `unresolved-local-import`: an `unresolved` fact whose path is not under a
  prefix in `U`.

Duplicate facts (two imports of one target from the same module) yield one
violation.

`findBoundaryViolations(scan, policy)` returns violations sorted by kind, then
module, then target. `formatBoundaryViolation(v)` renders a violation as
`<kind>: <module> -> <target>`, with the arrow and target omitted for
single-path kinds. For `confined-package-outside-fixture`, it appends a note
naming the policy file (`policy.policyFile`) and the promotion procedure in
`docs/developers-guide.md` §4.

The repository is conformant when the formatted list equals the milestone's
expected list. That list is `[]` from the end of `EP-M4` onwards. Scanner
failures (an unreadable file, a Git failure, or a parse of `tsconfig.json` that
fails) raise an `Error` with a `cause`, never an empty result.

### Invariants and lemmas

- `INV-direction` (for `REQ-direction`): every resolved edge into a fixture
  module comes either from another fixture module, or from `src/simulation.ts`
  into `src/transitional/github/index.ts`. No fixture source module imports the
  composition root or the package facade.
- `INV-confined` (for `REQ-split`):
  - confined packages are imported only from fixture modules;
  - confined asset names appear only in fixture modules;
  - confined asset files exist only under fixture roots.
- `INV-marked` (for `REQ-marked`): every TypeScript module in a fixture root
  carries `M` in its leading block.
- `INV-behaviour` (for `REQ-behaviour`):
  - every moved test keeps its assertions and passes;
  - every moved snapshot is byte-identical;
  - `CI=true make test` reports 13 snapshots and no `added`;
  - the startup-output snapshots are unchanged.
- `INV-surface` (for `REQ-surface`): the run-time export names of
  `src/index.ts`, of `dist/index.cjs` loaded by Node, and of `dist/index.mjs`
  imported by Node are exactly `['simulation']`. This covers run-time names
  only; the type surface is described in `Transitional public contract`.
- `INV-bundle-assets` (for `REQ-behaviour`): servers started from both bundle
  formats load the moved GitHub assets. This is evidenced by `/graphql`
  answering `{ __typename }` with HTTP 200.
- `L-sound` and `L-complete` (policy lemmas): each reported violation
  corresponds to a real offending fact in the scan, and each offending fact is
  reported exactly once.
- `L-order-independent`: the result does not depend on the order of modules,
  facts, or file names.
- `L-segment-boundary`: `inFixture` matches whole path segments only.
- `L-resolution-canonical` (adapter contract): every specifier form that `tsc`
  resolves to the same file yields the same `resolved` path. The forms are
  `./x.ts`, `./x`, `./x.js`, the directory `./dir` for `./dir/index.ts`, and
  `../sibling/../dir`.
- `L-scanner-complete` (adapter contract): the scanner reports every import
  form listed in `D2`. It ignores specifiers that appear only in comments,
  string contents, or after a backtick regular expression.

### Axioms (trusted, not verified here)

- `AXIOM-ts-ast`: `ts.createSourceFile` produces the syntax tree that `tsc`
  uses, and `ts.resolveModuleName`, with options from
  `ts.parseJsonConfigFileContent`, resolves module specifiers as `tsc` does
  under `moduleResolution: "bundler"`. This is the TypeScript compiler API,
  used by `tests/support/module-boundaries/scan.ts`.
- `AXIOM-git-ls-files`: `git ls-files --cached --others --exclude-standard`
  lists tracked files and untracked, non-ignored files. Tests run inside a Git
  checkout, both locally and in CI after `actions/checkout`.
- `AXIOM-bun-discovery`: `bun test <dir>` discovers `*.test.*` files
  recursively and runs all files in one process.
- `AXIOM-bun-snapshots`: Bun keeps snapshots in `__snapshots__/<file>.snap`
  beside the test file. With `CI=true` it refuses to create a missing snapshot.
  The refusal was probed on Bun 1.4.4 by the design review; Bun 1.3.11 is
  re-checked in CI.
- `AXIOM-dirname`: in source, `import.meta.dirname` is the module's
  directory. In the single-entry tsdown bundle, every inlined module evaluates
  it, with the CommonJS shim, as `dist/`.
- `AXIOM-foundation`: `createFoundationSimulationServer` mounts router
  extensions in call order and serves the given OpenAPI documents as before.
  This is the `@simulacrum/foundation-simulator` 0.8.0 contract, as patched.
- `AXIOM-codegen`: GraphQL Codegen resolves `mappers` paths relative to the
  generated output file, and `--config` selects the configuration file.

### Methods per obligation

- **Obligation: `L-segment-boundary`.**
  - Method: parameterized table test.
  - Artefact: `tests/module-boundaries-policy.test.ts`.
  - Rows:
    - `src/transitional/github` is in the fixture;
    - `src/transitional/github/index.ts` is in the fixture and is a seam;
    - `src/transitional/github/graphql/relay.ts` is in the fixture;
    - `src/transitional/githubx/a.ts` is not;
    - `src/transitional/github.ts` is not;
    - `tests/transitional/github/x.test.ts` is in the fixture;
    - `src/simulation.ts` is not (it is the composition root);
    - `src/admin/routes.ts` is not.
- **Obligation: one table case per violation kind.**
  - Method: parameterized example tests, one minimal scan per kind, each
    asserting the exact formatted line, plus a "clean" case asserting `[]`.
  - Artefact: same file.
  - Purpose: these document each rule for a reader.
- **Obligation: `L-sound`, `L-complete`, and `L-order-independent`.**
  - Method: property test, 200 runs, seeded with `propertyTestSeed`.
  - Domain: scans of 1 to 10 modules. Each module's role is chosen first:
    production, fixture, seam, or composition root. Its path is then built
    from that role.
    - Production paths deliberately include the look-alike paths
      `src/transitional/githubx/…` and `src/transitional/github.ts`.
    - Each module has 0 to 4 facts pointing at other modules, at packages
      drawn from `P` plus the decoys `zod`, `express`, and `graphqlite-x`, or
      at an `unresolved` path, and optional asset-name mentions.
  - Generator: `fc.oneof` over a clean-by-construction branch and an
    arbitrary branch.
  - Oracle: an edge-by-edge predicate written in the test from the
    generator's role table. It never calls `inFixture` or `classifyModule`.
  - Order independence: shuffling the modules and facts yields the same
    sorted list.
  - Non-vacuity:
    - counters assert that the clean branch, and violations of each
      edge-based kind, each occur in at least 10% of runs; the thresholds are
      calibrated from measured counts and recorded in `Artefacts and notes`;
    - negative control 1: changing `inFixture` to a bare `startsWith(r)`
      must produce a counterexample through the look-alike paths;
    - negative control 2: exempting every composition-root edge must also
      produce a counterexample;
    - both controls are reverted before commit.
- **Obligation: `L-scanner-complete`.**
  - Method: adapter example tests.
  - Artefact: `tests/module-boundaries-scan.test.ts`.
  - Fixture: a tree written to a fresh `fs.mkdtemp` directory with its own
    `tsconfig.json` and `git init`, removed in `afterAll`.
  - Cases, one per form: `import`, `import type`, `export … from`,
    `export * from`, `export * as ns from`, `export type * as ns from`, a
    side-effect `import`, a literal `import()`, a type-position
    `import('…').T`, a `require()` in a `.cjs` file, an `import x = require()`,
    a `declare module './x'`, a multi-line import, and an import after
    `const r = /\`/;`.
  - Negative cases: specifiers only in a comment or in a string are absent.
  - Packages: `node:fs` is dropped, and `@scope/pkg/sub` is reduced to
    `@scope/pkg`.
  - Unresolved import: `require('../dist/index.cjs')` without `dist/` yields
    `unresolved` `dist/index.cjs`.
  - Unhappy path: a directory named `broken.ts` raises an `Error` whose
    message names that path. A directory is used instead of `chmod`, because
    it fails the same way under root.
  - Non-vacuity: the expected fact sets are written by hand and are
    non-empty.
- **Obligation: `L-resolution-canonical`.**
  - Method: property test (100 runs, seeded) over the same fixture tree.
  - The test chooses a target file and a specifier form from the list in the
    lemma, writes an importing module, scans it, and asserts the canonical
    `resolved` path.
  - Oracle: the target path chosen by the generator, which is independent of
    the scanner.
  - Negative control: replacing resolution with `path.posix.normalize` must
    fail on the directory and extensionless forms.
- **Obligation: `INV-direction`, `INV-confined`, and `INV-marked` on the real
  repository.**
  - Method: the fixture boundary test.
  - Artefact: `tests/transitional/github/boundary.test.ts`, with its policy in
    `tests/transitional/github/boundary-policy.ts`.
  - Evidence:
    - at `EP-M1`, the formatted violations equal the hand-written baseline
      list, recorded in `Artefacts and notes`;
    - the list shrinks at `EP-M2` and `EP-M3`, and equals `[]` at the end of
      `EP-M4`.
  - Non-vacuity, as ordinary assertions:
    - per-root module counts: `src` at least 30, `tests` at least 30, and
      each fixture root at least 10;
    - the edge `src/simulation.ts -> src/transitional/github/index.ts` is
      observed from `EP-M4` onwards;
    - at least one fixture module imports `graphql-yoga`;
    - the asset-file list contains the moved `api.github.com.json`.
  - Permanent negative controls: for each violation kind, the test injects one
    synthetic fact into a copy of the real scan and asserts the exact
    formatted line. Examples:
    - a `resolved` edge `src/admin/routes.ts -> src/transitional/github/index.ts`;
    - a package `graphql-yoga` in `src/openapi/index.ts`;
    - a fake file `schema/api.github.com.json`.
  - End-to-end control: a scanner fixture in which a production module
    imports `'../transitional/github'` (a directory specifier) must yield
    `production-imports-fixture`. This lives in
    `tests/module-boundaries-scan.test.ts`, so it runs on every `make test`.
- **Obligation: `INV-behaviour`.**
  - Method: the existing suites moved without assertion changes, plus Git
    evidence.
  - Evidence:
    - `CI=true make test` passes;
    - the pass count equals the baseline (272), minus the deleted
      `schema.docs.graphql` case, plus the new tests;
    - the summary reports `13 snapshots` with no `added`;
    - `git diff -M100% --summary 889431f -- tests` lists each moved `.snap`
      as an exact rename;
    - `git status --porcelain` shows no untracked `.snap` files.
- **Obligation: `INV-surface`.**
  - Method: example tests.
  - Artefact: `tests/package-surface.test.ts`.
  - It asserts the sorted keys of `await import('../src/index.ts')`.
  - After a memoized build from a new `tests/support/package-build.ts`, it
    asserts the keys printed by
    `node -e "console.log(JSON.stringify(Object.keys(require('./dist/index.cjs'))))"`.
  - It asserts the keys printed by an equivalent `node --input-type=module`
    import of `./dist/index.mjs`.
  - Red: the six-key result before `EP-M5`.
- **Obligation: `INV-bundle-assets`.**
  - Method: end-to-end test.
  - Artefact: `tests/transitional/github/bundle-assets.test.ts`.
  - For each format, it spawns a Node process that loads the bundle, calls
    `simulation().listen(0)`, prints the port, and is then sent a
    `POST /graphql` with `{"query":"{ __typename }"}`. The expected response
    is HTTP 200 with `{"data":{"__typename":"Query"}}`.
  - Regression guard: this is expected to pass already at `EP-M1` for
    CommonJS. The ESM case is new coverage. It keeps passing through
    `EP-M4`, which proves the moved assets resolve from `dist/` (`D4`).

### Formal verification decision

No model checker or prover is used (`D9`):

- The task introduces no business rule, protocol, or concurrent state.
- The policy lemmas follow from the violation definitions in a few lines. A
  LemmaScript proof would largely restate those definitions, which the task
  brief and the `execplans` skill both reject.
- The realistic failure modes are in the adapter (missed syntax forms and
  wrong resolution) and in segment matching. A proof over the pure model would
  not cover those. The scanner tests, the resolution property, the table test,
  and the permanent negative controls do.

The design review concurred. No Verus milestone exists, because the code base
is TypeScript.

### Suggested BDD features

The repository has no BDD runner, and adding one is out of scope. These
scenarios are proposed acceptance specifications, each mapped to a named
`bun:test` case. They stay in this plan and are not added as a feature file.

```gherkin
Feature: Retained GitHub scaffolding is a quarantined transitional fixture
  # REQ-direction, REQ-marked -> EP-M4 -> tests/transitional/github/boundary.test.ts
  Scenario: Production modules do not depend on the GitHub fixture
    Given the repository after EP-M4
    When the fixture boundary test scans every tracked module
    Then it reports no violations
    And it observed the edge from src/simulation.ts to src/transitional/github/index.ts

  # REQ-direction -> EP-M1 -> tests/module-boundaries-scan.test.ts
  Scenario: A directory-specifier import of the fixture is rejected
    Given a production module that imports '../transitional/github'
    When the scanner and policy run
    Then the result contains "production-imports-fixture" naming that module and the seam's index.ts

  # L-segment-boundary -> EP-M1 -> tests/module-boundaries-policy.test.ts
  Scenario: A look-alike directory is not mistaken for the fixture
    Given a module at src/transitional/githubx/a.ts
    When the policy classifies it
    Then it is a production module

  # REQ-behaviour -> EP-M4/EP-M5 -> tests/transitional/github/bundle-assets.test.ts
  Scenario Outline: The built package still serves the fixture's GraphQL endpoint
    Given the package has been built with bun run build
    When Node loads dist/index.<ext> and starts simulation() on port 0
    Then POST /graphql with query "{ __typename }" returns 200

    Examples:
      | ext |
      | cjs |
      | mjs |

  # REQ-surface -> EP-M5 -> tests/package-surface.test.ts
  Scenario: The package root no longer exports GitHub schemas
    When a consumer imports the package root
    Then the only run-time export is simulation
```

## Plan of work

Work proceeds through milestones `EP-M1` to `EP-M6`. Each milestone ends with
these gates passing:

- `make check-fmt`;
- `make typecheck`;
- `make docs-check`;
- `make lint`;
- `CI=true make test`;
- `make spelling`, then commit any refreshed `typos.toml`.

Each milestone ends with one or more commits. Before each move, run the
CodeGraph impact and related-tests queries on the file, so that no caller is
missed. Use `git mv` for every move. After each milestone, record the measured
category counts in `Progress`.

### `EP-M1` module-boundary harness and fixture boundary test

Assigned: `REQ-direction`, `GAP-no-guard`; decisions `D2`, `D3`, `D10`, `D12`,
and `D13`.

1. Red: write `tests/module-boundaries-policy.test.ts` (the table tests, one
   case per kind, and the properties). It fails because
   `tests/support/module-boundaries/policy.ts` does not exist.
2. Green: implement `tests/support/module-boundaries/policy.ts` as a pure
   module. Run the test, apply the two negative controls, observe the
   counterexamples, and revert the controls. Record the measured class-coverage
   counters and set the thresholds from them.
3. Red: write `tests/module-boundaries-scan.test.ts`, including the
   resolution property and the directory-specifier end-to-end control. It fails
   because `scan.ts` is missing.
4. Green: implement `tests/support/module-boundaries/scan.ts`:
   - parse `tsconfig.json` with `ts.readConfigFile` and
     `ts.parseJsonConfigFileContent`;
   - list files with `git ls-files -z --cached --others --exclude-standard`;
   - filter the modules by extension (`.ts`, `.mts`, `.cts`, `.mjs`, `.cjs`),
     excluding any path segment `__generated__`, so that large JSON and
     generated files are never read;
   - walk each syntax tree;
   - resolve each relative specifier with `ts.resolveModuleName`, falling back
     to an `unresolved` fact;
   - reduce bare specifiers to package names;
   - extract the leading block.

   Run the test, apply the `path.posix.normalize` negative control, and revert
   it.
5. Write `tests/transitional/github/boundary-policy.ts` (the GitHub policy
   constants, carrying the marker) and
   `tests/transitional/github/boundary.test.ts`. The test asserts that the
   formatted violation list equals the baseline list recorded in
   `Artefacts and notes`. That list is captured by running the scanner once,
   and then every line is checked by hand against the classification in
   `Context and orientation`. Its expected contents:
   - `confined-package-outside-fixture` for every GraphQL, Faker, and Octokit
     import under `src/graphql/`, `src/store/`, and `tests/graphql.test.ts`;
   - `confined-asset-name-outside-fixture` for `src/simulation.ts`,
     `src/utils.ts`, `src/graphql/handler.ts`, `src/rest/index.ts`,
     `sync.ts`, `codegen.ts`, `tests/utils.test.ts`, and
     `tests/overload-contracts.test-d.ts`;
   - `confined-asset-file-outside-fixture` for the three `schema/` files;
   - no `fixture-module-unmarked` entries, because the only fixture files at
     this point are the new ones, which carry the marker from the start.

   The harness's own production tests (`tests/module-boundaries-*.test.ts`) use
   synthetic package and asset names, such as `@confined/pkg` and
   `confined-asset.json`, so that they never trip the real fixture policy.

   Add the injected-fact negative controls and the non-vacuity assertions that
   already hold (the per-root counts for `src` and `tests`). The seam-edge and
   fixture-count assertions are added in `EP-M4`.
6. Add `tests/transitional/github/bundle-assets.test.ts` and
   `tests/support/package-build.ts`. The CommonJS case passes as a regression
   guard, and the ESM case is new coverage. Both use port `0`.
7. Refactor so that every new file stays under 400 lines, then run the gates.

End state: the harness is proven by its own tests, the fixture boundary test
pins today's violations exactly, and no production code has changed.

### `EP-M2` delete unused GitHub artefacts

Assigned: `REQ-unused-removed`, `GAP-unused-assets`; decision `D6`.

1. `git rm schema/schema.docs.graphql sync.ts`.
2. Remove `'schema.docs.graphql'` from `schemaDefaults` and from the
   `getSchema` overloads in `src/utils.ts`.
3. Delete the `schema.docs.graphql` cases in `tests/utils.test.ts:58-63` and
   `tests/overload-contracts.test-d.ts`.
4. Remove the `sync:schema:rest` script from `package.json`, `sync.ts` from
   the `tsconfig.json` `include`, and the `schema/schema.docs.graphql` entry
   from the `biome.json` override.
5. Remove the matching lines from the expected violation list in the same
   commit (`sync.ts` and the `schema.docs.graphql` file).
6. Run the gates. The test count drops by exactly the deleted cases.

End state: no unused GitHub artefact remains, and behaviour is unchanged.

### `EP-M3` refactor in place

Assigned: `REQ-direction`, `GAP-admin-edge`, `GAP-router-mix`; decisions `D4`,
`D5`, `D8`, and `D11`. Nothing moves directory in this milestone except the new
files, so the next milestone's moves are pure.

1. Red: add `tests/package-root.test.ts`, which fails because the module does
   not exist. It asserts:
   - `packageRootDirectory` contains the repository `package.json`;
   - `resolvePackageRoot(moduleDirectory)` throws a descriptive `Error` for a
     temporary directory whose parent has no `digitalpuddle` `package.json`.

   Green: add `src/package-root.ts`, exporting `resolvePackageRoot`,
   `packageRootDirectory`, and `resolvePackagePath`. Point `getSchema` in
   `src/utils.ts` at `resolvePackagePath('schema', name)`.
2. Move the error-logging helpers from `src/rest/index.ts` into a new
   `src/handlers/error-logging.ts`, unchanged. Update `src/rest/index.ts` and
   the import in `tests/logging.test.ts`.
3. Create `src/github-routes.ts`, a temporary location that moves in
   `EP-M4`. Move the `/graphql` mount, `oauthAuthorizationQuerySchema`, and
   both OAuth handlers there, without changing their bodies. Export
   `registerGitHubCompatibilityRoutes(router, simulationStore)`, with
   `FoundationRouter` imported from `src/admin/routes.ts`.
4. Edit `src/extend-api.ts`:
   - make `extendRouter` generic, as `<Store>(extend)`;
   - remove the GitHub imports and routes;
   - remove the dead `registerCapabilitiesRoute` re-export;
   - import `FoundationRouter` from `src/admin/routes.ts`.
5. Edit `src/admin/routes.ts` to drop the store import and the store parameter.
6. Move the `GitHubSimulatorArgs` and `InitialState` definitions into a new
   `src/simulation-args.ts`, which moves into the fixture in `EP-M4`.
7. Rename `openapi` to `createGitHubOpenApiConfig`, with
   `apiSchema: string | undefined` defaulting internally, and rename
   `extendStore` to `extendGitHubStore`. Update every caller.
8. Rewrite `src/simulation.ts` to compose `extendRouter` with
   `registerGitHubCompatibilityRoutes` (`D5`), and to re-export the argument
   types.
9. Split the OAuth cases out of `tests/base.test.ts` into
   `tests/transitional/github/oauth-routes.test.ts`, listening on port `0`.
   Replace the `GitHubExtendStoreInput` import with the derived type.
10. Update the expected violation list in the same commit. The
    `src/simulation.ts` asset-name entry disappears.
11. Run the gates. All existing assertions are unchanged, and
    `tests/base.test.ts` and `tests/logging.test.ts` pass with import-only
    edits.

End state: one composition root exists, the shared router and admin modules
have no GitHub imports, and everything is still at its old path.

### `EP-M4` move GitHub code, tests, assets, and codegen into the fixture

Assigned: `REQ-split`, `REQ-marked`, `GAP-mixed-dirs`; decisions `D6` and `D14`.

1. `git mv` every GitHub source module listed in `Context and orientation` into
   `src/transitional/github/`:
   - `src/github-routes.ts` becomes `routes.ts`;
   - `src/simulation-args.ts` becomes `simulation-args.ts`;
   - `src/utils.ts` becomes `schema-files.ts`.
2. Run `sha256sum` on the two kept schema files, `git mv` them into
   `src/transitional/github/schema/`, and check the hashes again. Use
   `git rm schema/README.md`, and write `src/transitional/github/README.md`. It
   states:
   - the fixture's purpose;
   - the dependency rule;
   - the deletion manifest, which is finalized in `EP-M6`.
3. Point `schema-files.ts` at
   `resolvePackagePath('src', 'transitional', 'github', 'schema', name)`.
4. `git mv codegen.ts src/transitional/github/codegen.ts`.
   - Set its schema path to
     `./src/transitional/github/schema/schema.docs-enterprise.graphql`.
   - Set its output to
     `./src/transitional/github/__generated__/resolvers-types.ts`.
   - Keep the mapper strings (`../graphql/to-graphql-shapes#…`), which stay
     correct relative to the new output.
   - Set the `generate` script to
     `graphql-codegen --config src/transitional/github/codegen.ts`.
   - Run `rm -rf src/__generated__`.
   - Set the Oxlint `ignorePatterns` entry to `**/__generated__/**`.
   - Make the `Makefile` `clean` target remove both
     `src/__generated__/resolvers-types.ts` and
     `src/transitional/github/__generated__/resolvers-types.ts`.
   - Update the `biome.json` override `includes` to the moved schema paths.
   - Remove `codegen.ts` from the `tsconfig.json` `include`; the move puts it
     under `src/**`.
   - Remove `schema` from the `package.json` `files` list.
5. Create the seam `src/transitional/github/index.ts`. It re-exports only what
   `src/simulation.ts` uses:
   - `githubInitialStoreSchema`;
   - `extendGitHubStore`;
   - `createGitHubOpenApiConfig`;
   - `registerGitHubCompatibilityRoutes`;
   - the types `GitHubSimulatorArgs`, `InitialState`,
     `ExtendedSimulationStore`, and `GitHubExtendStoreInput`.

   Point `src/simulation.ts` at the seam only.
6. Fix every relative import in the moved files. Add the marker sentence to
   the `@file` block of every fixture module.
7. `git mv` the GitHub tests listed in `Context and orientation`, together
   with their `__snapshots__/*.snap` files. Fix the import paths and add the
   marker to each `@file` block.
8. Update the path references in `docs/developers-guide.md` §1, "Relay
   pagination", "Inherited data and schema utilities", "Transitional handler
   and GraphQL contracts", and "GraphQL code generation" in the same commit, so
   that no guide names a missing path.
9. Set the expected violation list to `[]`. Add the seam-edge, fixture-count,
   and asset-file non-vacuity assertions. Run the focused boundary and scanner
   tests, then the gates. Check `CI=true` snapshot counts and renames as
   described in `Risks`.

End state: the source tree shows the split, the boundary is enforced, and
behaviour is unchanged.

### `EP-M5` narrow the package root

Assigned: `REQ-surface`, `GAP-root-exports`; decision `D7`.

1. Red: add `tests/package-surface.test.ts`. It fails on the six-key result.
2. Green: remove the schema re-exports from `src/index.ts`. Update its `@file`
   block and the JSDoc of `GitHubSimulatorArgs` and `InitialState`, which state
   that the seed is the transitional GitHub fixture.
3. Run the focused tests, `make build`, and
   `npm pack --dry-run --ignore-scripts`. The pack listing must contain
   `src/transitional/github/schema/api.github.com.json` and no `schema/`
   entries. Then run the gates.

End state: the package root exposes only `simulation` at run time, and both
bundle formats are verified.

### `EP-M6` documentation, decisions, rehearsal, and roadmap

Assigned: `REQ-docs`, `REQ-retirement`, `GAP-no-exit`; decision `D15`. Delegate
the mechanical documentation edits to the `scribe` agent with exact
instructions, then review the result.

1. Deletion rehearsal:
   1. Create a scratch worktree with
      `git worktree add /tmp/dp-123-rehearsal HEAD`, and symlink
      `node_modules` into it.
   2. Delete `src/transitional/github/` and `tests/transitional/github/`.
   3. Run `bunx tsc --noEmit`, `bun test tests`, and `bun run build`.
   4. Record every failure in `Artefacts and notes` and as the deletion
      manifest in `src/transitional/github/README.md`. Expected entries:
      - `src/simulation.ts`;
      - `src/index.ts` (the type re-exports);
      - `example/start.ts`;
      - `tests/base.test.ts`;
      - `tests/simulation-layout.test.ts`;
      - the example's startup snapshot;
      - the `generate`, `check:types`, and `prepack` scripts;
      - the `biome.json` overrides;
      - the confined dependencies in `package.json`;
      - the developers' and users' guide sections.
   5. Remove the worktree with `git worktree remove --force` and delete its
      branch.
2. `docs/digitalpuddle-technical-design.md` §16:
   - leave the target tree unchanged, apart from removing `handlers/user.ts`;
   - rewrite the transitional paragraph (lines 755-765) to describe the
     fixture directories, the seam, the single composition root, the
     boundary test, and the fact that 2.1.1 needs a production OpenAPI
     adapter.
3. `docs/adrs/adr-0005-transitional-simulacat-boundaries.md`: add a dated
   `## Amendments` entry recording:
   - the split;
   - the dependency rules;
   - the deletion manifest (by reference to the fixture README);
   - the retirement task, 2.1.3.
4. `docs/adrs/adr-0008-oxlint-plugin-strategy.md`: add a dated amendment
   recording the moved generated-types path and that the REST and GraphQL
   `null` rationale now applies to the fixture.
5. `docs/developers-guide.md`:
   - narrative updates to §1;
   - §4: how the boundary harness works, how to read its failure lines, and
     how to promote a confined package;
   - §9: the dependency rule, the seam, the transitional public contract, and
     where GitHub-only needs may go.

   Rewrite the sentence that tells contributors to compose new handler groups
   through `src/rest`.
6. `docs/users-guide.md`:
   - "Current status": say that the whole GitHub REST description is mounted
     at `/` as mock routes belonging to the transitional fixture;
   - retitle the OAuth and GraphQL sections as transitional GitHub fixture
     routes;
   - say that the package root exports only `simulation` and its
     GitHub-shaped argument types.
7. `docs/migration-from-simulacat-core.md`: add the removals under "Breaking
   changes":
   - the root `github*Schema` exports;
   - `schema.docs.graphql` and the `'schema.docs.graphql'` member of
     `SchemaFile`;
   - `sync:schema:rest`;
   - `schema/` in the published files.

   Update "Transitional behaviour".
8. `docs/dependency-policy-exception-braces-nested-patterns.md:44`: update the
   `src/store/entities.ts` path.
9. `docs/roadmap.md`:
   - add task 2.1.3 as described in `D15`, requiring 2.1.1 and citing
     ADR 0005 and technical design §16;
   - mark 1.2.3 `[x]`.
10. Run `make fmt`, `make markdownlint`, `make nixie`, `make spelling`, and the
    gates. Reconcile `Conformance basis`, complete `Outcomes & retrospective`,
    and set the status to `COMPLETE`.

## Milestones and plateaus

Every milestone below makes no trust-boundary or persisted-format change and
keeps the trace links current. Each milestone's other conformance checks,
recovery, remaining gaps, and compatibility decision are listed with it.

- **`EP-M1`: harness proven; baseline violations pinned.**
  - Requirements: `GAP-no-guard` (the guard exists and pins the debt).
  - Acceptance: the harness tests pass; the boundary test equals the
    baseline list; the gates pass.
  - Conformance: there is no production change and no interface or
    dependency change.
  - Recovery: revert the milestone's commits.
  - Remaining gaps: all the other `GAP-*` items.
  - Compatibility decision: none.
- **`EP-M2`: unused artefacts deleted.**
  - Requirements: `REQ-unused-removed`.
  - Acceptance: the files are gone, the list has shrunk, and the gates pass.
  - Conformance: only the authorized script and `SchemaFile` changes.
  - Recovery: revert the milestone's commits.
  - Remaining gaps: `GAP-mixed-dirs`, `GAP-admin-edge`, `GAP-router-mix`,
    `GAP-root-exports`, `GAP-no-exit`.
  - Compatibility decision: none (pre-1.0, unreleased).
- **`EP-M3`: single composition root.**
  - Requirements: `REQ-direction` (structurally).
  - Acceptance:
    - `tests/base.test.ts` and `tests/logging.test.ts` pass with import-only
      edits;
    - the new package-root and OAuth tests pass;
    - the gates pass.
  - Conformance: technical design §4's single assembly point is now real;
    only the authorized internal signatures changed.
  - Recovery: revert the milestone's commits. `EP-M2` stays a valid plateau.
  - Remaining gaps: `GAP-mixed-dirs`, `GAP-root-exports`, `GAP-no-exit`.
  - Compatibility decision: none (internal signatures, with every caller
    updated in the same commit).
- **`EP-M4`: fixture directories populated.**
  - Requirements: `REQ-split`, `REQ-marked`, `REQ-behaviour`.
  - Acceptance:
    - the boundary test reports `[]`;
    - `CI=true` reports 13 snapshots with no `added`;
    - the renames are exact;
    - the hashes match;
    - both bundle formats serve `/graphql`;
    - the gates pass.
  - Conformance: ADR 0005 holds, and only authorized changes were made.
  - Recovery: revert the milestone's commits as a unit, because a partial
    move does not compile. `EP-M3` stays a valid plateau.
  - Remaining gaps: `GAP-root-exports`, `GAP-no-exit`, and the narrative docs.
  - Compatibility decision: none.
- **`EP-M5`: run-time root surface narrowed.**
  - Requirements: `REQ-surface`.
  - Acceptance: the package-surface test passes, and so do `make build` and
    the pack listing.
  - Conformance: only the authorized export removal.
  - Recovery: revert the commit.
  - Remaining gaps: `GAP-no-exit` and the narrative docs.
  - Compatibility decision: none (pre-1.0, no external consumers, no release
    tag).
- **`EP-M6`: retirement owned; docs complete.**
  - Requirements: `REQ-retirement`, `REQ-docs`.
  - Acceptance:
    - the rehearsal transcript is recorded;
    - the manifest, the ADR amendments, and roadmap 2.1.3 are present;
    - 1.2.3 is checked;
    - all Markdown gates and the main gates pass.
  - Recovery: revert the documentation commits.
  - Remaining gaps: none for 1.2.3. Retirement belongs to 2.1.3.
  - Compatibility decision: none.

## Concrete steps

Working directory: the repository root of this worktree. Every gate runs with
`set -o pipefail` and tees its output to
`/tmp/<gate>-digitalpuddle-1-2-3-split-retained-github-compatibility-scaffolding.out`.
Gates run sequentially and are never run in parallel. Prefer delegating full
gate runs to the `scrutineer` agent and reading the logs it cites.

```bash
set -o pipefail
BR=1-2-3-split-retained-github-compatibility-scaffolding
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-$BR.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-$BR.out
make docs-check 2>&1 | tee /tmp/docs-check-digitalpuddle-$BR.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-$BR.out
CI=true make test 2>&1 | tee /tmp/test-digitalpuddle-$BR.out
make spelling 2>&1 | tee /tmp/spelling-digitalpuddle-$BR.out
```

Focused red and green commands, by milestone:

```plaintext
EP-M1 red:   bun test tests/module-boundaries-policy.test.ts -> "Cannot find module" for policy.ts
EP-M1 green: bun test tests/module-boundaries-policy.test.ts -> all pass
EP-M1 red:   bun test tests/module-boundaries-scan.test.ts -> "Cannot find module" for scan.ts
EP-M1 green: bun test tests/module-boundaries-scan.test.ts -> all pass, including directory-specifier control
EP-M1 pin:   bun test tests/transitional/github/boundary.test.ts -> pass with the baseline list
EP-M2..M4:   same command after each change -> pass with the shrunken list; [] at the end of EP-M4
EP-M3 red:   bun test tests/package-root.test.ts -> "Cannot find module" for package-root.ts
EP-M5 red:   bun test tests/package-surface.test.ts -> expected ["simulation"], received six keys
EP-M5 green: bun test tests/package-surface.test.ts tests/transitional/github/bundle-assets.test.ts -> pass
```

Snapshot, rename, and hash checks after `EP-M4`:

```bash
grep -E 'snapshots' /tmp/test-digitalpuddle-$BR.out   # expect "13 snapshots", no "added"
git status --porcelain | grep '\.snap$' && echo 'UNEXPECTED SNAPSHOT CHANGE' || true
git diff -M100% --summary 889431f -- tests src | grep rename
sha256sum src/transitional/github/schema/api.github.com.json \
  src/transitional/github/schema/schema.docs-enterprise.graphql
```

The baseline results for the unmodified tree at `889431f` are in
`Artefacts and notes`.

## Validation and acceptance

Acceptance is behavioural:

- `CI=true make test` passes. The new test files are:
  - `tests/module-boundaries-policy.test.ts`;
  - `tests/module-boundaries-scan.test.ts`;
  - `tests/package-root.test.ts`;
  - `tests/package-surface.test.ts`;
  - `tests/transitional/github/boundary.test.ts`;
  - `tests/transitional/github/bundle-assets.test.ts`;
  - `tests/transitional/github/oauth-routes.test.ts`.

  Each new test that specifies new behaviour fails before its implementation
  step and passes after it, as listed in `Concrete steps`.
- Adding `import type {ExtendedSimulationStore} from '../transitional/github';`
  to `src/admin/routes.ts` makes the boundary test fail with
  `production-imports-fixture: src/admin/routes.ts -> src/transitional/github/index.ts`.
  Removing the import restores the pass.
- After `bun run build`, `PORT=3300 node ./bin/start.cjs` prints
  `DigitalPuddle simulation server started at http://localhost:3300`.
  - `curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/simulation`
    prints `200`.
  - A `POST /graphql` with the JSON body `{"query":"{ __typename }"}` returns
    `{"data":{"__typename":"Query"}}`.
- `bun -e "import('./src/index.ts').then(m => console.log(Object.keys(m)))"`
  prints `[ "simulation" ]`.
- `ls schema` fails with "No such file or directory".
  `ls src/transitional/github/schema` lists `api.github.com.json` and
  `schema.docs-enterprise.graphql`.

Quality criteria:

- Tests: `CI=true make test` passes, with 13 snapshots, no `added`, and no
  untracked `.snap` files.
- Verification:
  - `L-segment-boundary`, `L-sound`, `L-complete`, `L-order-independent`,
    `L-resolution-canonical`, and `L-scanner-complete` are discharged by
    their named tests;
  - the three negative controls have each been observed to fail and then
    reverted;
  - the injected-fact controls are permanent.
- Lint and type-check: `make check-fmt`, `make typecheck`, `make docs-check`,
  and `make lint` pass. `make build` passes at `EP-M4`, `EP-M5`, and `EP-M6`.
- Markdown: `make markdownlint`, `make nixie`, and `make spelling` pass.
- Security: no new dependency, and the `bun run audit` result is unchanged.

## Idempotence and recovery

Every step is a Git-tracked edit or move and can be repeated.

- `git mv` fails harmlessly if the target already exists; inspect and
  continue.
- A half-finished `EP-M4` does not compile. Recover with
  `git restore --staged --worktree .` back to the last milestone commit, rather
  than fixing it forwards piecemeal.
- Negative controls are applied in the working tree only and reverted before
  staging. Confirm with `git diff`.
- The scanner tests write only to `fs.mkdtemp` directories, which they remove.
- The deletion rehearsal uses a disposable worktree under `/tmp`, removed
  afterwards.
- Generated GraphQL types are gitignored, and `make clean` removes them from
  both paths.
- After each spelling run, commit any refreshed `typos.toml` separately.

## Artefacts and notes

Planning-time probes at `889431f` (TypeScript 6.0.3, Bun 1.4.4).

`ts.preProcessFile` on `import type`, `export … from`, a side-effect import, a
literal dynamic import, a commented import, and an import inside a string:

```plaintext
6.0.3 function
["./a.ts","./b.ts","./c.ts","./d.ts"]
```

`ts.preProcessFile` gaps found during the design review:

```plaintext
"export * as ns from './x.ts';"              []
"export type * as n from './y.ts';"          []
"const r = /`/; import a from './z.ts';"     []
"type T = import('./w.ts').T;"               ["./w.ts"]
```

Baseline gate results at `889431f` (unmodified tree, 2026-11-15):

```plaintext
make check-fmt  pass  (Biome checked 93 files; mdtablefix 26 files unchanged)
make typecheck  pass  (graphql-codegen then tsc --noEmit, 7 s)
make lint       pass  (Biome 7 infos, pre-existing; interrogate 100.0%; oxlint clean)
make test       pass  (272 pass, 0 fail, 13 snapshots, 4840 expect() calls, 25 files, 53 s)
```

Pre-existing, non-blocking Biome diagnostics:

- the `biome.json` schema version (2.4.12) does not match the 2.5.15 CLI;
- `linter.recommended` is deprecated;
- there are five `useLiteralKeys` infos.

These are not regressions and are left untouched.

Measured costs from the design review:

- 85 candidate module files;
- `import('typescript')` takes about 264 ms;
- one extra `simulation()` server takes about 1.2 s.

The scanner reads no JSON or generated files.

The `EP-M1` baseline violation list, the property-coverage counters, and the
`EP-M6` rehearsal transcript will be recorded here.

## Interfaces and dependencies

Generic harness (test support only; never shipped):

```ts
// tests/support/module-boundaries/policy.ts  (pure: no node:, typescript, or Bun imports)
export type ImportFact =
  | {readonly kind: 'resolved'; readonly path: string}
  | {readonly kind: 'unresolved'; readonly path: string}
  | {readonly kind: 'package'; readonly name: string};
export type ModuleFacts = {
  readonly path: string;
  readonly imports: readonly ImportFact[];
  readonly text: string;
  readonly leadingBlock: string;
};
export type RepositoryScan = {
  readonly modules: readonly ModuleFacts[];
  readonly files: readonly string[];
};
export type BoundaryPolicy = {
  readonly policyFile: string;
  readonly fixtureRoots: readonly string[];
  readonly compositionRoots: readonly string[];
  readonly packageFacades: readonly string[];
  readonly seams: readonly string[];
  readonly confinedPackages: readonly string[]; // exact names or 'prefix*' / '@scope/*' patterns
  readonly confinedAssetNames: readonly string[];
  readonly allowedUnresolvedPrefixes: readonly string[];
  readonly marker: string;
};
export type BoundaryViolation =
  | {readonly kind: 'production-imports-fixture'; readonly module: string; readonly target: string}
  | {readonly kind: 'composition-root-bypasses-seam'; readonly module: string; readonly target: string}
  | {readonly kind: 'fixture-imports-composition-root'; readonly module: string; readonly target: string}
  | {readonly kind: 'confined-package-outside-fixture'; readonly module: string; readonly target: string}
  | {readonly kind: 'confined-asset-name-outside-fixture'; readonly module: string; readonly target: string}
  | {readonly kind: 'confined-asset-file-outside-fixture'; readonly module: string}
  | {readonly kind: 'fixture-module-unmarked'; readonly module: string}
  | {readonly kind: 'unresolved-local-import'; readonly module: string; readonly target: string};
export const inFixture: (path: string, policy: BoundaryPolicy) => boolean;
export const findBoundaryViolations: (scan: RepositoryScan, policy: BoundaryPolicy) => readonly BoundaryViolation[];
export const formatBoundaryViolation: (violation: BoundaryViolation, policy: BoundaryPolicy) => string;

// tests/support/module-boundaries/scan.ts  (adapter: filesystem, git, typescript)
export const scanRepository: (rootDir: string) => RepositoryScan;
```

The fixture policy lives in `tests/transitional/github/boundary-policy.ts`,
which exports `githubFixtureBoundaryPolicy: BoundaryPolicy` with the values from
`Abstract model`.

Production signatures after the change:

```ts
// src/package-root.ts
export const resolvePackageRoot: (moduleDirectory: string) => string; // throws Error naming the path
export const packageRootDirectory: string;
export const resolvePackagePath: (...segments: readonly string[]) => string;

// src/extend-api.ts
export const extendRouter: <Store>(
  extend: ((router: FoundationRouter, simulationStore: Store) => void) | undefined
) => (router: FoundationRouter, simulationStore: Store) => void;

// src/admin/routes.ts
export type DigitalPuddleAdminRouter = (router: FoundationRouter) => void;

// src/handlers/error-logging.ts  (moved unchanged from src/rest/index.ts)
export type RestErrorValue = Error | string | number | boolean | bigint | symbol | null | undefined;
export const errorDetails: (error: RestErrorValue) => /* unchanged */;
export const logRestHandlerError: (operationId: string, error: RestErrorValue) => void;
export const withErrorLogging: /* unchanged */;
export const withErrorLoggingForHandlers: (simulationHandlers: SimulationHandlers) => SimulationHandlers;

// src/transitional/github/index.ts  (the seam; re-exports only)
export {githubInitialStoreSchema} from './store/entities.ts';
export {extendGitHubStore} from './store/index.ts';
export {createGitHubOpenApiConfig} from './rest/index.ts';
export {registerGitHubCompatibilityRoutes} from './routes.ts';
export type {GitHubSimulatorArgs, InitialState} from './simulation-args.ts';
export type {ExtendedSimulationStore, GitHubExtendStoreInput} from './store/index.ts';

// src/transitional/github/rest/index.ts
export const createGitHubOpenApiConfig: (
  initialState: GitHubInitialStore | undefined,
  apiRoot: string,
  apiSchema: string | undefined, // undefined selects 'api.github.com.json'
  openapiHandlers: ((simulationStore: ExtendedSimulationStore) => SimulationHandlers) | undefined
) => /* unchanged OpenAPI configuration array */;
```

Reuse policy:

- The harness's policy module owns classification, and its scanner owns
  filesystem, Git, and compiler access. No other test may re-implement either.
- `src/package-root.ts` owns package-root resolution.
- `FoundationRouter` has one exported definition, in `src/admin/routes.ts`.
- Fixture code may import production modules, such as
  `src/openapi/artifact.ts`, `src/handlers/types.ts`,
  `src/handlers/error-logging.ts`, `src/package-root.ts`, and
  `src/admin/routes.ts`. It must never import `src/simulation.ts` or
  `src/index.ts`.
- New GitHub-only needs go only in the fixture. If DigitalPuddle needs a
  similar helper, it is designed afresh in its production home.

Dependencies: no additions, removals, or range changes.

- `typescript` (`^6.0.3`, development) supplies `createSourceFile`,
  `resolveModuleName`, `readConfigFile`, and `parseJsonConfigFileContent`.
- `fast-check` (`^4.10.2`, development) supplies the property tests.
- The confined packages stay installed until roadmap 2.1.3 removes them.

## Revision note

- 2026-11-15: Initial draft from read-only reconnaissance at `889431f`.
- 2026-11-15: Revised after the expert design review (three panels: structure
  and contracts; failure modes and verification; alternatives and viability).
  Verdict: proceed with conditions. Changes:
  - The scanner moved from `ts.preProcessFile` to an AST walk with
    `ts.resolveModuleName`, after probes showed missed forms and
    directory-specifier false negatives.
  - The red stage now uses an exact, shrinking baseline violation list
    instead of `test.failing`.
  - The unused-artefact deletion moved first (`EP-M2`).
  - The refactor-in-place step (`EP-M3`) is now separate from the pure move
    (`EP-M4`).
  - Codegen and its generated output now move with the GraphQL modules, and
    stale-file cleanup was added.
  - The public argument types moved into the fixture, and a
    `Transitional public contract` section was added.
  - The REST error-logging helpers stay in production.
  - `extendRouter` takes one parameter, and `src/simulation.ts` composes the
    GitHub routes.
  - A rule against fixture-to-root imports was added; packages are confined
    by family, and Faker's confinement is justified.
  - The harness names are now generic, and the GitHub policy and boundary
    test live inside the fixture.
  - Bundle checks now cover ESM as well as CommonJS, use port `0`, and live
    in the fixture tests. The `/hello-world` change was dropped.
  - Tests run under `CI=true`, with snapshot counting.
  - A deletion rehearsal, a manifest, and proposed roadmap task 2.1.3 were
    added.
  - The budgets were re-estimated from a per-path recount.

  The remaining work follows the six milestones above. Implementation awaits
  user approval.
