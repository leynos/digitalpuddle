# 1.3.2 Build the operation registry from the pinned OpenAPI contract

This ExecPlan (execution plan) is a living document. The sections `Constraints`,
`Tolerances`, `Risks`, `Progress`, `Surprises & discoveries`, `Decision log`,
`Outcomes & retrospective`, `Conformance basis`, and `Verification plan` must
be kept up to date as work proceeds.

Status: DRAFT (awaiting design review and user approval)

Branch: `1-3-2-operation-registry-from-pinned-api-contract`

Roadmap item: `1.3.2` in `docs/roadmap.md`.

## Purpose / big picture

DigitalPuddle is a local DigitalOcean API simulator. It pins one revision of
DigitalOcean's public OpenAPI contract in
`src/openapi/digitalocean.openapi.json` (roadmap task 1.3.1). It also has a
hand-written capability manifest in `src/openapi/capabilities.ts`, which says
which public operations DigitalPuddle supports and how. Today these two sources
know nothing about each other. The manifest was written before the pin existed,
and it disagrees with the pin in ways that would make every later route
implementation wrong:

- the manifest invents operation identifiers such as `kubernetes.createCluster`,
  while the pin calls the same operation `kubernetes_create_cluster`;
- the manifest places SSH keys at `/v2/ssh_keys`, while the pin defines them at
  `/v2/account/keys`;
- the manifest names path parameters `{id}`, while the pin uses
  `{cluster_id}`, `{project_id}`, `{action_id}`, and `{node_pool_id}`;
- the manifest classifies `GET /v2/account/ratelimit`, which does not exist in
  the pin at all;
- the manifest contains a pseudo-operation `GET /v2/{path*}` that is not an
  operation in any contract.

Nothing can currently answer "which DigitalOcean operation is this request, and
is it supported?". The pin contains 635 operations. 620 of them live under
`/v2`. The rest are 15 GradientAI inference operations under `/v1`, `/api/v1`,
and a templated upload URL. None of the 620 has a classification.

After this work, a developer can build an **operation registry**: an immutable,
in-memory index of every `/v2` operation in the pin. Each operation carries
exactly one release capability classification: `scriptable`, `engine-backed`,
`stubbed`, or `unsupported`. Classifications come from the reconciled manifest;
every operation the manifest does not list is `unsupported` by rule. The
registry can be queried by operation ID, by method and path template, by
capability class, and by a concrete request such as
`DELETE /v2/kubernetes/clusters/9f1c`. For example:

```ts
import {loadDigitalOceanOperationRegistry} from './src/openapi/index.ts';

const registry = await loadDigitalOceanOperationRegistry();

registry.findByOperationId('kubernetes_create_cluster')?.capability;
// 'engine-backed'

registry.resolveRequest('GET', '/v2/projects/default');
// { kind: 'operation', operation: { operationId: 'projects_get_default', … },
//   pathParameters: {} }

registry.resolveRequest('DELETE', '/v2/projects/default');
// { kind: 'method-not-allowed', allow: ['GET', 'PATCH', 'PUT'] }

registry.resolveRequest('GET', '/v2/no-such-thing');
// { kind: 'not-found' }

registry.listByCapability('engine-backed').map((op) => op.operationId);
// ['kubernetes_create_cluster', 'kubernetes_delete_cluster',
//  'kubernetes_get_kubeconfig'] (sorted by operation key)
```

The registry is not yet wired into HTTP routing. Roadmap tasks 1.3.3 (the
capability matrix), 2.4.1 (the `/v2` catch-all `501` handler), and 2.1.1
onwards (route implementations) consume it. The one externally observable
change in this task is the private admin route
`GET /_digitalpuddle/capabilities`. Its rows will use the pinned operation IDs
and path templates, will no longer list the non-existent rate-limit route, and
will move SSH keys to `/v2/account/keys`. The users' guide documents that
change.

This task closes the open questions that ADR 0007 and the 1.1.3 and 1.3.1 plans
left for "the registry". They are: how the sidecar manifest relates to the pin,
what classification an unlisted operation receives, and how 404, 405, and 501
are told apart for a concrete request.

## Constraints

- Implementation begins only after the user explicitly approves this plan.
  Silence is not approval.
- Simulacrum (`@simulacrum/foundation-simulator`) remains the HTTP backplane.
  This task must not replace, fork, or monkey-patch its routing. It must not
  change what `simulation()` passes as `apiSchema`. The GitHub schema stays the
  default until a later roadmap task changes it.
- Domain and policy code must not import Express, Simulacrum,
  `openapi-backend`, `node:fs`, `node:path`, network, or process modules. That
  code is `src/openapi/path-template.ts`, `src/openapi/contract-document.ts`,
  `src/openapi/operation-registry.ts`, `src/openapi/capabilities.ts`,
  `src/openapi/v1-capability-manifest.ts`, and `src/openapi/projections.ts`.
  The only exception is the existing `zod` use. ADR 0007 requires this
  boundary, and a new import-direction test in `tests/openapi-layout.test.ts`
  enforces it.
- `src/openapi/artifact.ts` must stay free of filesystem, network, and process
  dependencies, as its header and the developers' guide §8 require. Filesystem
  access goes in a new adapter module.
- The pinned artefact `src/openapi/digitalocean.openapi.json` and its
  provenance file must not be modified. The registry reads them, verifies the
  recorded SHA-256 hash, and never decorates or rewrites them.
- The registry must use the pin's upstream `operationId` values verbatim.
  Never normalize, re-case, or strip suffixes from them. Two upstream IDs end in
  `.yml`, `monitoring_get_appRestartCountMetrics.yml` and
  `monitoring_get_droplet_autoscale_current_cpu_utilization.yml`, and must
  survive unchanged.
- The functions that the LemmaScript proof covers must be the functions that
  run in production. Do not keep a second "verified copy" of the precedence
  logic.
- No source-API compatibility machinery. The manifest's operation IDs and paths
  are application-internal: `src/index.ts` does not export them, and the
  package is pre-1.0 (`0.1.0`). Rekey the manifest and update every caller,
  test, and snapshot in the same commit. Add no aliases from old dotted IDs to
  new IDs.
- The only externally observable payload change allowed is to the rows of
  `GET /_digitalpuddle/capabilities`, as described in `Purpose`. Its envelope
  shape, the `legend` value, and the status codes stay unchanged.
