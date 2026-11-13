# Architecture Decision Record (ADR) 0008: Add Unicorn and ai-deslop Oxlint rules

Status: Accepted

Date: 2026-10-20

## Context

Biome owns formatting and general linting for this TypeScript package. The
repository also needs Oxlint's implemented Unicorn recommended rules and the
recommended rules from ai-deslop, which focus on evidence at TypeScript
boundaries and type assertions.

The two plug-ins can disagree. The rule set also needs to remain stable across
developer machines and CI, and must not weaken the existing Biome or TypeDoc
gates.

## Decision

The lint command runs Biome followed by Oxlint. Biome remains responsible for
formatting and its existing lint rules. Oxlint adds the Unicorn and ai-deslop
recommended rules.

The dependency versions are exact:

| Package           | Version    | Role                                |
| ----------------- | ---------- | ----------------------------------- |
| `oxlint`          | `1.82.0`   | Linter and built-in Unicorn plug-in |
| `ai-deslop`       | `0.4.8`    | Recommended `deslop/*` rules        |
| `oxlint-tsgolint` | `7.0.2004` | Type-aware linting backend          |

Unicorn ships with Oxlint, so its version is the Oxlint version. Oxlint's
JavaScript plug-in API is still alpha; the exact pins keep the tested runtime
and plug-in versions together. Bun's lockfile records the resolved graph.

The Oxlint configuration turns all rule categories off and lists enabled rules
explicitly. It enables every Unicorn recommended rule implemented in the pinned
Oxlint release, the ai-deslop recommended set, and the standard TypeScript
rules that set enables. Type-aware linting stays enabled.

When Unicorn and ai-deslop make incompatible recommendations, Unicorn wins.
Accordingly, `deslop/no-reflect-apply` is disabled because it rejects the
`Reflect.apply` form required by `unicorn/prefer-reflect-apply`. The matching
Unicorn rule remains enabled.

Oxlint `1.82.0` does not register `unicorn/no-null`, so the rule cannot be
applied through this release. The repository's REST and GraphQL contracts also
preserve explicit JSON `null` values. The explicit policy exceptions are:

- `deslop/no-reflect-apply` is disabled because it conflicts with
  `unicorn/prefer-reflect-apply`, which remains enabled.
- `unicorn/prefer-top-level-await` and `typescript/no-require-imports` are
  disabled only for `bin/start.cjs`, because the documented CommonJS CLI
  exception requires CommonJS syntax.
- `deslop/no-pass-through-type-alias` is disabled on the exported
  `InitialState` declaration in `src/simulation.ts`. Keeping this public type
  as an alias prevents TypeDoc from expanding the Zod schema into undocumented
  member warnings.

No other rule is disabled unless it conflicts with an existing Biome or
df12-lints requirement, TypeDoc output, or another enabled rule in these
plug-ins. Any such exception must be recorded here and beside the rule
configuration.

The vendored `bin/rimraf-standalone.js` file remains outside Oxlint's scope,
matching Biome's existing exclusion for that third-party bundle. Generated
files under `src/__generated__/` are also excluded.

`deslop/no-runtime-typeof` remains an error. In `src/openapi/artifact.ts` only,
its `allowInTypeGuards` option permits type predicates to discriminate
`JsonValue`, which has already been parsed at each JSON input boundary. Direct
`typeof` narrowing remains prohibited elsewhere.

## Consequences

- `make lint` checks the existing Biome rules and the explicit Oxlint rule set.
- A tool or plug-in upgrade requires an intentional pin update and a full run
  of the repository gates.
- New suppressions need a short reason at the suppression site. Prefer fixing
  the code or choosing a form both plug-ins accept.
- TypeScript assertions need a nearby `SAFETY:` comment that states the
  invariant the compiler cannot verify.

## References

- [Oxlint built-in plug-ins](https://oxc.rs/docs/guide/usage/linter/plugins.html)
- [ai-deslop README](https://github.com/maharshi365/deslop)
- [Simulacat Core PR 121](https://github.com/leynos/simulacat-core/pull/121)
