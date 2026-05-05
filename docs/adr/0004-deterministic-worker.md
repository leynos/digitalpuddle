# ADR 0004: Use a deterministic worker and virtual clock

Status: Accepted

## Context

DigitalOcean-style operations are asynchronous. Tests need to observe action
polling, delayed transitions, retries, stale reads, and teardown leaks without
depending on wall-clock sleeps or ambient randomness.

## Decision

DigitalPuddle will model asynchronous control-plane work through a deterministic
scheduler, virtual clock, seeded ID allocation, typed scenarios, and a worker
that owns engine side effects.

## Consequences

- Public route handlers may validate requests, update state, create actions,
  enqueue work, and emit responses.
- Public route handlers must not call k3d, Docker, MinIO, or future Droplet
  engines directly.
- The admin API must be able to advance virtual time and drain the worker until
  idle.
- The determinism gate must compare byte-identical journals for repeated runs
  with the same seed and request sequence.
