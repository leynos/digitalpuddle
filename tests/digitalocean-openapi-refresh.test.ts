/**
 * @file Tests for the DigitalOcean OpenAPI refresh command.
 */
import fs, {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'bun:test';
import {
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiProvenancePath,
  digitalOceanOpenApiSourcePath,
  getDigitalOceanOpenApiSourceArchiveUrl,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance
} from '../src/openapi/artifact.ts';
import {
  assertNoCredentialLikeExamples,
  assertNoSlackWebhookUrls,
  createTempOutputPath,
  refreshDigitalOceanOpenApi,
  scrubSecretLikeExamples,
  type SyncDependencies
} from '../sync-digitalocean-openapi.ts';

const repoRoot = join(import.meta.dirname, '..');
const fixedNow = new Date('2026-06-14T00:00:00.000Z');
const fakePin = '0123456789abcdef0123456789abcdef01234567';

describe('DigitalOcean OpenAPI refresh sanitization', () => {
  test('scrubs credential-like examples before artefact writing', () => {
    const scrubbed = scrubSecretLikeExamples({
      nested: [
        'https://hooks.slack.com/services/T000/B000/SECRET',
        'wrapped https://hooks.slack.com/services/T000/B000/SECRET?foo=bar)',
        '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
        '-----BEGIN CERTIFICATE-----\nsecret\n-----END CERTIFICATE-----'
      ]
    });
    const content = stringifyCanonicalJson(scrubbed);

    expect(content).not.toContain('hooks.slack.com/services/');
    expect(content).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(content).not.toContain('-----BEGIN CERTIFICATE-----');
    expect(content).toContain('https://example.invalid/slack-webhook');
    expect(() => assertNoSlackWebhookUrls(content)).not.toThrow();
  });

  test('fails closed when a Slack webhook survives sanitization', () => {
    expect(() => assertNoSlackWebhookUrls('https://hooks.slack.com/services/T000/B000/SECRET')).toThrow(
      /sanitization failed/
    );
  });

  test('fails closed when a PEM block survives sanitization', () => {
    expect(() =>
      assertNoCredentialLikeExamples('-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----')
    ).toThrow(/sanitization failed/);
  });

  test('rejects malformed command pins before side effects', async () => {
    const dependencies = createFakeSyncDependencies();

    await expect(
      refreshDigitalOceanOpenApi({argv: ['bun', 'sync-digitalocean-openapi.ts', '--pin=not-a-sha']}, dependencies)
    ).rejects.toThrow(/40-character/);
    expect(dependencies.calls).toEqual([]);
    expect(dependencies.logEntries).toEqual([]);
  });

  test('writes sanitized artefact and provenance through the command flow', async () => {
    const tempRoot = await mkdtemp(join(os.tmpdir(), 'digitalpuddle-sync-test-'));
    const dependencies = createFakeSyncDependencies();

    try {
      await refreshDigitalOceanOpenApi(
        {
          argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
          repoRoot: tempRoot,
          tempRootParent: tempRoot
        },
        dependencies
      );

      const artifactContent = await readFile(join(tempRoot, digitalOceanOpenApiArtifactPath), 'utf8');
      const provenance = validateDigitalOceanOpenApiProvenance(
        JSON.parse(await readFile(join(tempRoot, digitalOceanOpenApiProvenancePath), 'utf8')) as unknown
      );

      expect(artifactContent).toContain('SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY');
      expect(artifactContent).not.toContain('hooks.slack.com/services/');
      expect(artifactContent).not.toContain('-----BEGIN PRIVATE KEY-----');
      expect(artifactContent).not.toContain('-----BEGIN CERTIFICATE-----');
      expect(provenance.generatedArtifactSha256).toBe(sha256Hex(artifactContent));
      expect(provenance.refreshedAt).toBe(fixedNow.toISOString());
      expect(dependencies.calls).toContain('fetch');
      expect(dependencies.calls).toContain('tar');
      expect(dependencies.calls).toContain('bundle');
      expect(dependencies.logEntries.map((entry) => entry.message)).toEqual([
        '[syncDigitalOceanOpenApi] fetching source archive',
        '[syncDigitalOceanOpenApi] extracting source archive',
        '[syncDigitalOceanOpenApi] bundling source OpenAPI document',
        '[syncDigitalOceanOpenApi] parsing bundled OpenAPI document',
        '[syncDigitalOceanOpenApi] scrubbed credential-like examples',
        '[syncDigitalOceanOpenApi] validating sanitized OpenAPI artefact',
        '[syncDigitalOceanOpenApi] validating OpenAPI provenance',
        '[syncDigitalOceanOpenApi] wrote artefact to',
        '[syncDigitalOceanOpenApi] wrote provenance to',
        '[syncDigitalOceanOpenApi] artefact sha256',
        '[syncDigitalOceanOpenApi] completed'
      ]);
      expect(dependencies.logEntries).toContainEqual({
        level: 'info',
        message: '[syncDigitalOceanOpenApi] validating sanitized OpenAPI artefact',
        values: [{artifactPath: join(tempRoot, digitalOceanOpenApiArtifactPath)}]
      });
      expect(dependencies.logEntries).toContainEqual({
        level: 'info',
        message: '[syncDigitalOceanOpenApi] completed',
        values: [{elapsedMs: 0, pin: fakePin}]
      });
    } finally {
      await rm(tempRoot, {recursive: true, force: true});
    }
  });

  test('logs contextual refresh failures', async () => {
    const tempRoot = await mkdtemp(join(os.tmpdir(), 'digitalpuddle-sync-failure-'));
    const archiveUrl = getDigitalOceanOpenApiSourceArchiveUrl(fakePin);
    const dependencies = createFakeSyncDependencies({
      fetchBytes: async () => {
        dependencies.calls.push('fetch');
        throw new Error('fixture fetch failed');
      }
    });

    try {
      await expect(
        refreshDigitalOceanOpenApi(
          {
            argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
            repoRoot: tempRoot,
            tempRootParent: tempRoot
          },
          dependencies
        )
      ).rejects.toThrow(/fixture fetch failed/);

      expect(dependencies.logEntries[0]).toEqual({
        level: 'info',
        message: '[syncDigitalOceanOpenApi] fetching source archive',
        values: [{archiveUrl, pin: fakePin}]
      });
      expect(dependencies.logEntries.at(-1)).toMatchObject({
        level: 'error',
        message: '[syncDigitalOceanOpenApi] failed',
        values: [
          {
            archiveUrl,
            artifactPath: join(tempRoot, digitalOceanOpenApiArtifactPath),
            elapsedMs: 0,
            pin: fakePin
          }
        ]
      });
    } finally {
      await rm(tempRoot, {recursive: true, force: true});
    }
  });

  test('keeps temporary output paths unique with a frozen clock', async () => {
    const outputPath = join(repoRoot, digitalOceanOpenApiArtifactPath);

    expect(createTempOutputPath(outputPath, () => fixedNow)).not.toBe(createTempOutputPath(outputPath, () => fixedNow));
  });

  test('supports concurrent refresh calls with a frozen clock', async () => {
    const leftRoot = await mkdtemp(join(os.tmpdir(), 'digitalpuddle-sync-left-'));
    const rightRoot = await mkdtemp(join(os.tmpdir(), 'digitalpuddle-sync-right-'));
    const dependencies = createFakeSyncDependencies();

    try {
      await Promise.all([
        refreshDigitalOceanOpenApi(
          {
            argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
            repoRoot: leftRoot,
            tempRootParent: leftRoot
          },
          dependencies
        ),
        refreshDigitalOceanOpenApi(
          {
            argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
            repoRoot: rightRoot,
            tempRootParent: rightRoot
          },
          dependencies
        )
      ]);

      await expect(readFile(join(leftRoot, digitalOceanOpenApiArtifactPath), 'utf8')).resolves.toContain(
        'SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY'
      );
      await expect(readFile(join(rightRoot, digitalOceanOpenApiArtifactPath), 'utf8')).resolves.toContain(
        'SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY'
      );
    } finally {
      await Promise.all([rm(leftRoot, {recursive: true, force: true}), rm(rightRoot, {recursive: true, force: true})]);
    }
  });
});

type FakeSyncDependencies = SyncDependencies & {
  readonly calls: string[];
  readonly logEntries: SyncLogEntry[];
};

type SyncLogEntry = {
  readonly level: 'error' | 'info';
  readonly message: string;
  readonly values: readonly unknown[];
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
  const dependencies: FakeSyncDependencies = {
    calls,
    execFileAsync,
    fetchBytes:
      overrides.fetchBytes ??
      (async () => {
        calls.push('fetch');
        return new Uint8Array([1, 2, 3]);
      }),
    fs,
    logger: {
      error: (message, ...values) => logEntries.push({level: 'error', message: String(message), values}),
      info: (message, ...values) => logEntries.push({level: 'info', message: String(message), values})
    },
    logEntries,
    now: () => fixedNow
  };

  return dependencies;
};
