# ADR 0006: Resolve the v1 product boundaries

Status: Accepted

## Context

Roadmap task 1.1.2 closes the first unresolved v1 product questions before
DigitalPuddle broadens from the imported Simulacat baseline into a
DigitalOcean-shaped simulator. The open questions cover Kubernetes node-pool
scope, Spaces control-plane routes, Droplet engines, and how much doctl
compatibility belongs in CI.

Official DigitalOcean documentation currently exposes a broad Kubernetes
node-pool API, a separate `/v2/spaces/keys` control-plane surface, a broad
Droplet API, and a doctl `--api-url` override. DigitalPuddle v1 remains scoped
by ADR 0003: it must prioritize the Nile Valley DOKS path, not broad
DigitalOcean emulation.

## Decision

DigitalPuddle v1 includes the initial node pool created with a Kubernetes
cluster and read-only node-pool listing and retrieval. Mutating node-pool
operations, including add, update, delete, node delete, replacement, recycling,
status, and upgrade operations, are deferred to a named follow-on phase:
node-pool scale operations.

DigitalPuddle v1 does not proxy Spaces object traffic. Terraform state and
application object operations go directly to MinIO through an S3-compatible
endpoint. DigitalOcean `/v2/spaces/keys` access-key management is deferred to a
named follow-on phase: Spaces access-key control plane.

DigitalPuddle v1 omits Droplet public routes and Droplet engines. Droplet API
operations are classified as unsupported until a named follow-on Droplet slice.
The first Droplet follow-on should start with either a `NullDropletEngine` or a
small container-backed engine. QEMU remains a later option for tests that need
host-bootstrap fidelity.

doctl compatibility is a narrow command-level target. CI should cover doctl
only for supported v1 workflows after the corresponding `/v2` routes exist.
Users should configure doctl with the documented `--api-url` flag. doctl
commands for products or operations outwith the v1 capability matrix are
best-effort at most and should normally receive explicit unsupported responses.

## Rejected alternatives

- Including full node-pool mutation in v1 was rejected because it turns the
  first DOKS slice into scale-operation delivery before cluster create, poll,
  kubeconfig, and teardown are stable.
- Proxying ordinary S3 object traffic through DigitalPuddle was rejected
  because MinIO already supplies the object-store substrate and proxying would
  mix object data paths into the DigitalOcean `/v2` control plane.
- Implementing `/v2/spaces/keys` in v1 was rejected because v1 can use direct
  MinIO configuration until a Terraform, doctl, or Nile Valley workflow proves
  that key rotation must be simulated through DigitalPuddle.
- Including a container-backed or QEMU-backed Droplet engine in v1 was rejected
  because Droplets are not required by the first DOKS path and would add a
  second engine lifecycle before the worker contract is proven.
- Promising broad doctl support was rejected because doctl spans more
  DigitalOcean products than DigitalPuddle v1 implements.

## Consequences

- The v1 operation registry and capability matrix must mark node-pool mutation,
  Spaces access-key management, Droplet routes, and unrelated doctl product
  workflows according to these decisions.
- Kubernetes cluster creation must persist enough node-pool state for list and
  retrieval routes, but it must not imply support for later pool mutation.
- Spaces object-store tests should configure clients to speak directly to
  MinIO; DigitalPuddle handles only DigitalOcean-shaped `/v2` routes.
- Future Droplet engine work must stay behind a worker-owned engine interface.
  Public handlers must not call container, QEMU, Docker, or other engine
  adapters directly.
- doctl CI belongs with implemented routes. Adding a route that claims doctl
  support should add a command-level happy-path and unhappy-path test when the
  command is externally observable.
