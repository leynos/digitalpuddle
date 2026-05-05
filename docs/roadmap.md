# DigitalPuddle roadmap

This roadmap turns the DigitalPuddle technical design into review-sized
delivery work. The design document remains the source of truth for the product
boundary, architecture, runtime model, public API scope, and validation
strategy. This document records build order only; it does not promise dates or
durations.

The roadmap follows the GIST model. Each phase states a falsifiable idea, each
step is a workstream that validates or falsifies part of that idea, and each
task is an execution unit with explicit dependencies and design citations. The
primary source is
[`docs/digitalpuddle-technical-design.md`](digitalpuddle-technical-design.md).
Architectural decisions are recorded under `docs/adr/`. There are no RFCs in
this repository yet, so early tasks still include the unresolved product
questions that need durable records before implementation broadens.

## 1. Foundation: make the imported baseline a DigitalPuddle spine

Idea: if DigitalPuddle settles its package boundary, API contract, runtime
contracts, and testing spine before feature work expands, later vertical slices
can adapt the Simulacat Core import without repeatedly reworking public
interfaces.

This phase keeps Simulacrum as the backplane while narrowing the repository
from a GitHub simulator into a DigitalOcean simulator. It should leave the
project with one assembly point, one pinned public contract strategy, and one
testable runtime shape for state, scheduling, journalling, and unsupported
routes.

### 1.1. Close the first implementation decisions

This step answers which design choices are fixed enough to build against and
which product questions still need explicit deferral. The outcome informs the
OpenAPI pin, first API slice, and future Droplet or Spaces work.

- [x] 1.1.1. Record ADRs for the Simulacrum backplane, DigitalOcean OpenAPI
      pinning, v1 DOKS scope, and deterministic virtual-time worker.
  - See `digitalpuddle-technical-design.md` §§1-4 and §20.
  - Success: each ADR states the decision, rejected alternatives, and the
    concrete implementation consequence for v1.
- [x] 1.1.2. Resolve the v1 node-pool, Spaces control-plane, Droplet engine, and
      doctl compatibility questions.
  - See `digitalpuddle-technical-design.md` §§8.2, 8.3, 12.2, 12.3, 18, and 20.
  - Success: every open question in §20 is either in the v1 scope, moved to a
    named follow-on phase, or explicitly rejected.
  - Decision: see `adr/0006-v1-product-boundaries.md`.
- [ ] 1.1.3. Define the release capability policy for `scriptable`,
      `engine-backed`, `stubbed`, and `unsupported` operations.
  - See `digitalpuddle-technical-design.md` §§7.1, 8.2, and 16.
  - Success: capability classifications can drive both generated docs and
    `501 Not Implemented` responses.

### 1.2. Keep the repository shape honest

This step answers whether the imported Simulacat repository can present as a
DigitalPuddle package while preserving the working adaptation substrate. The
outcome keeps later source moves deliberate instead of cosmetic.

- [x] 1.2.1. Reset package metadata, bundle naming, and unused mock-data
      payloads for DigitalPuddle.
  - See `digitalpuddle-technical-design.md` §§1, 4, and 16.
  - Success: package metadata, published files, and the CLI banner identify
    DigitalPuddle while the current Simulacrum-based gates still pass.
- [ ] 1.2.2. Introduce the target source layout incrementally around
      `simulation`, `openapi`, `store`, `handlers`, `worker`, `engines`,
      `journal`, `admin`, `scenarios`, and `cli` modules.
  - Requires 1.1.1 and 1.1.3.
  - See `digitalpuddle-technical-design.md` §§4, 7, and 16.
  - Success: new DigitalOcean work lands in target directories without breaking
    the inherited Simulacat tests during the transition.
- [ ] 1.2.3. Split retained GitHub compatibility scaffolding from DigitalPuddle
      production surfaces.
  - Requires 1.2.2.
  - See `digitalpuddle-technical-design.md` §§4 and 16.
  - See `adr/0005-transitional-simulacat-boundaries.md`.
  - Success: any remaining GitHub schemas, GraphQL helpers, or tests are marked
    as transitional fixtures or removed when no longer used by gates.

### 1.3. Establish the DigitalOcean contract spine

