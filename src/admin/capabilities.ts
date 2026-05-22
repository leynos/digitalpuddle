/**
 * @file Admin-facing capability documentation API.
 *
 * This module initialises and caches the capability documentation payload
 * served by the `/_digitalpuddle/capabilities` endpoint. The manifest is
 * immutable after startup, so the admin route can reuse this payload instead
 * of rebuilding it on every request.
 */
import {buildCapabilityDocumentationMetadata} from '../openapi/projections.ts';

const cachedPayload = buildCapabilityDocumentationMetadata();

export const capabilitiesPayload = () => cachedPayload;
