/** @file Compatibility tests for extracted REST handler module boundaries. */
import {describe, expect, it} from 'bun:test';
import type {ExtendedSimulationStore} from '../src/store/index.ts';
import {createUserHandlers} from '../src/handlers/user.ts';

describe('handler layout compatibility', () => {
  it('exports a user handler factory for REST route assembly', () => {
    expect(createUserHandlers).toEqual(expect.any(Function));
    const handlers = createUserHandlers({} as ExtendedSimulationStore);

    expect(typeof handlers).toBe('object');
    expect(handlers).toEqual(
      expect.objectContaining({
        'users/get-authenticated': expect.any(Function),
        'orgs/list-memberships-for-authenticated-user': expect.any(Function)
      })
    );
  });
});
