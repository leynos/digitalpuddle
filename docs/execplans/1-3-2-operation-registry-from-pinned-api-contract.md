# 1.3.2 Build the operation registry from the pinned OpenAPI contract

This ExecPlan (execution plan) is a living document. The sections `Constraints`,
`Tolerances`, `Risks`, `Progress`, `Surprises & discoveries`, `Decision log`,
`Outcomes & retrospective`, `Conformance basis`, and `Verification plan` must
be kept up to date as work proceeds.

Status: DRAFT (expert review applied; awaiting user approval and acceptance of
`D5`)

Branch: `1-3-2-operation-registry-from-pinned-api-contract`

Roadmap item: `1.3.2` in `docs/roadmap.md`.

## Purpose / big picture

DigitalPuddle is a local DigitalOcean API simulator. Roadmap task 1.3.1 pinned
one revision of DigitalOcean's public OpenAPI contract in
`src/openapi/digitalocean.openapi.json`. Separately, a hand-written capability
manifest in `src/openapi/capabilities.ts` says which public operations
DigitalPuddle supports and how. Today these two sources know nothing about each
other. The manifest was written before the pin existed, and it disagrees with
the pin in ways that would make every later route implementation wrong.

- The manifest invents operation identifiers such as
  `kubernetes.createCluster`. The pin calls that operation
  `kubernetes_create_cluster`.
- The manifest places SSH keys at `/v2/ssh_keys`. The pin defines them at
  `/v2/account/keys`.
- The manifest names path parameters `{id}`. The pin uses `{cluster_id}`,
  `{project_id}`, `{action_id}`, and `{node_pool_id}`.
- The manifest classifies `GET /v2/account/ratelimit`, which does not exist in
  the pin.
- The manifest contains a pseudo-operation `GET /v2/{path*}` that is not an
  operation in any contract.

Nothing can yet answer "which DigitalOcean operation is this request, and is it
supported?". The pin contains 635 operations. 620 of them live under `/v2`; the
remaining 15 are GradientAI inference operations under `/v1`, `/api/v1`, and a
templated upload URL. None of the 620 has a classification.

After this work, DigitalPuddle has an **operation registry**. It is an
immutable, in-memory index of every `/v2` operation in the pin, built
synchronously once per process. Each operation carries exactly one release
capability classification: `scriptable`, `engine-backed`, `stubbed`, or
`unsupported`. Classifications come from the reconciled manifest, and every
operation the manifest does not list is `unsupported` by rule. The registry
answers queries by operation ID, by method and path template, by capability
class, and by concrete request:

```ts
import {loadDigitalOceanOperationRegistry} from './src/openapi/digitalocean-operation-registry.ts';

const registry = loadDigitalOceanOperationRegistry();

registry.findByOperationId('kubernetes_create_cluster')?.classification.capability;
// 'engine-backed'

registry.resolveRequest('GET', '/v2/projects/default');
// {kind: 'operation', operation: {operationId: 'projects_get_default', …}, pathParameters: {}}

registry.resolveRequest('DELETE', '/v2/projects/default');
// {kind: 'method-not-allowed', pathTemplate: '/v2/projects/default', allow: ['GET', 'PATCH', 'PUT']}

registry.resolveRequest('GET', '/v2/no-such-thing');
// {kind: 'not-found'}

registry.listByCapability('engine-backed').map((op) => op.operationId);
// ['kubernetes_delete_cluster', 'kubernetes_get_kubeconfig', 'kubernetes_create_cluster']
// (sorted by operation key: 'DELETE …' < 'GET …' < 'POST …')
```

The registry is not yet wired into HTTP routing. Task 1.3.3 consumes it for the
capability matrix, 2.4.1 for the `/v2` catch-all `501` handler, and 2.1.1
onwards for route implementations. The one externally observable change in this
task is to the private admin route `GET /_digitalpuddle/capabilities`. Its rows
will use the pinned operation IDs and path templates, will no longer list the
non-existent rate-limit route, and will show SSH keys at `/v2/account/keys`.
The users' guide documents the change.

This task closes the questions that ADR 0007 and the 1.1.3 and 1.3.1 plans left
for "the registry":

- how the sidecar manifest relates to the pin;
- what classification an unlisted operation receives;
- how 404, 405, and 501 are told apart for a concrete request.

## Constraints

- Implementation begins only after the user explicitly approves this plan.
  Silence is not approval. Milestone `EP-M4` additionally needs the user to
  accept the deviation `D5`.
- Simulacrum (`@simulacrum/foundation-simulator`) remains the HTTP backplane.
  This task must not replace, fork, or monkey-patch its routing. It must not
  change what `simulation()` passes as `apiSchema`. The GitHub schema stays the
  default until a later roadmap task changes it.
- The pure modules are `src/openapi/path-template.ts`,
  `src/openapi/contract-document.ts`, `src/openapi/operation-registry.ts`,
  `src/openapi/operation-registry-issues.ts`, `src/openapi/capabilities.ts`,
  `src/openapi/v1-capability-manifest.ts`, and `src/openapi/projections.ts`.
  Neither they nor any module they import transitively may import Express,
  Simulacrum, `openapi-backend`, `node:*` modules, network code, or process
  code. The existing `zod` use is the only exception. ADR 0007 requires this
  boundary. A transitive import-direction test in
  `tests/openapi-layout.test.ts` enforces it.
- `src/openapi/artifact.ts` must stay free of filesystem, network, and process
  dependencies, as its header and the developers' guide §8 require. It imports
  `node:crypto`, so pure modules must not import its runtime values. They may
  use `import type` only. Filesystem access lives in the new adapter
  `src/openapi/pinned-contract-file.ts`.
- `src/openapi/index.ts` stays a barrel of pure modules. The composition
  module `src/openapi/digitalocean-operation-registry.ts`, which performs I/O,
  is imported by its own path. The barrel never re-exports it.
- The pinned artefact `src/openapi/digitalocean.openapi.json` and its
  provenance file must not be modified. The registry reads them, verifies the
  recorded SHA-256 hash, and never decorates or rewrites them.
- The registry must use the pin's upstream `operationId` values verbatim:
  never normalized, re-cased, or with suffixes stripped. Two upstream IDs end in
  `.yml`, `monitoring_get_appRestartCountMetrics.yml` and
  `monitoring_get_droplet_autoscale_current_cpu_utilization.yml`. Both must
  survive unchanged.
- The functions that the LemmaScript proof covers must be the functions that
  run in production. Never keep a second "verified copy" of the precedence or
  resolution logic.
- Add no source-API compatibility machinery. The manifest's operation IDs and
  paths, `buildUnsupportedOperationLookup`, and
  `toUnsupportedOperationResponse` are application-internal: `src/index.ts`
  does not export them, and the package is pre-1.0 (`0.1.0`). Change them
  together with every caller, test, and snapshot in one commit, and add no
  aliases.
- The only externally observable payload change allowed is to the rows of
  `GET /_digitalpuddle/capabilities`, as described in `Purpose`. Its envelope
  shape, the `legend` value, and the status codes stay unchanged.
- Every code file, including test files, stays at or below 400 lines
  (`AGENTS.md`, "Keep file size manageable"). `src/openapi/capabilities.ts` is
  443 lines at base revision `889431f`, so `EP-M1` splits it first.
- Identifiers must satisfy the repository's Oxlint configuration
  (`.oxlintrc.json`). In particular:
  - `deslop/no-shape-in-symbol-names` forbids the substring "shape" in
    declared names. Code therefore uses *skeleton* for the concept that prose
    calls "shape".
  - `deslop/no-unknown-parameters` forbids `unknown` parameters. Parsed JSON is
    therefore typed as `JsonValue` from `src/openapi/artifact.ts`, using
    `import type`.
- The following dependency changes are authorized, subject to plan approval.
  Both are development dependencies, pinned exactly; `AGENTS.md` permits a
  narrower range when justified.
  - `lemmascript` `0.6.10` supplies the `lsc` proof tool. It is a technology
    preview: a patch release can change generated Dafny, and `make prove`
    fails on any regeneration drift, so a caret range would make CI flaky.
  - `openapi-backend` `5.18.0` lets the parity test import the exact router
    that Simulacrum resolves. A test asserts that both resolve to the same
    file.

  No runtime dependency may be added.
- All documentation uses en-GB-oxendict spelling and follows
  `docs/documentation-style-guide.md`. The completed ExecPlans for 1.1.2,
  1.1.3, 1.2.2, and 1.3.1 are historical records and must not be edited.
- Gates run sequentially, never in parallel. The standard order is
  `make check-fmt`, `make typecheck`, `make lint`, then `make test`. Once
  `EP-M0` has added it, `make prove` runs next. When documentation changes,
  `make markdownlint` and then `make nixie` follow.

## Tolerances (exception triggers)

Counts exclude every ExecPlan file, including this one. They compare the
working tree against the merge base with `origin/main`:

```bash
base="$(git merge-base origin/main HEAD)"
excl=(':(exclude)docs/execplans/**' ':(exclude)bun.lock' ':(exclude)**/*.dfy.gen' \
      ':(exclude)tests/__snapshots__/**' ':(exclude)typos.toml')
git diff --numstat "$base" -- . "${excl[@]}"
git diff --name-only "$base" -- . "${excl[@]}" | wc -l
```

Each changed line belongs to exactly one category, classified by purpose:

- Code:
  - `src/**/*.ts` and `tests/**/*.ts`;
  - JSON fixtures under `tests/fixtures/`;
  - `bin/*`;
  - hand-maintained `proofs/**/*.dfy` files;
  - the `Makefile`;
  - shell embedded in workflow files, under hunk-based accounting.
- Configuration:
  - `package.json`;
  - `lemmascript.json` and `LemmaScript-files.txt`;
  - `biome.json`, `.gitignore`, and `tsconfig.json`;
  - the declarative parts of `.github/workflows/*.yml`.
- Documentation: `docs/**/*.md` except ExecPlans, `README.md`, and
  `CHANGELOG.md`.

The following generated files are excluded from every count, both files and
lines:

- `bun.lock`;
- regenerable `*.dfy.gen` files written by `lsc gen`;
- Bun snapshot files under `tests/__snapshots__/`;
- `typos.toml`, which `make spelling` regenerates from the shared spelling
  policy.

Snapshot changes are still reviewed by hand, as `EP-M4` describes.

Budgets, measured in net lines (additions minus deletions):

| Category      | Limit                 |
| ------------- | --------------------- |
| Files         | 40 non-excluded files |
| Code          | 2,500 net lines       |
| Configuration | 130 net lines         |
| Documentation | 500 net lines         |

Stop and escalate if any limit is exceeded. Each category is enforced
independently, so spare capacity in one does not offset another.

### Estimate basis

The base-revision survey found these sizes:

| File                          | Lines at `889431f` |
| ----------------------------- | ------------------ |
| `src/openapi/capabilities.ts` | 443                |
| `src/openapi/projections.ts`  | 117                |
| `src/openapi/artifact.ts`     | 137                |
| `src/openapi/index.ts`        | 41                 |
| `src/admin/capabilities.ts`   | 54                 |
| `src/handlers/unsupported.ts` | 54                 |

The rekey must also change these existing callers:

- `tests/openapi-capabilities.test.ts`;
- `tests/openapi-projections.test.ts`;
- `tests/openapi-layout.test.ts`;
- `tests/base.test.ts`.

The planned new production code is:

| Module                         | Estimated lines                |
| ------------------------------ | ------------------------------ |
| `path-template.ts`             | 230, with proof annotations    |
| `contract-document.ts`         | 90                             |
| `operation-registry.ts`        | 300                            |
| `operation-registry-issues.ts` | 80                             |
| Adapter and composition        | 140                            |
| Manifest split                 | about 300 moved, near zero net |

The rest of the estimate is:

- about 1,100 lines of tests, including the support builders and oracle
  modules;
- a proof wrapper script of about 110 lines;
- a hand-maintained `.dfy` proof of about 300 lines.

That totals about 2,250 net lines of code, with roughly 10% contingency, giving
2,500.

Configuration totals about 95 lines:

- the two dependencies and one script entry;
- `lemmascript.json` and `LemmaScript-files.txt`;
- `.gitignore` entries for LemmaScript merge files;
- about 60 lines of CI for the Dafny, Z3, and .NET toolchain, with cache and
  retry steps.

Documentation totals about 420 lines:

- a new ADR, about 120;
- technical design §§6.5, 7.1, 8.2, 8.4, and 16, about 80;
- the developers' guide, about 130;
- the users' guide, about 50;
- the roadmap and changelog, about 40.

There are about 36 files: 13 new production, proof, and tooling files; 8 new
test or fixture files; 6 changed source files; 4 changed test files; 6
configuration files; and 6 documentation files.

### Historical evidence

- 1.1.3 budgeted 12 files and 700 net lines without revision.
- 1.2.2 budgeted 35 files and 1,200 net lines without revision.
- 1.3.1 budgeted 10 files and 650 net lines. Its `Decision Log` records
  "accept scope tolerance overrun" to add command, documentation, and test
  seams, without the new figures. That overrun was missed scope: tests and
  documentation for a command path were under-counted.

