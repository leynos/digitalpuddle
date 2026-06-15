/** @file Behavioural tests for target runtime module contracts. */
import {describe, expect, it} from 'bun:test';
import type {CliCommand} from '../src/cli/index.ts';
import type {KubernetesEngine} from '../src/engines/index.ts';
import {createNoopRequestJournal} from '../src/journal/index.ts';
import {createEmptyScenarioRegistry} from '../src/scenarios/index.ts';
import {createWorkerRuntime} from '../src/worker/index.ts';

describe('target runtime layout', () => {
  it('uses injected worker ports as the runtime behaviour source', () => {
    const clock = {now: () => new Date('2026-06-01T00:00:00.000Z')};
    const engine: KubernetesEngine = {
      descriptor: {
        name: 'noop-kubernetes',
        capability: 'kubernetes'
      }
    };
    const runtime = createWorkerRuntime({clock, kubernetesEngine: engine});

    expect(runtime.ports.clock.now().toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(runtime.ports.kubernetesEngine?.descriptor).toEqual({
      name: 'noop-kubernetes',
      capability: 'kubernetes'
    });
    expect({
      ports: {
        clock: runtime.ports.clock,
        kubernetesEngine: {
          descriptor: runtime.ports.kubernetesEngine?.descriptor
        }
      }
    }).toMatchSnapshot();
  });

  it('accepts request journal appends without persistence side effects', async () => {
    const journal = createNoopRequestJournal();
    const entry = {
      id: 'entry-1',
      method: 'GET',
      path: '/v2/kubernetes/clusters',
      status: 501,
      occurredAt: new Date('2026-06-01T00:00:00.000Z')
    };

    await expect(Promise.resolve(journal.append(entry))).resolves.toBeUndefined();
    await expect(Promise.resolve(journal.append({...entry, id: 'entry-2', status: 200}))).resolves.toBeUndefined();
  });

  it('keeps the empty scenario registry deterministic across calls', () => {
    const registry = createEmptyScenarioRegistry();

    expect(registry.list()).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it('runs CLI command contracts with caller-provided arguments', async () => {
    const command: CliCommand = {
      name: 'echo-exit',
      run: (args) => ({exitCode: args.includes('--fail') ? 1 : 0})
    };

    await expect(Promise.resolve(command.run([]))).resolves.toEqual({exitCode: 0});
    await expect(Promise.resolve(command.run(['--fail']))).resolves.toEqual({exitCode: 1});
  });
});
