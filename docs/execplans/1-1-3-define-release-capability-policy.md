# Define the release capability policy

This ExecPlan (execution plan) is a living document. The sections
`Constraints`, `Tolerances`, `Risks`, `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work
proceeds.

Status: IN PROGRESS

## Purpose / big picture

DigitalPuddle needs one release capability policy before it can generate a
DigitalOcean operation registry, publish a capability matrix, or return
predictable unsupported responses. This plan covers roadmap task 1.1.3:
defining and implementing the policy for `scriptable`, `engine-backed`,
`stubbed`, and `unsupported` operations.

After the approved implementation lands, a maintainer can classify every
pinned DigitalOcean OpenAPI operation once, then use that classification to
drive generated documentation and runtime `501 Not Implemented` responses. The
observable result is that an operation classified as `unsupported` appears as
unsupported in the machine-readable matrix and receives a DigitalOcean-shaped
`501` response when requested through `/v2`. Supported operations remain
separated by how they are implemented: store and worker logic, engine-room
adapters, or deterministic static stubs.

This plan was approved for implementation on 2026-05-20. Keep this document
current as implementation proceeds.

## Approval gate

This plan has two phases:

1. Draft phase: write and review this ExecPlan only.
2. Execution phase: implement the policy, validation, documentation updates,
   CodeRabbit review, commits, and roadmap closure described below.

The execution phase is now active because the user explicitly requested
implementation on 2026-05-20.

## Constraints

- Keep Simulacrum as the HTTP and routing backplane. This follows
  `docs/adr/0001-simulacrum-backplane.md`.
- Keep the DigitalOcean OpenAPI pin as the public route source. This follows
  `docs/adr/0002-digitalocean-openapi-pin.md`.
- Keep v1 optimized for the Nile Valley DigitalOcean Kubernetes Service (DOKS)
  path, not broad DigitalOcean emulation. This follows
  `docs/adr/0003-doks-first-slice.md` and
  `docs/adr/0006-v1-product-boundaries.md`.
- Keep worker-owned engine side effects out of public handlers. Public
  handlers may classify and enqueue work, but they must not call k3d, Docker,
  MinIO, QEMU, or future engine adapters directly.
- Use hexagonal architecture to protect the boundary between policy/domain
  logic and adapters. Do not force a directory pattern where a smaller
  capability-policy module is clearer.
- Keep capability policy logic framework-free. Parsing OpenAPI input and
  emitting HTTP responses are adapter concerns; the classification model and
  invariants are domain policy.
- New DigitalPuddle code must not expand inherited GitHub-specific public
  surfaces except where needed to keep the imported baseline healthy.
- Documentation must use en-GB-oxendict spelling and follow
  `docs/documentation-style-guide.md`.
- Use `bun:test` for unit and behavioural tests.
- Use `fast-check` when validating invariants over operation sets, generated
  registries, or classification transitions.
- Use LemmaScript only if implementation introduces a durable policy axiom
  whose correctness is not adequately covered by exhaustive table tests or
  property tests. The proof must be substantive and checked through the
  LemmaScript toolchain rather than restating the type signature.
- Run gates sequentially. Do not run format checks, lint, or tests in parallel.
- Use `tee` for all gates, so truncated terminal output can be inspected later.
- Use `coderabbit review --agent` after each major implementation milestone and
  resolve all actionable concerns before continuing.
- Do not mark roadmap task 1.1.3 done until the approved implementation,
  documentation, validation, CodeRabbit review, and commit history are complete.

If satisfying the task requires violating any constraint, stop, record the
conflict in `Decision Log`, and ask the user how to proceed.

## Tolerances

- Scope: if implementation requires more than 12 tracked files or more than
  700 net lines outside generated artefacts, stop and explain why the policy
  needs a broader slice.
- Public API: if an existing exported TypeScript API signature must change
  rather than adding a new DigitalPuddle-specific API, stop and present options.
- Dependencies: if a new runtime dependency is needed, stop and ask for
  approval. A dev dependency for OpenAPI validation, property testing, or
  LemmaScript proof checking also requires approval unless it is already present
  in `package.json`.
- OpenAPI pin: if the DigitalOcean OpenAPI artefact must be added or refreshed
  to complete this task, stop and ask whether to merge roadmap task 1.3.1 into
  this slice.
- Ambiguity: if an operation can reasonably be classified in two ways and the
  choice affects user-visible behaviour, add a decision record entry and ask
  for approval unless the answer is already determined by
  `docs/digitalpuddle-technical-design.md` or ADR 0006.
- Validation: if any gate still fails after two focused correction attempts,
  stop with the failing log path and a concise diagnosis.
- CodeRabbit: if CodeRabbit reports a concern that would require expanding
  scope beyond these tolerances, stop and ask for direction.

## Risks

- Risk: capability classifications drift between documentation, registry data,
  and runtime fallback behaviour.
  Severity: high.
  Likelihood: medium.
  Mitigation: make one manifest or OpenAPI extension the source of truth, then
  derive the matrix, admin response, generated docs metadata, and unsupported
  handler from that source.

- Risk: `stubbed` can become a false claim of real behavioural support.
  Severity: medium.
  Likelihood: medium.
  Mitigation: define `stubbed` as deterministic and intentionally lightweight,
  require docs to label it separately, and test that stubbed operations do not
  enqueue engine work.

- Risk: `engine-backed` can leak infrastructure side effects into HTTP
  handlers.
  Severity: high.
  Likelihood: medium.
  Mitigation: the policy may identify an operation as engine-backed, but the
  implementation path must still go through worker-owned ports and adapters.

- Risk: unsupported route semantics can blur `404`, `405`, and `501`.
  Severity: medium.
  Likelihood: high.
  Mitigation: define status semantics centrally. Unknown non-DigitalPuddle
  routes stay normal routing misses, known paths with unsupported methods
  return `405` with `Allow`, and classified unsupported DigitalOcean operations
  under `/v2` return a DigitalOcean-shaped `501` envelope.

- Risk: the repository is still in the imported GitHub-shaped baseline.
  Severity: medium.
  Likelihood: high.
  Mitigation: implement a narrow DigitalPuddle capability-policy spine under
  target paths such as `src/openapi/`, `src/handlers/`, and `src/admin/` without
  moving the whole repository layout in this task.

- Risk: route classification may require the pinned DigitalOcean OpenAPI
  contract, which roadmap task 1.3.1 has not yet added.
  Severity: high.
  Likelihood: medium.
  Mitigation: keep this task focused on the policy schema, seed v1 manifest,
  invariants, and runtime behaviour shape. If a real pin is required, escalate
  rather than silently absorbing 1.3.1.

## Capability policy definitions

The approved implementation should define a closed capability vocabulary:

- `scriptable`: the simulator can satisfy the operation through deterministic
  state reads, state writes, validation, action creation, scheduler work, or
  worker transitions, without calling an engine adapter.
- `engine-backed`: the operation is part of the supported v1 workflow and its
  lifecycle requires a worker-owned engine-room side effect, such as k3d
  cluster creation or deletion. Public handlers still only validate, write
  state, enqueue jobs, and emit responses.
- `stubbed`: the operation is deliberately static or lightweight. It returns a
  deterministic response from policy-approved data, examples, or fixtures, and
  is not evidence of full control-plane modelling.
- `unsupported`: the operation is intentionally unavailable in this release.
  When a request resolves to this operation under `/v2`, DigitalPuddle returns a
  DigitalOcean-shaped `501 Not Implemented` envelope.

The policy should also define implementation metadata that can be used without
guesswork:

- `operationId`, HTTP method, OpenAPI path template, capability, release stage,
  optional product area, optional notes, and optional follow-on phase.
- Whether the operation appears in generated public capability docs.
- Whether unsupported runtime behaviour should be `501`, `405`, or normal route
  miss handling.
- Whether a supported operation needs a handler, a worker transition, an engine
  port, a deterministic fixture, or no runtime code yet.

Use a DigitalPuddle-owned OpenAPI extension such as
`x-digitalpuddle-capability` when decorating operation objects, or use a
sidecar manifest that can later be merged into generated OpenAPI metadata. The
source must be machine-readable and validated; comments in documentation are
not sufficient.

## Prior art and external references

OpenAPI supports patterned `x-*` specification extensions, which makes a
DigitalPuddle-owned capability extension a conventional way to carry
operation-level metadata without forking the upstream schema format:
<https://spec.openapis.org/oas/v3.1.0.html#specification-extensions>.

HTTP `501 Not Implemented` is the appropriate status when the server lacks the
capability to fulfil a request, but `405 Method Not Allowed` remains the right
shape for a known path with an unsupported method:
<https://www.rfc-editor.org/rfc/rfc9110.html#name-501-not-implemented>.

Stoplight Prism demonstrates the prior-art pattern of using an API description
document as the mock server source for endpoints, validation, and static or
dynamic mock responses:
<https://docs.stoplight.io/docs/prism/83dbbd75532cf-http-mocking>.

The Wyvern research pass also identified OpenAPI Backend, Connexion,
go-swagger, Schemathesis, Pact, Dredd, ReadMe, Bump, Redocly, and Kusk as
useful examples for handler fallbacks, generated documentation metadata, and
contract-test expectations. They are informative references only; this task
should not add those tools unless an approved later change needs them.

## Implementation plan

### Milestone 1: record the policy decision

Create a narrow ADR, probably `docs/adr/0007-release-capability-policy.md`,
that makes the capability vocabulary and source-of-truth rule durable. The ADR
should state that every public DigitalOcean operation known to the pinned
contract must have exactly one DigitalPuddle capability classification before
release, and that generated docs plus unsupported runtime responses must be
derived from the same classification source.

Update `docs/digitalpuddle-technical-design.md` sections 7.1, 8.2, 16, 17.2,
and 20 so the design explains how the policy feeds the operation registry,
capability matrix, admin API, generated docs, and unsupported handler. Update
`docs/users-guide.md` with user-facing capability meanings and unsupported
response behaviour. Update `docs/developers-guide.md` with maintainer-facing
rules for adding or changing classifications.

Run documentation validation after this milestone:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
coderabbit review --agent 2>&1 | tee /tmp/coderabbit-docs-digitalpuddle-${BRANCH}.out
```

