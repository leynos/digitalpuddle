# Introduce the target source layout incrementally

This ExecPlan (execution plan) is a living document. The sections
`Constraints`, `Tolerances`, `Risks`, `Progress`, `Surprises & discoveries`,
`Decision log`, and `Outcomes & retrospective` must be kept up to date as work
proceeds.

Status: COMPLETE

## Purpose / big picture

Roadmap task 1.2.2 makes the imported Simulacat Core baseline present as a
DigitalPuddle source tree without breaking the working Simulacrum substrate.
After this work is implemented, new DigitalOcean code should have obvious homes
under `src/simulation.ts`, `src/openapi/`, `src/store/`, `src/handlers/`,
`src/worker/`, `src/engines/`, `src/journal/`, `src/admin/`,
`src/scenarios/`, and `src/cli/`.

This plan does not authorize implementation until it is explicitly approved.
The first observable outcome of the implementation is structural: a contributor
can add the next DigitalOcean route, store slice, worker transition, engine
adapter, admin endpoint, journal query, scenario loader, or CLI command in the
target directory without reopening the package boundary question. Existing
inherited Simulacat tests must still pass during the transition.

## Constraints

- Do not replace Simulacrum as the HTTP and routing backplane. ADR 0001 keeps
  `@simulacrum/foundation-simulator` as the substrate for this phase.
- Do not change the public package entry point contract in `package.json`
  without explicit approval. `src/index.ts` must remain a compatibility facade
  until the package export strategy is deliberately changed.
- Do not remove inherited GitHub/Simulacat tests in this task. Roadmap task
  1.2.3 owns splitting retained GitHub compatibility scaffolding from
  production DigitalPuddle surfaces.
- Do not introduce new runtime behaviour solely to justify the layout. The work
  should move or scaffold boundaries, not implement DOKS, Droplets, Spaces,
  worker transitions, persistence backends, or journal storage.
- New DigitalPuddle modules must follow the transitional boundary rules in
  ADR 0005 and `docs/developers-guide.md`: keep domain state separate from HTTP
  serialization, translate headers explicitly, map HTTP status at handler
  boundaries, and keep engine side effects behind worker-owned interfaces.
- Capability policy code remains pure. It must not import Express,
  Simulacrum request objects, filesystem I/O, or engine adapters, per ADR 0007.
- No new external dependency may be added for this task without approval.
  Architecture tooling such as `dependency-cruiser` can be proposed later but
  must not be added as part of the first implementation unless approved.
- Documentation must use en-GB Oxford spelling and the Markdown rules in
  `docs/documentation-style-guide.md`.
- The plan itself is pre-implementation. Stop after drafting, validating,
  committing, pushing, and opening the draft PR for this execplan.

If satisfying the objective requires violating a constraint, stop, record the
conflict in `Decision log`, and ask for direction.

## Tolerances (exception triggers)

- Scope: if implementation requires more than 35 source/test files or more
  than 1,200 net lines of source/test change, stop after the current safe
  commit and ask whether to split the task.
- Interface: if a public exported function signature, package export, CLI
  invocation, or route shape must change, stop and present options.
- Dependencies: if any new npm package, system package, generated toolchain, or
  service is needed, stop before adding it.
- Behaviour: if a layout move changes runtime behaviour outside the intended
  compatibility facade, stop and either add a targeted test first or ask for a
  narrower migration.
- File size: if a moved or new TypeScript file would exceed 400 lines, split it
  by feature before proceeding.
- Iterations: if `make check-fmt`, `make lint`, `make typecheck`, or
  `make test` still fails after two focused attempts for the same milestone,
  stop and document the remaining failure.
- CodeRabbit: if `coderabbit review --agent` reports an unresolved concern
  after a major milestone, address it before the next milestone. If CodeRabbit
  is unavailable or unauthenticated, stop and ask whether to proceed without
  that review.
- Ambiguity: if multiple valid layouts would affect future public API or
  package exports differently, stop and present the trade-offs.

## Risks