This plan therefore budgets tests, configuration, and documentation explicitly,
and lists the expected files.

### Other triggers

Stop and escalate when any of the following occurs:

- **Interface:** a change is needed to `src/index.ts` exports, to the
  `simulation()` argument types, or to the `/_digitalpuddle/capabilities`
  envelope beyond row content.
- **Dependencies:** a dependency is needed beyond the two authorized in
  `Constraints`, or either must become a runtime dependency.
- **Architecture:** the registry cannot be built without modifying the pinned
  artefact. This also triggers if the parity classifier in `EP-M5` finds a
  divergence kind other than `method-fallthrough` and
  `literal-length-precedence`, or a divergence involving an operation not
  classified `unsupported` that is not on the reviewed allow-list. Either would
  falsify `D3`'s risk assessment.
- **Proof feasibility:**
  - the `EP-M0` prototype is a no-go;
  - `EP-M6` cannot discharge `L-precedence-spec`, `L-no-tie`,
    `INV-most-specific`, and `INV-resolution-decision` within 8 hours of
    effort;
  - discharging them would need an `assume`, `{:axiom}`,
    `{:verify false}`, or `//@ extern` beyond those listed in
    `Verification plan`.

  The fallbacks in `Verification plan` need the user's explicit waiver.
- **Iterations:** a focused test or proof still fails after 3 fix attempts
  within one milestone.
- **Time:** any single milestone other than `EP-M6` exceeds 8 hours of active
  work.
- **Ambiguity:** a pinned operation's classification is unclear, or a
  manifest entry cannot be mapped to exactly one pinned operation. The
  rate-limit route (`D5`) is the known case.

## Risks

- Risk: LemmaScript is a technology preview. Version 0.6.10 was published on
  15 November 2026, the day this plan was drafted.
  - Severity: medium. Likelihood: medium.
  - It may not translate the chosen subset, its behaviour may change between
    releases, and the local `lemmascript` skill still cites 0.5.22.
  - Mitigation:
    - the `EP-M0` prototype runs before any production code exists, and
      exercises the hard constructs: string `===`, indexed records under
      `noUncheckedIndexedAccess`, and a quantified loop invariant;
    - the version is pinned exactly, and `bun.lock` is committed;
    - the proved module stays free of string parsing;
    - the full proof (`EP-M6`) comes after the registry milestones, so a
      late difficulty blocks only that milestone.
- Risk: verification is silently disabled.
  - Severity: high. Likelihood: medium without mitigation.
  - LemmaScript runs only a generation check, not verification, for Dafny
    entries whose timeout exceeds 60 s unless `--slow` is passed. This is
    `tools/dist/lsc.js` in 0.6.5, as observed in velocetty's install.
  - Mitigation:
    - `LemmaScript-files.txt` uses a 60 s timeout, and `bin/prove.sh` rejects
      any larger value;
    - `bin/prove.sh` parses Dafny's
      `finished with N verified, 0 errors` line, and fails if `N` falls below
      the floor recorded in `EP-M6`;
    - `EP-M0` re-checks the 60 s cut-off against 0.6.10.
- Risk: CI cannot install the proof toolchain.
  - Severity: medium. Likelihood: medium.
  - CI has no Dafny or Z3, so a NuGet or GitHub-release outage would turn
    every PR red. Someone might then add `continue-on-error`.
  - Mitigation:
    - follow the sibling repository `leynos/velocetty`
      (`.github/workflows/nodejs.yml`, `bin/prove.sh`);
    - pin `actions/setup-dotnet` by SHA;
    - cache the toolchain with `actions/cache`, keyed on the Dafny version
      and the Z3 archive SHA-256;
    - download with `curl --retry 3`;
    - verify the Z3 checksum;
    - the developers' guide states that `continue-on-error` on the prove step
      is a review blocker.
- Risk: a pin refresh adds divergences, and someone rubber-stamps them by
  regenerating the fixture.
  - Severity: high. Likelihood: medium.
  - Mitigation:
    - the parity test classifies each divergence by rule, and fails on an
      unknown kind before comparing with the fixture;
    - it fails if any divergence touches an operation classified other than
      `unsupported`, unless that divergence is on a reviewed allow-list with
      a rationale;
    - the fixture records the pin commit, and the test fails if it differs
      from provenance;
    - the developers' guide requires a pin refresh to update the fixture in a
      separate, reviewed commit.
- Risk: the parity test is slow.
  - Severity: medium. Likelihood: high without mitigation.
  - `openapi-backend` rebuilds its operation list and compiles a `RegExp`
    per operation on every `matchOperation` call. A review probe measured
    7.8 to 11.4 s for about 3,790 requests under Bun, above Bun's default 5 s
    test timeout.
  - Mitigation: a test-only subclass caches `getOperations()`. That method is
    pure, and the cache brought the probe to about 1 s. The test also sets an
    explicit 30 s timeout and logs its duration. Subclassing in a test does
    not modify Simulacrum's routing.
- Risk: the registry is unusable from the published package.
  - Severity: medium. Likelihood: certain once wired.
  - tsdown bundles `src/index.ts` into `dist/`, and a module-relative URL
    would then resolve to `dist/digitalocean.openapi.json`, which is never
    emitted. The JSON ships under `src/` (see `package.json` `files`).
  - Mitigation: in this task, `src/index.ts` does not import the registry.
    The adapter takes explicit file locations, with defaults resolved from
    the module URL. The 2.4.1 roadmap entry gains a requirement to settle
    packaging, for example by bundling a derived index or adding a
    `files`/`exports` entry, and to run `make build`.
- Risk: the registry's resolution rule disagrees with `openapi-backend`,
  which Simulacrum uses.
  - Severity: high for later routing tasks. Likelihood: certain; the
    planning probe found it.
  - Requests could be classified as one operation and dispatched as another.
    For example, the backend dispatches `DELETE /v2/projects/default` to
    `projects_delete`.
  - Mitigation: `D3` adopts the OpenAPI-specified rule, and `EP-M5` pins
    every divergence. `D8` adds to the 2.4.1 success criterion in
    `docs/roadmap.md` that the registry decides 404, 405, and 501 before
    `openapi-backend` dispatches.
- Risk: rekeying the manifest churns snapshots and the admin payload.
  - Severity: low. Likelihood: certain.
  - Mitigation: one atomic commit whose message lists every old-to-new
    mapping, a manual snapshot review, and documentation in the users'
    guide.
- Risk: a future pin contains same-skeleton templates, which OpenAPI forbids.
  - Severity: medium. Likelihood: low; the current pin has none.
  - Mitigation: the builder rejects them with `path-template-collision`,
    naming both templates.
- Risk: `GET /v2/projects/default` (`projects_get_default`) is classified
  `unsupported`, while `projects_get` is `scriptable`. Terraform and doctl may
  call the default project.
  - Severity: low here, medium for 2.2.2. Likelihood: medium.
  - Mitigation: none in this task. The manifest mirrors technical design
    Table 1, and this plan does not widen the v1 surface. The developers'
    guide records the gap as a follow-up for roadmap 2.2.2.

## Progress

- [x] (2026-11-15 21:40Z) Reconnaissance: a Wyvern team surveyed
  `src/openapi`, handlers, admin routes, tests, tooling, ADRs, guides, and
  previous plans.
- [x] (2026-11-15 22:05Z) Planning probes:
  - pin statistics;
  - path-shape collisions;
  - an `openapi-backend` parity corpus.
- [x] (2026-11-15 22:30Z) Initial draft committed.
- [x] (2026-11-15 23:30Z) Design review by a three-member community-of-experts
  panel. The lenses were structure and contracts, failure modes and scale, and
  alternatives and viability. The panel's verdicts were "Proceed with
  conditions" and "Revise" (twice). All findings are applied in this revision;
  see `Decision log` `D9`.
- [ ] Plan approved by the user, and `D5` accepted.
- [ ] `EP-M0` LemmaScript feasibility prototype and the `make prove`
  scaffolding.
- [ ] `EP-M1` Split `src/openapi/capabilities.ts` into policy and data modules.
  This is a refactor, with no behaviour change.
- [ ] `EP-M2` Path-template domain module, with unit and property tests.
- [ ] `EP-M3` Contract-document boundary schema, and the pure registry builder
  and queries.
- [ ] `EP-M4` Reconcile the v1 manifest with the pin. Retype the unsupported
  helpers. Add the synchronous file adapter and the composition. Update the
  admin payload end to end.
- [ ] `EP-M5` `openapi-backend` parity guard, with the pinned divergence
  fixture.
- [ ] `EP-M6` Complete the LemmaScript proof of precedence and resolution, and
  wire `make prove` into CI.
- [ ] `EP-M7` Write ADR 0009. Update the design, guides, roadmap, and
  changelog. Run the final gates.

## Surprises & discoveries

- Observation: the v1 seed manifest does not match the pin. Nineteen of its 27
  entries use paths or parameter names that differ from the pinned templates.
  All 27 use invented dotted operation IDs.
  - Evidence: a planning probe over `src/openapi/digitalocean.openapi.json`
    at `889431f` printed the pinned operations for each manifest path. For
    example, it reported `/v2/ssh_keys → MISSING`, and
    `/v2/account/keys GET:sshKeys_list POST:sshKeys_create`. The
    structure-and-contracts reviewer independently confirmed every new ID in
    Table 1.
  - Impact: `EP-M4` rekeys every entry. See `D2`.
- Observation: `GET /v2/account/ratelimit` does not exist in the pin.
  DigitalOcean reports rate limits through the `ratelimit-limit`,
  `ratelimit-remaining`, and `ratelimit-reset` response headers.
  - Evidence: the probe found no rate-limit path other than an unrelated
    monitoring metric.
  - Impact: `D5`, which needs user acceptance.
- Observation: the pin's operations are regular and unambiguous.
  - It has 635 operations, 620 of them under `/v2`.
  - Every `operationId` is unique.
  - The methods used are `get` (331), `post` (136), `delete` (93), `put` (61),
    and `patch` (14).
  - There are no path-item `parameters`, and no same-skeleton templates.
  - Evidence: probe output at `889431f`.
  - Impact: the closed `httpMethodValues` vocabulary covers the pin. The
    builder still rejects `head`, `options`, and `trace` explicitly, so a
    future refresh fails loudly.
- Observation: `openapi-backend` 5.18.0 diverges from the OpenAPI rule that
  concrete paths match before templated ones, in two ways.
  - It falls back to a templated path when the concrete path lacks the
    method. `DELETE /v2/databases/options` dispatches to
    `databases_destroy_cluster`, where ADR 0007 requires `405`.
  - It ranks templated candidates by the total length of their literal
    characters, not segment by segment.
    `GET /v2/droplets/autoscale/destroy_with_associated_resources` dispatches
    to `droplets_list_associatedResources`, rather than `autoscalepools_get`.
  - Evidence: `node_modules/openapi-backend/router.js` `matchOperation`. A
    probe over 3,945 generated requests, about 3,790 after deduplication,
    found 67 method-fallthrough disagreements and 4 literal-length disagreements
    (2 distinct paths, each counted twice).
  - Impact: `D3`, `EP-M5`, and ADR 0009.
- Observation: `src/handlers/unsupported.ts` and
  `buildUnsupportedOperationLookup` have no production caller. Nothing matches
  `/v2` requests yet; a `/v2` request falls through to Simulacrum's final `404`.
  - Evidence: Wyvern reconnaissance of `src/extend-api.ts`,
    `src/simulation.ts`, and the Simulacrum `dist/index.mjs`.
  - Impact: there is no runtime `501` behaviour to preserve. That wiring
    belongs to 2.4.1.
- Observation: three existing property tests are unseeded, contrary to the
  developers' guide.
  - Evidence: `tests/openapi-capabilities.test.ts:68` and `:206`, and
    `tests/openapi-projections.test.ts:94`.
  - Impact: the new tests use `propertyTestSeed`. The three that `EP-M4`
    touches anyway are seeded there; the rest stay a follow-up.
- Observation: the repository's Oxlint rules forbid "shape" in identifiers and
  `unknown` parameters.
  - Evidence: `.oxlintrc.json`, and
    `node_modules/ai-deslop/dist/rules/no-shape-in-symbol-names.js`.
  - Impact: these were renamed in the interfaces.
- Observation: technical design §6.5 says that any unimplemented `/v2` route
  returns `501`. ADR 0007 instead distinguishes `404` for unknown paths from
  `501` for known, unsupported operations.
  - Evidence: `docs/digitalpuddle-technical-design.md` §6.5 and Table 1's
    last row.
  - Impact: `D4` reconciles the two, and `EP-M7` edits §6.5.

## Decision log

