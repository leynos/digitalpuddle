/**
 * @file Admin-facing capability documentation API.
 *
 * This module creates a lazy cache for the capability documentation payload
 * served by the `/_digitalpuddle/capabilities` endpoint. The manifest is
 * immutable after startup, so the admin route can reuse this payload after the
 * first request instead of rebuilding it on every request.
 *
 * The module depends on `src/openapi/projections.ts` for the pure
 * `buildCapabilityDocumentationMetadata()` projection and exposes
 * `createCapabilitiesPayloadProvider()` plus the default `capabilitiesPayload()`
 * provider as its public API. `src/admin/routes.ts` consumes that function when
 * registering the private admin route, keeping admin routing independent of
 * projection details while still allowing the payload cache to report startup
 * failures through structured logs.
 */
import {buildCapabilityDocumentationMetadata} from '../openapi/projections.ts';
import type {CapabilityDocumentationMetadata} from '../openapi/projections.ts';

type CapabilitiesPayloadBuilder = () => CapabilityDocumentationMetadata;

const initialiseCapabilitiesPayload = (builder: CapabilitiesPayloadBuilder): CapabilityDocumentationMetadata => {
  try {
    const payload = builder();
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

export const createCapabilitiesPayloadProvider = (
  builder: CapabilitiesPayloadBuilder = buildCapabilityDocumentationMetadata
) => {
  let cachedPayload: CapabilityDocumentationMetadata | undefined;

  return () => {
    cachedPayload ??= initialiseCapabilitiesPayload(builder);
    return cachedPayload;
  };
};

export const capabilitiesPayload = createCapabilitiesPayloadProvider();