- Risk: `src/rest/index.ts` is a large, coupled adapter that mixes route table
  assembly, HTTP translation, store access, and GitHub-specific behaviour.
  Severity: high.
  Likelihood: high.
  Mitigation: keep the first handler split behind compatibility exports and
  move one cohesive group at a time with tests passing after each move.
- Risk: tests import internals directly, so file moves can create broad
  breakage even when behaviour is unchanged.
  Severity: medium.
  Likelihood: high.
  Mitigation: introduce facades and barrel exports before changing import
  sites; update tests only when the new path is the intended contract.
- Risk: placeholder `worker`, `engines`, `journal`, `scenarios`, or `cli`
  modules can become decorative rather than useful.
  Severity: medium.
  Likelihood: medium.
  Mitigation: add only documented interfaces, no-op adapters, or index files
  that are immediately referenced by composition code or developer docs.
- Risk: moving simulation assembly can break the CommonJS CLI path because
  `tsdown.config.ts` builds from `src/index.ts` and `bin/start.cjs` requires
  `dist/index.cjs`.
  Severity: high.
  Likelihood: medium.
  Mitigation: keep `src/index.ts` as the build entry and re-export from the new
  `src/simulation.ts` until a later package-export change is approved.
- Risk: DigitalOcean target modules could absorb inherited GitHub fixtures too
  early.
  Severity: medium.
  Likelihood: medium.
  Mitigation: mark retained GitHub code as transitional and leave deep
  isolation/removal to roadmap task 1.2.3.
- Risk: architecture checks could be over-specified before the module graph is
  stable.
  Severity: low.
  Likelihood: medium.
  Mitigation: rely on tests, TypeScript, review, and CodeRabbit in this task;
  record future dependency-rule tooling as an option, not a requirement.

## Progress

- [x] (2026-05-25T01:05:42Z) Created the `leta` workspace for this repository.
- [x] (2026-05-25T01:05:42Z) Renamed the local branch to
  `1-2-2-introduce-target-source-layout-incrementally`.
- [x] (2026-05-25T01:05:42Z) Collected roadmap, technical design, ADR,
  developer guide, source-layout, and package-script context.
- [x] (2026-05-25T01:05:42Z) Used a Wyvern agent team for read-only planning
  review of requirements, current source layout, and documentation gates.
- [x] (2026-05-25T01:05:42Z) Used Firecrawl to check prior-art/tooling context
  for `dependency-cruiser` and LemmaScript.
- [x] (2026-06-01T22:01:29Z) Received explicit implementation approval from
  the user and started executing the approved plan.
- [x] (2026-06-01T22:18:00Z) Completed Milestone 1: simulation and
  compatibility facades.
- [x] (2026-06-01T22:33:00Z) Ran CodeRabbit review for Milestone 1; it
  completed with 0 findings.
- [x] (2026-06-01T22:50:00Z) Completed Milestone 2: OpenAPI, admin, and
  unsupported handler ownership.
- [x] (2026-06-01T22:58:00Z) Ran CodeRabbit review for Milestone 2; it
  completed with 0 findings.
- [x] (2026-06-01T23:10:00Z) Completed Milestone 3: incremental user handler
  extraction.
- [x] (2026-06-01T23:24:00Z) Ran CodeRabbit review for Milestone 3; it
  completed with 0 findings.
- [x] (2026-06-01T23:38:00Z) Completed Milestone 4: worker, engine, journal,
  scenario, and CLI skeletal interfaces.
- [x] (2026-06-01T23:49:00Z) Ran CodeRabbit review for Milestone 4; it
  completed with 0 findings.
- [x] (2026-06-02T00:07:00Z) Completed Milestone 5 documentation, roadmap,
  and final deterministic gates.
- [x] (2026-06-02T00:21:00Z) Ran final CodeRabbit review; it completed with
  0 findings.
- [x] (2026-06-02T00:24:00Z) Pushed the branch and updated draft PR #7 with
  the implementation summary and validation results.

## Surprises & discoveries