This step answers whether public routing can be driven from a pinned
DigitalOcean OpenAPI contract while preserving Simulacrum as the HTTP backplane.
The outcome unlocks route-level implementation and capability reporting.

- [ ] 1.3.1. Add the pinned DigitalOcean OpenAPI artefact and a repeatable
      refresh script with provenance.
  - Requires 1.1.1.
  - See `digitalpuddle-technical-design.md` §§4, 7.1, 8.1, and 20.
  - Success: the repository records the upstream source, pin, refresh command,
    and generated artefact hash.
- [ ] 1.3.2. Build the operation registry from the pinned OpenAPI contract.
  - Requires 1.1.3 and 1.3.1.
  - See `digitalpuddle-technical-design.md` §§7.1, 8.1, 8.2, and 13.
  - Success: every `/v2` operation in the pin is classified and can be queried
    by method, path, operation ID, and capability class.
- [ ] 1.3.3. Generate the initial capability matrix from the registry.
  - Requires 1.3.2.
  - See `digitalpuddle-technical-design.md` §§7.1, 8.2, and 13.
  - Success: the matrix is machine-readable, checked in or reproducibly
    generated, and exposes unsupported routes explicitly.

### 1.4. Build the deterministic runtime core

This step answers whether the simulator can model state transitions without
ambient time, ambient randomness, or handler-owned side effects. The outcome
unlocks the first public DOKS routes.

- [ ] 1.4.1. Implement seeded configuration, clock, and ID allocation adapters.
  - Requires steps 1.1-1.3.
  - See `digitalpuddle-technical-design.md` §§6.4, 9.2, 10.2, and 11.1.
  - Success: repeated runs with the same seed allocate the same IDs and virtual
    timestamps.
- [ ] 1.4.2. Implement the in-memory store backend and v1 state slices for
      account, regions, sizes, images, SSH keys, projects, Kubernetes clusters,
      node pools, actions, tombstones, rate limits, and the journal cursor.
  - Requires 1.4.1.
  - See `digitalpuddle-technical-design.md` §§7.2, 9.1, and 9.3.
  - Success: store writes are transactional for handler and worker updates.
- [ ] 1.4.3. Implement the scheduler and worker queue with virtual-time
      ordering.
  - Requires 1.4.1 and 1.4.2.
  - See `digitalpuddle-technical-design.md` §§7.3, 10.1, and 10.2.
  - Success: jobs drain deterministically and no public handler calls an engine
    adapter directly.
- [ ] 1.4.4. Implement the JSON Lines journal writer and core entry schema.
  - Requires 1.4.2 and 1.4.3.
  - See `digitalpuddle-technical-design.md` §§6.6, 7.5, and 14.
  - Success: request, response, transition, engine-call, and fault entries are
    append-only and ordered by sequence number.

## 2. DOKS vertical slice: make the first fake cloud useful

Idea: if DigitalPuddle can support Nile Valley's DOKS path end to end, with
realistic actions, kubeconfig retrieval, and explicit unsupported behaviour, the
project has a useful v1 before it attempts broader DigitalOcean coverage.

This phase delivers the public `/v2` slice that Terraform, doctl, and Nile
Valley need for cluster-oriented tests. The implementation should be narrow,
contract-first, and hostile enough to reveal client assumptions.

### 2.1. Serve the low-risk scriptable catalogue

This step answers whether the simulator can satisfy read-heavy DigitalOcean
client bootstrapping before engine-backed work exists. The outcome informs the
pagination, envelope, and rate-limit helpers reused by later routes.

- [ ] 2.1.1. Implement account, rate-limit, regions, sizes, and images routes
      with DigitalOcean response envelopes.
  - Requires 1.3.2 and 1.4.2.
  - See `digitalpuddle-technical-design.md` §§8.2, 8.4, and 9.1.
  - Success: list routes paginate correctly and every response includes the
    expected rate-limit headers.
- [ ] 2.1.2. Add contract tests for successful list, empty list, and error
      envelopes on scriptable routes.
  - Requires 2.1.1.
  - See `digitalpuddle-technical-design.md` §§8.4, 17.2, and 17.5.
  - Success: implemented route fixtures validate against the pinned OpenAPI
    schema.

### 2.2. Model keys, projects, and actions as stateful resources