Commit the documentation decision with a file-based commit message after gates
and CodeRabbit concerns are clear.

### Milestone 2: add the capability policy model and manifest

Add a small policy module under the target OpenAPI area, for example
`src/openapi/capabilities.ts`. This module should own:

- the `Capability` union type;
- runtime validation for capability manifest entries;
- helpers for creating canonical method and path keys;
- predicates such as `isSupportedCapability` and
  `requiresEngineBackedWorker`;
- a DigitalPuddle v1 seed manifest for the operations already listed in
  `docs/digitalpuddle-technical-design.md` section 8.2.

Prefer the existing dependency set. `zod` is available in the repository, but
the current version is Zod 3, so do not use Zod 4-only APIs unless a dependency
upgrade is explicitly approved. `fast-check` is also already available for
property tests.

The model must stay free of Express, Simulacrum request objects, filesystem
I/O, and engine adapters. Reading a manifest file, decorating OpenAPI, and
serving HTTP responses belong in adapters.

Add unit tests with `bun:test`, probably under
`tests/openapi-capabilities.test.ts`. Cover:

- all four capability literals parse successfully;
- unknown capability literals fail validation;
- each manifest entry has method, path, operation ID, and exactly one
  capability;
- the v1 section 8.2 operations classify as expected;
- unsupported entries carry enough metadata to produce a `501` envelope;
- engine-backed entries identify worker or engine requirements without
  importing engine adapters.

