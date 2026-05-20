/** @file Pure projections from capability manifests to public metadata shapes. */
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
    status: 501;
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
  unsupported: 'Known operation that is intentionally unavailable in this release and returns 501.'
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
  ...(entry.capability === 'unsupported' ? {unsupported: {status: 501}} : {})
});

export const buildCapabilityMatrix = (
  entries: readonly CapabilityManifestEntryInput[] = v1CapabilityManifest
): readonly CapabilityMatrixRow[] =>
  validateCapabilityManifest(entries)
    .map(toMatrixRow)
    .sort((left, right) => left.operationKey.localeCompare(right.operationKey));

export const buildCapabilityDocumentationMetadata = (
  entries: readonly CapabilityManifestEntryInput[] = v1CapabilityManifest
): CapabilityDocumentationMetadata => ({
  legend: capabilityLegend,
  rows: buildCapabilityMatrix(entries).filter((row) => row.exposeInDocs)
});

export const buildUnsupportedOperationLookup = (
  entries: readonly CapabilityManifestEntryInput[] = v1CapabilityManifest
): UnsupportedOperationLookup =>
  new Map(
    validateCapabilityManifest(entries)
      .filter((entry) => entry.capability === 'unsupported')
      .map((entry) => [createOperationKey(entry.method, entry.path), entry])
  );

export const getKnownCapabilityValues = (): readonly Capability[] => capabilityValues;
