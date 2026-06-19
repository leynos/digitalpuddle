/** @file Compatibility tests for extracted REST handler module boundaries. */
import {describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import type {ExtendedSimulationStore} from '../src/store/index.ts';
import {createUserHandlers} from '../src/handlers/user.ts';
import type {SimulationHandler} from '../src/handlers/types.ts';

type UserRow = {
  readonly id?: unknown;
  readonly login: string;
  readonly email?: string;
  readonly name?: string;
  readonly organizations?: unknown;
};

type OrganizationRow = {
  readonly login: string;
  readonly url: string;
};

const createResponse = () => {
  const result = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      result.statusCode = code;
      return result;
    },
    json(body: unknown) {
      result.body = body;
      return result;
    }
  };

  return result;
};

const createRequest = (headers: ReadonlyMap<string, string> = new Map()) => ({
  get: (name: string) => headers.get(name),
  params: {},
  body: undefined
});

const createStore = (users: readonly UserRow[], organizations: readonly OrganizationRow[]): ExtendedSimulationStore =>
  ({
    store: {
      getState: () => ({})
    },
    schema: {
      users: {
        selectTableAsList: (_state: unknown) => users
      }
    },
    selectors: {
      allGithubOrganizations: (_state: unknown) => organizations
    }
  }) as unknown as ExtendedSimulationStore;

const invokeHandler = async (
  handler: SimulationHandler,
  request = createRequest(),
  response = createResponse()
): Promise<ReturnType<typeof createResponse>> => {
  await handler(
    {request: {params: {}}} as Parameters<SimulationHandler>[0],
    request as Parameters<SimulationHandler>[1],
    response as unknown as Parameters<SimulationHandler>[2],
    () => undefined,
    {} as Parameters<SimulationHandler>[4]
  );

  return response;
};

const requireHandler = (handlers: ReturnType<typeof createUserHandlers>, operationId: string): SimulationHandler => {
  const handler = handlers[operationId];
  if (!handler) {
    throw new Error(`Expected handler for ${operationId}`);
  }

  return handler;
};

describe('handler layout compatibility', () => {
  it('exports a user handler factory for REST route assembly', () => {
    expect(createUserHandlers).toEqual(expect.any(Function));
    const handlers = createUserHandlers(createStore([], []));

    expect(typeof handlers).toBe('object');
    expect(handlers).toEqual(
      expect.objectContaining({
        'users/get-authenticated': expect.any(Function),
        'orgs/list-memberships-for-authenticated-user': expect.any(Function)
      })
    );
  });

  it('returns the authenticated user payload from realistic store data', async () => {
    const handlers = createUserHandlers(
      createStore([{id: 123, login: 'dev', email: 'dev@example.test', name: 'Dev', organizations: []}], [])
    );
    const response = await invokeHandler(requireHandler(handlers, 'users/get-authenticated'));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      id: 123,
      login: 'dev',
      email: 'dev@example.test',
      name: 'Dev'
    });
  });

  it('filters memberships through normalized user organization data', async () => {
    const handlers = createUserHandlers(
      createStore(
        [{id: 123, login: 'dev', email: 'dev@example.test', name: 'Dev', organizations: ['lovely-org']}],
        [
          {login: 'lovely-org', url: 'https://api.example.test/orgs/lovely-org'},
          {login: 'other-org', url: 'https://api.example.test/orgs/other-org'}
        ]
      )
    );
    const response = await invokeHandler(
      requireHandler(handlers, 'orgs/list-memberships-for-authenticated-user'),
      createRequest(new Map([['x-simulacat-user', 'dev']]))
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        url: 'https://api.example.test/orgs/lovely-org/memberships/dev',
        organization_url: 'https://api.example.test/orgs/lovely-org',
        state: 'active',
        role: 'member',
        organization: expect.objectContaining({login: 'lovely-org'}),
        user: expect.objectContaining({login: 'dev'})
      })
    ]);
    expect(response.body).toMatchSnapshot();
  });

  it('normalizes malformed legacy user rows before field access', async () => {
    const originalConsoleError = console.error;
    const logs: string[] = [];
    console.error = (message?: unknown) => {
      logs.push(String(message));
    };

    try {
      const handlers = createUserHandlers(
        createStore([{login: 'legacy-user'}], [{login: 'lovely-org', url: 'https://api.example.test/orgs/lovely-org'}])
      );

      const userResponse = await invokeHandler(requireHandler(handlers, 'users/get-authenticated'));
      const membershipResponse = await invokeHandler(
        requireHandler(handlers, 'orgs/list-memberships-for-authenticated-user')
      );

      expect(userResponse.statusCode).toBe(200);
      expect(userResponse.body).toEqual(
        expect.objectContaining({
          id: 0,
          login: 'legacy-user'
        })
      );
      expect(membershipResponse.statusCode).toBe(200);
      expect(membershipResponse.body).toEqual([]);
      expect(logs.map((entry) => JSON.parse(entry))).toEqual([
        expect.objectContaining({
          event: 'digitalpuddle.rest.user.normalized',
          operationId: 'users/get-authenticated'
        }),
        expect.objectContaining({
          event: 'digitalpuddle.rest.user.normalized',
          operationId: 'orgs/list-memberships-for-authenticated-user'
        })
      ]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('safely serializes arbitrary malformed user id and organization values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record(
          {
            id: fc.anything(),
            login: fc.string({minLength: 1}),
            organizations: fc.anything()
          },
          {requiredKeys: ['login']}
        ),
        async (user) => {
          const originalConsoleError = console.error;
          console.error = () => undefined;

          try {
            const handlers = createUserHandlers(
              createStore([user], [{login: 'property-org', url: 'https://api.example.test/orgs/property-org'}])
            );

            const userResponse = await invokeHandler(requireHandler(handlers, 'users/get-authenticated'));
            const membershipResponse = await invokeHandler(
              requireHandler(handlers, 'orgs/list-memberships-for-authenticated-user')
            );

            expect(userResponse.statusCode).toBe(200);
            const body = userResponse.body as {id: unknown; login: unknown};
            expect(typeof body.id === 'number' && Number.isFinite(body.id)).toBe(true);
            expect(body.login).toBe(user.login);
            expect(membershipResponse.statusCode).toBe(200);
            expect(Array.isArray(membershipResponse.body)).toBe(true);
          } finally {
            console.error = originalConsoleError;
          }
        }
      ),
      {numRuns: 50, seed: 1337}
    );
  });
});
