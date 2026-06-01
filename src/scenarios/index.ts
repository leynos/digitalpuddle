/** @file Scenario contracts for deterministic simulator fixtures. */

export type ScenarioManifest = {
  readonly id: string;
  readonly name: string;
};

export type ScenarioRegistry = {
  readonly list: () => readonly ScenarioManifest[];
};

export const createEmptyScenarioRegistry = (): ScenarioRegistry => ({
  list: () => []
});
