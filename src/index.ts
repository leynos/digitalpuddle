/** @file Public compatibility facade for the DigitalPuddle package entry. */
export {simulation} from './simulation.ts';
export type {GitHubSimulatorArgs, InitialState} from './simulation.ts';

export {
  githubUserSchema,
  githubOrganizationSchema,
  githubRepositorySchema,
  githubBranchSchema,
  githubBlobSchema
} from './store/entities.ts';
