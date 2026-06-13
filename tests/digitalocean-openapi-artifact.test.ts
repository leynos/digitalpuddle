/**
 * @file Tests for the pinned DigitalOcean OpenAPI artefact and provenance.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, test} from 'bun:test';
import fc from 'fast-check';
import {
  assertDigitalOceanOpenApiProvenanceMatchesArtifact,
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiProvenancePath,
  getDigitalOceanOpenApiRawSourceUrl,
  getDigitalOceanOpenApiSourceArchiveUrl,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance,
  type DigitalOceanOpenApiProvenance,
  type JsonValue
} from '../src/openapi/artifact.ts';
import {assertNoSlackWebhookUrls, scrubSecretLikeExamples} from '../sync-digitalocean-openapi.ts';

const repoRoot = join(import.meta.dirname, '..');

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

describe('DigitalOcean OpenAPI refresh sanitization', () => {
  test('scrubs Slack webhook examples before artefact writing', () => {
    const scrubbed = scrubSecretLikeExamples({
      nested: [
        'https://hooks.slack.com/services/T000/B000/SECRET',
        'wrapped https://hooks.slack.com/services/T000/B000/SECRET?foo=bar)'
      ]
    });
    const content = stringifyCanonicalJson(scrubbed);

    expect(content).not.toContain('hooks.slack.com/services/');
    expect(content).toContain('https://example.invalid/slack-webhook');
    expect(() => assertNoSlackWebhookUrls(content)).not.toThrow();
  });

  test('fails closed when a Slack webhook survives sanitization', () => {
    expect(() => assertNoSlackWebhookUrls('https://hooks.slack.com/services/T000/B000/SECRET')).toThrow(
      /sanitization failed/
    );
  });
});
