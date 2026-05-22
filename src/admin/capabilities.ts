/**
 * @file Admin-facing capability documentation API.
 *
 * This module initialises and caches the capability documentation payload
 * served by the `/_digitalpuddle/capabilities` endpoint. The manifest is
 * immutable after startup, so the admin route can reuse this payload instead
 * of rebuilding it on every request.
 *
 * The module depends on `src/openapi/projections.ts` for the pure
 * `buildCapabilityDocumentationMetadata()` projection and exposes
 * `capabilitiesPayload()` as its public API. `src/extend-api.ts` consumes that
 * function when registering the private admin route, keeping the route layer
 * independent of projection details while still allowing the payload cache to
 * report startup failures through structured logs.
 */
import {buildCapabilityDocumentationMetadata} from '../openapi/projections.ts';
import type {CapabilityDocumentationMetadata} from '../openapi/projections.ts';

const initialiseCapabilitiesPayload = (): CapabilityDocumentationMetadata => {
  try {
    const payload = buildCapabilityDocumentationMetadata();
    console.info(
      JSON.stringify({
        event: 'digitalpuddle.admin.capabilities.cached',
        rowCount: payload.rows.length
      })
    );
    return payload;
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'digitalpuddle.admin.capabilities.cache_error',
        message: error instanceof Error ? error.message : String(error)
      })
    );
    throw new Error('Failed to initialise DigitalPuddle capabilities payload.', {cause: error});
  }
};

const cachedPayload = initialiseCapabilitiesPayload();

export const capabilitiesPayload = () => cachedPayload;