This step answers whether stateful DigitalOcean resources can share the same
store, tombstone, and action contracts before Kubernetes enters the picture. The
outcome reduces risk in the cluster handlers.

- [ ] 2.2.1. Implement SSH key create, read, list, and delete behaviour.
  - Requires 2.1.1.
  - See `digitalpuddle-technical-design.md` §§8.2, 9.1, and 9.3.
  - Success: key creation validates public-key shape and deletes preserve
    tombstone semantics.
- [ ] 2.2.2. Implement project create, read, resource attach, and resource list
      behaviour.
  - Requires 2.1.1.
  - See `digitalpuddle-technical-design.md` §§8.2 and 9.1.
  - Success: project resources reference existing simulated resources and reject
    unknown identifiers with DigitalOcean-shaped errors.
- [ ] 2.2.3. Implement action creation, polling, and state-machine helpers.
  - Requires 1.4.3 and 2.2.1.
  - See `digitalpuddle-technical-design.md` §§8.2, 10.1, and 10.3.
  - Success: asynchronous operations return actions that transition through the
    documented lifecycle.

### 2.3. Provision DOKS through the worker

This step answers whether engine-backed routes can create a k3d-backed cluster
without leaking side effects into handlers. The outcome is the first usable
cloud simulation path.

- [ ] 2.3.1. Define the Kubernetes engine interface and k3d adapter contract.
  - Requires 1.4.3 and 2.2.3.
  - See `digitalpuddle-technical-design.md` §§6.3, 7.6, and 12.1.
  - Success: the worker can call the adapter through a narrow typed interface
    and surface adapter failures into actions.
- [ ] 2.3.2. Implement Kubernetes options, cluster list, cluster create, cluster
      get, cluster delete, and kubeconfig routes.
  - Requires 2.3.1.
  - See `digitalpuddle-technical-design.md` §§8.2, 10.1, 10.3, and 12.1.
  - Success: create returns before provisioning completes, polling reflects
    worker progress, and kubeconfig is available only after the cluster runs.
- [ ] 2.3.3. Add cluster lifecycle tests for provisioning, running, deleting,
      error, and tombstoned states.
  - Requires 2.3.2.
  - See `digitalpuddle-technical-design.md` §§10.3, 17.1, and 17.2.
  - Success: state transitions are deterministic and journalled.

### 2.4. Make unsupported surface area explicit

This step answers whether DigitalPuddle can refuse unsupported DigitalOcean
surface area safely. The outcome prevents accidental fake-success behaviour.

- [ ] 2.4.1. Implement the catch-all `/v2/*` unsupported handler.
  - Requires 1.3.3.
  - See `digitalpuddle-technical-design.md` §§6.5, 7.1, 8.2, and 17.2.
  - Success: unimplemented public routes return a DigitalOcean-shaped
    `501 Not Implemented` envelope.
- [ ] 2.4.2. Add tests that compare unsupported responses with the capability
      matrix.
  - Requires 2.4.1.
  - See `digitalpuddle-technical-design.md` §§7.1, 8.2, and 17.2.
  - Success: a route cannot be silently omitted from both handlers and the
    matrix.

## 3. Scenarios and admin surface: make failures inspectable

Idea: if scenarios, faults, admin controls, and the journal are first-class
surfaces, DigitalPuddle can test retry and teardown behaviour instead of only
happy paths.

This phase turns the simulator into a controllable harness target. It exposes
private routes under `/_digitalpuddle`, validates scenario data, injects
deterministic failures, and makes post-run assertions cheap.

### 3.1. Load typed scenarios

This step answers whether tests can configure deterministic hostile behaviour
without executable scenario code. The outcome informs the fault engine and admin
scenario routes.

- [ ] 3.1.1. Implement the scenario schema, loader, and validation errors.
  - Requires 1.4.1.
  - See `digitalpuddle-technical-design.md` §§11.1 and 15.
  - Success: invalid scenarios fail before routes start mutating state.
- [ ] 3.1.2. Add example scenarios for happy-path DOKS, first-create failure,
      stale reads, and stuck actions.
  - Requires 3.1.1.
  - See `digitalpuddle-technical-design.md` §§11.3 and 11.4.
  - Success: examples are validated in tests and documented for harness users.

