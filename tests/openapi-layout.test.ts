/** @file Compatibility tests for the OpenAPI contract metadata module. */
import {describe, expect, it} from 'bun:test';
import type {EngineCapability, EngineDescriptor} from '../src/engines/index.ts';
import {buildCapabilityMatrix, createOperationKey, v1CapabilityManifest} from '../src/openapi/index.ts';

type AssertEqual<T, U> = T extends U ? (U extends T ? true : never) : never;

const engineCapabilityIsExact: AssertEqual<EngineCapability, 'kubernetes'> = true;
const engineDescriptorShapeIsExact: AssertEqual<
  EngineDescriptor,
  {readonly name: string; readonly capability: EngineCapability}
> = true;

void engineCapabilityIsExact;
void engineDescriptorShapeIsExact;

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

  it('snapshots the full v1 capability matrix shape', () => {
    const result = buildCapabilityMatrix(v1CapabilityManifest);

    expect(result).toHaveLength(v1CapabilityManifest.length);
    expect(result.every((row) => row.releaseStage === 'v1')).toBe(true);
    expect(result.map((row) => row.operationKey)).toEqual(
      result.map((row) => createOperationKey(row.method, row.path))
    );
    expect(new Set(result.map((row) => row.operationKey)).size).toBe(result.length);
    for (const row of result) {
      expect(row).toEqual(
        expect.objectContaining({
          operationId: expect.any(String),
          operationKey: expect.any(String),
          method: expect.any(String),
          path: expect.stringMatching(/^\/v2/),
          capability: expect.any(String),
          productArea: expect.any(String),
          runtimeBehaviour: expect.any(String),
          exposeInDocs: expect.any(Boolean)
        })
      );
    }
    const unsupportedRows = result.filter((row) => row.capability === 'unsupported');
    expect(unsupportedRows.every((row) => row.runtimeBehaviour === 'not-implemented')).toBe(true);
    expect(unsupportedRows.every((row) => row.unsupported?.behaviour === 'not-implemented')).toBe(true);
    expect(result).toMatchSnapshot();
  });
});
