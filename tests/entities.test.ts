/** @file Unit tests for fixture schemas and state-table conversion helpers. */
import {beforeEach, describe, expect, it} from 'bun:test';
import fc from 'fast-check';
import {
  blobStoreKey,
  githubAppInstallationSchema,
  convertObjByKey,
  convertInitialStateToStoreState,
  githubBlobSchema,
  githubInitialStoreSchema,
  githubOrganizationSchema,
  githubUserSchema
} from '../src/store/entities.ts';
import {resetNextRepositoryId} from '../src/store/entities/repository.ts';

type GitHubInitialStoreFixture = {
  users: Array<Record<string, unknown>>;
  installations?: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  repositories: Array<Record<string, unknown>>;
  branches: Array<Record<string, unknown>>;
  blobs: Array<Record<string, unknown>>;
};

type BuildGithubInitialStoreOptions = {
  storeOverrides?: Partial<GitHubInitialStoreFixture>;
  userOverrides?: Record<string, unknown>;
};

const buildGithubInitialStore = (options: BuildGithubInitialStoreOptions = {}) => ({
  users: [{login: 'dev', organizations: [], ...(options.userOverrides ?? {})}],
  organizations: [{login: 'test-org'}],
  repositories: [{owner: 'test-org', name: 'test-repo'}],
  branches: [{owner: 'test-org', repo: 'test-repo', name: 'main'}],
  blobs: [],
  ...(options.storeOverrides ?? {})
});

const parseGithubInitialStore = (options: BuildGithubInitialStoreOptions = {}) =>
  githubInitialStoreSchema.parse(buildGithubInitialStore(options));

type StoreState = ReturnType<typeof convertInitialStateToStoreState>;

const keySegmentArbitrary = fc.string({minLength: 1, maxLength: 12}).filter((value) => /^[a-z][a-z0-9-]*$/.test(value));

const requireStoreState = (store: StoreState) => {
  if (!store) {
    throw new Error('convertInitialStateToStoreState returned null for parsed input');
  }

  return store;
};

describe('initialState user fields', () => {
  it('preserves all provided fields through to store state', () => {
    const parsed = parseGithubInitialStore({
      userOverrides: {
        id: 99887766,
        name: 'dev User',
        email: 'dev@example.io'
      }
    });
    const store = requireStoreState(convertInitialStateToStoreState(parsed));
    const {dev: user} = store.users;

    expect(user).toBeDefined();
    if (!user) {
      throw new Error('expected seeded user to be present');
    }
    expect(user.id).toBe(99887766);
    expect(user.login).toBe('dev');
    expect(user.name).toBe('dev User');
    expect(user.email).toBe('dev@example.io');
  });

  it('generates defaults for omitted fields', () => {
    const parsed = parseGithubInitialStore();
    const store = requireStoreState(convertInitialStateToStoreState(parsed));
    const {dev: user} = store.users;

    if (!user) {
      throw new Error('expected seeded user to be present');
    }
    expect(user.id).toBeGreaterThanOrEqual(1000);
    expect(user.email).toContain('@');
  });

  it('rejects blank logins', () => {
    expect(() => githubUserSchema.parse({login: '   ', organizations: []})).toThrow();
  });
});

describe('githubBlobSchema', () => {
  it('accepts path-only blobs', () => {
    const blob = githubBlobSchema.parse({
      owner: 'test-org',
      repo: 'test-repo',
      path: 'README.md'
    });

    expect(blob.path).toBe('README.md');
    expect(blob.sha).toBeUndefined();
  });

  it('accepts sha-only blobs', () => {
    const blob = githubBlobSchema.parse({
      owner: 'test-org',
      repo: 'test-repo',
      sha: 'abc123'
    });

    expect(blob.sha).toBe('abc123');
    expect(blob.path).toBeUndefined();
  });

  it('rejects blobs missing both path and sha', () => {
    expect(() =>
      githubBlobSchema.parse({
        owner: 'test-org',
        repo: 'test-repo'
      })
    ).toThrow('Specify the path or sha of the blob');
  });
});

