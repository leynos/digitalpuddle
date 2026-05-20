/**
 * @file Admin-facing capability documentation API.
 *
 * This module re-exports the projection-layer metadata builder under the
 * admin name consumed by the `/_digitalpuddle/capabilities` endpoint. The
 * re-export keeps the admin module's public interface explicit while leaving
 * the projection logic in `src/openapi/projections.ts`.
 */
export {buildCapabilityDocumentationMetadata as capabilitiesPayload} from '../openapi/projections.ts';
