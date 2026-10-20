/**
 * @file Tests for the DigitalOcean OpenAPI refresh command.
 *
 * This suite exercises the command boundary with fake filesystem, process, and
 * logger dependencies. It covers credential-example sanitisation, fail-closed
 * error handling, deterministic provenance output, structured observability,
 * and concurrent temporary-file naming without reaching the network.
 */
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, test} from 'bun:test';
import fc from 'fast-check';
import {z} from 'zod';
import {
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiProvenancePath,
  getDigitalOceanOpenApiSourceArchiveUrl,
  jsonValueSchema,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance
} from '../src/openapi/artifact.ts';
import {
  assertNoCredentialLikeExamples,
  assertNoSlackWebhookUrls,
  createDefaultSyncDependencies,
  createTempOutputPath,
  refreshDigitalOceanOpenApi,
  scrubSecretLikeExamples
} from '../sync-digitalocean-openapi.ts';
import {createFakeSyncDependencies, fakePin, fixedNow} from './support/digitalocean-openapi-refresh-helpers.ts';
import {propertyTestSeed} from './support/property-test-seed.ts';

const repoRoot = path.join(import.meta.dirname, '..');
const testTempRoots: string[] = [];

const createFetchStub = (response: Response): typeof fetch =>
  Object.assign(async () => response, {preconnect: globalThis.fetch.preconnect});

const mkTestTempRoot = async (prefix: string): Promise<string> => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  testTempRoots.push(tempRoot);
  return tempRoot;
};

const slackWebhookExample = fc
  .stringMatching(/[A-Za-z0-9/?=_-]{1,24}/)
  .map((suffix) => `wrapped https://hooks.slack.com/services/T000/B000/${suffix})`);

const privateKeyExample = fc
  .string({minLength: 1, maxLength: 48})
  .map((body) => `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`);

const certificateExample = fc
  .string({minLength: 1, maxLength: 48})
  .map((body) => `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`);

const sensitiveJsonValue = fc
  .letrec((tie) => ({
    value: fc.oneof(
      slackWebhookExample,
      privateKeyExample,
      certificateExample,
      fc.string(),
      fc.array(tie('value'), {maxLength: 4}),
      fc.dictionary(fc.string({maxLength: 8}), tie('value'), {maxKeys: 4})
    )
  }))
  .value.map((value) => jsonValueSchema.parse(value));

