# Split retained GitHub compatibility scaffolding from DigitalPuddle production surfaces (1.2.3)

This ExecPlan (execution plan) is a living document. The sections `Constraints`,
`Tolerances`, `Risks`, `Progress`, `Surprises & discoveries`, `Decision log`,
`Outcomes & retrospective`, `Conformance basis`, and `Verification plan` must
be kept up to date as work proceeds.

Status: DRAFT (awaiting design review and user approval)

Branch: `1-2-3-split-retained-github-compatibility-scaffolding`

Roadmap item: `1.2.3` in `docs/roadmap.md`.

## Purpose / big picture

DigitalPuddle is a local DigitalOcean API simulator. It was imported from
Simulacat Core, a GitHub API simulator built on the Simulacrum
`@simulacrum/foundation-simulator` backplane. The imported GitHub code (REST
handlers, a GraphQL endpoint, OAuth stubs, GitHub entity schemas, a 11 MB
GitHub REST description, and their tests) is still the only thing that makes
the server start and serve requests. Architecture decision record (ADR) 0005
keeps that code as a working adaptation baseline. ADR 0005 also requires the
GitHub scaffolding to be split from DigitalPuddle's production surfaces before
the first release.

Today a contributor cannot tell, from the file tree or from any gate, which
code is DigitalPuddle and which is borrowed GitHub scaffolding. GitHub modules
sit in the same directories the technical design reserves for DigitalOcean work
(`src/store/`, `src/handlers/user.ts`, `src/domain/`). The private admin route
module `src/admin/routes.ts` imports the GitHub store type. The router
composition module `src/extend-api.ts` mounts `/graphql` and the OAuth stubs
next to DigitalPuddle's own routes. The package root `src/index.ts` exports
five GitHub entity schemas. Nothing stops new DigitalPuddle code from growing
fresh dependencies on GitHub code, which would make the eventual deletion
expensive.

After this change:

1. Every retained GitHub source module, schema asset, and test lives under one
   of two clearly named transitional fixture directories:
   `src/transitional/github/` and `tests/transitional/github/`. Every such
   TypeScript module carries the marker phrase
   `Transitional GitHub compatibility fixture` in its `@file` block.
2. The only production module allowed to import transitional code is the
   composition root `src/simulation.ts`, and it may import only the seam module
   `src/transitional/github/index.ts`. The term *composition root* means the
   one module that wires adapters together. The term *seam* means the single
   entry module that is the transitional fixture's only public interface.
3. A new architecture fitness test,
   `tests/github-compatibility-boundary.test.ts`, fails `make test` if
   production code imports transitional code, if GitHub-only packages or GitHub
   schema asset names appear outside the transitional directories, or if a
   transitional module lacks its marker. An *architecture fitness test* is an
   ordinary test that checks a structural rule of the code base rather than
   run-time behaviour.
4. GitHub artefacts that no gate uses are removed: the unused
   `schema/schema.docs.graphql` (1.1 MB), the floating GitHub REST refresh
   script `sync.ts` and its `sync:schema:rest` package script, and the five
   `github*Schema` re-exports from the package root.
5. Run-time behaviour is unchanged. The server still starts, still serves
   `/simulation`, `/health`, `/_digitalpuddle/capabilities`, `/graphql`, and
   the OAuth stubs, and every moved test passes with its original assertions
   and snapshots.

Observable success: a contributor can run
`bun test tests/github-compatibility-boundary.test.ts` and see it pass. Adding
`import type {ExtendedSimulationStore} from '../transitional/github/index.ts';`
to `src/admin/routes.ts` makes it fail with a message that names that edge.
Deleting `src/transitional/github/` and `tests/transitional/github/` then
breaks only `src/simulation.ts`, which is the planned deletion point.

## Constraints

- Implementation begins only after the user explicitly approves this plan.
- Keep Simulacrum (`@simulacrum/foundation-simulator`) as the HTTP backplane
  (ADR 0001). Do not change the patched dependency or its patch file.
- Preserve run-time behaviour. The routes, status codes, response bodies, log
  event names, and startup banners must not change. Moved tests keep their
  assertions, and the content of moved snapshot files stays byte-identical. The
  only intended observable changes are the removals listed in
  `Interfaces and dependencies`.
- `simulation()` keeps its name, parameter shape, default port 3300, and
  defaulting behaviour. `GitHubSimulatorArgs` and `InitialState` keep their
  names and structure and stay exported from `src/index.ts`.
- Authorized public-surface removals (pre-1.0 package, version `0.1.0`, no
  release tags, no known external consumers, so no compatibility shims): the
  five `github*Schema` exports from `src/index.ts`; the
  `schema/schema.docs.graphql` asset and its `getSchema` overload; the
  `sync:schema:rest` package script and `sync.ts`; `schema` from the
  `package.json` `files` list (its retained contents move under `src/`, which
  is already published).
- Authorized internal signature changes, made with every caller in the same
  commit and with no aliases or deprecated re-exports: `extendRouter` in
  `src/extend-api.ts` gains a compatibility-route registrar parameter and a
  store type parameter; `DigitalPuddleAdminRouter` and
  `extendDigitalPuddleAdminRoutes` in `src/admin/routes.ts` drop the unused
  store parameter.
- No new runtime or development dependencies. `typescript` (already a
  development dependency at `^6.0.3`) and `fast-check` (`^4.10.2`) are reused.
- Do not alter DigitalOcean artefacts or their provenance:
  `src/openapi/digitalocean.openapi.json`,
  `src/openapi/digitalocean.openapi.provenance.json`, and the
  `github.com/digitalocean/openapi` provenance URLs in snapshots.
- Do not edit `.grepai/` files, `CHANGELOG.md` (inherited upstream Simulacrum
  history), or completed ExecPlans under `docs/execplans/`.
- `AGENTS.md` rules apply: no code file over 400 lines; every module starts
  with a `@file` block; en-GB-oxendict spelling in comments and docs; Markdown
  wrapped at 80 columns; Biome and Oxlint clean; `make check-fmt`,
  `make typecheck`, `make lint`, and `make test` pass after every milestone.
- Tests use `bun:test`. Property tests use `fast-check` with the shared seed
  `propertyTestSeed` from `tests/support/property-test-seed.ts`.
- Respect the dependency direction: the fitness-test policy (pure domain
  logic) must not import the filesystem or TypeScript scanner (the adapter).

If satisfying the objective requires violating a constraint, stop, record the
conflict in `Decision log`, set the status to `BLOCKED`, and escalate.

## Tolerances (exception triggers)

Comparison base: `889431f` (the `main` head this branch was cut from). ExecPlan
files are excluded from every count, including this file. Vendored schema
assets are excluded from line counts and governed by the asset rule below.

Categories, assigned by path, one category per file:

- Code: `src/**/*.ts`, `tests/**`, `scripts/**`, `bin/**`, `example/**`,
  root `*.ts` except `codegen.ts` and `tsdown.config.ts`, and `Makefile`
  (executable build logic).
- Configuration: `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`,
  `.oxlintrc.json`, `typedoc.json`, `codegen.ts`, `tsdown.config.ts`,
  `.github/**`.
- Documentation: `**/*.md` except `docs/execplans/**`, including the moved
  schema `README.md`.
- Vendored schema assets (excluded from line counts):
  `schema/*.json`, `schema/*.graphql`, `src/transitional/github/schema/*.json`,
  `src/transitional/github/schema/*.graphql`. The only permitted asset changes
  are a byte-identical rename of `api.github.com.json` and
  `schema.docs-enterprise.graphql`, and deletion of `schema.docs.graphql`.
  Check with `sha256sum` before and after.

Counting commands, run from the repository root (renames detected with `-M`, so
a pure move counts as zero lines):

```bash
git diff -M --name-only 889431f...HEAD -- . ':(exclude)docs/execplans/**' | wc -l
git diff -M --numstat 889431f...HEAD -- . ':(exclude)docs/execplans/**' \
  ':(exclude)schema/*.json' ':(exclude)schema/*.graphql' \
  ':(exclude)src/transitional/github/schema/*.json' \
  ':(exclude)src/transitional/github/schema/*.graphql'
```

Classify each `--numstat` row by the category rules above and sum per category.
Code and documentation are measured as net lines (additions minus deletions);
configuration is measured as churn (additions plus deletions) because most
configuration edits are path rewrites with zero net change.

- Files: stop and escalate if more than 85 non-ExecPlan paths change. The
  estimate is 72: 24 moved `src/` modules, 3 new `src/` modules, 4 edited
  `src/` modules, 3 schema files plus the schema README, about 22 moved, split,
  or new test files, 2 new test support modules, 7 configuration files, and 8
  documentation files.
- Code: stop and escalate above 900 net lines. The estimate is 650: boundary
  policy (about 120), scanner adapter (about 90), policy property and table
  tests (about 200), scanner and repository fitness tests (about 150), the
  package-surface test (about 40), and marker and import-path edits (about 50
  net).
- Configuration: stop and escalate above 120 lines of churn. The estimate is
  60.
- Documentation: stop and escalate above 350 net lines. The estimate is 220
  across the developers' guide, users' guide, technical design §16, ADR 0005
  and ADR 0008 amendments, the migration guide, the schema README, and the
  roadmap.
