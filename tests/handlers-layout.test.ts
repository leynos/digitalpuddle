/** @file Compatibility tests for extracted REST handler module boundaries. */
import {describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import {z} from 'zod';
import {jsonValueSchema, type JsonValue} from '../src/openapi/artifact.ts';
import type {ExtendedSimulationStore} from '../src/store/index.ts';
import {createUserHandlers} from '../src/handlers/user.ts';
import type {UserHandler, UserHandlerContext} from '../src/handlers/user.ts';

type UserRow = {
  readonly id?: unknown;
  readonly login: string;
  readonly email?: string;
  readonly name?: string;
  readonly organizations?: unknown;
};
type SimulationState = ReturnType<ExtendedSimulationStore['store']['getState']>;

type OrganizationRow = {
  readonly login: string;
  readonly url: string;
};

type TestResponse = {
  statusCode: number | undefined;
  body: JsonValue | undefined;
  status(code: number): TestResponse;
  json(body: JsonValue): TestResponse;
};

const normalizedUserResponseSchema = z.object({
  id: z.number(),
  login: z.string()
});
const malformedUserArbitrary = fc.record(
  {
    id: fc.anything(),
    login: fc.string({minLength: 1}),
    organizations: fc.anything()
  },
  {requiredKeys: ['login']}
);

const createResponse = (): TestResponse => {
  const result: TestResponse = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      result.statusCode = code;
      return result;
    },
    json(body: JsonValue) {
      result.body = jsonValueSchema.parse(body);
      return result;
    }
  };

  return result;
};

const createRequest = (headers: ReadonlyMap<string, string> = new Map()) => {
  function get(name: 'set-cookie'): string[] | undefined;
  function get(name: string): string | undefined;
  function get(name: string): string | string[] | undefined {
    const value = headers.get(name);
    if (value === undefined) {
      return undefined;
    }

    return name === 'set-cookie' ? [value] : value;
  }

  return {
    get,
    params: {},
    body: undefined
  };
};

const createStore = (users: readonly UserRow[], organizations: readonly OrganizationRow[]): ExtendedSimulationStore => {
  // SAFETY: The test handlers use only the store members present in this fixture.
  return {
    store: {
      getState: () => ({})
    },
    schema: {
      users: {
        selectTableAsList: (_state: SimulationState) => users
      }
    },
    selectors: {
      allGithubOrganizations: (_state: SimulationState) => organizations
    }
  } as ExtendedSimulationStore;
};

const invokeHandler = async (
  handler: UserHandler,
  request = createRequest(),
  response = createResponse()
): Promise<ReturnType<typeof createResponse>> => {
  // SAFETY: The user handlers do not inspect the simulator context.
  await handler({} as UserHandlerContext, request, response);

  return response;
};

const requireHandler = (
  handlers: ReturnType<typeof createUserHandlers>,
  operationId: keyof ReturnType<typeof createUserHandlers>
): UserHandler => {
  return handlers[operationId];
};

describe('handler layout compatibility', () => {
  it('exports a user handler factory for REST route assembly', () => {
    expect(createUserHandlers).toEqual(expect.any(Function));
    const handlers = createUserHandlers(createStore([], []));

    expect(handlers).toEqual(expect.any(Object));
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
    console.error = (message?: string) => {
      logs.push(message ?? '');
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

  it('logs authentication failures for empty user lookups', async () => {
    const originalConsoleError = console.error;
    const logs: string[] = [];
    console.error = (message?: string) => {
      logs.push(message ?? '');
    };

    try {
      const handlers = createUserHandlers(createStore([], []));

      const userResponse = await invokeHandler(requireHandler(handlers, 'users/get-authenticated'));

      expect(userResponse.statusCode).toBe(401);
      expect(logs.map((entry) => JSON.parse(entry))).toEqual([
        {
          event: 'digitalpuddle.rest.user.authentication_failed',
          operationId: 'users/get-authenticated',
          userCount: 0,
          reason: 'no-users-seeded'
        }
      ]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('logs authentication failures for requested users missing from memberships', async () => {
    const originalConsoleError = console.error;
    const logs: string[] = [];
    console.error = (message?: string) => {
      logs.push(message ?? '');
    };

    try {
      const handlers = createUserHandlers(createStore([{id: 123, login: 'dev', organizations: []}], []));

      const response = await invokeHandler(
        requireHandler(handlers, 'orgs/list-memberships-for-authenticated-user'),
        createRequest(new Map([['x-simulacat-user', 'other-dev']]))
      );

      expect(response.statusCode).toBe(401);
      expect(logs.map((entry) => JSON.parse(entry))).toEqual([
        {
          event: 'digitalpuddle.rest.user.authentication_failed',
          operationId: 'orgs/list-memberships-for-authenticated-user',
          userCount: 1,
          reason: 'requested-user-not-found'
        }
      ]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('safely serializes arbitrary malformed user id and organization values', async () => {
    await fc.assert(
      fc.asyncProperty(malformedUserArbitrary, async (user) => {
        const originalConsoleError = console.error;
        console.error = () => {};

        try {
          const handlers = createUserHandlers(
            createStore([user], [{login: 'property-org', url: 'https://api.example.test/orgs/property-org'}])
          );

          const userResponse = await invokeHandler(requireHandler(handlers, 'users/get-authenticated'));
          const membershipResponse = await invokeHandler(
            requireHandler(handlers, 'orgs/list-memberships-for-authenticated-user')
          );

          expect(userResponse.statusCode).toBe(200);
          const body = normalizedUserResponseSchema.parse(userResponse.body);
          expect(Number.isFinite(body.id)).toBe(true);
          expect(body.login).toBe(user.login);
          expect(membershipResponse.statusCode).toBe(200);
          expect(Array.isArray(membershipResponse.body)).toBe(true);
        } finally {
          console.error = originalConsoleError;
        }
      }),
      {numRuns: 50, seed: 1337}
    );
  });
});
