# ADR 0001: Use Simulacrum as the HTTP Backplane

Status: Accepted

## Context

DigitalPuddle is adapted from Simulacat Core, which already uses
`@simulacrum/foundation-simulator` for OpenAPI-backed routing, store extension,
and simulation pages. The technical design explicitly rejects a bespoke server
framework for the first release.

## Decision

DigitalPuddle will keep Simulacrum as the HTTP and routing backplane. The
project will supply DigitalOcean-specific schemas, handlers, store slices,
worker logic, engine adapters, admin routes, and documentation around that
backplane.

## Rejected alternatives

- A bespoke HTTP and routing stack was considered and deferred because it would
  replace Simulacrum’s contract-first routing and delay v1.
- Alternative backplane frameworks were considered but rejected due to the
  migration cost and the risk of breaking route contract conformance.
- A full Simulacrum fork was rejected because it keeps extension seams hard to
  enforce and still requires a new ADR for any eventual swap.

## Consequences

- The first implementation work should adapt the existing assembly instead of
  replacing it.
- Route support should remain contract-first and tied to a pinned OpenAPI
  document.
- DigitalPuddle-specific behaviour belongs in extension seams rather than
  framework forks.
- Any future replacement of Simulacrum requires a new ADR.
