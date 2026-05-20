/** @file Pure helpers for DigitalOcean-shaped unsupported operation responses. */
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
