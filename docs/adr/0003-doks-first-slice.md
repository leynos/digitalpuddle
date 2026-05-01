# ADR 0003: Optimise v1 for the DOKS path

Status: Accepted

## Context

DigitalOcean has a broad product surface. Nile Valley's first useful
DigitalPuddle workflow needs Kubernetes cluster creation, polling, kubeconfig
retrieval, Terraform integration, and teardown assertions.

## Decision

DigitalPuddle v1 will prioritise the DOKS vertical slice instead of broad
DigitalOcean emulation. The first public route matrix will focus on account
metadata, rate limits, regions, sizes, images, SSH keys, projects, actions,
Kubernetes options, clusters, kubeconfig, and node-pool behaviour where Nile
Valley needs it.

## Consequences

- App Platform, managed databases, load balancers, DNS, volumes, registry,
  monitoring, billing, and broader DigitalOcean routes remain out of v1.
- Droplets are deferred unless Nile Valley proves they are needed before the
  first release.
- MinIO handles object-level Spaces-shaped workflows directly; DigitalPuddle
  does not proxy normal S3 object traffic.
- The capability matrix must make unsupported routes visible to clients and
  tests.
