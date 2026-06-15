/**
 * @file Tests for the pinned DigitalOcean OpenAPI artefact and provenance.
 */
import fs, {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import fc from 'fast-check';
import {
  assertDigitalOceanOpenApiProvenanceMatchesArtifact,
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiProvenancePath,
  digitalOceanOpenApiSourcePath,
  getDigitalOceanOpenApiRawSourceUrl,
  getDigitalOceanOpenApiSourceArchiveUrl,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance,
  type DigitalOceanOpenApiProvenance,
  type JsonValue
} from '../src/openapi/artifact.ts';
import {
  assertNoCredentialLikeExamples,
  refreshDigitalOceanOpenApi,
  type SyncDependencies
} from '../sync-digitalocean-openapi.ts';

const repoRoot = join(import.meta.dirname, '..');
const fixedNow = new Date('2026-06-14T00:00:00.000Z');
const fakePin = '0123456789abcdef0123456789abcdef01234567';

const readJsonFile = async (relativePath: string): Promise<unknown> =>
  JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8')) as unknown;

const readTextFile = async (relativePath: string): Promise<string> => readFile(join(repoRoot, relativePath), 'utf8');

const jsonPrimitive = fc.oneof(fc.constant(null), fc.boolean(), fc.double({noNaN: true}), fc.string());

const jsonValue: fc.Arbitrary<JsonValue> = fc.letrec((tie) => ({
  value: fc.oneof(
    jsonPrimitive,
    fc.array(tie('value'), {maxLength: 4}),
    fc.dictionary(fc.string({maxLength: 8}), tie('value'), {maxKeys: 4})
  )
})).value as fc.Arbitrary<JsonValue>;

const codeUnitCompare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const snapshotStableProvenance = (provenance: DigitalOceanOpenApiProvenance): JsonValue => ({
  ...provenance,
  generatedArtifactSha256: '<sha256>',
  refreshedAt: '<iso-date>',
  upstreamCommit: '<commit>'
});

const independentlyCanonicalizeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => independentlyCanonicalizeJson(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => codeUnitCompare(left, right))
        .map(([key, item]) => [key, independentlyCanonicalizeJson(item)])
    );
  }

  return value;
};

describe('DigitalOcean OpenAPI artefact', () => {
  test('is an OpenAPI 3 document with representative v2 paths', async () => {
    const artifact = (await readJsonFile(digitalOceanOpenApiArtifactPath)) as {
      openapi?: unknown;
      paths?: Record<string, unknown>;
    };

    expect(artifact.openapi).toBeString();
    expect(String(artifact.openapi)).toStartWith('3.');
    expect(artifact.paths?.['/v2/account']).toBeDefined();
    expect(artifact.paths?.['/v2/kubernetes/clusters']).toBeDefined();
  });

  test('does not contain credential-like examples', async () => {
    const artifactContent = await readTextFile(digitalOceanOpenApiArtifactPath);

    expect(artifactContent).not.toContain('hooks.slack.com/services/');
    expect(artifactContent).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(artifactContent).not.toContain('-----BEGIN CERTIFICATE-----');
    expect(() => assertNoCredentialLikeExamples(artifactContent)).not.toThrow();
  });

  test('records valid provenance for the checked-in artefact', async () => {
    const provenance = validateDigitalOceanOpenApiProvenance(await readJsonFile(digitalOceanOpenApiProvenancePath));
    const artifactContent = await readTextFile(digitalOceanOpenApiArtifactPath);

    expect(provenance.upstreamRepository).toBe('https://github.com/digitalocean/openapi');
    expect(provenance.sourcePath).toBe('specification/DigitalOcean-public.v2.yaml');
    expect(provenance.refreshCommand).toBe('bun run sync:openapi:digitalocean');
    expect(provenance.generatedArtifactPath).toBe(digitalOceanOpenApiArtifactPath);
    expect(provenance.generatedArtifactSha256).toBe(sha256Hex(artifactContent));
    expect(assertDigitalOceanOpenApiProvenanceMatchesArtifact(provenance, artifactContent)).toEqual(provenance);
  });

  test('matches the pinned provenance structure snapshot', async () => {
    const provenance = validateDigitalOceanOpenApiProvenance(await readJsonFile(digitalOceanOpenApiProvenancePath));

    expect(snapshotStableProvenance(provenance)).toMatchSnapshot();
  });

  test('matches the pinned artefact critical properties snapshot', async () => {
    const artifact = (await readJsonFile(digitalOceanOpenApiArtifactPath)) as {
      components?: {schemas?: Record<string, unknown>};
      openapi?: unknown;
      paths?: Record<string, unknown>;
    };
    const paths = Object.keys(artifact.paths ?? {});
    const schemas = Object.keys(artifact.components?.schemas ?? {});

    expect({
      firstPaths: paths.slice(0, 5),
      lastPaths: paths.slice(-5),
      openapi: artifact.openapi,
      pathCount: paths.length,
      representativePaths: {
        account: Object.keys((artifact.paths?.['/v2/account'] as Record<string, unknown> | undefined) ?? {}),
        kubernetesClusters: Object.keys(
          (artifact.paths?.['/v2/kubernetes/clusters'] as Record<string, unknown> | undefined) ?? {}
        )
      },
      schemaCount: schemas.length
    }).toMatchSnapshot();
  });

  test('rejects incomplete provenance data', () => {
    expect(() =>
      validateDigitalOceanOpenApiProvenance({
        upstreamRepository: 'https://github.com/digitalocean/openapi'
      })
    ).toThrow();
  });

  test('rejects provenance URLs that do not match the stated upstream commit', async () => {
    const provenance = validateDigitalOceanOpenApiProvenance(await readJsonFile(digitalOceanOpenApiProvenancePath));
    const otherCommit = '0123456789abcdef0123456789abcdef01234567';

    const mismatchedRawSource: DigitalOceanOpenApiProvenance = {
      ...provenance,
      rawSourceUrl: getDigitalOceanOpenApiRawSourceUrl(otherCommit)
    };
    expect(() => validateDigitalOceanOpenApiProvenance(mismatchedRawSource)).toThrow(/rawSourceUrl/);

    const mismatchedArchive: DigitalOceanOpenApiProvenance = {
      ...provenance,
      sourceArchiveUrl: getDigitalOceanOpenApiSourceArchiveUrl(otherCommit)
    };
    expect(() => validateDigitalOceanOpenApiProvenance(mismatchedArchive)).toThrow(/sourceArchiveUrl/);
  });

  test('rejects provenance with a different upstream repository', async () => {
    const provenance = validateDigitalOceanOpenApiProvenance(await readJsonFile(digitalOceanOpenApiProvenancePath));

    expect(() =>
      validateDigitalOceanOpenApiProvenance({
        ...provenance,
        upstreamRepository: 'https://example.invalid/digitalocean/openapi'
      })
    ).toThrow();
  });

  test('rejects provenance when the artefact hash differs', async () => {
    const provenance = await readJsonFile(digitalOceanOpenApiProvenancePath);

    expect(() => assertDigitalOceanOpenApiProvenanceMatchesArtifact(provenance, '{"openapi":"3.0.0"}\n')).toThrow(
      /hash mismatch/
    );
  });

  test('serialises equivalent objects with stable key ordering', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonicalJson = stringifyCanonicalJson(value);
        const parsedCanonicalJson = JSON.parse(canonicalJson) as JsonValue;

        expect(parsedCanonicalJson).toEqual(JSON.parse(JSON.stringify(value)) as JsonValue);
        expect(stringifyCanonicalJson(value)).toBe(
          `${JSON.stringify(independentlyCanonicalizeJson(value), null, 2)}\n`
        );
      }),
      {numRuns: 100}
    );
  });
});

