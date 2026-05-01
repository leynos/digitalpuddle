# ADR 0005: Treat inherited Simulacat boundaries as transitional

Status: Accepted

## Context

The imported Simulacat Core code still contains GitHub-specific entities,
transport URLs, REST handlers, GraphQL handlers, and tests. Some of that code
mixes domain data with response URL construction or inspects HTTP details inside
handler logic. Those patterns are inherited baseline behaviour, not the target
DigitalPuddle architecture.

## Decision

DigitalPuddle will keep inherited Simulacat boundaries only while they preserve
a working adaptation baseline. New DigitalPuddle code must separate domain
state, response serialization, HTTP translation, content negotiation, worker
side effects, and journal emission.

## Consequences

- New DigitalPuddle entities should not embed transport URLs unless the
  DigitalOcean API stores that URL as resource data.
- Response URLs should be produced by serializers or response translators.
- HTTP status mapping belongs at the handler boundary.
- Header parsing should become explicit domain-level decisions before core
  logic runs.
- The roadmap task to split retained GitHub scaffolding from DigitalPuddle
  production surfaces remains required before the first release.
