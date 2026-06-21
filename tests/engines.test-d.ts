/** @file Compile-time tests for engine port contracts. */
import type {EngineCapability, EngineDescriptor, KubernetesEngine} from '../src/engines/index.ts';

const kubernetesCapability: EngineCapability = 'kubernetes';
void kubernetesCapability;

// @ts-expect-error unsupported engine capabilities must not enter the port vocabulary.
const unsupportedCapability: EngineCapability = 'droplet';
void unsupportedCapability;

declare const descriptor: EngineDescriptor;

descriptor satisfies {
  readonly name: string;
  readonly capability: EngineCapability;
};

declare const engine: KubernetesEngine;

engine satisfies {
  readonly descriptor: EngineDescriptor;
};
