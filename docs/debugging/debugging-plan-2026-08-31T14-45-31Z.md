# Debugging Plan: TypeScript Startup Test Timeout

**Generated**: 2026-08-31T14:45:31Z
**Issue ID**: Post-turn gateway failure
**Severity**: Medium
**Falsification sub-agent**: alchemist
**Planning agent boundary**: This document was prepared by the planning agent.
Falsification must be executed by the named sub-agent, not by the planning
agent.

## Problem Statement

`make test` ran 186 tests successfully but timed out the TypeScript startup
example after five seconds. The preceding CommonJS startup test took 31.7
seconds and reported one dangling process killed. The expected result is that
both startup subprocess tests complete within their declared timeouts.

**Outcome**: The TypeScript test passed in isolation in 1.62 seconds, which
falsified an intrinsic startup regression. Its implicit five-second Bun
deadline was shorter than the helper's explicit 15-second startup diagnostic
window, so the test deadline now permits that diagnostic and bounded teardown.

## Context Summary

| Aspect | Details |
| --- | --- |
| First observed | 2026-08-31, commit `5759270` with an uncommitted spelling-policy repair |
| Reproduction rate | One failure in one full sequential gateway run |
| Affected components | `tests/startup-output.test.ts`, Node TypeScript example startup |
| Recent changes | TypeDoc gate and spelling-policy source configuration |

### Error Artefacts

```plaintext
The CommonJS startup test completed in 31746.91ms and killed 1 dangling
process. The subsequent TypeScript example test timed out after 5000ms.
```

### Information Gaps

- Whether the TypeScript example fails when selected on its own.
- Whether the preceding CommonJS test leaves a subprocess or port state that
  delays the next test.

______________________________________________________________________

## Hypotheses

### H1: The preceding CLI test leaks process state

**Claim**: The CommonJS startup test leaves a subprocess or resource state that
causes the following TypeScript example to exceed its timeout.

**Plausibility**: High — the run reported a dangling process immediately before
the timeout.

**Prediction**: Selecting only the TypeScript example will complete within five
seconds when no preceding CLI test has run.

#### H1 Falsification Plan

| Step | Action | Expected Negative Result |
| --- | --- | --- |
| 1 | Run `bun test tests/startup-output.test.ts --filter 'TypeScript example'`. | The selected test times out or fails alone. |

**Tooling**: Bun test runner.

**Confidence on falsification**: High. A failure in isolation rules out the
preceding test as the necessary cause.

______________________________________________________________________

### H2: The TypeScript example itself has regressed

**Claim**: The Node experimental type-transform invocation no longer reaches
the expected startup output within the five-second test limit.

**Plausibility**: Medium — the failing assertion is directly bound to that
invocation, but no source change touched it.

**Prediction**: The selected TypeScript example will fail or time out in a
fresh process without the CommonJS test.

#### H2 Falsification Plan

| Step | Action | Expected Negative Result |
| --- | --- | --- |
| 1 | Run the selected TypeScript test from H1 once. | It completes within five seconds with the expected output. |

**Tooling**: Bun test runner.

**Confidence on falsification**: High. Passing in isolation excludes an
intrinsic startup regression under the observed environment.

______________________________________________________________________

## Recommended Execution Order

1. **H1 and H2** — one isolated, deterministic test distinguishes both causes.

## Termination Criteria

- **Root cause identified**: The isolated test either passes, implicating
  test-order state, or fails, implicating the TypeScript startup path.
- **Escalation trigger**: If the result varies across two identical isolated
  runs, revise the plan for nondeterministic host contention.

## Notes for Executing Agent

Run only the supplied focused command. Do not modify tracked files or run the
full repository gateway. Report one of: falsified, not-falsified, or
inconclusive, with the measured result.