Add property tests with `fast-check` for policy invariants over generated
manifest entries: canonical operation keys are stable, capability parsing is
closed over the four allowed values, and a matrix projection never drops or
duplicates entries.

Run gates after this milestone:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make generate 2>&1 | tee /tmp/generate-digitalpuddle-${BRANCH}.out
env -u FORCE_COLOR make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
coderabbit review --agent 2>&1 | tee /tmp/coderabbit-policy-digitalpuddle-${BRANCH}.out
```

Commit the policy model and tests after gates and CodeRabbit concerns are
clear.

### Milestone 3: derive docs and runtime projections

Add pure projection helpers that turn the manifest into:

- a machine-readable capability matrix suitable for
  `/_digitalpuddle/capabilities`;
- generated documentation metadata, including a clear legend for the four
  capability states;
- lookup data for unsupported public operations.

If the pinned OpenAPI artefact is not yet present, keep the projection
operating on the v1 seed manifest and document the follow-on integration point
for roadmap tasks 1.3.1 through 1.3.3. Do not invent a fake DigitalOcean
OpenAPI pin in this task.

Add behavioural tests with `bun:test` for the projection shape. At minimum,
test that the generated matrix includes the v1 supported routes, the
unsupported catch-all policy, and follow-on unsupported product areas from ADR
0006 such as Droplets, mutating node-pool operations, and Spaces access-key
control-plane routes.

If a route-level adapter can be added without absorbing later roadmap work, add
a narrow unsupported-response helper under `src/handlers/unsupported.ts` and
test that a classified unsupported operation maps to a DigitalOcean-shaped
`501` envelope. If adding an actual `/v2/*` catch-all requires the full
operation registry from 1.3.2 or the capability matrix from 1.3.3, stop at the
pure helper and record the dependency instead of broadening scope.

Run gates after this milestone:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make generate 2>&1 | tee /tmp/generate-digitalpuddle-${BRANCH}.out
env -u FORCE_COLOR make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
coderabbit review --agent 2>&1 | tee /tmp/coderabbit-projections-digitalpuddle-${BRANCH}.out
```

Commit the projection helpers and behavioural tests after gates and CodeRabbit
concerns are clear.

### Milestone 4: integrate with assembly only within scope

Inspect `src/index.ts`, `src/extend-api.ts`, and `src/rest/index.ts` before
making integration changes. The current baseline still assembles a GitHub API
simulation around `api.github.com.json`, GraphQL routes, and GitHub handlers.
The approved implementation may add DigitalPuddle-specific seams, but it must
not complete the full repository layout migration promised by roadmap task
1.2.2.

If safe within the tolerances, add an internal assembly hook that can expose the
capability matrix through the future `/_digitalpuddle/capabilities` admin
surface or through a pure function consumed by that future route. If this
requires changing the public `simulation()` API or disturbing the inherited
baseline, stop and record the integration as a follow-on dependency.

Run all required code gates:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make generate 2>&1 | tee /tmp/generate-digitalpuddle-${BRANCH}.out
env -u FORCE_COLOR make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

Commit any integration work after gates pass.

### Milestone 5: close documentation and roadmap

Update this ExecPlan's living sections with the actual implementation evidence.
Mark roadmap item 1.1.3 done in `docs/roadmap.md` only after all approved work,
tests, docs, and CodeRabbit concerns are complete. Add any final design notes
or ADR references to `docs/digitalpuddle-technical-design.md`,
`docs/users-guide.md`, and `docs/developers-guide.md`.

Run the final full gate sequentially:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make generate 2>&1 | tee /tmp/generate-digitalpuddle-${BRANCH}.out
env -u FORCE_COLOR make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
coderabbit review --agent 2>&1 | tee /tmp/coderabbit-final-digitalpuddle-${BRANCH}.out
```

Commit the roadmap and final documentation closure after all gates and
CodeRabbit concerns are clear.

## Validation strategy

The approved implementation must be validated at three levels.

Unit tests should cover the capability vocabulary, manifest validation,
canonical key helpers, classification predicates, and unsupported response
payload helper. These tests should not start a server or import infrastructure
adapters.

Behavioural tests should cover the externally relevant projections: generated
capability matrix entries, generated documentation metadata, and the
DigitalOcean-shaped unsupported response contract. If an admin route is added,
test the route through the same HTTP harness pattern used elsewhere in the
repository. If the admin route is deferred, test the pure route payload shape
and record the dependency.

Property tests should cover invariants over manifest entries and projections.
Useful invariants include: every operation key appears once in the matrix, every
matrix row has one of the four capability values, unsupported rows always have
`501` response metadata, and projecting the same manifest twice gives
byte-identical JSON after stable sorting.

LemmaScript proof is not automatically required. If the implementation adds a
policy axiom such as "the unsupported fallback is total over all classified
operations" and that claim cannot be exhaustively tested over the finite v1
manifest, add a proof harness and run the relevant LemmaScript check. If no
such axiom is introduced, record in `Decision Log` that property tests and
finite table tests are the appropriate validation.

## Progress

- [x] 2026-05-19: Loaded the `leta`, `execplans`,
  `hexagonal-architecture`, `firecrawl-mcp`, `commit-message`,
  `pr-creation`, and `en-gb-oxendict-style` skills needed for this planning
  pass.
- [x] 2026-05-19: Created the Leta workspace for this checkout.
- [x] 2026-05-19: Renamed the branch to
  `1-1-3-define-release-capability-policy`.
- [x] 2026-05-19: Reviewed the roadmap, technical design, ADRs, users' guide,
  developers' guide, Makefile, package scripts, and current source shape.
- [x] 2026-05-19: Used a Wyvern agent team for repository-specific planning
  research and prior-art research.
- [x] 2026-05-19: Used Firecrawl to verify OpenAPI extension support, HTTP
  `501` semantics, Prism prior art, and LemmaScript repository signals.
- [x] 2026-05-19: Draft this ExecPlan for review.
- [x] 2026-05-20: Received explicit approval to proceed with implementation.
- [x] 2026-05-20: Confirmed the branch is
  `1-1-3-define-release-capability-policy` and the working tree was clean
  before implementation began.
- [x] 2026-05-20: Implemented milestone 1 documentation: added ADR 0007
  and updated the technical design, users' guide, and developers' guide.
- [x] 2026-05-20: Milestone 1 gates passed:
  `bun fmt`, `make markdownlint`, `make nixie`, and
  `coderabbit review --agent` with 0 findings after one wording fix.
- [ ] Commit milestone 1.
- [x] 2026-05-20: Implemented milestone 2 policy model in
  `src/openapi/capabilities.ts` with Zod validation, canonical operation keys,
  capability predicates, and the v1 seed manifest.
- [x] 2026-05-20: Added `tests/openapi-capabilities.test.ts` with unit tests
  and `fast-check` property tests for the closed capability vocabulary and
  operation-key invariants.
- [x] 2026-05-20: Milestone 2 gates passed:
  `make check-fmt`, `make lint`, `make generate`, and
  `env -u FORCE_COLOR make test` with 123 passing tests.
- [x] 2026-05-20: CodeRabbit reported two milestone 2 concerns; renamed
  `requiresEngineBackedWorker` to `requiresEnginePort`, derived the HTTP method
  assertion from `httpMethodValues`, reran the gates, and reran CodeRabbit with
  0 findings.
- [ ] Commit milestone 2.
- [x] 2026-05-20: Implemented milestone 3 projection helpers in
  `src/openapi/projections.ts` and the pure unsupported response helper in
  `src/handlers/unsupported.ts`.
- [x] 2026-05-20: Added `tests/openapi-projections.test.ts` to cover the
  capability matrix, documentation metadata, unsupported operation lookup,
  DigitalOcean-shaped `501` response envelope, and stable sorted projection
  invariant.
- [x] 2026-05-20: Milestone 3 gates passed after correcting one test assertion:
  `make check-fmt`, `make lint`, `make generate`, and
  `env -u FORCE_COLOR make test` with 131 passing tests.
- [x] 2026-05-20: CodeRabbit reviewed milestone 3 with 0 findings.
- [ ] Commit milestone 3.
- [x] 2026-05-20: Implemented milestone 4 within scope by exposing
  `/_digitalpuddle/capabilities` from the existing router extension point,
  backed by the pure capability documentation projection.
- [x] 2026-05-20: Added behavioural coverage in `tests/base.test.ts` for the
  private capabilities admin route.
- [x] 2026-05-20: Milestone 4 gates passed:
  `make check-fmt`, `make lint`, `make generate`, and
  `env -u FORCE_COLOR make test` with 132 passing tests.
- [x] 2026-05-20: CodeRabbit reported two admin-module documentation concerns;
  replaced a redundant wrapper with a direct re-export, clarified the module
  JSDoc, reran the gates, and reran CodeRabbit with 0 findings.
- [ ] Commit milestone 4.
- [ ] Implement milestone 5, mark roadmap task 1.1.3 done, and commit it.
- [ ] Push the completed implementation branch and update the pull request.

## Surprises & discoveries

- Observation: the current source tree is still the imported GitHub-shaped
  baseline. `src/index.ts`, `src/extend-api.ts`, and `src/rest/index.ts`
  assemble GitHub schema and handlers, while target DigitalPuddle paths such as
  `src/openapi/`, `src/handlers/`, and `src/admin/` do not yet exist.
  Impact: the implementation should add a narrow capability-policy spine rather
  than attempting the larger layout migration from roadmap task 1.2.2.

- Observation: roadmap task 1.3.1, which adds the pinned DigitalOcean OpenAPI
  artefact, has not landed yet.
  Impact: this plan must not require a real pin unless the user explicitly
  expands scope. A v1 seed manifest can express the policy now and later attach
  to the pinned contract.

- Observation: existing documentation already states the planned `/v2` and
  `/_digitalpuddle` split and unsupported behaviour.
  Impact: documentation updates should sharpen policy and maintainer rules
  without overstating current runtime support before implementation lands.

- Observation: Firecrawl and Wyvern prior-art research agree that OpenAPI
  `x-*` extensions are the conventional metadata channel, while mock servers
  commonly separate routing misses, unsupported methods, and not-implemented
  operations.
  Impact: DigitalPuddle should preserve separate `404`, `405`, and `501`
  meanings instead of using `501` as a catch-all for every unmatched request.

- Observation: the existing test suite imports
  `src/__generated__/resolvers-types.ts`, and a fresh checkout may not have that
  ignored generated file present.
  Impact: validation commands that run tests must run `make generate` first.

- Observation: in this Lody shell, `FORCE_COLOR` causes Node to print a warning
  that changes the startup-output snapshots.
  Impact: validation commands that run `make test` should unset `FORCE_COLOR`
  for the test process while still invoking the repository's `make test`
  target.

- Observation: the approved plan still used draft-phase wording after the user
  approved implementation.
  Impact: the first execution edit changed this plan to `IN PROGRESS` and
  recorded the approval date before product changes began.

- Observation: `requiresEngineBackedWorker` was an imprecise name because the
  predicate checked the capability plus both worker and engine-port metadata.
  Impact: the helper is now named `requiresEnginePort`, which better describes
  the decision a caller can make from it.

- Observation: `expect.objectContaining({unsupported: undefined})` requires an
  `unsupported` property to exist with the value `undefined`.
  Impact: projection tests now assert that supported matrix rows do not have
  the `unsupported` property at all.

## Decision Log

- Decision: define capability policy as a source-of-truth manifest or
  OpenAPI-side extension, not as prose-only documentation.
  Rationale: roadmap task 1.1.3 requires the classifications to drive generated
  docs and runtime `501` responses. Prose cannot provide that guarantee.

- Decision: allow a sidecar v1 manifest before the pinned DigitalOcean OpenAPI
  artefact exists.
  Rationale: roadmap task 1.3.1 owns the pin. This task can still define the
  policy model and v1 classifications without pretending the pin has landed.

- Decision: keep the capability model independent of HTTP and engine
  adapters.
  Rationale: the policy is domain/application logic. HTTP response translation,
  Simulacrum routing, and engine calls are adapters and should not leak into the
  classification rules.

- Decision: treat LemmaScript as conditional for this task.
  Rationale: the planned policy is a finite manifest plus closed vocabulary. If
  implementation stays finite and property-tested, a proof would add ceremony
  without increasing confidence. If a general policy axiom is introduced, the
  proof requirement becomes active.

- Decision: treat the 2026-05-20 implementation request as the approval gate.
  Rationale: the user explicitly asked to proceed with the functionality set
  out in this ExecPlan, so the plan moved from draft to execution without
  changing scope.

- Decision: milestone 3 stops at pure projection and response helpers rather
  than adding a real `/v2/*` catch-all route.
  Rationale: the pinned OpenAPI artefact and operation registry are owned by
  roadmap tasks 1.3.1 and 1.3.2. Adding runtime routing now would either rely
  on a fake registry or broaden this slice beyond the approved tolerances.

## Outcomes & retrospective

This plan is still in draft. After implementation, update this section with the
actual files changed, validation logs, CodeRabbit result, commits, and any
follow-on work left for roadmap tasks 1.3.1, 1.3.2, 1.3.3, and 2.4.1.
