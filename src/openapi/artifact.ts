/**
 * @file Pure helpers for pinned DigitalOcean OpenAPI artefacts.
 *
 * This module owns deterministic JSON serialisation, SHA-256 hashing, and
 * provenance validation for the checked-in DigitalOcean OpenAPI artefact. It
 * deliberately avoids filesystem, network, and command-runner imports so
 * refresh tooling can remain an adapter around these reusable policy checks.
 */
import {createHash} from 'node:crypto';
import {z} from 'zod';

export type JsonObject = {readonly [key: string]: JsonValue};
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

export const jsonStringSchema = z.string();
export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const digitalOceanOpenApiArtifactPath = 'src/openapi/digitalocean.openapi.json';
export const digitalOceanOpenApiProvenancePath = 'src/openapi/digitalocean.openapi.provenance.json';
export const digitalOceanOpenApiRepositoryUrl = 'https://github.com/digitalocean/openapi';
export const digitalOceanOpenApiSourcePath = 'specification/DigitalOcean-public.v2.yaml';
export const digitalOceanOpenApiPin = 'ef3868ee4cadd34fd4f9624371f7a45d7a205fc1';
export const digitalOceanOpenApiRefreshCommand = 'bun run sync:openapi:digitalocean';

export const digitalOceanOpenApiCommitPattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const digitalOceanOpenApiProvenanceSchema = z
  .object({
    upstreamRepository: z.literal(digitalOceanOpenApiRepositoryUrl),
    upstreamCommit: z.string().regex(digitalOceanOpenApiCommitPattern),
    sourcePath: z.literal(digitalOceanOpenApiSourcePath),
    rawSourceUrl: z.url(),
    sourceArchiveUrl: z.url(),
    refreshCommand: z.literal(digitalOceanOpenApiRefreshCommand),
    bundlingTool: z.object({
      name: z.literal('@redocly/cli'),
      version: z.string().min(1)
    }),
    generatedArtifactPath: z.literal(digitalOceanOpenApiArtifactPath),
    generatedArtifactSha256: z.string().regex(sha256Pattern),
    refreshedAt: z.iso.datetime()
  })
  .superRefine((provenance, context) => {
    const expectedRawSourceUrl = getDigitalOceanOpenApiRawSourceUrl(provenance.upstreamCommit);
    if (provenance.rawSourceUrl !== expectedRawSourceUrl) {
      context.addIssue({
        code: 'custom',
        message: `rawSourceUrl must match upstreamCommit: ${expectedRawSourceUrl}`,
        path: ['rawSourceUrl']
      });
    }

    const expectedSourceArchiveUrl = getDigitalOceanOpenApiSourceArchiveUrl(provenance.upstreamCommit);
    if (provenance.sourceArchiveUrl !== expectedSourceArchiveUrl) {
      context.addIssue({
        code: 'custom',
        message: `sourceArchiveUrl must match upstreamCommit: ${expectedSourceArchiveUrl}`,
        path: ['sourceArchiveUrl']
      });
    }
  });

export type DigitalOceanOpenApiProvenance = z.infer<typeof digitalOceanOpenApiProvenanceSchema>;

export const getDigitalOceanOpenApiRawSourceUrl = (pin = digitalOceanOpenApiPin): string =>
  `https://raw.githubusercontent.com/digitalocean/openapi/${pin}/${digitalOceanOpenApiSourcePath}`;

export const getDigitalOceanOpenApiSourceArchiveUrl = (pin = digitalOceanOpenApiPin): string =>
  `https://codeload.github.com/digitalocean/openapi/tar.gz/${pin}`;

export const canonicalizeJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }

  const object = jsonObjectSchema.safeParse(value);
  if (object.success) {
    return Object.fromEntries(
      Object.entries(object.data)
        .toSorted(([left], [right]) => {
          if (left < right) {
            return -1;
          }
          if (left > right) {
            return 1;
          }
          return 0;
        })
        .map(([key, item]) => [key, canonicalizeJson(item)])
    );
  }

  return value;
};

export const stringifyCanonicalJson = (value: JsonValue): string =>
  // JSON.stringify still emits integer-string keys before other keys, per the
  // ECMAScript property-order rules. The output remains deterministic, but it
  // is not strict lexicographic ordering for mixed numeric and textual keys.
  `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;

export const sha256Hex = (content: string | Uint8Array): string => createHash('sha256').update(content).digest('hex');

export const validateDigitalOceanOpenApiProvenance = (provenance: JsonValue): DigitalOceanOpenApiProvenance =>
  digitalOceanOpenApiProvenanceSchema.parse(provenance);

export const assertDigitalOceanOpenApiProvenanceMatchesArtifact = (
  provenance: JsonValue,
  artifactBytes: string | Uint8Array
): DigitalOceanOpenApiProvenance => {
  const parsed = validateDigitalOceanOpenApiProvenance(provenance);
  const actualHash = sha256Hex(artifactBytes);

  if (actualHash !== parsed.generatedArtifactSha256) {
    throw new Error(
      `DigitalOcean OpenAPI artefact hash mismatch: expected ${parsed.generatedArtifactSha256}, got ${actualHash}`
    );
  }

  return parsed;
};
