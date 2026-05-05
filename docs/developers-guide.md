---
scope: Maintainer and contributor workflows for the DigitalPuddle repository,
  covering layout targets, ADR usage, testing expectations, logging, and
  transitional rules while the codebase adapts from Simulacat Core.
precedence: Informative companion to docs/digitalpuddle-technical-design.md and
  docs/adr/*.md; defers to ADRs and the technical design for normative
  architecture decisions.
---

# DigitalPuddle developers' guide

This guide is for contributors working on the DigitalPuddle codebase. It
covers repository layout, architectural decisions, development workflow,
testing expectations, and transitional rules that apply while the codebase is
being adapted from Simulacat Core.

## 1. Repository shape

The target repository layout is defined in
[the technical design](digitalpuddle-technical-design.md#16-repository-layout).
New DigitalPuddle work should move toward these areas:

- `src/simulation.ts` for top-level Simulacrum assembly;
- `src/openapi/` for the pinned DigitalOcean contract and operation registry;
- `src/store/` for state slices and backends;
- `src/handlers/` for DigitalOcean route handlers;
- `src/worker/` for scheduler, clock, transitions, faults, and state machines;
- `src/engines/` for k3d, MinIO, and future Droplet adapters;
- `src/journal/` for request journal storage and queries;
- `src/admin/` for `/_digitalpuddle` routes;
- `src/scenarios/` for scenario schemas and loaders;
- `src/cli/` for command-line entry points.

The inherited GitHub-oriented `src/graphql`, `src/rest`, and store entity files
are transitional. Do not expand their public surface unless a review task
explicitly requires keeping the baseline healthy.

## 2. Architectural decisions

Durable architectural decisions live in `docs/adr/`. Each entry is an
Architectural Decision Record (ADR). Add an ADR when a change settles a
boundary, rejects a plausible alternative, changes a dependency, or defines
compatibility policy. Keep ADRs short and link them from the roadmap when they
unblock implementation.

### 2.1. Current ADRs

Current Architectural Decision Records cover:

- Simulacrum as the HTTP backplane;
- the DigitalOcean OpenAPI pinning strategy;
- the v1 product slice that prioritizes DigitalOcean Kubernetes Service (DOKS);
- deterministic worker and virtual-time rules;
- the temporary treatment of inherited Simulacat transport coupling;
- the v1 product boundaries for node pools, Spaces, Droplets, and doctl.

## 3. Development workflow

Start by checking the branch:

```bash
git branch --show-current
```

Install dependencies:

```bash
bun install
```

Run the full code gate:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make all 2>&1 | tee /tmp/all-digitalpuddle-${BRANCH}.out
```

Run documentation gates when Markdown changes:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
```

Build the package when changing the CommonJS CLI:

```bash
make build 2>&1 | tee /tmp/build-digitalpuddle-$(git branch --show).out
```

## 4. Testing expectations

Use `bun test` for unit and behavioural tests. Keep tests deterministic:

- seed or avoid randomness;
- use virtual time for new asynchronous DigitalPuddle logic;
- use fixed ports only when a test owns the process lifetime;
- prefer generated cases with `fast-check` for invariants;
- validate command-line output when changing startup text;
- keep request and journal fixtures stable and sorted.

The inherited test suite still validates GitHub-specific behaviour. New
DigitalPuddle tests should be added alongside the new `/v2`, admin, scenario,
worker, and journal modules as those modules land.

## 5. Logging and observability

The baseline server supports opt-in structured request logging through:

```bash
DIGITALPUDDLE_REQUEST_LOG=1 bun run start
```

When enabled, responses are logged as JSON with method, path, status, and
duration. Future DigitalPuddle route work should also write request, response,
transition, engine-call, and fault events to the request journal. The journal is
the assertion surface; operational logs are diagnostic support.

## 6. Client compatibility tests

Client compatibility tests should follow ADR 0006. Terraform and doctl coverage
belongs with implemented `/v2` routes, not with unsupported product surfaces.
When a route claims doctl support, add command-level happy-path and unhappy-path
coverage after the route exists. Configure doctl with explicit `--api-url`
arguments in tests and examples.

## 7. Transitional architecture rules

The imported Simulacat code embeds GitHub URLs in entities and keeps some HTTP
details inside handlers. That is acceptable only as a temporary baseline. New
DigitalPuddle code should follow these rules:

- keep domain state free of transport URLs unless the upstream API contract
  stores that URL as data;
- build response URLs in serializers or response translators;
- map domain outcomes to HTTP status codes in handler adapters;
- translate request headers into explicit domain-level decisions before core
  logic runs;
- keep engine side effects in worker-owned adapters, not public handlers.

See
[ADR 0005](adr/0005-transitional-simulacat-boundaries.md)
for the transition policy.