describe('initialState blob fields', () => {
  it('stores path-only blobs using a repository-scoped fallback key', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        blobs: [{owner: 'test-org', repo: 'test-repo', path: 'README.md'}]
      }
    });
    const store = requireStoreState(convertInitialStateToStoreState(parsed));

    expect(store.blobs['test-org/test-repo:README.md']).toEqual(
      expect.objectContaining({
        owner: 'test-org',
        repo: 'test-repo',
        path: 'README.md'
      })
    );
    expect(store.blobs['test-org/test-repo:README.md']?.sha).toBeUndefined();
  });

  it('keeps path-only blobs from different repositories distinct', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        repositories: [
          {owner: 'test-org', name: 'test-repo'},
          {owner: 'test-org', name: 'docs-repo'}
        ],
        branches: [
          {owner: 'test-org', repo: 'test-repo', name: 'main'},
          {owner: 'test-org', repo: 'docs-repo', name: 'main'}
        ],
        blobs: [
          {owner: 'test-org', repo: 'test-repo', path: 'README.md'},
          {owner: 'test-org', repo: 'docs-repo', path: 'README.md'}
        ]
      }
    });
    const store = requireStoreState(convertInitialStateToStoreState(parsed));

    expect(store.blobs['test-org/test-repo:README.md']).toEqual(
      expect.objectContaining({repo: 'test-repo', path: 'README.md'})
    );
    expect(store.blobs['test-org/docs-repo:README.md']).toEqual(
      expect.objectContaining({repo: 'docs-repo', path: 'README.md'})
    );
  });
});

describe('githubOrganizationSchema', () => {
  it('rejects blank logins', () => {
    expect(() => githubOrganizationSchema.parse({login: '   '})).toThrow('login must be a non-empty string');
  });

  it('derives related URLs from the provided organization URL base', () => {
    const organization = githubOrganizationSchema.parse({
      login: 'test-org',
      url: 'https://api.example.test/api/v3/orgs/test-org'
    });

    expect(organization.url).toBe('https://api.example.test/api/v3/orgs/test-org');
    expect(organization.repos_url).toBe('https://api.example.test/api/v3/orgs/test-org/repos');
    expect(organization.followers_url).toBe('https://api.example.test/api/v3/users/test-org/followers');
    expect(organization.members_url).toBe('https://api.example.test/api/v3/orgs/test-org/members{/member}');
  });

  it('preserves caller-supplied related URLs', () => {
    const organization = githubOrganizationSchema.parse({
      login: 'test-org',
      url: 'https://api.example.test/orgs/test-org',
      html_url: 'https://example.test/orgs/test-org',
      members_url: 'https://example.test/custom-members{/member}'
    });

    expect(organization.html_url).toBe('https://example.test/orgs/test-org');
    expect(organization.members_url).toBe('https://example.test/custom-members{/member}');
  });
});

