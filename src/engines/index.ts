/** @file Engine port interfaces for future DigitalOcean side-effect adapters. */

export type EngineCapability = 'kubernetes';

export type EngineDescriptor = {
  readonly name: string;
  readonly capability: EngineCapability;
};

export interface KubernetesEngine {
  readonly descriptor: EngineDescriptor;
}
