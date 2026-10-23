/** @file Compile-time assertions for GraphQL mapper and connection contracts. */
import {convertOrganizationToGraphql} from '../src/graphql/converters/organization.ts';
import {convertRepositoryToGraphql} from '../src/graphql/converters/repository.ts';
import {convertUserToGraphql} from '../src/graphql/converters/user.ts';
import type {
  GraphQLData,
  GraphQLOrganization,
  GraphQLRepository,
  GraphQLUser,
  LanguageConnectionData,
  OrganizationConnectionData,
  OrganizationMemberConnectionData,
  RepositoryCollaboratorConnectionData,
  RepositoryConnectionData,
  RepositoryTopicConnectionData,
  TeamConnectionData,
  ToGraphqlDispatcher,
  DataSchemas
} from '../src/graphql/to-graphql-shapes.ts';
import type {ExtendedSimulationStore} from '../src/store/index.ts';

declare const simulationStore: ExtendedSimulationStore;
declare const toGraphql: ToGraphqlDispatcher;
declare const user: DataSchemas['User'];
declare const repository: DataSchemas['Repository'];
declare const organization: DataSchemas['Organization'];

const graphqlUser: GraphQLUser = convertUserToGraphql(simulationStore, user, toGraphql);
const graphqlRepository: GraphQLRepository = convertRepositoryToGraphql(simulationStore, repository, toGraphql);
const graphqlOrganization: GraphQLOrganization = convertOrganizationToGraphql(simulationStore, organization, toGraphql);

const userData: GraphQLData['User'] = graphqlUser;
const repositoryData: GraphQLData['Repository'] = graphqlRepository;
const organizationData: GraphQLData['Organization'] = graphqlOrganization;
const userOrganizations: OrganizationConnectionData = graphqlUser.organizations({first: 1});
const userRepositories: RepositoryConnectionData = graphqlUser.repositories({first: 1});
const organizationRepositories: RepositoryConnectionData = graphqlOrganization.repositories({first: 1});
const organizationTeams: TeamConnectionData = graphqlOrganization.teams({first: 1});
const organizationMembers: OrganizationMemberConnectionData = graphqlOrganization.membersWithRole({first: 1});
const repositoryCollaborators: RepositoryCollaboratorConnectionData = graphqlRepository.collaborators({first: 1});
const repositoryLanguages: LanguageConnectionData = graphqlRepository.languages({first: 1});
const repositoryTopics: RepositoryTopicConnectionData = graphqlRepository.repositoryTopics({first: 1});

void userData;
void repositoryData;
void organizationData;
void userOrganizations;
void userRepositories;
void organizationRepositories;
void organizationTeams;
void organizationMembers;
void repositoryCollaborators;
void repositoryLanguages;
void repositoryTopics;
