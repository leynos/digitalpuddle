/**
 * @file Simulation assembly for building and seeding a DigitalPuddle server.
 *
 * This module owns the internal server assembly point used by the package
 * facade. It wires the Foundation simulator, extended store, OpenAPI document,
 * REST handlers, and router extensions while keeping `src/index.ts` as the
 * public compatibility entry during the layout transition.
 */
import {
  createFoundationSimulationServer,
  type FoundationSimulator,
  type SimulationHandlers,
  type SimulationStore as FoundationSimulationStore
} from '@simulacrum/foundation-simulator';

import {extendRouter} from './extend-api.ts';
import {openapi} from './rest/index.ts';
import {type GitHubInitialStore, githubInitialStoreSchema} from './store/entities.ts';
import {
  type ExtendedSimulationStore,
  extendStore as mergeStoreConfig,
  type GitHubExtendStoreInput
} from './store/index.ts';
import type {SchemaFile} from './utils.ts';

/** Seed data accepted for the GitHub fixtures a simulation server starts with. */
export type InitialState = GitHubInitialStore;

type FoundationRouter = Parameters<
  NonNullable<Parameters<typeof createFoundationSimulationServer>[0]['extendRouter']>
>[0];

/** Options accepted by {@link simulation} to seed and extend a GitHub simulation server. */
export type GitHubSimulatorArgs = {
  /** Seed data for the GitHub fixture store. */
  initialState?: GitHubInitialStore;
  /** Base URL the simulated GitHub API is served from. */
  apiUrl?: string;
  /** OpenAPI document, or path to one, describing the simulated GitHub API. */
  apiSchema?: SchemaFile | string;
  /** Store, REST, and router extensions layered onto the base simulation. */
  extend?: {
    /**
     * Extensions merged into the GitHub fixture store: `schema` slices,
     * `actions` and `selectors`, each layered over the package's built-in set,
     * and `logs` to enable the foundation store's action logging.
     */
    extendStore?: GitHubExtendStoreInput;
    /** Builds extra REST handlers from the extended simulation store. */
    openapiHandlers?: (simulationStore: ExtendedSimulationStore) => SimulationHandlers;
    /** Registers additional routes on the extended simulation store's router. */
    extendRouter?: (router: FoundationRouter, simulationStore: ExtendedSimulationStore) => void;
  };
};

// Derive the concrete generic parameters from the exported ExtendedSimulationStore.
type _GitHubSchema =
  ExtendedSimulationStore extends FoundationSimulationStore<infer S, infer _A, infer _Sel> ? S : never;
type _GitHubActions =
  ExtendedSimulationStore extends FoundationSimulationStore<infer _S, infer A, infer _Sel> ? A : never;
type _GitHubSelectors =
  ExtendedSimulationStore extends FoundationSimulationStore<infer _S, infer _A, infer Sel> ? Sel : never;

type SimulationAssemblyFailureReason = 'schema-validation-failed' | 'store-composition-failed';

const logSimulationAssemblyFailure = (reason: SimulationAssemblyFailureReason) => {
  console.error(
    JSON.stringify({
      event: 'digitalpuddle.simulation.assembly_failed',
      reason
    })
  );
};

const parseInitialState = (initialState: GitHubInitialStore | undefined) => {
  if (!initialState) {
    return undefined;
  }

  try {
    return githubInitialStoreSchema.parse(initialState);
  } catch (error) {
    logSimulationAssemblyFailure('schema-validation-failed');
    throw error;
  }
};

const composeStoreConfig = (
  initialState: ReturnType<typeof parseInitialState>,
  extendStore: GitHubExtendStoreInput | undefined
) => {
  try {
    return mergeStoreConfig(initialState, extendStore);
  } catch (error) {
    logSimulationAssemblyFailure('store-composition-failed');
    throw error;
  }
};

/**
 * Builds a GitHub API simulation server from seeded state and optional
 * extensions.
 *
 * @example
 * ```ts
 * const app = simulation({
 *   initialState: {
 *     users: [{login: 'octocat', organizations: []}],
 *     organizations: [{login: 'frontside'}],
 *     repositories: [{owner: 'frontside', name: 'simulacat'}],
 *     branches: [{owner: 'frontside', repo: 'simulacat', name: 'main'}],
 *     blobs: []
 *   }
 * });
 * ```
 */
export const simulation = (args: GitHubSimulatorArgs = {}): FoundationSimulator<ExtendedSimulationStore> => {
  const parsedInitialState = parseInitialState(args.initialState);
  const extendStoreConfig = composeStoreConfig(parsedInitialState, args.extend?.extendStore);

  return createFoundationSimulationServer<_GitHubSchema, _GitHubActions, _GitHubSelectors>({
    port: 3300, // default port
    simulationContextPage: '/simulation',
    extendStore: extendStoreConfig,
    extendRouter: extendRouter(args?.extend?.extendRouter),
    openapi: openapi(
      parsedInitialState,
      args?.apiUrl ?? '/',
      args?.apiSchema ?? 'api.github.com.json',
      args?.extend?.openapiHandlers
    )
  })();
};
