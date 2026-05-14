# Define the release capability policy for operations

This ExecPlan (execution plan) is a living document. The sections
`Constraints`, `Tolerances`, `Risks`, `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work
proceeds.

Status: DRAFT

## Purpose / big picture

DigitalPuddle cannot safely grow its DigitalOcean `/v2` surface until every
operation has a single, machine-readable release capability classification.
Roadmap task 1.1.3 defines that policy for `scriptable`, `engine-backed`,
`stubbed`, and `unsupported` operations.

After this plan is approved and implemented, a maintainer can inspect the
operation registry and see the same capability data driving generated
capability documentation, private admin reporting, and public
`501 Not Implemented` responses. The observable success signal is that every
operation from the pinned DigitalOcean OpenAPI contract is classified exactly
once, unsupported operations return a DigitalOcean-shaped `501` envelope, and
the generated capability matrix cannot drift from runtime dispatch.

This plan is planning-only until approved. Do not implement it until the user
explicitly approves this exact plan or an updated revision.

## Approval gate

This plan has two phases:

1. Draft phase: write and review this ExecPlan only.
2. Execution phase: after explicit user approval, add the capability policy,
   tests, documentation updates, roadmap update, CodeRabbit review, commits,
   push, and pull request work described below.

Silence is not approval. A future agent must not start the execution phase
until a user message explicitly approves the plan or asks for named revisions.

## Constraints

- Keep Simulacrum as the HTTP and routing backplane. This follows
  `docs/adr/0001-simulacrum-backplane.md`.
- Keep the DigitalOcean OpenAPI pin as the public contract source of truth.
  This follows `docs/adr/0002-digitalocean-openapi-pin.md`.
- Keep v1 optimized for the Nile Valley DigitalOcean Kubernetes Service (DOKS)
  path, not broad DigitalOcean emulation. This follows
  `docs/adr/0003-doks-first-slice.md` and
  `docs/adr/0006-v1-product-boundaries.md`.
- Keep engine side effects out of public handlers. Capability policy may say
  an operation is `engine-backed`, but only the worker may call k3d, MinIO, or
  future engine adapters.
- Protect hexagonal boundaries: pure policy logic belongs in the OpenAPI or
  domain/application boundary; HTTP handlers, admin routes, file generation,
  and unsupported response writers are adapters that consume that policy.
- Do not classify private `/_digitalpuddle/*` admin routes as DigitalOcean
  public operations. The release capability policy applies to public `/v2`
  operations from the pinned DigitalOcean contract.
- The default for any public `/v2` operation not explicitly assigned to
  `scriptable`, `engine-backed`, or `stubbed` is `unsupported`.
- Unsupported public operations must return a DigitalOcean-shaped error
  response with HTTP status `501`. DigitalOcean documents error objects with
  `id`, `message`, and optional `request_id`; use that shape unless the pinned
  schema requires a more specific envelope.
- Do not make normal simulator operation depend on outbound calls to real
  DigitalOcean.
- Documentation must use en-GB-oxendict spelling and follow
  `docs/documentation-style-guide.md`.
- Run gates sequentially. Do not run format checks, lint, or tests in
  parallel.
- Use `tee` for gates, so truncated terminal output can be inspected later.
- Commit only after the relevant gates pass.

If satisfying the task requires violating any constraint, stop, record the
conflict in `Decision Log`, and ask the user how to proceed.

## Tolerances

- Scope: if implementation requires a broad source-layout migration beyond
  `src/openapi`, narrowly needed route assembly seams, tests, and documentation,
  stop and ask for approval.
- File count: if implementation needs to modify more than twelve tracked files
  before generated artefacts, stop and explain why the plan no longer fits the
  foundation-policy slice.
- Lines: if implementation exceeds roughly 900 net non-generated lines, stop
  and split the work into a smaller policy milestone and a follow-on
  integration milestone.
- Dependencies: if a new runtime dependency is required, stop and ask for
  approval. Development-only dependencies are allowed only when the existing
  toolchain cannot validate a required invariant.
- Public API: if the implementation must change an existing exported
  TypeScript API that inherited Simulacat users may import, stop and ask for
  approval.
- OpenAPI pin: if the work cannot be implemented without adding or refreshing
  the pinned DigitalOcean OpenAPI artefact first, stop and either re-scope this
  task into 1.3.1 or ask for approval to pull 1.3.1 forward.
- Ambiguity: if an operation could reasonably be classified in two different
  non-unsupported classes and the choice changes runtime behaviour, stop and
  present the options.
- Validation: if any gate still fails after two focused correction attempts,
  stop with the failing log path and a concise diagnosis.
- CodeRabbit: if `coderabbit review --agent` raises a concern that requires a
  design change, update this plan and wait for approval before continuing.
- Time: if one implementation stage exceeds two hours of active work, pause
  and update `Progress`, `Surprises & Discoveries`, and `Decision Log` before
  continuing.

## Risks

- Risk: task 1.3.1, the pinned DigitalOcean OpenAPI artefact, may not exist
  when this task is implemented.
  Severity: high.
  Likelihood: medium.
  Mitigation: make the policy module accept an injected operation list and add
  fixture-driven tests now. Stop if a full upstream pin is required to complete
  the acceptance criteria.

- Risk: classifying capability in handlers would couple domain policy to
  transport code and make generated docs drift from runtime dispatch.
  Severity: high.
  Likelihood: medium.
  Mitigation: create a pure policy and registry module first, then make
  handlers, generated docs, and admin reporting consume that same model.

- Risk: `engine-backed` may be confused with "implemented now" even when the
  engine adapter or worker milestone has not landed.
  Severity: medium.
  Likelihood: high.
  Mitigation: store separate fields for capability class and implementation
  readiness, or require every `engine-backed` operation to declare its worker
  and engine dependency explicitly.

- Risk: unsupported behaviour can accidentally become route-not-found behaviour
  if the OpenAPI registry and catch-all handler are assembled separately.
  Severity: high.
  Likelihood: medium.
  Mitigation: add a registry coverage test proving every public operation has
  either a concrete handler or the shared unsupported adapter.

- Risk: OpenAPI operation IDs can be absent, duplicated, or changed by upstream
  spec evolution.
  Severity: medium.
  Likelihood: medium.
  Mitigation: key registry records by method and normalized path, treat
  `operationId` as a query alias, and fail fast on duplicate aliases.

- Risk: property tests or formal proof could become ceremonial if the
  invariants are too small or only restate implementation details.
  Severity: medium.
  Likelihood: medium.
  Mitigation: use `fast-check` for registry invariants over generated
  operation sets. Use LemmaScript only if a substantive invariant emerges, such
  as total classification coverage or precedence rules that are worth proving
  independent of one fixture.

- Risk: documentation-only roadmap closure could be mistaken for the
  implemented capability policy.
  Severity: medium.
  Likelihood: medium.
  Mitigation: do not mark roadmap task 1.1.3 done until the approved
  implementation lands. The planning pull request must describe itself as a
  pre-implementation plan.

## Progress

- [x] (2026-05-11) Read repository instructions, branch state, roadmap item
  1.1.3, the technical design, current guides, Makefile, and the previous
  ExecPlan.
- [x] (2026-05-11) Rename the branch to
  `1-1-3-define-the-release-capability-policy-for-operations`.
- [x] (2026-05-11) Use a Wyvern agent team to gather planning briefs on
  documentation, source-layout, test, and boundary risks.
- [x] (2026-05-11) Use Firecrawl to check external references for OpenAPI
  extension metadata, HTTP `501` semantics, DigitalOcean error envelopes, and
  LemmaScript prior art.
- [x] (2026-05-11) Draft this pre-implementation ExecPlan.
- [ ] Receive explicit user approval before implementing the capability policy.
- [ ] Add or update the architecture decision record for the capability policy
  if implementation confirms that a durable policy decision is needed.
- [ ] Implement the pure capability policy and operation registry model.
- [ ] Connect generated capability documentation, admin reporting, and
  unsupported response behaviour to the shared policy source.
- [ ] Add unit, behavioural, property, and any justified proof validation.
- [ ] Update relevant user, developer, design, and roadmap documentation.
- [ ] Run `make check-fmt`, `make lint`, `make test`, and any additional
  Markdown or proof gates.
- [ ] Run `coderabbit review --agent` after each major implementation
  milestone and clear all concerns.
- [ ] Commit each gated implementation milestone.
- [ ] Mark roadmap task 1.1.3 done only after the implemented feature passes
  gates.

## Surprises & discoveries

- Observation: the repository still contains the inherited GitHub-oriented
  TypeScript layout, and the target `src/openapi`, `src/handlers`,
  `src/worker`, and `src/admin` directories do not yet exist.
  Evidence: `leta files src` lists `src/rest`, `src/graphql`, and `src/store`
  as the active source areas.
  Impact: the first implementation should create only the minimum new
  capability-policy boundary needed for this task and avoid a full layout
  migration, which belongs to roadmap task 1.2.2.

- Observation: the previous completed ExecPlan for 1.1.2 was documentation-led
  and closed a decision task through ADR and guide updates.
  Evidence: `docs/execplans/1-1-2-resolve-open-questions.md` records that
  pattern.
  Impact: task 1.1.3 is more implementation-facing than 1.1.2 because success
  requires generated docs and `501` responses to share policy data. This plan
  therefore includes code, test, and documentation milestones.

- Observation: OpenAPI specification extensions are a common way to attach
  non-standard metadata to operations, including operation-level fields whose
  names start with `x-`.
  Evidence: Swagger's OpenAPI extension documentation describes `x-` custom
  properties on operations.
  Impact: if DigitalPuddle writes an enriched generated OpenAPI or matrix, the
  policy can use a DigitalPuddle-specific extension such as
  `x-digitalpuddle-capability` without pretending it is upstream
  DigitalOcean data.

- Observation: HTTP `501` is the standards-aligned status for a server lacking
  support for required request functionality.
  Evidence: RFC 9110 section 15.6.2 defines `501 Not Implemented` for that
  condition.
  Impact: the unsupported adapter should use `501` deliberately, with the
  DigitalOcean error envelope layered on top.

- Observation: DigitalOcean documents 400 and 500 error responses as JSON
  objects with `id`, `message`, and optional `request_id`.
  Evidence: DigitalOcean's public API overview describes those fields.
  Impact: `unsupported` responses should follow that envelope shape and should
  include rate-limit headers once the shared response helpers exist.

## Decision Log

- Decision: this plan treats the capability policy as a domain/application
  policy consumed by adapters, not as handler-local metadata.
  Rationale: generated docs, admin reporting, and unsupported responses must
  use one source of truth. This follows the hexagonal architecture dependency
  rule and avoids route adapter drift.
  Date/Author: 2026-05-11, Codex.

- Decision: public operation records are keyed canonically by HTTP method and
  normalized OpenAPI path, with `operationId` as a lookup alias.
  Rationale: method and path uniquely identify dispatch. Operation IDs are
  useful for generated clients and docs, but upstream specs can rename or omit
  them.
  Date/Author: 2026-05-11, Codex.

- Decision: `unsupported` is an explicit classification, and also the default
  for any public operation not listed in an intentional non-unsupported policy.
  Rationale: DigitalPuddle must fail closed and never invent happy-path
  behaviour for an unmodelled DigitalOcean route.
  Date/Author: 2026-05-11, Codex.

- Decision: the planning pull request must not mark roadmap task 1.1.3 done.
  Rationale: the roadmap item's success criteria require implemented generated
  docs and `501` responses. This draft only authorizes that implementation
  after approval.
  Date/Author: 2026-05-11, Codex.

## Outcomes & retrospective

This plan is still in draft. No runtime capability-policy implementation has
landed yet, and no roadmap entry should be marked done from the draft alone.

## Context and orientation

DigitalPuddle is a local DigitalOcean-shaped simulator being adapted from a
Simulacat Core baseline. Simulacrum is the HTTP and routing backplane: it owns
the lower-level server and routing mechanics, while DigitalPuddle supplies the
DigitalOcean-specific contract, state, handlers, worker, engines, journal, and
admin surface.

The source of truth for product architecture is
`docs/digitalpuddle-technical-design.md`. The build order is
`docs/roadmap.md`. Durable architecture decisions live under `docs/adr/`.
Maintainer workflow rules live in `docs/developers-guide.md`, and
user-visible expectations live in `docs/users-guide.md`.

Roadmap task 1.1.3 lives under "1.1. Close the first implementation
decisions". It cites these technical design sections:

- section 7.1, which defines the OpenAPI operation registry and the four
  capability classes;
- section 8.2, which lists the recommended v1 `/v2` endpoint matrix and the
  initial class for each route in the Nile Valley DOKS path;
- section 16, which names the target repository layout, including
  `src/openapi`, `src/handlers`, and `src/admin`.

The four capability classes mean:

- `scriptable`: the route is fully modelled using deterministic store reads,
  store writes, validation, scheduling, and normal worker transitions. It does
  not require direct substrate side effects from an engine adapter.
- `engine-backed`: the route is modelled by DigitalPuddle state and an
  asynchronous worker, but completion requires a side effect through an engine
  adapter such as k3d or MinIO.
- `stubbed`: the route intentionally returns static or lightweight data that is
  useful for client compatibility, such as Kubernetes version options, without
  pretending to support the full product surface.
- `unsupported`: the route is recognized as part of the public DigitalOcean
  surface but intentionally unavailable in this release. It returns explicit
  `501 Not Implemented` with a DigitalOcean-shaped error envelope.

The current source tree is still transitional. `src/rest`, `src/graphql`, and
`src/store` are inherited GitHub-oriented surfaces. New DigitalPuddle work
should move toward the target layout without expanding the inherited GitHub
surface unnecessarily.

Relevant skills for future implementation:

- Use `leta` before source navigation and refactoring.
- Use `hexagonal-architecture` to keep pure capability policy separate from
  HTTP, generated docs, and admin adapters.
- Use `zod4-typescript` if runtime validation schemas are introduced for
  capability policy files, generated matrices, or admin payloads.
- Apply `pr-creation` when opening the draft pull request.
- Follow `commit-message` for file-based commit messages.

## Plan of work

### Stage A: confirm policy scope and create the durable decision

Start by rereading `docs/roadmap.md`,
`docs/digitalpuddle-technical-design.md`, `docs/adr/0002-digitalocean-openapi-pin.md`,
`docs/adr/0003-doks-first-slice.md`,
`docs/adr/0004-deterministic-worker.md`, and
`docs/adr/0006-v1-product-boundaries.md`.

If the approved implementation still confirms that the capability policy is a
durable architectural decision, add `docs/adr/0007-release-capability-policy.md`.
The ADR should record the four classes, the fail-closed default, the single
source-of-truth rule, the method-and-path canonical key, and the consequence
that generated docs and unsupported responses consume the same registry.

End this stage by running Markdown formatting and linting for the ADR and
documentation touched so far. Run `coderabbit review --agent` if the ADR makes
or changes a material design decision.

### Stage B: add the pure capability policy module

Create the minimum target OpenAPI boundary, expected to be `src/openapi/`.
Add a pure module for capability types and policy rules. Suggested files are:

- `src/openapi/capabilities.ts` for exported types such as
  `CapabilityClass`, `OperationKey`, `CapabilityRecord`, and the policy
  builder;
- `src/openapi/capability-policy.ts` for the v1 override table if keeping data
  separate from helpers improves readability;
- `tests/openapi/capabilities.test.ts` for unit tests.

The module should accept normalized operation metadata rather than reading
files, environment variables, or HTTP state directly. A reasonable target API
is:

```ts
export type CapabilityClass =
  | "scriptable"
  | "engine-backed"
  | "stubbed"
  | "unsupported";

export type OperationKey = {
  readonly method: string;
  readonly path: string;
};

export type CapabilityRecord = OperationKey & {
  readonly operationId?: string;
  readonly capability: CapabilityClass;
  readonly release: "v1" | "future";
  readonly source: "explicit" | "default-unsupported";
  readonly rationale: string;
  readonly requiresWorker: boolean;
  readonly requiresEngine: boolean;
};
```

Keep this API small. If implementation needs more fields, document why in the
Decision Log before adding them.

Tests in this stage should cover:

- method normalization, including mixed-case methods;
- path normalization without losing OpenAPI path parameters;
- default `unsupported` classification for unlisted operations;
- duplicate method/path overrides failing fast;
- duplicate `operationId` aliases failing fast;
- class invariants, such as `engine-backed` requiring both worker and engine
  flags and `scriptable` requiring neither engine side effects nor adapter
  calls.

Use `fast-check` for invariants over generated operation lists, for example:
every unique method/path input produces exactly one output record, and
permuting the input operation order does not change the sorted matrix.

### Stage C: connect the registry to generated capability output

Add a reproducible matrix generator or a pure projection that the later
generator and admin route can use. If the pinned DigitalOcean OpenAPI artefact
does not exist yet, use a narrow fixture that represents the section 8.2
routes and document that full upstream coverage lands with roadmap tasks 1.3.1
and 1.3.2.

The generated or projected matrix should expose:

- OpenAPI pin or fixture provenance;
- total operation count;
- counts by capability class;
- one row per operation with method, path, operation ID where available,
  capability class, release status, rationale, and engine or worker
  requirements.

If the implementation writes a checked-in generated artefact, place it under a
documented path such as `docs/reference/capabilities.v1.json` only after
confirming that the repository wants generated documentation committed. If the
implementation only exposes a generator function now, document the future
checked-in artefact in `docs/developers-guide.md`.

Tests in this stage should assert stable sorting and stable output. Snapshot
tests are acceptable only when the input fixture is small and deterministic.

### Stage D: connect unsupported behaviour to the same policy

Add the shared unsupported response adapter at the intended handler boundary,
expected to become `src/handlers/unsupported.ts` or a narrowly scoped
transitional route adapter if `src/handlers` does not yet exist. Do not bury
the policy inside the adapter.

The unsupported adapter should accept a `CapabilityRecord` and produce a
DigitalOcean-shaped response with:

- HTTP status `501`;
- JSON body with `id: "not_implemented"` or another documented
  DigitalOcean-compatible identifier;
- `message` naming that the operation is unsupported by this DigitalPuddle
  release;
- operation metadata only if that does not violate the public error-envelope
  contract.

If the public `/v2` route assembly does not exist yet, implement the adapter
and behavioural tests around the adapter contract rather than creating a full
HTTP backplane prematurely. If a route assembly seam already exists, add a
behavioural test proving a classified unsupported route and a registered route
with no concrete handler both return the same `501` envelope.

### Stage E: update documentation and user-facing contracts

Update `docs/digitalpuddle-technical-design.md` sections 7.1, 8.2, 13, 16, and
17 as needed so they describe the implemented policy. The design should say
which file or generated artefact is authoritative.

Update `docs/developers-guide.md` with contributor rules:

- add new public `/v2` behaviour by updating capability policy first;
- do not add a handler that lacks a capability record;
- do not mark an operation `engine-backed` unless it has an explicit worker and
  engine plan;
- update generated capability output and tests when classifications change.

Update `docs/users-guide.md` with user-facing behaviour:

- where users can inspect capabilities when the admin route exists;
- what `scriptable`, `engine-backed`, `stubbed`, and `unsupported` mean;
- that unsupported DigitalOcean routes fail explicitly with `501`, not
  silently with success.

Update `docs/roadmap.md` to mark task 1.1.3 done only after the implemented
policy, tests, docs, and gates have landed. Do not mark it done for this
pre-implementation plan alone.

### Stage F: final review, gating, commit, push, and pull request

Run the full required gates sequentially. Use `/tmp` log files with the branch
name sanitized for path safety. Run CodeRabbit after each major milestone and
clear concerns before proceeding. For the final implementation branch, inspect
the full branch diff from merge base before writing the pull request body.

Create a draft pull request using the `pr-creation` skill. The pull request
title for the pre-implementation plan should be:

```plaintext
Define the release capability policy for operations (1.1.3)
```

The pull request summary must link this ExecPlan and state whether the pull
request is pre-implementation or an implementation of the approved plan.

## Concrete steps

Run commands from the repository root:

```bash
cd /home/leynos/.lody/repos/github---leynos---digitalpuddle/worktrees/6d46b825-ca2a-42d5-a734-1b86cfb825c7
```

Confirm branch and status:

```bash
git branch --show-current
git status --short
```

Expected branch:

```plaintext
1-1-3-define-the-release-capability-policy-for-operations
```

During implementation, create the policy module and tests, then run focused
tests first. The exact test names will depend on the final file layout, but
the command shape should be:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun test --max-concurrency=1 tests/openapi/capabilities.test.ts 2>&1 | tee /tmp/test-capabilities-digitalpuddle-${BRANCH}.out
```

Run formatting after documentation or TypeScript edits:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
```

Run the required project gates sequentially:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

Run Markdown-specific gates when documentation changes:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
```

Run CodeRabbit review after each major milestone:

```bash
coderabbit review --agent
```

Commit with a file-based commit message:

```bash
git add docs/execplans/1-1-3-define-the-release-capability-policy-for-operations.md
COMMIT_MSG_DIR=$(mktemp -d)
cat > "$COMMIT_MSG_DIR/COMMIT_MSG.md" << 'ENDOFMSG'
Define release capability policy plan

Add the pre-implementation ExecPlan for roadmap task 1.1.3 so
the capability policy can be reviewed before code changes land.
ENDOFMSG
git commit -F "$COMMIT_MSG_DIR/COMMIT_MSG.md"
rm -rf "$COMMIT_MSG_DIR"
```

Push and set upstream tracking:

```bash
git push -u origin 1-1-3-define-the-release-capability-policy-for-operations
```

Create a draft pull request only after validating the branch diff and writing a
body file according to the `pr-creation` skill.

## Validation and acceptance

For this pre-implementation planning branch, acceptance is:

- `docs/execplans/1-1-3-define-the-release-capability-policy-for-operations.md`
  exists and is self-contained.
- The plan has an explicit approval gate and does not authorize implementation
  before approval.
- The plan signposts `leta`, `hexagonal-architecture`, `zod4-typescript`,
  `commit-message`, and `pr-creation` where they are relevant.
- The plan records Wyvern and Firecrawl research inputs.
- `make check-fmt`, `make lint`, and `make test` pass.
- A draft pull request is opened with `(1.1.3)` in the title and this ExecPlan
  linked in the summary.

For the future approved implementation, acceptance is:

- Every operation in the pinned DigitalOcean OpenAPI contract is classified
  exactly once by method and normalized path.
- The classification can be queried by method, path, operation ID, and
  capability class.
- Generated capability output and runtime unsupported behaviour consume the
  same registry data.
- Unsupported public `/v2` operations return a DigitalOcean-shaped
  `501 Not Implemented` response.
- Missing classification, duplicate method/path entries, and duplicate
  operation ID aliases fail fast in tests.
- Unit tests cover policy classification, lookup, and invariant checks.
- Behavioural tests cover generated matrix output and unsupported response
  behaviour.
- Property tests with `fast-check` cover non-trivial registry invariants across
  generated operation sets.
- A LemmaScript proof is added only if implementation introduces an axiom or
  contractual invariant that benefits from proof beyond property tests.
- `docs/digitalpuddle-technical-design.md`, `docs/users-guide.md`,
  `docs/developers-guide.md`, and `docs/roadmap.md` are synchronized with the
  implemented behaviour.
- `make check-fmt`, `make lint`, and `make test` pass.
- `coderabbit review --agent` raises no unresolved concerns.

## Idempotence and recovery

The policy module should be pure and deterministic, so tests can be rerun
without environment cleanup. Generated artefacts must either be fully
reproducible or omitted from the repository until the generator is stable.

If formatting changes touch unrelated Markdown or TypeScript files, inspect
the diff before staging and do not include unrelated churn. If a gate fails,
read the corresponding `/tmp` log, make the smallest correction, rerun only the
failed gate first, then rerun the full required gate sequence before commit.

If a branch push fails because the remote branch does not exist, rerun the
push with `-u origin
1-1-3-define-the-release-capability-policy-for-operations`. If it fails because
the remote contains unrelated work, stop and ask before rebasing or force
pushing.

## Artefacts and notes

External references checked during planning:

- Swagger OpenAPI extension documentation: specification extensions use `x-`
  custom fields and are supported at the operation level.
- RFC 9110 section 15.6.2: `501 Not Implemented` is the HTTP status for a
  server that lacks support for the required request functionality.
- DigitalOcean public API overview: 400 and 500 error responses use JSON error
  bodies with `id`, `message`, and optional `request_id`; successful collection
  responses use resource roots, `meta`, `links`, and rate-limit headers.
- LemmaScript prior art: available examples show TypeScript-adjacent formal
  verification through a proof pipeline, but this task should use it only for a
  substantive invariant rather than as a checkbox.

Wyvern agent inputs incorporated into this plan:

- Keep the registry as the single source for docs, admin reporting, and
  unsupported responses.
- Prefer method/path as the canonical dispatch key and operation ID as a query
  alias.
- Treat generated matrix and runtime dispatch drift as the main failure mode.
- Account for the current transitional GitHub-oriented source tree and avoid a
  full repository layout migration in this task.

## Interfaces and dependencies

The implementation should introduce no new runtime dependency. It should use
standard TypeScript, Bun's test runner, existing project formatting and lint
tooling, and `fast-check` only if already available or approved as a
development-only dependency.

The capability policy should expose pure functions comparable to these names:

```ts
export function buildCapabilityRegistry(
  operations: readonly OpenApiOperation[],
  policy: CapabilityPolicy,
): CapabilityRegistry;

export function getCapabilityByRoute(
  registry: CapabilityRegistry,
  key: OperationKey,
): CapabilityRecord | undefined;

export function getCapabilityByOperationId(
  registry: CapabilityRegistry,
  operationId: string,
): CapabilityRecord | undefined;

export function listCapabilitiesByClass(
  registry: CapabilityRegistry,
  capability: CapabilityClass,
): readonly CapabilityRecord[];
```

The unsupported adapter should depend on `CapabilityRecord`, not on raw
OpenAPI documents or local policy tables. That boundary keeps classification
logic testable without the HTTP adapter and lets generated docs consume the
same registry.

## Revision notes

- 2026-05-11: Initial draft. Captures the pre-implementation plan, external
  research notes, Wyvern planning inputs, approval gate, and future validation
  criteria for roadmap task 1.1.3.