- Observation: `src/worker/`, `src/engines/`, `src/journal/`,
  `src/scenarios/`, and `src/cli/` do not exist yet.
  Evidence: `leta files src` shows only `admin`, `graphql`, `handlers`,
  `openapi`, `rest`, `store`, and top-level modules.
  Impact: the implementation must create meaningful shells without pretending
  later runtime features already exist.
- Observation: the repository already has `src/openapi/`, `src/admin/`,
  `src/handlers/unsupported.ts`, and `src/store/`.
  Evidence: `leta files src` lists capability, projection, admin capability,
  unsupported handler, and store modules.
  Impact: the task should not create parallel directories for those areas; it
  should refine ownership and exports inside the existing directories.
- Observation: `tsdown.config.ts` still has `entry: './src/index.ts'`.
  Evidence: reading `tsdown.config.ts` shows the single build entry.
  Impact: `src/index.ts` must remain the package-facing facade during the first
  layout migration.
- Observation: Firecrawl found `dependency-cruiser` as prior art for
  JavaScript and TypeScript dependency-rule validation, and LemmaScript as a
  tech-preview TypeScript verification toolchain.
  Evidence: Firecrawl summaries of
  `https://github.com/sverweij/dependency-cruiser` and
  `https://github.com/midspiral/LemmaScript`.
  Impact: dependency rules can be considered for a later architecture fitness
  task; LemmaScript should be reserved for introduced business invariants, not
  used for this structural migration unless implementation adds such an
  invariant.
- Observation: Milestone 1 can move the simulation assembly without changing
  package exports because `src/index.ts` can remain as the `tsdown` entry and
  re-export `src/simulation.ts`.
  Evidence: `make check-fmt`, `make lint`, `make typecheck`, and `make test`
  passed after adding `tests/simulation-layout.test.ts`; the full test suite
  reported 139 passing tests.
  Impact: future internal DigitalOcean code can import simulation assembly
  from `src/simulation.ts`, while published consumers continue to import from
  the package facade.
- Observation: repo-wide `make markdownlint` still fails on pre-existing
  MD013 line-length issues in
  `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`.
  Evidence: targeted
  `bunx markdownlint-cli2 docs/execplans/1-2-2-introduce-target-source-layout-incrementally.md`
  passed with 0 errors, and `make nixie` passed.
  Impact: this task should keep touched Markdown clean and continue recording
  the inherited repo-wide Markdown lint debt separately unless directed to fix
  that large document.
- Observation: CodeRabbit's Milestone 1 review took several minutes after
  reporting tool completion but returned successfully.
  Evidence: `coderabbit review --agent` ended with
  `{"type":"complete","status":"review_completed","findings":0}`.
  Impact: no Milestone 1 review concerns need clearing before proceeding to
  OpenAPI, admin, and unsupported handler ownership.
- Observation: `FoundationExtendRouter` from Simulacrum is too generic for the
  repository's `ExtendedSimulationStore` when used as the direct type of the
  admin route extender.
  Evidence: the first Milestone 2 `make typecheck` run rejected
  `extendDigitalPuddleAdminRoutes` because the generic Foundation store lacked
  the extended GitHub state slices.
  Impact: admin route ownership needs a local `DigitalPuddleAdminRouter` type
  that accepts `ExtendedSimulationStore` while still using the Foundation
  router type.
- Observation: OpenAPI barrel exports must mirror the existing capability and
  projection API names exactly.
  Evidence: typecheck rejected guessed names such as `isCapability`,
  `operationKeySchema`, and `UnsupportedOperationLookupEntry`.
  Impact: `src/openapi/index.ts` should re-export the current policy API
  instead of adding aliases during this layout task.
- Observation: CodeRabbit accepted the Milestone 2 ownership move without
  findings.
  Evidence: `coderabbit review --agent` ended with
  `{"type":"complete","status":"review_completed","findings":0}`.
  Impact: the plan can proceed to incremental handler extraction.
