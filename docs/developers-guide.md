---
scope: Maintainer and contributor workflows for the DigitalPuddle repository,
  covering layout targets, ADR usage, testing expectations, logging, and
  transitional rules while the codebase adapts from Simulacat Core.
precedence: Informative companion to docs/digitalpuddle-technical-design.md and
  docs/adr/*.md; defers to ADRs and the technical design for normative
  architecture decisions.
---

# DigitalPuddle developers' guide

This guide is for contributors working on the DigitalPuddle codebase. It covers
repository layout, architectural decisions, development workflow, testing
expectations, and transitional rules that apply while the codebase is being
adapted from Simulacat Core.

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

The current transitional layout keeps `src/index.ts` as the package-facing
facade and moves server assembly to `src/simulation.ts`. Internal OpenAPI work
can import from `src/openapi/index.ts`, private `/_digitalpuddle` routes live
under `src/admin/routes.ts`, and new REST handler groups should land under
`src/handlers/` before they are composed by the inherited `src/rest` adapter.
The `src/worker/`, `src/engines/`, `src/journal/`, `src/scenarios/`, and
`src/cli/` directories currently expose narrow contracts and no-op factories
only; do not wire engine side effects or persistence through them until the
owned roadmap slice implements that behaviour.

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
- the v1 product boundaries for node pools, Spaces, Droplets, and doctl;
- the release capability policy for `scriptable`, `engine-backed`, `stubbed`,
  and `unsupported` operations.

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

### 3.1. Spelling policy

`make all` and `make markdownlint` enforce en-GB-oxendict spelling with the
`TYPOS_VERSION` pin in the `Makefile`. The gate first tests the policy helper,
refreshes the shared base dictionary, generates `typos.toml`, and scans tracked
Markdown files.

The cross-estate policy helper is the documented exception to the repository's
Bun-first scripting rule. It uses Python 3.13 through `uv` because the shared
implementation is maintained in `leynos/agent-helper-scripts` and reused by
repositories with different application toolchains.

The shared dictionary cache and its freshness metadata are untracked. The
helper replaces the cache only when the authoritative copy is newer and can
reuse a valid cached copy while offline. A clean checkout with an unavailable
network retains the reviewed, tracked `typos.toml` policy.

Do not edit generated entries in `typos.toml`. Put only repository-specific
proper nouns, quoted upstream titles, fixtures, stems or exclusions in
`typos.local.toml`, then regenerate with:

```bash
uv run scripts/generate_typos_config.py
```

Keep upstream API spellings in inline or fenced code where practical. Fenced
code blocks are ignored, but **inline code spans are not**: the shared
dictionary stopped excluding them, so an identifier in backticks reaches the
checker like any other word. Record it under `[patterns]` in
`typos.local.toml` and include the backticks in the pattern, so the same
letters in prose are still corrected. Never widen the exception back to all
inline code, and never add the bare word to `[words] accepted`, which disables
the correction everywhere.

### Dependency advisories

CI runs `bun audit` after the gates and fails on any advisory. Almost every
advisory this repository sees is transitive, through `@graphql-codegen/cli`,
`express` or the simulator packages, so there is no direct dependency to bump.
The `overrides` block in `package.json` answers those: each entry names the
lowest version that clears the advisory while staying inside the dependant's
major, so no resolution crosses a breaking boundary.

Run `bun audit` before pushing. When it reports something new, raise the
matching `overrides` entry rather than the direct dependency, run `bun install`
to refresh `bun.lock`, then run `make test`, because an override changes what
every dependant resolves to.

Build the package when changing the CommonJS CLI:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make build 2>&1 | tee /tmp/build-digitalpuddle-${BRANCH}.out
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
transition, engine-call, and fault events to the request journal. The journal
is the assertion surface; operational logs are diagnostic support.

Operational log fields must have bounded cardinality. Prefer stable reason
codes and counts over stack traces, raw request headers, user identifiers,
cursor values, fixture payloads, or arbitrary exception messages. High-detail
failure context belongs in deterministic tests, response envelopes, or the
request journal when that journal entry is part of an explicit debugging
contract.

## 6. Client compatibility tests

Client compatibility tests should follow ADR 0006. Terraform and doctl coverage
belongs with implemented `/v2` routes, not with unsupported product surfaces.
Configure doctl with explicit `--api-url` arguments in tests and examples.

## 7. Capability policy

ADR 0007 is the normative release capability policy. New or changed
DigitalOcean public operations must update the machine-readable capability
source in the same change as the contract, handler, or generated documentation
metadata that depends on it.

The current implementation keeps the source and projections in:

- `src/openapi/capabilities.ts` for the capability vocabulary, Zod validation,
  canonical operation keys, and v1 seed manifest;
- `src/openapi/projections.ts` for the capability matrix, documentation
  metadata, and unsupported operation lookup;
- `src/handlers/unsupported.ts` for pure DigitalOcean-shaped `501` response
  helpers;
- `src/admin/capabilities.ts` for the cached private capability payload;
- `src/admin/routes.ts` for the private `/_digitalpuddle/capabilities` route;
- `src/extend-api.ts` for transitional Simulacrum route composition.

Use these rules when changing classifications:

- choose exactly one of `scriptable`, `engine-backed`, `stubbed`, or
  `unsupported` for each known operation;
- keep classification and projection logic free of Express, Simulacrum request
  objects, filesystem I/O, and engine adapters;
- mark `engine-backed` only when public handlers still delegate side effects to
  worker-owned ports and adapters;
- mark `stubbed` only for deterministic static or lightweight responses that
  are intentionally not full control-plane models;
- provide `501` response metadata for every `unsupported` operation that can be
  matched under `/v2`;
- update unit and behavioural tests, including `fast-check` property tests for
  projection invariants, whenever the manifest shape or classification rules
  change.

## 8. DigitalOcean OpenAPI artefact refresh

The pinned DigitalOcean OpenAPI contract is checked in at
`src/openapi/digitalocean.openapi.json`. Its machine-readable provenance is
checked in beside it at `src/openapi/digitalocean.openapi.provenance.json`.

Refresh the artefact with:

```bash
bun run sync:openapi:digitalocean
```

The refresh command downloads the pinned upstream repository archive, bundles
`specification/DigitalOcean-public.v2.yaml` with `@redocly/cli`, canonicalizes
the generated JSON, sanitizes secret-like examples, writes the artefact and
provenance through atomic rename, and records the generated SHA-256 hash. It
expects a Unix-compatible `tar` executable on `PATH`, uses the repository-pinned
`@redocly/cli` from `node_modules`, and rejects source archive downloads
larger than 50 MiB before writing them to disk.

The reusable contract helpers live in `src/openapi/artifact.ts`. Keep that
module free of filesystem, network, process, and command-runner dependencies.
It owns:

- the artefact and provenance paths;
- the upstream repository, source path, and commit pin;
- the recorded refresh command;
- canonical JSON serialization;
- SHA-256 hashing;
- provenance validation, including raw-source and source-archive URLs tied to
  the pinned upstream commit.

When changing the pin, refresh script, bundled output, or provenance schema,
update the artefact and provenance together and add or update `bun:test`
coverage for both the pure helpers and the command path.

## 9. Transitional architecture rules

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

See [ADR 0005](adr/0005-transitional-simulacat-boundaries.md) for the
transition policy.
