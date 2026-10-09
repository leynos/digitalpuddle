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
`@simulacrum/foundation-simulator`, then `http-proxy-middleware`, then
`micromatch`, then `braces`. Replacing the code generator or the simulator's
glob stack is out of scope for an audit fix.

## Exposure

The two paths differ, so each is stated on its own terms.

- **`@graphql-codegen/cli > micromatch > braces`.** `@graphql-codegen/cli` is a
  `devDependency`. It runs only for `bun run generate` (and so for typechecking
  and the build), expanding the glob patterns in this repository's own
  `codegen.ts`. Those patterns come from the repository, not from runtime input.
- **The simulator path.** `@simulacrum/foundation-simulator` depends on
  `http-proxy-middleware`, which depends on `micromatch`, which depends on
  `braces`. The simulator is a production dependency, and `src/simulation.ts`
  and `src/store/entities.ts` use it. `http-proxy-middleware` reaches
  `micromatch` only inside its path filter (`dist/path-filter.js`), which runs
  only when a glob `pathFilter` option is configured, and then the configured
  glob is the pattern while the request path is only the string matched. The
  simulator's proxy middleware (`dist/middleware/proxy.mjs`) calls
  `createProxyMiddleware` with a `target` and no `pathFilter`, and
  DigitalPuddle's source imports neither package directly. No brace pattern is
  therefore ever matched on the runtime path, attacker-controlled or not.

A pull request can change `codegen.ts` and make its own CI run exhaust the
stack, but that is a self-inflicted failure in a change under review, which the
reviewer would see, rather than a production risk. If a future simulator
release configures a `pathFilter`, this exception no longer holds and must be
reviewed.

## Review trigger

The ledger entry `BRACES_NESTED_PATTERN_DOS_2026_10` in
`security/audit-exceptions.json` expires on 2026-12-09, and
`scripts/run-audit.mjs` fails the gate from 10 December 2026 (an entry covers
the whole of its stated day), whether or not the advisory is still reported.
Remove the entry and this document when either becomes true:

- a patched `braces` release exists and the lockfile resolves it, or
- `micromatch` no longer depends on `braces` 3.

Review the exception at expiry even if neither has happened.

The same advisory is recorded for corbusier (corbusier #225) and wildside
(wildside #529).
