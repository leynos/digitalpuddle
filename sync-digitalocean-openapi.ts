/**
 * @file Refresh script for the pinned DigitalOcean OpenAPI artefact.
 *
 * This script downloads the pinned upstream repository archive, bundles the
 * public v2 specification with Redocly CLI, writes a deterministic JSON
 * artefact, and records machine-readable provenance beside it.
 */
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {
  digitalOceanOpenApiArtifactPath,
  digitalOceanOpenApiCommitPattern,
  digitalOceanOpenApiPin,
  digitalOceanOpenApiProvenancePath,
  digitalOceanOpenApiRefreshCommand,
  digitalOceanOpenApiRepositoryUrl,
  digitalOceanOpenApiSourcePath,
  getDigitalOceanOpenApiRawSourceUrl,
  getDigitalOceanOpenApiSourceArchiveUrl,
  sha256Hex,
  stringifyCanonicalJson,
  validateDigitalOceanOpenApiProvenance,
  type DigitalOceanOpenApiProvenance,
  type JsonValue
} from './src/openapi/artifact.ts';

const execFileAsync = promisify(execFile);

const repoRoot = import.meta.dirname;
const defaultTimeoutMs = 60000;
const maxTimeoutMs = 10 * 60 * 1000;
const bundlingTool = {
  name: '@redocly/cli',
  version: '2.31.5'
} as const;

const parseTimeoutMs = (value: string | undefined): number => {
  const parsed = Number(value ?? defaultTimeoutMs);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maxTimeoutMs ? parsed : defaultTimeoutMs;
};

const timeoutMs = parseTimeoutMs(process.env.DIGITALPUDDLE_OPENAPI_SYNC_TIMEOUT_MS);

const readPinArgument = (): string => {
  const pinArg = process.argv.find((argument) => argument.startsWith('--pin='));
  const pin = pinArg?.slice('--pin='.length) || digitalOceanOpenApiPin;

  if (!digitalOceanOpenApiCommitPattern.test(pin)) {
    throw new Error(`DigitalOcean OpenAPI pin must be a 40-character lower-case hex commit SHA: ${pin}`);
  }

  return pin;
};

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {signal: controller.signal});
    if (!response.ok) {
      throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
};

const extractArchive = async (archivePath: string, destination: string): Promise<void> => {
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destination], {
    timeout: timeoutMs
  });
};

const findExtractedRepositoryRoot = async (destination: string, pin: string): Promise<string> => {
  const entries = await fs.readdir(destination, {withFileTypes: true});
  const expectedPrefix = `openapi-${pin}`;
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(expectedPrefix));

  if (directories.length !== 1) {
    throw new Error(
      `archive should contain exactly one ${expectedPrefix} directory under ${destination}, found ${directories.length}`
    );
  }

  return path.join(destination, directories[0].name);
};

const bundleOpenApi = async (sourcePath: string, outputPath: string): Promise<void> => {
  await execFileAsync(
    'bunx',
    [
      '-p',
      `@redocly/cli@${bundlingTool.version}`,
      'redocly',
      'bundle',
      sourcePath,
      '--output',
      outputPath,
      '--ext',
      'json'
    ],
    {
      cwd: repoRoot,
      timeout: timeoutMs * 2
    }
  );
};

const parseBundledJson = async (bundledPath: string): Promise<JsonValue> => {
  const content = await fs.readFile(bundledPath, 'utf8');
  return JSON.parse(content) as JsonValue;
};

const scrubSecretLikeExamples = (value: JsonValue): JsonValue => {
  if (typeof value === 'string') {
    return value.replaceAll(
      /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
      'https://example.invalid/slack-webhook'
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubSecretLikeExamples(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubSecretLikeExamples(item)]));
  }

  return value;
};

const writeCanonicalJson = async (outputPath: string, value: JsonValue): Promise<string> => {
  const content = stringifyCanonicalJson(value);
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, content, 'utf8');
  return content;
};

const buildProvenance = (pin: string, artifactHash: string): DigitalOceanOpenApiProvenance => ({
  upstreamRepository: digitalOceanOpenApiRepositoryUrl,
  upstreamCommit: pin,
  sourcePath: digitalOceanOpenApiSourcePath,
  rawSourceUrl: getDigitalOceanOpenApiRawSourceUrl(pin),
  sourceArchiveUrl: getDigitalOceanOpenApiSourceArchiveUrl(pin),
  refreshCommand: digitalOceanOpenApiRefreshCommand,
  bundlingTool,
  generatedArtifactPath: digitalOceanOpenApiArtifactPath,
  generatedArtifactSha256: artifactHash,
  refreshedAt: new Date().toISOString()
});

const refreshDigitalOceanOpenApi = async (): Promise<void> => {
  const pin = readPinArgument();
  const archiveUrl = getDigitalOceanOpenApiSourceArchiveUrl(pin);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'digitalpuddle-openapi-'));
  const archivePath = path.join(tempRoot, 'openapi.tar.gz');
  const bundlePath = path.join(tempRoot, 'digitalocean.openapi.raw.json');

  try {
    console.log('[syncDigitalOceanOpenApi] fetching source archive from', archiveUrl);
    await fs.writeFile(archivePath, await fetchBytes(archiveUrl));
    await extractArchive(archivePath, tempRoot);

    const extractedRoot = await findExtractedRepositoryRoot(tempRoot, pin);
    const sourceFile = path.join(extractedRoot, digitalOceanOpenApiSourcePath);
    await bundleOpenApi(sourceFile, bundlePath);

    const artifactPath = path.join(repoRoot, digitalOceanOpenApiArtifactPath);
    const artifactContent = await writeCanonicalJson(
      artifactPath,
      scrubSecretLikeExamples(await parseBundledJson(bundlePath))
    );
    const artifactHash = sha256Hex(artifactContent);
    const provenance = validateDigitalOceanOpenApiProvenance(buildProvenance(pin, artifactHash));
    const provenancePath = path.join(repoRoot, digitalOceanOpenApiProvenancePath);

    await writeCanonicalJson(provenancePath, provenance as unknown as JsonValue);

    console.log('[syncDigitalOceanOpenApi] wrote artefact to', artifactPath);
    console.log('[syncDigitalOceanOpenApi] wrote provenance to', provenancePath);
    console.log('[syncDigitalOceanOpenApi] artefact sha256', artifactHash);
  } finally {
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
};

await refreshDigitalOceanOpenApi();