describe('DigitalOcean OpenAPI refresh sanitization', () => {
  afterEach(async () => {
    await Promise.all(testTempRoots.splice(0).map((tempRoot) => rm(tempRoot, {force: true, recursive: true})));
  });

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

  test('scrubs credential-like examples idempotently', () => {
    fc.assert(
      fc.property(sensitiveJsonValue, (value) => {
        const scrubbed = scrubSecretLikeExamples(value);
        const scrubbedContent = stringifyCanonicalJson(scrubbed);

        expect(scrubSecretLikeExamples(scrubbed)).toEqual(scrubbed);
        expect(scrubbedContent).not.toContain('hooks.slack.com/services/');
        expect(scrubbedContent).not.toContain('-----BEGIN PRIVATE KEY-----');
        expect(scrubbedContent).not.toContain('-----BEGIN CERTIFICATE-----');
        expect(() => assertNoCredentialLikeExamples(scrubbedContent)).not.toThrow();
      }),
      {numRuns: 100, seed: propertyTestSeed}
    );
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

  test('fails closed when a labelled private key PEM block survives sanitization', () => {
    expect(() =>
      assertNoCredentialLikeExamples('-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----')
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

  test('rejects empty command pins before side effects', async () => {
    const dependencies = createFakeSyncDependencies();

    await expect(
      refreshDigitalOceanOpenApi({argv: ['bun', 'sync-digitalocean-openapi.ts', '--pin=']}, dependencies)
    ).rejects.toThrow(/40-character/);
    expect(dependencies.calls).toEqual([]);
    expect(dependencies.logEntries).toEqual([]);
  });

  test('rejects oversized source archive downloads before buffering', async () => {
    const originalFetch = globalThis.fetch;
    let readAttempted = false;
    const response = new Response(null, {
      headers: new Headers({'content-length': String(50 * 1024 * 1024 + 1)})
    });
    Object.defineProperties(response, {
      body: {
        configurable: true,
        get() {
          readAttempted = true;
          throw new Error('response body should not be read');
        }
      },
      arrayBuffer: {
        configurable: true,
        value: async () => {
          readAttempted = true;
          throw new Error('response body should not be buffered');
        }
      },
      text: {
        configurable: true,
        value: async () => {
          readAttempted = true;
          throw new Error('response body should not be decoded');
        }
      }
    });
    globalThis.fetch = createFetchStub(response);

    try {
      await expect(
        createDefaultSyncDependencies().fetchBytes('https://example.invalid/openapi.tar.gz', 1000)
      ).rejects.toThrow(/exceeded/);
      expect(readAttempted).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('cancels streaming source archive downloads that exceed the byte cap', async () => {
    const originalFetch = globalThis.fetch;
    let cancelCount = 0;
    const chunkSize = 100 * 1024 * 1024;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(chunkSize));
      },
      cancel() {
        cancelCount += 1;
      }
    });
    const response = new Response(body);
    globalThis.fetch = createFetchStub(response);

    try {
      await expect(
        createDefaultSyncDependencies().fetchBytes('https://example.invalid/openapi.tar.gz', 1000)
      ).rejects.toThrow(/exceeded/);
      expect(cancelCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('writes sanitized artefact and provenance through the command flow', async () => {
    const tempRoot = await mkTestTempRoot('digitalpuddle-sync-test-');
    const dependencies = createFakeSyncDependencies();

    await refreshDigitalOceanOpenApi(
      {
        argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
        repoRoot: tempRoot,
        tempRootParent: tempRoot
      },
      dependencies
    );

    const artifactContent = await readFile(path.join(tempRoot, digitalOceanOpenApiArtifactPath), 'utf8');
    const provenanceContent = await readFile(path.join(tempRoot, digitalOceanOpenApiProvenancePath), 'utf8');
    const provenanceData = JSON.parse(provenanceContent);
    const provenance = validateDigitalOceanOpenApiProvenance(provenanceData);

    expect(artifactContent).toContain('SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY');
    expect(artifactContent).not.toContain('hooks.slack.com/services/');
    expect(artifactContent).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(artifactContent).not.toContain('-----BEGIN CERTIFICATE-----');
    expect(provenance.generatedArtifactSha256).toBe(sha256Hex(artifactContent));
    expect(provenance.refreshedAt).toBe(fixedNow.toISOString());
    expect(dependencies.calls).toContain('fetch');
    expect(dependencies.calls).toContain('tar');
    expect(dependencies.calls).toContain('bundle');
    expect(dependencies.logEntries.map((entry) => entry.message)).toMatchSnapshot();
    const stableEntries = dependencies.logEntries.map((entry) => ({
      ...entry,
      fields: Object.fromEntries(
        Object.entries(entry.fields).map(([key, value]) => {
          if (key === 'elapsedMs') {
            return [key, 0];
          }
          const stringValue = z.string().safeParse(value);
          if (!stringValue.success) {
            return [key, value];
          }
          const normalizedValue = stringValue.data
            .replaceAll(tempRoot, '<tempRoot>')
            .replaceAll(/digitalpuddle-openapi-[^/]+/g, '<syncTempRoot>');
          return [key, normalizedValue];
        })
      )
    }));
    expect(stableEntries).toMatchSnapshot();
  });

  test('logs contextual refresh failures', async () => {
    const tempRoot = await mkTestTempRoot('digitalpuddle-sync-failure-');
    const archiveUrl = getDigitalOceanOpenApiSourceArchiveUrl(fakePin);
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
          repoRoot: tempRoot,
          tempRootParent: tempRoot
        },
        dependencies
      )
    ).rejects.toThrow(/fixture fetch failed/);

    expect(dependencies.logEntries[0]).toEqual({
      fields: {archiveUrl, pin: fakePin},
      level: 'info',
      message: '[syncDigitalOceanOpenApi] fetching source archive'
    });
    expect(dependencies.logEntries.at(-1)).toMatchObject({
      fields: {
        archiveUrl,
        artifactPath: path.join(tempRoot, digitalOceanOpenApiArtifactPath),
        elapsedMs: 0,
        errorMessage: 'fixture fetch failed',
        pin: fakePin
      },
      level: 'error',
      message: '[syncDigitalOceanOpenApi] failed'
    });
  });

  test('keeps temporary output paths unique with a frozen clock', async () => {
    const outputPath = path.join(repoRoot, digitalOceanOpenApiArtifactPath);

    expect(
      createTempOutputPath(
        outputPath,
        () => fixedNow,
        () => 12_345
      )
    ).not.toBe(
      createTempOutputPath(
        outputPath,
        () => fixedNow,
        () => 12_345
      )
    );
  });

  test('supports concurrent refresh calls with a frozen clock', async () => {
    const leftRoot = await mkTestTempRoot('digitalpuddle-sync-left-');
    const rightRoot = await mkTestTempRoot('digitalpuddle-sync-right-');
    const leftDependencies = createFakeSyncDependencies();
    const rightDependencies = createFakeSyncDependencies();

    await Promise.all([
      refreshDigitalOceanOpenApi(
        {
          argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
          repoRoot: leftRoot,
          tempRootParent: leftRoot
        },
        leftDependencies
      ),
      refreshDigitalOceanOpenApi(
        {
          argv: ['bun', 'sync-digitalocean-openapi.ts', `--pin=${fakePin}`],
          repoRoot: rightRoot,
          tempRootParent: rightRoot
        },
        rightDependencies
      )
    ]);

    expect(leftDependencies.calls).toEqual(['fetch', 'tar', 'bundle']);
    expect(rightDependencies.calls).toEqual(['fetch', 'tar', 'bundle']);
    await expect(readFile(path.join(leftRoot, digitalOceanOpenApiArtifactPath), 'utf8')).resolves.toContain(
      'SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY'
    );
    await expect(readFile(path.join(rightRoot, digitalOceanOpenApiArtifactPath), 'utf8')).resolves.toContain(
      'SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY'
    );
  });
});
