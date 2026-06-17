/**
 * @file Scenario contracts for deterministic simulator fixtures.
 *
 * This module defines the scenario registry boundary without adding fixture
 * loading behaviour. The empty registry is intentionally deterministic, giving
 * future scenario work a documented target while keeping current simulator
 * startup and tests free of file-system side effects.
 */

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
