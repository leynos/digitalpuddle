/**
 * @file Tests for the checked-in DigitalOcean OpenAPI artefact.
 *
 * This suite treats the pinned contract and provenance record as repository
 * data, then checks their shape, hash relationship, URL provenance, snapshots,
 * and canonical JSON invariants. It depends on the OpenAPI artefact helpers in
 * `src/openapi/artifact.ts` and the refresh-command credential guard so that
 * generated file validation stays aligned with sync-time validation.
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, expect, test} from 'bun:test';
import fc from 'fast-check';
import {z} from 'zod';
import {
  assertDigitalOceanOpenApiProvenanceMatchesArtifact,
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiProvenancePath,
  getDigitalOceanOpenApiRawSourceUrl,
  getDigitalOceanOpenApiSourceArchiveUrl,
  jsonObjectSchema,
  jsonValueSchema,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance,
  type DigitalOceanOpenApiProvenance,
  type JsonValue
} from '../src/openapi/artifact.ts';
import {assertNoCredentialLikeExamples, credentialExampleReplacements} from '../sync-digitalocean-openapi.ts';
import {propertyTestSeed} from './support/property-test-seed.ts';

const repoRoot = path.join(import.meta.dirname, '..');

const readJsonFile = async (relativePath: string): Promise<JsonValue> => {
  const contents = await readFile(path.join(repoRoot, relativePath), 'utf8');
  const parsedJson = JSON.parse(contents);
  return jsonValueSchema.parse(parsedJson);
};

const readTextFile = async (relativePath: string): Promise<string> =>
  readFile(path.join(repoRoot, relativePath), 'utf8');

const jsonNumber = fc.double({noNaN: true, noDefaultInfinity: true}).map((value) => (value === 0 ? 0 : value));
const jsonPrimitive = fc.oneof(fc.constant(null), fc.boolean(), jsonNumber, fc.string());

const jsonValue: fc.Arbitrary<JsonValue> = fc
  .letrec((tie) => ({
    value: fc.oneof(
      jsonPrimitive,
      fc.array(tie('value'), {maxLength: 4}),
      fc.dictionary(fc.string({maxLength: 8}), tie('value'), {maxKeys: 4})
    )
  }))
  .value.map((value) => jsonValueSchema.parse(value));

const artifactSchema = z.object({
  components: z.object({schemas: jsonObjectSchema.optional()}).optional(),
  openapi: z.string(),
  paths: jsonObjectSchema
});

const snapshotStableProvenance = (provenance: DigitalOceanOpenApiProvenance): JsonValue => ({
  ...provenance,
  generatedArtifactSha256: '<sha256>',
  refreshedAt: '<iso-date>',
  upstreamCommit: '<commit>'
});

const reverseObjectKeysRecursive = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => reverseObjectKeysRecursive(item));
  }

  const object = jsonObjectSchema.safeParse(value);
  if (object.success) {
    return Object.fromEntries(
      Object.entries(object.data)
        .toReversed()
        .map(([key, item]) => [key, reverseObjectKeysRecursive(item)])
    );
  }

  return value;
};

describe('DigitalOcean OpenAPI artefact', () => {
  test('is an OpenAPI 3 document with representative v2 paths', async () => {
    const artifact = artifactSchema.parse(await readJsonFile(digitalOceanOpenApiArtifactPath));

    expect(artifact.openapi).toBeString();
    expect(String(artifact.openapi)).toStartWith('3.');
    expect(artifact.paths['/v2/account']).toBeDefined();
    expect(artifact.paths['/v2/kubernetes/clusters']).toBeDefined();
  });

  test('does not contain credential-like examples', async () => {
    const artifactContent = await readTextFile(digitalOceanOpenApiArtifactPath);

    expect(artifactContent).not.toContain('hooks.slack.com/services/');
    expect(artifactContent).not.toContain('-----BEGIN PRIVATE KEY-----');
    expect(artifactContent).not.toContain('-----BEGIN CERTIFICATE-----');
    for (const rule of credentialExampleReplacements) {
      expect(new RegExp(rule.pattern.source, rule.pattern.flags).test(artifactContent), rule.description).toBe(false);
    }
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
    const artifact = artifactSchema.parse(await readJsonFile(digitalOceanOpenApiArtifactPath));
    const paths = Object.keys(artifact.paths);
    const schemas = Object.keys(artifact.components?.schemas ?? {});

    expect({
      firstPaths: paths.slice(0, 5),
      lastPaths: paths.slice(-5),
      openapi: artifact.openapi,
      pathCount: paths.length,
      representativePaths: {
        account: Object.keys(jsonObjectSchema.parse(artifact.paths['/v2/account'])),
        kubernetesClusters: Object.keys(jsonObjectSchema.parse(artifact.paths['/v2/kubernetes/clusters']))
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
        const parsedCanonicalJson = jsonValueSchema.parse(JSON.parse(canonicalJson));
        const reversedJson = stringifyCanonicalJson(reverseObjectKeysRecursive(value));

        expect(parsedCanonicalJson).toEqual(structuredClone(value));
        expect(reversedJson).toBe(canonicalJson);
      }),
      {numRuns: 100, seed: propertyTestSeed}
    );
  });
  test('serialises canonical JSON idempotently after parsing', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonicalJson = stringifyCanonicalJson(value);

        const parsedCanonicalJson = JSON.parse(canonicalJson);
        const parsedValue = jsonValueSchema.parse(parsedCanonicalJson);
        expect(stringifyCanonicalJson(parsedValue)).toBe(canonicalJson);
      }),
      {numRuns: 100, seed: propertyTestSeed}
    );
  });
});