- Observation: the authenticated user and membership operations are the
  smallest cohesive handler group in `src/rest/index.ts` with dedicated
  behavioural coverage.
  Evidence: `tests/user.test.ts` already covers unauthenticated `/user`,
  unauthenticated `/user/memberships/orgs`, and authenticated membership
  filtering. After moving those handlers to `src/handlers/user.ts`, the full
  test suite reported 142 passing tests.
  Impact: `src/handlers/` now owns a real extracted handler group while the
  inherited REST adapter keeps composing the compatibility map.
- Observation: CodeRabbit accepted the Milestone 3 handler extraction without
  findings.
  Evidence: `coderabbit review --agent` ended with
  `{"type":"complete","status":"review_completed","findings":0}`.
  Impact: the plan can proceed to skeletal runtime module homes.
- Observation: the runtime skeleton contracts should allow synchronous or
  asynchronous implementations.
  Evidence: the first `make test` run for Milestone 4 failed because the new
  tests used `.resolves` directly on `RequestJournal.append(...)` and
  `CliCommand.run(...)`, but those contracts intentionally return
  `void | Promise<void>` and `CliCommandResult | Promise<CliCommandResult>`.
  Impact: tests now wrap those calls in `Promise.resolve(...)`, preserving
  synchronous no-op adapters while still proving async-compatible call sites.
- Observation: Milestone 4 introduces typed homes but no new business
  invariant.
  Evidence: `src/worker/index.ts`, `src/engines/index.ts`,
  `src/journal/index.ts`, `src/scenarios/index.ts`, and `src/cli/index.ts`
  contain narrow contracts and no-op factories only; the full test suite
  reported 146 passing tests after the skeletons were added.
  Impact: no `fast-check` property test or LemmaScript proof is required for
  this milestone.
- Observation: CodeRabbit accepted the Milestone 4 runtime skeletons without
  findings.
  Evidence: `coderabbit review --agent` ended with
  `{"type":"complete","status":"review_completed","findings":0}`.
  Impact: the plan can proceed to documentation, roadmap, final gates, push,
  and PR update.
- Observation: the source-layout migration changes internal module ownership
  only.
  Evidence: `docs/developers-guide.md`,
  `docs/digitalpuddle-technical-design.md`, and `docs/roadmap.md` needed
  updates; `docs/users-guide.md` did not because no route, CLI, capability
  state, or user-visible behaviour changed.
  Impact: users' guide changes are not required for this roadmap item.
- Observation: final deterministic gates passed after documentation closeout.
  Evidence: `make check-fmt`, `make lint`, `make typecheck`, and `make test`
  passed; `make test` reported 146 passing tests across 18 files. `bun fmt`,
  touched-file Markdown lint, and `make nixie` also passed.
  Impact: the implementation is ready for the final CodeRabbit checkpoint and
  PR update.
- Observation: repo-wide `make markdownlint` remains blocked by the inherited
  Simulacrum guidance document.
  Evidence: the final repo-wide run still reports 77 MD013 line-length errors
  only in
  `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`,
  while the four touched Markdown files pass targeted `markdownlint-cli2`.
  Impact: this task leaves that pre-existing Markdown debt unchanged and
  reports it as a validation caveat.
- Observation: the final CodeRabbit review completed without concerns.
  Evidence: `coderabbit review --agent` ended with
  `{"type":"complete","status":"review_completed","findings":0}`.
  Impact: the branch is ready to push and the PR can be updated for
  implementation review.
- Observation: draft PR #7 now describes the completed implementation rather
  than only the original execplan.
  Evidence: `gh pr edit 7 --body-file ...` returned
  `https://github.com/leynos/digitalpuddle/pull/7`.
  Impact: reviewers can use the PR body as the implementation review guide.

## Decision log

- Decision: keep this execplan as a pre-implementation document and stop for
  approval before source moves.
  Rationale: the user explicitly stated that the plan must be approved before
  implementation.
  Date/Author: 2026-05-25T01:05:42Z / Codex.
