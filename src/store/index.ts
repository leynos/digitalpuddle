/** @file Store schema, selectors, and extension wiring for GitHub fixtures. */
import type {
  SimulationStore,
  ExtendSimulationSchema,
  ExtendSimulationSchemaInput,
  ExtendSimulationActions,
  ExtendSimulationActionsInput,
  ExtendSimulationSelectors,
  ExtendSimulationSelectorsInput,
  AnyState,
  ExtendSimulationActionsInputLoose,
  ExtendSimulationSelectorsInputLoose,
  ExtendStoreConfig
} from '@simulacrum/foundation-simulator';
import {
  convertInitialStateToStoreState,
  type GitHubStore,
  type GitHubBlob,
  type GitHubOrganization,
  type GitHubRepository,
  type GitHubUser,
  type GitHubBranch,
  type GitHubAppInstallation
} from './entities.ts';

type ExtendedSchema = ReturnType<typeof inputSchema>;
type ExtendSelectors = typeof inputSelectors;

// Concrete, exported types for downstream consumers to import and use
// when they need to reference the GitHub package's store generics.
export type GitHubSchema = ReturnType<ExtendedSchema>;
export type GitHubActions = object;
export type GitHubSelectors = ReturnType<ExtendSelectors>;

export type ExtendedSimulationStore = SimulationStore<GitHubSchema, GitHubActions, GitHubSelectors>;

// Public type for consumers of this package to declare the shape of an
// `extendStore` argument. This wires the foundation `ExtendStoreConfig`
// generics to the concrete GitHub schema/actions/selectors types so callers
// get accurate typing when they provide schema/actions/selectors extensions.
export type GitHubExtendStoreInput = ExtendStoreConfig<GitHubSchema, GitHubActions, GitHubSelectors>;

export type GitHubOrganizationWithRepositories = GitHubOrganization & {
  repositories: GitHubRepository[];
};

export type GitHubAppInstallationWithAccount = Omit<GitHubAppInstallation, 'account'> & {
  account: GitHubOrganization;
  target_id?: GitHubOrganization['id'];
  target_type?: GitHubOrganization['type'];
};

export type GitHubRepoOwner = Omit<GitHubOrganization, 'name' | 'email'> & {
  id: number;
};

export type GitHubRepositoryWithOrganizationOwner = Omit<GitHubRepository, 'id' | 'owner'> & {
  id: number;
  owner: GitHubRepoOwner | string | null;
};

/** Creates the base store schema and seeds it from parsed initial state. */
const inputSchema =
  <T>(initialState?: GitHubStore, extendedSchema?: ExtendSimulationSchemaInput<T>) =>
  ({slice}: ExtendSimulationSchema) => {
    const storeInitialState = convertInitialStateToStoreState(initialState);
    const extended = extendedSchema ? extendedSchema({slice}) : {};
    const slices = {
      users: slice.table<GitHubUser>(storeInitialState ? {initialState: storeInitialState.users} : {}),
      installations: slice.table<GitHubAppInstallation>(
        storeInitialState ? {initialState: storeInitialState.installations} : {}
      ),
      repositories: slice.table<GitHubRepository>(
        storeInitialState ? {initialState: storeInitialState.repositories} : {}
      ),
      branches: slice.table<GitHubBranch>(storeInitialState ? {initialState: storeInitialState.branches} : {}),
      organizations: slice.table<GitHubOrganization>(
        storeInitialState ? {initialState: storeInitialState.organizations} : {}
      ),
      blobs: slice.table<GitHubBlob>(storeInitialState ? {initialState: storeInitialState.blobs} : {}),
      ...extended
    };
    return slices;
  };

/** Returns the package's built-in action set before caller extensions. */
const inputActions = (_args: ExtendSimulationActions<ExtendedSchema>) => ({}) satisfies GitHubActions;

/** Merges built-in actions with caller-provided extensions. */
const extendActions =
  (extendedActions?: ExtendSimulationActionsInputLoose<GitHubActions, GitHubSchema>) =>
  (args: ExtendSimulationActions<ExtendedSchema>) => {
    const base = inputActions(args);
    if (!extendedActions) return base;
    const extResult = extendedActions(args);
    return {
      ...base,
      ...extResult
    };
  };

