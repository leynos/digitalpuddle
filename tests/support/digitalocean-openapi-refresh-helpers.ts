/**
 * @file Shared fixtures for DigitalOcean OpenAPI refresh command tests.
 *
 * These helpers provide a fake sync dependency adapter that records command
 * calls and structured logger payloads while writing minimal fixture artefacts
 * into caller-owned temporary directories. Refresh command tests use them to
 * verify side effects and observability without depending on live network,
 * archive, or Redocly execution.
 */
import fs, {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {digitalOceanOpenApiSourcePath} from '../../src/openapi/artifact.ts';
import type {SyncDependencies} from '../../sync-digitalocean-openapi.ts';

const fakeProcessId = 12345;

const fixedNow = new Date('2026-06-14T00:00:00.000Z');
const fakePin = '0123456789abcdef0123456789abcdef01234567';

type FakeSyncDependencies = SyncDependencies & {
  readonly calls: string[];
  readonly logEntries: SyncLogEntry[];
};

type SyncLogEntry = {
  readonly fields: SyncLogFields;
  readonly level: 'error' | 'info';
  readonly message: string;
};

type SyncLogFields = Record<string, unknown> & {
  readonly elapsedMs?: unknown;
  readonly errorMessage?: unknown;
};

type FakeSyncDependencyOverrides = {
  readonly fetchBytes?: SyncDependencies['fetchBytes'];
};

const createFakeSyncDependencies = (overrides: FakeSyncDependencyOverrides = {}): FakeSyncDependencies => {
  const calls: string[] = [];
  const logEntries: SyncLogEntry[] = [];
  const execFileAsync = (async (command: string, args?: readonly string[] | null) => {
    const commandArgs = args ?? [];

    if (command === 'tar') {
      calls.push('tar');
      const destination = String(commandArgs[3]);
      await fs.mkdir(join(destination, `openapi-${fakePin}`, 'specification'), {recursive: true});
      await writeFile(join(destination, `openapi-${fakePin}`, digitalOceanOpenApiSourcePath), 'openapi: 3.0.0\n');
      return {stderr: '', stdout: ''};
    }

    if (command === 'bun') {
      calls.push('bundle');
      const outputPath = String(commandArgs[commandArgs.indexOf('--output') + 1]);
      await writeFile(
        outputPath,
        JSON.stringify({
          openapi: '3.0.0',
          paths: {},
          xCredentialExamples: [
            'https://hooks.slack.com/services/T000/B000/SECRET',
            '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
            '-----BEGIN CERTIFICATE-----\nsecret\n-----END CERTIFICATE-----'
          ]
        })
      );
      return {stderr: '', stdout: ''};
    }

    throw new Error(`unexpected command: ${command}`);
  }) as SyncDependencies['execFileAsync'];

  return {
    calls,
    execFileAsync,
    fetchBytes:
      overrides.fetchBytes ??
      (async () => {
        calls.push('fetch');
        return new Uint8Array([1, 2, 3]);
      }),
    fs,
    getPid: () => fakeProcessId,
    logger: {
      error: (message, ...values) => logEntries.push(createLogEntry('error', message, values)),
      info: (message, ...values) => logEntries.push(createLogEntry('info', message, values))
    },
    logEntries,
    now: () => fixedNow
  };
};

const createLogEntry = (level: SyncLogEntry['level'], message: unknown, values: readonly unknown[]): SyncLogEntry => ({
  fields:
    values.length === 1 && isRecord(values[0])
      ? values[0]
      : {
          values
        },
  level,
  message: String(message)
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export {
  createFakeSyncDependencies,
  createLogEntry,
  fakePin,
  fixedNow,
  isRecord,
  type FakeSyncDependencies,
  type FakeSyncDependencyOverrides,
  type SyncLogEntry,
  type SyncLogFields
};
