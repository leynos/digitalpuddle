# Dependency policy exception: `minimatch` globparts (GHSA-g3hv-75wg-m249)

The repository's audit gate (`bun run audit`, which wraps `bun audit` through
`scripts/run-audit.mjs`) fails the build for any advisory that
`security/audit-exceptions.json` does not cover. This document records a
**time-bound exception** for one advisory whose only patched release cannot run
in this repository.

Recorded on 2026-11-07.

## Advisory

| Field            | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Identifier       | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| Package          | `minimatch`                                                              |
| Resolved version | 10.2.5                                                                   |
| Severity         | Medium                                                                   |
| Class            | Denial of service by globparts amplification                             |
| Affected range   | `>=7.0.0 <11.0.1`                                                        |
| Fixed in         | 11.0.1                                                                   |

Table 1: advisory covered by this exception.

## Why the advisory cannot be fixed

The only path to `minimatch` is `typedoc`, a `devDependency` that runs the
`docs:check` gate. The newest `typedoc` release (0.28.20) depends on
`minimatch@^10.2.5`, so no release of it accepts the patched major version. An
`overrides` entry forcing `minimatch` 11 installs, but `typedoc` then fails with
`mini.matchOne is not a function`, because it calls an API that 11.x removed.
Replacing `typedoc` is out of scope for an audit fix.

## Exposure

`typedoc` runs only for `bun run docs:check` (and so for `make docs-check` and
CI). It uses `minimatch` to filter the repository's own entry points and
`typedoc.json` patterns, which come from the repository, not from runtime
input. The package is not a production dependency and DigitalPuddle's source
does not import it. A pull request that changes those patterns could make its
own CI run slow, but that is a self-inflicted failure in a change under review,
not a production risk.

## Review trigger

The ledger entry `MINIMATCH_GLOBPARTS_DOS_2026_11` in
`security/audit-exceptions.json` expires on 2027-01-07, and
`scripts/run-audit.mjs` fails the gate from 8 January 2027 whether or not the
advisory is still reported. Remove the entry and this document when a `typedoc`
release accepts `minimatch` 11 and the lockfile resolves 11.0.1 or later.

Review the exception at expiry even if that has not happened.
