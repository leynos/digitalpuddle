/**
 * @file Internal OpenAPI contract metadata entry point.
 *
 * This module re-exports the capability policy, operation-key helpers,
 * unsupported-operation projections, and documentation metadata builders owned
 * by `src/openapi/`. It gives later DigitalOcean contract work one stable
 * import boundary while preserving the existing pure projection modules.
 */
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
