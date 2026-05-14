#!/usr/bin/env bun
/**
 * @file Refreshes the pinned bundled DigitalOcean OpenAPI artefact.
 *
 * Downloads DigitalOcean's bundled public API v2 YAML, validates selected
 * response headers for provenance, redacts webhook-shaped upstream examples,
 * computes the SHA-256 hash of the checked-in artefact, and writes both
 * `src/openapi/digitalocean.openapi.yaml` and
 * `src/openapi/digitalocean.openapi.provenance.json`.
 *
 * Run `bun scripts/refresh-digitalocean-openapi.ts` when intentionally
 * updating the pinned contract. The provenance records the source URL, upstream
 * commit SHA, fetch timestamp, response headers, byte length, content hash, and
 * redaction notes so contract updates are reproducible and reviewable.
 */

import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {promisify} from 'node:util';
import {z} from 'zod';

const execFileAsync = promisify(execFile);

const artefactUrl = 'https://api-engineering.nyc3.digitaloceanspaces.com/spec-ci/DigitalOcean-public.v2.yaml';
const upstreamRepository = 'https://github.com/digitalocean/openapi.git';
const upstreamBranch = 'main';
const artefactPath = 'src/openapi/digitalocean.openapi.yaml';
const provenancePath = 'src/openapi/digitalocean.openapi.provenance.json';
const refreshCommand = 'bun scripts/refresh-digitalocean-openapi.ts';
const redactedSecretExamples = [
  {
    pattern: /https:\/\/hooks[.]slack[.]com\/services\/T00000000\/B00000000\/[A-Z]+/g,
    description: 'Slack webhook placeholder with zeroed workspace and channel identifiers'
  },
  {
    pattern: /https:\/\/hooks[.]slack[.]com\/services\/T1234567\/AAAAAAAA\/ZZZZZZ/g,
    description: 'Slack webhook placeholder with sample workspace and channel identifiers'
  }
] as const;
const redactedWebhookExample = 'https://example.invalid/redacted-slack-webhook';

const gitLsRemoteOutputSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})\s+refs\/heads\/main$/);
const fetchResponseHeadersSchema = z.object({
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable()
});

type FetchArtefactResult = {
  readonly response: Response;
  readonly headers: z.infer<typeof fetchResponseHeadersSchema>;
};

const now = (): string => new Date().toISOString();

/**
 * Resolves the current upstream branch commit with `git ls-remote`.
 *
 * @returns The upstream commit identifier as a SHA-1 or SHA-256 hex string.
 * @throws Error when `git` fails or the output does not match the expected
 * branch-ref shape.
 */
async function currentUpstreamCommit(): Promise<string> {
  const {stdout} = await execFileAsync('git', ['ls-remote', upstreamRepository, `refs/heads/${upstreamBranch}`], {
    encoding: 'utf8'
  });
  const output = gitLsRemoteOutputSchema.parse(stdout.trim());
  const [sha] = output.split(/\s+/);
  return sha;
}

/**
 * Fetches the canonical bundled DigitalOcean OpenAPI artefact.
 *
 * Selected response headers are validated with `fetchResponseHeadersSchema` so
 * Content-Type, ETag, and Last-Modified can be recorded in provenance.
 *
 * @returns The fetch response and validated provenance headers.
 * @throws Error when the fetch fails, the response is not OK, or response
 * header validation fails.
 */
async function fetchArtefact(signal?: AbortSignal): Promise<FetchArtefactResult> {
  const response = await fetch(artefactUrl, {signal});
  if (!response.ok) {
    throw new Error(`Failed to fetch ${artefactUrl}: ${response.status} ${response.statusText}`);
  }
  const headers = fetchResponseHeadersSchema.parse({
    contentType: response.headers.get('content-type'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  });
  return {response, headers};
}

const abortController = new AbortController();
const timeout = setTimeout(() => abortController.abort(), 30_000);
const {response, headers} = await fetchArtefact(abortController.signal);
clearTimeout(timeout);

const sourceBytes = new Uint8Array(await response.arrayBuffer());
const sourceText = new TextDecoder().decode(sourceBytes);
const artefactText = redactedSecretExamples.reduce(
  (text, redaction) => text.replaceAll(redaction.pattern, redactedWebhookExample),
  sourceText
);
const artefactBytes = new TextEncoder().encode(artefactText);
const sha256 = createHash('sha256').update(artefactBytes).digest('hex');
const upstreamCommit = await currentUpstreamCommit();

await mkdir(dirname(artefactPath), {recursive: true});
await writeFile(artefactPath, artefactBytes);

const provenance = {
  artefact: artefactPath,
  sourceUrl: artefactUrl,
  upstreamRepository,
  upstreamBranch,
  upstreamCommit,
  refreshCommand,
  fetchedAt: now(),
  contentLength: artefactBytes.byteLength,
  sha256,
  redactions: redactedSecretExamples.map(({description}) => ({
    description,
    replacement: redactedWebhookExample,
    reason: 'Avoid committing webhook-shaped example secrets from the upstream specification.'
  })),
  responseHeaders: headers
} as const;

await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

console.log(`Wrote ${artefactPath} (${artefactBytes.byteLength} bytes, sha256:${sha256})`);
console.log(`Wrote ${provenancePath}`);