/** Creates the built-in selector suite used by REST and GraphQL handlers. */
const inputSelectors = ({createSelector, schema}: ExtendSimulationSelectors<ExtendedSchema>) => {
  const allGithubOrganizations: (state: AnyState) => GitHubOrganizationWithRepositories[] = createSelector(
    schema.organizations.selectTableAsList,
    schema.repositories.selectTableAsList,
    (ghOrgs, repos) => {
      return ghOrgs.map((ghOrg) => {
        const repositories = repos.filter((r) => r.owner === ghOrg.login);
        return {...ghOrg, repositories};
      });
    }
  );

  const getAppInstallation: (
    state: AnyState,
    org: string,
    repo?: string
  ) => GitHubAppInstallationWithAccount | undefined = createSelector(
    schema.installations.selectTableAsList,
    schema.organizations.selectTableAsList,
    schema.repositories.selectTableAsList,
    (_state: AnyState, org: string, _repo?: string) => org,
    (_state: AnyState, _org: string, repo?: string) => repo,
    (installations, orgs, repos, org, repo) => {
      const appInstall = installations.find((install) => install.account === org);
      if (!appInstall) return;
      let account;
      if (repo) {
        const repoData = repos.find((r) => r.owner === appInstall.account && r.name === repo);
        if (repoData) account = orgs.find((o) => o.login === repoData.owner);
      } else {
        account = orgs.find((o) => o.login === appInstall.account);
      }
      if (!account) return;
      return {
        ...appInstall,
        account: {...account},
        target_id: account.id,
        target_type: account.type
      };
    }
  );

  const allReposWithOrgs: (state: AnyState, org?: string) => GitHubRepositoryWithOrganizationOwner[] | undefined =
    createSelector(
      schema.repositories.selectTableAsList,
      schema.organizations.selectTable,
      (_: AnyState, org?: string) => org,
      (allRepos, orgMap, org) => {
        if (org && !orgMap[org]) return;
        const repos = org ? allRepos.filter((r) => r.owner === org) : allRepos;
        return repos.map((repo) => {
          const ownerOrg = orgMap[repo.owner];
          const owner: GitHubRepositoryWithOrganizationOwner['owner'] = ownerOrg
            ? {
                id: Number(ownerOrg.id),
                login: ownerOrg.login,
                node_id: ownerOrg.node_id,
                type: ownerOrg.type,
                description: ownerOrg.description,
                created_at: ownerOrg.created_at,
                teams: ownerOrg.teams,
                avatar_url: ownerOrg.avatar_url,
                gravatar_id: ownerOrg.gravatar_id,
                site_admin: ownerOrg.site_admin,
                url: ownerOrg.url,
                html_url: ownerOrg.html_url,
                followers_url: ownerOrg.followers_url,
                following_url: ownerOrg.following_url,
                gists_url: ownerOrg.gists_url,
                starred_url: ownerOrg.starred_url,
                subscriptions_url: ownerOrg.subscriptions_url,
                organizations_url: ownerOrg.organizations_url,
                repos_url: ownerOrg.repos_url,
                events_url: ownerOrg.events_url,
                received_events_url: ownerOrg.received_events_url,
                hooks_url: ownerOrg.hooks_url,
                issues_url: ownerOrg.issues_url,
                members_url: ownerOrg.members_url,
                public_members_url: ownerOrg.public_members_url
              }
            : repo.owner;

          return {...repo, id: Number(repo.id), owner};
        });
      }
    );

  const getBlob: (state: AnyState, owner: string, repo: string, sha_or_path: string) => GitHubBlob | undefined =
    createSelector(
      schema.blobs.selectTableAsList,
      (_state: AnyState, owner: string) => owner,
      (_state: AnyState, _owner: string, repo: string) => repo,
      (_state: AnyState, _owner: string, _repo: string, sha_or_path: string) => sha_or_path,
      (blobs, owner, repo, sha_or_path) => {
        const blob = blobs.find(
          (blob) =>
            blob.owner === owner && blob.repo === repo && (blob.path === sha_or_path || blob.sha === sha_or_path)
        );
        return blob;
      }
    );

  const getBlobAtOwnerRepo: (state: AnyState, owner: string, repo: string) => GitHubBlob[] = createSelector(
    schema.blobs.selectTableAsList,
    (_state: AnyState, owner: string) => owner,
    (_state: AnyState, _owner: string, repo: string) => repo,
    (blobs, owner, repo) => {
      const blob = blobs.filter((blob) => blob.owner === owner && blob.repo === repo);
      return blob;
    }
  );

  return {
    allGithubOrganizations,
    getAppInstallation,
    allReposWithOrgs,
    getBlob,
    getBlobAtOwnerRepo
  };
};

/** Merges built-in selectors with caller-provided selector extensions. */
const extendSelectors =
  (extendedSelectors?: ExtendSimulationSelectorsInputLoose<GitHubSelectors, GitHubSchema>) =>
  (args: ExtendSimulationSelectors<ExtendedSchema>) => {
    const base = inputSelectors(args);
    if (!extendedSelectors) return base;
    const extResult = extendedSelectors(args);
    return {
      ...base,
      ...extResult
    };
  };

/**
 * Builds the store extension configuration consumed by the foundation
 * simulator.
 *
 * @example
 * ```ts
 * const storeConfig = extendStore(parsedInitialState);
 * ```
 */
type ExtendStoreResult = {
  schema: ExtendSimulationSchemaInput<GitHubSchema>;
  actions?: ExtendSimulationActionsInput<GitHubActions, GitHubSchema>;
  selectors?: ExtendSimulationSelectorsInput<GitHubSelectors, GitHubSchema>;
  logs?: boolean;
};

export const extendStore = (
  initialState: GitHubStore | undefined,
  extended?: GitHubExtendStoreInput
): ExtendStoreResult => {
  const result: ExtendStoreResult = {
    actions: extendActions(extended?.actions),
    selectors: extendSelectors(extended?.selectors),
    schema: inputSchema(initialState, extended?.schema)
  };
  if (extended?.logs !== undefined) {
    result.logs = extended.logs;
  }
  return result;
};