### 3.2. Apply deterministic faults

This step answers whether request-time and transition-time faults can share one
precedence model. The outcome informs integration tests that need retries and
eventual consistency.

- [ ] 3.2.1. Implement fault matching, precedence, and primitives for
      `fail_first_n`, status/body override, delay, stale reads, post-delete
      `404`, stuck actions, rate-limit override, and response mutation.
  - Requires 3.1.1.
  - See `digitalpuddle-technical-design.md` §§7.4 and 11.2-11.3.
  - Success: route-specific overrides beat resource defaults, scenario defaults,
    and engine fallbacks.
- [ ] 3.2.2. Journal every applied and skipped fault decision.
  - Requires 1.4.4 and 3.2.1.
  - See `digitalpuddle-technical-design.md` §§7.5, 11.2, and 14.1.
  - Success: tests can explain why a request or transition behaved differently
    from the default path.

### 3.3. Expose private harness controls

This step answers whether Terratest and developers can inspect and drive the
simulation without reaching into internals. The outcome unlocks deterministic
end-to-end runs.

- [ ] 3.3.1. Implement `/_digitalpuddle/health`, `/version`, `/capabilities`,
      `/state`, `/journal`, and `/openapi`.
  - Requires 1.3.3 and 1.4.4.
  - See `digitalpuddle-technical-design.md` §§7.7 and 13.
  - Success: every read route returns stable JSON suitable for automation.
- [ ] 3.3.2. Implement `/_digitalpuddle/reset`, `/scenario`, `/clock/tick`, and
      `/clock/run-until-idle`.
  - Requires 1.4.3, 3.1.1, and 3.3.1.
  - See `digitalpuddle-technical-design.md` §§10.2 and 13.
  - Success: tests can advance virtual time and drain the queue without wall
    clock sleeps.
- [ ] 3.3.3. Implement leak detection for clusters, projects, actions, and
      engine resources.
  - Requires 2.3.2 and 3.3.1.
  - See `digitalpuddle-technical-design.md` §§13, 14.3, and 17.4.
  - Success: leak reports distinguish active, tombstoned, and orphaned
    resources.

## 4. Harness and substrate integration: prove the full loop

Idea: if the same deterministic API surface can drive k3d, MinIO, Terraform, and
Terratest in a repeatable local stack, DigitalPuddle is useful as a Nile Valley
test dependency rather than only as a unit-test library.

This phase validates the engine room and developer ergonomics. The important
result is not breadth; it is a boring, repeatable loop from compose startup
through cluster creation, Kubernetes smoke testing, teardown, and leak checks.

### 4.1. Run the real local substrates

This step answers whether k3d and MinIO can be managed as local engine-room
components without making DigitalPuddle a hosted service. The outcome informs
the Terratest helper API.

- [ ] 4.1.1. Add the compose stack for DigitalPuddle, k3d prerequisites, and
      MinIO.
  - Requires 2.3.1 and 3.3.1.
  - See `digitalpuddle-technical-design.md` §§12.1, 12.2, 15, and 17.3.
  - Success: `docker compose up -d --wait` starts a local stack with no real
    DigitalOcean credentials.
- [ ] 4.1.2. Implement run-scoped naming and cleanup for k3d clusters and MinIO
      state.
  - Requires 4.1.1.
  - See `digitalpuddle-technical-design.md` §§12.1, 12.2, and 17.3.
  - Success: teardown removes all run-scoped resources and leak detection can
    identify leftovers.

### 4.2. Provide Terratest helpers

This step answers whether Nile Valley can depend on a stable helper surface
instead of hand-rolling admin API calls. The outcome makes the end-to-end test
readable and repeatable.

- [ ] 4.2.1. Add a Go helper module for compose up/down, readiness, scenario
      loading, clock advancement, journal assertions, and leak assertions.
  - Requires 3.3.2 and 4.1.1.
  - See `digitalpuddle-technical-design.md` §§18 and 17.4.
  - Success: the helper exposes Terraform, Kubernetes, and journal options
    without callers knowing private route details.
- [ ] 4.2.2. Document the canonical Terratest flow with runnable examples.
  - Requires 4.2.1.
  - See `digitalpuddle-technical-design.md` §§17.4 and 18.
  - Success: examples show endpoint overrides, kubeconfig retrieval, teardown,
    and leak assertion.

