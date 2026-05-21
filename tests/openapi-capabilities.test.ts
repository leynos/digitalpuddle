/** @file Unit and property tests for the DigitalPuddle capability policy. */
import {describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import {
  capabilityManifestEntrySchema,
  capabilitySchema,
  capabilityValues,
  createOperationKey,
  httpMethodValues,
  isSupportedCapability,
  requiresEnginePort,
  validateCapabilityManifest,
  v1CapabilityManifest,
  type CapabilityManifestEntry,
  type CapabilityManifestEntryInput,
  type HttpMethod
} from '../src/openapi/capabilities.ts';

const entryByOperationId = (operationId: string): CapabilityManifestEntry => {
  const entry = v1CapabilityManifest.find((candidate) => candidate.operationId === operationId);
  if (!entry) {
    throw new Error(`missing fixture operation: ${operationId}`);
  }
  return entry;
};

const pathSegment = fc
  .string({minLength: 1, maxLength: 12})
  .filter((value) => !value.includes('/') && value.trim().length > 0);

const minimalEntry = (overrides: Partial<CapabilityManifestEntryInput> = {}): CapabilityManifestEntryInput => ({
  operationId: 'test.operation',
  method: 'GET',
  path: '/v2/test-operation',
  capability: 'scriptable',
  releaseStage: 'test',
  productArea: 'Test',
  runtime: {
    behaviour: 'handler'
  },
  ...overrides
});

const expectEntryError = (entry: CapabilityManifestEntryInput, expectedMessage: string): void => {
  const result = capabilityManifestEntrySchema.safeParse(entry);

  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('expected capability manifest entry validation to fail');
  }
  expect(result.error.issues.map((issue) => issue.message)).toContain(expectedMessage);
};

describe('capability policy vocabulary', () => {
  it('accepts the four release capability literals', () => {
    expect(capabilityValues).toEqual(['scriptable', 'engine-backed', 'stubbed', 'unsupported']);

    for (const capability of capabilityValues) {
      expect(capabilitySchema.parse(capability)).toBe(capability);
    }
  });

  it('rejects unknown capability literals', () => {
    expect(capabilitySchema.safeParse('mocked')).toEqual(expect.objectContaining({success: false}));
  });

  it('is closed over the four documented values for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (candidate) => {
        const parsed = capabilitySchema.safeParse(candidate);
        expect(parsed.success).toBe(capabilityValues.includes(candidate as (typeof capabilityValues)[number]));
      })
    );
  });
});

describe('v1 capability manifest', () => {
  it('validates every seed entry with one operation key and one capability', () => {
    const parsedEntries = validateCapabilityManifest(v1CapabilityManifest);
    const keys = parsedEntries.map((entry) => createOperationKey(entry.method, entry.path));
    const methodPattern = new RegExp(`^(${httpMethodValues.join('|')})$`);

    expect(parsedEntries).toHaveLength(v1CapabilityManifest.length);
    expect(new Set(keys).size).toBe(parsedEntries.length);

    for (const entry of parsedEntries) {
      expect(entry.operationId).not.toHaveLength(0);
      expect(entry.method).toMatch(methodPattern);
      expect(entry.path).toStartWith('/v2');
      expect(capabilityValues).toContain(entry.capability);
    }
  });

  it('classifies the section 8.2 DOKS operations as planned', () => {
    expect(entryByOperationId('account.get').capability).toBe('scriptable');
    expect(entryByOperationId('kubernetes.getOptions').capability).toBe('stubbed');
    expect(entryByOperationId('kubernetes.createCluster').capability).toBe('engine-backed');
    expect(entryByOperationId('kubernetes.deleteCluster').capability).toBe('engine-backed');
    expect(entryByOperationId('kubernetes.getKubeconfig').capability).toBe('engine-backed');
    expect(entryByOperationId('kubernetes.listNodePools').capability).toBe('scriptable');
  });

  it('keeps ADR 0006 follow-on product areas unsupported', () => {
    expect(entryByOperationId('kubernetes.updateNodePool')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'node-pool scale operations'
      })
    );
    expect(entryByOperationId('droplets.list')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'Droplet slice'
      })
    );
    expect(entryByOperationId('spacesKeys.list')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'Spaces access-key control plane'
      })
    );
  });

  it('requires 501 metadata for unsupported entries', () => {
    const unsupportedEntries = v1CapabilityManifest.filter((entry) => entry.capability === 'unsupported');

    expect(unsupportedEntries.length).toBeGreaterThan(0);
    for (const entry of unsupportedEntries) {
      expect(entry.runtime).toEqual(expect.objectContaining({unsupportedResponseStatus: 501}));
    }
  });

  it('rejects unsupported entries without 501 response metadata', () => {
    expectEntryError(
      minimalEntry({
        capability: 'unsupported',
        runtime: {
          behaviour: 'not-implemented'
        }
      }),
      'unsupported operations must carry 501 response metadata'
    );
  });

  it('rejects supported entries with 501 response metadata', () => {
    expectEntryError(
      minimalEntry({
        capability: 'scriptable',
        runtime: {
          behaviour: 'handler',
          unsupportedResponseStatus: 501
        }
      }),
      'only unsupported operations may carry 501 response metadata'
    );
  });

  it('rejects supported entries with not-implemented runtime behaviour', () => {
    expectEntryError(
      minimalEntry({
        capability: 'scriptable',
        runtime: {
          behaviour: 'not-implemented'
        }
      }),
      'only unsupported operations may use not-implemented runtime behaviour'
    );
  });

  it('rejects engine-backed entries without worker orchestration', () => {
    expectEntryError(
      minimalEntry({
        capability: 'engine-backed',
        runtime: {
          behaviour: 'worker',
          enginePortRequired: true
        }
      }),
      'engine-backed operations must require worker-owned orchestration'
    );
  });

  it('rejects stubbed entries without deterministic fixture behaviour', () => {
    expectEntryError(
      minimalEntry({
        capability: 'stubbed',
        runtime: {
          behaviour: 'fixture'
        }
      }),
      'stubbed operations must identify deterministic fixture behaviour'
    );
  });

  it('rejects duplicate canonical operation keys', () => {
    const duplicate = {
      ...entryByOperationId('account.get'),
      operationId: 'account.getDuplicate',
      path: '/v2//account/'
    };

    expect(() => validateCapabilityManifest([...v1CapabilityManifest, duplicate])).toThrow(
      'duplicate capability operation key: GET /v2/account'
    );
  });

  it('identifies supported and engine-backed worker requirements', () => {
    expect(isSupportedCapability('scriptable')).toBe(true);
    expect(isSupportedCapability('engine-backed')).toBe(true);
    expect(isSupportedCapability('stubbed')).toBe(true);
    expect(isSupportedCapability('unsupported')).toBe(false);
    expect(requiresEnginePort(entryByOperationId('kubernetes.createCluster'))).toBe(true);
    expect(requiresEnginePort(entryByOperationId('account.get'))).toBe(false);
  });
});

describe('operation keys', () => {
  it('creates stable keys for equivalent method and path inputs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<HttpMethod>('DELETE', 'GET', 'PATCH', 'POST', 'PUT'),
        fc.array(pathSegment, {minLength: 1, maxLength: 5}),
        (method, segments) => {
          const path = `/v2/${segments.join('/')}`;
          const noisyPath = `/v2//${segments.join('//')}/`;
          expect(createOperationKey(method.toLowerCase(), noisyPath)).toBe(createOperationKey(method, path));
        }
      )
    );
  });
});
