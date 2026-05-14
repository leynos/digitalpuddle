# DigitalOcean OpenAPI contract

This directory contains the pinned, bundled DigitalOcean public API v2
OpenAPI contract used by DigitalPuddle.

- `digitalocean.openapi.yaml` is the bundled OpenAPI artefact fetched from
  DigitalOcean's generated specification endpoint.
- `digitalocean.openapi.provenance.json` records the source URL,
  upstream `digitalocean/openapi` commit, refresh command, response
  metadata, byte length, and SHA-256 hash.

Refresh the pin with:

```bash
bun scripts/refresh-digitalocean-openapi.ts
```

Updating this artefact is a compatibility event. Review the operation
count, hash, and downstream capability classification changes before
committing a refreshed pin.
