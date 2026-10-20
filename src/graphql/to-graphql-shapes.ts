/**
 * @file Shared types for store-to-GraphQL conversion helpers.
 *
 * This module defines the intermediate GraphQL object shapes and connection
 * types that the resolver conversion helpers compose before handing values to
 * the generated resolver contracts.
 */
import type {PageArgs} from './relay.ts';
import type {ExtendedSimulationStore} from '../store/index.ts';
import type {GitHubOrganization, GitHubRepository, GitHubUser} from '../store/entities.ts';
import type {
  OrganizationMemberRole,
  PageInfo,
  RepositoryPermission,
  RepositoryVisibility,
  Team,
  User
} from '../__generated__/resolvers-types.ts';

export type Connection<Node, Edge extends {cursor: string; node: Node}> = {
  edges: Edge[];
  nodes: Node[];
  pageInfo: PageInfo;
  totalCount: number;
};

export type RepositoryTopic = {
  id: string;
  resourcePath: string;
  topic: {
    id: string;
    name: string;
    relatedTopics: [];
    repositories: RepositoryConnectionData;
    stargazerCount: number;
    stargazers: {
      edges: never[];
      nodes: never[];
      pageInfo: PageInfo;
      totalCount: number;
    };
    viewerHasStarred: boolean;
  };
  url: string;
};

export interface GraphQLData {
  User: {
    __typename: 'User';
    id: string;
    avatarUrl?: string;
    login: string;
    name?: string;
    bio: string;
    createdAt: string;
    resourcePath: string;
    url?: string;
    repositories: (pageArgs: PageArgs) => RepositoryConnectionData;
    organizations: (pageArgs: PageArgs) => OrganizationConnectionData;
  };
  Repository: {
    __typename: 'Repository';
    id: string;
    name: string;
    description?: string;
    nameWithOwner: string;
    url: string;
    createdAt: string;
    collaborators: (pageArgs: PageArgs) => RepositoryCollaboratorConnectionData;
    owner: GraphQLData['User'] | GraphQLData['Organization'];
    defaultBranchRef: {
      id: string;
      name: string;
    };
    languages: (pageArgs: PageArgs) => LanguageConnectionData;
    repositoryTopics: (pageArgs: PageArgs) => RepositoryTopicConnectionData;
    visibility: RepositoryVisibility;
    isArchived: boolean;
    isFork: boolean;
  };
  Organization: {
    __typename: 'Organization';
    id: string;
    avatarUrl?: string;
    login: string;
    name?: string;
    description?: string;
    email?: string;
    createdAt: string;
    resourcePath: string;
    url?: string;
    repositories: (pageArgs: PageArgs) => RepositoryConnectionData;
    teams: (pageArgs: PageArgs) => TeamConnectionData;
    membersWithRole: (pageArgs: PageArgs) => OrganizationMemberConnectionData;
  };
}

export type GraphQLUser = GraphQLData['User'];
export type GraphQLRepository = GraphQLData['Repository'];
export type GraphQLOrganization = GraphQLData['Organization'];

export interface DataSchemas {
  User: GitHubUser;
  Repository: GitHubRepository;
  Organization: GitHubOrganization;
}

export type OrganizationConnectionData = Connection<
  GraphQLData['Organization'],
  {cursor: string; node: GraphQLData['Organization']}
>;

export type TeamConnectionData = Connection<Team, {cursor: string; node: Team}>;

export type OrganizationMemberConnectionData = Connection<
  User,
  {cursor: string; node: User; role: OrganizationMemberRole}
>;

export type RepositoryCollaboratorConnectionData = Connection<
  User,
  {
    cursor: string;
    node: User;
    permission: RepositoryPermission;
    permissionSources: [];
  }
>;

export type LanguageConnectionData = Connection<
  {id: string; name: string},
  {cursor: string; node: {id: string; name: string}; size: number}
> & {totalSize: number};

export type RepositoryTopicConnectionData = Connection<RepositoryTopic, {cursor: string; node: RepositoryTopic}>;

export type RepositoryConnectionData = Connection<
  GraphQLData['Repository'],
  {cursor: string; node: GraphQLData['Repository']}
> & {totalDiskUsage: number};

export type ToGraphqlDispatcher = <T extends keyof DataSchemas>(
  simulationStore: ExtendedSimulationStore,
  __typename: T,
  entity: DataSchemas[T]
) => GraphQLData[T];