- Decision: use compatibility facades instead of a big-bang rename.
  Rationale: roadmap task 1.2.2 requires inherited Simulacat tests to keep
  passing during the transition, and task 1.2.3 owns later GitHub scaffolding
  isolation.
  Date/Author: 2026-05-25T01:05:42Z / Codex.
- Decision: do not add `dependency-cruiser` in the initial implementation.
  Rationale: it is relevant prior art for dependency rules, but this roadmap
  item prohibits unnecessary dependency churn and existing gates can prove the
  incremental migration.
  Date/Author: 2026-05-25T01:05:42Z / Codex.
- Decision: do not require LemmaScript proof for the layout migration itself.
  Rationale: the task introduces module boundaries, not a new business axiom or
  state-transition invariant. If implementation later adds a substantive
  invariant, the proof requirement must be revisited.
  Date/Author: 2026-05-25T01:05:42Z / Codex.
- Decision: implement Milestone 1 as an internal source move plus facade rather
  than changing `package.json`, `tsdown.config.ts`, or the build entry.
  Rationale: the approved plan requires the public package entry point to
  remain stable while the target `src/simulation.ts` assembly point appears.
  Date/Author: 2026-06-01T22:18:00Z / Codex.
- Decision: move private capability route registration to
  `src/admin/routes.ts` and keep `src/extend-api.ts` as the compatibility
  composition facade.
  Rationale: this gives admin routes an owned module without changing
  `/_digitalpuddle/capabilities`, health, GraphQL, or OAuth test behaviour.
  Date/Author: 2026-06-01T22:50:00Z / Codex.
- Decision: add `src/openapi/index.ts` as an internal barrel over existing
  capability policy and projection exports.
  Rationale: future DigitalOcean contract work now has a target OpenAPI module
  boundary without adding runtime behaviour or changing package exports.
  Date/Author: 2026-06-01T22:50:00Z / Codex.
- Decision: extract only user and membership handlers in Milestone 3.
  Rationale: this keeps the migration incremental, avoids repository/blob
  utility churn, and uses existing behavioural tests as the runtime proof.
  Date/Author: 2026-06-01T23:10:00Z / Codex.
- Decision: add no-op factories only where they make the future port shape
  executable without adding side effects.
  Rationale: `createWorkerRuntime`, `createNoopRequestJournal`, and
  `createEmptyScenarioRegistry` are testable composition targets, while the
  engine and CLI modules expose contracts without implementing future runtime
  behaviour.
  Date/Author: 2026-06-01T23:38:00Z / Codex.
- Decision: document the implemented layout as a transitional state rather
  than replacing the target repository layout in the technical design.
  Rationale: the target design still describes the intended final runtime
  architecture, while this roadmap item only establishes incremental homes and
  compatibility facades.
  Date/Author: 2026-06-01T23:56:00Z / Codex.

## Outcomes & retrospective

Implemented the target source layout incrementally while preserving the
package-facing `src/index.ts` facade and inherited Simulacat behaviour. New
internal homes now exist for simulation assembly, OpenAPI exports, admin
routes, extracted user handlers, worker contracts, engine contracts, request
journalling, scenario registration, and CLI command contracts. The roadmap item
1.2.2 is marked done.

Validation passed for `make check-fmt`, `make lint`, `make typecheck`, and
`make test`. The final test run reported 146 passing tests across 18 files.
`bun fmt`, `make nixie`, and targeted Markdown lint for touched documentation
also passed. Repo-wide `make markdownlint` still fails on pre-existing MD013
line-length findings in
`docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`;
this task did not modify that inherited document. CodeRabbit reviews after
Milestones 1, 2, 3, 4, and final closeout all completed with 0 findings.

## Context and orientation

The repository is a TypeScript package named `digitalpuddle`. It is adapted
from Simulacat Core and currently uses Simulacrum as the HTTP backplane.
`package.json` publishes `dist/index.mjs` and `dist/index.cjs`, with
development imports routed through `src/index.ts`. `tsdown.config.ts` also
builds from `src/index.ts`.

The current source tree has these relevant areas:

