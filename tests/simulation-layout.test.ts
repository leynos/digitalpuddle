/** @file Compatibility tests for the simulation assembly module boundary. */
import {describe, expect, it} from 'bun:test';
import {simulation as packageSimulation} from '../src/index.ts';
import {simulation as internalSimulation} from '../src/simulation.ts';

describe('simulation layout compatibility', () => {
  it('keeps the package facade aligned with the simulation assembly module', () => {
    expect(packageSimulation).toBe(internalSimulation);
  });

  it('builds a simulation server from the new internal assembly path', () => {
    const app = internalSimulation({
      initialState: {
        users: [],
        organizations: [],
        repositories: [],
        branches: [],
        blobs: []
      }
    });

    expect(app).toEqual(
      expect.objectContaining({
        listen: expect.any(Function)
      })
    );
  });
});
