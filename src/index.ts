/**
 * @file Public compatibility facade for the DigitalPuddle package entry.
 *
 * This module preserves the package-facing import surface while internal
 * assembly moves into target DigitalPuddle modules. It re-exports the
 * simulation factory and retained GitHub fixture schemas so existing consumers
 * and build configuration can keep importing from the package root.
 */
export {simulation} from './simulation.ts';
export type {GitHubSimulatorArgs, InitialState} from './simulation.ts';

export {
  githubUserSchema,
  githubOrganizationSchema,
  githubRepositorySchema,
  githubBranchSchema,
  githubBlobSchema
} from './store/entities.ts';
