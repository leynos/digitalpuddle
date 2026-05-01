# ADR 0001: Use Simulacrum as the HTTP backplane

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

## Consequences

- The first implementation work should adapt the existing assembly instead of
  replacing it.
- Route support should remain contract-first and tied to a pinned OpenAPI
  document.
- DigitalPuddle-specific behaviour belongs in extension seams rather than
  framework forks.
- Any future replacement of Simulacrum requires a new ADR.
