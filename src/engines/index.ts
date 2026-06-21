/**
 * @file Engine port interfaces for future DigitalOcean side-effect adapters.
 *
 * This module describes worker-owned engine capabilities without binding the
 * simulator to any concrete Kubernetes, Droplet, or Spaces implementation. The
 * worker runtime imports these contracts as ports so future side effects remain
 * behind adapters rather than leaking into route handlers.
 */

export type EngineCapability = 'kubernetes';

export type EngineDescriptor = {
  readonly name: string;
  readonly capability: EngineCapability;
};

export interface KubernetesEngine {
  readonly descriptor: EngineDescriptor;
}
