/** @file Integration tests for top-level router extension hooks. */
import {afterAll, beforeAll, describe, expect, it} from 'bun:test';
import express from 'express';
import {registerCapabilitiesRoute} from '../src/admin/routes.ts';
import {simulation} from '../src/index.ts';

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
          message: 'capability projection failed'
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
});
