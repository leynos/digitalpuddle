# Dependency policy exception: `braces` nested patterns (GHSA-vfj7-8cjw-p6xm)

The repository's audit gate (`bun run audit`, which wraps `bun audit` through
`scripts/run-audit.mjs`) fails the build for any advisory that
`security/audit-exceptions.json` does not cover. This document records a
**time-bound exception** for one advisory that has no patched release.

Recorded on 2026-10-09.

## Advisory

| Field            | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Identifier       | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| Package          | `braces`                                                                 |
| Resolved version | 3.0.3                                                                    |
| Severity         | High                                                                     |
| Class            | Denial of service by stack exhaustion on deeply nested brace patterns    |
| Affected range   | `<=3.0.3`                                                                |
| Fixed in         | No release                                                               |

Table 1: advisory covered by this exception.

## Why the advisory cannot be fixed

`braces` 3.0.3 is the newest release on the registry, and the advisory covers
it, so no upgrade or override reaches a patched version. The paths to it are
`@graphql-codegen/cli > micromatch > braces` and
`@simulacrum/foundation-simulator > http-proxy-middleware > micromatch > braces`.
Replacing the code generator or the simulator's glob stack is out of scope for
an audit fix.

## Exposure

- The chains run during code generation and in the test simulator, in
  development and continuous integration (CI). The affected code is not part of
  the published package's own runtime path.
- The brace patterns come from repository configuration, not from untrusted
  runtime input. A pull request can change that configuration and make its own
  CI run exhaust the stack and fail, but no secret is read by the affected
  process.

The exposure is therefore a self-inflicted CI failure in a change under review,
which the reviewer would see, rather than a production risk.

## Review trigger

The ledger entry `BRACES_NESTED_PATTERN_DOS_2026_10` in
`security/audit-exceptions.json` expires on 2026-12-09, and
`scripts/run-audit.mjs` fails the gate from that date. Remove the entry and
this document when either becomes true:

- a patched `braces` release exists and the lockfile resolves it, or
- `micromatch` no longer depends on `braces` 3.

Review the exception at expiry even if neither has happened.

The same advisory is recorded for corbusier (corbusier #225) and wildside
(wildside #529).
