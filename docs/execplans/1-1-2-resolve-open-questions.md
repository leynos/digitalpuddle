# Resolve the first v1 product questions

This ExecPlan (execution plan) is a living document. The sections
`Constraints`, `Tolerances`, `Risks`, `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work
proceeds.

Status: COMPLETE

## Purpose / big picture

DigitalPuddle cannot build a stable DigitalOcean simulator spine until the
first product boundary questions are closed. This plan records how to resolve
roadmap task 1.1.2: the v1 treatment of Kubernetes node pools, Spaces
control-plane routes, Droplet engines, and doctl compatibility.

After this plan is implemented, a maintainer can open
`docs/digitalpuddle-technical-design.md` and see that every open question in
section 20 is either included in v1, assigned to a named follow-on phase, or
explicitly rejected. The observable success signal is that `docs/roadmap.md`
marks task 1.1.2 as done, the accepted decision is recorded in
`docs/adr/0006-v1-product-boundaries.md`, and documentation gates plus the
project code gates pass.

This plan is planning-only until approved. Do not implement it until the user
explicitly approves this exact plan or an updated revision.

## Approval gate

This plan has two phases:

1. Draft phase: write and review this ExecPlan only.
2. Execution phase: after explicit user approval, update the ADR, design,
   guides, and roadmap as described below.

Silence is not approval. A future agent must not start the execution phase
until a user message explicitly approves the plan or asks for named revisions.

## Constraints

- Do not change runtime TypeScript source while implementing this plan unless
  the user explicitly expands the task. Task 1.1.2 is a decision-closure task,
  not a route implementation task.
- Preserve ADRs 0001 through 0005 as accepted historical records. Add a new ADR
  for the 1.1.2 closure instead of rewriting existing accepted decisions, except
  for typo-only fixes discovered during editing.
- Keep Simulacrum as the HTTP backplane. This follows
  `docs/adr/0001-simulacrum-backplane.md`.
- Keep the DigitalOcean OpenAPI pinning strategy intact. This follows
  `docs/adr/0002-digitalocean-openapi-pin.md`.
- Keep v1 optimized for DigitalOcean Kubernetes Service (DOKS), not broad
  DigitalOcean emulation. This follows `docs/adr/0003-doks-first-slice.md`.
- Keep worker-owned engine side effects out of public handlers. This follows
  `docs/adr/0004-deterministic-worker.md` and the hexagonal architecture rule
  that adapters do not leak into domain policy.
- Documentation must use en-GB-oxendict spelling and follow
  `docs/documentation-style-guide.md`.
- Run gates sequentially. Do not run format checks, lint, or tests in parallel.
- Use `tee` for gates so truncated terminal output can be inspected later.
- Do not expose DigitalPuddle to untrusted networks or plan outbound calls to
  real DigitalOcean as part of normal simulator operation.

If satisfying the task requires violating any constraint, stop, record the
conflict in `Decision Log`, and ask the user how to proceed.

## Tolerances

- Scope: if implementation needs runtime code changes, generated OpenAPI
  artefacts, or new test fixtures, stop and ask for approval to expand beyond
  documentation.
- File count: if implementation needs to modify more than six tracked files,
  stop and explain why the plan no longer fits the original decision-closure
  scope.
- Dependencies: if a new package, external binary, or service is required,
  stop and ask for approval.
- Public API: if the plan requires changing any exported TypeScript API
  signature, stop and ask for approval.
- Ambiguity: if evidence supports two materially different v1 scopes, stop and
  present the options instead of guessing.
- Validation: if any gate still fails after two focused correction attempts,
  stop with the failing log path and a concise diagnosis.
- Time: if one implementation stage exceeds two hours of active work, pause and
  update `Progress`, `Surprises & Discoveries`, and `Decision Log` before
  continuing.

## Risks

- Risk: the node-pool decision can expand v1 from cluster lifecycle support
  into scale-operation support.
  Severity: medium.
  Likelihood: medium.
  Mitigation: record mutating node-pool operations as either required v1
  endpoints or a named follow-on slice, and keep the route matrix explicit.

- Risk: Spaces has two surfaces that are easy to conflate: S3-compatible
  object traffic and DigitalOcean `/v2/spaces/keys` access-key management.
  Severity: medium.
  Likelihood: high.
  Mitigation: document object traffic as direct-to-MinIO in v1 and separately
  decide whether Spaces key management is v1, follow-on, or rejected.

- Risk: Droplet engine work can pull container or QEMU lifecycle complexity
  into the DOKS-first release.
  Severity: high.
  Likelihood: medium.
  Mitigation: require explicit evidence before including Droplets in v1, and
  record the first acceptable follow-on engine type if Droplets are deferred.

- Risk: doctl compatibility can become an unbounded promise because doctl
  covers more DigitalOcean products than DigitalPuddle v1.
  Severity: medium.
  Likelihood: high.
  Mitigation: define a command-level CI contract for supported v1 workflows, and
  document other doctl commands as best-effort or unsupported.

- Risk: documentation-only implementation may be mistaken for feature delivery.
  Severity: medium.
  Likelihood: medium.
  Mitigation: state in the ADR, design, and guides that this task closes
  decisions only; route implementation remains in later roadmap tasks.

## Progress

- [x] (2026-05-05T07:56:50Z) Confirmed branch
  `fix/resolve-v1-questions` and loaded the repository, execplans, leta,
  firecrawl, commit-message, and hexagonal-architecture guidance.
- [x] (2026-05-05T07:56:50Z) Reviewed `docs/roadmap.md`,
  `docs/digitalpuddle-technical-design.md`, `docs/users-guide.md`,
  `docs/developers-guide.md`, and ADRs 0001 through 0005.
- [x] (2026-05-05T07:56:50Z) Used Firecrawl against official DigitalOcean
  documentation for Kubernetes node-pool, Spaces, Droplet, and doctl evidence.
- [x] (2026-05-05T07:56:50Z) Used a Wyvern agent team for repository-context,
  external-evidence, and ExecPlan-readiness review.
- [x] (2026-05-05T07:56:50Z) Drafted this ExecPlan.
- [x] (2026-05-05T09:13:36Z) Received explicit user approval to proceed with
  implementation of this plan.
- [x] (2026-05-05T09:13:36Z) Reconfirmed branch
  `1-1-2-resolve-open-questions`; the worktree was clean before execution.
- [x] (2026-05-05T09:13:36Z) Add ADR 0006 for the resolved v1 product
  boundaries.
- [x] (2026-05-05T09:13:36Z) Update the technical design sections cited by
  roadmap task 1.1.2.
- [x] (2026-05-05T09:13:36Z) Update the users' and developers' guides if the
  decisions change user or maintainer expectations.
- [x] (2026-05-05T09:13:36Z) Mark roadmap task 1.1.2 as done.
- [x] (2026-05-05T09:13:36Z) Run validation gates for the approved
  implementation.

## Surprises & discoveries

- Observation: the repository has no existing `docs/execplans/` directory.
  Evidence: `find docs -maxdepth 2 -type d -print` listed `docs` and
  `docs/adr` only.
  Impact: this plan creates the directory before adding the plan file.

- Observation: the branch name contains `/`, which makes raw
  `$(git branch --show-current)` unsafe inside a `/tmp/*.out` filename.
  Evidence: a raw branch-name tee path attempted to write below
  `/tmp/fmt-digitalpuddle-fix/`.
  Impact: validation commands in this plan sanitize branch names before
  constructing log paths.

- Observation: doctl documents `--api-url` as a global flag, but official
  doctl documentation did not provide matching evidence for a
  `DIGITALOCEAN_API_URL` endpoint override environment variable.
  Evidence: DigitalOcean doctl node-pool documentation lists `--api-url`, and
  the doctl README lists `-u, --api-url string`.
  Impact: the implementation should standardize documented doctl compatibility
  on explicit `--api-url` usage unless later evidence proves an environment
  variable is supported.

- Observation: doctl has Spaces key-management commands, while DigitalOcean
  documentation also says doctl does not support the Spaces object API.
  Evidence: official Spaces key reference documents `/v2/spaces/keys`, and
  official Spaces product documentation describes Spaces as S3-compatible
  object storage.
  Impact: the implementation must separate Spaces key control-plane decisions
  from object storage traffic, which remains direct to MinIO for v1.

- Observation: `make test` expects generated GraphQL resolver types and the
  startup-output snapshots are sensitive to inherited colour-environment
  warnings.
  Evidence: `make test` failed before `make generate` because
  `src/__generated__/resolvers-types.ts` was absent, then failed snapshot
  comparisons while `FORCE_COLOR` injected `NO_COLOR` warnings into child
  process output.
  Impact: validation steps generate resolver types before testing and unset
  `FORCE_COLOR` for the test run.

- Observation: task 1.1.2 fits the documentation-only tolerance exactly.
  Evidence: implementation touched six tracked files:
  `docs/execplans/1-1-2-resolve-open-questions.md`,
  `docs/adr/0006-v1-product-boundaries.md`,
  `docs/digitalpuddle-technical-design.md`, `docs/users-guide.md`,
  `docs/developers-guide.md`, and `docs/roadmap.md`.
  Impact: no tolerance escalation is required, but further tracked files would
  exceed the file-count tolerance.

## Decision Log

- Decision: create a new ADR for task 1.1.2 instead of editing prior accepted
  ADRs to carry the new combined decision.
  Rationale: ADRs 0001 through 0005 already record earlier accepted decisions.
  A new ADR keeps the product-boundary closure narrow and auditable.
  Date/Author: 2026-05-05T07:56:50Z / Codex.

- Decision: make this plan documentation-first and stop if runtime code changes
  become necessary.
  Rationale: roadmap task 1.1.2 asks to resolve open implementation decisions.
  Runtime route, worker, and engine work belongs to later roadmap tasks after
  the boundaries are closed.
  Date/Author: 2026-05-05T07:56:50Z / Codex.

- Decision: use official DigitalOcean documentation gathered through Firecrawl
  as external evidence for the decisions.
  Rationale: node-pool, Spaces, Droplet, and doctl surfaces can change over
  time, so current primary-source evidence is required before recording a
  compatibility policy.
  Date/Author: 2026-05-05T07:56:50Z / Codex.

- Decision: start the execution phase for this plan.
  Rationale: the user explicitly asked to proceed with implementation of
  `docs/execplans/1-1-2-resolve-open-questions.md`.
  Date/Author: 2026-05-05T09:13:36Z / Codex.

- Decision: close section 20 with ADR 0006's narrowed v1 boundaries.
  Rationale: the expected decisions remained consistent with the local design:
  v1 is DOKS-first, keeps MinIO direct for object traffic, omits Droplet
  engines, and limits doctl compatibility to implemented command workflows.
  Date/Author: 2026-05-05T09:13:36Z / Codex.

## Outcomes & retrospective

Implementation closed all four section 20 questions through ADR 0006 and
aligned the technical design, users' guide, developers' guide, and roadmap with
that decision. The accepted v1 boundary is read-only node-pool state for the
initial cluster pool, direct MinIO object traffic with deferred
`/v2/spaces/keys`, no Droplet routes or engines in v1, and command-level doctl
coverage only for implemented workflows using `--api-url`.

The roadmap now marks task 1.1.2 done and gives deferred work named homes:
node-pool scale operations, Spaces access-key control-plane routes, bucket
metadata control-plane routes, a future Droplet slice, and later doctl coverage
expansion.

Validation passed with these commands:

```plaintext
bun fmt
make markdownlint
make generate
make check-fmt
make lint
env -u FORCE_COLOR make test
```

The final test run reported 113 passing tests, 0 failures, and 2 snapshots.

## Context and orientation

DigitalPuddle is a local DigitalOcean-shaped API simulator being adapted from a
Simulacat Core baseline. Simulacrum is the HTTP and routing backplane. A
backplane is the lower-level infrastructure that receives HTTP requests and
dispatches them to simulator handlers.

The source of truth for the product boundary is
`docs/digitalpuddle-technical-design.md`. The build order is recorded in
`docs/roadmap.md`. Durable architecture decisions are stored in `docs/adr/`.

Roadmap task 1.1.2 is in `docs/roadmap.md` under "1.1. Close the first
implementation decisions". It cites these sections of
`docs/digitalpuddle-technical-design.md`:

- section 8.2, which lists the recommended v1 `/v2` endpoint matrix;
- section 8.3, which states compatibility expectations for Terraform, Spaces,
  doctl, and Nile Valley;
- section 12.2, which describes MinIO as the Spaces object-store substrate;
- section 12.3, which proposes deferring Droplet engines unless required;
- section 18, which describes future Terratest and developer ergonomics;
- section 20, which lists the four open questions this task must close.

DOKS means DigitalOcean Kubernetes Service. A node pool is a named group of
worker nodes inside a Kubernetes cluster. A control-plane route is a
DigitalOcean `/v2` API route that manages metadata or lifecycle, unlike S3
object traffic that reads and writes bucket contents. doctl is DigitalOcean's
official command-line client.

The existing ADRs constrain the answer:

- `docs/adr/0001-simulacrum-backplane.md` keeps Simulacrum as the backplane.
- `docs/adr/0002-digitalocean-openapi-pin.md` requires a pinned OpenAPI
  contract and generated operation registry.
- `docs/adr/0003-doks-first-slice.md` prioritizes the DOKS path over broad
  DigitalOcean emulation.
- `docs/adr/0004-deterministic-worker.md` requires deterministic virtual-time
  worker behaviour and keeps engine calls out of public handlers.
- `docs/adr/0005-transitional-simulacat-boundaries.md` treats inherited
  GitHub-oriented boundaries as temporary.

## Hexagonal boundaries

Use hexagonal architecture to protect boundaries without forcing a pattern
transplant. In plain terms, the implementation should keep policy decisions in
documentation and future domain/application modules, while concrete
infrastructure stays behind adapter interfaces.

For this task, the important boundaries to preserve are:

- Public DigitalOcean `/v2` routes are driving adapters. They translate HTTP
  requests into simulator operations and translate results back into
  DigitalOcean-shaped responses.
- The operation registry is a contract boundary. It classifies operations as
  `scriptable`, `engine-backed`, `stubbed`, or `unsupported`; handlers should
  not invent classifications locally.
- Store backends, k3d, MinIO, future Droplet substrates, doctl, and Terraform
  are driven adapters or external clients. Domain policy must not depend on
  their concrete command-line flags or process details.
- The deterministic worker owns engine side effects. Public handlers may enqueue
  work but must not call k3d, Docker, MinIO, QEMU, or future Droplet engines
  directly.
- The request journal is an observable product surface. Future handler, worker,
  and adapter work should emit typed journal entries rather than relying on
  logs for assertions.

Acceptance for this boundary work is documentation-level: ADR 0006 and the
technical design must say where each future side effect belongs and which
follow-on roadmap phase owns any deferred adapter.

## Plan of work

### Stage A: confirm evidence and final intended decisions

Re-read the cited roadmap and design sections. Confirm that no newer local ADR
already closed the four questions. Check official DigitalOcean documentation for
the current node-pool, Spaces, Droplet, and doctl surfaces. Use Firecrawl or
ordinary browsing only for primary sources, preferring DigitalOcean official
documentation and the doctl repository when checking CLI flags.

The expected decisions to encode, unless new evidence contradicts them, are:

- Kubernetes node pools: include read/list and the initial node pool created as
  part of cluster creation in v1; defer mutating node-pool scale operations
  such as add, update, delete, delete-node, replace-node, and recycle to a named
  follow-on "node-pool scale operations" phase unless Nile Valley explicitly
  requires them before v1.
- Spaces: keep ordinary object operations direct-to-MinIO in v1 and do not proxy
  S3 object traffic through DigitalPuddle. Defer `/v2/spaces/keys` access-key
  management to a named follow-on "Spaces access-key control-plane" phase unless
  a v1 Terraform or doctl workflow requires key rotation through DigitalPuddle.
- Droplets: omit Droplet routes and engines from v1. Classify Droplet public
  API operations as unsupported until a named follow-on Droplet slice. Prefer a
  `NullDropletEngine` or small container-backed engine for the first follow-on
  implementation; keep QEMU as a later option for host-bootstrap fidelity.
- doctl: treat doctl as a narrow compatibility target for supported v1 DOKS
  commands only, using explicit `--api-url` configuration. Cover supported
  commands in CI only after their corresponding `/v2` routes exist. Document
  unsupported doctl product commands as best-effort or explicitly unsupported,
  not as v1 commitments.

Go/no-go: if the evidence makes any expected decision wrong, stop and update
this plan before editing project docs.

### Stage B: add ADR 0006

Create `docs/adr/0006-v1-product-boundaries.md`. The ADR should include
context, decision, rejected alternatives, and consequences. It must explicitly
answer all four open questions from section 20 of the technical design. It
should cite official DigitalOcean evidence in prose or footnotes without
turning the ADR into a research dump.

Go/no-go: if the ADR cannot close one of the four questions without a product
owner answer, stop and ask the user for that answer. Do not mark the roadmap
task done with unresolved questions.

### Stage C: update the technical design

Update `docs/digitalpuddle-technical-design.md` in the cited sections only:

- In section 8.2, make the node-pool rows match ADR 0006. The matrix should not
  say "optional" after the decision is closed.
- In section 8.3, replace broad doctl compatibility language with the v1
  command-level policy from ADR 0006.
- In section 12.2, separate MinIO-backed object traffic from any deferred
  Spaces key-management route support.
- In section 12.3, replace "recommended strategy" ambiguity with the accepted
  v1 Droplet decision and the named follow-on path.
- In section 18, mention that doctl CI coverage is added only for supported v1
  command workflows after routes exist.
- In section 20, move all four questions out of "Open questions" and into
  resolved decisions or named follow-on phases.

Go/no-go: if section 8.2 cannot remain consistent with ADR 0003's DOKS-first
scope, stop and reconcile the conflict in ADR 0006 before continuing.

### Stage D: update user and developer documentation

Update `docs/users-guide.md` only where user-facing compatibility expectations
change. The likely update is in "Planned DigitalOcean usage", where doctl
examples should prefer `doctl ... --api-url http://localhost:3300/v2` rather
than implying that a generic environment variable covers doctl.

Update `docs/developers-guide.md` only where maintainer-facing practice
changes. The likely update is in the ADR and testing sections, where the guide
should mention ADR 0006 and the rule that doctl CI covers only commands whose
routes are implemented and classified as supported.

Go/no-go: if these guides do not need updates after ADR 0006 and the design
change, record that in `Decision Log` instead of making cosmetic edits.

### Stage E: mark the roadmap task done

Update `docs/roadmap.md` so task 1.1.2 is checked. Preserve the roadmap's build
order. If a deferred follow-on phase is named in ADR 0006, add or adjust the
relevant later roadmap wording so future work has a durable home.

Go/no-go: do not mark 1.1.2 done unless every section 20 question has a
documented disposition.

### Stage F: validate, review, and commit

Run formatting, Markdown, lint, type, and test gates sequentially. Fix any
documentation wrapping or formatting failures. Review the diff, stage only the
intended files, and commit with a file-based commit message.

Go/no-go: if `make lint` or `make test` fails because of pre-existing unrelated
baseline issues, capture the log path, verify the docs-only diff did not cause
the failure, and ask the user whether to commit with the known failure or fix
the baseline separately.

## Concrete steps

Run all commands from the repository root:

```plaintext
.
```

Confirm the branch:

```bash
git branch --show-current
```

Expected output:

```plaintext
1-1-2-resolve-open-questions
```

Review local documentation context:

```bash
sed -n '300,390p' docs/digitalpuddle-technical-design.md
sed -n '540,590p' docs/digitalpuddle-technical-design.md
sed -n '780,880p' docs/digitalpuddle-technical-design.md
sed -n '1,120p' docs/roadmap.md
```

Create and edit the ADR and documentation files. Keep edits narrow:

```plaintext
docs/adr/0006-v1-product-boundaries.md
docs/digitalpuddle-technical-design.md
docs/users-guide.md
docs/developers-guide.md
docs/roadmap.md
```

Format Markdown after documentation changes:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
bun fmt 2>&1 | tee /tmp/fmt-digitalpuddle-${BRANCH}.out
```

Validate Markdown:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make markdownlint 2>&1 | tee /tmp/markdownlint-digitalpuddle-${BRANCH}.out
```

Run the requested code gates sequentially:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make generate 2>&1 | tee /tmp/generate-digitalpuddle-${BRANCH}.out
make check-fmt 2>&1 | tee /tmp/check-fmt-digitalpuddle-${BRANCH}.out
make lint 2>&1 | tee /tmp/lint-digitalpuddle-${BRANCH}.out
env -u FORCE_COLOR make test 2>&1 | tee /tmp/test-digitalpuddle-${BRANCH}.out
```

If the implementation adds Mermaid diagrams, also run:

```bash
BRANCH=$(git branch --show-current | tr '/ ' '__')
make nixie 2>&1 | tee /tmp/nixie-digitalpuddle-${BRANCH}.out
```

Review and commit after gates pass:

```bash
git status --short
git diff -- docs/adr/0006-v1-product-boundaries.md
git diff -- docs/digitalpuddle-technical-design.md docs/users-guide.md
git diff -- docs/developers-guide.md docs/roadmap.md
git add docs/adr/0006-v1-product-boundaries.md
git add docs/digitalpuddle-technical-design.md docs/users-guide.md
git add docs/developers-guide.md docs/roadmap.md
git diff --cached
```

Write the commit message to a temporary file and commit with `git commit -F`.
Do not use `git commit -m`.

## Validation and acceptance

This implementation is accepted when all of the following are true:

- `docs/adr/0006-v1-product-boundaries.md` exists and explicitly answers the
  node-pool, Spaces control-plane, Droplet engine, and doctl compatibility
  questions.
- `docs/digitalpuddle-technical-design.md` section 20 no longer lists open
  questions for task 1.1.2.
- `docs/digitalpuddle-technical-design.md` sections 8.2, 8.3, 12.2, 12.3, and
  18 are consistent with ADR 0006.
- `docs/users-guide.md` describes any user-visible compatibility impact,
  especially doctl endpoint override usage if changed.
- `docs/developers-guide.md` describes any maintainer-facing compatibility or
  CI policy impact.
- `docs/roadmap.md` marks task 1.1.2 as done and names follow-on phases for
  any deferred work.
- No runtime source files are changed unless the user approved an expanded
  scope.
- `make check-fmt`, `make lint`, and `make test` succeed.
- `make markdownlint` succeeds because Markdown files changed.

No new unit, behavioural, end-to-end, property, or proof tests are expected for
the default implementation because it records decisions and changes
documentation only. If implementation introduces executable policy, generated
capability artefacts, or route behaviour, then add `bun:test` coverage for
happy and unhappy paths before committing. If executable policy introduces an
invariant over route classifications or follow-on assignment, add `fast-check`
property tests. If an introduced axiom becomes contractual business logic,
write a substantive proof or stop and ask whether that proof belongs in this
task or a later implementation task.

## Idempotence and recovery

The documentation edits are safe to repeat. If formatting changes more files
than expected, inspect `git diff --stat` before staging and revert only
unintended changes that this agent made. Do not revert unrelated user changes.

If a validation command fails, inspect its `/tmp/*-digitalpuddle-*` log and fix
the smallest relevant issue. Re-run the failed gate before continuing. If a
gate failure is unrelated to the documentation changes, capture evidence in
`Surprises & Discoveries` and ask the user how to proceed.

If the ADR number `0006` already exists when implementation begins, choose the
next unused ADR number, update all references in this plan during execution,
and record the change in `Decision Log`.

## Artifacts and notes

External evidence gathered while drafting this plan:

- DigitalOcean Kubernetes API documentation generated on 2026-04-28 lists
  Kubernetes cluster node-pool list, add, retrieve, update, delete, node delete,
  recycle, status, upgrade, and kubeconfig operations under `/v2/kubernetes`.
- DigitalOcean doctl documentation generated on 2026-04-16 from doctl
  `v1.155.0` lists node-pool commands and the global `--api-url` flag.
- DigitalOcean Spaces product documentation generated on 2026-05-04 describes
  Spaces as S3-compatible object storage.
- DigitalOcean Spaces Keys API documentation generated on 2026-04-28 documents
  `/v2/spaces/keys` as a DigitalOcean control-plane endpoint.
- DigitalOcean Droplets API documentation generated on 2026-04-28 describes a
  broad Droplet route surface under `/v2/droplets`.

Wyvern agent team contributions:

- One agent reviewed repository docs and highlighted the implementation files,
  decisions, and sequencing risks.
- One agent reviewed external DigitalOcean documentation and highlighted the
  split between node-pool API support, Spaces object traffic, Spaces key
  control-plane routes, Droplet scope, and doctl `--api-url`.
- One agent reviewed ExecPlan requirements and confirmed the need for an
  approval gate, living sections, hexagonal boundary notes, documentation
  updates, and validation gates.

## Interfaces and dependencies

The default implementation adds no runtime interfaces and no dependencies.

The documentation should name these future interfaces without implementing
them:

- an operation registry that classifies DigitalOcean `/v2` operations as
  `scriptable`, `engine-backed`, `stubbed`, or `unsupported`;
- a Kubernetes engine interface owned by the worker for k3d-backed DOKS
  operations;
- a future Droplet engine interface, deferred out of v1 unless explicitly
  required;
- MinIO as the v1 S3-compatible object-store substrate for Spaces-shaped object
  traffic;
- doctl as an external compatibility client configured with `--api-url` for
  supported command workflows.

Revision note: Initial draft created on 2026-05-05. It captures the requested
planning scope, Wyvern review inputs, Firecrawl research, approval gate, and
validation strategy. Execution began after explicit approval on 2026-05-05.