### 4.3. Gate determinism and customer value

This step answers whether the simulator is repeatable enough to trust in CI. The
outcome becomes a hard release gate for future slices.

- [ ] 4.3.1. Add a deterministic replay test that runs the same scenario twice
      and compares byte-identical journals.
  - Requires 3.2.2 and 3.3.2.
  - See `digitalpuddle-technical-design.md` §§6.4, 14.2, and 17.5.
  - Success: any ambient time, randomness, or unordered output fails the gate.
- [ ] 4.3.2. Add a representative Nile Valley or Terraform DOKS end-to-end test.
  - Requires 4.2.1 and 4.3.1.
  - See `digitalpuddle-technical-design.md` §§8.3, 17.4, and 18.
  - Success: the test creates a cluster, fetches kubeconfig, runs a Kubernetes
    smoke check, destroys resources, and asserts no leaks.

## 5. Follow-on slices: extend only after v1 is boring

Idea: if the core v1 promise is already trustworthy and boring to operate,
DigitalPuddle can evaluate broader DigitalOcean emulation by customer value
instead of letting speculative surface area destabilize the release.

This phase captures work that the design mentions but deliberately keeps out of
the first useful release unless Nile Valley proves it is needed earlier.

### 5.1. Complete optional Kubernetes operations

This step answers whether node-pool management needs to be first-class after
cluster create, delete, and kubeconfig retrieval are stable. The outcome depends
on Nile Valley's scaling workflows.

- [ ] 5.1.1. Implement node-pool create, resize, delete, recycle, and upgrade
      behaviour if Nile Valley requires scaling workflows.
  - Requires phase 4.
  - See `digitalpuddle-technical-design.md` §§8.2, 10.3, and 20.
  - See `adr/0006-v1-product-boundaries.md`.
  - Success: node-pool actions update k3d agent counts and preserve action
    polling semantics.

### 5.2. Add Droplets only when they are product-critical

This step answers whether Droplet simulation should remain state-only,
container-backed, or QEMU-backed. The outcome prevents VM fidelity from entering
v1 without evidence.

- [ ] 5.2.1. Add a `NullDropletEngine` or small container-backed Droplet slice
      if customer tests require Droplet control-plane behaviour.
  - Requires phase 4.
  - See `digitalpuddle-technical-design.md` §§3, 9.1, 12.3, and 20.
  - See `adr/0006-v1-product-boundaries.md`.
  - Success: Droplet work has a named customer scenario and does not require
    QEMU accuracy.
- [ ] 5.2.2. Reassess a QEMU-backed engine only when cloud-init or boot
      semantics become unavoidable.
  - Requires 5.2.1.
  - See `digitalpuddle-technical-design.md` §§3 and 12.3.
  - Success: QEMU remains outside the default stack unless a failing customer
    test justifies the cost.

### 5.3. Expand Spaces and client compatibility deliberately

This step answers whether direct MinIO access is sufficient or whether clients
need DigitalOcean Spaces access-key or bucket control-plane metadata. The
outcome informs future API coverage without proxying object traffic.

- [ ] 5.3.1. Add Spaces access-key control-plane routes only if Nile Valley,
      Terraform, or doctl needs them.
  - Requires phase 4.
  - See `digitalpuddle-technical-design.md` §§2, 12.2, and 20.
  - See `adr/0006-v1-product-boundaries.md`.
  - Success: object-level S3 traffic still goes directly to MinIO.
- [ ] 5.3.2. Add bucket metadata control-plane routes only if Nile Valley needs
      them.
  - Requires phase 4.
  - See `digitalpuddle-technical-design.md` §§2, 12.2, and 20.
  - Success: object-level S3 traffic still goes directly to MinIO.
- [ ] 5.3.3. Expand doctl compatibility coverage from best-effort to gated only
      after the v1 route matrix is stable.
  - Requires phase 4.
  - See `digitalpuddle-technical-design.md` §§8.3 and 20.
  - See `adr/0006-v1-product-boundaries.md`.
  - Success: the CI matrix states which doctl workflows are supported and which
    remain best-effort.