- Interface: stop and escalate if any public or internal signature change
  beyond those authorized in `Constraints` is needed.
- Dependencies: stop and escalate if any dependency must be added, removed, or
  re-ranged.
- Behaviour: stop and escalate if any moved test needs an assertion change, or
  if any moved snapshot's content changes.
- Architecture: stop and escalate if the composition root cannot be limited to
  `src/simulation.ts`, or if a production module other than the composition
  root genuinely needs a transitional type or value.
- Iterations: stop and escalate if a gate still fails after three fix
  attempts within one milestone.
- Time: stop and escalate if a milestone takes more than one working day of
  agent time.
- Ambiguity: stop and present options if a module cannot be classified as
  GitHub scaffolding or DigitalPuddle production from the evidence in
  `Context and orientation`.

Each category is enforced independently. Spare capacity in one category does
not offset an overrun in another.

Historical evidence informing these budgets: the predecessor plan
`docs/execplans/1-2-2-introduce-target-source-layout-incrementally.md` used one
combined budget (35 files or 1,200 net lines) and never recorded measured
counts. `docs/execplans/1-3-1-pinned-digital-ocean-open-api-artefact.md`
recorded a scope overrun "accepted" with no numbers. Neither plan recorded a
budget increase, so no repeated-increase pattern exists. The lesson applied
here is to use separate category budgets, an explicit counting command, and a
measured count at each milestone boundary in `Progress`. The file budget is
higher than in 1.2.2 because this task is mostly moves. Renames are cheap in
lines but expensive in paths.

## Risks

- Risk: schema assets resolve from different directories in source and in the
  bundle. `getSchema` currently computes the package root as
  `path.join(import.meta.dirname, '..')`. That works for `src/utils.ts` (depth
  one under `src/`) and for `dist/index.*` (depth one under `dist/`). Moving
  the loader to `src/transitional/github/` would break the source path but not
  the bundle path, or the reverse. Severity: high. Likelihood: high if ignored.
  Mitigation: add `src/package-root.ts` at depth one, which owns the root
  computation, and have the transitional loader call it. Cover the bundle path
  with the existing built-CommonJS startup test, extended to issue one
  `/graphql` request (see `EP-M4`).
- Risk: Bun silently writes a fresh snapshot when a moved test cannot find its
  `.snap` file, which would hide a behaviour change. Severity: high.
  Likelihood: medium. Mitigation: move each `.snap` file with `git mv` in the
  same commit as its test, then confirm that `git status --porcelain` lists no
  untracked `.snap` files after `make test`. Confirm too that
  `git diff -M100% --stat` shows the snapshot as an exact rename.
- Risk: the GraphQL Codegen mapper paths are relative to the generated file.
  Moving the output to `src/transitional/github/__generated__/` changes the
  base. Severity: medium. Likelihood: medium. Mitigation: keep the mapper
  strings as `../graphql/to-graphql-shapes#GraphQLUser` (the same relative
  shape from the new location), then run `make typecheck`, which regenerates
  the types first.
- Risk: the fitness test reports a false pass (vacuity) if the scanner misses
  import forms or scans the wrong directory. Severity: high. Likelihood: low.
  Mitigation: a scanner adapter test over a fixture tree that uses every import
  form, plus non-vacuity assertions in the repository test (minimum module
  count, at least one observed root-to-seam edge, and at least one observed
  GitHub-only package import inside the fixture), plus a seeded-fault drill.
- Risk: a path-prefix bug classifies `src/transitional/githubx/` or
  `src/transitional/github.ts` as transitional. Severity: medium. Likelihood:
  medium. Mitigation: directory-boundary matching, with table tests for these
  exact paths.
- Risk: moving about 46 files produces a large diff that is hard to review.
  Severity: medium. Likelihood: high. Mitigation: keep each milestone in its
  own commit or commits, with moves done through `git mv`, so that Git rename
  detection shows small diffs. Describe the move table in the pull request.
- Risk: TypeDoc's zero-tolerance `notDocumented` gate (`make docs-check`, part
  of `make all` in CI) reacts to the changed package-root export set. Severity:
  low. Likelihood: low. Mitigation: run `make docs-check` in `EP-M4`, even
  though it is not one of the four mandated gates.
- Risk: the shared CodeGraph watcher counts directories, so new trees add
  inotify watches. Severity: low. Likelihood: low. Mitigation: the change
  creates only two small directory trees and removes `schema/`.

## Progress

- [x] (2026-11-15) Branch renamed to
  `1-2-3-split-retained-github-compatibility-scaffolding`; Lody session titled.
- [x] (2026-11-15) Reconnaissance of `src/`, `tests/`, configuration, docs,
  and predecessor ExecPlans completed (three read-only survey agents).
- [x] (2026-11-15) Tooling probes: `ts.preProcessFile` (TypeScript 6.0.3) and
  Bun 1.4.4 `test.failing` behave as this plan assumes (see
  `Artefacts and notes`).
- [x] (2026-11-15) Baseline gates recorded on the unmodified tree: all four
  pass; `make test` reports 272 pass, 0 fail, 13 snapshots, 25 files.
- [ ] Design review by an expert panel applied to this draft.
- [ ] Plan approved by the user.
- [ ] `EP-M1` boundary policy, scanner, and failing repository fitness test.
- [ ] `EP-M2` GitHub source and tests relocated behind the seam; repository
  fitness test passes.
- [ ] `EP-M3` GitHub assets and tooling relocated or removed.
- [ ] `EP-M4` package root narrowed and the bundle path verified end to end.
- [ ] `EP-M5` documentation, ADR amendments, roadmap entry marked done.

## Surprises & discoveries

- Observation: `src/utils.ts` resolves bundled schemas through
  `import.meta.dirname` plus one parent directory. Evidence: `src/utils.ts:40`.
  Impact: the loader cannot move deeper without a depth-independent root helper
  (see `Risks` and `D4`).
- Observation: `src/admin/routes.ts` imports the GitHub store type only to
  type a parameter that `extendDigitalPuddleAdminRoutes` ignores
  (`_simulationStore`). Evidence: `src/admin/routes.ts:11,18,42`. Impact: the
  parameter can be dropped instead of being made generic (`D5`).
- Observation: `src/handlers/user.ts` (GitHub) imports the run-time value
  `jsonValueSchema` from `src/openapi/artifact.ts` (DigitalPuddle). Evidence:
  `src/handlers/user.ts:12`. Impact: this is the allowed direction
  (transitional depends on production), so the edge is kept.
- Observation: `schema/schema.docs.graphql` has no run-time consumer. Only
  `tests/utils.test.ts:59` and type tests name it. Evidence: grep over `src/`
  finds it only in the `getSchema` default table at `src/utils.ts:6,37`.
  Impact: it is removed (`D6`).
- Observation: `sync.ts` imports `effection`, which is not declared in
  `package.json`. It refreshes a GitHub fixture from a floating `main` branch,
  and no gate runs it. Evidence: `sync.ts:8,28`; `package.json:72`. Impact: it
  is removed (`D6`).
- Observation: no test enforces module boundaries today. Evidence: survey of
  `tests/`; the nearest checks are `tests/runtime-layout.test.ts:18` and
  type-level assertions. Impact: the fitness test is new (`D2`).
- Observation: `docs/complexity-antipatterns-and-refactoring-strategies.md`,
  named in the task brief, does not exist in this repository. Evidence:
  `ls docs/`. Impact: none. The relevant guidance comes from `AGENTS.md`
  "Refactoring Heuristics" and the Simulacrum guide §§8 and 30.
- Observation: `src/__generated__/resolvers-types.ts` is absent until
  `bun run generate` runs, so a bare `bun test` fails on module resolution.
  Evidence: `.gitignore:13`; survey of `src/graphql/connections.ts:20`. Impact:
  always run `make typecheck` before `make test` in a fresh worktree.

## Decision log

- D1. Decision: quarantine the GitHub scaffolding rather than delete it.
  Rationale: the GitHub REST document, store, and routes are the only assembly
  that makes `simulation()` start. The startup, admin-route, and
  assembly-failure tests depend on that assembly. ADR 0005 keeps it as the
  adaptation baseline. Deleting it now would mean building the DigitalOcean
  store and `/v2` assembly (roadmap 1.4.x and 2.1.x) inside this task. The
  roadmap success criterion explicitly permits "marked as transitional
  fixtures". Rejected alternative: full deletion, which is out of scope and
  would leave no runnable server. Date/Author: 2026-11-15, planning agent.
- D2. Decision: enforce the boundary with a `bun:test` architecture fitness
  test built on `ts.preProcessFile`, with no lint rule. Rationale: the rule
  needs an allowlist (the composition root and the seam) and repository-wide
  facts (package imports and asset names). Biome's `noRestrictedImports` and
  Oxlint's `no-restricted-imports` match import specifier strings with
  gitignore-style patterns. They cannot express "only `src/simulation.ts` may
  import this, and only through `index.ts`" without per-directory overrides
  that duplicate the policy and match relative specifiers fragilely.
  `ts.preProcessFile` is the TypeScript compiler's lexical import
  pre-processor. It reports `import`, `import type`, `export … from`,
  side-effect imports, literal dynamic `import()`, and `require()` calls, and
  it ignores comments and strings. It is already installed. One owner per
  concern (see the `typescript-quality-tools` skill): the test owns the
  boundary. Rejected alternatives: `dependency-cruiser` (new dependency; 1.2.2
  already rejected it), regular expressions over source text (miss multi-line
  imports and match comments), and an Oxlint rule (duplicates the policy).
  Date/Author: 2026-11-15, planning agent.
