/**
 * @file User and membership REST handlers for the transitional GitHub API.
 *
 * This module extracts the authenticated-user handler group from the inherited
 * REST adapter while DigitalPuddle still carries GitHub compatibility
 * scaffolding. It normalizes malformed legacy rows before serialization,
 * delegates membership response shape construction to a serializer, and returns
 * handlers for composition by `src/rest/index.ts`.
 */
import {normalizeUser, serializeMembershipResponse, shouldNormalizeUser, userAnomalyDetails} from '../domain/user.ts';
import type {RawAuthenticatedUser} from '../domain/user.ts';
import {jsonValueSchema, type JsonValue} from '../openapi/artifact.ts';
import type {ExtendedSimulationStore} from '../store/index.ts';
import type {SimulationHandler} from './types.ts';

export {serializeMembershipResponse} from '../domain/user.ts';

export type UserHandlerRequest = Pick<Parameters<SimulationHandler>[1], 'get'>;
export type UserHandlerContext = Parameters<SimulationHandler>[0];

export type UserHandlerResponse = {
  status(code: number): UserHandlerResponse;
  json(body: JsonValue): UserHandlerResponse;
};

export type UserHandler = (
  context: UserHandlerContext,
  request: UserHandlerRequest,
  response: UserHandlerResponse
) => Promise<void>;

type UserHandlers = {
  'users/get-authenticated': UserHandler;
  'orgs/list-memberships-for-authenticated-user': UserHandler;
};

type AuthenticationFailureDetails = {
  readonly operationId: string;
  readonly userCount: number;
  readonly reason: 'no-users-seeded' | 'requested-user-not-found';
};
type UserResponseBody = {id: number; login: string; email?: string; name?: string};

const logUserNormalization = (operationId: string, user: RawAuthenticatedUser) => {
  console.error(
    JSON.stringify({
      event: 'digitalpuddle.rest.user.normalized',
      operationId,
      user: userAnomalyDetails(user)
    })
  );
};

const logAuthenticationFailure = (details: AuthenticationFailureDetails) => {
  console.error(
    JSON.stringify({
      event: 'digitalpuddle.rest.user.authentication_failed',
      ...details
    })
  );
};

export const createUserHandlers = (simulationStore: ExtendedSimulationStore): UserHandlers => {
  const getState = () => simulationStore.store.getState();
  const getUsers = (operationId: string) =>
    simulationStore.schema.users.selectTableAsList(getState()).map((storedUser) => {
      const user: RawAuthenticatedUser = storedUser;
      if (shouldNormalizeUser(user)) {
        logUserNormalization(operationId, user);
      }
      return normalizeUser(user);
    });

  return {
    // GET /user
    'users/get-authenticated': async (
      _context: UserHandlerContext,
      _request: UserHandlerRequest,
      response: UserHandlerResponse
    ) => {
      const operationId = 'users/get-authenticated';
      const users = getUsers(operationId);
      const user = users[0];
      if (!user) {
        logAuthenticationFailure({
          operationId,
          userCount: users.length,
          reason: 'no-users-seeded'
        });
        response.status(401).json({message: 'Authentication required'});
        return;
      }
      const data: UserResponseBody = {
        id: user.id,
        login: user.login
      };
      if (user.email !== undefined) {
        data.email = user.email;
      }
      if (user.name !== undefined) {
        data.name = user.name;
      }
      response.status(200).json(jsonValueSchema.parse(data));
    },

    // GET /user/memberships/orgs
    'orgs/list-memberships-for-authenticated-user': async (
      _context: UserHandlerContext,
      request: UserHandlerRequest,
      response: UserHandlerResponse
    ) => {
      const operationId = 'orgs/list-memberships-for-authenticated-user';
      const users = getUsers(operationId);
      const requestedLogin = request.get('x-simulacat-user') ?? request.get('x-github-user');
      const user = requestedLogin ? users.find((candidate) => candidate.login === requestedLogin) : users[0];
      if (!user) {
        logAuthenticationFailure({
          operationId,
          userCount: users.length,
          reason: requestedLogin ? 'requested-user-not-found' : 'no-users-seeded'
        });
        response.status(401).json({message: 'Authentication required'});
        return;
      }
      const membershipOrganizationLogins = new Set(user.organizations);
      const organizations = simulationStore.selectors.allGithubOrganizations(getState());
      const memberships = organizations
        .filter((organization) => membershipOrganizationLogins.has(organization.login))
        .map((organization) => serializeMembershipResponse({state: 'active', role: 'member'}, organization, user));
      response.status(200).json(jsonValueSchema.parse(memberships));
    }
  };
};
