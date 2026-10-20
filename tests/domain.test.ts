/** @file Unit tests for pure user domain helpers. */
import {describe, expect, it} from 'bun:test';
import {
  normalizeUser,
  serializeMembershipResponse,
  shouldNormalizeUser,
  userAnomalyDetails
} from '../src/domain/user.ts';
import type {AuthenticatedUser, MembershipOrganization, RawAuthenticatedUser} from '../src/domain/user.ts';
import {githubOrganizationSchema, githubUserSchema} from '../src/store/entities.ts';

type MalformedUserFixture = {
  readonly id?: number | string;
  readonly login: string;
  readonly email?: string;
  readonly organizations?: string[] | string;
};

const malformedUser = (user: MalformedUserFixture): RawAuthenticatedUser => user;

describe('user domain helpers', () => {
  it('detects malformed user id and organization fields', () => {
    expect(userAnomalyDetails({login: 'legacy'})).toEqual({
      hasNumericId: false,
      hasOrganizations: false
    });
    expect(userAnomalyDetails({id: Number.NaN, login: 'legacy', organizations: []})).toEqual({
      hasNumericId: false,
      hasOrganizations: true
    });
    expect(userAnomalyDetails({id: 42, login: 'dev', organizations: ['team']})).toEqual({
      hasNumericId: true,
      hasOrganizations: true
    });
  });

  it('requires normalization when identity or membership data is malformed', () => {
    expect(shouldNormalizeUser({login: 'legacy'})).toBe(true);
    expect(shouldNormalizeUser(malformedUser({id: '42', login: 'legacy', organizations: []}))).toBe(true);
    expect(shouldNormalizeUser(malformedUser({id: 42, login: 'legacy', organizations: 'team'}))).toBe(true);
    expect(shouldNormalizeUser({id: 42, login: 'dev', organizations: ['team']})).toBe(false);
  });

  it('normalizes malformed user rows without dropping unrelated fields', () => {
    const normalized = normalizeUser(
      malformedUser({
        id: 'not-a-number',
        login: 'legacy',
        email: 'legacy@example.test',
        organizations: 'team'
      })
    );

    expect(normalized).toEqual(
      expect.objectContaining({
        id: 0,
        login: 'legacy',
        email: 'legacy@example.test',
        organizations: []
      })
    );
  });

  it('preserves valid user identifiers and organization lists', () => {
    const user = githubUserSchema.parse({id: 123, login: 'dev', organizations: ['team']}) satisfies AuthenticatedUser;

    expect(normalizeUser(user)).toEqual(user);
  });

  it('serializes membership responses with computed URLs and embedded records', () => {
    const organization = {
      ...githubOrganizationSchema.parse({login: 'team', url: 'https://api.example.test/orgs/team'}),
      repositories: []
    } satisfies MembershipOrganization;
    const user = githubUserSchema.parse({id: 123, login: 'dev', organizations: ['team']}) satisfies AuthenticatedUser;

    expect(serializeMembershipResponse({state: 'active', role: 'member'}, organization, user)).toEqual({
      url: 'https://api.example.test/orgs/team/memberships/dev',
      organization_url: 'https://api.example.test/orgs/team',
      state: 'active',
      role: 'member',
      organization,
      user
    });
  });
});
