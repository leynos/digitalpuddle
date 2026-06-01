/** @file Compatibility tests for extracted REST handler module boundaries. */
import {describe, expect, it} from 'bun:test';
import {createUserHandlers} from '../src/handlers/user.ts';

describe('handler layout compatibility', () => {
  it('exports a user handler factory for REST route assembly', () => {
    expect(createUserHandlers).toEqual(expect.any(Function));
  });
});