- D1. Decision: build the registry as a pure, synchronous domain module, with
  an explicit driven adapter and composition.
  - `buildOperationRegistry(input)` in `src/openapi/operation-registry.ts`
    takes an already-validated contract document and classification entries.
    It returns a discriminated union and never throws for invalid data.
  - `readPinnedContract(locations?)` in `src/openapi/pinned-contract-file.ts`
    is the only module that touches `node:fs`. It reads both files with
    `readFileSync`, checks the provenance and hash with the
    `src/openapi/artifact.ts` helpers, and decodes the JSON through
    `jsonValueSchema`. It throws `PinnedContractLoadError` on failure.
  - `loadDigitalOceanOperationRegistry()` in
    `src/openapi/digitalocean-operation-registry.ts` composes the two. It
    memoizes a successful result only, and throws `OperationRegistryBuildError`
    with the structured issues, or the load error as `cause`.

  Rationale: ADR 0007 keeps policy independent of filesystem I/O and Express.
  The pure builder can be tested with small synthetic contracts. `simulation()`
  and Simulacrum's route extension are synchronous (`src/simulation.ts:118`),
  so an async loader would force 2.4.1 either to make `simulation()` async or
  to await inside each request. The one-off read, hash, and parse cost about 25
  to 40 ms, measured during review.

  Rejected alternatives:
  - building at module initialization, which imposes I/O on any import;
  - an async loader, for the reason above.

  Date/Author: 2026-11-15, planning agent; revised after review.

- D2. Decision: keep classifications in the sidecar manifest, rekeyed to the
  pin's `operationId`, method, and path template. Do not write
  `x-digitalpuddle-capability` into the pinned artefact. Every manifest entry
  must match exactly one pinned `/v2` operation on all three fields, or the
  build fails.

  Rationale: the artefact is a hashed release input. ADR 0007 permits the
  extension but does not require it. A decorated copy belongs to the
  `/_digitalpuddle/openapi` admin route (design §13).

  `method` and `path` stay in the manifest, redundant with the pin, because
  `src/openapi/projections.ts` and the admin payload read them. The cross-check
  turns any drift into a build failure. Task 1.3.3 may remove the redundancy.

  Date/Author: 2026-11-15, planning agent.

- D3. Decision: concrete requests resolve by the OpenAPI path-item-first rule.
  1. Strip trailing `/` characters, except from the root. The input path
     must not include a query string. No slash collapsing or percent-decoding
     takes place.
  2. Paths not starting with `/v2/` are `not-found`.
  3. Collect every `/v2` template whose segment count matches and whose
     literal segments are equal. A parameter segment matches any non-empty
     segment.
  4. Choose the most specific candidate. Compare segment kinds from left to
     right; a literal beats a parameter at the first position where they
     differ.
  5. Look up the method on that template's path item. The method comparison
     is case-sensitive, as RFC 9110 §9.1 requires. Return the operation if
     the method is present. Otherwise return `method-not-allowed` with the
     sorted `Allow` set, including for unrecognized methods such as `HEAD`.
  6. Return `not-found` when no template matches.

  Path parameter values are returned raw; handlers decode them.

  Rationale:
  - OpenAPI 3.0.3, Paths Object, says "concrete (non-templated) paths would
    be matched before their templated counterparts".
  - ADR 0007 requires `405` with `Allow` for known paths with unlisted
    methods.
  - Segment-wise precedence is the conventional generalization of that rule
    to partially templated paths.
  - Without skeleton collisions, the result does not depend on document
    order.

  RFC 9110 §9.1 says a server SHOULD respond `501` to an unrecognized method.
  This plan follows ADR 0007's letter instead, returning `405` for any method
  absent from a known path item. ADR 0009 records that deviation.

  The rejected alternative was to mirror `openapi-backend` exactly. It would
  make `405` unreachable for 67 probed requests, and it ranks candidates by
  character counts. The consequence is `D8`.

  Date/Author: 2026-11-15, planning agent; refined after review.

- D4. Decision: every pinned `/v2` operation that the manifest does not list
  is classified `unsupported`. Its classification record is synthesized from:
  - `unsupportedRuntime`;
  - `productArea` set to the operation's first OpenAPI tag, or `'Untagged'`;
  - `releaseStage` set to the builder's `defaultReleaseStage` input (`'v1'`);
  - `exposeInDocs: true`;
  - `source: 'default'`.

  Manifest entries carry `source: 'manifest'`. Operations outside `/v2` are
  excluded and reported only as sorted keys in `excludedOperations`.
  `GET /v2/{path*}` is removed from the manifest because the rule replaces it.

  An unknown `/v2` path is `not-found` (404), not `501`. Technical design §6.5
  says "Any unimplemented public route under `/v2` returns … `501`". This plan
  reconciles that with ADR 0007 by reading "route" as a contract operation, and
  `EP-M7` rewords §6.5 to match.

  Rationale:
  - ADR 0007 requires exactly one classification per known operation.
  - Every operation needs a complete classification record, so that 1.3.3 can
    build matrix rows and 2.4.1 can build `501` envelopes without inventing
    defaults.

  Date/Author: 2026-11-15, planning agent; revised after review.

- D5. Decision, which requires user acceptance as a proposed deviation:
  remove `account.getRateLimit` (`GET /v2/account/ratelimit`) from the
  manifest. State in technical design Table 1 and §8.4 that rate-limit
  information is served through the rate-limit response headers on every
  response, not through a route. The upstream identifiers affected are design
  §8.2 Table 1 row 2, and the roadmap 2.1.1 wording "account, rate-limit,
  regions…".

  Options:
  1. Remove the entry, and reword 2.1.1 to "rate-limit headers". This is the
     recommended option. Design §8.4 and 2.1.1 already require rate-limit
     headers, so it is mostly a wording change.
  2. Keep it as a DigitalPuddle-only route outside the registry. That
     contradicts "contract-first" (design §8.1).
  3. Let the registry tolerate entries absent from the pin. That breaks the
     one-validated-source guarantee.

  `EP-M4` is `BLOCKED` until the user accepts one option.

  Date/Author: 2026-11-15, planning agent.

- D6. Decision: look up by method and path template using the template's
  *skeleton*, which is the template with parameter names erased. Prose calls
  this the "shape". The method is `findByMethodAndTemplate`, so that callers
  cannot mistake it for concrete-path lookup; concrete paths go through
  `resolveRequest`. The result always reports the pinned template. Manifest
  cross-checks still require the exact pinned template.

  Rationale: OpenAPI declares same-shape templates identical. Skeleton keys
  survive parameter renames between pins, and they let the builder detect
  forbidden collisions.

  Date/Author: 2026-11-15, planning agent; renamed after review.

- D7. Decision: discharge the precedence and resolution obligations with
  LemmaScript, using the Dafny backend, on the production module
  `src/openapi/path-template.ts`.
  - The specification is written against an independent ghost order, not
    against `compareSpecificity` itself, so a mutation of the code's rule
    must fail.
  - `fast-check` properties with an independent oracle back the proof.

  Classification totality and manifest reconciliation are discharged by an
  exhaustive check over the real pin instead. For this pin's finite domain of
  620 operations that check is complete, the build re-establishes it on every
  run, and a refresh re-establishes it for the new pin. A formal proof of
  "lookup with a default is total" would restate the code.

  Date/Author: 2026-11-15, planning agent; strengthened after review.

- D8. Decision: record `D2` to `D4` and `D6` in a new ADR,
  `docs/adrs/adr-0009-operation-registry-resolution.md`. Also amend the 2.4.1
  roadmap success criterion: the registry decides 404, 405, and 501 before
  `openapi-backend` dispatches, and packaging of the pinned contract for
  `dist/` is settled.

  Rationale: the resolution rule and its divergence from the backplane are
  durable and hard to reverse. ADR 0007 defines the vocabulary but leaves the
  mechanism open.

  Date/Author: 2026-11-15, planning agent.

- D9. Decision: apply the expert panel's findings in full. The material
  changes from the first draft are:
  - the proof specification uses an independent ghost order, and is extended
    to the full 404/405/operation decision (`resolveSegments`);
  - Dafny timeouts are capped at 60 s, with a floor on the verified count;
  - the seeded mutation is restored and the tree checked with
    `git diff --exit-code`;
  - both dependencies are pinned exactly;
  - proof artefacts move to `proofs/` through `lemmascript.json`
    `proof-dir`, so `.dfy` files are not published under `src`;
  - the loader is synchronous, and every operation has a complete
    classification record;
  - issues and errors are per-code discriminated unions, split between the
    domain and the adapter;
  - identifiers were renamed to satisfy the lint rules;
  - `toUnsupportedOperationResponse` is retyped, and
    `buildUnsupportedOperationLookup` is removed, since the registry
    supersedes it;
  - the property generators were fixed: a not-found generator, shared length
    per case, and assertions on counters;
  - the parity test uses a cached router subclass, strict 404 and 405
    mapping, an exact deduplicated corpus count, and a rule-based divergence
    classifier;
  - the proof moves off the critical path, behind an early prototype gate;
  - the file tolerance is corrected, and design §6.5 is added to `EP-M7`.

  Alternative (d), raised by the panel, was considered and not adopted. It
  would split concrete resolution, the proof, and parity into a new roadmap
  task, 1.3.4. The reasons for keeping them:
  - the roadmap asks for queries "by … path", which a request-routing
    simulator most naturally needs for concrete request paths;
  - ADR 0007 makes the 405 decision a registry responsibility;
  - the user asked for proofs of contractual logic in this task.

  The split would halve the PR, so it remains available if the user prefers it
  at approval time.

  Date/Author: 2026-11-15, planning agent.

## Outcomes & retrospective

Not started. Complete at each milestone boundary and at completion.

## Context and orientation

