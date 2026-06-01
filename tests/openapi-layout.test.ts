/** @file Compatibility tests for the OpenAPI contract metadata module. */
import {describe, expect, it} from 'bun:test';
import {buildCapabilityMatrix, createOperationKey, v1CapabilityManifest} from '../src/openapi/index.ts';

describe('OpenAPI layout compatibility', () => {
  it('exports operation-key helpers from the OpenAPI module boundary', () => {
    expect(createOperationKey('GET', '/v2/kubernetes/clusters')).toBe('GET /v2/kubernetes/clusters');
  });

  it('exports capability projections from the OpenAPI module boundary', () => {
    expect(buildCapabilityMatrix(v1CapabilityManifest)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'kubernetes.listClusters',
          capability: 'scriptable'
        })
      ])
    );
  });
});
