/** @file Unit tests for GraphQL repository conversion helpers. */
import {describe, expect, it} from 'bun:test';
import {convertRepositoryToGraphql} from '../src/graphql/converters/repository.ts';
import type {ToGraphqlDispatcher} from '../src/graphql/to-graphql-shapes.ts';
import type {ExtendedSimulationStore} from '../src/store/index.ts';
import {githubRepositorySchema} from '../src/store/entities.ts';

const ownerResolutionUnavailable: ToGraphqlDispatcher = () => {
  throw new Error('owner resolution is not exercised in this test');
};

describe('convertRepositoryToGraphql', () => {
  it('uses the normalized repository id for its default branch reference', () => {
    const repository = githubRepositorySchema.parse({
      id: 123,
      name: 'test-repo',
      full_name: 'test-org/test-repo',
      url: 'https://example.test/repos/test-org/test-repo',
      owner: 'test-org'
    });

    // SAFETY: Conversion reads no store members unless the lazy owner field is accessed.
    const simulationStore = {} as ExtendedSimulationStore;
    const graphqlRepository = convertRepositoryToGraphql(simulationStore, repository, ownerResolutionUnavailable);

    expect(graphqlRepository.id).toBe('123');
    expect(graphqlRepository.defaultBranchRef.id).toBe(Buffer.from('Branch:123:main').toString('base64'));
  });
});