Inspected base revision: `889431f` ("Remove the tool list from AGENTS.md
(#118)") on `main`. Line numbers below refer to that revision; relocate symbols
with `grep -n '<symbol>' <file>`.

### Runtime and tooling

The repository is TypeScript run by Bun 1.3.11 (`packageManager` in
`package.json`), with TypeScript 6.0.

`tsconfig.json` enables these strictness options:

- `strict`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `noPropertyAccessFromIndexSignature`;
- `verbatimModuleSyntax`;
- `allowImportingTsExtensions`.

It includes `tests/**/*.ts`, so `make typecheck` also checks the `*.test-d.ts`
type tests.

The project's tools are:

- Biome 2.5, for formatting and linting: single quotes, a 120-column line
  limit, no trailing commas, and no bracket spacing;
- Oxlint 1.82, with `ai-deslop` and type-aware rules (`.oxlintrc.json`);
- Zod 4.6;
- `fast-check` 4.10;
- `bun:test`.

`make test` runs `bun test --max-concurrency=1 tests`. There is no BDD runner,
and none will be added. Behavioural tests are `bun:test` suites whose `@file`
header says "Behavioural tests".

The host has Dafny 4.11.0 at `~/.local/bin/dafny`, with Z3 under
`~/.dotnet/tools`. CI (`.github/workflows/ci.yml`) has neither. It runs
`make all`, a Markdown lint action, `bun run audit`, and `make build`.

### Current code in this area

- `src/openapi/capabilities.ts` (443 lines) holds:
  - the capability vocabulary and the HTTP method vocabulary
    (`httpMethodValues = ['DELETE','GET','PATCH','POST','PUT']`);
  - the runtime-behaviour vocabulary;
  - `capabilityManifestEntrySchema`, whose `superRefine` holds the ADR 0007
    rules;
  - `createOperationKey(method, path)`, which produces `"METHOD /path"`
    after collapsing slashes and trimming trailing ones;
  - `validateCapabilityManifest`, which rejects duplicate keys;
  - the 27-entry `v1CapabilityManifest`, validated at import time, which
    logs `digitalpuddle.manifest.validated`.
- `src/openapi/projections.ts` (117 lines) builds the capability matrix, the
  documentation metadata, and `buildUnsupportedOperationLookup` from manifest
  entries. The lookup has no production caller. Rows are sorted with
  `localeCompare`.
- `src/openapi/artifact.ts` (137 lines) holds pure helpers for the pin:
  - `JsonValue` and `jsonValueSchema`;
  - the artefact paths, and the commit
    `digitalOceanOpenApiPin = 'ef3868ee4cadd34fd4f9624371f7a45d7a205fc1'`;
  - `sha256Hex`, which imports `node:crypto`;
  - `validateDigitalOceanOpenApiProvenance`;
  - a provenance-to-bytes hash assertion.
- `src/openapi/index.ts` is the barrel of pure modules.
- `src/admin/capabilities.ts` memoizes `buildCapabilityDocumentationMetadata()`
  for `GET /_digitalpuddle/capabilities`. `src/admin/routes.ts` registers the
  route, and `src/extend-api.ts` composes it into Simulacrum.
- `src/handlers/unsupported.ts` has `toUnsupportedOperationResponse`, which
  takes a manifest entry and builds a DigitalOcean-shaped `501` envelope. It
  has no production caller.
- `src/simulation.ts` and `src/index.ts`: `simulation()` passes the GitHub
  schema as `apiSchema`. Simulacrum mounts it through `openapi-backend` 5.18.0
  (`node_modules/@simulacrum/foundation-simulator/dist/index.mjs`, lines 74 to
  140). The package entry exports nothing from `src/openapi`.

### Existing tests in this area

| File                                          | Covers                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `tests/openapi-capabilities.test.ts`          | Unit and property tests; asserts dotted IDs                                |
| `tests/openapi-projections.test.ts`           | Behavioural tests, including the `501` envelope and the unsupported lookup |
| `tests/openapi-layout.test.ts`                | Barrel exports; matrix snapshot                                            |
| `tests/base.test.ts`                          | Starts the server on port 2999; snapshots `/_digitalpuddle/capabilities`   |
| `tests/digitalocean-openapi-artifact.test.ts` | Provenance and hash                                                        |
| `tests/support/property-test-seed.ts`         | Exports `propertyTestSeed = 13_101`                                        |

### Terms

- An *operation* is one method on one path in the OpenAPI document. Its
  *operation key* is `"METHOD /path/template"`.
- A *path template* is an OpenAPI path such as `/v2/projects/{project_id}`.
  Its *segments* are the strings between `/` characters. A segment is a
  *parameter* when it is wrapped in braces, and a *literal* otherwise.
- The *skeleton* of a template replaces each parameter with `{}`. Prose also
  calls it the shape.
- The *kind vector* of a template is the sequence of its segment kinds,
  literal or parameter.
- A *concrete request path* is what a client sends, such as
  `/v2/projects/9f1c`.
- *Most specific* means first in the ghost order of `D3`.
- A *classification overlay* is the set of manifest entries that override the
  default `unsupported` classification.
- *Backplane parity* is agreement between this registry's resolution and
  `openapi-backend`'s `matchOperation`.

### Signposts

Documents:

- `docs/digitalpuddle-technical-design.md` §§4, 6.5, 7.1, 8.1, 8.2, 8.4, 13,
  and 16;
- `docs/adrs/adr-0001-simulacrum-backplane.md`;
- `docs/adrs/adr-0002-digitalocean-openapi-pin.md`;
- `docs/adrs/adr-0007-release-capability-policy.md`;
- `docs/developers-guide.md` §7, "Capability policy", and §8, "DigitalOcean
  OpenAPI artefact refresh";
- `docs/users-guide.md`, "Capability classifications" and "Admin routes";
- `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`,
  §21, "Use OpenAPI as scaffolding", and the guidance near lines 635-641 on
  indexed lookups and pure domain rules.

`docs/complexity-antipatterns-and-refactoring-strategies.md` does not exist in
this repository. Apply `AGENTS.md`, "Refactoring Heuristics & Workflow",
instead.

Prior art:

- the LemmaScript README, `SPEC.md`, `SPEC_DAFNY.md`, and `SUBSET.md`
  (<https://github.com/midspiral/LemmaScript>);
- the velocetty repository's `bin/prove.sh` and its CI steps;
- the OpenAPI Specification 3.0.3, Paths Object
  (<https://spec.openapis.org/oas/v3.0.3.html#paths-object>).

Skills to load:

- `execplans`;
- `hexagonal-architecture`, for the boundaries in `D1`;
- `typescript-router`, then `typescript-boundaries-and-validation` and
  `typescript-errors-and-outcomes`;
- `fast-check`;
- `typescript-verification` and `lemmascript`, for `EP-M0` and `EP-M6`;
- `codegraph-mcp`, for caller and impact queries before the rekey;
- `biome-typescript`;
- `en-gb-oxendict`.

## Conformance basis

The upstream artefacts, all inspected at `889431f`, are:

- Terms of Reference: none exists in this repository.
- Technical design: `docs/digitalpuddle-technical-design.md` §§4, 6.5, 7.1,
  8.1, 8.2, 8.4, 13, 16, and 17.2, cited as `TDD-§n`.
- ADRs: ADR-0001 (Simulacrum backplane), ADR-0002 (OpenAPI pin), and ADR-0007
  (release capability policy).
- Roadmap: `docs/roadmap.md` item 1.3.2, and its dependants 1.3.3, 2.1.1,
  2.4.1, and 3.3.1.
- Governing standards: `AGENTS.md`, `docs/documentation-style-guide.md`,
  OpenAPI 3.0.3 (Paths Object), and RFC 9110 §§9.1 and 15.5.6.

Requirements:

| ID                        | Requirement                                                                                    | Source                   |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| `REQ-every-v2-classified` | Every pinned `/v2` operation has exactly one complete classification                           | ADR-0007; roadmap 1.3.2  |
| `REQ-query-dimensions`    | Queries by operation ID, by method and path, and by capability class                           | Roadmap 1.3.2            |
| `REQ-concrete-resolution` | A concrete request resolves to an operation, `method-not-allowed` with `Allow`, or `not-found` | ADR-0007                 |
| `REQ-single-source`       | Docs, admin, and runtime classifications derive from one validated source                      | ADR-0007; TDD-§7.1       |
| `REQ-pin-faithful`        | The registry is built from the hashed pin without modifying it                                 | ADR-0002; TDD-§20        |
| `REQ-backplane`           | Simulacrum stays the HTTP backplane                                                            | ADR-0001; TDD-§4         |
| `REQ-pure-policy`         | Policy code is independent of Express, Simulacrum, filesystem, and engine adapters             | ADR-0007, "Consequences" |

Gaps:

| ID                         | Gap                                                                       |
| -------------------------- | ------------------------------------------------------------------------- |
| `GAP-manifest-drift`       | The seed manifest's IDs, paths, and parameter names disagree with the pin |
| `GAP-no-registry`          | Nothing indexes pinned operations or resolves concrete requests           |
| `GAP-unclassified`         | 595 pinned `/v2` operations have no classification                        |
| `GAP-oversize-module`      | `capabilities.ts` exceeds 400 lines                                       |
| `GAP-backplane-divergence` | `openapi-backend` precedence differs from the OpenAPI rule                |
| `GAP-design-6.5`           | Design §6.5 conflates unknown routes with unsupported operations          |

Trace links:

```plaintext
ADR-0007 -> REQ-every-v2-classified -> EP-M3, EP-M4
  -> tests/digitalocean-operation-registry.test.ts::"classifies every /v2 operation exactly once"
roadmap-1.3.2 -> REQ-query-dimensions -> EP-M3
  -> tests/operation-registry.test.ts::"Feature: query the operation registry"
ADR-0007 -> REQ-concrete-resolution -> EP-M2, EP-M3, EP-M6
  -> tests/path-template.test.ts; make prove (L-precedence-spec, L-no-tie, INV-most-specific, INV-resolution-decision)
ADR-0007 -> REQ-single-source -> EP-M4
  -> tests/digitalocean-operation-registry.test.ts::"every manifest entry matches exactly one pinned operation"
ADR-0002 -> REQ-pin-faithful -> EP-M4
  -> tests/pinned-contract-file.test.ts::"rejects bytes whose hash differs from provenance"
ADR-0001 -> REQ-backplane -> EP-M5 -> tests/operation-registry-backplane-parity.test.ts
ADR-0007 -> REQ-pure-policy -> EP-M1..EP-M4
  -> tests/openapi-layout.test.ts::"pure modules import no I/O or framework modules transitively"
GAP-manifest-drift -> D2, D5 -> EP-M4 -> tests/openapi-capabilities.test.ts (rekeyed); tests/base.test.ts snapshot
GAP-oversize-module -> EP-M1 -> wc -l src/openapi/*.ts (all <= 400)
GAP-backplane-divergence -> D3, D8 -> EP-M5, EP-M7 -> tests/fixtures/openapi-backend-divergences.json; ADR 0009
GAP-design-6.5 -> D4 -> EP-M7 -> docs/digitalpuddle-technical-design.md §6.5
```

## Verification plan

### Abstract model

The model uses these definitions:

- **Segment.** A segment is either `Lit(s)`, for a non-empty string `s`, or
  `Param`.
- **Template.** A template `t` is a finite sequence of segments.
- **Request.** A request `r` is a finite sequence of strings.
- **Matching.** `t` *matches* `r` when `|t| = |r|`, and for each index `i`,
  either `t[i] = Param` and `r[i] ≠ ""`, or `t[i] = Lit(r[i])`.
- **Kind vector.** `kinds(t)` is the sequence `isLiteral(t[i])`.
- **Ghost order.** `morePrecise(a, b)` is defined only for
  `|kinds(a)| = |kinds(b)|`. It holds when there is an index `i` such that
  `kinds(a)[j] = kinds(b)[j]` for every `j < i`, `kinds(a)[i]` is true, and
  `kinds(b)[i]` is false. It is the strict lexicographic order on kind vectors,
  with literal above parameter.

  The ghost order is defined without reference to any production function.
  `compareSpecificity(a, b)` must equal `-1` exactly when `morePrecise(a, b)`,
  `1` exactly when `morePrecise(b, a)`, and `0` otherwise.
- **Contract.** A contract is a finite sequence `T` of distinct templates
  satisfying `NoSkeletonCollision(T)`: no two members have equal kind vectors
  and equal literals at every literal position. Each member also has a method
  set `M(t)`, a non-empty finite set of method strings.

`resolveSegments(T, M, r, m)` returns one of three results. Let
`C = {t ∈ T : t matches r}`.

- `NotFound`, if `C` is empty.
- `Operation(best)`, if `C` is non-empty and `m ∈ M(best)`. Here `best` is the
  unique member of `C` that no other member of `C` is `morePrecise` than.
- `MethodNotAllowed(best)`, if `C` is non-empty and `m ∉ M(best)`.

Classification is
`classify(o) = overlay[o.operationId]?.classification ?? defaultFor(o)`. It is
defined over the set `O` of `/v2` operations in the pin.

Malformed inputs are rejected at the boundary, with per-code issues:

- In the contract, from `contract-document.ts` and the builder:
  - `empty-path-segment`;
  - `partial-segment-parameter`;
  - `path-template-collision`;
  - `duplicate-operation-id`;
  - `unsupported-http-method`.
- In the manifest:
  - `manifest-entry-not-in-contract`;
  - `manifest-entry-mismatch`;
  - `duplicate-manifest-entry`.
- At the adapter:
  - `contract-hash-mismatch`;
  - `provenance-invalid`;
  - `contract-document-invalid`.

Requests are never malformed: any string is accepted.

### Invariants and lemmas

- `INV-total-classification` (`REQ-every-v2-classified`): for every `o ∈ O`
  there is exactly one `RegisteredOperation`, with one complete
  `classification`. For the current pin `|operations| = |O| = 620`, and
  `Σ_cap |listByCapability(cap)| = 620`.
- `INV-overlay-exact` (`REQ-single-source`): every manifest entry matches
  exactly one `o ∈ O` on `operationId`, method, and template. A successful
  build implies this.
- `INV-query-agreement` (`REQ-query-dimensions`): for every `o ∈ O`:
  - `findByOperationId(o.id)` returns `o`;
  - `findByMethodAndTemplate(o.method, o.template)` returns `o`;
  - `findByMethodAndTemplate(o.method, renamed(o.template))` returns `o`;
  - `o` is a member of `listByCapability(o.capability)`;
  - `resolveRequest(o.method, instantiate(o.template))` resolves to `o`.

  `instantiate` uses a value that collides with no literal sibling.
- `L-precedence-spec`: `compareSpecificity` agrees exactly with the ghost
  order `morePrecise`, which also makes it a strict weak order. This is the
  lemma that pins down the "literal beats parameter" direction.
- `L-no-tie`: if `a` and `b` are distinct and skeleton-distinct, and both match
  the same `r`, then `morePrecise(a, b)` or `morePrecise(b, a)`.

  Proof idea: if the kind vectors were equal, every literal position would hold
  `r[i]` in both templates, so they would share a skeleton.
- `INV-most-specific`: when `C` is non-empty, the candidate that
  `selectMostSpecific` returns is in `C`. No member of `C` is `morePrecise`
  than it, and it is unique. Uniqueness implies `INV-order-independent`: the
  result is the same for every permutation of `T`, because the defining
  property refers only to set membership.
- `INV-concrete-first`: if some member of `C` is all-literal,
  `selectMostSpecific` returns it. This is stated as an explicit `ensures`.
- `INV-resolution-decision`: `resolveSegments` returns `NotFound` exactly when
  `C` is empty. It returns `Operation(best)` exactly when `best` has `m`, and
  `MethodNotAllowed(best)` exactly when it does not. This is the ADR 0007
  404/405 rule, stated as `ensures` clauses.
- `INV-405-allow` (runtime): `allow` is the sorted, duplicate-free, non-empty
  method list of `best`'s path item.
- `INV-trailing-slash` (runtime): for every request with at least one
  segment, appending `/` does not change the resolution.
- `INV-deterministic-listing` (runtime): `operations`, `listByCapability`,
  `excludedOperations`, and issue lists are sorted by code-unit comparison
  (`<`), never `localeCompare`. Builds from permuted documents deep-equal each
  other.

### Axioms (trusted, not verified here)

- `AXIOM-pin-integrity`: the artefact bytes are the bundled upstream contract
  at commit `ef3868ee…`, as recorded in the provenance file.
  - Source: ADR-0002 and the 1.3.1 tests.
  - Depended on by: the adapter, which re-checks the hash on every load.
- `AXIOM-oas-paths`: OpenAPI 3.0.3 semantics. Concrete paths match first,
  same-shape templates are forbidden, and `operationId` is unique.
  - Source: OpenAPI 3.0.3, Paths Object and Operation Object.
  - Depended on by: `D3` and the builder's rejections.
- `AXIOM-openapi-backend-router`: `OpenAPIRouter.matchOperation` in
  `openapi-backend` 5.18.0 behaves as follows:
  1. An exact path with the method wins.
  2. Otherwise, templated candidates are ordered by literal-character length,
     using a stable sort.
  3. The first candidate with the method is chosen.
  4. In strict mode, it throws `404-notFound` or `405-methodNotAllowed`.
  - Source: `node_modules/openapi-backend/router.js`.
  - Depended on by: `EP-M5`, exercised against the real package.
- `AXIOM-lemmascript-translation`: `lsc` 0.6.10 translates the annotated
  subset to Dafny faithfully, and Dafny 4.11 with Z3 4.12.1 is sound.
  - Source: LemmaScript `SPEC.md` and `SPEC_DAFNY.md`.
  - Depended on by: `EP-M6`. The `fast-check` oracle exercises the same
    TypeScript functions.
- `AXIOM-js-string`: JavaScript `===` and `<` on strings compare UTF-16 code
  units deterministically.
  - Source: ECMA-262.
  - The proof uses only string equality, which is identical under Dafny's
    Unicode-scalar strings and JavaScript's UTF-16 strings, for equality of
    the same sequence. No ordering of strings is reasoned about in the proof.

### Methods per obligation

#### `L-precedence-spec`, `L-no-tie`, `INV-most-specific`, `INV-concrete-first`, and `INV-resolution-decision`

- Method: formal proof with LemmaScript (Dafny backend), plus a `fast-check`
  regression net.
- Rationale:
  - these properties are universally quantified over unbounded templates and
    requests, and form the contractual core of ADR 0007 and `D3`;
  - writing them against the independent ghost order makes them substantive
    rather than restatements.
- Domain: all segment sequences.
  - A segment is a record `{isParameter: boolean; literal: string}` in a
    readonly array. A method set is a readonly array of strings.
  - The `EP-M0` prototype confirms the encoding. If records fail, Fallback 0
    below applies.
- Artefacts:
  - annotations in `src/openapi/path-template.ts` on `templateMatches`,
    `compareSpecificity`, `selectMostSpecific`, and `resolveSegments`, with
    ghost functions `kinds`, `morePrecise`, `allLiteral`, and
    `sameSkeleton`;
  - `proofs/openapi/path-template.dfy.gen`, which is generated;
  - `proofs/openapi/path-template.dfy`, which holds the generated code plus
    proof additions, including the `L-no-tie` lemma;
  - `lemmascript.json`, with `{"proof-dir": "proofs"}`;
  - `LemmaScript-files.txt`, containing `src/openapi/path-template.ts 60`.
- Evidence: `make prove` prints
  `Dafny program verifier finished with N verified, 0 errors`, and
  `bin/prove.sh` checks that `N` is at least the floor recorded in `EP-M6`.
- Non-vacuity:
  1. **Witness.** A Dafny method calls the lemmas on
     `['v2','projects','default']` with the templates `/v2/projects/default`
     and `/v2/projects/{project_id}`, and asserts the expected results. The
     prover must accept it, which proves the preconditions are satisfiable.
  2. **Seeded mutation.** In place on the branch, invert the
     literal-beats-parameter test in `compareSpecificity` and run `lsc regen`
     and `make prove`. Verification must fail on `L-precedence-spec`'s
     `ensures`, and on `INV-concrete-first`. Then restore with
     `git checkout -- src/openapi/path-template.ts proofs/`, and require
     `git diff --exit-code`.
  3. **Second seeded mutation.** Make `resolveSegments` return `NotFound` when
     `best` lacks the method. This must fail `INV-resolution-decision`.
  4. **Guard script.** `bin/prove.sh` fails in each of these cases:
     - `LemmaScript-files.txt` is empty;
     - any `assume`, `{:axiom}`, or `{:verify false}` appears in
       `proofs/**/*.dfy`;
     - `//@ extern` appears in the listed sources;
     - Dafny is not version 4.11.x;
     - no solver is present;
     - any timeout exceeds 60 s;
     - `lsc regen` leaves a diff;
     - the verified count is below the floor.

#### `INV-most-specific`, `INV-order-independent`, `INV-concrete-first`, `INV-trailing-slash`, and `INV-405-allow`, at runtime

- Method: `fast-check` property tests, seeded with `propertyTestSeed`,
  `numRuns: 1000`.
- Rationale: these properties also cover the parsing and normalization code
  outside the proof, and they cross-check that the proof corresponds to the
  code that runs.
- Domain and generators:
  - Each case draws one segment count `n` from 2 to 5, shared by all of the
    case's templates.
  - Templates are drawn with `fc.uniqueArray`, keyed on skeleton, from 2 to 8
    templates over the literal alphabet `a`, `b`, `default`.
  - Each template gets 1 to 3 methods.
  - A "hit" request instantiates a random template, replacing each parameter
    with either `x1` or a sibling literal at the same depth.
  - A separate "miss" request uses either the off-alphabet literal `zz` at a
    literal position, or a different segment count.
  - The two request kinds are mixed with `fc.oneof`.
  - Permutations use `fc.shuffledSubarray(items, {minLength: items.length})`.
- Artefacts:
  - `tests/path-template.test.ts`;
  - `tests/support/path-template-generators.ts`;
  - `tests/support/path-template-oracle.ts`.
- Oracle: an independent brute force.
  - It builds a `RegExp` from each template.
  - It encodes kind vectors as strings of `'1'` for a literal and `'0'` for
    a parameter.
  - It chooses the lexicographically greatest string, using string
    comparison.
- Evidence: `bun test tests/path-template.test.ts` passes. In the Red step,
  the same command fails against a stub that returns the first candidate, and
  fast-check shrinks the counterexample.
- Non-vacuity:
  - Counters in module scope are incremented inside the properties and
    asserted in an `afterAll`:
    - at least 15% of cases have two or more candidates;
    - at least 10% are `method-not-allowed`;
    - at least 10% are `not-found`;
    - at least 5% have an all-literal candidate competing with a templated
      one.

    A review Monte Carlo run of a corrected generator gave multi-candidate
    rates of 23 to 44%, and 405 rates of 46 to 56%.
  - A generator that admits skeleton collisions must make the builder reject
    the contract.
  - A seeded fault that ignores trailing slashes must fail
    `INV-trailing-slash`.

#### `INV-total-classification`, `INV-overlay-exact`, and `INV-query-agreement`

- Method: an exhaustive integration test over the real pin's 620 operations,
  plus parameterized behavioural tests on synthetic contracts for each issue
  code.
- Rationale: the domain is finite and fully enumerable, so exhaustive checking
  is complete for this pin. Re-running the test after any refresh
  re-establishes it. This is how the exhaustive-proof requirement is met for
  the classification rule (`D7`).
- Artefacts:
  - `tests/digitalocean-operation-registry.test.ts`;
  - `tests/operation-registry.test.ts`;
  - `tests/operation-registry-issues.test.ts`;
  - `tests/support/contract-builder.ts`.
- Evidence: with `D5` accepted, the test asserts these counts as literals:

  | Measure                      | Expected |
  | ---------------------------- | -------- |
  | Operations                   | 620      |
  | `scriptable`                 | 18       |
  | `engine-backed`              | 3        |
  | `stubbed`                    | 1        |
  | `unsupported`                | 598      |
  | `unsupported`, from manifest | 3        |
  | `unsupported`, from default  | 595      |
  | Excluded operations          | 15       |

  It then loops over every operation to check `INV-query-agreement`.
- Non-vacuity:
  - The counts are literals, not values derived from the code.
  - A negative control injects the stale path `/v2/ssh_keys` into a copy of
    the manifest. The build must fail with
    `manifest-entry-not-in-contract`.
  - A seeded default of `scriptable` must fail the count assertion.

#### `INV-deterministic-listing`

- Method: a property test that shuffles both `paths` keys and method keys,
  using the full-length `shuffledSubarray` described above.
- Artefact: `tests/operation-registry.test.ts`.
- Non-vacuity: a seeded fault that uses insertion order must fail.

#### Adapter failures

- Method: named examples, one per issue code: `contract-hash-mismatch`,
  `provenance-invalid`, and `contract-document-invalid`.
- These use temporary copies of the files, created under the test's
  `os.tmpdir()` directory and deleted in `afterEach`, passed through the
  adapter's location options.
- Artefact: `tests/pinned-contract-file.test.ts`.

#### Backplane parity and divergence pinning (`REQ-backplane`, `GAP-backplane-divergence`)

- Method: an exhaustive comparison over a deterministic, deduplicated,
  collision-rich corpus.
  - For every `/v2` template, the corpus holds the template instantiated
    with `x1`. It also holds every variant that replaces one parameter with a
    literal found at the same depth in a template with a compatible prefix.
  - Each corpus path is paired with all five methods.
- The router is a test-only `CachedRouter extends OpenAPIRouter`, which
  memoizes `getOperations()`. It is called with `strict = true`, so `404` and
  `405` throws map to distinct outcomes.
- A rule-based classifier labels each divergence as `method-fallthrough` or
  `literal-length-precedence`, and fails on anything else.
- Artefacts:
  - `tests/operation-registry-backplane-parity.test.ts`;
  - `tests/support/backplane-corpus.ts`;
  - `tests/fixtures/openapi-backend-divergences.json`, which holds
    `{pin, corpusSize, divergences: [{method, path, kind, registry, backend}]}`
    and `allowListed: [{method, path, rationale}]`.
- Evidence: the test asserts all of the following:
  - the corpus size equals the fixture's literal `corpusSize`, about 3,790,
    with the exact value recorded in `EP-M5`;
  - `pin` equals the provenance commit;
  - the classified divergences deep-equal the fixture;
  - no divergence touches an operation classified other than `unsupported`,
    except those on the allow-list;
  - Simulacrum's resolved `openapi-backend` path equals the test's, checked
    with `import.meta.resolve` from both locations.
- Non-vacuity:
  - Both divergence kinds must be present.
  - Deleting one fixture row must fail.
  - The test has a 30 s timeout and logs its duration.

### Formal verification decision

Formal proof is warranted for the precedence and resolution obligations (`D7`)
and nothing else.

- Totality of classification holds by construction, through a lookup with a
  default. Manifest reconciliation is a finite data check that the exhaustive
  test discharges completely.
- Model checking adds nothing, because the registry has no concurrency or
  mutable state.
- The proof does not cover string parsing (`parsePathTemplate`,
  `splitRequestPath`), the builder's indexing, or `openapi-backend`. The
  property and parity tests cover those.

If the `EP-M0` prototype is a no-go, try these fallbacks in order. Fallbacks 1
and 2 need the user's explicit waiver.

1. **Fallback 0.** Stay with LemmaScript but change the encoding: tuples or
   parallel arrays instead of records, or `//@ declare-type`. No waiver is
   needed.
2. **Fallback 1.** A hand-written Dafny model, linked to the TypeScript by a
   correspondence property test. This breaks the "proved functions are
   production functions" constraint.
3. **Fallback 2.** Bounded exhaustive enumeration of all kind vectors and
   literal assignments, up to length 6 over a 3-letter alphabet. This gives a
   bound, not a proof.

### Suggested BDD features

There is no BDD runner. These features are implemented as `bun:test`
`describe('Feature: …')` blocks, with one `it` per scenario.

Proposed for `tests/operation-registry.test.ts`, using a synthetic contract
(`EP-M3`, `REQ-query-dimensions`, `REQ-concrete-resolution`):

```gherkin
Feature: Query the operation registry
  Scenario: Find an operation by its pinned operation ID
    Given a contract with GET /v2/projects/{project_id} as projects_get
    When I find the operation with ID "projects_get"
    Then I receive the GET /v2/projects/{project_id} operation

  Scenario: Find an operation by method and a renamed path template
    Given a contract with GET /v2/projects/{project_id} as projects_get
    When I find GET /v2/projects/{id} by template
    Then I receive projects_get with path template /v2/projects/{project_id}

  Scenario: A concrete path beats a templated sibling
    Given GET /v2/projects/default and GET /v2/projects/{project_id}
    When I resolve GET /v2/projects/default
    Then the resolution is the projects_get_default operation with no path parameters

  Scenario: A known path with an unlisted method is not allowed
    Given /v2/projects/default supports GET, PATCH, and PUT
    And /v2/projects/{project_id} supports DELETE
    When I resolve DELETE /v2/projects/default
    Then the resolution is method-not-allowed with Allow GET, PATCH, PUT

  Scenario: An unknown path is not found
    When I resolve GET /v2/no-such-thing
    Then the resolution is not-found

  Scenario: A path outside /v2 is not found
    When I resolve GET /v1/models
    Then the resolution is not-found

  Scenario: A skeleton collision is rejected
    Given a contract with /v2/a/{x} and /v2/a/{y}
    When I build the registry
    Then the build fails with issue path-template-collision naming both templates
```

Proposed for `tests/digitalocean-operation-registry.test.ts`, using the real
pin through the adapter (`EP-M4`, `REQ-every-v2-classified`,
`REQ-single-source`, `REQ-pin-faithful`):

```gherkin
Feature: Classify the pinned DigitalOcean contract
  Scenario: Every /v2 operation is classified exactly once
    Given the pinned DigitalOcean OpenAPI artefact
    When I load the operation registry
    Then it contains 620 operations, each with exactly one complete classification
    And 15 non-/v2 operations are reported as excluded

  Scenario: DOKS engine-backed operations come from the manifest
    When I list engine-backed operations
    Then I receive kubernetes_delete_cluster, kubernetes_get_kubeconfig, and kubernetes_create_cluster

  Scenario: An unlisted operation defaults to unsupported
    When I find the operation with ID "droplets_create"
    Then its capability is unsupported, its source is default, and its release stage is v1
```

Proposed for `tests/pinned-contract-file.test.ts` (`EP-M4`, `REQ-pin-faithful`):

```gherkin
Feature: Load the pinned contract safely
  Scenario: A tampered artefact is rejected
    Given artefact bytes whose SHA-256 differs from the provenance record
    When I read the pinned contract
    Then reading fails with PinnedContractLoadError code contract-hash-mismatch
```

Proposed for `tests/base.test.ts`, end to end over HTTP (`EP-M4`):

```gherkin
Feature: Inspect capability metadata over the admin API
  Scenario: Capability rows use pinned identifiers
    Given a running DigitalPuddle simulation
    When I GET /_digitalpuddle/capabilities
    Then a row has operationId kubernetes_create_cluster, path /v2/kubernetes/clusters, and capability engine-backed
    And a row has path /v2/account/keys for sshKeys_list
    And no row has path /v2/account/ratelimit
```

## Plan of work

Each milestone ends with its gate sequence and a commit. Commit messages follow
`AGENTS.md`: imperative mood, a subject of 50 characters or fewer, a body
wrapped at 72 columns, and the attribution trailer. Delegate full gate runs to
the `scrutineer` agent. When a gate fails, read its cited log rather than
re-running it.

### `EP-M0` LemmaScript feasibility prototype and `make prove` scaffolding

Assigned: the `D7` feasibility check, and the proof-tooling risk. This is a
prototype, time-boxed to 3 hours.

1. Add the development dependency: `bun add -d --exact lemmascript@0.6.10`.
2. Create `lemmascript.json` containing `{"proof-dir": "proofs"}`.
3. Add `*.dfy.base` and `*.dfy.merged` to `.gitignore`.
4. Write a throwaway module, `proofs/prototype/segments.ts`. It holds a
   minimal `templateMatches` over
   `readonly {isParameter: boolean; literal: string}[]`, which uses string
   `===` under `noUncheckedIndexedAccess`. It also holds `compareSpecificity`.
   Annotate both with the `morePrecise` ghost specification and a `forall` loop
   invariant.
5. Run `node_modules/.bin/lsc gen --backend=dafny` on the module, then
   `node_modules/.bin/lsc check --backend=dafny`.
6. Confirm the 60 s full-verification cut-off in the installed `lsc.js`.

The prototype is a go if Dafny verifies `L-precedence-spec` for
`compareSpecificity`, and the seeded inversion fails verification. It is a
no-go if `lsc` rejects the subset, or cannot express record segments or the
quantified invariant after Fallback 0's encodings are tried. On a no-go, set
this plan to `BLOCKED`, record the transcript in `Artefacts and notes`, and
escalate with the fallbacks.

On a go:

1. Delete the prototype module and its proof files.
2. Keep the dependency, `lemmascript.json`, and `.gitignore` entries.
3. Add `bin/prove.sh`, adapted from velocetty's guard pattern with the
   additional guards in `Verification plan`.
4. Add a `prove` target to the `Makefile` and its `.PHONY` list. Do not add
   it to `all`, because CI runs it as a separate step.
5. Leave `LemmaScript-files.txt` empty. `bin/prove.sh` treats an empty list
   as success only until `EP-M6`; it detects this through a guarded
   `PROVE_ALLOW_EMPTY=1` set in the `Makefile` until then. `EP-M6` removes that
   allowance.

Gates: the standard four. Commit: "Add LemmaScript proof scaffolding".

### `EP-M1` Split capability policy from manifest data (refactor)

Assigned: `GAP-oversize-module`. There is no behaviour change.

1. Move these from `src/openapi/capabilities.ts` into a new
   `src/openapi/v1-capability-manifest.ts`, with an `@file` header:
   - `v1CapabilityManifest`;
   - the four runtime presets (`scriptableRuntime`, `engineBackedRuntime`,
     `stubbedRuntime`, and `unsupportedRuntime`), which are exported;
   - `validateV1CapabilityManifest`.
2. Update every importer. Find them with `codegraph_find_by_imports`, or with
   `grep -rn v1CapabilityManifest src tests`.
3. Keep the barrel's public names unchanged.

Validation: the existing suite passes unchanged, and `wc -l src/openapi/*.ts`
shows every file at or below 400 lines. There is no red step, because this is a
pure refactor. Commit: "Split v1 capability manifest from policy".

### `EP-M2` Path-template domain module

Assigned: `REQ-concrete-resolution` at runtime, `INV-trailing-slash`, and
`INV-concrete-first`.

Create `src/openapi/path-template.ts`. It is pure, and contains no imports
except types. The signatures are in `Interfaces and dependencies`.

- `parsePathTemplate`;
- `splitRequestPath`;
- `templateSkeleton`;
- `templateMatches`;
- `compareSpecificity`;
- `selectMostSpecific`;
- `resolveSegments`;
- `extractPathParameters`.

Write the functions that `EP-M6` will annotate in the subset that `EP-M0`
proved workable. Use indexed `for` and `while` loops and early returns, with no
closures, `Map`, or regular expressions. These functions are `templateMatches`,
`compareSpecificity`, `selectMostSpecific`, and `resolveSegments`.

1. Red: write `tests/path-template.test.ts` and its support modules first.
   - Named examples come from the pin: `/v2/projects/default` against
     `/v2/projects/{project_id}`, and the `droplets/autoscale` pair.
   - Table rows cover the parser issues.
   - The properties use the oracle and counters from `Verification plan`.

   Run them against stub exports that throw `new Error('not implemented')`, and
   expect failures for that reason.
2. Green: implement the module.
3. Refactor: extract helpers from any function longer than about 25 lines.

Focused command: `bun test tests/path-template.test.ts`. Then run the standard
gates and `make prove`. Commit: "Add OpenAPI path-template precedence module".

### `EP-M3` Contract boundary schema and pure registry

Assigned: `REQ-query-dimensions`, `REQ-concrete-resolution`, `INV-405-allow`,
`INV-deterministic-listing`, `D1`, `D4`, and `D6`.

- `src/openapi/contract-document.ts`:
  - `contractDocumentSchema` is a Zod schema for the subset the registry
    reads. That subset is `paths`, each path item's keys, with all eight
    OpenAPI method names passed through so the builder can reject the
    unsupported ones, and, per operation, `operationId`, `tags`, and
    `summary`. Unknown keys are allowed.
  - `parseContractDocument(json: JsonValue)` returns
    `{ok: true, contract} | {ok: false, issues}`, with issue code
    `contract-document-invalid` and Zod paths.
- `src/openapi/operation-registry-issues.ts`: the per-code discriminated union
  `OperationRegistryIssue`, an issue sorter, and `OperationRegistryBuildError`.
- `src/openapi/operation-registry.ts`:
  - the types `RegisteredOperation`, `OperationClassification`,
    `RequestResolution`, `OperationRegistry`, and
    `OperationRegistryBuildResult`;
  - `buildOperationRegistry({contract, classifications, identity,
    defaultReleaseStage})`, which:
    1. walks the paths in sorted order;
    2. excludes paths not under `/v2/`;
    3. parses the templates;
    4. rejects skeleton collisions, duplicate IDs, and unsupported methods;
    5. indexes by ID, skeleton and method, and capability;
    6. joins the classification entries, rejecting entries that do not
       match exactly;
    7. synthesizes `D4` defaults.
  - `resolveRequest` uses per-segment-count buckets and delegates the
    decision to `resolveSegments`.

  If the builder grows past about 300 lines, split the indexing into
  `src/openapi/operation-registry-index.ts`.

1. Red: write these tests first and run them against stubs:
   - `tests/operation-registry.test.ts`, with the Gherkin-mapped scenarios
     and the listing-determinism property;
   - `tests/operation-registry-issues.test.ts`, with one row per issue code;
   - `tests/support/contract-builder.ts`.
2. Green: implement.
3. Extend `tests/openapi-layout.test.ts`:
   - assert the new barrel exports;
   - add a transitive import-direction test. Starting from each pure module,
     it follows relative imports, and skips `import type` and `export type`.
     It fails if any reachable module imports `^node:`, `express`,
     `@simulacrum/`, or `openapi-backend`.

Gates: the standard four, plus `make prove`. Commit: "Add pure OpenAPI
operation registry".

### `EP-M4` Reconcile the manifest with the pin, and load it from the artefact

Assigned: `REQ-every-v2-classified`, `REQ-single-source`, `REQ-pin-faithful`,
`GAP-manifest-drift`, `D2`, and `D5`. This milestone is `BLOCKED` unless the
user has accepted `D5`.

Rekey `src/openapi/v1-capability-manifest.ts` in one atomic change. Old dotted
IDs become pinned IDs, and paths become pinned templates. `productArea` values
stay as authored; the upstream tag is exposed separately as
`RegisteredOperation.tag`.

Table 1: v1 manifest rekey mapping (planning-probe evidence, pin `ef3868ee`).

| Old ID                      | Old path                       | New `operationId`            | New path template                                                |
| --------------------------- | ------------------------------ | ---------------------------- | ---------------------------------------------------------------- |
| `account.get`               | `/v2/account`                  | `account_get`                | `/v2/account`                                                    |
| `account.getRateLimit`      | `/v2/account/ratelimit`        | removed (`D5`)               | absent from pin                                                  |
| `regions.list`              | `/v2/regions`                  | `regions_list`               | `/v2/regions`                                                    |
| `sizes.list`                | `/v2/sizes`                    | `sizes_list`                 | `/v2/sizes`                                                      |
| `images.list`               | `/v2/images`                   | `images_list`                | `/v2/images`                                                     |
| `sshKeys.list`              | `/v2/ssh_keys`                 | `sshKeys_list`               | `/v2/account/keys`                                               |
| `sshKeys.create`            | `/v2/ssh_keys`                 | `sshKeys_create`             | `/v2/account/keys`                                               |
| `sshKeys.get`               | `/v2/ssh_keys/{id}`            | `sshKeys_get`                | `/v2/account/keys/{ssh_key_identifier}`                          |
| `sshKeys.delete`            | `/v2/ssh_keys/{id}`            | `sshKeys_delete`             | `/v2/account/keys/{ssh_key_identifier}`                          |
| `projects.list`             | `/v2/projects`                 | `projects_list`              | `/v2/projects`                                                   |
| `projects.create`           | `/v2/projects`                 | `projects_create`            | `/v2/projects`                                                   |
| `projects.get`              | `/v2/projects/{id}`            | `projects_get`               | `/v2/projects/{project_id}`                                      |
| `projects.assignResources`  | `/v2/projects/{id}/resources`  | `projects_assign_resources`  | `/v2/projects/{project_id}/resources`                            |
| `projects.listResources`    | `/v2/projects/{id}/resources`  | `projects_list_resources`    | `/v2/projects/{project_id}/resources`                            |
| `actions.get`               | `/v2/actions/{id}`             | `actions_get`                | `/v2/actions/{action_id}`                                        |
| `kubernetes.getOptions`     | `/v2/kubernetes/options`       | `kubernetes_list_options`    | `/v2/kubernetes/options`                                         |
| `kubernetes.listClusters`   | `/v2/kubernetes/clusters`      | `kubernetes_list_clusters`   | `/v2/kubernetes/clusters`                                        |
| `kubernetes.createCluster`  | `/v2/kubernetes/clusters`      | `kubernetes_create_cluster`  | `/v2/kubernetes/clusters`                                        |
| `kubernetes.getCluster`     | `/v2/kubernetes/clusters/{id}` | `kubernetes_get_cluster`     | `/v2/kubernetes/clusters/{cluster_id}`                           |
| `kubernetes.deleteCluster`  | `/v2/kubernetes/clusters/{id}` | `kubernetes_delete_cluster`  | `/v2/kubernetes/clusters/{cluster_id}`                           |
| `kubernetes.getKubeconfig`  | `…/clusters/{id}/kubeconfig`   | `kubernetes_get_kubeconfig`  | `/v2/kubernetes/clusters/{cluster_id}/kubeconfig`                |
| `kubernetes.listNodePools`  | `…/clusters/{id}/node_pools`   | `kubernetes_list_nodePools`  | `/v2/kubernetes/clusters/{cluster_id}/node_pools`                |
| `kubernetes.getNodePool`    | `…/node_pools/{pool_id}`       | `kubernetes_get_nodePool`    | `/v2/kubernetes/clusters/{cluster_id}/node_pools/{node_pool_id}` |
| `kubernetes.updateNodePool` | `…/node_pools/{pool_id}` (PUT) | `kubernetes_update_nodePool` | `/v2/kubernetes/clusters/{cluster_id}/node_pools/{node_pool_id}` |
| `droplets.list`             | `/v2/droplets`                 | `droplets_list`              | `/v2/droplets`                                                   |
| `spacesKeys.list`           | `/v2/spaces/keys`              | `spacesKey_list`             | `/v2/spaces/keys`                                                |
| `digitalocean.unsupported`  | `/v2/{path*}`                  | removed (`D4`)               | replaced by the default rule                                     |

In the same commit:

1. Retype `toUnsupportedOperationResponse` in `src/handlers/unsupported.ts` to
   take a `Pick<RegisteredOperation, 'operationKey' | 'classification'>`. Its
   message stays
   `'<METHOD> <path> is not implemented by DigitalPuddle <releaseStage>.'`.
2. Delete `buildUnsupportedOperationLookup` from `src/openapi/projections.ts`,
   together with its barrel export and tests. The registry's
   `listByCapability('unsupported')` and `resolveRequest` supersede it.
3. Seed the `fast-check` runs in the touched test files with
   `propertyTestSeed`.

Then add the I/O pieces.

- `src/openapi/pinned-contract-file.ts`, the driven adapter, holds:
  - `readPinnedContract(locations?: {contractUrl?: URL; provenanceUrl?:
    URL})`, which returns `PinnedContract`, that is
    `{document: JsonValue; identity: PinnedContractIdentity}`. The defaults
    resolve from the module URL. It uses `readFileSync`, validates the
    provenance, asserts the hash, and decodes with `jsonValueSchema`.
  - `PinnedContractLoadError`, with `code: 'contract-hash-mismatch' |
    'provenance-invalid' | 'contract-document-invalid'` and `cause`.
- `src/openapi/digitalocean-operation-registry.ts`, the composition, holds
  `loadDigitalOceanOperationRegistry(locations?)`.
  - It is memoized on success, per process, when called without locations.
  - It throws `OperationRegistryBuildError` with either `issues` or the load
    error as `cause`, and never caches a failure.
  - It uses `v1CapabilityManifest` and `defaultReleaseStage: 'v1'`.
  - It logs one structured line:
    `{"event":"digitalpuddle.registry.built","operationCount":620,"excludedCount":15,"pin":"ef3868ee…"}`.

  The barrel does not re-export the composition.

The Red, Green, and Refactor sequence:

1. Red: update `tests/openapi-capabilities.test.ts`,
   `tests/openapi-projections.test.ts`, and the `tests/base.test.ts` assertions
   to the new IDs. Write `tests/digitalocean-operation-registry.test.ts` and
   `tests/pinned-contract-file.test.ts`. They fail on the old IDs and the
   missing modules.
2. Green: rekey and implement.
3. Regenerate the snapshots with
   `bun test --update-snapshots tests/openapi-layout.test.ts tests/base.test.ts`.
   Review the diff by hand: only operation IDs, paths, and the removed
   rate-limit row may change.

Gates: the standard four, plus `make prove`. Commits: "Rekey capability
manifest to pinned operations", whose body lists Table 1, then "Load operation
registry from pinned artefact". Each commit passes the gates.

### `EP-M5` Backplane parity guard

Assigned: `REQ-backplane` and `GAP-backplane-divergence`.

1. Add the development dependency:
   `bun add -d --exact openapi-backend@5.18.0`.
2. Write `tests/support/backplane-corpus.ts` and
   `tests/operation-registry-backplane-parity.test.ts`, as described in
   `Verification plan`.
3. Red: commit a fixture with an empty `divergences` list and
   `corpusSize: 0`. Observe the failure, which lists the classified divergences
   and the actual corpus size.
4. Green: write the observed values to the fixture.
5. Check by hand that only `method-fallthrough` and
   `literal-length-precedence` appear. Review every divergence that touches an
   operation classified other than `unsupported` (for example
   `DELETE /v2/projects/default`, whose backend target `projects_delete` is
   `unsupported`). Add each one to the allow-list with a rationale, or escalate.

Gates: the standard four, plus `make prove`. Commit: "Pin registry and
backplane resolution divergences".

### `EP-M6` LemmaScript proof of precedence and resolution

Assigned: `L-precedence-spec`, `L-no-tie`, `INV-most-specific`,
`INV-concrete-first`, `INV-resolution-decision`, and `D7`.

1. Annotate `templateMatches`, `compareSpecificity`, `selectMostSpecific`
   (`//@ requires candidates.length > 0`), and `resolveSegments` with
   `//@ requires`, `//@ ensures`, `//@ invariant`, and `//@ decreases`, using
   the ghost functions.
2. Add `src/openapi/path-template.ts 60` to `LemmaScript-files.txt`.
3. Run `node_modules/.bin/lsc gen --backend=dafny src/openapi/path-template.ts`.
4. Add proof steps and the `L-no-tie` lemma in
   `proofs/openapi/path-template.dfy`.
5. Add the witness method.
6. Remove `PROVE_ALLOW_EMPTY`.
7. Record the verified-count floor in `bin/prove.sh`.

Red: run `make prove` with `ensures` clauses but no proof additions. Dafny must
report unproved postconditions. Green: add proof steps until it reports 0
errors.

Run both seeded mutations as described in `Verification plan`, restore, and
confirm `git diff --exit-code`. Record the transcripts.

If `lsc regen` reports a merge conflict between `.dfy.gen` and `.dfy`, resolve
it in `proofs/openapi/path-template.dfy`. Keep the regenerated code from
`.dfy.gen` and re-apply only the proof additions. Then re-run `lsc regen`,
which must leave no diff.

CI: extend `.github/workflows/ci.yml` with these steps after
`bun install --frozen-lockfile`:

1. `actions/setup-dotnet`, pinned by SHA.
2. `actions/cache`, for `~/.dotnet/tools`, keyed on Dafny `4.11.0` and the Z3
   archive SHA-256.
3. "Install Dafny and Z3 for LemmaScript", running
   `dotnet tool install --global dafny --version 4.11.0` when the cache misses.
   It downloads Z3 4.12.1 with `curl --fail --retry 3`, checks the SHA-256, and
   installs Z3 beside Dafny, as velocetty does.
4. "Prove LemmaScript contracts", running `make prove`. Never add
   `continue-on-error`.

Gates: the standard four, plus `make prove`. The new CI steps must be green on
the draft PR. Commit: "Prove path-template precedence with LemmaScript".

### `EP-M7` Documentation and delivery closure

Delegate the mechanical documentation edits to the `scribe` agent, with exact,
evidence-based instructions.

1. Create `docs/adrs/adr-0009-operation-registry-resolution.md`, recording
   `D2` to `D4` and `D6`. It includes the rejected alternatives, the RFC 9110
   §9.1 deviation, and the consequence for 2.4.1. List it in
   `docs/developers-guide.md` §2.1.
2. Update `docs/digitalpuddle-technical-design.md`:
   - §6.5: unsupported *operations* return `501`, while unknown `/v2` paths
     return `404`;
   - §7.1: the registry mechanism, the default rule, the excluded
     operations, and a reference to ADR 0009;
   - §8.2 Table 1: pinned path templates, and the rate-limit row per `D5`;
   - §8.4: rate-limit headers;
   - §16: the new `src/openapi/` modules and `proofs/`.
3. Update `docs/developers-guide.md` §7 with the new modules, and add an
   "Operation registry" subsection covering:
   - the query API and the resolution rules;
   - how to add a classification;
   - `make prove` and its guards;
   - that `continue-on-error` on the prove step is a review blocker;
   - the pin-refresh procedure: re-run the count and parity tests, and
     update the divergence fixture in a separate, reviewed commit;
   - the `projects_get_default` follow-up for 2.2.2.
4. Update `docs/users-guide.md`, "Capability classifications" and
   "Inspecting the capability metadata":
   - admin rows show pinned operation IDs and paths;
   - SSH keys are at `/v2/account/keys`;
   - unlisted `/v2` operations are `unsupported` by default;
   - unknown `/v2` paths will be `404`, not `501`.
5. Add a `CHANGELOG.md` entry under an "Unreleased" heading, in the file's
   existing style.
6. Update `docs/roadmap.md`:
   - mark 1.3.2 `[x]`;
   - reword 2.1.1 per `D5`;
   - amend 2.4.1's success criterion per `D8`.
7. Search for stale claims and fix every live hit. Completed ExecPlans are
   historical and must not be edited.

   ```bash
   grep -rn 'ssh_keys\|ratelimit\|account\.get\|kubernetes\.createCluster\|{path\*}' \
     docs src tests README.md --exclude-dir=execplans
   ```

Gates: the standard four, then `make prove`, `make markdownlint` (which also
runs spelling), and `make nixie`. Commit: "Document the operation registry".
Then reconcile `Conformance basis`, complete `Outcomes & retrospective`, and
set the status to `COMPLETE`.

## Milestones and plateaus

### `EP-M0`

- Outcome: the proof toolchain is proven workable, and the scaffolding is
  committed.
- Requirements: `D7` feasibility.
- Evidence: the prototype transcript, and the mutation failure.
- Conformance checks:
  - the dependency is the authorized, exactly pinned one;
  - no production code has changed.
- Recovery: revert the commit. On a no-go, the plan is `BLOCKED`.
- Remaining gaps: everything else.
- Compatibility decision: none.

### `EP-M1`

- Outcome: `capabilities.ts` is split, with identical behaviour.
- Requirements: `GAP-oversize-module`.
- Evidence: the unchanged suite passes, and every file is at or below 400
  lines.
- Conformance checks:
  - no behaviour or interface change;
  - barrel names are unchanged.
- Recovery: revert.
- Compatibility decision: none.

### `EP-M2`

- Outcome: the precedence and resolution logic exists and is tested.
- Requirements: `REQ-concrete-resolution` at runtime.
- Evidence: `tests/path-template.test.ts` passes, with the counter
  thresholds met.
- Conformance checks:
  - the module is pure;
  - it follows `D3` exactly.
- Recovery: revert.
- Remaining gaps: the registry and the proof.
- Compatibility decision: none.

### `EP-M3`

- Outcome: the pure registry answers every query on synthetic contracts.
- Requirements: `REQ-query-dimensions`, `REQ-concrete-resolution`.
- Evidence: the registry tests, the issue tests, and the transitive
  import-direction test pass.
- Conformance checks:
  - the domain imports nothing from I/O;
  - the issue union is closed and per-code.
- Recovery: revert.
- Remaining gaps: the real pin and the manifest.
- Compatibility decision: none.

### `EP-M4`

- Outcome: the real pin is classified, and the admin payload uses pinned IDs.
- Requirements: `REQ-every-v2-classified`, `REQ-single-source`,
  `REQ-pin-faithful`, `GAP-manifest-drift`.
- Evidence: the exact counts are asserted; the adapter failure tests and the
  end-to-end admin test pass.
- Conformance checks:
  - `D5` has been accepted;
  - the artefact is unmodified;
  - the only observable change is to the admin rows.
- Recovery: revert both commits together.
- Remaining gaps: parity, the proof, and the documentation.
- Compatibility decision: none. These are internal identifiers in a pre-1.0
  package.

### `EP-M5`

- Outcome: the backplane divergences are explicit and guarded.
- Requirements: `REQ-backplane`.
- Evidence: the parity test passes against the fixture within 30 s.
- Conformance checks:
  - only the two divergence kinds appear;
  - the allow-list has been reviewed;
  - the dependency is development-only and pinned.
- Recovery: revert.
- Compatibility decision: none.

### `EP-M6`

- Outcome: the precedence and resolution lemmas are proved, and CI enforces
  them.
- Requirements: the `L-*` lemmas and `INV-resolution-decision`.
- Evidence: `make prove` reports 0 errors at or above the floor; the mutation
  transcripts are recorded; the CI step is green.
- Conformance checks:
  - the proved functions are the production functions;
  - there are no trust constructs.
- Recovery: if CI installation fails for infrastructure reasons, record it
  and escalate. Never delete the step silently.
- Compatibility decision: none.

### `EP-M7`

- Outcome: the documentation matches the implementation, and the roadmap is
  ticked.
- Requirements: all trace links are closed.
- Evidence: all gates pass, and the stale-claim search is clean.
- Conformance checks: ADR 0009, the design updates, and the roadmap
  amendments have been reviewed.
- Recovery: revert the documentation commit.
- Remaining gaps: 1.3.3 and 2.4.1, which are out of scope.
- Compatibility decision: none.

## Concrete steps

Working directory: the repository root. Use Bash with `set -o pipefail`, so a
failed gate cannot appear to pass through `tee`.

```bash
set -o pipefail
BR=1-3-2-operation-registry-from-pinned-api-contract
make check-fmt    2>&1 | tee /tmp/check-fmt-digitalpuddle-$BR.out
make typecheck    2>&1 | tee /tmp/typecheck-digitalpuddle-$BR.out
make lint         2>&1 | tee /tmp/lint-digitalpuddle-$BR.out
make test         2>&1 | tee /tmp/test-digitalpuddle-$BR.out
make prove        2>&1 | tee /tmp/prove-digitalpuddle-$BR.out         # from EP-M0
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-$BR.out  # documentation changes
make nixie        2>&1 | tee /tmp/nixie-digitalpuddle-$BR.out         # documentation changes
```

`make markdownlint` runs `make spelling`, which regenerates `typos.toml` from
the shared spelling policy. If that leaves a diff, commit it separately as
"Refresh generated typos configuration". That happened once during planning;
see commit `5d965b2`.

Focused Red, Green, and mutation checks for each milestone:

```plaintext
EP-M0 Go:     lsc check --backend=dafny proofs/prototype/segments.ts -> "0 errors"; inverted rule -> postcondition failure
EP-M2 Red:    bun test tests/path-template.test.ts -> failures "not implemented"
EP-M2 Green:  bun test tests/path-template.test.ts -> all pass; afterAll counter assertions pass
EP-M3 Red:    bun test tests/operation-registry.test.ts tests/operation-registry-issues.test.ts -> failures against stubs
EP-M4 Red:    bun test tests/digitalocean-operation-registry.test.ts tests/openapi-capabilities.test.ts -> old IDs fail
EP-M5 Red:    bun test tests/operation-registry-backplane-parity.test.ts -> divergence list and corpus size printed
EP-M6 Red:    make prove -> unproved postconditions in proofs/openapi/path-template.dfy
EP-M6 Green:  make prove -> "finished with N verified, 0 errors", N >= floor
EP-M6 Mutant: invert literal preference -> L-precedence-spec fails; restore; git diff --exit-code
```

Known baseline: the gates are expected to pass at `889431f`. Before `EP-M0`,
run the four gates once on the unchanged tree and record the results here.

## Validation and acceptance

After `EP-M7`, run this check:

```bash
bun -e "import {loadDigitalOceanOperationRegistry as l} from './src/openapi/digitalocean-operation-registry.ts'; \
const r = l(); console.log(r.operations.length, r.excludedOperations.length, \
JSON.stringify(r.resolveRequest('DELETE','/v2/projects/default')))"
```

It is expected to print one `digitalpuddle.registry.built` log line, then:

```plaintext
620 15 {"kind":"method-not-allowed","pathTemplate":"/v2/projects/default","allow":["GET","PATCH","PUT"]}
```

Quality criteria:

- **Tests.** `make test` passes, including the new suites:
  - `tests/path-template.test.ts`;
  - `tests/operation-registry.test.ts`;
  - `tests/operation-registry-issues.test.ts`;
  - `tests/digitalocean-operation-registry.test.ts`;
  - `tests/pinned-contract-file.test.ts`;
  - `tests/operation-registry-backplane-parity.test.ts`;

  and the updated `tests/base.test.ts`.
- **Verification.**
  - `make prove` reports 0 errors, at or above the floor, for
    `L-precedence-spec`, `L-no-tie`, `INV-most-specific`,
    `INV-concrete-first`, and `INV-resolution-decision`;
  - both mutation transcripts are recorded;
  - the property counters meet their thresholds.
- **Lint and types.** `make check-fmt`, `make typecheck`, and `make lint`
  pass with no new suppressions. Any `as` assertion carries Oxlint's required
  safety comment.
- **Documentation.** `make markdownlint` and `make nixie` pass.
- **Performance.** Building the registry from the real pin completes within
  a generous 2,000 ms bound, and the test logs the measured value. The parity
  test completes within its 30 s timeout.

## Idempotence and recovery

Every step can be re-run:

- the tests and gates are read-only, except for deliberate, reviewed snapshot
  updates;
- `lsc gen` and `lsc regen` regenerate the `*.dfy.gen` files
  deterministically, at the exactly pinned version;
- `bun install` is lockfile-pinned.

To abandon a milestone, reset to the previous milestone commit; each milestone
is a commit. Seeded mutations are always restored with `git checkout --`, then
`lsc regen` and `git diff --exit-code`. Planning probes live under
`/tmp/dp-probe`, and are never committed.

## Artefacts and notes

These are planning and review probes at `889431f`. They are not implementation
evidence.

Pin statistics:

```plaintext
openapi 3.0.0; paths 430; operations 635; /v2 operations 620; missing operationId 0; duplicate IDs 0
methods: get 331, post 136, delete 93, put 61, patch 14
non-/v2 paths: /<upload_url>, /api/v1/chat/completions, /v1/async-invoke, /v1/batches, … (14 paths, 15 operations)
skeleton collisions: none; templated/literal sibling pairs: 35; largest same-length bucket: 140 templates
```

`openapi-backend` parity probe. The raw corpus double-counts; the review
reconstruction found about 3,790 unique requests.

```plaintext
{ total: 3945, diffPath: 4, diff405: 67 }
GET /v2/droplets/autoscale/destroy_with_associated_resources:
  registry=/v2/droplets/autoscale/{autoscale_pool_id}:autoscalepools_get
  backend=droplets_list_associatedResources
DELETE /v2/databases/options: registry=405 backend=databases_destroy_cluster
DELETE /v2/projects/default:  registry=405 backend=projects_delete
```

Review timing probe (host load average about 30):

```plaintext
matchOperation over ~3,790 requests: Bun 7.8–11.4 s; Node 18.7 s; with getOperations cached: 0.95–1.06 s
read + SHA-256 + parse of the 3.5 MB pin: ~25–40 ms; full registry scan of 8,320 requests: ~14 ms
```

## Interfaces and dependencies

`src/openapi/path-template.ts` is pure. Annotated functions use only the proof
subset.

```ts
export interface PathSegment {
  readonly isParameter: boolean;
  readonly literal: string; // '' for parameters
}
export interface ParsedTemplate {
  readonly template: string;
  readonly segments: readonly PathSegment[];
  readonly parameterNames: readonly string[]; // in segment order
  readonly skeleton: string;                  // e.g. '/v2/projects/{}'
}
export type PathTemplateIssue = {
  readonly code: 'empty-path-segment' | 'partial-segment-parameter';
  readonly template: string;
};
export type SegmentResolution =
  | {readonly kind: 'not-found'}
  | {readonly kind: 'operation'; readonly templateIndex: number}
  | {readonly kind: 'method-not-allowed'; readonly templateIndex: number};

export const parsePathTemplate: (template: string) => ParsedTemplate | PathTemplateIssue;
export const splitRequestPath: (path: string) => readonly string[];
export const templateSkeleton: (segments: readonly PathSegment[]) => string;
export const templateMatches: (segments: readonly PathSegment[], request: readonly string[]) => boolean;
export const compareSpecificity: (a: readonly PathSegment[], b: readonly PathSegment[]) => -1 | 0 | 1;
export const selectMostSpecific: (candidates: readonly (readonly PathSegment[])[]) => number; // requires length > 0
export const resolveSegments: (
  templates: readonly (readonly PathSegment[])[],
  methodSets: readonly (readonly string[])[],
  request: readonly string[],
  method: string
) => SegmentResolution;
export const extractPathParameters: (
  template: ParsedTemplate,
  request: readonly string[]
) => Readonly<Record<string, string>>; // raw, not percent-decoded
```

`src/openapi/operation-registry.ts` is pure:

```ts
export interface PinnedContractIdentity {
  readonly upstreamCommit: string;
  readonly contractSha256: string;
}
export interface OperationClassification {
  readonly capability: Capability;
  readonly releaseStage: string;
  readonly productArea: string;
  readonly exposeInDocs: boolean;
  readonly runtime: CapabilityManifestEntry['runtime'];
  readonly followOnPhase: string | undefined;
  readonly notes: string | undefined;
  readonly source: 'manifest' | 'default';
}
export interface RegisteredOperation {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly pathTemplate: string;
  readonly operationKey: string; // createOperationKey(method, pathTemplate)
  readonly tag: string | undefined; // first OpenAPI tag
  readonly summary: string | undefined;
  readonly classification: OperationClassification;
}
export type RequestResolution =
  | {
      readonly kind: 'operation';
      readonly operation: RegisteredOperation;
      readonly pathParameters: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'method-not-allowed';
      readonly pathTemplate: string;
      readonly allow: readonly HttpMethod[];
    }
  | {readonly kind: 'not-found'};
export interface OperationRegistry {
  readonly identity: PinnedContractIdentity;
  readonly operations: readonly RegisteredOperation[]; // sorted by operationKey, code-unit order
  readonly excludedOperations: readonly string[]; // operation keys outside /v2, sorted
  findByOperationId(operationId: string): RegisteredOperation | undefined;
  findByMethodAndTemplate(method: HttpMethod, pathTemplate: string): RegisteredOperation | undefined;
  listByCapability(capability: Capability): readonly RegisteredOperation[];
  resolveRequest(method: string, requestPath: string): RequestResolution; // path excludes query string
}
export type OperationRegistryBuildResult =
  | {readonly ok: true; readonly registry: OperationRegistry}
  | {readonly ok: false; readonly issues: readonly OperationRegistryIssue[]};
export const buildOperationRegistry: (input: {
  readonly contract: ContractDocument;
  readonly classifications: readonly CapabilityManifestEntry[];
  readonly identity: PinnedContractIdentity;
  readonly defaultReleaseStage: string;
}) => OperationRegistryBuildResult;
```

`src/openapi/operation-registry-issues.ts` is pure. Each variant carries the
data needed to name the offender:

```ts
export type OperationRegistryIssue =
  | {readonly code: 'empty-path-segment' | 'partial-segment-parameter'; readonly template: string}
  | {readonly code: 'path-template-collision'; readonly templates: readonly string[]}
  | {readonly code: 'duplicate-operation-id'; readonly operationId: string; readonly operationKeys: readonly string[]}
  | {readonly code: 'unsupported-http-method'; readonly template: string; readonly method: string}
  | {readonly code: 'contract-document-invalid'; readonly path: readonly (string | number)[]; readonly message: string}
  | {readonly code: 'manifest-entry-not-in-contract'; readonly operationId: string; readonly operationKey: string}
  | {
      readonly code: 'manifest-entry-mismatch';
      readonly operationId: string;
      readonly expected: string;
      readonly actual: string;
    }
  | {readonly code: 'duplicate-manifest-entry'; readonly operationId: string};
export class OperationRegistryBuildError extends Error {
  readonly issues: readonly OperationRegistryIssue[];
}
```

The I/O modules are not re-exported from the barrel:

- `src/openapi/pinned-contract-file.ts` holds `readPinnedContract`,
  `PinnedContract`, and `PinnedContractLoadError`.
- `src/openapi/digitalocean-operation-registry.ts` holds
  `loadDigitalOceanOperationRegistry`.

The reuse policy:

- `src/openapi/operation-registry.ts` owns resolution and classification
  lookup.
- Later handlers, the 1.3.3 matrix, and the 2.4.1 `501` catch-all must query
  the registry. They must not re-parse the artefact or re-implement matching.
- `createOperationKey` stays in `capabilities.ts`, and is reused for
  `operationKey`.
- `toUnsupportedOperationResponse` takes registry data.

Dependencies are development-only and pinned exactly: `lemmascript` `0.6.10` and
`openapi-backend` `5.18.0`. There are no runtime additions. The host and CI
tools are Dafny 4.11.0, Z3 4.12.1, and the .NET SDK.

## Revision note

- 2026-11-15: initial draft from Wyvern reconnaissance and planning probes.
- 2026-11-15: revised after a three-member community-of-experts design review.
  - **Proof.** The specification is now written against an independent ghost
    order, and is extended to the full 404/405/operation decision. The plan
    adds 60 s timeouts with a verified-count floor, exact version pins, and a
    `proofs/` directory.
  - **Sequencing.** The proof prototype moves to `EP-M0`, and the full proof
    moves off the critical path to `EP-M6`.
  - **Interfaces.** The loader is synchronous. Every operation now carries a
    complete classification record. Issues and errors are per-code
    discriminated unions. Identifiers were renamed for the lint rules. The
    unsupported helpers were retyped, and the superseded lookup removed.
  - **Tests.** The property generators and counters are corrected, and the
    parity test is fast, strict, and resistant to rubber-stamping.
  - **Tolerances.** Corrected and itemized.
  - **Design reconciliation.** §6.5 is reconciled with ADR 0007, and the
    roadmap 2.4.1 amendment is added.

  These revisions change the milestone order (`EP-M0` to `EP-M7`) and the
  public names (`findByMethodAndTemplate`, `skeleton`,
  `path-template-collision`). The remaining work is unchanged in scope, except
  for the removal of `buildUnsupportedOperationLookup` and the retyping of
  `toUnsupportedOperationResponse`.
