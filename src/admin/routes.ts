/** @file Private DigitalPuddle admin route registration. */
import type {createFoundationSimulationServer} from '@simulacrum/foundation-simulator';

import type {ExtendedSimulationStore} from '../store/index.ts';
import {capabilitiesPayload} from './capabilities.ts';

export type FoundationExtendRouter = NonNullable<
  Parameters<typeof createFoundationSimulationServer>[0]['extendRouter']
>;
export type FoundationRouter = Parameters<FoundationExtendRouter>[0];
export type DigitalPuddleAdminRouter = (router: FoundationRouter, simulationStore: ExtendedSimulationStore) => void;
type CapabilitiesPayloadProvider = typeof capabilitiesPayload;

export const registerCapabilitiesRoute = (
  router: FoundationRouter,
  payloadProvider: CapabilitiesPayloadProvider = capabilitiesPayload
) => {
  router.get('/_digitalpuddle/capabilities', (_request, response) => {
    try {
      response.status(200).json(payloadProvider());
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'digitalpuddle.admin.capabilities.error',
          message: error instanceof Error ? error.message : String(error)
        })
      );
      response.status(500).json({
        id: 'internal_error',
        message: 'Failed to build capabilities payload.'
      });
    }
  });
};

export const extendDigitalPuddleAdminRoutes: DigitalPuddleAdminRouter = (router, _simulationStore) => {
  registerCapabilitiesRoute(router);
};
