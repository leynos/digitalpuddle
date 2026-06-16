/**
 * @file Refresh script for the pinned DigitalOcean OpenAPI artefact.
 *
 * This script downloads the pinned upstream repository archive, bundles the
 * public v2 specification with Redocly CLI, writes a deterministic JSON
 * artefact, and records machine-readable provenance beside it.
 */
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {Dirent} from 'node:fs';
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
const maxArchiveBytes = 50 * 1024 * 1024;
const syncTimeoutEnvKey = 'DIGITALPUDDLE_OPENAPI_SYNC_TIMEOUT_MS';
const bundlingTool = {
  name: '@redocly/cli',
  version: '2.31.5'
} as const;

const secretShapeReplacements: readonly {
  readonly description: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}[] = [
  {
    description: 'Slack incoming webhook URL',
    pattern: /https:\/\/hooks\.slack\.com\/services\/[^\s"'`)\]}]+/g,
    replacement: 'https://example.invalid/slack-webhook'
  },
  {
    description: 'PEM certificate block',
    pattern: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    replacement: 'SANITIZED DIGITALPUDDLE EXAMPLE CERTIFICATE'
  },
  {
    description: 'PEM private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: 'SANITIZED DIGITALPUDDLE EXAMPLE PRIVATE KEY'
  }
];

type SyncLogger = {
  info: (...values: readonly unknown[]) => void;
  error: (...values: readonly unknown[]) => void;
};

type SyncFileSystem = {
  mkdir: typeof fs.mkdir;
  mkdtemp: typeof fs.mkdtemp;
  readFile: typeof fs.readFile;
  readdir: typeof fs.readdir;
  rename: typeof fs.rename;
  rm: typeof fs.rm;
  writeFile: typeof fs.writeFile;
};

type SyncDependencies = {
  readonly execFileAsync: typeof execFileAsync;
  readonly fetchBytes: (url: string, timeoutMs: number) => Promise<Uint8Array>;
  readonly fs: SyncFileSystem;
  readonly getPid: () => number;
  readonly logger: SyncLogger;
  readonly now: () => Date;
};

type RefreshOptions = {
  readonly argv?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly repoRoot?: string;
  readonly tempRootParent?: string;
};

const parseTimeoutMs = (value: string | undefined): number => {
  const parsed = Number(value ?? defaultTimeoutMs);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maxTimeoutMs ? parsed : defaultTimeoutMs;
};

const readPinArgument = (argv: readonly string[]): string => {
  const pinArg = argv.find((argument) => argument.startsWith('--pin='));
  const pin = pinArg?.slice('--pin='.length) ?? digitalOceanOpenApiPin;

  if (!digitalOceanOpenApiCommitPattern.test(pin)) {
    throw new Error(`DigitalOcean OpenAPI pin must be a 40-character lower-case hex commit SHA: ${pin}`);
  }

  return pin;
};

const parseContentLength = (response: Response): number | undefined => {
  const contentLength = response.headers.get('content-length');
  if (contentLength === null) {
    return undefined;
  }

  const parsed = Number(contentLength);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const assertArchiveSize = (url: string, size: number): void => {
  if (size > maxArchiveBytes) {
    throw new Error(`DigitalOcean OpenAPI archive from ${url} exceeded ${maxArchiveBytes} bytes`);
  }
};

const readCappedResponseBytes = async (url: string, response: Response): Promise<Uint8Array> => {
  const contentLength = parseContentLength(response);
  if (contentLength !== undefined) {
    assertArchiveSize(url, contentLength);
  }

  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertArchiveSize(url, bytes.byteLength);
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body.getReader();

  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }

    receivedBytes += value.byteLength;
    assertArchiveSize(url, receivedBytes);
    chunks.push(value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
};

const fetchBytes = async (url: string, requestTimeoutMs: number): Promise<Uint8Array> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {signal: controller.signal});
    if (!response.ok) {
      throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return readCappedResponseBytes(url, response);
  } finally {
    clearTimeout(timeout);
  }
};

const extractArchive = async (
  archivePath: string,
  destination: string,
  dependencies: SyncDependencies,
  requestTimeoutMs: number
): Promise<void> => {
  await dependencies.execFileAsync('tar', ['-xzf', archivePath, '-C', destination], {
    timeout: requestTimeoutMs
  });
};

