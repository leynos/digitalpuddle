/** @file Integration tests for top-level router extension hooks. */
import {afterAll, beforeAll, describe, expect, it} from 'bun:test';
import type {AddressInfo} from 'node:net';
import express from 'express';
import {createCapabilitiesPayloadProvider} from '../src/admin/capabilities.ts';
import {registerCapabilitiesRoute} from '../src/admin/routes.ts';
import {simulation} from '../src/index.ts';
import {buildCapabilityDocumentationMetadata} from '../src/openapi/projections.ts';
import type {GitHubExtendStoreInput} from '../src/store/index.ts';

type SimulationServer = Awaited<ReturnType<ReturnType<typeof simulation>['listen']>>;
type CapabilitiesRouter = Parameters<typeof registerCapabilitiesRoute>[0];

const basePort = 2999;
const host = 'http://localhost';
const url = `${host}:${basePort}`;

describe('router extension tests', () => {
  let server: SimulationServer;
  beforeAll(async () => {
    const app = simulation({
      initialState: {
        users: [],
        organizations: [{login: 'lovely-org'}],
        repositories: [{owner: 'lovely-org', name: 'awesome-repo'}],
        branches: [{owner: 'lovely-org', repo: 'awesome-repo', name: 'main'}],
        blobs: []
      },
      extend: {
        extendRouter: (router, _simulationStore) => {
          router.get('/hello-world', (_req, res) => {
            res.status(200).json({message: 'Hello from GitHub API simulator!'});
          });
        }
      }
    });
    server = await app.listen(basePort);
  });
  afterAll(async () => {
    await server.ensureClose();
  });

  it('allows extending the router', async () => {
    const res: Response = await fetch(`${url}/hello-world`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body).toEqual({message: 'Hello from GitHub API simulator!'});
  });

  it('exposes the private DigitalPuddle capability matrix', async () => {
    const res: Response = await fetch(`${url}/_digitalpuddle/capabilities`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body).toMatchSnapshot();
    expect(body.legend).toEqual(
      expect.objectContaining({
        scriptable: expect.any(String),
        'engine-backed': expect.any(String),
        stubbed: expect.any(String),
        unsupported: expect.any(String)
      })
    );
    expect(body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'kubernetes.createCluster',
          capability: 'engine-backed'
        }),
        expect.objectContaining({
          operationId: 'droplets.list',
          capability: 'unsupported',
          unsupported: {behaviour: 'not-implemented'}
        })
      ])
    );
  });

  it('returns a structured 500 when the capabilities payload cannot be built', async () => {
    const errorPort = basePort + 1;
    const app = express();
    const router: CapabilitiesRouter = express.Router();
    const originalConsoleError = console.error;
    const errorLogs: string[] = [];
    let errorServer: ReturnType<typeof app.listen> | undefined;

    registerCapabilitiesRoute(router, () => {
      throw new Error('capability projection failed');
    });
    app.use(router);

    console.error = (message?: unknown) => {
      errorLogs.push(String(message));
    };

    try {
      errorServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const listeningServer = app.listen(errorPort, () => {
          resolve(listeningServer);
        });
      });
      const res: Response = await fetch(`${host}:${errorPort}/_digitalpuddle/capabilities`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({
        id: 'internal_error',
        message: 'Failed to build capabilities payload.'
      });
      expect(errorLogs.map((entry) => JSON.parse(entry))).toEqual([
        {
          event: 'digitalpuddle.admin.capabilities.error',
          reason: 'payload-provider-failed'
        }
      ]);
    } finally {
      console.error = originalConsoleError;
      if (errorServer) {
        const serverToClose = errorServer;
        await new Promise<void>((resolve, reject) => {
          serverToClose.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    }
  });

  it('serves a consistent cached capability payload to concurrent requests', async () => {
    const app = express();
    const router: CapabilitiesRouter = express.Router();
    const originalConsoleInfo = console.info;
    let callCount = 0;
    let concurrentServer: ReturnType<typeof app.listen> | undefined;

    console.info = () => undefined;
    registerCapabilitiesRoute(
      router,
      createCapabilitiesPayloadProvider(() => {
        callCount += 1;
        return buildCapabilityDocumentationMetadata();
      })
    );
    app.use(router);

    try {
      concurrentServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const listeningServer = app.listen(0, () => {
          resolve(listeningServer);
        });
      });
      const address = concurrentServer.address() as AddressInfo;
      const concurrentUrl = `${host}:${address.port}/_digitalpuddle/capabilities`;

      const responses = await Promise.all(Array.from({length: 8}, () => fetch(concurrentUrl)));
      const bodies = await Promise.all(responses.map((response) => response.json()));

      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(callCount).toBe(1);
      expect(bodies).toEqual(bodies.map(() => bodies[0]));
    } finally {
      console.info = originalConsoleInfo;
      if (concurrentServer) {
        const serverToClose = concurrentServer;
        await new Promise<void>((resolve, reject) => {
          serverToClose.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    }
  });
});

describe('capabilities payload provider', () => {
  it('lazily builds and independently caches capability payloads', () => {
    const originalConsoleInfo = console.info;
    console.info = () => undefined;

    try {
      let firstCallCount = 0;
      const firstBuilder = () => {
        firstCallCount += 1;
        return buildCapabilityDocumentationMetadata();
      };

      const firstProvider = createCapabilitiesPayloadProvider(firstBuilder);

      expect(firstCallCount).toBe(0);

      const firstPayload = firstProvider();

      expect(firstCallCount).toBe(1);
      expect(firstProvider()).toBe(firstPayload);
      expect(firstCallCount).toBe(1);

      let secondCallCount = 0;
      const secondBuilder = () => {
        secondCallCount += 1;
        return buildCapabilityDocumentationMetadata();
      };

      const secondProvider = createCapabilitiesPayloadProvider(secondBuilder);

      expect(secondCallCount).toBe(0);

      const secondPayload = secondProvider();

      expect(secondCallCount).toBe(1);
      expect(secondPayload).not.toBe(firstPayload);
      expect(secondProvider()).toBe(secondPayload);
      expect(secondCallCount).toBe(1);
    } finally {
      console.info = originalConsoleInfo;
    }
  });
});

describe('simulation assembly observability', () => {
  const captureConsoleErrors = () => {
    const originalConsoleError = console.error;
    const lines: string[] = [];
    console.error = (message?: unknown) => {
      lines.push(String(message));
    };

    return {
      lines,
      restore: () => {
        console.error = originalConsoleError;
      }
    };
  };

  it('logs a bounded reason when initial state schema validation fails', () => {
    const captured = captureConsoleErrors();

    try {
      expect(() =>
        simulation({
          initialState: {
            users: [{login: '   ', organizations: []}],
            organizations: [],
            repositories: [],
            branches: [],
            blobs: []
          }
        })
      ).toThrow();

      expect(captured.lines.map((entry) => JSON.parse(entry))).toEqual([
        {
          event: 'digitalpuddle.simulation.assembly_failed',
          reason: 'schema-validation-failed'
        }
      ]);
    } finally {
      captured.restore();
    }
  });

  it('logs a bounded reason when store composition fails', () => {
    const captured = captureConsoleErrors();
    const extendStore = Object.defineProperty({} as GitHubExtendStoreInput, 'schema', {
      get() {
        throw new Error('schema extension unavailable');
      }
    });

    try {
      expect(() =>
        simulation({
          extend: {
            extendStore
          }
        })
      ).toThrow('schema extension unavailable');

      expect(captured.lines.map((entry) => JSON.parse(entry))).toEqual([
        {
          event: 'digitalpuddle.simulation.assembly_failed',
          reason: 'store-composition-failed'
        }
      ]);
    } finally {
      captured.restore();
    }
  });
});