- D3. Decision: the boundary policy is a pure module and the scanner is a
  separate adapter, both under `tests/support/module-boundaries/`. Rationale:
  the hexagonal split keeps the rule testable with generated graphs and no
  filesystem access. The adapter alone touches the disk and the TypeScript API.
  Test tooling lives under `tests/support/` because it is not product code and
  must not ship in the package. Date/Author: 2026-11-15, planning agent.
- D4. Decision: add `src/package-root.ts`, a depth-one helper that returns the
  package root directory. The transitional schema loader resolves assets
  through it. Rationale: `import.meta.dirname` is `src/` for the helper in
  source and `dist/` in the bundle. Both sit one level under the root, so a
  single helper is correct in both layouts. The alternatives each have a
  defect. Walking up the directory tree to find `package.json` adds run-time
  filesystem probing. Importing the JSON schema would inline 11 MB into the
  bundle. A transitional-local depth constant would be wrong in one of the two
  layouts. Date/Author: 2026-11-15, planning agent.
- D5. Decision: invert the GitHub route dependency out of the shared router
  modules. `extendRouter(extend, registerCompatibilityRoutes)` becomes generic
  in its store type and receives the GitHub route registrar from
  `src/simulation.ts`. `extendDigitalPuddleAdminRoutes(router)` drops its
  unused store parameter. Rationale: this keeps `src/extend-api.ts` and
  `src/admin/` free of transitional imports and makes `src/simulation.ts` the
  single composition root. Route registration order is unchanged: request
  logger, caller extension, `/health`, admin routes, then `/graphql` and the
  OAuth stubs. Rejected alternative: allowlisting `src/extend-api.ts` as a
  second composition root, which keeps two deletion points. Date/Author:
  2026-11-15, planning agent.
- D6. Decision: delete the GitHub artefacts that no gate uses:
  `schema/schema.docs.graphql` (and its `getSchema` overload and tests),
  `sync.ts`, and the `sync:schema:rest` script. Move `api.github.com.json`,
  `schema.docs-enterprise.graphql`, and the schema `README.md` to
  `src/transitional/github/schema/` byte-identically. Rationale: this matches
  the roadmap rule "removed when no longer used by gates", and it confines
  every remaining GitHub asset to the deletable directory. Rejected
  alternative: trimming `api.github.com.json` to the 13 operations the fixture
  serves. That would need a `$ref`-closure extraction tool for a file that is
  going to be deleted anyway. Date/Author: 2026-11-15, planning agent.
- D7. Decision: remove the five `github*Schema` re-exports from `src/index.ts`
  and keep `simulation`, `GitHubSimulatorArgs`, and `InitialState`. Rationale:
  the package root is a production surface. No test or entry point consumes the
  schema re-exports through the root. The package is pre-1.0 with no releases,
  so no deprecation path is owed. `simulation()` stays, because `bin/start.cjs`,
  `example/start.ts`, and the startup tests use it. Its argument types stay
  because its signature references them, and their JSDoc will state that the
  seed is a transitional GitHub fixture. Rejected alternative: renaming
  `InitialState` and `GitHubSimulatorArgs` now. That is churn without a
  DigitalOcean replacement to rename towards. Date/Author: 2026-11-15, planning
  agent.
- D8. Decision: generic-looking helpers whose only consumers are GitHub code
  move with that code: `src/graphql/relay.ts`, `src/utils.ts` (`getSchema`),
  and the REST error-logging helpers in `src/rest/index.ts`. Rationale:
  DigitalOcean list routes use `links.pages` and `meta.total`, not Relay
  connections. A DigitalOcean error-logging helper should be designed with the
  DigitalOcean handlers (roadmap 2.1.1), not inherited. Promoting a helper
  later is cheap. Leaving GitHub-only helpers in production directories is the
  confusion this task removes. `src/handlers/types.ts` (`SimulationHandler`) is
  a Foundation-level type with future DigitalOcean consumers, so it stays in
  `src/handlers/`. Date/Author: 2026-11-15, planning agent.
- D9. Decision: no formal proof (LemmaScript) for this task. Rationale: see
  `Formal verification decision`. Date/Author: 2026-11-15, planning agent.
- D10. Decision: use Bun's `test.failing` as the strict expected-failure marker
  for the red stage of the repository fitness test. Rationale: a `test.failing`
  test fails the run if its body passes, so the marker cannot hide an
  accidental green. It is removed in the green step of `EP-M2` and `EP-M3`.
  Date/Author: 2026-11-15, planning agent.

## Outcomes & retrospective

Not started. To be completed at each milestone and at closure.

## Context and orientation

