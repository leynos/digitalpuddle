/** @file User and membership REST handlers for the transitional GitHub API. */
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';

import type {ExtendedSimulationStore} from '../store/index.ts';
import type {SimulationHandler} from './types.ts';

export const createUserHandlers = (simulationStore: ExtendedSimulationStore): SimulationHandlers => {
  const getState = () => simulationStore.store.getState();

  return {
    // GET /user
    'users/get-authenticated': async (
      _context: Parameters<SimulationHandler>[0],
      _request: Parameters<SimulationHandler>[1],
      response: Parameters<SimulationHandler>[2]
    ) => {
      const users = simulationStore.schema.users.selectTableAsList(getState());
      const user = users[0];
      if (!user) {
        return response.status(401).json({message: 'Authentication required'});
      }
      const data = {
        id: parseInt(user.id.toString(), 10) as number,
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
      const users = simulationStore.schema.users.selectTableAsList(getState());
      const requestedLogin = request.get('x-simulacat-user') ?? request.get('x-github-user');
      const user = requestedLogin ? users.find((candidate) => candidate.login === requestedLogin) : users[0];
      if (!user) {
        return response.status(401).json({message: 'Authentication required'});
      }
      const organizations = simulationStore.selectors.allGithubOrganizations(getState());
      const memberships = organizations
        .filter((organization) => user.organizations.includes(organization.login))
        .map((organization) => ({
          url: `${organization.url}/memberships/${user.login}`,
          state: 'active',
          organization,
          role: 'member',
          organization_url: organization.url,
          user
        }));
      return response.status(200).json(memberships);
    }
  };
};
