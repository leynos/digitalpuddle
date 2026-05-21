/** @file Compile-time tests for DigitalPuddle capability policy types. */
import type {UnsupportedOperationResponse} from '../src/handlers/unsupported.ts';
import type {Capability, CapabilityManifestEntry, HttpMethod} from '../src/openapi/capabilities.ts';

const scriptableCapability: Capability = 'scriptable';
const engineBackedCapability: Capability = 'engine-backed';
const stubbedCapability: Capability = 'stubbed';
const unsupportedCapability: Capability = 'unsupported';

void scriptableCapability;
void engineBackedCapability;
void stubbedCapability;
void unsupportedCapability;

// @ts-expect-error unknown release states are not part of the closed capability vocabulary.
const invalidCapability: Capability = 'mocked';
void invalidCapability;

declare const manifestEntry: CapabilityManifestEntry;

manifestEntry satisfies {
  operationId: string;
  method: HttpMethod;
  path: string;
  capability: Capability;
  releaseStage: string;
};

declare const unsupportedResponse: UnsupportedOperationResponse;

unsupportedResponse satisfies {
  status: 501;
  json: {
    id: 'not_implemented';
    message: string;
    request_id?: string;
  };
};