describe('githubAppInstallationSchema', () => {
  it('rejects blank accounts', () => {
    expect(() => githubAppInstallationSchema.parse({account: '   '})).toThrow();
  });

  it('rejects invalid ISO datetimes', () => {
    expect(() => githubAppInstallationSchema.parse({account: 'test-org', created_at: 'not-a-date'})).toThrow();
    expect(() => githubAppInstallationSchema.parse({account: 'test-org', updated_at: 'not-a-date'})).toThrow();
  });

  it('defaults updated_at no earlier than created_at', () => {
    const installation = githubAppInstallationSchema.parse({account: 'test-org'});

    if (!installation.updated_at) {
      throw new Error('expected updated_at to be defaulted');
    }

    expect(new Date(installation.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(installation.created_at).getTime()
    );
  });

  it('handles future-dated created_at without throwing', () => {
    const futureCreatedAt = new Date(Date.now() + 60_000).toISOString();

    const installation = githubAppInstallationSchema.parse({
      account: 'test-org',
      created_at: futureCreatedAt
    });

    expect(installation.created_at).toBe(futureCreatedAt);
    expect(installation.updated_at).toBeDefined();
  });
});

describe('initialState schema transforms', () => {
  beforeEach(() => {
    resetNextRepositoryId();
  });

  it('creates installation fixtures for each seeded organization', () => {
    const parsed = parseGithubInitialStore();

    expect(parsed.installations).toHaveLength(1);
    expect(parsed.installations[0]).toEqual(
      expect.objectContaining({
        account: 'test-org',
        target_type: 'Organization'
      })
    );
  });

  it('assigns deterministic unique ids to synthesized installations', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        organizations: [
          {id: 4401, login: 'test-org'},
          {id: 4402, login: 'other-org'}
        ],
        installations: [
          {
            id: 2000,
            account: 'existing-account',
            target_id: 9999,
            target_type: 'Organization'
          }
        ]
      }
    });

    expect(parsed.installations.map((installation) => installation.id)).toEqual([2000, 2001, 2002]);
    expect(new Set(parsed.installations.map((installation) => installation.id)).size).toBe(parsed.installations.length);
  });

  it('assigns deterministic ids to caller-provided installations missing ids', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        organizations: [
          {id: 4401, login: 'test-org'},
          {id: 4402, login: 'other-org'}
        ],
        installations: [
          {
            account: 'existing-account',
            target_id: 9999,
            target_type: 'Organization'
          }
        ]
      }
    });
    const store = requireStoreState(convertInitialStateToStoreState(parsed));

    expect(parsed.installations.map((installation) => installation.id)).toEqual([2000, 2001, 2002]);
    expect(Object.keys(store.installations)).toEqual(['2000', '2001', '2002']);
    expect(store.installations['2000']).toEqual(
      expect.objectContaining({
        id: 2000,
        account: 'existing-account'
      })
    );
  });

  it('preserves caller-supplied installation fields', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        installations: [
          {
            id: 4242,
            account: 'test-org',
            access_tokens_url: 'https://example.test/custom/access_tokens',
            repositories_url: 'https://example.test/custom/repositories',
            html_url: 'https://example.test/custom/html'
          }
        ]
      }
    });

    expect(parsed.installations).toEqual([
      expect.objectContaining({
        id: 4242,
        access_tokens_url: 'https://example.test/custom/access_tokens',
        repositories_url: 'https://example.test/custom/repositories',
        html_url: 'https://example.test/custom/html'
      })
    ]);
  });

  it('does not mutate the caller-provided installations array', () => {
    const installations = [
      {
        id: 4242,
        account: 'test-org',
        access_tokens_url: 'https://example.test/custom/access_tokens',
        repositories_url: 'https://example.test/custom/repositories',
        html_url: 'https://example.test/custom/html'
      }
    ];
    const input = buildGithubInitialStore({storeOverrides: {installations}});

    githubInitialStoreSchema.parse(input);

    expect(installations).toEqual([
      expect.objectContaining({
        id: 4242,
        account: 'test-org',
        access_tokens_url: 'https://example.test/custom/access_tokens',
        repositories_url: 'https://example.test/custom/repositories',
        html_url: 'https://example.test/custom/html'
      })
    ]);
  });

  it('normalizes repository fields needed by REST and GraphQL responses', () => {
    const parsed = parseGithubInitialStore();
    const repository = parsed.repositories[0];

    if (!repository) {
      throw new Error('expected seeded repository to be present');
    }
    expect(repository.full_name).toBe('test-org/test-repo');
    expect(repository.url).toContain('/repos/test-org/test-repo');
    expect(repository.visibility).toBe('public');
  });

  it('preserves caller-supplied repository and organization ids', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        organizations: [{id: 4401, login: 'test-org'}],
        repositories: [{id: 3301, owner: 'test-org', name: 'test-repo'}]
      }
    });

    expect(parsed.organizations[0]?.id).toBe(4401);
    expect(parsed.repositories[0]?.id).toBe(3301);
  });

  it('assigns distinct generated ids to multiple seeded repositories', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        repositories: [
          {owner: 'test-org', name: 'test-repo'},
          {owner: 'test-org', name: 'second-repo'}
        ],
        branches: [
          {owner: 'test-org', repo: 'test-repo', name: 'main'},
          {owner: 'test-org', repo: 'second-repo', name: 'main'}
        ]
      }
    });

    const firstRepository = parsed.repositories[0];
    const secondRepository = parsed.repositories[1];

    if (!firstRepository || !secondRepository) {
      throw new Error('expected seeded repositories to be present');
    }

    expect(firstRepository.id).not.toBe(secondRepository.id);
    expect(firstRepository.full_name).toBe('test-org/test-repo');
    expect(secondRepository.full_name).toBe('test-org/second-repo');
    expect(firstRepository.url).toContain('/repos/test-org/test-repo');
    expect(secondRepository.url).toContain('/repos/test-org/second-repo');
  });

  it('assigns unique generated repository ids across generated collections', () => {
    fc.assert(
      fc.property(fc.uniqueArray(keySegmentArbitrary, {minLength: 1, maxLength: 20}), (repositoryNames) => {
        resetNextRepositoryId();
        const parsed = parseGithubInitialStore({
          storeOverrides: {
            repositories: repositoryNames.map((name) => ({owner: 'test-org', name})),
            branches: repositoryNames.map((repo) => ({owner: 'test-org', repo, name: 'main'}))
          }
        });
        const generatedIds = parsed.repositories.map((repository) => repository.id);

        expect(new Set(generatedIds).size).toBe(generatedIds.length);
        expect(generatedIds).toEqual(repositoryNames.map((_, index) => 3000 + index));
      })
    );
  });

  it('assigns unique installation ids across generated and provided collections', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(keySegmentArbitrary, {minLength: 1, maxLength: 20}),
        fc.uniqueArray(fc.integer({min: 1, max: 10_000}), {maxLength: 10}),
        (organizationNames, providedIds) => {
          const parsed = parseGithubInitialStore({
            storeOverrides: {
              organizations: organizationNames.map((login, index) => ({id: index + 1, login})),
              installations: providedIds.map((id, index) => ({
                id,
                account: `provided-${index}`,
                target_id: 100_000 + index,
                target_type: 'Organization'
              }))
            }
          });
          const installationIds = parsed.installations.map((installation) => installation.id);

          expect(new Set(installationIds).size).toBe(installationIds.length);
          for (const providedId of providedIds) {
            expect(installationIds).toContain(providedId);
          }
        }
      )
    );
  });

  it('rejects duplicate keyed entities instead of overwriting them', () => {
    const parsed = parseGithubInitialStore({
      storeOverrides: {
        repositories: [
          {owner: 'test-org', name: 'test-repo'},
          {owner: 'test-org', name: 'test-repo'}
        ],
        branches: [
          {owner: 'test-org', repo: 'test-repo', name: 'main'},
          {owner: 'test-org', repo: 'test-repo', name: 'release'}
        ]
      }
    });

    expect(() => convertInitialStateToStoreState(parsed)).toThrow('Duplicate key "test-org/test-repo"');
  });
});

describe('convertObjByKey', () => {
  it('uses a null-prototype object for keyed results', () => {
    const keyedObjects = convertObjByKey([{name: 'prototype-guard'}], () => '__proto__');

    expect(Object.getPrototypeOf(keyedObjects)).toBeNull();
    expect(Object.getOwnPropertyDescriptor(keyedObjects, '__proto__')?.value).toEqual({name: 'prototype-guard'});
  });

  it('preserves generated blob keys across arbitrary unique collections', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            owner: keySegmentArbitrary,
            repo: keySegmentArbitrary,
            path: keySegmentArbitrary
          }),
          {
            maxLength: 30,
            selector: (blob) => `${blob.owner}/${blob.repo}:${blob.path}`
          }
        ),
        (inputBlobs) => {
          const parsedBlobs = inputBlobs.map((blob) => githubBlobSchema.parse(blob));
          const keyedBlobs = convertObjByKey(parsedBlobs, blobStoreKey);

          expect(Object.keys(keyedBlobs).sort()).toEqual(parsedBlobs.map(blobStoreKey).sort());
          expect(Object.values(keyedBlobs)).toHaveLength(parsedBlobs.length);
        }
      )
    );
  });
});