const findExtractedRepositoryRoot = async (
  destination: string,
  pin: string,
  dependencies: SyncDependencies
): Promise<string> => {
  const entries = (await dependencies.fs.readdir(destination, {withFileTypes: true})) as Dirent[];
  const expectedPrefix = `openapi-${pin}`;
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(expectedPrefix));

  if (directories.length !== 1) {
    throw new Error(
      `archive should contain exactly one ${expectedPrefix} directory under ${destination}, found ${directories.length}`
    );
  }

  const [repositoryRoot] = directories;
  if (repositoryRoot === undefined) {
    throw new Error(`archive did not contain ${expectedPrefix} under ${destination}`);
  }

  return path.join(destination, repositoryRoot.name);
};

const bundleOpenApi = async (
  sourcePath: string,
  outputPath: string,
  dependencies: SyncDependencies,
  commandRepoRoot: string,
  requestTimeoutMs: number
): Promise<void> => {
  await dependencies.execFileAsync(
    'bun',
    ['node_modules/@redocly/cli/bin/cli.js', 'bundle', sourcePath, '--output', outputPath, '--ext', 'json'],
    {
      cwd: commandRepoRoot,
      timeout: requestTimeoutMs * 2
    }
  );
};

const parseBundledJson = async (bundledPath: string, dependencies: SyncDependencies): Promise<JsonValue> => {
  const content = await dependencies.fs.readFile(bundledPath, 'utf8');
  return JSON.parse(content) as JsonValue;
};

