/**
 * @file Pure helpers for DigitalOcean-shaped unsupported operation responses.
 *
 * This module is the adapter boundary that translates an unsupported
 * capability classification into the HTTP response shape DigitalOcean clients
 * expect. It solves the architecture problem of keeping transport details,
 * such as the response status code and JSON envelope, out of the OpenAPI
 * capability domain model.
 *
 * The public API exposes `UnsupportedOperationResponse` and
 * `toUnsupportedOperationResponse()`. Callers pass a validated manifest entry
 * classified as `unsupported`, and the helper returns the response status and
 * body that a route handler can send.
 *
 * Sibling module `src/openapi/capabilities.ts` owns the validated domain
 * policy, while `src/openapi/projections.ts` builds documentation and lookup
 * views from that policy. This module depends on those domain entries but is
 * consumed by HTTP-facing adapters, keeping the broader system's unsupported
 * route behaviour explicit at the boundary.
 */
import type {CapabilityManifestEntry} from '../openapi/capabilities.ts';
import {createOperationKey} from '../openapi/capabilities.ts';

export type UnsupportedOperationResponse = {
  status: 501;
  json: {
    id: 'not_implemented';
    message: string;
    request_id?: string;
  };
};

export const toUnsupportedOperationResponse = (
  operation: CapabilityManifestEntry,
  requestId?: string
): UnsupportedOperationResponse => {
  if (operation.capability !== 'unsupported') {
    throw new Error(
      `operation is not classified as unsupported: ${createOperationKey(operation.method, operation.path)}`
    );
  }

  return {
    status: 501,
    json: {
      id: 'not_implemented',
      message: `${createOperationKey(operation.method, operation.path)} is not implemented by DigitalPuddle ${operation.releaseStage}.`,
      ...(requestId ? {request_id: requestId} : {})
    }
  };
};
