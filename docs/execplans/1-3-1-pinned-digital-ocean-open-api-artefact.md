# Add the pinned DigitalOcean OpenAPI artefact

This ExecPlan (execution plan) is a living document. The sections
`Constraints`, `Tolerances`, `Risks`, `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work
proceeds.

Status: DRAFT

## Purpose / big picture

DigitalPuddle needs a pinned DigitalOcean OpenAPI contract before route-level
implementation can expand safely. The repository already records the decision
to use Simulacrum as the HTTP backplane and to drive public `/v2` routing from
a DigitalOcean contract. This plan covers roadmap task 1.3.1: adding the pinned
DigitalOcean OpenAPI artefact, the repeatable refresh command, and enough
provenance for a reviewer to verify exactly where the artefact came from.

After this plan is approved and implemented, a maintainer can inspect the
repository and see the upstream source URL, the exact upstream revision, the
refresh command, and the SHA-256 hash of the generated artefact. Running the
refresh command with the recorded pin should reproduce the checked-in
artefact, and the normal repository gates should prove that the metadata,
artefact shape, documentation, and existing baseline still agree.

This plan is pre-implementation. Do not implement it until the user explicitly
approves the plan.

## Approval gate

This plan has two phases:

1. Draft phase: write, review, commit, push, and open a draft pull request for
   this ExecPlan only.
2. Execution phase: after explicit user approval, add the artefact, refresh
   tooling, tests, documentation updates, CodeRabbit review, commits, and
   roadmap closure described below.

The execution phase is not active. Silence is not approval.

## Constraints

- Keep Simulacrum as the HTTP and routing backplane. This follows
  `docs/adr/0001-simulacrum-backplane.md` and
  `docs/digitalpuddle-technical-design.md` section 4.
- Keep the DigitalOcean OpenAPI contract as the public route source. This
  follows `docs/adr/0002-digitalocean-openapi-pin.md` and
  `docs/digitalpuddle-technical-design.md` sections 7.1 and 8.1.
- Keep v1 focused on the Nile Valley DigitalOcean Kubernetes Service (DOKS)
  path, not broad DigitalOcean emulation. This follows
  `docs/adr/0003-doks-first-slice.md`,
  `docs/adr/0006-v1-product-boundaries.md`, and the v1 matrix in
  `docs/digitalpuddle-technical-design.md` section 8.2.
- Use hexagonal architecture to protect boundaries. OpenAPI refresh and file
  loading are adapter/tooling concerns; operation classification policy remains
  in `src/openapi/capabilities.ts` and `src/openapi/projections.ts`.
- Do not move routing, capability classification, or unsupported-route policy
  into the refresh script. The script may fetch, bundle, canonicalize, hash, and
  write files only.
- Do not expand inherited GitHub-specific REST, GraphQL, or store surfaces
  except where needed to keep the imported baseline healthy.
- Keep generated artefacts deterministic. The same upstream pin and refresh
  command must produce byte-identical output and the same hash.
- Record provenance in a machine-readable file. Prose in an ADR or guide is not
  enough by itself.
- Documentation must use en-GB-oxendict spelling and follow
  `docs/documentation-style-guide.md`.
- Use `bun:test` for unit and behavioural tests. Do not add a different test
  runner.
- Use `fast-check` when the implementation introduces an invariant over a
  range of JSON values, operation entries, file hashes, or path orderings.
- Do not add a LemmaScript proof unless the implementation introduces a
  substantive contractual axiom that property tests and deterministic fixture
  tests cannot cover. Hash reproducibility and JSON canonicalization do not
  require a proof.
- Run gates sequentially. Do not run format checks, lint, or tests in
  parallel.
- Use `tee` for all gates, so truncated terminal output can be inspected later.
- Run `make check-fmt`, `make typecheck`, `make lint`, and `make test` before
  each CodeRabbit review.
- Use `coderabbit review --agent` after each major implementation milestone and
  resolve all actionable concerns before moving to the next milestone.
- Commit after each approved implementation milestone, and gate each commit.
- Do not mark roadmap task 1.3.1 done until the artefact, refresh tooling,
  tests, documentation, validation, CodeRabbit review, and final implementation
  commit are complete.

If satisfying the task requires violating any constraint, stop, record the
conflict in `Decision Log`, and ask the user how to proceed.

## Tolerances

- Scope: if the implementation requires more than 10 tracked files or more than
  650 net non-generated lines, stop and explain why the artefact pin needs a
  broader slice. The generated OpenAPI JSON artefact does not count against the
  line threshold, but it does count as a tracked file.
- Public API: if an existing exported TypeScript API signature must change,
  stop and present options. Adding a new internal loader or helper for the
  DigitalOcean artefact is allowed.
- Dependencies: approval of this plan authorizes adding `@redocly/cli` as a
  development dependency if local inspection confirms that the upstream
  DigitalOcean specification needs bundling from YAML to a single JSON
  artefact. If another new dependency is needed, stop and ask for approval.
- Upstream pin: if the DigitalOcean upstream repository moves or the expected
  `specification/digitalocean-public.v2.yaml` source is unavailable, stop and
  present source alternatives with trade-offs.
- Network use: the refresh command may use the network, but tests must not
  depend on network access. Use local fixtures or pure helper tests for refresh
  behaviour.
- Artefact size: if the generated artefact exceeds 15 MB, stop and ask whether
  to keep it checked in, compress it, or narrow the stored artefact shape.
- Registry scope: if implementing the operation registry from the pin becomes
  necessary to validate the artefact, stop and ask whether to merge roadmap
  task 1.3.2 into this change.
- Validation: if any gate still fails after two focused correction attempts,
  stop with the failing log path and a concise diagnosis.
- CodeRabbit: if CodeRabbit reports a concern that requires expanding beyond
  these tolerances, stop and ask for direction.

## Risks

- Risk: upstream DigitalOcean changes can silently alter route shapes.
  Severity: high.
  Likelihood: medium.
  Mitigation: pin a full upstream commit SHA, record the raw source URL, and
  hash the generated artefact.

- Risk: a refresh command that depends on floating tools can produce different
  bytes later.
  Severity: medium.
  Likelihood: medium.
  Mitigation: prefer a committed development dependency and `bun.lock` entry
  for the bundling tool, write deterministic JSON, and test canonicalization.

- Risk: the OpenAPI artefact location can conflict with current repository
  precedent.
  Severity: medium.
  Likelihood: medium.
  Mitigation: place the DigitalOcean artefact under the target architecture
  namespace `src/openapi/` because `docs/developers-guide.md` and the technical
  design name that as the future contract area. Leave inherited GitHub schemas
  under `schema/` untouched.

- Risk: provenance can drift from the artefact.
  Severity: high.
  Likelihood: medium.
  Mitigation: add tests that recompute the SHA-256 hash from the checked-in
  artefact and compare it with the provenance record.

- Risk: implementation accidentally starts roadmap task 1.3.2 by building the
  full operation registry.
  Severity: medium.
  Likelihood: medium.
  Mitigation: validate only artefact shape, provenance, and refresh behaviour
  in this slice. Leave registry construction for 1.3.2.

- Risk: documentation claims public `/v2` support before routes exist.
  Severity: medium.
  Likelihood: medium.
  Mitigation: update user-facing docs to say the contract pin exists, while
  route implementation and unsupported fallback wiring remain later roadmap
  tasks.

## Prior art and external references

The upstream source is the public DigitalOcean OpenAPI repository:
<https://github.com/digitalocean/openapi>. Firecrawl research on 2026-05-25
found that the repository describes itself as the OpenAPI v3 specification for
DigitalOcean's public API, uses Apache Licence 2.0, and exposes
`specification/digitalocean-public.v2.yaml` as the relevant public v2
specification source. The same page listed upstream commands such as
`make bundle`, `make collection`, and `make preview`.

The current upstream main revision observed during planning was:

```plaintext
3512e763734dbe54871fc0611a025febc1ab7ceb
```

The implementation may use this exact commit as the first pin, or it may rerun:

```bash
git ls-remote https://github.com/digitalocean/openapi.git refs/heads/main
```

If it uses a different commit, record the reason in `Decision Log` before
refreshing the artefact.

Redocly CLI is relevant prior art because it can bundle separate API
description files into one JSON or YAML output file. Firecrawl research on
2026-05-25 found the command shape `redocly bundle <apis>... [options]` and the
output option `--output <outputName>` in the Redocly CLI documentation:
<https://redocly.com/docs/cli/commands/bundle>. Redocly CLI also provides
OpenAPI linting through `redocly lint [<apis>...] [options]`, documented at
<https://redocly.com/docs/cli/commands/lint>.

These external references inform the refresh command only. DigitalPuddle's
runtime policy still comes from its own ADRs, technical design, and code.

## Implementation plan

### Milestone 1: verify source and choose the pin

Start by checking the branch and the worktree:

```bash
git branch --show-current
git status --short --branch
```

Confirm the branch is `1-3-1-pinned-digital-ocean-open-api-artefact` and the
worktree contains no unrelated edits. If unrelated edits exist, leave them
alone and do not mix them into this implementation.

Fetch the current upstream DigitalOcean OpenAPI main commit:

```bash
git ls-remote https://github.com/digitalocean/openapi.git refs/heads/main
```

Choose the first pin. Prefer the planning-time commit
`3512e763734dbe54871fc0611a025febc1ab7ceb` unless there is a clear reason to
use the latest upstream main revision at implementation time. Record the chosen
commit and rationale in this plan's `Decision Log`.

The expected upstream raw source URL shape is:

```plaintext
https://raw.githubusercontent.com/digitalocean/openapi/<PIN>/specification/digitalocean-public.v2.yaml
```

Check that this URL is reachable before writing files. If it is not reachable,
stop and escalate under the upstream-pin tolerance.

No commit is required after this milestone unless the `Decision Log` changes.

### Milestone 2: add deterministic refresh tooling

Add a DigitalOcean-specific refresh command without replacing the inherited
GitHub `sync.ts` path. Prefer a focused root script named
`sync-digitalocean-openapi.ts`, following the existing root-script precedent of
`sync.ts`. Add a package script such as:

```json
{
  "scripts": {
    "sync:openapi:digitalocean": "bun --bun sync-digitalocean-openapi.ts"
  }
}
```

The script should:

- read a pin argument or constant from a checked-in provenance configuration;
- fetch the upstream raw YAML source from the pinned commit;
- bundle it into one JSON OpenAPI artefact if `$ref` references require
  bundling;
- write deterministic JSON with sorted object keys and a final newline;
- compute the SHA-256 hash from the exact bytes written to disk;
- write or update a provenance JSON file with the upstream repository URL,
  source path, pin, raw source URL, refresh command, bundling tool and version,
  generated artefact path, generated hash, and refresh timestamp or date.

The expected checked-in outputs are:

```plaintext
src/openapi/digitalocean.openapi.json
src/openapi/digitalocean.openapi.provenance.json
```

If the implementation uses Redocly CLI, add `@redocly/cli` as a development
dependency, commit the resulting `bun.lock` change, and keep the dependency use
inside refresh tooling. Do not import Redocly from runtime code.

Add pure exported helpers only where they make tests clear. For example,
helpers for canonical JSON serialization, SHA-256 hashing, and provenance
validation are appropriate. Keep network fetch and filesystem writes behind
the script adapter, so tests can avoid network access.

Run the relevant focused tests or type checks for the script if available.
Then run the full gates sequentially:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

After all four gates pass, run:

```bash
coderabbit review --agent
```

Resolve all actionable CodeRabbit concerns within this milestone's scope, rerun
the four gates, and commit this milestone before continuing.

### Milestone 3: add artefact and provenance tests

Add `bun:test` coverage for both happy and unhappy paths. A suitable test file
is `tests/digitalocean-openapi-artifact.test.ts`, unless nearby tests suggest a
clearer name during implementation.

The tests should cover:

- the checked-in OpenAPI artefact parses as JSON and declares an OpenAPI 3.x
  document;
- the artefact includes representative DigitalOcean v2 paths needed by the
  design, such as `/v2/account` and `/v2/kubernetes/clusters`;
- the provenance file parses and includes upstream source, source path, pin,
  refresh command, artefact path, and SHA-256 hash;
- recomputing SHA-256 from `src/openapi/digitalocean.openapi.json` exactly
  matches the provenance hash;
- malformed or incomplete provenance data is rejected by the validation helper;
- a mismatched hash is rejected;
- canonical JSON serialization is stable across equivalent objects with
  different insertion orders.

Use `fast-check` for the canonicalization stability invariant if the helper
accepts arbitrary JSON-compatible data. Keep the property bounded enough to be
fast and deterministic under `bun test`.

Do not add network tests. The refresh command can be tested through pure
helpers and a tiny local fixture if command behaviour needs coverage.

Run the gates sequentially with `tee` as shown in milestone 2. Then run
`coderabbit review --agent`, resolve concerns, rerun gates, and commit this
milestone.

### Milestone 4: update documentation without overstating runtime support

Update documentation after the artefact and tests are in place.

In `docs/adr/0007-release-capability-policy.md`, replace the wording that says
the pinned contract is not yet present. State that roadmap task 1.3.1 adds the
pin and provenance record, while roadmap task 1.3.2 still owns the operation
registry derived from that pin.

In `docs/developers-guide.md`, add the concrete artefact and provenance paths,
the refresh command, and the rule that capability policy remains separate from
refresh tooling.

In `docs/users-guide.md`, update current-status and admin-route wording, so
users know the pinned contract artefact exists once this task lands, but `/v2`
behaviour and unsupported fallback routing still arrive through later roadmap
tasks.

In `docs/digitalpuddle-technical-design.md`, add the concrete artefact path and
provenance-file expectation only if the existing design text is too abstract
for future implementers. Do not repeat the full provenance schema in multiple
documents.

If the change makes an existing ADR inaccurate in a substantive way, add a new
ADR instead of rewriting history. A new ADR is not expected for this task
because ADR 0002 already records the pinning decision.

Run documentation formatting and documentation gates after Markdown changes:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
```