Inspected base revision: `889431f` ("Remove the tool list from AGENTS.md
(#118)"). Line numbers below refer to that revision. Relocate a symbol with
`git grep -n '<symbol>'`.

### Toolchain and gates

The repository is TypeScript run with Bun (`packageManager` `bun@1.3.11`; Bun
1.4.4 is installed on the host). TypeScript is `^6.0.3` (6.0.3 installed) with
a strict `tsconfig.json`, which includes `src/**/*.ts`, `tests/**/*.ts`,
`example/**/*.ts`, `codegen.ts`, `sync.ts`, `tsdown.config.ts`, and
`process-env.d.ts`. Tests use `bun:test`, and
`bun test --max-concurrency=1 tests` runs every `*.test.ts` and `*.test.mjs`
file under `tests/` recursively. `*.test-d.ts` files are compile-time type
tests checked only by `tsc` through `make typecheck`. Property tests use
`fast-check` with `propertyTestSeed` (13 101) from
`tests/support/property-test-seed.ts`.

Gate targets in `Makefile`: `make check-fmt` (Biome format check and
`mdtablefix --check`), `make typecheck` (`bun run generate` then
`tsc --noEmit`), `make docs-check` (TypeDoc zero-tolerance documentation gate on
`src/index.ts`), `make lint` (interrogate for `scripts/`, Biome lint, Oxlint
with `ai-deslop` and Unicorn rules), `make test`, and `make all`, which CI runs
(`.github/workflows/ci.yml`), followed by Markdown lint, audit, and
`make build` (tsdown, ESM and CommonJS with `attw` and `publint`). Markdown is
validated with `make markdownlint` and Mermaid with `make nixie`.

### Current assembly and data flow

`src/index.ts` is the package facade. It re-exports `simulation`,
`GitHubSimulatorArgs`, and `InitialState` from `src/simulation.ts`, and the
five GitHub schemas from `src/store/entities.ts`. `simulation(args)` in
`src/simulation.ts:118` parses the GitHub seed with `githubInitialStoreSchema`
and composes the store with `extendStore` from `src/store/index.ts`. It then
calls `createFoundationSimulationServer` with:

- `extendRouter(args.extend?.extendRouter)` from `src/extend-api.ts:76`. This
  registers the opt-in request logger, the caller extension, `/health`, the
  admin routes (`extendDigitalPuddleAdminRoutes` from `src/admin/routes.ts`),
  `/graphql` (`createHandler` from `src/graphql/handler.ts`), and the OAuth
  stubs `/login/oauth/authorize`, `/login/oauth/access_token`, and
  `/api/v3/app/installations/:id/access_tokens`.
- `openapi(…)` from `src/rest/index.ts:316`, called with the parsed seed, the
  API root (`'/'` by default), the schema (`'api.github.com.json'` by default),
  and the caller's handler extension. This loads the GitHub REST description
  through `getSchema` (`src/utils.ts`) and builds 13 GitHub operation handlers,
  two of which come from `src/handlers/user.ts`.

No DigitalOcean `/v2` route is served yet. `src/openapi/`, `src/admin/`,
`src/handlers/unsupported.ts`, and the `worker`, `engines`, `journal`,
`scenarios`, and `cli` skeletons are DigitalPuddle production modules, and none
imports GitHub code except the type-only edge in `src/admin/routes.ts:11`.

### Classification of current modules

GitHub scaffolding (moves to `src/transitional/github/`, keeping relative
sub-paths):

- `src/store/index.ts`, `src/store/entities.ts`, and
  `src/store/entities/{blob,branch,installation,organization,repository,shared}.ts`
  move to `src/transitional/github/store/…`.
- `src/rest/index.ts` and `src/rest/utils.ts` move to
  `src/transitional/github/rest/…`.
- `src/graphql/{connections,handler,owners,relay,resolvers,to-graphql,to-graphql-shapes}.ts`
  and `src/graphql/converters/{organization,repository,user}.ts` move to
  `src/transitional/github/graphql/…`.
- `src/domain/user.ts` moves to `src/transitional/github/domain/user.ts`.
- `src/handlers/user.ts` moves to `src/transitional/github/handlers/user.ts`.
- `src/utils.ts` moves to `src/transitional/github/schema-files.ts`.
- The GitHub route block of `src/extend-api.ts` (lines 19-23 and 104-137)
  moves to a new `src/transitional/github/routes.ts`.
- `schema/api.github.com.json`, `schema/schema.docs-enterprise.graphql`, and
  `schema/README.md` move to `src/transitional/github/schema/`.
- `schema/schema.docs.graphql` and `sync.ts` are deleted.
- `codegen.ts` stays at the repository root (GraphQL Codegen's default
  configuration location) and is classified as transitional tooling.

DigitalPuddle production (stays): `src/index.ts`, `src/simulation.ts`
(composition root), `src/extend-api.ts` (after `D5`), `src/admin/*`,
`src/openapi/*`, `src/handlers/types.ts`, `src/handlers/unsupported.ts`,
`src/worker/`, `src/engines/`, `src/journal/`, `src/scenarios/`, `src/cli/`,
`sync-digitalocean-openapi.ts`, `bin/start.cjs`, and `example/start.ts`. After
the move, the empty `src/store/`, `src/rest/`, `src/graphql/`, and
`src/domain/` directories disappear. Roadmap 1.4.2 recreates `src/store/` for
DigitalOcean state.

Tests (moves to `tests/transitional/github/`, keeping file names unless stated):
`graphql.test.ts`, `graphql-converters.test.ts`, `graphql-contracts.test-d.ts`,
`relay.test.ts`, `relay.test-d.ts`, `installations.test.ts`,
`repositories.test.ts`, `user.test.ts`, `user-handler-contracts.test-d.ts`,
`entities.test.ts`, `rest-utils.test.ts`, `domain.test.ts`,
`overload-contracts.test-d.ts`, `utils.test.ts` (renamed
`schema-files.test.ts`, and its `schema.docs.graphql` case is deleted in
`EP-M3`), and `handlers-layout.test.ts` (renamed `user-handlers.test.ts`, with
its snapshot moved and renamed alongside). Mixed tests are split:

- `tests/base.test.ts` keeps the router-extension, capabilities, and
  assembly-failure cases. The two OAuth cases move to a new
  `tests/transitional/github/oauth-routes.test.ts` (port 3410). The
  `/hello-world` fixture message becomes neutral
  (`'Hello from a router extension!'`), and the `GitHubExtendStoreInput` type
  import is replaced by a type derived from `GitHubSimulatorArgs`
  (`NonNullable<GitHubSimulatorArgs['extend']>['extendStore']`) imported from
  the package root.
- `tests/logging.test.ts` keeps the request-logger cases. The
  "REST error logging helpers" `describe` block (lines 342-443) moves to
  `tests/transitional/github/rest-error-logging.test.ts`.

Tests that stay as DigitalPuddle production tests: `base.test.ts` (after the
split), `logging.test.ts` (after the split), `simulation-layout.test.ts`,
`startup-output.test.ts`, `startup-output-normalisation.test.ts`,
`runtime-layout.test.ts`, `openapi-layout.test.ts`,
`openapi-capabilities.test.ts`, `openapi-capabilities.test-d.ts`,
`openapi-projections.test.ts`, the `*.test-d.ts` skeleton tests,
`docs-gate-*.test.ts`, `run-audit.test.mjs`, and the DigitalOcean artefact
tests.

### Documentation and skills to consult

- `docs/digitalpuddle-technical-design.md` §4 (assembly) and §16 (repository
  layout, including the transitional paragraph at lines 755-765).
- `docs/adrs/adr-0005-transitional-simulacat-boundaries.md` (transition
  policy) and `docs/adrs/adr-0008-oxlint-plugin-strategy.md` (references
  `src/__generated__/` and the REST and GraphQL contracts).
- `docs/developers-guide.md` §1 (repository shape and inherited modules),
  "GraphQL code generation", §4 (testing), and §9 (transitional rules).
- `docs/users-guide.md` "Current status", "OAuth authorization", and
  "Transitional GraphQL organization query".
- `docs/migration-from-simulacat-core.md` (breaking changes and transitional
  behaviour).
- `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`
  §8 (separate domain rules from protocol adapters) and §30 (organize the
  simulator by responsibility).
- `docs/documentation-style-guide.md` (spelling, wrapping, ADR amendments,
  table captions).
- Skills: `execplans`; `hexagonal-architecture` (dependency rule and the
  policy-versus-adapter split); `typescript-router`, routing to
  `typescript-testing`, `fast-check`, `typescript-modules-and-packaging`
  (package surface and bundle checks), and `typescript-quality-tools` (one
  owner per static concern); `codegraph-mcp` (`codegraph_analyze_impact` and
  `codegraph_find_related_tests` before each move); `biome-typescript`;
  `en-gb-oxendict-style`; `commit-message`; and `pr-creation`.

## Conformance basis

Upstream artefacts, all inspected at `889431f`:

- No Terms of Reference document exists in this repository.
- Technical design: `docs/digitalpuddle-technical-design.md` (status
  "Proposed"), §4 "Core architectural position" and §16 "Repository layout".
- ADRs: ADR 0001 (Simulacrum backplane), ADR 0005 (transitional Simulacat
  boundaries), ADR 0008 (Oxlint plugin strategy, affected by the generated
  path).
- Roadmap: `docs/roadmap.md` task 1.2.3, which requires 1.2.2 (done).
- Standards: `AGENTS.md` and `docs/documentation-style-guide.md`.

Derived requirements:

- `REQ-split`: retained GitHub schemas, GraphQL helpers, REST handlers, and
  tests are either inside a named transitional fixture area or deleted (roadmap
  1.2.3 success line; ADR 0005 consequence 5).
- `REQ-unused-removed`: GitHub artefacts not used by any gate are deleted
  (roadmap 1.2.3).
- `REQ-direction`: production code does not depend on transitional code,
  except at one composition root (ADR 0005 decision; technical design §4 "one
  assembly point").
- `REQ-marked`: every transitional module is visibly marked (roadmap 1.2.3
  "marked as transitional fixtures").
- `REQ-behaviour`: the working Simulacrum baseline keeps running (ADR 0005
  "only while they preserve a working adaptation baseline"; ADR 0001).
- `REQ-surface`: the package root presents DigitalPuddle, not GitHub schemas
  (technical design §16 facade paragraph; roadmap 1.2 step idea).
- `REQ-docs`: design, ADRs, and guides describe the new layout (user brief;
  `AGENTS.md` documentation maintenance).

Observed gaps:

- `GAP-mixed-dirs`: GitHub modules occupy target DigitalPuddle directories
  (`src/store/`, `src/handlers/user.ts`, `src/domain/`).
- `GAP-admin-edge`: `src/admin/routes.ts:11` imports the GitHub store type.
- `GAP-router-mix`: `src/extend-api.ts` mounts GitHub routes beside
  DigitalPuddle routes.
- `GAP-root-exports`: `src/index.ts` exports five GitHub schemas.
- `GAP-unused-assets`: `schema/schema.docs.graphql` and `sync.ts` are unused
  by gates.
- `GAP-no-guard`: nothing prevents new production-to-GitHub dependencies.

Trace links:

```plaintext
ADR-0005 -> REQ-direction + GAP-no-guard -> EP-M1 -> tests/github-compatibility-boundary.test.ts (red via test.failing)
ADR-0005 -> REQ-split + GAP-mixed-dirs + GAP-admin-edge + GAP-router-mix -> EP-M2 -> boundary test green; moved suites green
ROADMAP-1.2.3 -> REQ-unused-removed + GAP-unused-assets -> EP-M3 -> asset-file rule green; codegen from new path
TDD-§16 -> REQ-surface + GAP-root-exports -> EP-M4 -> tests/package-surface.test.ts; startup-output CJS /graphql probe
ADR-0001 + ADR-0005 -> REQ-behaviour -> EP-M2..EP-M4 -> unchanged moved assertions; byte-identical snapshots; startup-output.test.ts
REQ-marked -> EP-M2 -> marker rule in the boundary test
REQ-docs -> EP-M5 -> updated guides, design §16, ADR 0005 and ADR 0008 amendments, roadmap [x]
```

## Verification plan

### Abstract model

A *module* is a repository-relative file path `p` with a set of *import facts*.
Each import fact is either a resolved local path (from a relative specifier) or
a package name (from a bare specifier, reduced to `name` or `@scope/name`;
`node:` built-ins are ignored). Each module also has its source text and its
leading `@file` block.

A *policy* names:

- transitional roots `T` (`src/transitional/github/`,
  `tests/transitional/github/`) and transitional files (`codegen.ts`);
- composition roots `C` (`src/simulation.ts`);
- seams `S` (`src/transitional/github/index.ts`), where `S ⊆ T`;
- GitHub-only packages `P` (`graphql`, `graphql-yoga`, `@graphql-tools/utils`,
  `@octokit/graphql`, `@faker-js/faker`, `assert-ts`, `@graphql-codegen/cli`);
- GitHub asset names `A` (`api.github.com.json`,
  `schema.docs-enterprise.graphql`, `schema.docs.graphql`);
- the marker `M` (`Transitional GitHub compatibility fixture`);
- boundary-tooling files `B` (the policy constants module and the boundary
  tests), which are exempt from the package and asset rules because they must
  name what they forbid.

`isTransitional(p)` holds when `p` equals a transitional file, or when `p`
starts with a transitional root that ends in `/`. A root therefore matches only
whole directory segments.

A *violation* is one of:

- `production-imports-transitional`: an edge `p → q` where `isTransitional(q)`,
  `¬isTransitional(p)`, and `p ∉ C`;
- `composition-root-bypasses-seam`: an edge `p → q` where `p ∈ C`,
  `isTransitional(q)`, and `q ∉ S`;
- `github-package-outside-transitional`: a module `p` that imports a package
  in `P`, where `¬isTransitional(p)` and `p ∉ B`;
- `github-asset-outside-transitional`: a module `p` whose text contains a name
  in `A`, where `¬isTransitional(p)` and `p ∉ B`;
- `github-asset-file-outside-transitional`: a repository file whose basename
  is in `A` but whose path is not transitional (added in `EP-M3`);
- `transitional-module-unmarked`: a module `p` where `isTransitional(p)`, `p`
  ends in `.ts`, and its `@file` block lacks `M`.

`findBoundaryViolations(modules, policy)` returns the violations sorted by
kind, then path, then target. The repository is conformant when the list is
empty. Malformed input (a path outside the scanned roots, or an unreadable
file) is an adapter error. It raises a descriptive `Error` with a `cause`,
never an empty list.

### Invariants and lemmas

- `INV-direction` (for `REQ-direction`): for every scanned edge `p → q`, if
  `q` is transitional then `p` is transitional, or `p ∈ C` and `q ∈ S`.
- `INV-confined-packages` and `INV-confined-assets` (for `REQ-split`):
  GitHub-only packages and GitHub asset names appear only in transitional or
  boundary-tooling modules. GitHub asset files exist only under transitional
  roots.
- `INV-marked` (for `REQ-marked`): every transitional TypeScript module
  carries `M` in its `@file` block.
- `INV-behaviour` (for `REQ-behaviour`): every moved test keeps its assertions
  and passes. Every moved snapshot is byte-identical. The startup output
  snapshots are unchanged.
- `INV-surface` (for `REQ-surface`): the run-time export names of `src/index.ts`
  and of the built `dist/index.cjs` are exactly `['simulation']`.
- `L-sound` (policy lemma): every violation the policy reports corresponds to
  a real offending edge, package import, asset mention, asset file, or unmarked
  module in the input.
- `L-complete` (policy lemma): every offending item in the input is reported
  exactly once.
- `L-deletable` (policy lemma): if the policy reports no direction
  violations, then deleting every transitional module leaves dangling edges
  only from composition roots, and only into seams. This is the property that
  makes the eventual removal a two-directory deletion plus one edit.
- `L-order-independent`: the result does not depend on the order of modules or
  of import facts.
- `L-prefix-boundary`: `isTransitional` matches whole directory segments only.
  For example, `src/transitional/githubx/a.ts` and `src/transitional/github.ts`
  are not transitional.
- `L-scanner-complete` (adapter contract): the scanner reports every import
  form the repository uses (`import`, `import type`, `export … from`,
  side-effect `import`, literal `import()`, and `require()`), and ignores
  specifiers that appear only in comments or string literals.

### Axioms (trusted, not verified here)

- `AXIOM-preprocess`: `ts.preProcessFile(text, true, true).importedFiles`
  lists the module specifiers of all static imports, re-exports, literal
  dynamic imports, and `require()` calls, and excludes comments and string
  contents (TypeScript compiler API, used by
  `tests/support/module-boundaries/scan.ts`; probed at planning time, see
  `Artefacts and notes`).
- `AXIOM-bun-discovery`: `bun test <dir>` discovers `*.test.*` files
  recursively, so `tests/transitional/github/*.test.ts` run under `make test`.
- `AXIOM-bun-failing`: `test.failing` passes only when its body throws or an
  assertion fails, and reports a failure when the body passes (probed with Bun
  1.4.4).
- `AXIOM-bun-snapshots`: Bun keeps snapshots in `__snapshots__/<file>.snap`
  beside the test file and keys entries by the full test title.
- `AXIOM-dirname`: in source, `import.meta.dirname` is the module's
  directory. In the tsdown bundle, every inlined module evaluates
  `import.meta.dirname` (with the CommonJS shim) as the `dist/` directory.
- `AXIOM-foundation`: `createFoundationSimulationServer` mounts router
  extensions in call order and serves the given OpenAPI documents as before (the
  `@simulacrum/foundation-simulator` 0.8.0 contract, patched).
- `AXIOM-codegen`: GraphQL Codegen resolves `mappers` paths relative to the
  generated output file.

### Methods per obligation

- Obligation: `L-sound` and `L-complete`.
  Method: property test. Rationale: the rule ranges over arbitrary graphs and
  role mixes. Domain: generated graphs of 1 to 12 modules. Each module gets a
  role first (production, transitional, seam, composition root, or boundary
  tooling) and then a path built from that role's directory. Each module gets 0
  to 5 import facts that point at other modules or at packages drawn from `P`
  plus decoys (`zod`, `express`), and optional asset-name mentions. Artefact:
  `tests/module-boundaries-policy.test.ts`. Evidence:
  `bun test tests/module-boundaries-policy.test.ts` passes, 200 runs with
  `propertyTestSeed`. The oracle is computed from the generator's role table
  with an edge-by-edge predicate written in the test. It does not call
  `classifyModule`, so the oracle is independent of the implementation.
  Non-vacuity: `fc.statistics`-style counters assert that at least 30% of runs
  contain a violation of each kind and at least 20% contain none. Two negative
  controls must be rejected by these properties and then reverted before
  commit: changing `isTransitional` to `startsWith(root.slice(0, -1))`, and
  exempting every composition-root edge.
- Obligation: `L-deletable`. Method: property test. Domain: a generator branch
  that builds violation-free graphs by construction (so the antecedent holds)
  and a branch of arbitrary graphs filtered by the policy result (at least 20%
  acceptance, checked). Artefact: same file. Oracle: remove transitional nodes
  with set operations, then collect the edges whose target was removed. Assert
  that every such edge starts in `C` and ends in `S`. Non-vacuity: assert that
  some generated cases contain at least one root-to-seam edge. Negative
  control: allowing `composition-root-bypasses-seam` to pass must produce a
  counterexample.
- Obligation: `L-order-independent`. Method: property test (shuffle the
  modules and the import facts, then compare the sorted results). Same file.
- Obligation: `L-prefix-boundary`. Method: parameterized table test with the
  rows `src/transitional/github/a.ts` (true),
  `src/transitional/github/index.ts` (true, seam),
  `src/transitional/githubx/a.ts` (false), `src/transitional/github.ts` (false),
  `tests/transitional/github/x.test.ts` (true), `codegen.ts` (true),
  `src/simulation.ts` (false, composition root), and `src/admin/routes.ts`
  (false). Same file.
- Obligation: `L-scanner-complete`. Method: adapter test over a fixture tree
  written to a fresh `fs.mkdtemp` directory under `os.tmpdir()` and removed in
  `afterAll`. Artefact: `tests/module-boundaries-scan.test.ts`. Cases: each
  import form; a multi-line import; a specifier only in a comment and one only
  in a string (both absent from the facts); `node:fs` (ignored);
  `@scope/pkg/sub` (reduced to `@scope/pkg`); a `.cjs` `require`; and an
  unreadable file (unhappy path: rejects with an `Error` whose message names
  the path). Non-vacuity: the fixture's expected fact set is non-empty and
  written by hand.
- Obligation: `INV-direction`, `INV-confined-packages`, `INV-confined-assets`,
  and `INV-marked` on the real repository. Method: repository fitness test.
  Artefact: `tests/github-compatibility-boundary.test.ts`. Evidence: red at
  `EP-M1` (inside `test.failing`, with the expected violations listed in
  `Validation and acceptance`), and green at `EP-M2` and `EP-M3`. Non-vacuity:
  the test also asserts that at least 60 modules were scanned, that the edge
  `src/simulation.ts → src/transitional/github/index.ts` was observed, that at
  least one transitional module imports `graphql-yoga`, and that at least 20
  transitional modules were checked for the marker. Seeded fault, run once in
  `EP-M2` and reverted: add
  `import type {ExtendedSimulationStore} from '../transitional/github/index.ts';`
  to `src/admin/routes.ts`. The test must fail and name
  `production-imports-transitional src/admin/routes.ts → src/transitional/github/index.ts`.
- Obligation: `INV-behaviour`. Method: the existing suites, moved without
  assertion changes, plus Git evidence. Evidence: the `make test` pass count
  equals the baseline plus the new tests and minus the deleted
  `schema.docs.graphql` case. `git diff -M100% --summary 889431f -- tests`
  lists each moved `.snap` as an exact rename, and `git status --porcelain`
  shows no untracked `.snap` files. The `startup-output.test.ts.snap` entries
  are unchanged.
- Obligation: `INV-surface`. Method: example tests. Artefacts: a new
  `tests/package-surface.test.ts`
  (`Object.keys(await import('../src/index.ts'))` sorted equals
  `['simulation']`) and an added assertion in the CommonJS case of
  `tests/startup-output.test.ts`. That case already runs `bun run build`. The
  added assertion checks that `Object.keys(require('../dist/index.cjs'))` equals
  `['simulation']`, and that a `POST /graphql` with
  `{"query":"{ __typename }"}` to the spawned built server returns HTTP 200.
  This proves that the moved schema assets resolve from the bundle
  (`AXIOM-dirname`, `D4`). Red: both fail before `EP-M4`. The first fails
  because of the five extra keys. The `/graphql` probe is expected to pass
  already and serves as a regression guard; if it fails, record a surprise.

### Formal verification decision

No model checker or prover is used (`D9`). The task introduces no business
rule, protocol, or concurrent state. Its only lemma, `L-deletable`, follows
from the definition of `production-imports-transitional` and
`composition-root-bypasses-seam` in a few lines. A LemmaScript proof of it
would mostly restate the definitions, which the task brief and the `execplans`
skill both reject. The realistic failure modes are in the adapter (missed
import forms or wrong roots) and in directory-prefix matching. A proof over the
pure model would not cover those; the scanner test, the table test, and the
non-vacuity assertions do. Property tests with an independent oracle and two
seeded mutations give proportionate rigour for the pure policy. No Verus
milestone exists, because the code base is TypeScript.

### Suggested BDD features

The repository has no BDD runner, and adding one is out of scope. The scenarios
below are proposed acceptance specifications. Each maps to a named `bun:test`
case. The proposed path is
`tests/features/github-compatibility-boundary.feature`, kept as documentation
only if the reviewer wants it; otherwise the scenarios remain in this plan.

```gherkin
Feature: Retained GitHub scaffolding is a quarantined transitional fixture
  # REQ-direction, REQ-marked -> EP-M1/EP-M2 -> tests/github-compatibility-boundary.test.ts
  Scenario: Production modules do not depend on the GitHub fixture
    Given the repository after EP-M2
    When the boundary fitness test scans src, tests, scripts, bin, example and root modules
    Then it reports no violations
    And it observed the edge from src/simulation.ts to src/transitional/github/index.ts

  Scenario: A new production dependency on the fixture is rejected
    Given src/admin/routes.ts imports a type from src/transitional/github/index.ts
    When the boundary fitness test runs
    Then it fails naming production-imports-transitional for src/admin/routes.ts

  Scenario: A look-alike directory is not mistaken for the fixture
    Given a module at src/transitional/githubx/a.ts
    When the policy classifies it
    Then it is a production module

  # REQ-behaviour -> EP-M2..EP-M4 -> tests/startup-output.test.ts, tests/transitional/github/*.test.ts
  Scenario: The baseline server still starts from the built package
    Given the package has been built with bun run build
    When node ./bin/start.cjs starts on a free port
    Then it prints the DigitalPuddle startup banner
    And GET /simulation returns 200
    And POST /graphql with query "{ __typename }" returns 200

  # REQ-surface -> EP-M4 -> tests/package-surface.test.ts
  Scenario: The package root no longer exports GitHub schemas
    When a consumer imports the package root
    Then the only run-time export is simulation
```

## Plan of work

Work in milestones `EP-M1` to `EP-M5`. Each milestone ends with the four
mandated gates passing and one or more commits. Before each move, run the
CodeGraph impact query (`codegraph_analyze_impact` on the moved file) and
`codegraph_find_related_tests`, so that no caller is missed. Use `git mv` for
every move. Fix import paths with targeted edits. After each milestone, record
the measured category counts in `Progress`.

### `EP-M1` boundary policy, scanner, and failing fitness test

Assigned: `REQ-direction`, `REQ-marked`, `GAP-no-guard`; decisions `D2`, `D3`,
and `D10`.

1. Red: write `tests/module-boundaries-policy.test.ts` with the table test
   and the property tests described in `Verification plan`. Run it. It fails
   because `tests/support/module-boundaries/policy.ts` does not exist.
2. Green: implement `tests/support/module-boundaries/policy.ts`, a pure
   module that imports nothing from `node:` and nothing from `typescript`. It
   exports the types `ModuleFacts`, `ImportFact`, `BoundaryPolicy`,
   `ModuleRole`, and `BoundaryViolation` (a discriminated union on `kind`), plus
   `classifyModule`, `isTransitional`, and `findBoundaryViolations`. Implement
   `tests/support/module-boundaries/github-compatibility-policy.ts` with the
   concrete `githubCompatibilityBoundaryPolicy` constants from
   `Abstract model`. Run the policy tests to green. Apply the two seeded
   mutations, observe the expected failures, and revert them.
3. Red: write `tests/module-boundaries-scan.test.ts`. It fails because
   `scan.ts` is missing.
4. Green: implement `tests/support/module-boundaries/scan.ts`.
   `scanRepositoryModules(rootDir, includeDirs, includeFiles)` walks the
   included directories, skipping `node_modules`, `dist`, `__generated__`,
   `__snapshots__`, and `.git`. It reads `*.ts`, `*.mts`, `*.cts`, `*.mjs`, and
   `*.cjs` files and calls `ts.preProcessFile(text, true, true)`. It resolves
   relative specifiers with `path.posix.normalize` to repository-relative
   paths, reduces bare specifiers to package names, drops `node:` built-ins,
   and extracts the leading `/** … */` block. A read failure raises an `Error`
   with `cause`. It also exports `listRepositoryFiles(rootDir, includeDirs)`
   for the asset-file rule used in `EP-M3`.
5. Red: write `tests/github-compatibility-boundary.test.ts`. It scans `src`,
   `tests`, `scripts`, `bin`, `example`, and the root modules, runs the policy,
   and expects `[]`, plus the non-vacuity assertions. Wrap the expectation in
   `test.failing` with a comment naming `EP-M2` as the flip point. Run it once
   without the marker and record the violation list in `Artefacts and notes`.
   The expected kinds are: `graphql-yoga`, `@graphql-tools/utils`, `graphql`,
   `assert-ts`, and `@faker-js/faker` imports in `src/graphql/**` and
   `src/store/**`; `@octokit/graphql` in `tests/graphql.test.ts`; asset names in
   `src/simulation.ts`, `src/utils.ts`, `src/graphql/handler.ts`,
   `src/rest/index.ts`, `tests/utils.test.ts`,
   `tests/overload-contracts.test-d.ts`, and `sync.ts`; and the non-vacuity
   failure for the missing seam edge. Then restore `test.failing`.
6. Refactor: keep every new file under 400 lines. Run the four gates.

End state: the policy and scanner are proven by tests. The repository test
documents the current violations and is held red by `test.failing`. No
production code has changed.

### `EP-M2` relocate GitHub source and tests behind the seam

Assigned: `REQ-split`, `REQ-behaviour`, `REQ-marked`, `GAP-mixed-dirs`,
`GAP-admin-edge`, `GAP-router-mix`; decisions `D1`, `D4`, `D5`, `D8`.

1. Add `src/package-root.ts`, exporting `packageRootDirectory` (computed once
   from `import.meta.dirname`) and `resolvePackagePath(...segments)`, with
   JSDoc and an example. Add a focused unit test in
   `tests/package-root.test.ts`, asserting that the root contains this
   repository's `package.json` with `name` `digitalpuddle`. Red first: the test
   fails before the module exists.
2. Move the GitHub source modules listed in `Context and orientation` with
   `git mv`, keeping sub-paths. Rename `src/utils.ts` to
   `src/transitional/github/schema-files.ts`. In `schema-files.ts`, resolve
   default schemas with `resolvePackagePath('schema', name)` for now (the
   assets move in `EP-M3`). Fix every relative import in the moved files.
3. Create `src/transitional/github/routes.ts`, exporting
   `registerGitHubCompatibilityRoutes(router, simulationStore)`. Move the
   `/graphql` mount, `oauthAuthorizationQuerySchema`, and both OAuth handlers
   out of `src/extend-api.ts` without changing their bodies.
4. Create the seam `src/transitional/github/index.ts`. It re-exports only what
   `src/simulation.ts` needs: `githubInitialStoreSchema`; the types
   `GitHubInitialStore`, `ExtendedSimulationStore`, and
   `GitHubExtendStoreInput`; `extendStore`; `openapi` (with the
   `api.github.com.json` default moved inside it as a defaulted parameter, so
   the asset name leaves `src/simulation.ts`);
   `registerGitHubCompatibilityRoutes`; and the `SchemaFile` type.
5. Edit `src/extend-api.ts`. Remove the GitHub imports and routes. Make
   `extendRouter` generic, `<Store>(extend, registerCompatibilityRoutes)`, and
   call `registerCompatibilityRoutes?.(router, simulationStore)` where
   `/graphql` used to be mounted. Edit `src/admin/routes.ts` to drop the store
   import and parameter. Edit `src/simulation.ts` to import only from
   `./transitional/github/index.ts` and to pass
   `registerGitHubCompatibilityRoutes` into `extendRouter`. Edit `src/index.ts`
   only for its `@file` text in this milestone.
6. Add the marker sentence to the `@file` block of every module under
   `src/transitional/github/`. Mark `codegen.ts` the same way.
7. Move the GitHub tests listed in `Context and orientation` with `git mv`,
   together with any `__snapshots__/*.snap` files. Rename
   `handlers-layout.test.ts` to `user-handlers.test.ts`, and move and rename
   its snapshot in the same commit. Split `base.test.ts` and `logging.test.ts`
   as described. Fix the import paths. Add the marker to each moved test's
   `@file` block.
8. Green: remove `test.failing` from the repository fitness test (except the
   asset-file rule, which is added in `EP-M3`). Run
   `bun test tests/github-compatibility-boundary.test.ts`, then run the
   seeded-fault drill and revert it.
9. Run `make check-fmt`, `make typecheck`, `make lint`, and `make test`.
   Compare the test count with the baseline. Check snapshot renames and
   untracked files as described in `Risks`.

End state: the source tree shows the split, the boundary is enforced, and
behaviour is unchanged.

### `EP-M3` relocate GitHub assets and tooling; delete unused artefacts

Assigned: `REQ-unused-removed`, `REQ-split`, `GAP-unused-assets`; decision `D6`.

1. Red: add the `github-asset-file-outside-transitional` rule to the policy
   (with property and table coverage) and to the repository test. Assert it with
   `test.failing`, because `schema/*.json` and `schema/*.graphql` still exist.
2. Record
   `sha256sum schema/api.github.com.json schema/schema.docs-enterprise.graphql`.
   Run `git mv` for both, and for `schema/README.md`, into
   `src/transitional/github/schema/`. Delete `schema/schema.docs.graphql` with
   `git rm`. Re-run `sha256sum` and compare.
3. Update `schema-files.ts` to resolve
   `resolvePackagePath('src', 'transitional', 'github', 'schema', name)`. Remove
   `schema.docs.graphql` from `schemaDefaults` and from the overloads. Delete
   the corresponding cases in `tests/transitional/github/schema-files.test.ts`
   and `tests/transitional/github/overload-contracts.test-d.ts`.
4. Update `codegen.ts`: set the schema path to
   `./src/transitional/github/schema/schema.docs-enterprise.graphql` and the
   output to `./src/transitional/github/__generated__/resolvers-types.ts`,
   keeping the mapper strings. Update the generated-type imports in
   `src/transitional/github/graphql/**`. Update `.oxlintrc.json`
   `ignorePatterns`, the `Makefile` `clean` target, and the `biome.json`
   override `includes` (disable formatting and linting for both moved schema
   files).
5. Delete `sync.ts` with `git rm`. Remove the `sync:schema:rest` script and
   the `schema` entry from `package.json` `files`. Remove `sync.ts` from
   `tsconfig.json` `include`. Rewrite the moved schema `README.md` as a short
   transitional notice that says which files remain, why, and when they go.
6. Green: remove `test.failing`, then run the focused tests and the four
   gates. Run `bun run build` once, and confirm that `npm pack --dry-run` lists
   `src/transitional/github/schema/api.github.com.json` and no `schema/`
   entries.

End state: every GitHub asset lives in the deletable directory, and unused
artefacts are gone.

### `EP-M4` narrow the package root and verify the bundle path

Assigned: `REQ-surface`, `REQ-behaviour`, `GAP-root-exports`; decision `D7`.

1. Red: add `tests/package-surface.test.ts` and the CommonJS-bundle assertions
   in `tests/startup-output.test.ts`. Both fail on the extra `github*Schema`
   keys.
2. Green: remove the schema re-exports from `src/index.ts`. Update its `@file`
   block and the JSDoc of `GitHubSimulatorArgs` and `InitialState` in
   `src/simulation.ts`, stating that the seed is the transitional GitHub
   fixture. Run the focused tests, then `make docs-check` and `make build`.
3. Run the four gates.

End state: the package root exposes only `simulation` at run time.

### `EP-M5` documentation, decisions, and roadmap closure

Assigned: `REQ-docs`. Delegate mechanical edits to the `scribe` agent with
precise instructions, and review the result.

1. `docs/digitalpuddle-technical-design.md` §16: add `transitional/github/`
   to the layout tree, annotated as a deletable fixture. Remove
   `handlers/user.ts` from the target tree. Rewrite the transitional paragraph
   (lines 755-765) to describe the seam, the single composition root, the
   boundary test, and the removal trigger.
2. `docs/adrs/adr-0005-transitional-simulacat-boundaries.md`: add a dated
   `## Amendments` entry. It records the split, the boundary rules, and the
   removal trigger: delete `src/transitional/github/`,
   `tests/transitional/github/`, and `codegen.ts`, the GitHub-only
   dependencies, and the seam edge in `src/simulation.ts`, in the change that
   makes the composition root stop needing the GitHub REST document for the
   startup gates, and no later than the first release.
3. `docs/adrs/adr-0008-oxlint-plugin-strategy.md`: add a dated amendment noting
   the generated-types path move and that the REST and GraphQL `null` rationale
   now applies to the transitional fixture.
4. `docs/developers-guide.md`: rewrite §1 "Repository shape" and the inherited
   subsections to use the new paths; update "GraphQL code generation"; add to
   §4 how the boundary test works and how to read its failure messages; and
   update §9 with the dependency rule, the seam, and where new GitHub-only
   needs must not go.
5. `docs/users-guide.md`: in "Current status", note that the GitHub routes are
   a transitional fixture. Retitle the OAuth and GraphQL sections as
   transitional GitHub compatibility fixture routes. Note that the package root
   exports only `simulation` and its argument types.
6. `docs/migration-from-simulacat-core.md`: under "Breaking changes", add the
   removal of the `github*Schema` root exports, `schema.docs.graphql`, and
   `sync:schema:rest`. Update "Transitional behaviour".
7. `docs/roadmap.md`: mark 1.2.3 `[x]`.
8. Run `make fmt`, `make markdownlint`, `make nixie`, then the four gates.
   Reconcile `Conformance basis`, complete `Outcomes & retrospective`, and set
   the status to `COMPLETE`.

## Milestones and plateaus

- `EP-M1`: the policy and scanner are proven, and the red repository test is
  recorded. Requirements: `REQ-direction` (guard only), `GAP-no-guard`.
  Acceptance: policy, scanner, and fitness tests run, the four gates pass, and
  the recorded violation list matches expectations. Conformance: requirements
  advanced but not yet satisfied; design followed; no production change; no
  interface, dependency, trust-boundary, or persisted-format change; trace
  links current. Recovery: revert the milestone commits; nothing else depends
  on them. Remaining gaps: every `GAP-*` except `GAP-no-guard`. Compatibility
  decision: none.
- `EP-M2`: source and tests split behind the seam. Requirements:
  `REQ-split` (code), `REQ-direction`, `REQ-marked`, `REQ-behaviour`.
  Acceptance: the boundary test passes; the test count equals the baseline plus
  the new tests; snapshots are exact renames; the seeded fault is rejected.
  Conformance: requirements satisfied for source; design §4 single assembly
  point followed; ADR 0005 holds; only the authorized internal signatures
  changed; no trust-boundary or persisted-format change; trace links current.
  Recovery: revert the milestone commits as a unit, because a partial move does
  not compile. Remaining gaps: `GAP-unused-assets`, `GAP-root-exports`, docs.
  Compatibility decision: none. The changed signatures are internal, and every
  caller changes in the same commit.
- `EP-M3`: assets confined and unused artefacts deleted. Requirements:
  `REQ-unused-removed`, `REQ-split` (assets). Acceptance: the asset-file rule
  passes; the hashes match; `make typecheck` regenerates from the new path; the
  build and pack listing are correct. Conformance: as for `EP-M2`, plus the
  authorized script and `files` removals. Recovery: revert the milestone
  commits; `EP-M2` remains a valid plateau. Remaining gaps: `GAP-root-exports`,
  docs. Compatibility decision: none (pre-1.0, unreleased).
- `EP-M4`: the package root is narrowed. Requirements: `REQ-surface`.
  Acceptance: the package-surface and bundle assertions pass; `make docs-check`
  and `make build` pass. Conformance: only the authorized export removal.
  Recovery: revert the commit. Remaining gaps: docs. Compatibility decision:
  none (pre-1.0, no external consumers, no release tag).
- `EP-M5`: documentation and closure. Requirements: `REQ-docs`. Acceptance:
  Markdown gates and the four gates pass; roadmap 1.2.3 is checked; ADR
  amendments are present. Recovery: revert the documentation commit. Remaining
  gaps: none for 1.2.3. The deletion of the fixture is owned by the ADR 0005
  removal trigger. Compatibility decision: none.

## Concrete steps

Working directory: the repository root of this worktree. Every gate runs with
`set -o pipefail` and tees output to
`/tmp/<gate>-digitalpuddle-1-2-3-split-retained-github-compatibility-scaffolding.out`.
Gates run sequentially and are never parallelized. Prefer delegating full gate
runs to the `scrutineer` agent and reading its cited logs.

```bash
set -o pipefail
BR=1-2-3-split-retained-github-compatibility-scaffolding
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-$BR.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-$BR.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-$BR.out
make test 2>&1 | tee /tmp/test-digitalpuddle-$BR.out
```

Focused red and green commands, by milestone:

```plaintext
EP-M1 red:   bun test tests/module-boundaries-policy.test.ts -> "Cannot find module ... policy.ts"
EP-M1 green: bun test tests/module-boundaries-policy.test.ts -> all pass (table rows plus properties)
EP-M1 red:   bun test tests/module-boundaries-scan.test.ts -> "Cannot find module ... scan.ts"
EP-M1 green: bun test tests/module-boundaries-scan.test.ts -> all pass
EP-M1 red:   bun test tests/github-compatibility-boundary.test.ts (marker removed temporarily)
             -> fails listing github-package-outside-transitional and github-asset-outside-transitional violations
EP-M1 held:  same command with test.failing -> passes (expected failure observed)
EP-M2 green: bun test tests/github-compatibility-boundary.test.ts -> pass; seeded fault -> fails naming src/admin/routes.ts
EP-M3 red:   asset-file rule under test.failing -> passes (expected failure); green after the moves
EP-M4 red:   bun test tests/package-surface.test.ts -> expected ['simulation'], received six keys
EP-M4 green: bun test tests/package-surface.test.ts tests/startup-output.test.ts -> pass
```

Snapshot and rename checks after `EP-M2` and `EP-M3`:

```bash
git status --porcelain | grep '\.snap$' && echo 'UNEXPECTED NEW SNAPSHOT' || true
git diff -M100% --summary 889431f -- tests src | grep rename
sha256sum src/transitional/github/schema/api.github.com.json \
  src/transitional/github/schema/schema.docs-enterprise.graphql
```

Baseline results (unmodified tree at `889431f`): see `Artefacts and notes`.

## Validation and acceptance

Acceptance is behavioural:

- `make test` passes. The new test files are
  `tests/module-boundaries-policy.test.ts`,
  `tests/module-boundaries-scan.test.ts`,
  `tests/github-compatibility-boundary.test.ts`, `tests/package-root.test.ts`,
  `tests/package-surface.test.ts`, and
  `tests/transitional/github/oauth-routes.test.ts` (split out of
  `base.test.ts`), plus the split
  `tests/transitional/github/rest-error-logging.test.ts`. Each new test fails
  before its implementation step and passes after it, as listed in
  `Concrete steps`.
- Adding the seeded production-to-transitional import makes `make test` fail
  with a message naming the edge. Removing it restores the pass.
- Starting the built package (`bun run build`, then
  `PORT=3300 node ./bin/start.cjs`) prints
  `DigitalPuddle simulation server started at http://localhost:3300`.
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/simulation`
  prints `200`. A `POST /graphql` with the JSON body
  `{"query":"{ __typename }"}` returns `{"data":{"__typename":"Query"}}`.
- `bun -e "import('./src/index.ts').then(m => console.log(Object.keys(m)))"`
  prints `[ "simulation" ]`.
- `ls schema` fails with "No such file or directory", and
  `ls src/transitional/github/schema` lists `README.md`, `api.github.com.json`,
  and `schema.docs-enterprise.graphql`.

Quality criteria:

- Tests: `make test` passes, with no untracked `.snap` files.
- Verification: `L-sound`, `L-complete`, `L-deletable`,
  `L-order-independent`, `L-prefix-boundary`, and `L-scanner-complete` are
  discharged by their named tests. The two policy mutations and the repository
  seeded fault have each been observed to fail and then reverted.
- Lint and type-check: `make check-fmt`, `make typecheck`, and `make lint`
  pass; `make docs-check` and `make build` pass at `EP-M4` and `EP-M5`.
- Markdown: `make markdownlint` and `make nixie` pass at `EP-M5`.
- Security: no new dependency; `bun run audit` is unchanged.

## Idempotence and recovery

Every step is a Git-tracked edit or move and can be repeated. `git mv` fails
harmlessly if the target already exists, in which case inspect and continue. A
half-finished `EP-M2` does not compile. Recover with
`git restore --staged --worktree .` back to the last milestone commit rather
than fixing it forwards piecemeal. Seeded faults and policy mutations are
applied in the working tree only and are reverted before staging. Confirm with
`git diff`. The scanner test writes only to an `fs.mkdtemp` directory, which it
removes. Generated GraphQL types are gitignored, and `make clean` removes them
from the new path.

## Artefacts and notes

Planning-time probe of `ts.preProcessFile` (TypeScript 6.0.3, base `889431f`).
The input contained `import type`, `export … from`, a side-effect import, a
literal dynamic import, a commented import, and an import inside a string:

```plaintext
6.0.3 function
["./a.ts","./b.ts","./c.ts","./d.ts"]
```

Planning-time probe of `test.failing` (Bun 1.4.4): a `test.failing` case whose
assertion fails is reported as `1 pass`.

Baseline gate results at `889431f` (unmodified tree, 2026-11-15):

```plaintext
make check-fmt  pass  (Biome checked 93 files; mdtablefix 26 files unchanged)
make typecheck  pass  (graphql-codegen then tsc --noEmit, 7 s)
make lint       pass  (Biome 7 infos, pre-existing; interrogate 100.0%; oxlint clean)
make test       pass  (272 pass, 0 fail, 13 snapshots, 4840 expect() calls, 25 files, 53 s)
```

Pre-existing, non-blocking Biome diagnostics: the `biome.json` schema version
(2.4.12) does not match the 2.5.15 CLI, and `linter.recommended` is deprecated.
There are five `useLiteralKeys` infos, two of them in
`tests/logging.test.ts:427-431`, which moves in `EP-M2`. These are not
regressions and are left untouched.

## Interfaces and dependencies

New test-support modules (not shipped):

```ts
// tests/support/module-boundaries/policy.ts
export type ImportFact =
  | {readonly kind: 'local'; readonly path: string}
  | {readonly kind: 'package'; readonly name: string};
export type ModuleFacts = {
  readonly path: string;
  readonly imports: readonly ImportFact[];
  readonly text: string;
  readonly fileHeader: string;
};
export type BoundaryPolicy = {
  readonly transitionalRoots: readonly string[]; // each ends with '/'
  readonly transitionalFiles: readonly string[];
  readonly compositionRoots: readonly string[];
  readonly seams: readonly string[];
  readonly boundaryTooling: readonly string[];
  readonly githubOnlyPackages: readonly string[];
  readonly githubAssetNames: readonly string[];
  readonly marker: string;
};
export type ModuleRole = 'transitional-seam' | 'transitional' | 'composition-root' | 'boundary-tooling' | 'production';
export type BoundaryViolation =
  | {readonly kind: 'production-imports-transitional'; readonly from: string; readonly to: string}
  | {readonly kind: 'composition-root-bypasses-seam'; readonly from: string; readonly to: string}
  | {readonly kind: 'github-package-outside-transitional'; readonly from: string; readonly packageName: string}
  | {readonly kind: 'github-asset-outside-transitional'; readonly from: string; readonly asset: string}
  | {readonly kind: 'github-asset-file-outside-transitional'; readonly path: string}
  | {readonly kind: 'transitional-module-unmarked'; readonly path: string};
export const isTransitional: (path: string, policy: BoundaryPolicy) => boolean;
export const classifyModule: (path: string, policy: BoundaryPolicy) => ModuleRole;
export const findBoundaryViolations: (
  modules: readonly ModuleFacts[],
  repositoryFiles: readonly string[],
  policy: BoundaryPolicy
) => readonly BoundaryViolation[];

// tests/support/module-boundaries/scan.ts
export const scanRepositoryModules: (
  rootDir: string,
  includeDirs: readonly string[],
  includeFiles: readonly string[]
) => readonly ModuleFacts[];
export const listRepositoryFiles: (rootDir: string, includeDirs: readonly string[]) => readonly string[];
```

Production signatures after the change:

```ts
// src/package-root.ts
export const packageRootDirectory: string;
export const resolvePackagePath: (...segments: readonly string[]) => string;

// src/extend-api.ts
export const extendRouter: <Store>(
  extend: ((router: FoundationRouter, simulationStore: Store) => void) | undefined,
  registerCompatibilityRoutes: ((router: FoundationRouter, simulationStore: Store) => void) | undefined
) => (router: FoundationRouter, simulationStore: Store) => void;

// src/admin/routes.ts
export type DigitalPuddleAdminRouter = (router: FoundationRouter) => void;

// src/transitional/github/routes.ts
export const registerGitHubCompatibilityRoutes: (
  router: FoundationRouter,
  simulationStore: ExtendedSimulationStore
) => void;

// src/transitional/github/rest/index.ts
export const openapi: (
  initialState: GitHubInitialStore | undefined,
  apiRoot: string,
  apiSchema: SchemaFile | string | undefined, // undefined selects api.github.com.json
  openapiHandlers: ((simulationStore: ExtendedSimulationStore) => SimulationHandlers) | undefined
) => OpenApiConfig[];
```

Reuse policy: the policy module owns classification. The scanner owns
filesystem access and specifier resolution. No other test may re-implement
either. `src/package-root.ts` owns package-root resolution. Transitional code
may import production modules, such as `src/openapi/artifact.ts`,
`src/handlers/types.ts`, and `src/package-root.ts`, but production modules must
never import transitional code. New GitHub-only needs go only into
`src/transitional/github/`; if DigitalPuddle needs a similar helper, it is
designed afresh in its production home.

Dependencies: no additions, removals, or range changes. `typescript` (`^6.0.3`,
development) supplies `preProcessFile`. `fast-check` (`^4.10.2`, development)
supplies the property tests. The GitHub-only packages remain installed, and the
boundary test confines their use. Removing them belongs to the fixture deletion.

## Revision note

- 2026-11-15: Initial draft from read-only reconnaissance at `889431f`.
  Awaiting the expert design review, the baseline gate results, and user
  approval.