- Every code file stays at or below 400 lines (`AGENTS.md`, "Keep file size
  manageable"). `src/openapi/capabilities.ts` is already 443 lines at base
  revision `889431f`, so this plan splits it before growing anything near it.
- Authorized dependency changes, subject to plan approval. Both are
  development dependencies only:
  - `lemmascript` `^0.6.10`, to supply the `lsc` proof tool;
  - `openapi-backend` `^5.18.0`, so the backplane-parity test can import the
    router it measures instead of relying on a hoisted transitive copy. The
    Simulacrum dependency already installs `openapi-backend` 5.18.0.

  No runtime dependency may be added.
- All documentation uses en-GB-oxendict spelling and follows
  `docs/documentation-style-guide.md`. Do not rewrite completed ExecPlans for
  1.1.2, 1.1.3, 1.2.2, or 1.3.1; they are historical records.
- Gates run sequentially, never in parallel, in this order: `make check-fmt`,
  `make typecheck`, `make lint`, `make test`. From `EP-M3` onwards,
  `make prove` follows them. For documentation changes, `make markdownlint` and
  `make nixie` follow too.

## Tolerances (exception triggers)

ExecPlan files, including this one, are excluded from every count below. Counts
compare the working tree against the merge base with `origin/main`. Use these
commands:

```bash
base="$(git merge-base origin/main HEAD)"
git diff --numstat "$base" -- . ':(exclude)docs/execplans/**' ':(exclude)bun.lock' ':(exclude)**/*.dfy.gen'
git diff --name-only "$base" -- . ':(exclude)docs/execplans/**' | wc -l
```

Classification by purpose:

- Code: `src/**/*.ts`, `tests/**/*.ts`, `tests/**/*.json` fixtures, `scripts/*`,
  `bin/*`, hand-maintained `*.dfy` proof files, and the `Makefile`.
- Configuration: `package.json`, `LemmaScript-files.txt`, `tsconfig.json`,
  `biome.json`, `.oxlintrc.json`, and `.github/workflows/*.yml`. Shell embedded
  in a workflow file counts as code under hunk-based accounting.
- Documentation: `docs/**/*.md` except ExecPlans, `README.md`, and
  `CHANGELOG.md`.
- Generated and excluded: `bun.lock`, regenerable `*.dfy.gen` files written by
  `lsc gen`, and Bun snapshot files under `tests/__snapshots__/`. Snapshot
  churn is still reviewed, but it is not budgeted.

Budgets, measured as net lines (additions minus deletions):

- Files: stop and escalate if more than 34 non-ExecPlan files change.
- Code: stop and escalate above 2,300 net lines.
- Configuration: stop and escalate above 90 net lines.
- Documentation: stop and escalate above 450 net lines.

Each category is enforced on its own. Spare capacity in one does not offset
another.

Basis for the estimate. The base-revision survey found these sizes:

- `src/openapi/capabilities.ts`: 443 lines;
- `src/openapi/projections.ts`: 117;
- `src/openapi/artifact.ts`: 137;
- `src/openapi/index.ts`: 41;
- `src/admin/capabilities.ts`: 54;
- `src/handlers/unsupported.ts`: 54;
- `tests/openapi-capabilities.test.ts`, `tests/openapi-projections.test.ts`,
  `tests/openapi-layout.test.ts`, and `tests/base.test.ts`: existing callers
  that must change with the rekey.

The planned new code is:

- `path-template.ts`, about 180 lines including annotations;
- `contract-document.ts`, about 90;
- `operation-registry.ts`, about 300;
- the pinned-contract file adapter and its composition, about 110;
- the manifest split, about 300 moved lines, roughly zero net;
- about 1,000 lines of tests across unit, property, integration, and parity
  suites;
- a proof wrapper script, about 90 lines;
- the hand-maintained `.dfy` proof, about 250 lines.

That totals about 2,000 net lines. A 15% contingency gives 2,300. Configuration
covers 2 development dependencies, 1 script, a 3-line LemmaScript list, and
about 45 lines of CI steps for Dafny and Z3, roughly 60 in all, with 90
allowed. Documentation covers a new ADR (about 110 lines), the technical design
§§7.1, 8.2, 16 (about 70), the developers' guide (about 110), the users' guide
(about 50), and the roadmap and changelog (about 15), roughly 355 in all, with
450 allowed.

Historical evidence:

- 1.1.3 budgeted 12 files and 700 net lines without revision.
- 1.2.2 budgeted 35 files and 1,200 net lines without revision.
- 1.3.1 budgeted 10 files and 650 net lines. Its `Decision Log` records
  "accept scope tolerance overrun" to add command, documentation, and test
  seams, without recording the new figures. That overrun was missed scope:
  tests and documentation for a command path were under-counted.

This plan therefore budgets tests and documentation explicitly, per category,
instead of using one blended line count.

Other triggers:

- Interface: stop if any change is needed to `src/index.ts` exports, the
  `simulation()` argument types, or the `/_digitalpuddle/capabilities` envelope
  beyond row content.
- Dependencies: stop if any dependency beyond the two authorized in
  `Constraints` is needed, or if either must become a runtime dependency.
- Architecture: stop if the registry cannot be built without modifying the
  pinned artefact, or if the `openapi-backend` parity test shows divergence
  classes beyond the two recorded in `Surprises & discoveries`. That would
  falsify the precedence decision (`D3`).
- Proof feasibility: stop if the `EP-M3` LemmaScript prototype cannot express
  or discharge `L-no-tie` and `INV-most-specific` within 6 hours of effort, or
  if discharging them would need an `assume`, `{:axiom}`, or `//@ extern`
  beyond those listed in `Verification plan`.
- Iterations: stop if a focused test or proof still fails after 3 fix attempts
  within one milestone.
- Time: stop if any single milestone exceeds 8 hours of active work.
- Ambiguity: stop and present options if a pinned operation's classification
  is unclear, or if a manifest entry cannot be mapped to exactly one pinned
  operation. The rate-limit route (`D5`) is the known case.

## Risks

- Risk: LemmaScript is a technology preview (0.6.10 at 15 November 2026). It
  may not translate the chosen TypeScript subset, or it may change behaviour
  between patch releases. Severity: medium. Likelihood: medium. Mitigation:
  `EP-M3` starts with a time-boxed prototype that decides go or no-go. Pin the
  version with a caret range and commit `bun.lock`. Keep the proved module
  small and free of string parsing. If no-go, escalate with the fallback
  options in `Verification plan`, "Formal verification decision".

- Risk: CI has no Dafny or Z3. A `make prove` that passes locally but never
  runs in CI gives false assurance. Severity: medium. Likelihood: high.
  Mitigation: `EP-M3` adds a CI step that installs Dafny 4.11.0 and the pinned
  Z3 4.12.1 with a checksum, then runs `make prove`. The sibling repository
  `leynos/velocetty` already uses this pattern in
  `.github/workflows/nodejs.yml`, with the `make prove` wrapper in
  `bin/prove.sh`.

- Risk: Loading 3.5 MB of JSON and hashing it adds start-up cost if a later
  task does it on every request. Severity: low. Likelihood: low. Mitigation: a
  planning probe measured the parse at about 20 ms under Bun. The loader is
  memoized per process, and the registry builds once.

- Risk: Resolving `import.meta.url` to read the artefact may break in the
  CommonJS build (`dist/index.cjs`). Severity: medium. Likelihood: low in this
  task, because `src/index.ts` does not import the registry and tsdown only
  bundles from that entry. Mitigation: the adapter takes the artefact location
  as a parameter, with a default resolved from the module URL. The developers'
  guide records that wiring the registry into the package entry needs a build
  check (`make build`) before it ships. Defer the decision to the task that
  wires it.

- Risk: The registry's resolution rule disagrees with `openapi-backend`, the
  router Simulacrum uses. Requests could then be classified as one operation
  and dispatched as another. Severity: high for later routing tasks.
  Likelihood: certain; the planning probe found it. Mitigation: `D3` adopts the
  OpenAPI-specified rule. `EP-M6` adds a parity test over a collision-rich
  corpus generated from the pin. Every divergence is pinned in a checked-in
  fixture, so a pin refresh that adds a new divergence fails the gate. ADR 0009
  records the consequence for roadmap task 2.4.1.

- Risk: Rekeying the manifest changes snapshot files and the admin payload.
  Reviewers might read this as unintended churn. Severity: low. Likelihood:
  certain. Mitigation: the rekey is a single atomic commit in `EP-M5`. Its
  message lists every old-to-new mapping, and the users' guide documents the
  payload change.

- Risk: The pin may contain a pair of templated paths with the same shape but
  different parameter names, which OpenAPI forbids. The registry would then
  have to pick one. Severity: medium. Likelihood: low; the planning probe found
  no shape collisions in the current pin. Mitigation: the builder rejects shape
  collisions with a named issue. A pin refresh that introduces one fails loudly
  rather than silently resolving.

## Progress

- [x] (2026-11-15 21:40Z) Reconnaissance: Wyvern team surveyed `src/openapi`,
  the handlers, admin routes, tests, tooling, ADRs, guides, and previous plans.
- [x] (2026-11-15 22:05Z) Planning probes: pin statistics; path-shape
  collisions; `openapi-backend` parity corpus (3,945 requests).
- [x] (2026-11-15 22:30Z) Initial draft written.
- [ ] Design review by a community-of-experts agent team, and revision.
- [ ] Plan approved by the user.
- [ ] `EP-M1` split `src/openapi/capabilities.ts` into policy and data modules
  (refactor, no behaviour change).
- [ ] `EP-M2` path-template domain module, with unit and property tests.
- [ ] `EP-M3` LemmaScript precedence proof and `make prove`, wired into CI
  (starts with a prototype gate).
- [ ] `EP-M4` contract-document boundary schema and the pure registry builder
  and queries.
- [ ] `EP-M5` reconcile the v1 manifest with the pin; add the file adapter and
  `loadDigitalOceanOperationRegistry`; update the admin payload end to end.
- [ ] `EP-M6` `openapi-backend` parity guard with the pinned divergence
  fixture.
- [ ] `EP-M7` ADR 0009, design and guide updates, changelog, roadmap tick, and
  final gates.

## Surprises & discoveries

- Observation: the v1 seed manifest does not match the pin. Nineteen of its 27
  entries use paths or parameter names that differ from the pinned templates.
  All 27 use invented dotted operation IDs. Evidence: a planning probe over
  `src/openapi/digitalocean.openapi.json` at revision `889431f` printed the
  pinned operations for each manifest path. For example,
  `/v2/ssh_keys → MISSING` and
  `/v2/account/keys GET:sshKeys_list POST:sshKeys_create`. Impact: `EP-M5` must
  rekey every entry. See `D2` and the mapping table in `Plan of work`.

- Observation: `GET /v2/account/ratelimit` does not exist in the pin.
  DigitalOcean reports rate limits through the `ratelimit-limit`,
  `ratelimit-remaining`, and `ratelimit-reset` response headers. Evidence: the
  probe found no path matching `ratelimit` other than an unrelated monitoring
  metric. Impact: `D5` proposes removing the entry. That is a deviation from
  technical design Table 1 and needs user acceptance.

- Observation: the pin has 635 operations. 620 are under `/v2`, all with unique
  `operationId` values. The methods used are only `get` (331), `post` (136),
  `delete` (93), `put` (61), and `patch` (14). No path-item-level `parameters`
  appear. Evidence: probe output at revision `889431f`. Impact: the closed
  `httpMethodValues` vocabulary is sufficient for the current pin. The builder
  must still reject `head`, `options`, and `trace` explicitly, so that a future
  pin refresh fails loudly.

- Observation: `openapi-backend` 5.18.0, used by Simulacrum, resolves requests
  differently from the OpenAPI rule that concrete paths match before templated
  ones. First, it falls back to a templated path when the concrete path lacks
  the method. `DELETE /v2/databases/options` dispatches to
  `databases_destroy_cluster`, where ADR 0007 requires `405`. Second, it ranks
  templated candidates by the total length of their literal characters, not
  segment by segment.
  `GET /v2/droplets/autoscale/destroy_with_associated_resources` dispatches to
  `droplets_list_associatedResources`, not to `autoscalepools_get`. Evidence:
  `node_modules/openapi-backend/router.js` `matchOperation`, and a probe over
  3,945 generated requests. It found 67 method fallthrough disagreements and 4
  path-precedence disagreements, which are 2 distinct paths each counted twice.
  Impact: `D3`, `EP-M6`, and ADR 0009.

- Observation: `src/handlers/unsupported.ts` and
  `buildUnsupportedOperationLookup` have no production caller. Nothing matches
  `/v2` requests against the manifest; a `/v2` request today falls through to
  Simulacrum's final `404`. Evidence: Wyvern reconnaissance of
  `src/extend-api.ts`, `src/simulation.ts`, and the Simulacrum
  `dist/index.mjs`. Impact: this task does not need to preserve any runtime
  `501` behaviour. Wiring that behaviour belongs to 2.4.1.

- Observation: three existing property tests are unseeded, despite the
  developers' guide: `tests/openapi-capabilities.test.ts:68`, `:206`, and
  `tests/openapi-projections.test.ts:94`. Impact: the new tests use
  `propertyTestSeed` from `tests/support/property-test-seed.ts`. Fixing the
  existing three is out of scope, but is noted for a follow-up.

## Decision log

- D1. Decision: build the registry as a pure domain module, with explicit
  ports.
  - The builder `buildOperationRegistry(input)` takes an already-parsed
    contract document and classification entries, and returns a discriminated
    union. It does not throw for invalid data.
  - The pinned artefact is loaded by a separate driven adapter,
    `src/openapi/pinned-contract-file.ts`. It reads bytes, verifies the hash
    through the existing helpers in `src/openapi/artifact.ts`, and parses JSON.
  - `loadDigitalOceanOperationRegistry()` composes the two and throws
    `OperationRegistryBuildError`, with the structured issues, on failure.

  Rationale: ADR 0007 requires capability policy to stay independent of
  filesystem I/O and Express. The pure builder can be unit- and property-tested
  with small synthetic contracts. The rejected alternative was to build the
  registry at module initialization, as `v1CapabilityManifest` does. That would
  read 3.5 MB of JSON as a side effect of any import, and make unhappy paths
  untestable without the real file. Date/Author: 2026-11-15, planning agent.

- D2. Decision: keep classifications in the sidecar manifest, rekeyed to the
  pin's `operationId`, method, and path template. Do not write
  `x-digitalpuddle-capability` into the pinned artefact. Every manifest entry
  must match exactly one pinned `/v2` operation on all three fields, or
  registry construction fails. Rationale: the artefact is a hashed release
  input, and its provenance test asserts that its bytes match the upstream
  bundle. Decorating it would break that guarantee and couple policy changes to
  pin refreshes. ADR 0007 permits the extension ("may"); it does not require
  it. A projection that decorates a copy of the document belongs to the
  `/_digitalpuddle/openapi` admin route (design §13), not here. The manifest
  keeps `method` and `path` alongside `operationId`. They are redundant with
  the pin, but the existing projections and the admin payload read them, and
  the cross-check turns any drift into a build failure. Task 1.3.3 may remove
  the redundancy when it moves projections onto the registry. Date/Author:
  2026-11-15, planning agent.

- D3. Decision: concrete requests resolve by the OpenAPI path-item-first rule.
  1. Normalize the request path by removing trailing `/` characters (except
     for the root). No other normalization: no slash collapsing and no
     percent-decoding.
  2. Find every `/v2` path template whose segment count matches and whose
     literal segments are equal; a parameter segment matches any non-empty
     segment.
  3. Choose the most specific template. Compare segment kinds from left to
     right, where a literal beats a parameter at the first position where they
     differ.
  4. Look up the method on that template's path item. Return the operation if
     present. Otherwise return `method-not-allowed`, with the sorted `Allow`
     set of that path item's methods.
  5. Return `not-found` when no template matches.

  Rationale: OpenAPI 3.0.3, Paths Object, says "concrete (non-templated) paths
  would be matched before their templated counterparts". ADR 0007 requires
  `405` with `Allow` for known paths with unlisted methods. Segment-wise
  precedence is the conventional generalization of the rule to partially
  templated paths. With no shape collisions it makes the result independent of
  document order (`INV-most-specific`, `INV-order-independent`). The rejected
  alternative was to mirror `openapi-backend` exactly. That would make `405`
  unreachable for 67 probed requests, and it ranks by character counts, which
  are an artefact of naming. The consequence is that later tasks routing
  through Simulacrum must consult the registry before `openapi-backend`
  dispatches, or must reconcile the pinned divergence set. ADR 0009 records
  this. Date/Author: 2026-11-15, planning agent.

- D4. Decision: every pinned `/v2` operation that the manifest does not list is
  classified `unsupported`, with `classificationSource: 'default'`. Listed ones
  carry `classificationSource: 'manifest'`. Operations outside `/v2` are
  excluded from the registry and reported only as a count with their keys
  (`excludedOperations`). Rationale: ADR 0007 requires exactly one
  classification per operation known to the pinned contract. Technical design
  Table 1's final row ("any other `/v2/*` → unsupported, explicit `501`") is
  that default stated in prose. The roadmap success criterion counts only `/v2`
  operations, and design §8.1 places all public endpoints under `/v2`. The
  pseudo-entry `GET /v2/{path*}` is removed from the manifest because the rule
  replaces it. A request to an unknown `/v2` path remains `not-found` (`404`),
  not `501`, as ADR 0007 keeps them distinct. Date/Author: 2026-11-15, planning
  agent.

- D5. Decision (requires user acceptance; this is a proposed deviation):
  remove `account.getRateLimit` (`GET /v2/account/ratelimit`) from the
  manifest. Update technical design Table 1 and §8.4 to state that rate-limit
  information is served through the rate-limit response headers that the pin
  documents on every response, not through a route. Upstream identifiers
  affected: technical design §8.2 Table 1, row 2; roadmap 2.1.1 wording
  ("account, rate-limit, regions…"). Options:
  1. Remove it, and reword 2.1.1 to say "rate-limit headers". This is the
     recommended option.
  2. Keep it as a DigitalPuddle-only extension route outside the registry.
     This would contradict "contract-first" (design §8.1).
  3. Keep the entry, and make the registry tolerate entries absent from the
     pin. This would break the one-validated-source guarantee.

  The plan proceeds with option 1 only after the user accepts it. Otherwise
  `EP-M5` is `BLOCKED` on this decision. Date/Author: 2026-11-15, planning
  agent.

- D6. Decision: look up by method and path template by *shape*, where
  parameter names are ignored, so `/v2/kubernetes/clusters/{id}` finds
  `/v2/kubernetes/clusters/{cluster_id}`. The result always reports the pinned
  template. Manifest cross-checks still require the exact pinned template.
  Rationale: OpenAPI declares same-shape templates identical. Shape keys make
  callers robust to parameter renames between pins, and they let the builder
  detect forbidden shape collisions. Exact matching for the manifest keeps
  documentation faithful to the pin. Date/Author: 2026-11-15, planning agent.

- D7. Decision: discharge the precedence lemmas with LemmaScript (Dafny
  backend), applied to the production module `src/openapi/path-template.ts`.
  Back them with `fast-check` properties that use an independent oracle.
  Discharge classification totality and manifest reconciliation by exhaustive
  tests over the real pin, not by proof. Rationale: precedence is contractual
  routing logic with a universally quantified claim (uniqueness of the most
  specific match, and independence from order). Sampling cannot establish that.
  Classification totality is total by construction (a lookup with a default),
  so a proof would only restate the code. The data-dependent part, that every
  manifest entry maps to exactly one pinned operation, is a finite check over
  620 operations, and an exhaustive test establishes it fully. Date/Author:
  2026-11-15, planning agent.

- D8. Decision: record D2 to D4 and D6 in a new ADR,
  `docs/adrs/adr-0009-operation-registry-resolution.md`, rather than amending
  the accepted ADR 0007. Rationale: ADR 0007 defines the vocabulary and leaves
  the registry mechanism open. The resolution rule and its divergence from the
  backplane router are durable, hard-to-reverse decisions with consequences for
  2.4.1, so they need their own record. Date/Author: 2026-11-15, planning agent.

## Outcomes & retrospective

Not started. Complete at each milestone boundary and at completion.

## Context and orientation

Inspected base revision: `889431f` ("Remove the tool list from AGENTS.md
(#118)") on `main`. Line numbers below refer to that revision. Relocate symbols
with `grep -n '<symbol>' <file>`.

Runtime and tooling. The repository is TypeScript run by Bun 1.3.11
(`packageManager` in `package.json`), with TypeScript 6.0. `tsconfig.json`
enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, and
`allowImportingTsExtensions`, and includes `tests/**/*.ts`, so `make typecheck`
checks `*.test-d.ts` type tests. The other tools are:

- Biome 2.5, for formatting and linting: single quotes, 120 columns, no
  trailing commas, no bracket spacing;
- Oxlint 1.82 with `ai-deslop` and type-aware rules, configured in
  `.oxlintrc.json`;
- Zod 4.6, for boundary validation;
- `fast-check` 4.10, for property tests;
- `bun:test`, the test runner.

`make test` runs `bun test --max-concurrency=1 tests`.

There is no BDD runner and none will be added. Behavioural tests are `bun:test`
suites whose `@file` header says "Behavioural tests". They use `describe` and
`it` sentences. Proposed Gherkin scenarios (in `Verification plan`) are
implemented as `describe('Feature: …')` blocks with one `it` per scenario.

The host has Dafny 4.11.0 at `~/.local/bin/dafny`, with its Z3 under
`~/.dotnet/tools`. CI (`.github/workflows/ci.yml`) has neither Dafny nor Z3,
and runs `make all`, a Markdown lint action, `bun run audit`, and `make build`.

The pieces that exist today:

- `src/openapi/capabilities.ts` (443 lines). It holds the capability
  vocabulary (`capabilityValues`, `capabilitySchema`), the HTTP method
  vocabulary (`httpMethodValues = ['DELETE','GET','PATCH','POST','PUT']`), the
  runtime-behaviour vocabulary, and the manifest entry schema
  (`capabilityManifestEntrySchema`, whose `superRefine` holds the ADR 0007
  rules). It also has `createOperationKey(method, path)`, which produces
  `"METHOD /path"` with slashes collapsed and trailing slashes removed;
  `validateCapabilityManifest`, which rejects duplicate keys; and the 27-entry
  `v1CapabilityManifest`, validated at import time with a structured
  `console.info` log.
- `src/openapi/projections.ts` (117 lines) builds the capability matrix, the
  documentation metadata, and the unsupported lookup from manifest entries.
  Rows are sorted by `localeCompare`.
- `src/openapi/artifact.ts` (137 lines) holds pure helpers for the pin. These
  are the paths, the commit
  `digitalOceanOpenApiPin = 'ef3868ee4cadd34fd4f9624371f7a45d7a205fc1'`,
  `sha256Hex`, `validateDigitalOceanOpenApiProvenance`, and the
  provenance-to-bytes hash assertion. It performs no I/O.
- `src/openapi/index.ts` is the barrel that later work imports from.
- `src/admin/capabilities.ts` memoizes
  `buildCapabilityDocumentationMetadata()` for
  `GET /_digitalpuddle/capabilities`. `src/admin/routes.ts` registers that
  route, and `src/extend-api.ts` composes it into Simulacrum.
- `src/handlers/unsupported.ts` builds a DigitalOcean-shaped `501` envelope. It
  has no production caller.
- `src/simulation.ts` and `src/index.ts`: `simulation()` still passes the
  GitHub schema as `apiSchema`. Simulacrum mounts it through `openapi-backend`
  5.18.0 (see `node_modules/@simulacrum/foundation-simulator/dist/index.mjs`,
  lines 74-140). The package entry exports nothing from `src/openapi`.

The tests that touch this area are:

- `tests/openapi-capabilities.test.ts`, with unit and property tests that
  assert dotted IDs such as `account.get`;
- `tests/openapi-projections.test.ts`, with behavioural tests that include the
  `501` envelope message
  `'GET /v2/droplets is not implemented by DigitalPuddle v1.'`;
- `tests/openapi-layout.test.ts`, which checks barrel exports and snapshots the
  full matrix;
- `tests/base.test.ts`, which starts the server on port 2999, snapshots
  `/_digitalpuddle/capabilities`, and asserts `kubernetes.createCluster` is
  `engine-backed`;
- `tests/digitalocean-openapi-artifact.test.ts`, with provenance and hash
  tests;
- `tests/support/property-test-seed.ts`, which exports
  `propertyTestSeed = 13_101`.

Terms used in this plan:

- An *operation* is one method on one path in the OpenAPI document. Its
  *operation key* is `"METHOD /path/template"`.
- A *path template* is an OpenAPI path such as
  `/v2/projects/{project_id}`. Its *segments* are the strings between `/`
  characters. A segment is a *parameter* when it is wrapped in braces, and a
  *literal* otherwise.
- The *shape* of a template replaces every parameter name with `{}`.
- A *concrete request path* is what a client sends, such as
  `/v2/projects/9f1c`.
- *Most specific* means preferred by the segment-wise precedence in `D3`.
- A *classification overlay* is the set of manifest entries that override the
  default `unsupported` classification.
- *Backplane parity* is agreement between this registry's resolution and
  `openapi-backend`'s `matchOperation`.

Signposts. Read these documents:

- `docs/digitalpuddle-technical-design.md` §§4, 7.1, 8.1, 8.2, 13, and 16;
- `docs/adrs/adr-0002-digitalocean-openapi-pin.md`;
- `docs/adrs/adr-0007-release-capability-policy.md`;
- `docs/developers-guide.md` §7 ("Capability policy") and §8 ("DigitalOcean
  OpenAPI artefact refresh");
- `docs/users-guide.md` ("Capability classifications" and "Admin routes");
- `docs/mocking-services-with-simulacrum-actors-and-stable-keyset-connections.md`.
  In particular, read §21 ("Use OpenAPI as scaffolding") and the guidance near
  lines 635-641 on indexed lookups and pure domain rules.

`docs/complexity-antipatterns-and-refactoring-strategies.md`, cited in the
request, does not exist in this repository; the 1.3.1 Wyvern search confirmed
its absence. Apply `AGENTS.md`, "Refactoring Heuristics & Workflow", instead.

Load these skills:

- `execplans`, for maintaining this document;
- `hexagonal-architecture`, for the port and adapter boundaries in `D1`;
- `typescript-router`, then `typescript-boundaries-and-validation` for the
  contract schema, and `typescript-errors-and-outcomes` for the build-result
  union;
- `fast-check`, for properties;
- `typescript-verification` and `lemmascript`, for `EP-M3`;
- `codegraph-mcp`, for caller and impact queries before the rekey;
- `biome-typescript`, for lint findings;
- `en-gb-oxendict`, for documentation.

## Conformance basis

These are the upstream artefacts, all inspected at base revision `889431f`:

- no Terms of Reference document exists in this repository;
- the technical design `docs/digitalpuddle-technical-design.md`, §§4, 7.1, 8.1,
  8.2, 8.4, 13, 16, and 17.2 (cited as `TDD-§n`);
- ADRs: `adr-0001-simulacrum-backplane.md` (ADR-0001),
  `adr-0002-digitalocean-openapi-pin.md` (ADR-0002), and
  `adr-0007-release-capability-policy.md` (ADR-0007);
- the roadmap `docs/roadmap.md`, item 1.3.2, and dependants 1.3.3, 2.1.1,
  2.4.1, and 3.3.1;
- governing standards: `AGENTS.md`, `docs/documentation-style-guide.md`, and
  OpenAPI Specification 3.0.3, Paths Object
  (<https://spec.openapis.org/oas/v3.0.3.html#paths-object>).

Derived requirements:

- `REQ-every-v2-classified`: every operation under `/v2` in the pin has exactly
  one capability classification (ADR-0007; roadmap 1.3.2 success).
- `REQ-query-dimensions`: the registry answers queries by operation ID, by
  method and path, and by capability class (roadmap 1.3.2 success).
- `REQ-concrete-resolution`: a concrete request resolves to an operation,
  `method-not-allowed` with `Allow`, or `not-found`, keeping 404, 405, and 501
  distinct (ADR-0007, "Decision").
- `REQ-single-source`: classifications for docs, admin payloads, and runtime
  lookups derive from one validated source (ADR-0007; TDD-§7.1).
- `REQ-pin-faithful`: the registry is built from the hashed pin without
  modifying it (ADR-0002; TDD-§20, "Pin the DigitalOcean OpenAPI contract").
- `REQ-backplane`: Simulacrum stays the HTTP backplane (ADR-0001; TDD-§4).
- `REQ-pure-policy`: policy code is independent of Express, Simulacrum,
  filesystem, and engine adapters (ADR-0007, "Consequences").

Observed gaps:

- `GAP-manifest-drift`: the seed manifest's IDs, paths, and parameter names
  disagree with the pin. One entry is absent from the pin.
- `GAP-no-registry`: no module indexes pinned operations or resolves concrete
  requests.
- `GAP-unclassified`: 595 pinned `/v2` operations have no classification.
- `GAP-oversize-module`: `capabilities.ts` exceeds the 400-line limit.
- `GAP-backplane-divergence`: `openapi-backend` precedence differs from the
  OpenAPI rule.

Trace links:

```plaintext
ADR-0007 -> REQ-every-v2-classified -> EP-M4, EP-M5
  -> tests/digitalocean-operation-registry.test.ts::"classifies every /v2 operation exactly once"
roadmap-1.3.2 -> REQ-query-dimensions -> EP-M4 -> tests/operation-registry.test.ts::"Feature: query the operation registry"
ADR-0007 -> REQ-concrete-resolution -> EP-M2, EP-M3, EP-M4
  -> tests/path-template.test.ts, make prove (L-no-tie, INV-most-specific)
ADR-0007 -> REQ-single-source -> EP-M5
  -> tests/digitalocean-operation-registry.test.ts::"every manifest entry matches exactly one pinned operation"
ADR-0002 -> REQ-pin-faithful -> EP-M5
  -> tests/digitalocean-operation-registry.test.ts::"rejects an artefact whose hash differs from provenance"
ADR-0001 -> REQ-backplane -> EP-M6 -> tests/operation-registry-backplane-parity.test.ts
ADR-0007 -> REQ-pure-policy -> EP-M1..EP-M5
  -> tests/openapi-layout.test.ts::"domain modules import no I/O or framework modules"
GAP-manifest-drift -> D2, D5 -> EP-M5 -> tests/openapi-capabilities.test.ts (rekeyed), tests/base.test.ts snapshot
GAP-oversize-module -> EP-M1 -> wc -l src/openapi/*.ts (all <= 400)
GAP-backplane-divergence -> D3, D8 -> EP-M6, EP-M7 -> tests/fixtures/openapi-backend-divergences.json, ADR 0009
```

## Verification plan

### Abstract model

A *template* `t` is a finite sequence of segments. Each segment is either
`Lit(s)`, for a non-empty string `s`, or `Param`. A *request* `r` is a finite
sequence of strings. `t` *matches* `r` when `|t| = |r|`, and for each `i`,
either `t[i] = Param` and `r[i] ≠ ""`, or `t[i] = Lit(r[i])`. The *shape* of
`t` is `t` with every parameter name erased. The model's `Param` already erases
names.

The *kind vector* of `t` is the sequence of booleans `isLiteral(t[i])`.
`compare(a, b)`, defined for `|a| = |b|`, returns `-1`, `0`, or `1`. It
inspects the first index where the kind vectors differ: the template with the
literal there is more specific, and the result is `-1` if `a` is more specific.
When the kind vectors are equal, it returns `0`.

A *contract* is a finite set `T` of templates in which no two distinct members
share a shape (`NoShapeCollision(T)`). Each member has a path item: a finite
map from method to operation. `resolve(T, m, r)` follows `D3`. It takes
`C = {t ∈ T : t matches r}`. If `C = ∅`, the result is `not-found`. Otherwise
it chooses `best ∈ C` with `compare(best, c) ≤ 0` for every `c ∈ C`. It returns
the operation for `m` on `best`, or `method-not-allowed` with the keys of
`best`'s path item.

Classification is
`classify(op) = overlay[op.operationId]?.capability ?? 'unsupported'`, defined
over the set `O` of `/v2` operations in the pin.

Malformed inputs are rejected at the boundary, by `contract-document.ts` and
`buildOperationRegistry`, and are reported as issues. They are:

- a template with an empty segment, or with braces that do not enclose a whole
  segment;
- a shape collision;
- a duplicate `operationId`;
- an unsupported method (`head`, `options`, `trace`);
- a manifest entry that matches no pinned operation, or matches one only on
  some of `operationId`, method, and path;
- a duplicate manifest entry.

Requests are not malformed. Any string is accepted, and paths that do not start
with `/v2/` resolve to `not-found`.

### Invariants and lemmas

- `INV-total-classification` (`REQ-every-v2-classified`): for every `o ∈ O`,
  the registry returns exactly one `RegisteredOperation` with one `capability`.
  `|registry.operations| = |O| = 620` for the current pin.
  `Σ_cap |listByCapability(cap)| = |O|`.
- `INV-overlay-exact` (`REQ-single-source`): every manifest entry matches
  exactly one `o ∈ O` on `operationId`, method, and path template. A successful
  build implies this.
- `INV-query-agreement` (`REQ-query-dimensions`): for every `o ∈ O`, all of the
  following hold:
  - `findByOperationId(o.id) = o`;
  - `findByMethodAndPath(o.method, o.template) = o`;
  - `findByMethodAndPath(o.method, renameParams(o.template)) = o`;
  - `listByCapability(o.capability)` contains `o`;
  - `resolveRequest(o.method, instantiate(o.template))` resolves to `o`,
    whenever `instantiate` substitutes values that collide with no literal
    sibling.
- `L-compare-order`: on templates of equal length, `compare` is a total
  preorder. `compare(a, a) = 0`; `compare(a, b) = -compare(b, a)`; and it is
  transitive. Its zero class is exactly "equal kind vectors".
- `L-no-tie` (key lemma): if `a ≠ b` in shape, and both match the same request
  `r`, then `compare(a, b) ≠ 0`.

  Proof idea: if the kind vectors are equal, every literal position holds
  `r[i]` in both, so the shapes are equal, a contradiction.
- `INV-most-specific` (`REQ-concrete-resolution`): when `C ≠ ∅`, the template
  that `selectMostSpecific` chooses is in `C`. It satisfies
  `compare(best, c) ≤ 0` for all `c ∈ C`, and under `NoShapeCollision` it is
  the unique such element.
- `INV-order-independent`: under `NoShapeCollision`, `resolve` yields the same
  result for every permutation of the template list. This is a corollary of
  `INV-most-specific`'s uniqueness.
- `INV-concrete-first`: if some `t ∈ C` has no parameters, `resolve` chooses
  it. This is a corollary of `INV-most-specific`, since an all-literal vector
  beats any vector containing `Param`.
- `INV-405-allow`: if `C ≠ ∅` and `best`'s path item lacks `m`, the result is
  `method-not-allowed`. Its `allow` is the sorted, duplicate-free list of
  `best`'s methods, and it is non-empty.
- `INV-trailing-slash`: for every request `r` with at least one segment,
  `resolve(m, r + '/') = resolve(m, r)`.
- `INV-deterministic-listing`: `operations` and `listByCapability` are sorted
  by operation key with code-unit comparison (`<`), not `localeCompare`. Two
  builds from permuted documents produce deep-equal listings.

### Axioms (trusted, not verified here)

- `AXIOM-pin-integrity`: the bytes of
  `src/openapi/digitalocean.openapi.json` are the bundled upstream contract at
  commit `ef3868ee…`, as recorded in the provenance file. Source: ADR-0002, and
  the 1.3.1 provenance tests. Depends on it: the file adapter, which re-checks
  the hash on every load and so rejects tampering but not upstream error.
- `AXIOM-oas-paths`: OpenAPI 3.0.3 semantics. Concrete paths match before
  templated ones; same-shape templates are identical and forbidden; and
  `operationId` is unique. Source: the OpenAPI Specification 3.0.3, Paths
  Object and Operation Object. Depends on it: `D3`, and the builder's rejection
  rules.
- `AXIOM-openapi-backend-router`: `openapi-backend` 5.18.0's
  `OpenAPIRouter.matchOperation`.
  1. An exact path with the requested method wins.
  2. Otherwise, templated candidates are ordered by literal-character length,
     with a stable sort that keeps document order on ties.
  3. The first candidate with the method is chosen.

  Source: `node_modules/openapi-backend/router.js`. Depends on it: the `EP-M6`
  parity test. It is exercised against the real package, not verified.
- `AXIOM-lemmascript-translation`: `lsc` (LemmaScript 0.6.x) translates the
  annotated TypeScript subset to Dafny faithfully, and Dafny 4.11 with Z3
  4.12.1 is sound. Source: LemmaScript `SPEC.md` and `SPEC_DAFNY.md`. Depends
  on it: `EP-M3`. The residual risk is mitigated by running the same TypeScript
  functions under `fast-check` with an independent oracle.
- `AXIOM-js-string`: JavaScript `===` and `<` on strings compare UTF-16 code
  units deterministically across runtimes. Source: ECMA-262. Depends on it:
  matching and listing order.

### Methods per obligation

- Obligation: `L-compare-order`, `L-no-tie`, and `INV-most-specific`.
  - Method: formal proof with LemmaScript (Dafny backend), plus a
    `fast-check` regression net.
  - Rationale: these properties are universally quantified over unbounded
    templates and requests. They are the contractual core of `D3`.
  - Domain: all segment sequences. In the TypeScript subset, a segment is a
    record `{isParameter: boolean; literal: string}` in a readonly array.
  - Artefacts:
    - `//@ requires` and `//@ ensures` annotations on `templateMatches`,
      `compareSpecificity`, and `selectMostSpecific`, in
      `src/openapi/path-template.ts`;
    - `src/openapi/path-template.dfy.gen`, generated;
    - `src/openapi/path-template.dfy`, with proof additions;
    - `LemmaScript-files.txt`.
  - Evidence: `make prove` reports zero errors.

    `selectMostSpecific`'s `ensures` clauses state membership in the
    candidates, `forall c :: compare(best, c) <= 0`, and uniqueness under the
    `requires` that no two candidates share a kind vector and literals. That
    `requires` holds whenever all candidates match one request and the
    contract has no shape collision; a separate lemma proves this from
    `templateMatches`.
  - Non-vacuity:
    1. A concrete witness satisfies the preconditions: `/v2/projects/default`
       and `/v2/projects/{project_id}` against
       `['v2','projects','default']`. It is encoded as a Dafny `method`
       whose body calls the lemma with these values. The prover must accept
       it, which shows the preconditions are satisfiable.
    2. A seeded mutation: invert the literal-beats-parameter comparison in
       `compareSpecificity`, regenerate, and run `make prove`. Verification
       must fail on the `ensures` of `INV-concrete-first`. Restore the code
       afterwards and re-run `lsc regen`.
    3. `bin/prove.sh` fails when `LemmaScript-files.txt` is empty, when any
       `assume`, `{:axiom}`, or `{:verify false}` appears in a `.dfy` file,
       when the Dafny version differs from 4.11.x, and when a file's timeout
       exceeds 120 seconds.

- Obligation: `INV-most-specific`, `INV-order-independent`,
  `INV-concrete-first`, `INV-trailing-slash`, and `INV-405-allow`, at runtime
  over the real string-parsing front end.
  - Method: `fast-check` property tests, seeded with `propertyTestSeed`.
  - Rationale: they cover the parsing and normalization code that is outside
    the proof subset, and they cross-check the proof's correspondence.
  - Domain: generated templates over a small literal alphabet (`a`, `b`,
    `default`, `v2`) with 1 to 6 segments, to force collisions. Generated
    requests are made by instantiating a template, then replacing parameter
    values with sibling literals at the same depth. Permutations of the
    template list.
  - Artefact: `tests/path-template.test.ts`, the "Property tests" block.
  - Oracle: an independent brute force. It encodes each candidate's kind
    vector as a string of `'1'` (literal) and `'0'` (parameter), chooses the
    lexicographically greatest by string comparison, and builds its matcher
    from a `RegExp`, not segment arrays.
  - Evidence: `bun test tests/path-template.test.ts` passes. The Red step runs
    first, against a stub that returns the first candidate, and fails with a
    shrunk counterexample.
  - Non-vacuity: `fc.statistics` (or a `classify` counter asserted after the
    run) shows that at least 20% of runs have two or more matching
    candidates, at least 5% hit `method-not-allowed`, and at least 5% hit
    `not-found`. A `cases-with-tie>=1` counter must be 0, because the
    generator excludes shape collisions; a second generator that includes
    them must make the builder reject. A seeded fault that ignores trailing
    slashes must fail `INV-trailing-slash`.

- Obligation: `INV-total-classification`, `INV-overlay-exact`, and
  `INV-query-agreement`.
  - Method: an exhaustive integration test over the real pin, which has 620
    operations, plus behavioural unit tests on synthetic contracts for the
    unhappy paths.
  - Rationale: the domain is finite and fully enumerable, so exhaustive
    checking is complete for this pin. Re-running it after any pin refresh
    re-establishes it.
  - Domain: every `/v2` operation in the pin, and every manifest entry.
  - Artefact: `tests/digitalocean-operation-registry.test.ts`.
  - Expected counts with `D5` accepted: 620 operations in total, 18
    `scriptable`, 3 `engine-backed`, 1 `stubbed`, and 598 `unsupported`, of
    which 3 come from the manifest and 595 from the default. There are 15
    excluded operations.
  - Evidence: the exact counts are asserted, together with a per-operation
    loop for `INV-query-agreement`.
  - Non-vacuity: the counts are asserted as literals, not derived from the
    code. A negative control injects a manifest entry with the stale path
    `/v2/ssh_keys` into a copy of the manifest, and the build must fail with
    issue `manifest-entry-not-in-contract`. A seeded fault that changes the
    default classification to `scriptable` must fail the count assertion.

- Obligation: `INV-deterministic-listing`.
  - Method: a property test that builds from documents whose `paths` keys and
    method keys are shuffled by `fc.shuffledSubarray` over the full key set.
  - Artefact: `tests/operation-registry.test.ts`.
  - Non-vacuity: a seeded fault that uses insertion order must fail it.

- Obligation: the boundary rejection rules (malformed contracts and
  manifests).
  - Method: parameterized behavioural tests, one row per issue code:
    - `empty-path-segment`;
    - `partial-segment-parameter`;
    - `path-shape-collision`;
    - `duplicate-operation-id`;
    - `unsupported-http-method`;
    - `manifest-entry-not-in-contract`;
    - `manifest-entry-mismatch`;
    - `duplicate-manifest-entry`;
    - `contract-hash-mismatch`, raised by the adapter.

    Each row asserts the issue code and the offending key.
  - Artefacts: `tests/operation-registry.test.ts` and
    `tests/digitalocean-operation-registry.test.ts`.

- Obligation: backplane parity and divergence pinning (`REQ-backplane`,
  `GAP-backplane-divergence`).
  - Method: an exhaustive comparison over a deterministic, collision-rich
    corpus. For every `/v2` template and every method, the corpus holds the
    template instantiated with `x1`. It also holds every variant that
    replaces one parameter with a literal appearing at the same depth in a
    template with a compatible prefix. This is the planning-probe corpus of
    3,945 requests.
  - Artefacts: `tests/operation-registry-backplane-parity.test.ts`, and
    `tests/fixtures/openapi-backend-divergences.json`, which lists each
    divergent request with both outcomes.
  - Evidence: the set of divergences equals the fixture exactly. Today it
    holds 2 distinct path-precedence requests (each counted twice by the
    probe's raw tally) and the method fallthrough requests; the exact
    distinct count is to be recorded in `EP-M6`.
  - Non-vacuity: the test asserts that the corpus size is at least 3,900, and
    that the fixture is non-empty and contains both divergence kinds. Deleting
    one fixture row must fail the test.

### Formal verification decision

A formal proof is warranted for the precedence lemmas (`D7`) and nothing else.
Totality of classification holds by construction, through a lookup with a
default. A proof of it would restate the code, which the guidance forbids.
Reconciling the manifest is a finite data check, and the exhaustive test
discharges it completely.

Model checking adds nothing here, because the registry has no concurrency or
mutable state. It is built once and is immutable.

The proof does not cover string parsing (`parsePathTemplate`,
`splitRequestPath`), the builder's data plumbing, or `openapi-backend`. The
property and parity tests cover those.

If the `EP-M3` prototype is a no-go, the fallback options to escalate are:

1. Write the Dafny model by hand, without LemmaScript translation, and add a
   correspondence property test that links it to the TypeScript.
2. Use bounded exhaustive enumeration of all kind vectors and literal
   assignments up to length 6 over a 3-letter alphabet. This is weaker, and
   gives a bound rather than a proof.

### Suggested BDD features

There is no BDD runner. These features are implemented as `bun:test`
`describe('Feature: …')` blocks, with one `it` per scenario, in the files named
below.

Proposed for `tests/operation-registry.test.ts`, which uses a synthetic contract
(`EP-M4`, `REQ-query-dimensions`, `REQ-concrete-resolution`):

```gherkin
Feature: Query the operation registry
  Scenario: Find an operation by its pinned operation ID
    Given a contract with GET /v2/projects/{project_id} as projects_get
    When I find the operation with ID "projects_get"
    Then I receive the GET /v2/projects/{project_id} operation

  Scenario: Find an operation by method and a renamed path template
    Given a contract with GET /v2/projects/{project_id} as projects_get
    When I find GET /v2/projects/{id}
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

  Scenario: A shape collision is rejected
    Given a contract with /v2/a/{x} and /v2/a/{y}
    When I build the registry
    Then the build fails with issue path-shape-collision naming both templates
```

Proposed for `tests/digitalocean-operation-registry.test.ts`, which uses the
real pin through the file adapter (`EP-M5`, `REQ-every-v2-classified`,
`REQ-single-source`, `REQ-pin-faithful`):

```gherkin
Feature: Classify the pinned DigitalOcean contract
  Scenario: Every /v2 operation is classified exactly once
    Given the pinned DigitalOcean OpenAPI artefact
    When I load the operation registry
    Then it contains 620 operations, each with exactly one capability
    And 15 non-/v2 operations are reported as excluded

  Scenario: DOKS engine-backed operations come from the manifest
    When I list engine-backed operations
    Then I receive kubernetes_create_cluster, kubernetes_delete_cluster, and kubernetes_get_kubeconfig

  Scenario: An unlisted operation defaults to unsupported
    When I find the operation with ID "droplets_create"
    Then its capability is unsupported and its classification source is default

  Scenario: A tampered artefact is rejected
    Given artefact bytes whose SHA-256 differs from the provenance record
    When I load the operation registry from those bytes
    Then loading fails with issue contract-hash-mismatch
```

Proposed for `tests/base.test.ts`, end to end over HTTP (`EP-M5`):

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

Work proceeds as eight stages: an approval gate, then milestones `EP-M1` to
`EP-M7`. Each milestone ends with the gate sequence and a commit. Commit
messages follow `AGENTS.md`: imperative mood, a subject of 50 characters or
fewer, a body wrapped at 72 columns, and the attribution trailer.

### `EP-M1` split capability policy from manifest data (refactor)

Assigned: `GAP-oversize-module`. No behaviour change.

Move `v1CapabilityManifest`, the four runtime presets (`scriptableRuntime`,
`engineBackedRuntime`, `stubbedRuntime`, `unsupportedRuntime`), and
`validateV1CapabilityManifest` from `src/openapi/capabilities.ts` into a new
`src/openapi/v1-capability-manifest.ts`, with an `@file` header. The new module
imports `validateCapabilityManifest` and the types from `capabilities.ts`.

Update the imports in `src/openapi/projections.ts`, `src/openapi/index.ts`, and
the tests. Use `codegraph_find_by_imports` or
`grep -rn v1CapabilityManifest src tests` to find every importer. Keep the
barrel's public names unchanged.

Validation is the existing suite, unchanged and passing.
`wc -l src/openapi/*.ts` shows every file at or below 400 lines. This is a pure
refactor with no red step; the existing tests are the safety net. Commit:
"Split v1 capability manifest from policy".

### `EP-M2` path-template domain module

Assigned: `REQ-concrete-resolution` (the runtime part), `INV-trailing-slash`,
and `INV-concrete-first`. Create `src/openapi/path-template.ts`, which is pure,
with no imports except types. It holds:

- `PathSegment` (`{readonly isParameter: boolean; readonly literal: string}`,
  where `literal` is `''` for parameters);
- `parsePathTemplate(template): ParsedTemplate | PathTemplateIssue`;
- `splitRequestPath(path): readonly string[]`, which removes trailing slashes
  and splits;
- `templateShape(template): string`;
- `templateMatches(segments, request): boolean`;
- `compareSpecificity(a, b): -1 | 0 | 1`;
- `selectMostSpecific(candidates): number`, which returns the index;
- `extractPathParameters(template, request): Readonly<Record<string, string>>`.

Keep the functions that `EP-M3` will annotate (`templateMatches`,
`compareSpecificity`, `selectMostSpecific`) in the simple subset. Use indexed
`for` and `while` loops, early returns, and no closures, `Map`, or regular
expressions.

Red: write `tests/path-template.test.ts` first. It has named examples from the
pin (`/v2/projects/default` against `/v2/projects/{project_id}`, and the
`droplets/autoscale` pair), table rows for the parser issues, and the
properties with the brute-force oracle from `Verification plan`. Run it against
stub exports that throw `new Error('not implemented')`, and expect failures for
that reason. Green: implement. Refactor: extract helpers if any function
exceeds about 25 lines.

Focused command: `bun test tests/path-template.test.ts`. Then run the full gate
sequence. Commit: "Add OpenAPI path-template precedence module".

### `EP-M3` LemmaScript proof of precedence (starts with a prototype)

Assigned: `L-compare-order`, `L-no-tie`, `INV-most-specific`, and `D7`.

The prototype gate comes first, time-boxed to 2 hours inside the 6-hour proof
tolerance:

1. Add `lemmascript@^0.6.10` as a development dependency
   (`bun add -d lemmascript@^0.6.10`).
2. Run `node_modules/.bin/lsc gen --backend=dafny src/openapi/path-template.ts`
   against an annotation of `compareSpecificity` only.
3. Run
   `node_modules/.bin/lsc check --backend=dafny src/openapi/path-template.ts`.

Go if Dafny verifies a non-trivial `ensures` on `compareSpecificity`, such as
antisymmetry stated through a ghost call. No-go if `lsc` rejects the subset, or
cannot express the record segments. On no-go, set this plan to `BLOCKED`,
record the transcript in `Artefacts and notes`, and escalate with the fallbacks
from `Verification plan`. Keep the prototype only if go.

Then:

1. Annotate the three functions with `//@ requires`, `//@ ensures`,
   `//@ invariant`, and `//@ decreases`.
2. Add ghost specification functions for `kindVector` and `sameShape`.
3. State `L-no-tie` as a lemma in `path-template.dfy`, and prove it there.
4. Add the witness method and the mutation check from `Verification plan`.
5. Create `LemmaScript-files.txt`, containing
   `src/openapi/path-template.ts 120`.
6. Create `bin/prove.sh`, adapted from the velocetty guard pattern. It must:
   - require the local `node_modules/.bin/lsc`, rather than `bunx lsc`, which
     resolves an unrelated npm package;
   - check that the Dafny version is 4.11.x, and that a solver is present;
   - reject an empty list, trust constructs, and timeouts over 120 seconds;
   - run `lsc check --backend=dafny` and then confirm that the `.dfy.gen`
     files are current (`lsc regen` leaves no diff).
7. Add a `prove` target to the `Makefile` and to its `.PHONY` list. Do not add
   it to `all`, because CI runs it as a separate step after installing Dafny.
8. Extend `.github/workflows/ci.yml` with an "Install Dafny and Z3 for
   LemmaScript" step, using
   `dotnet tool install --global dafny --version 4.11.0` and the checksummed Z3
   4.12.1 release. Add a "Prove LemmaScript contracts" step that runs
   `make prove` after `bun install`.
9. Exclude `*.dfy` and `*.dfy.gen` from Biome if Biome tries to read them, by
   adding to `files.includes` negations in `biome.json`.

Red: first run `make prove` with `ensures` clauses but without the proof
additions. Dafny must report the unproved postconditions. Green: add proof
steps until it reports `0 errors`. Then run the seeded mutation and record its
failure. Gates: the standard four, plus `make prove`. Commit: "Prove
path-template precedence with LemmaScript".

### `EP-M4` contract boundary schema and pure registry

Assigned: `REQ-query-dimensions`, `REQ-concrete-resolution`, `INV-405-allow`,
`INV-deterministic-listing`, `D1`, `D4`, and `D6`.

Create `src/openapi/contract-document.ts`. It defines a Zod schema,
`contractDocumentSchema`, for the subset the registry reads. That subset is
`paths`, each path item's method keys (passing all eight OpenAPI method names
through, so the builder can reject them), and per operation `operationId` (a
non-empty string), `tags` (an optional string array), and `summary` (an
optional string). Unknown keys are allowed, because the pin carries many
others. Export `parseContractDocument(json: unknown)`, which returns a
discriminated outcome.

Create `src/openapi/operation-registry.ts` with:

- `RegisteredOperation`, `RequestResolution`, `OperationRegistryIssue` (a
  discriminated union keyed by `code`), `OperationRegistryBuildResult`, and the
  `OperationRegistry` interface. The signatures are in
  `Interfaces and dependencies`.
- `buildOperationRegistry({contract, classifications, identity})`, which:
  1. walks the paths in sorted order;
  2. excludes those not under `/v2/` into `excludedOperations`;
  3. parses each template with `parsePathTemplate`;
  4. rejects shape collisions, duplicate operation IDs, and unsupported
     methods;
  5. indexes operations by ID, by shape and method, and by capability;
  6. joins the classification entries, rejecting entries with no exact match;
  7. applies the default from `D4`.

  It returns `{ok: true, registry}` or `{ok: false, issues}`, with the issues
  sorted by `code` and then by key.
- `resolveRequest`, which uses `splitRequestPath`, a per-segment-count bucket
  of templates (so a lookup scans only same-length templates),
  `templateMatches`, `selectMostSpecific`, and the path item's method table.

The builder must stay at or below 400 lines. If it grows past about 300, split
the indexing helpers into `src/openapi/operation-registry-index.ts`.

Red: `tests/operation-registry.test.ts`, with a synthetic-contract builder
(`buildContract({paths: {...}})` in `tests/support/contract-builder.ts`). It
holds the Gherkin-mapped scenarios, the issue-code table, and the
listing-determinism property. Run it against stub exports and expect failures.
Green: implement. Extend `tests/openapi-layout.test.ts` with:

1. the new barrel exports;
2. an import-direction fitness test. It reads each domain module's source and
   asserts that no import specifier matches `^node:`, `express`,
   `@simulacrum/`, or `openapi-backend`.

Gates: the standard four, plus `make prove`. Commit: "Add pure OpenAPI
operation registry".

### `EP-M5` reconcile the manifest with the pin, and load it from the artefact

Assigned: `REQ-every-v2-classified`, `REQ-single-source`, `REQ-pin-faithful`,
`GAP-manifest-drift`, `D2`, and `D5`. This milestone is `BLOCKED` unless the
user has accepted `D5`.

Rekey `src/openapi/v1-capability-manifest.ts` in one atomic change. Old dotted
IDs become pinned IDs, and paths become pinned templates.

Table 1: v1 manifest rekey mapping (planning-probe evidence, pin `ef3868ee`).

| Old ID / path                                                        | New `operationId`            | New path template                                                |
| -------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `account.get` `/v2/account`                                          | `account_get`                | `/v2/account`                                                    |
| `account.getRateLimit` `/v2/account/ratelimit`                       | removed (`D5`)               | absent from pin                                                  |
| `regions.list` `/v2/regions`                                         | `regions_list`               | `/v2/regions`                                                    |
| `sizes.list` `/v2/sizes`                                             | `sizes_list`                 | `/v2/sizes`                                                      |
| `images.list` `/v2/images`                                           | `images_list`                | `/v2/images`                                                     |
| `sshKeys.list` `/v2/ssh_keys`                                        | `sshKeys_list`               | `/v2/account/keys`                                               |
| `sshKeys.create` `/v2/ssh_keys`                                      | `sshKeys_create`             | `/v2/account/keys`                                               |
| `sshKeys.get` `/v2/ssh_keys/{id}`                                    | `sshKeys_get`                | `/v2/account/keys/{ssh_key_identifier}`                          |
| `sshKeys.delete` `/v2/ssh_keys/{id}`                                 | `sshKeys_delete`             | `/v2/account/keys/{ssh_key_identifier}`                          |
| `projects.list` `/v2/projects`                                       | `projects_list`              | `/v2/projects`                                                   |
| `projects.create` `/v2/projects`                                     | `projects_create`            | `/v2/projects`                                                   |
| `projects.get` `/v2/projects/{id}`                                   | `projects_get`               | `/v2/projects/{project_id}`                                      |
| `projects.assignResources` `/v2/projects/{id}/resources`             | `projects_assign_resources`  | `/v2/projects/{project_id}/resources`                            |
| `projects.listResources` `/v2/projects/{id}/resources`               | `projects_list_resources`    | `/v2/projects/{project_id}/resources`                            |
| `actions.get` `/v2/actions/{id}`                                     | `actions_get`                | `/v2/actions/{action_id}`                                        |
| `kubernetes.getOptions` `/v2/kubernetes/options`                     | `kubernetes_list_options`    | `/v2/kubernetes/options`                                         |
| `kubernetes.listClusters` `/v2/kubernetes/clusters`                  | `kubernetes_list_clusters`   | `/v2/kubernetes/clusters`                                        |
| `kubernetes.createCluster` `/v2/kubernetes/clusters`                 | `kubernetes_create_cluster`  | `/v2/kubernetes/clusters`                                        |
| `kubernetes.getCluster` `/v2/kubernetes/clusters/{id}`               | `kubernetes_get_cluster`     | `/v2/kubernetes/clusters/{cluster_id}`                           |
| `kubernetes.deleteCluster` `/v2/kubernetes/clusters/{id}`            | `kubernetes_delete_cluster`  | `/v2/kubernetes/clusters/{cluster_id}`                           |
| `kubernetes.getKubeconfig` `/v2/kubernetes/clusters/{id}/kubeconfig` | `kubernetes_get_kubeconfig`  | `/v2/kubernetes/clusters/{cluster_id}/kubeconfig`                |
| `kubernetes.listNodePools` `/v2/kubernetes/clusters/{id}/node_pools` | `kubernetes_list_nodePools`  | `/v2/kubernetes/clusters/{cluster_id}/node_pools`                |
| `kubernetes.getNodePool` `…/node_pools/{pool_id}`                    | `kubernetes_get_nodePool`    | `/v2/kubernetes/clusters/{cluster_id}/node_pools/{node_pool_id}` |
| `kubernetes.updateNodePool` `…/node_pools/{pool_id}` (PUT)           | `kubernetes_update_nodePool` | `/v2/kubernetes/clusters/{cluster_id}/node_pools/{node_pool_id}` |
| `droplets.list` `/v2/droplets`                                       | `droplets_list`              | `/v2/droplets`                                                   |
| `spacesKeys.list` `/v2/spaces/keys`                                  | `spacesKey_list`             | `/v2/spaces/keys`                                                |
| `digitalocean.unsupported` `/v2/{path*}`                             | removed (`D4`)               | replaced by the default rule                                     |

`productArea` values stay as authored (for example `SSH keys`). The registry
exposes the upstream first tag separately as `RegisteredOperation.tag`, so the
admin payload does not churn on capitalization.

Create `src/openapi/pinned-contract-file.ts`, the driven adapter. It exports
`readPinnedContract(options?: {contractUrl?: URL; provenanceUrl?: URL})`, which
returns `Promise<PinnedContract>`, where `PinnedContract` is
`{document: unknown; identity: PinnedContractIdentity}`. It:

1. reads both files with `node:fs/promises`. The default URLs are
   `new URL('./digitalocean.openapi.json', import.meta.url)` and the
   corresponding provenance file;
2. validates the provenance with `validateDigitalOceanOpenApiProvenance`;
3. checks the hash with the provenance hash assertion in
   `src/openapi/artifact.ts`, mapping a throw to issue `contract-hash-mismatch`
   with the original error as `cause`;
4. parses the JSON.

Create `src/openapi/digitalocean-operation-registry.ts`, the composition. It
holds `loadDigitalOceanOperationRegistry(options?)`, memoized per process
unless options are given. It chains `readPinnedContract`,
`parseContractDocument`, and `buildOperationRegistry`, using
`v1CapabilityManifest` as the classifications. On failure it throws
`OperationRegistryBuildError extends Error`, with `issues` and `cause`. It logs
one structured line,
`{"event":"digitalpuddle.registry.built",
"operationCount":620,"excludedCount":15,"pin":"ef3868ee…"}`,
in the same style as `digitalpuddle.manifest.validated`.

Export the new public names from `src/openapi/index.ts`.

Red:

1. Update the existing tests to the new IDs. This covers
   `tests/openapi-capabilities.test.ts`, `tests/openapi-projections.test.ts`
   (the `501` message becomes
   `'GET /v2/droplets is not implemented by DigitalPuddle v1.'`, unchanged
   because the path is unchanged), and the `tests/base.test.ts` assertions.
   Then write `tests/digitalocean-operation-registry.test.ts`. Run them before
   editing the manifest; they fail on the old IDs.
2. Green: rekey and implement the adapter.
3. Regenerate the snapshots with
   `bun test --update-snapshots tests/openapi-layout.test.ts tests/base.test.ts`.
   Review the snapshot diff by hand: only operation IDs, paths, and the
   removed rate-limit row may change.

Gates: the standard four, plus `make prove`. Commit: "Rekey capability manifest
to pinned operations". The message body lists Table 1. A follow-up commit,
"Load operation registry from pinned artefact", adds the adapter and
composition if the first commit is already large. Each commit must pass the
gates.

### `EP-M6` backplane parity guard

Assigned: `REQ-backplane` and `GAP-backplane-divergence`.

1. Add `openapi-backend@^5.18.0` as a development dependency.
2. Write `tests/operation-registry-backplane-parity.test.ts`. It builds the
   deterministic corpus from `Verification plan`, and resolves each request
   with the registry and with
   `new OpenAPIRouter({definition, apiRoot: '/'})
   .matchOperation({method, path, headers: {}}, false)`.
   It collects the disagreements as sorted
   `{method, path, registry: string, backend: string | null}` records.
3. Assert that they deep-equal
   `tests/fixtures/openapi-backend-divergences.json`.

Red: commit an empty fixture first, and observe the failure listing the
divergences. Green: write the observed set to the fixture. Check by hand that
it contains only the two kinds in `Surprises & discoveries`; any other kind
trips the architecture tolerance. Gates: the standard four, plus `make prove`.
Commit: "Pin registry and backplane resolution divergences".

### `EP-M7` documentation and delivery closure

Delegate the mechanical documentation edits to the `scribe` agent, with exact,
evidence-based instructions.

1. Create `docs/adrs/adr-0009-operation-registry-resolution.md`, recording
   `D2` to `D4` and `D6`. It covers the rejected alternatives and the
   consequence for 2.4.1: the registry must decide `404`, `405`, and `501`
   before `openapi-backend` dispatches, or reconcile the pinned divergences.
   List it in `docs/developers-guide.md` §2.1.
2. Update `docs/digitalpuddle-technical-design.md`:
   - §7.1: the registry mechanism, the default rule, the excluded operations,
     and a reference to ADR 0009;
   - §8.2 Table 1: pinned path templates, and the rate-limit row per `D5`;
   - §8.4: rate-limit headers;
   - §16: the new `src/openapi/` files.
3. Update `docs/developers-guide.md`. In §7, document the new modules, then
   add a subsection, "Operation registry". It covers the query API, the
   resolution rules, how to add a classification, `make prove`, and the
   requirement that pin refreshes re-run the parity and count tests.
4. Update `docs/users-guide.md`, "Capability classifications" and "Inspecting
   the capability metadata". Pinned operation IDs and paths now appear in admin
   rows. SSH keys are at `/v2/account/keys`. Unlisted `/v2` operations are
   `unsupported` by default.
5. Add a `CHANGELOG.md` entry under an "Unreleased" heading, following the
   file's existing style.
6. Mark roadmap item 1.3.2 `[x]` in `docs/roadmap.md`. Reword 2.1.1 per `D5`.
7. Search for stale claims with the command below, and fix every live hit.
   Completed ExecPlans are historical and must not be edited.

   ```bash
   grep -rn 'ssh_keys\|ratelimit\|account\.get\|kubernetes\.createCluster\|{path\*}' \
     docs src tests README.md --exclude-dir=execplans
   ```

Gates:

1. the standard four;
2. `make prove`;
3. `make markdownlint`, which also runs spelling;
4. `make nixie`.

Commit: "Document the operation registry". Then reconcile the
`Conformance basis` items, fill in `Outcomes & retrospective`, and set the
status to `COMPLETE`.

## Milestones and plateaus

- `EP-M1`: `capabilities.ts` is split, and behaviour is identical.
  - Requirements: `GAP-oversize-module`.
  - Evidence: the unchanged suite passes, and `wc -l` shows every file at or
    below 400 lines.
  - Conformance check:
    - no behaviour or interface change;
    - the barrel names are unchanged;
    - no new dependency.
  - Recovery: `git revert` the commit.
  - Remaining gaps: everything else.
  - Compatibility decision: none.
- `EP-M2`: precedence logic exists and is tested.
  - Requirements: `REQ-concrete-resolution`, the runtime part.
  - Evidence: `tests/path-template.test.ts` passes, with classification
    statistics.
  - Conformance check:
    - the module is pure, with no imports;
    - `D3` is followed exactly.
  - Recovery: revert.
  - Remaining gaps: the proof, and the registry.
  - Compatibility decision: none.
- `EP-M3`: the precedence lemmas are proved, and CI enforces them.
  - Requirements: `L-*`, `INV-most-specific`.
  - Evidence:
    - `make prove` reports 0 errors;
    - a mutation transcript is recorded;
    - the CI step is green on the draft PR.
  - Conformance check:
    - the proved functions are the production functions;
    - no trust constructs;
    - the dependency is the authorized one.
  - Recovery: if the CI install step fails for infrastructure reasons, keep
    `make prove` local, record it, and escalate. Never delete the step
    silently.
  - Remaining gaps: the registry.
  - Compatibility decision: none.
- `EP-M4`: the pure registry answers every query on synthetic contracts.
  - Requirements: `REQ-query-dimensions`, `REQ-concrete-resolution`.
  - Evidence: `tests/operation-registry.test.ts` and the import-direction
    fitness test pass.
  - Conformance check:
    - the domain imports nothing from I/O;
    - the issue union is closed;
    - no new trust boundary.
  - Recovery: revert.
  - Remaining gaps: the real pin and the manifest.
  - Compatibility decision: none.
- `EP-M5`: the real pin is classified, and the admin payload uses pinned IDs.
  - Requirements: `REQ-every-v2-classified`, `REQ-single-source`,
    `REQ-pin-faithful`, `GAP-manifest-drift`.
  - Evidence: the exact counts are asserted, and the end-to-end admin test
    passes.
  - Conformance check:
    - `D5` is accepted;
    - the artefact is unmodified (its hash test passes);
    - the only observable change is the admin rows.
  - Recovery: revert both commits together. The rekey and the tests are
    atomic.
  - Remaining gaps: parity and documentation.
  - Compatibility decision: none. The manifest IDs are internal, and the
    package is pre-1.0.
- `EP-M6`: divergences from the backplane are explicit and guarded.
  - Requirements: `REQ-backplane`.
  - Evidence: the parity test passes against the fixture.
  - Conformance check:
    - only the two divergence kinds appear;
    - the dependency is development-only and authorized.
  - Recovery: revert.
  - Remaining gaps: documentation.
  - Compatibility decision: none.
- `EP-M7`: the documentation matches the implementation, and the roadmap is
  ticked.
  - Requirements: all trace links are closed.
  - Evidence: all gates pass, and the stale-claim search is clean.
  - Conformance check: the ADR 0009 and design updates have been reviewed.
  - Recovery: revert the documentation commit.
  - Remaining gaps: 1.3.3 and 2.4.1, which are out of scope.
  - Compatibility decision: none.

## Concrete steps

Working directory: the repository root. Use Bash with `set -o pipefail`, so
that a failed gate cannot appear to pass through `tee`. Log files follow
`/tmp/$ACTION-digitalpuddle-1-3-2-operation-registry-from-pinned-api-contract.out`.

```bash
set -o pipefail
BR=1-3-2-operation-registry-from-pinned-api-contract
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-$BR.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-$BR.out
make lint      2>&1 | tee /tmp/lint-digitalpuddle-$BR.out
make test      2>&1 | tee /tmp/test-digitalpuddle-$BR.out
make prove     2>&1 | tee /tmp/prove-digitalpuddle-$BR.out        # from EP-M3
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-$BR.out  # docs changes
make nixie     2>&1 | tee /tmp/nixie-digitalpuddle-$BR.out           # docs changes
```

Delegate full gate runs to the `scrutineer` agent where possible, then read the
cited logs on failure rather than re-running.

Focused red, green, and refactor loops, by milestone:

```plaintext
EP-M2 Red:   bun test tests/path-template.test.ts -> failures "not implemented"
EP-M2 Green: bun test tests/path-template.test.ts -> all pass; statistics printed
EP-M3 Red:   make prove -> Dafny reports unproved postconditions in path-template.dfy
EP-M3 Green: make prove -> "Dafny program verifier finished with N verified, 0 errors"
EP-M3 Mutant: invert compareSpecificity literal preference; make prove -> postcondition failure; restore; lsc regen
EP-M4 Red:   bun test tests/operation-registry.test.ts -> failures against stubs
EP-M5 Red:   bun test tests/digitalocean-operation-registry.test.ts tests/openapi-capabilities.test.ts -> old IDs fail
EP-M6 Red:   bun test tests/operation-registry-backplane-parity.test.ts -> divergence list printed, fixture empty
```

Known baseline: at `889431f`, the gates are expected to pass. Before `EP-M1`,
run the four gates once on the unchanged tree and record the results here. That
separates baseline failures from regressions.

## Validation and acceptance

After `EP-M7`, run this quick check:

```bash
bun -e "import {loadDigitalOceanOperationRegistry as l} from './src/openapi/index.ts'; \
const r = await l(); console.log(r.operations.length, r.excludedOperations.length, \
JSON.stringify(r.resolveRequest('DELETE','/v2/projects/default')))"
```

It is expected to print a structured `digitalpuddle.registry.built` log line,
then:

```plaintext
620 15 {"kind":"method-not-allowed","allow":["GET","PATCH","PUT"]}
```

Quality criteria:

- Tests: `make test` passes, including the new suites:
  - `tests/path-template.test.ts`;
  - `tests/operation-registry.test.ts`;
  - `tests/digitalocean-operation-registry.test.ts`;
  - `tests/operation-registry-backplane-parity.test.ts`;
  - the updated `tests/base.test.ts`.
- Verification:
  - `make prove` reports 0 errors for `L-compare-order`, `L-no-tie`, and
    `INV-most-specific`, with the mutation transcript recorded;
  - the property statistics meet the thresholds in `Verification plan`.
- Lint and types: `make check-fmt`, `make typecheck`, and `make lint` pass
  with no new suppressions. Any `as` assertion carries the safety comment that
  Oxlint requires.
- Documentation: `make markdownlint` and `make nixie` pass.
- Performance: building the registry from the real pin takes under 250 ms on
  the development host. A test asserts a generous bound of 2,000 ms, to catch
  only pathological regressions.

Record each milestone's red and green evidence in `Artefacts and notes`.

## Idempotence and recovery

Every step can be re-run:

- the tests and gates are read-only, apart from snapshot updates, which are
  deliberate and reviewed;
- `lsc gen` and `lsc regen` regenerate `*.dfy.gen` deterministically;
- `bun install` is lockfile-pinned.

To abandon a milestone, `git reset --hard` to the previous milestone commit;
each milestone is a commit. Remove any seeded mutation by restoring the file
from Git and re-running `lsc regen`. Planning probes live in `/tmp/dp-probe`
and are never committed.

## Artefacts and notes

These are planning-probe transcripts, recorded at revision `889431f` and not
yet implementation evidence.

Pin statistics:

```plaintext
openapi 3.0.0; paths 430; operations 635; /v2 operations 620; missing operationId 0; duplicate IDs 0
methods: get 331, post 136, delete 93, put 61, patch 14
non-/v2 paths: /<upload_url>, /api/v1/chat/completions, /v1/async-invoke, /v1/batches, … (14 paths, 15 operations)
shape collisions: none; templated/literal sibling pairs: 35
```

`openapi-backend` parity probe, with the corpus as described in
`Verification plan`:

```plaintext
{ total: 3945, diffPath: 4, diff405: 67 }
GET /v2/droplets/autoscale/destroy_with_associated_resources:
  registry=/v2/droplets/autoscale/{autoscale_pool_id}:autoscalepools_get
  backend=droplets_list_associatedResources
DELETE /v2/databases/options: registry=405 backend=databases_destroy_cluster
```

## Interfaces and dependencies

`src/openapi/path-template.ts` (pure):

```ts
export interface PathSegment {
  readonly isParameter: boolean;
  readonly literal: string;
  readonly name: string;
}
export interface ParsedTemplate {
  readonly template: string;
  readonly segments: readonly PathSegment[];
  readonly shape: string;
}
export type PathTemplateIssue = {
  readonly code: 'empty-path-segment' | 'partial-segment-parameter';
  readonly template: string;
};
export const parsePathTemplate: (template: string) => ParsedTemplate | PathTemplateIssue;
export const splitRequestPath: (path: string) => readonly string[];
export const templateMatches: (segments: readonly PathSegment[], request: readonly string[]) => boolean;
export const compareSpecificity: (a: readonly PathSegment[], b: readonly PathSegment[]) => -1 | 0 | 1;
export const selectMostSpecific: (candidates: readonly (readonly PathSegment[])[]) => number;
export const extractPathParameters: (
  template: ParsedTemplate,
  request: readonly string[]
) => Readonly<Record<string, string>>;
```

`src/openapi/operation-registry.ts` (pure):

```ts
export interface PinnedContractIdentity { readonly upstreamCommit: string; readonly contractSha256: string }
export interface RegisteredOperation {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly pathTemplate: string;
  readonly operationKey: string;          // createOperationKey(method, pathTemplate)
  readonly tag: string | undefined;       // first OpenAPI tag
  readonly summary: string | undefined;
  readonly capability: Capability;
  readonly classificationSource: 'manifest' | 'default';
  readonly manifestEntry: CapabilityManifestEntry | undefined;
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
  | { readonly kind: 'not-found' };
export type OperationRegistryIssue = {
  readonly code: OperationRegistryIssueCode;
  readonly key: string;
  readonly detail: string;
};
export interface OperationRegistry {
  readonly identity: PinnedContractIdentity;
  readonly operations: readonly RegisteredOperation[];         // sorted by operationKey (code-unit order)
  readonly excludedOperations: readonly string[];              // operation keys outside /v2, sorted
  findByOperationId(operationId: string): RegisteredOperation | undefined;
  findByMethodAndPath(method: HttpMethod, pathTemplate: string): RegisteredOperation | undefined;
  listByCapability(capability: Capability): readonly RegisteredOperation[];
  resolveRequest(method: string, requestPath: string): RequestResolution;
}
export type OperationRegistryBuildResult =
  | { readonly ok: true; readonly registry: OperationRegistry }
  | { readonly ok: false; readonly issues: readonly OperationRegistryIssue[] };
export const buildOperationRegistry: (input: {
  readonly contract: ContractDocument;
  readonly classifications: readonly CapabilityManifestEntry[];
  readonly identity: PinnedContractIdentity;
}) => OperationRegistryBuildResult;
```

`resolveRequest` accepts any method string. An unknown method on a known path
yields `method-not-allowed`, since `Allow` is still meaningful. The single
object parameter of `buildOperationRegistry` satisfies Oxlint's
`no-object-parameters` only if that rule permits typed object parameters.
Otherwise, use three positional parameters, and record that choice in the
`Decision log`.

The adapter, the composition, and the reuse policy:

- `src/openapi/pinned-contract-file.ts` is the driven adapter, the only module
  that touches `node:fs`.
- `src/openapi/digitalocean-operation-registry.ts` is the composition, and the
  only module that knows the default classification source.
- `src/openapi/operation-registry.ts` owns resolution. Later handlers, the
  admin matrix (1.3.3), and the `501` catch-all (2.4.1) must query the
  registry. They must not re-parse the artefact, or re-implement matching.
- `createOperationKey` stays in `capabilities.ts`, and is reused for
  `operationKey`.
- `toUnsupportedOperationResponse` is unchanged.

Dependencies: two development dependencies only, `lemmascript` `^0.6.10` and
`openapi-backend` `^5.18.0`. No runtime additions. The host tools are Dafny
4.11.0 and Z3 4.12.1; CI installs them as described in `EP-M3`.

## Revision note

- 2026-11-15: initial draft from Wyvern reconnaissance and planning probes.
  This awaits community-of-experts review and user approval.
