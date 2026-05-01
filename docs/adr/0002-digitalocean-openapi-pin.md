# ADR 0002: Pin the DigitalOcean OpenAPI contract

Status: Accepted

## Context

DigitalPuddle must speak a DigitalOcean-shaped HTTP contract while supporting
only the subset needed by Nile Valley. Without a pinned contract, route shapes,
error envelopes, and pagination behaviour can drift silently.

## Decision

DigitalPuddle will pin a specific DigitalOcean OpenAPI specification revision
and generate an operation registry from that artefact. Each operation will be
classified as `scriptable`, `engine-backed`, `stubbed`, or `unsupported`.

## Consequences

- The pin, upstream source, refresh command, and generated artefact hash must be
  recorded when the contract is added.
- The generated capability matrix becomes part of the implementation contract.
- Unsupported `/v2` routes must return explicit DigitalOcean-shaped
  `501 Not Implemented` responses.
- Updating the OpenAPI pin is a deliberate compatibility event.
