# DigitalPuddle users' guide

DigitalPuddle is a local DigitalOcean-shaped API simulator for deterministic
infrastructure tests. It is currently in the initial repository-shaping phase:
the imported Simulacat Core baseline still runs, and the DigitalOcean `/v2`
surface is being built in roadmap order.

## Current status

The current package is useful as a working Simulacrum adaptation baseline. It
does not yet implement the DigitalOcean v2 API. Use the roadmap to distinguish
working behaviour from planned behaviour:

- the inherited baseline starts locally and exposes `/simulation`;
- the package metadata, README, design, and roadmap now describe
  DigitalPuddle;
- the planned public DigitalOcean API root is `/v2`;
- the planned private harness API root is `/_digitalpuddle`;
- capability classifications now have a machine-readable policy source, so the
  future generated capability matrix and unsupported responses use the same
  data;
- unsupported DigitalOcean operations will return explicit
  DigitalOcean-shaped `501 Not Implemented` responses once the `/v2` route
  registry exists.

## Installation

Install dependencies with Bun:

```bash
bun install
```

Build the package when testing the CommonJS CLI entry point:

```bash
bun run build
```

## Starting the local baseline

Start the TypeScript example server:

```bash
PORT=3300 bun run start
```

The server prints the local route browser:

```plaintext
DigitalPuddle baseline server started at http://localhost:3300
Visit http://localhost:3300/simulation to view all available routes.
```

Confirm the route browser responds:

```bash
curl http://localhost:3300/simulation
```

The built CommonJS CLI is available after `bun run build`:

```bash
PORT=3300 bun run start:bin
```

## Planned DigitalOcean usage

The first meaningful DigitalPuddle release targets Nile Valley's DOKS path.
The expected client configuration is:

```bash
export DIGITALOCEAN_API_URL=http://localhost:3300/v2
export DIGITALOCEAN_ACCESS_TOKEN=dop_v1_digitalpuddle_dummy_token
export SPACES_ENDPOINT_URL=http://localhost:9000
```

The access token is deliberately fake. It lets local clients that require a
token during startup, including doctl, reach DigitalPuddle instead of failing
before the first request.

Configure doctl commands explicitly with the documented API override:

```bash
doctl --api-url http://localhost:3300/v2 kubernetes cluster list
```

Terraform, doctl, Terratest, and Nile Valley should point at those local
endpoints instead of real DigitalOcean. The DOKS slice will then provide:

- account, rate-limit, region, size, image, SSH key, project, and action
  routes;
- k3d-backed Kubernetes cluster create, poll, kubeconfig, and delete flows;
- read-only Kubernetes node-pool list and retrieval for the initial pool
  created with a cluster;
- MinIO-backed Spaces-shaped state workflows without proxying object traffic or
  managing `/v2/spaces/keys`;
- deterministic scenario and fault handling;
- request journals and leak reports for post-run assertions.

The v1 compatibility target does not include mutating node-pool scale
operations, Droplet routes or engines, or Spaces access-key control-plane
routes. Unsupported routes should return explicit DigitalOcean-shaped
`501 Not Implemented` responses once the `/v2` route registry exists.

## Capability classifications

DigitalPuddle labels public DigitalOcean operations with one of four
capabilities:

- `scriptable` operations are handled by deterministic simulator state,
  validation, scheduler work, and worker transitions.
- `engine-backed` operations are supported, but their lifecycle depends on
  worker-owned side effects such as k3d cluster creation or deletion.
- `stubbed` operations return deterministic static or lightweight data and
  should not be treated as complete DigitalOcean control-plane modelling.
- `unsupported` operations are intentionally unavailable in the current
  release. Once the `/v2` operation registry is wired, matched unsupported
  operations return a DigitalOcean-shaped `501 Not Implemented` response.

Unknown routes, unsupported methods on known paths, and known unsupported
operations are distinct cases. DigitalPuddle preserves that distinction so
normal routing misses, `405 Method Not Allowed`, and `501 Not Implemented`
responses remain meaningful.

## Scenarios and determinism

Scenarios will be trusted YAML or JSON data files. They will configure the
seed, virtual clock, default action delays, rate limits, and typed faults. A
fixed scenario and request sequence must produce byte-identical journals across
runs.

Use scenarios for behaviours such as:

- failing the first cluster creation request;
- delaying actions by virtual time;
- returning stale reads for a bounded window;
- forcing rate-limit responses;
- holding an action in progress.

## Admin routes

DigitalPuddle-specific orchestration and inspection routes will live under
`/_digitalpuddle`. Planned routes include health, version, capabilities, state,
journal, leak reports, reset, scenario loading, clock advancement, queue drain,
and the pinned OpenAPI contract.

These routes are for local harnesses and debugging. They are not part of the
DigitalOcean API contract.

## Migration from Simulacat Core

DigitalPuddle is not a drop-in replacement for Simulacat Core. It keeps
Simulacrum as the backplane, but the product direction changes from GitHub API
mocking to DigitalOcean API simulation. See
[Migration from Simulacat Core](migration-from-simulacat-core.md) before
moving any consumer over.

## More information

- [Technical design](digitalpuddle-technical-design.md)
- [Roadmap](roadmap.md)
- [Developers' guide](developers-guide.md)
- [Migration from Simulacat Core](migration-from-simulacat-core.md)