describe('DigitalOcean OpenAPI refresh command flow', () => {
  const tempRoots: string[] = [];
  let commandRepoRoot: string;

  beforeEach(async () => {
    commandRepoRoot = await mkdtemp(join(os.tmpdir(), 'digitalpuddle-openapi-command-'));
    tempRoots.push(commandRepoRoot);
  });

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((tempRoot) => rm(tempRoot, {force: true, recursive: true})));
  });

  test('logs each major operation boundary during a successful refresh', async () => {
    const dependencies = createFakeSyncDependencies();

    await refreshDigitalOceanOpenApi(
      {
        argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
        repoRoot: commandRepoRoot,
        tempRootParent: commandRepoRoot
      },
      dependencies
    );

    expect(dependencies.calls).toEqual(['fetch', 'tar', 'bundle']);
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

    const completionLog = dependencies.logEntries.find(
      (entry) => entry.message === '[syncDigitalOceanOpenApi] completed'
    );
    expect(completionLog?.level).toBe('info');
    expect(completionLog?.fields).toMatchObject({pin: fakePin});
    expect(completionLog?.fields.elapsedMs).toBeNumber();
    expect(completionLog?.fields.elapsedMs).toBeGreaterThanOrEqual(0);

    const artifactContent = await readFile(join(commandRepoRoot, digitalOceanOpenApiArtifactPath), 'utf8');
    const provenance = validateDigitalOceanOpenApiProvenance(
      JSON.parse(await readFile(join(commandRepoRoot, digitalOceanOpenApiProvenancePath), 'utf8')) as unknown
    );
    expect(artifactContent).toContain('SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY');
    expect(provenance.generatedArtifactSha256).toBe(sha256Hex(artifactContent));
  });

  test('logs contextual fields when refresh fails', async () => {
    const dependencies = createFakeSyncDependencies({
      fetchBytes: async () => {
        dependencies.calls.push('fetch');
        throw new Error('fixture fetch failed');
      }
    });

    await expect(
      refreshDigitalOceanOpenApi(
        {
          argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
          repoRoot: commandRepoRoot,
          tempRootParent: commandRepoRoot
        },
        dependencies
      )
    ).rejects.toThrow(/fixture fetch failed/);

    const errorLog = dependencies.logEntries.find((entry) => entry.level === 'error');
    expect(errorLog?.message).toBe('[syncDigitalOceanOpenApi] failed');
    expect(errorLog?.fields).toMatchObject({
      archiveUrl: getDigitalOceanOpenApiSourceArchiveUrl(fakePin),
      artifactPath: join(commandRepoRoot, digitalOceanOpenApiArtifactPath),
      pin: fakePin
    });
    expect(errorLog?.fields.elapsedMs).toBeNumber();
    expect(errorLog?.fields.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(errorLog?.fields.error).toBeInstanceOf(Error);
  });

  test('rejects invalid pins before dependency side effects or logging', async () => {
    const dependencies = createFakeSyncDependencies();

    await expect(
      refreshDigitalOceanOpenApi(
        {argv: ['bun', 'sync-digitalocean-openapi.ts', '--pin=not-a-sha'], repoRoot: commandRepoRoot},
        dependencies
      )
    ).rejects.toThrow(/40-character/);

    expect(dependencies.calls).toEqual([]);
    expect(dependencies.logEntries).toEqual([]);
  });
});

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
  readonly error?: unknown;
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