Then run the normal four gates sequentially, run `coderabbit review --agent`,
resolve concerns, rerun gates, and commit this milestone.

### Milestone 5: close roadmap task 1.3.1

Only after the implementation, documentation, tests, gates, CodeRabbit review,
and prior commits are complete, update `docs/roadmap.md` to mark roadmap task
1.3.1 done:

```markdown
- [x] 1.3.1. Add the pinned DigitalOcean OpenAPI artefact and a repeatable
      refresh script with provenance.
```

Add a short decision note under the task if useful, pointing to
`src/openapi/digitalocean.openapi.provenance.json`.

Run documentation formatting and documentation gates if `docs/roadmap.md`
changed. Then run:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
coderabbit review --agent
```

Resolve concerns, rerun the gates, and make the final implementation commit.
Update this ExecPlan's `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` before the final commit if they
changed.

## Validation plan

The implementation is complete only when these commands succeed from a clean
working tree, with logs written under `/tmp`:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make typecheck 2>&1 | tee /tmp/typecheck-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

For plan-only changes, run the same gates that are relevant to documentation
and repository health before opening the draft pull request. If a
documentation-only plan change fails a code gate because of unrelated existing
breakage, record the failing log path and do not hide the failure.

Observable success after implementation:

- `src/openapi/digitalocean.openapi.json` exists and is deterministic.
- `src/openapi/digitalocean.openapi.provenance.json` records upstream source,
  pin, refresh command, generated artefact path, and generated SHA-256 hash.
- The refresh command recorded in provenance can reproduce the artefact for the
  pinned commit.
- Tests fail if the artefact hash no longer matches provenance.
- Users' and developers' guides describe the new contract artefact without
  claiming that `/v2` route implementation is complete.
- `docs/roadmap.md` marks item 1.3.1 done only after the implementation lands.

## Progress

- [x] 2026-05-25T03:09:20+02:00: Loaded the `leta`, `execplans`,
      `firecrawl-mcp`, `hexagonal-architecture`, `commit-message`,
      `pr-creation`, and `en-gb-oxendict-style` skills for this planning
      slice.
- [x] 2026-05-25T03:09:20+02:00: Created the Leta workspace for this
      repository with `leta workspace add`.
- [x] 2026-05-25T03:09:20+02:00: Renamed the local branch to
      `1-3-1-pinned-digital-ocean-open-api-artefact`.
- [x] 2026-05-25T03:09:20+02:00: Used a Wyvern agent team to inspect roadmap,
      design, tooling, tests, and architecture boundaries.
- [x] 2026-05-25T03:09:20+02:00: Used Firecrawl to confirm DigitalOcean
      OpenAPI source facts and Redocly CLI prior art.
- [x] 2026-05-25T03:09:20+02:00: Drafted this ExecPlan.
- [x] 2026-05-25T03:09:20+02:00: Validated the plan-only change with
      targeted Markdown linting, `make nixie`, `make check-fmt`,
      `make typecheck`, `make lint`, and `make test`.
- [x] 2026-05-25T03:09:20+02:00: Ran `coderabbit review --agent`; fixed the
      valid copy findings from the first pass. A second pass reported stale
      wrapping findings even though local line-length checks and targeted
      Markdown linting passed.
- [ ] Commit the plan-only change.
- [ ] Push the plan branch and open a draft pull request for review.
- [ ] Await explicit user approval before implementation.

## Surprises & Discoveries

- The repository already has ADR 0002 for OpenAPI pinning and ADR 0007 for the
  release capability policy. This task should not create a new policy; it
  should supply the artefact and provenance that those decisions require.
- The existing repository has a root-level `sync.ts` for the inherited GitHub
  REST schema. A sibling DigitalOcean-specific sync script fits current
  conventions better than a new `scripts/` directory.
- Current docs point new DigitalPuddle contract work toward `src/openapi/`,
  while inherited GitHub schema data remains under `schema/`.
- Firecrawl found the DigitalOcean upstream specification source at
  `specification/digitalocean-public.v2.yaml`.
- `make markdownlint` is currently blocked by pre-existing long-line
  violations in the long Simulacrum actors guide. Targeted Markdown linting for
  this ExecPlan passes.

## Decision Log

- Decision: Draft the plan as pre-implementation and leave roadmap task 1.3.1
  unchecked.
  Rationale: The user explicitly required approval before implementation.

- Decision: Prefer `src/openapi/digitalocean.openapi.json` and
  `src/openapi/digitalocean.openapi.provenance.json` as the implementation
  paths.
  Rationale: `docs/developers-guide.md` names `src/openapi/` as the target
  home for the pinned DigitalOcean contract and operation registry. Keeping the
  new DigitalOcean contract there avoids expanding inherited GitHub schema
  conventions.

- Decision: Allow `@redocly/cli` as a plan-approved development dependency
  only if bundling is required.
  Rationale: Redocly CLI is established OpenAPI tooling for bundling and
  linting, but runtime code should not depend on it.

- Decision: Do not require LemmaScript for this task.
  Rationale: This slice introduces provenance and deterministic artefact
  generation, which are better validated by byte-level fixture tests and
  bounded property tests than by a standalone proof.

## Outcomes & Retrospective

Implementation has not started. Fill this section after the approved execution
phase records the artefact, refresh tooling, validation evidence, CodeRabbit
results, commits, and roadmap closure.
