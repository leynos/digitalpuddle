# Architecture Decision Record (ADR) 0007: Define the release capability policy

Status: Accepted

## Context

DigitalPuddle must narrow the imported Simulacat Core baseline into a
DigitalOcean simulator without repeatedly renegotiating which public operations
are real, static, engine-backed, or unavailable. Roadmap task 1.1.3 requires a
release capability policy whose classifications can drive generated
documentation and runtime `501 Not Implemented` responses.

The pinned DigitalOcean OpenAPI contract is not yet present in the repository.
Roadmap task 1.3.1 owns that pin. This decision therefore needs to work with a
sidecar v1 manifest now and with operation-level OpenAPI metadata later.

## Decision

DigitalPuddle uses a closed release capability vocabulary for public
DigitalOcean operations:

- `scriptable`: the simulator can satisfy the operation through deterministic
  state reads, state writes, validation, action creation, scheduler work, or
  worker transitions, without calling an engine adapter.
- `engine-backed`: the operation is part of the supported workflow and its
  lifecycle requires a worker-owned engine-room side effect, such as k3d
  cluster creation or deletion. Public handlers still validate, write state,
  enqueue work, and emit responses.
- `stubbed`: the operation is deliberately static or lightweight. It returns a
  deterministic response from policy-approved data, examples, or fixtures and
  does not claim full control-plane modelling.
- `unsupported`: the operation is intentionally unavailable in this release.
  A request that resolves to this operation under `/v2` returns a
  DigitalOcean-shaped `501 Not Implemented` envelope.

Every public DigitalOcean operation known to the pinned release contract must
have exactly one classification before release. During the pre-pin phase,
DigitalPuddle owns a machine-readable sidecar manifest for the v1 operation
seed. After the OpenAPI pin lands, the same classification data may be carried
through a DigitalPuddle-owned operation extension such as
`x-digitalpuddle-capability`, provided the manifest and generated OpenAPI
metadata still derive from one validated source of truth.

Generated capability documentation, private admin capability payloads, and
unsupported runtime response lookup data must be derived from the validated
classification source. Prose tables may explain the policy, but they are not
the source of truth.

`404 Not Found`, `405 Method Not Allowed`, and `501 Not Implemented` keep
separate meanings. Unknown non-DigitalPuddle routes remain normal routing
misses. Known paths with methods outside the operation contract return `405`
with `Allow` once the operation registry can identify them. Known
DigitalOcean operations classified as `unsupported` return `501`.

## Consequences

- The v1 DOKS-oriented manifest can land before the full DigitalOcean OpenAPI
  pin, which keeps roadmap task 1.1.3 independent of roadmap task 1.3.1.
- Capability policy code must stay independent of Express, Simulacrum request
  objects, filesystem I/O, and engine adapters.
- Documentation and admin payloads must label `stubbed` separately from
  `scriptable` and `engine-backed`, so users do not confuse static fixtures
  with full behavioural support.
- Public handlers may use the policy to decide what response shape to emit, but
  engine work remains behind worker-owned ports and adapters.
- Future route additions must update the validated capability source and tests
  in the same change as the handler or contract update.