const scrubSecretLikeExamples = (value: JsonValue): JsonValue => {
  if (typeof value === 'string') {
    return secretShapeReplacements.reduce(
      (scrubbed, rule) => scrubbed.replaceAll(rule.pattern, rule.replacement),
      value
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

const assertNoCredentialLikeExamples = (content: string): void => {
  if (content.includes('hooks.slack.com/services/')) {
    throw new Error('DigitalOcean OpenAPI artefact sanitization failed: Slack webhook URL remains');
  }

  if (content.includes('-----BEGIN PRIVATE KEY-----') || content.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('DigitalOcean OpenAPI artefact sanitization failed: PEM block remains');
  }
};

const createTempOutputPath = (outputPath: string, now: () => Date, getPid: () => number): string =>
  `${outputPath}.${getPid()}.${now().getTime()}.${randomUUID()}.tmp`;

const writeCanonicalJsonContent = async (
  outputPath: string,
  content: string,
  dependencies: SyncDependencies
): Promise<void> => {
  await dependencies.fs.mkdir(path.dirname(outputPath), {recursive: true});
  const tempOutputPath = createTempOutputPath(outputPath, dependencies.now, dependencies.getPid);
  await dependencies.fs.writeFile(tempOutputPath, content, 'utf8');
  await dependencies.fs.rename(tempOutputPath, outputPath);
};

const writeCanonicalJson = async (
  outputPath: string,
  value: JsonValue,
  dependencies: SyncDependencies
): Promise<string> => {
  const content = stringifyCanonicalJson(value);
  await writeCanonicalJsonContent(outputPath, content, dependencies);
  return content;
};

const buildProvenance = (pin: string, artifactHash: string, now: () => Date): DigitalOceanOpenApiProvenance => ({
  upstreamRepository: digitalOceanOpenApiRepositoryUrl,
  upstreamCommit: pin,
  sourcePath: digitalOceanOpenApiSourcePath,
  rawSourceUrl: getDigitalOceanOpenApiRawSourceUrl(pin),
  sourceArchiveUrl: getDigitalOceanOpenApiSourceArchiveUrl(pin),
  refreshCommand: digitalOceanOpenApiRefreshCommand,
  bundlingTool,
  generatedArtifactPath: digitalOceanOpenApiArtifactPath,
  generatedArtifactSha256: artifactHash,
  refreshedAt: now().toISOString()
});

const createDefaultSyncDependencies = (): SyncDependencies => ({
  execFileAsync,
  fetchBytes,
  fs,
  getPid: () => process.pid,
  logger: console,
  now: () => new Date()
});

const refreshDigitalOceanOpenApi = async (
  options: RefreshOptions = {},
  dependencies = createDefaultSyncDependencies()
): Promise<void> => {
  const commandRepoRoot = options.repoRoot ?? repoRoot;
  const commandEnv = options.env ?? process.env;
  const commandTimeoutMs = parseTimeoutMs(commandEnv[syncTimeoutEnvKey]);
  const pin = readPinArgument(options.argv ?? process.argv);
  const archiveUrl = getDigitalOceanOpenApiSourceArchiveUrl(pin);
  const startedAt = dependencies.now();
  const tempRoot = await dependencies.fs.mkdtemp(
    path.join(options.tempRootParent ?? os.tmpdir(), 'digitalpuddle-openapi-')
  );
  const archivePath = path.join(tempRoot, 'openapi.tar.gz');
  const bundlePath = path.join(tempRoot, 'digitalocean.openapi.raw.json');

  try {
    dependencies.logger.info('[syncDigitalOceanOpenApi] fetching source archive', {archiveUrl, pin});
    await dependencies.fs.writeFile(archivePath, await dependencies.fetchBytes(archiveUrl, commandTimeoutMs));
    dependencies.logger.info('[syncDigitalOceanOpenApi] extracting source archive', {archivePath, tempRoot});
    await extractArchive(archivePath, tempRoot, dependencies, commandTimeoutMs);

    const extractedRoot = await findExtractedRepositoryRoot(tempRoot, pin, dependencies);
    const sourceFile = path.join(extractedRoot, digitalOceanOpenApiSourcePath);
    dependencies.logger.info('[syncDigitalOceanOpenApi] bundling source OpenAPI document', {
      bundlePath,
      sourceFile
    });
    await bundleOpenApi(sourceFile, bundlePath, dependencies, commandRepoRoot, commandTimeoutMs);

    const artifactPath = path.join(commandRepoRoot, digitalOceanOpenApiArtifactPath);
    dependencies.logger.info('[syncDigitalOceanOpenApi] parsing bundled OpenAPI document', {bundlePath});
    const bundledJson = await parseBundledJson(bundlePath, dependencies);
    const scrubbedArtifact = scrubSecretLikeExamples(bundledJson);
    const scrubbedArtifactContent = stringifyCanonicalJson(scrubbedArtifact);
    dependencies.logger.info('[syncDigitalOceanOpenApi] scrubbed credential-like examples', {artifactPath});
    dependencies.logger.info('[syncDigitalOceanOpenApi] validating sanitized OpenAPI artefact', {artifactPath});
    assertNoCredentialLikeExamples(scrubbedArtifactContent);
    await writeCanonicalJsonContent(artifactPath, scrubbedArtifactContent, dependencies);
    const artifactContent = scrubbedArtifactContent;
    const artifactHash = sha256Hex(artifactContent);
    dependencies.logger.info('[syncDigitalOceanOpenApi] validating OpenAPI provenance', {
      artifactHash,
      pin
    });
    const provenance = validateDigitalOceanOpenApiProvenance(buildProvenance(pin, artifactHash, dependencies.now));
    const provenancePath = path.join(commandRepoRoot, digitalOceanOpenApiProvenancePath);

    await writeCanonicalJson(provenancePath, provenance as unknown as JsonValue, dependencies);

    dependencies.logger.info('[syncDigitalOceanOpenApi] wrote artefact to', {artifactPath});
    dependencies.logger.info('[syncDigitalOceanOpenApi] wrote provenance to', {provenancePath});
    dependencies.logger.info('[syncDigitalOceanOpenApi] artefact sha256', {artifactHash});
    dependencies.logger.info('[syncDigitalOceanOpenApi] completed', {
      elapsedMs: dependencies.now().getTime() - startedAt.getTime(),
      pin
    });
  } catch (error) {
    dependencies.logger.error('[syncDigitalOceanOpenApi] failed', {
      archiveUrl,
      artifactPath: path.join(commandRepoRoot, digitalOceanOpenApiArtifactPath),
      elapsedMs: dependencies.now().getTime() - startedAt.getTime(),
      error,
      pin
    });
    throw error;
  } finally {
    await dependencies.fs.rm(tempRoot, {recursive: true, force: true});
  }
};

const assertNoSlackWebhookUrls = assertNoCredentialLikeExamples;

export {
  assertNoCredentialLikeExamples,
  assertNoSlackWebhookUrls,
  createTempOutputPath,
  createDefaultSyncDependencies,
  refreshDigitalOceanOpenApi,
  secretShapeReplacements,
  scrubSecretLikeExamples,
  type SyncDependencies
};

if (import.meta.main) {
  try {
    await refreshDigitalOceanOpenApi();
  } catch (error) {
    console.error('[syncDigitalOceanOpenApi] exiting after failure', error);
    process.exitCode = 1;
  }
}
