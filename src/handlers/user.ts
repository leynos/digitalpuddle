/** @file User and membership REST handlers for the transitional GitHub API. */
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';

import type {ExtendedSimulationStore} from '../store/index.ts';
import type {SimulationHandler} from './types.ts';

type AuthenticatedUser = ReturnType<ExtendedSimulationStore['schema']['users']['selectTableAsList']>[number];
type MembershipOrganization = ReturnType<ExtendedSimulationStore['selectors']['allGithubOrganizations']>[number];

type MembershipProjection = {
  readonly role: 'member';
  readonly state: 'active';
};

type RawAuthenticatedUser = Partial<AuthenticatedUser> & {
  readonly login: string;
};

const fallbackUserId = 0;

const userAnomalyDetails = (user: RawAuthenticatedUser) => ({
  login: user.login,
  hasNumericId: typeof user.id === 'number' && Number.isFinite(user.id),
  hasOrganizations: Array.isArray(user.organizations)
});

const logUserNormalization = (operationId: string, user: RawAuthenticatedUser) => {
  console.error(
    JSON.stringify({
      event: 'digitalpuddle.rest.user.normalized',
      operationId,
      user: userAnomalyDetails(user)
    })
  );
};

const normalizeUser = (operationId: string, user: AuthenticatedUser | RawAuthenticatedUser): AuthenticatedUser => {
  const hasNumericId = typeof user.id === 'number' && Number.isFinite(user.id);
  const hasOrganizations = Array.isArray(user.organizations);

  if (!hasNumericId || !hasOrganizations) {
    logUserNormalization(operationId, user);
  }

  return {
    ...user,
    id: hasNumericId ? user.id : fallbackUserId,
    organizations: hasOrganizations ? user.organizations : []
  } as AuthenticatedUser;
};

export const serializeMembershipResponse = (
  membership: MembershipProjection,
  organization: MembershipOrganization,
  user: AuthenticatedUser
) => ({
  url: `${organization.url}/memberships/${user.login}`,
  organization_url: organization.url,
  state: membership.state,
  role: membership.role,
  organization,
  user
});

export const createUserHandlers = (simulationStore: ExtendedSimulationStore): SimulationHandlers => {
  const getState = () => simulationStore.store.getState();
  const getUsers = (operationId: string) =>
    simulationStore.schema.users
      .selectTableAsList(getState())
      .map((user) => normalizeUser(operationId, user as AuthenticatedUser | RawAuthenticatedUser));

  return {
    // GET /user
    'users/get-authenticated': async (
      _context: Parameters<SimulationHandler>[0],
      _request: Parameters<SimulationHandler>[1],
      response: Parameters<SimulationHandler>[2]
    ) => {
      const users = getUsers('users/get-authenticated');
      const user = users[0];
      if (!user) {
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
      const users = getUsers('orgs/list-memberships-for-authenticated-user');
      const requestedLogin = request.get('x-simulacat-user') ?? request.get('x-github-user');
      const user = requestedLogin ? users.find((candidate) => candidate.login === requestedLogin) : users[0];
      if (!user) {
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
