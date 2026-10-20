/**
 * @file Root GraphQL resolvers backed by the simulation store.
 *
 * This module binds generated `Resolvers` types to the in-memory simulation
 * store, using `applyRelayPagination`, `toGraphql`, and `deriveOwner` to serve
 * GraphQL queries.
 */
import type {Resolvers} from '../__generated__/resolvers-types.ts';
import {toGraphql, deriveOwner} from './to-graphql.ts';
import {assert} from 'assert-ts';
import type {ExtendedSimulationStore} from '../store/index.ts';

/**
 * Creates the root resolver map for the simulated GitHub GraphQL API.
 *
 * @example
 * ```ts
 * const resolvers = createResolvers(simulationStore);
 * ```
 */
export function createResolvers(simulationStore: ExtendedSimulationStore): Resolvers {
  const resolverMap = {
    Query: {
      viewer() {
        const [user] = simulationStore.schema.users.selectTableAsList(simulationStore.store.getState());
        assert(!!user, `no logged in user`);
        return toGraphql(simulationStore, 'User', user);
      },
      user<T>(_parent: T, {login}: {login: string}) {
        const user = simulationStore.schema.users
          .selectTableAsList(simulationStore.store.getState())
          .find((u) => u.login === login);
        assert(!!user, `no user found for ${login}`);
        return toGraphql(simulationStore, 'User', user);
      },
      organization<T>(_parent: T, {login}: {login: string}) {
        const orgs = simulationStore.schema.organizations.selectTableAsList(simulationStore.store.getState());
        const org = orgs.find((candidate) => candidate.login === login);
        assert(!!org, `no organization found for ${login}`);
        return toGraphql(simulationStore, 'Organization', org);
      },
      repository<T>(_root: T, {owner, name}: {owner: string; name: string}) {
        const repo = simulationStore.schema.repositories
          .selectTableAsList(simulationStore.store.getState())
          .find(
            (r) =>
              r.name.toLowerCase() === name.toLowerCase() &&
              r.full_name.toLowerCase() === `${owner}/${name}`.toLowerCase()
          );
        assert(!!repo, `no repository found for ${name}`);
        return toGraphql(simulationStore, 'Repository', repo);
      },
      repositoryOwner<T>(_root: T, {login}: {login: string}) {
        return deriveOwner(simulationStore, login);
      }
    }
  } satisfies Resolvers;
  return resolverMap;
}
