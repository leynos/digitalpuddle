/** @file Compile-time tests for scenario registry contracts. */
import type {createEmptyScenarioRegistry, ScenarioManifest, ScenarioRegistry} from '../src/scenarios/index.ts';

declare const manifest: ScenarioManifest;

manifest satisfies {
  readonly id: string;
  readonly name: string;
};

declare const registry: ScenarioRegistry;

registry satisfies {
  readonly list: () => readonly ScenarioManifest[];
};

declare const createRegistry: typeof createEmptyScenarioRegistry;

createRegistry satisfies () => ScenarioRegistry;
