# DigitalPuddle

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](
https://deepwiki.com/leynos/digitalpuddle)

*A local DigitalOcean-shaped API simulator for deterministic infrastructure
tests.*

DigitalPuddle is being adapted from Simulacat Core, a Simulacrum-based GitHub
API simulator. Its target is a narrow, hostile, and repeatable DigitalOcean v2
simulation for Nile Valley and Terratest-driven infrastructure workflows.

______________________________________________________________________

## Why DigitalPuddle?

Cloud integration tests are most useful when they behave like the real control
plane but remain cheap, local, and disposable. DigitalPuddle is designed to
make that possible for the DigitalOcean workflows Nile Valley needs first.

- **Stay local**: Run against a simulator instead of real DigitalOcean
  credentials during ordinary development and CI.
- **Keep behaviour deterministic**: Drive IDs, clocks, transitions, and faults
  from a seed and scenario.
- **Exercise asynchronous clients**: Model action polling, eventual
  consistency, stale reads, and explicit failure paths.
- **Use real local substrates where they help**: Back fake DOKS with k3d and
  Spaces-shaped state workflows with MinIO.
- **Fail loudly outside the supported slice**: Return DigitalOcean-shaped
  `501 Not Implemented` responses instead of inventing happy paths.

______________________________________________________________________

## Quick start

DigitalPuddle is in its initial repository-shaping phase. The current codebase
still contains the inherited Simulacrum/Simulacat implementation while the
DigitalOcean `/v2` surface is built out according to the roadmap.

### Installation

```bash
bun install
```

### Basic usage

Start the local simulator baseline:

```bash
PORT=3300 bun run start
```

In another shell, confirm the server is responding:

```bash
curl http://localhost:3300/simulation
```

That bootstraps the inherited simulator today. The planned DigitalPuddle entry
point will expose DigitalOcean-shaped routes under `/v2` plus private harness
routes under `/_digitalpuddle`.

______________________________________________________________________

## Planned features

- DigitalOcean-shaped HTTP contract under `/v2`.
- Pinned DigitalOcean OpenAPI operation registry and capability matrix.
- Stateful account, region, size, image, SSH key, project, action, Kubernetes,
  and node-pool models.
- Deterministic virtual clock, ID allocation, async worker, and transition
  scheduler.
- Scenario-driven fault injection for retries, stale reads, rate limits, stuck
  actions, and explicit failures.
- First-class JSON Lines request journal for post-run assertions.
- k3d-backed DOKS simulation and MinIO-backed Spaces/state workflows.
- Private admin API under `/_digitalpuddle` for health, state, capabilities,
  scenarios, clock control, journal queries, and leak detection.
- Terratest helper module and compose-based local test environment.

______________________________________________________________________

## Project status

DigitalPuddle is not yet a complete DigitalOcean simulator. The repository has
been imported from Simulacat Core and is being narrowed toward the design in
review-sized slices. The first useful release focuses on Nile Valley's DOKS
path rather than broad DigitalOcean emulation.

______________________________________________________________________

## Learn more

- [Users' guide](docs/users-guide.md) — current baseline usage, planned `/v2`
  usage, scenarios, and admin routes.
- [Migration from Simulacat Core](docs/migration-from-simulacat-core.md) —
  breaking changes and transition guidance.
- [Developers' guide](docs/developers-guide.md) — repository workflow,
  architecture rules, testing, and observability.
- [Technical design](docs/digitalpuddle-technical-design.md) — architecture,
  scope, runtime model, and release shape.
- [Roadmap](docs/roadmap.md) — planned phases, tasks, dependencies, and
  deferred extensions.
- [Documentation style guide](docs/documentation-style-guide.md) — repository
  documentation conventions.
- [Agent instructions](AGENTS.md) — development workflow, gates, and repository
  standards.

______________________________________________________________________

## Licence

MIT — see [LICENSE](LICENSE) for details.

______________________________________________________________________

## Contributing

Contributions are welcome once the initial shape settles. Please follow
[AGENTS.md](AGENTS.md), keep changes atomic, run the relevant gates with durable
logs, and update the design or roadmap whenever implementation decisions
change.