- `src/index.ts` defines the current `simulation(...)` assembly function and
  wires the Simulacrum APIs.
- `src/extend-api.ts` registers private extension routes, including the
  current `/_digitalpuddle/capabilities` route.
- `src/openapi/capabilities.ts` defines the capability vocabulary, operation
  keys, and seed manifest.
- `src/openapi/projections.ts` derives matrices, documentation metadata, and
  unsupported-operation lookup data.
- `src/handlers/unsupported.ts` builds DigitalOcean-shaped unsupported-route
  responses.
- `src/rest/index.ts` contains the inherited monolithic REST operation map.
- `src/store/index.ts`, `src/store/entities.ts`, and
  `src/store/entities/*` contain inherited GitHub-oriented store code.
- `src/graphql/*` contains inherited GraphQL compatibility code that remains
  transitional and is not the main target for this task.
- `bin/start.cjs` is the CommonJS CLI shim that expects the built CJS output.

The target layout is prescribed by
`docs/digitalpuddle-technical-design.md#16-repository-layout` and summarized in
`docs/developers-guide.md#1-repository-shape`. The important target areas are
assembly (`src/simulation.ts`), contract metadata (`src/openapi/`), state
(`src/store/`), public adapters (`src/handlers/`), asynchronous transition
logic (`src/worker/`), external substrate adapters (`src/engines/`), request
journalling (`src/journal/`), private controls (`src/admin/`), deterministic
fixtures (`src/scenarios/`), and command-line entry points (`src/cli/`).

The architectural intent is hexagonal in the pragmatic sense: domain and
policy logic should not depend on HTTP, CLI, engine adapters, filesystem I/O,
or Simulacrum request objects. Ports are the narrow interfaces owned by the
inner policy/application modules, and adapters translate HTTP, CLI, engine, or
storage concerns at the edge. This plan uses that boundary rule to protect the
layout; it does not transplant an abstract directory pattern that conflicts
with the existing repository.

## Plan of work

Implementation must proceed only after explicit approval.

Milestone 1 creates the simulation assembly boundary. Add
`src/simulation.ts` with the current `simulation(...)` implementation moved
from `src/index.ts`. Keep `src/index.ts` as the package-facing compatibility
facade, re-exporting the public types and functions that existing tests and
consumers use. Preserve `tsdown.config.ts` as the build entry unless a
separate approved package-export decision changes it. Add or adjust tests only
to prove that importing from `src/index.ts` still works and that the new
`src/simulation.ts` entry can be imported by future internal code.

Milestone 2 clarifies OpenAPI and admin ownership. Keep capability policy in
`src/openapi/capabilities.ts` and projections in `src/openapi/projections.ts`.
Add small ownership modules only where they remove ambiguity, such as
`src/openapi/registry.ts` or `src/openapi/operations.ts`, if they can be
populated from existing capability/projection logic without inventing the
future pinned OpenAPI artefact. Move admin route registration toward
`src/admin/routes.ts` and keep `src/extend-api.ts` as a compatibility facade.
The `/_digitalpuddle/capabilities` behaviour and tests must remain unchanged.

Milestone 3 extracts handlers incrementally from the monolithic REST adapter.
Start with the smallest cohesive handler group that can move without changing
observable behaviour, likely unsupported-response wiring or a read-only route
group. Preserve the existing `SimulationHandlers` adapter shape and keep
`src/rest/index.ts` exporting the compatibility map while implementation
details move under `src/handlers/`. Add focused `bun:test` coverage for any
changed import path, route table assembly, or unsupported response path. Do not
attempt to complete the whole GitHub-to-DigitalOcean split here; that belongs
to task 1.2.3.

Milestone 4 creates meaningful skeletal homes for future runtime modules.
Introduce `src/worker/`, `src/engines/`, `src/journal/`, `src/scenarios/`, and
`src/cli/` only with interfaces, no-op adapters, index modules, or documented
placeholders that future roadmap tasks can use. Do not wire public handlers to
real engine side effects. If a skeleton introduces an invariant over inputs,
states, orderings, or transitions, add a `fast-check` property test. If a
substantive business axiom is introduced, stop and decide whether LemmaScript
proof is required before proceeding.

