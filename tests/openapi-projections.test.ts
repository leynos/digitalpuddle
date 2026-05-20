/** @file Behavioural tests for capability matrix and unsupported response projections. */
import {describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import {toUnsupportedOperationResponse} from '../src/handlers/unsupported.ts';
import {createOperationKey, v1CapabilityManifest} from '../src/openapi/capabilities.ts';
import {
  buildCapabilityDocumentationMetadata,
  buildCapabilityMatrix,
  buildUnsupportedOperationLookup,
  getKnownCapabilityValues
} from '../src/openapi/projections.ts';

const rowByOperationId = (operationId: string) => {
  const row = buildCapabilityMatrix().find((candidate) => candidate.operationId === operationId);
  if (!row) {
    throw new Error(`missing matrix row: ${operationId}`);
  }
  return row;
};

const unsupportedEntryByOperationId = (operationId: string) => {
  const entry = v1CapabilityManifest.find((candidate) => candidate.operationId === operationId);
  if (!entry || entry.capability !== 'unsupported') {
    throw new Error(`missing unsupported fixture operation: ${operationId}`);
  }
  return entry;
};

describe('capability matrix projection', () => {
  it('projects each manifest entry exactly once', () => {
    const matrix = buildCapabilityMatrix();
    const operationKeys = matrix.map((row) => row.operationKey);

    expect(matrix).toHaveLength(v1CapabilityManifest.length);
    expect(new Set(operationKeys).size).toBe(matrix.length);
  });

  it('includes the v1 supported DOKS routes and metadata', () => {
    const createClusterRow = rowByOperationId('kubernetes.createCluster');

    expect(createClusterRow).toEqual(
      expect.objectContaining({
        operationKey: 'POST /v2/kubernetes/clusters',
        capability: 'engine-backed',
        runtimeBehaviour: 'worker'
      })
    );
    expect(createClusterRow).not.toHaveProperty('unsupported');

    expect(rowByOperationId('kubernetes.getOptions')).toEqual(
      expect.objectContaining({
        capability: 'stubbed',
        runtimeBehaviour: 'fixture'
      })
    );
  });

  it('includes follow-on unsupported product areas from ADR 0006', () => {
    expect(rowByOperationId('kubernetes.updateNodePool')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'node-pool scale operations',
        unsupported: {status: 501}
      })
    );
    expect(rowByOperationId('droplets.list')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'Droplet slice',
        unsupported: {status: 501}
      })
    );
    expect(rowByOperationId('spacesKeys.list')).toEqual(
      expect.objectContaining({
        capability: 'unsupported',
        followOnPhase: 'Spaces access-key control plane',
        unsupported: {status: 501}
      })
    );
  });

  it('keeps documentation metadata visible and labelled', () => {
    const docs = buildCapabilityDocumentationMetadata();

    expect(Object.keys(docs.legend).sort()).toEqual([...getKnownCapabilityValues()].sort());
    expect(docs.rows.every((row) => row.exposeInDocs)).toBe(true);
    expect(docs.rows.some((row) => row.operationId === 'digitalocean.unsupported')).toBe(false);
  });

  it('produces byte-identical JSON for any manifest ordering', () => {
    const expectedJson = JSON.stringify(buildCapabilityMatrix(v1CapabilityManifest));

    fc.assert(
      fc.property(fc.shuffledSubarray(v1CapabilityManifest, {minLength: v1CapabilityManifest.length}), (entries) => {
        expect(JSON.stringify(buildCapabilityMatrix(entries))).toBe(expectedJson);
      })
    );
  });
});

describe('unsupported operation projection', () => {
  it('builds lookup data only for unsupported operations', () => {
    const lookup = buildUnsupportedOperationLookup();
    const unsupportedEntries = v1CapabilityManifest.filter((entry) => entry.capability === 'unsupported');

    expect(lookup.size).toBe(unsupportedEntries.length);
    for (const entry of unsupportedEntries) {
      expect(lookup.get(createOperationKey(entry.method, entry.path))).toEqual(entry);
    }
  });

  it('maps a classified unsupported operation to a DigitalOcean-shaped 501 envelope', () => {
    const response = toUnsupportedOperationResponse(unsupportedEntryByOperationId('droplets.list'), 'req-123');

    expect(response).toEqual({
      status: 501,
      json: {
        id: 'not_implemented',
        message: 'GET /v2/droplets is not implemented by DigitalPuddle v1.',
        request_id: 'req-123'
      }
    });
  });

  it('rejects supported operations when creating unsupported responses', () => {
    const supportedEntry = v1CapabilityManifest.find((entry) => entry.operationId === 'account.get');
    if (!supportedEntry) {
      throw new Error('missing account.get fixture operation');
    }

    expect(() => toUnsupportedOperationResponse(supportedEntry)).toThrow(
      'operation is not classified as unsupported: GET /v2/account'
    );
  });
});
