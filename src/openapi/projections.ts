/**
 * @file Pure projections from capability manifests to public metadata shapes.
 *
 * This module converts validated release capability entries into sorted,
 * adapter-friendly views. It solves the problem of keeping documentation
 * metadata, admin payloads, and unsupported-operation lookup data derived from
 * the same manifest without letting each caller reshape policy data in its own
 * way.
 *
 * The public API exposes `CapabilityMatrixRow`,
 * `CapabilityDocumentationMetadata`, `buildCapabilityMatrix()`,
 * `buildCapabilityDocumentationMetadata()`, `buildUnsupportedOperationLookup()`,
 * and `getKnownCapabilityValues()`. These exports are consumed by the admin
 * route layer and unsupported-response helpers, and they are intentionally
 * deterministic so tests and generated documentation remain stable.
 *
 * Sibling module `src/openapi/capabilities.ts` owns validation and the domain
 * vocabulary this module projects. Sibling adapter
 * `src/handlers/unsupported.ts` performs the HTTP translation for unsupported
 * operations. This module sits between those layers: it depends on pure
 * OpenAPI policy data and exposes shapes that the broader route assembly can
 * serve directly.
 */
import {
  capabilityValues,
  createOperationKey,
  validateCapabilityManifest,
  v1CapabilityManifest,
  type Capability,
  type CapabilityManifestEntry,
  type CapabilityManifestEntryInput,
  type HttpMethod,
  type RuntimeBehaviour
} from './capabilities.ts';

export type CapabilityMatrixRow = {
  operationKey: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  capability: Capability;
  releaseStage: string;
  productArea: string;
  exposeInDocs: boolean;
  runtimeBehaviour: RuntimeBehaviour;
  followOnPhase?: string;
  notes?: string;
  unsupported?: {
    behaviour: 'not-implemented';
  };
};

export type CapabilityDocumentationMetadata = {
  legend: Record<Capability, string>;
  rows: readonly CapabilityMatrixRow[];
};

export type UnsupportedOperationLookup = ReadonlyMap<string, CapabilityManifestEntry>;

export const capabilityLegend: Record<Capability, string> = {
  scriptable: 'Deterministic state, validation, scheduler, or worker behaviour without an engine adapter.',
  'engine-backed': 'Supported workflow that delegates side effects to worker-owned engine ports.',
  stubbed: 'Deterministic static or lightweight response, not full control-plane modelling.',
  unsupported: 'Known operation that is intentionally unavailable in this release.'
};

const toMatrixRow = (entry: CapabilityManifestEntry): CapabilityMatrixRow => ({
  operationKey: createOperationKey(entry.method, entry.path),
  operationId: entry.operationId,
  method: entry.method,
  path: entry.path,
  capability: entry.capability,
  releaseStage: entry.releaseStage,
  productArea: entry.productArea,
  exposeInDocs: entry.exposeInDocs,
  runtimeBehaviour: entry.runtime.behaviour,
  ...(entry.followOnPhase ? {followOnPhase: entry.followOnPhase} : {}),
  ...(entry.notes ? {notes: entry.notes} : {}),
  ...(entry.capability === 'unsupported' ? {unsupported: {behaviour: 'not-implemented' as const}} : {})
});

const sortMatrixRows = (entries: readonly CapabilityManifestEntry[]): readonly CapabilityMatrixRow[] =>
  entries.map(toMatrixRow).sort((left, right) => left.operationKey.localeCompare(right.operationKey));

export const buildCapabilityMatrix = (
  entries?: readonly CapabilityManifestEntryInput[]
): readonly CapabilityMatrixRow[] =>
  sortMatrixRows(entries ? validateCapabilityManifest(entries) : v1CapabilityManifest);

export const buildCapabilityDocumentationMetadata = (
  entries?: readonly CapabilityManifestEntryInput[]
): CapabilityDocumentationMetadata => ({
  legend: capabilityLegend,
  rows: buildCapabilityMatrix(entries).filter((row) => row.exposeInDocs)
});

export const buildUnsupportedOperationLookup = (
  entries?: readonly CapabilityManifestEntryInput[]
): UnsupportedOperationLookup =>
  new Map(
    (entries ? validateCapabilityManifest(entries) : v1CapabilityManifest)
      .filter((entry) => entry.capability === 'unsupported')
      .map((entry) => [createOperationKey(entry.method, entry.path), entry])
  );

export const getKnownCapabilityValues = (): readonly Capability[] => capabilityValues;
