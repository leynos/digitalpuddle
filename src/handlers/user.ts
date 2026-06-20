/**
 * @file User and membership REST handlers for the transitional GitHub API.
 *
 * This module extracts the authenticated-user handler group from the inherited
 * REST adapter while DigitalPuddle still carries GitHub compatibility
 * scaffolding. It normalizes malformed legacy rows before serialization,
 * delegates membership response shape construction to a serializer, and returns
 * handlers for composition by `src/rest/index.ts`.
 */
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';

import {normalizeUser, serializeMembershipResponse, shouldNormalizeUser, userAnomalyDetails} from '../domain/user.ts';
import type {AuthenticatedUser, RawAuthenticatedUser} from '../domain/user.ts';
import type {ExtendedSimulationStore} from '../store/index.ts';
import type {SimulationHandler} from './types.ts';

export {serializeMembershipResponse} from '../domain/user.ts';

type AuthenticationFailureDetails = {
  readonly operationId: string;
  readonly requestedLogin?: string;
  readonly userCount: number;
  readonly reason: 'no-users-seeded' | 'requested-user-not-found';
};

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

export const createUserHandlers = (simulationStore: ExtendedSimulationStore): SimulationHandlers => {
  const getState = () => simulationStore.store.getState();
  const getUsers = (operationId: string) =>
    simulationStore.schema.users.selectTableAsList(getState()).map((user) => {
      const rawUser = user as AuthenticatedUser | RawAuthenticatedUser;
      if (shouldNormalizeUser(rawUser)) {
        logUserNormalization(operationId, rawUser);
      }
      return normalizeUser(rawUser);
    });

  return {
    // GET /user
    'users/get-authenticated': async (
      _context: Parameters<SimulationHandler>[0],
      _request: Parameters<SimulationHandler>[1],
      response: Parameters<SimulationHandler>[2]
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
        return response.status(401).json({message: 'Authentication required'});
      }
      const data = {
        id: user.id,
        login: user.login,
        email: user.email,
        name: user.name
      };
      response.status(200).json(data);
    },

    // GET /user/memberships/orgs
    'orgs/list-memberships-for-authenticated-user': async (
      _context: Parameters<SimulationHandler>[0],
      request: Parameters<SimulationHandler>[1],
      response: Parameters<SimulationHandler>[2]
    ) => {
      const operationId = 'orgs/list-memberships-for-authenticated-user';
      const users = getUsers(operationId);
      const requestedLogin = request.get('x-simulacat-user') ?? request.get('x-github-user');
      const user = requestedLogin ? users.find((candidate) => candidate.login === requestedLogin) : users[0];
      if (!user) {
        logAuthenticationFailure({
          operationId,
          userCount: users.length,
          reason: requestedLogin ? 'requested-user-not-found' : 'no-users-seeded',
          ...(requestedLogin ? {requestedLogin} : {})
        });
        return response.status(401).json({message: 'Authentication required'});
      }
      const membershipOrganizationLogins = new Set(user.organizations);
      const organizations = simulationStore.selectors.allGithubOrganizations(getState());
      const memberships = organizations
        .filter((organization) => membershipOrganizationLogins.has(organization.login))
        .map((organization) => serializeMembershipResponse({state: 'active', role: 'member'}, organization, user));
      return response.status(200).json(memberships);
    }
  };
};