Milestone 5 updates documentation and closes the implementation. Update
`docs/developers-guide.md` for any new internal conventions, component
ownership, or migration rules. Update `docs/users-guide.md` only if public
behaviour, route visibility, capability states, or CLI behaviour changes.
Update `docs/digitalpuddle-technical-design.md` if the target layout or a
boundary decision changes. Add or update an ADR only for a substantive boundary
decision that is not already covered by ADR 0001, ADR 0002, ADR 0005, or
ADR 0007. After implementation is complete and approved gates pass, mark
roadmap item 1.2.2 done in `docs/roadmap.md`.

Each milestone ends with formatting, linting, typechecking, tests, a commit,
and then CodeRabbit review before moving on to the next major milestone.

## Concrete steps

Run all commands from the repository root:

```bash
pwd
```

Expected output ends with:

```plaintext
/home/leynos/.lody/repos/github---leynos---digitalpuddle/worktrees/f3e971f6-6558-4cd2-a380-89ddce509231
```

Before implementing, confirm the plan is approved and the branch is correct:

```bash
git branch --show-current
```

Expected output:

```plaintext
1-2-2-introduce-target-source-layout-incrementally
```

Use `leta` for code navigation before each source move:

```bash
leta files src | head -n 240
leta grep "simulation|extendRouter|toUnsupportedOperationResponse" -k function,method,constant,variable --head 80
```

For each approved milestone, first create the red or characterisation tests
that prove the intended behaviour. For pure moves, this can be a compatibility
test that fails when the old public import no longer re-exports the moved
module. Then make the smallest source move, run the focused test, and only then
run the full gates.

Use the project gates sequentially and log output to `/tmp`:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-${BRANCH}.out
make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

