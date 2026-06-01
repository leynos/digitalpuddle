/** @file Internal OpenAPI contract metadata entry point. */
export {
  capabilityManifestEntrySchema,
  capabilitySchema,
  capabilityValues,
  createOperationKey,
  httpMethodSchema,
  httpMethodValues,
  isSupportedCapability,
  requiresEnginePort,
  runtimeBehaviourSchema,
  runtimeBehaviourValues,
  validateCapabilityManifest,
  v1CapabilityManifest
} from './capabilities.ts';
export type {
  Capability,
  CapabilityManifestEntry,
  CapabilityManifestEntryInput,
  HttpMethod,
  RuntimeBehaviour
} from './capabilities.ts';
export {
  buildCapabilityDocumentationMetadata,
  buildCapabilityMatrix,
  buildUnsupportedOperationLookup,
  capabilityLegend,
  getKnownCapabilityValues
} from './projections.ts';
export type {
  CapabilityDocumentationMetadata,
  CapabilityMatrixRow,
  UnsupportedOperationLookup
} from './projections.ts';
