/** @file Compatibility tests for target runtime module skeletons. */
import {describe, expect, it} from 'bun:test';
import type {CliCommand} from '../src/cli/index.ts';
import type {KubernetesEngine} from '../src/engines/index.ts';
import {createNoopRequestJournal} from '../src/journal/index.ts';
import {createEmptyScenarioRegistry} from '../src/scenarios/index.ts';
import {createWorkerRuntime} from '../src/worker/index.ts';

describe('target runtime layout', () => {
  it('creates a worker runtime around explicit ports', () => {
    const clock = {now: () => new Date('2026-06-01T00:00:00.000Z')};
    const engine: KubernetesEngine = {
      descriptor: {
        name: 'noop-kubernetes',
        capability: 'kubernetes'
      }
    };

    expect(createWorkerRuntime({clock, kubernetesEngine: engine})).toEqual({
      ports: {clock, kubernetesEngine: engine}
    });
  });

  it('provides a no-op request journal for unwired runtime paths', async () => {
    const journal = createNoopRequestJournal();

    await expect(
      Promise.resolve(
        journal.append({
          id: 'entry-1',
          method: 'GET',
          path: '/v2/kubernetes/clusters',
          status: 501,
          occurredAt: new Date('2026-06-01T00:00:00.000Z')
        })
      )
    ).resolves.toBeUndefined();
  });

  it('provides an empty scenario registry until scenarios are implemented', () => {
    expect(createEmptyScenarioRegistry().list()).toEqual([]);
  });

  it('defines CLI commands without coupling them to process exit', async () => {
    const command: CliCommand = {
      name: 'noop',
      run: (_args) => ({exitCode: 0})
    };

    await expect(Promise.resolve(command.run([]))).resolves.toEqual({exitCode: 0});
  });
});