When Markdown changes are part of the milestone, also run:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
```

After the full deterministic gates pass for a milestone, commit using a
file-based commit message:

```bash
git status --short
git diff --cached
git diff
COMMIT_MSG_DIR=$(mktemp -d)
$EDITOR "$COMMIT_MSG_DIR/COMMIT_MSG.md"
git commit -F "$COMMIT_MSG_DIR/COMMIT_MSG.md"
rm -rf "$COMMIT_MSG_DIR"
```

Then request CodeRabbit review:

```bash
coderabbit review --agent
```

Clear all CodeRabbit concerns before proceeding to the next milestone.

## Validation and acceptance

The implementation is accepted when all of the following are true:

- `src/simulation.ts` exists and `src/index.ts` remains a stable package-facing
  facade.
- `src/openapi/`, `src/store/`, `src/handlers/`, `src/worker/`,
  `src/engines/`, `src/journal/`, `src/admin/`, `src/scenarios/`, and
  `src/cli/` are present with clear ownership and no misleading unused
  abstractions.
- New DigitalOcean work can land in the target directories without importing
  through inherited `src/rest` or `src/graphql` modules by default.
- Inherited Simulacat tests still pass.
- Any changed observable behaviour has `bun:test` coverage for happy paths,
  unhappy paths, and relevant edge cases.
- Any introduced invariant over generated inputs, states, orderings, or
  transitions has a `fast-check` property test.
- Any introduced substantive business axiom has an explicit decision about
  whether LemmaScript proof is required; if proof is required, it must be
  rigorous and not a restatement of the assumption.
- `docs/developers-guide.md`, `docs/users-guide.md`,
  `docs/digitalpuddle-technical-design.md`, and `docs/adr/*` are updated where
  their owned facts change.
- `docs/roadmap.md` marks item 1.2.2 done only after implementation completes.
- `make check-fmt`, `make lint`, `make typecheck`, and `make test` all pass.
- Markdown gates pass if Markdown changed.
- `coderabbit review --agent` has no unresolved concerns after each major
  milestone.

## Idempotence and recovery

The migration must be safe to resume after interruption. Keep each milestone in
a separate commit after passing gates. If a move breaks imports, restore
compatibility through a facade rather than reverting unrelated user changes.
If a milestone becomes too broad, commit the last passing state and split the
remaining work into a follow-up decision in `Decision log`.

If a test or gate fails, inspect the matching `/tmp/*-digitalpuddle-${BRANCH}.out`
log before rerunning. Do not run format, lint, typecheck, or tests in parallel.
Do not create an isolated Cargo cache or build cache. Do not kill processes
owned by other agents.

Rollback is ordinary Git rollback to the last passing milestone commit. Do not
use destructive commands such as `git reset --hard` or `git checkout --` unless
the user explicitly approves that action.

## Artifacts and notes

Local evidence gathered for the draft:

```plaintext
Branch after rename:
1-2-2-introduce-target-source-layout-incrementally

Leta workspace:
Added workspace: /home/leynos/.lody/repos/github---leynos---digitalpuddle/worktrees/f3e971f6-6558-4cd2-a380-89ddce509231
```

Relevant project documents:

- `docs/roadmap.md` defines roadmap task 1.2.2 and its success criterion.
- `docs/digitalpuddle-technical-design.md` §§4, 7, and 16 define the
  Simulacrum backplane, runtime architecture, and target layout.
- `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`
  §§8, 20, 21, 27, 30, and 32 describe simulator boundary, unsupported-route,
  OpenAPI, testing, package-organization, and reset/isolation practices.
- `docs/developers-guide.md` defines contributor workflow, target source
  shape, capability-policy paths, and transitional architecture rules.
- `docs/users-guide.md` owns user-visible service and CLI behaviour.
- `docs/documentation-style-guide.md` owns Markdown style.
- `docs/adr/0001-simulacrum-backplane.md`, `docs/adr/0002-digitalocean-openapi-pin.md`,
  `docs/adr/0005-transitional-simulacat-boundaries.md`, and
  `docs/adr/0007-release-capability-policy.md` are the primary ADR guardrails.

External prior-art checks:

- Firecrawl summary of `https://github.com/sverweij/dependency-cruiser`:
  dependency-cruiser validates and visualizes dependencies in JavaScript and
  TypeScript projects with configurable rules and graph output. Treat this as
  optional future architecture fitness tooling, not a dependency for this task.
- Firecrawl summary of `https://github.com/midspiral/LemmaScript`:
  LemmaScript is a tech-preview verification toolchain for TypeScript using
  specification annotations and Dafny or Lean backends. Reserve it for
  substantive introduced axioms or contractual business logic, not mechanical
  source-layout moves.

## Interfaces and dependencies

The implementation should end with these stable internal interfaces or
equivalent local names, unless a milestone records a better repository-native
choice in `Decision log`:

```typescript
// src/simulation.ts
export function simulation(options?: SimulationOptions): SimulationApi;
```

`src/index.ts` should re-export this public API and keep the package-facing
entry point stable.

```typescript
// src/admin/routes.ts
export const extendDigitalPuddleAdminRoutes: FoundationExtendRouter;
```

`src/extend-api.ts` should remain as a compatibility facade until task 1.2.3 or
a later package-boundary task removes it.

```typescript
// src/engines/interfaces.ts
export interface KubernetesEngine {
  readonly name: string;
}
```

Engine interfaces must be owned by worker/application code, not public
handlers. Do not add real k3d, MinIO, Docker, QEMU, or DigitalOcean calls in
this roadmap item.

```typescript
// src/journal/index.ts
export interface RequestJournal {
  append(entry: JournalEntry): void | Promise<void>;
}
```

Only add this kind of interface if it is immediately useful as a target for
future implementation and can be documented without changing runtime behaviour.

## Revision note

Initial draft created to plan roadmap task 1.2.2 before implementation. It
captures the approval gate, target module sequence, validation commands,
CodeRabbit checkpoints, documentation duties, and risks discovered from local
docs, `leta`, Wyvern planning review, and Firecrawl prior-art checks.
