# Migration from Simulacat Core

DigitalPuddle starts from the Simulacat Core codebase but is not a compatible
rename. Treat the branch as a product pivot from a GitHub API simulator to a
DigitalOcean API simulator.

## What changed

| Area | Simulacat Core | DigitalPuddle target |
| --- | --- | --- |
| Product purpose | Stateful GitHub API mocking | DigitalOcean-shaped infrastructure simulation |
| Primary API | GitHub REST and GraphQL | DigitalOcean v2 REST under `/v2` |
| Main customer | GitHub-oriented fixtures and harnesses | Nile Valley and Terratest workflows |
| Async model | Mostly immediate fixture responses | Action polling and deterministic worker transitions |
| Local substrates | None required by design | k3d for DOKS and MinIO for Spaces-shaped workflows |
| Harness surface | `/simulation` and inherited helper routes | `/_digitalpuddle` admin routes and request journal |

_Table 1: Migration-level product differences._

## Breaking changes

- The package name is `digitalpuddle`.
- Package metadata, README content, and roadmap now describe DigitalPuddle
  rather than Simulacat Core.
- The large imported GitHub repository mock-data payload is no longer part of
  the package shape.
- Future public API work will move toward `/v2` DigitalOcean routes rather
  than broadening GitHub coverage.
- Future test harnesses should assert through `/_digitalpuddle` and the request
  journal rather than GitHub-specific route behaviour.

## Transitional behaviour

The current source still contains inherited GitHub fixtures, schemas, REST
handlers, GraphQL handlers, and tests. That code remains only because it is the
working Simulacrum adaptation substrate while DigitalPuddle's DigitalOcean
surface is built.

Consumers should not treat those inherited GitHub surfaces as DigitalPuddle's
long-term API. They will either be removed, replaced, or moved behind explicit
transitional fixtures as the roadmap progresses.

## Migration guidance for consumers

Consumers using Simulacat Core for GitHub API tests should stay on Simulacat
Core. DigitalPuddle is for DigitalOcean-shaped infrastructure tests.

Consumers adopting DigitalPuddle should:

1. Pin to a DigitalPuddle release or branch that includes the needed `/v2`
   route matrix.
2. Configure clients through endpoint overrides such as `DIGITALOCEAN_API_URL`
   and `SPACES_ENDPOINT_URL`.
3. Load a deterministic scenario file for failures, delays, and rate limits.
4. Assert retry, polling, and teardown behaviour through the request journal.
5. Check `/_digitalpuddle/resources/leaks` before ending each test.

## Compatibility policy

Until the first DigitalOcean DOKS slice lands, DigitalPuddle is not promising a
stable user-facing API beyond the repository shape, design, roadmap, and local
baseline start command. Once `/v2` support begins, compatibility will be tied
to the pinned DigitalOcean OpenAPI contract and the generated capability
matrix.
