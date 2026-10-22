/**
 * @file User domain serialization and normalisation helpers.
 *
 * This module keeps user and membership projection logic free of HTTP adapter
 * concerns so REST handlers can normalize inherited rows without owning the
 * pure response-shaping rules.
 */
import type {ExtendedSimulationStore} from '../store/index.ts';
import {z} from 'zod';

export type AuthenticatedUser = ReturnType<ExtendedSimulationStore['schema']['users']['selectTableAsList']>[number];
export type MembershipOrganization = ReturnType<ExtendedSimulationStore['selectors']['allGithubOrganizations']>[number];

export type MembershipProjection = {
  readonly role: 'member';
  readonly state: 'active';
};

export type RawAuthenticatedUser = Omit<Partial<AuthenticatedUser>, 'id' | 'organizations'> & {
  readonly login: string;
  readonly id?: unknown;
  readonly organizations?: unknown;
};

export type NormalizedAuthenticatedUser = Omit<Partial<AuthenticatedUser>, 'id' | 'organizations'> & {
  readonly id: number;
  readonly login: string;
  readonly organizations: string[];
};

export const fallbackUserId = 0;

const userIdSchema = z.number().refine(Number.isFinite);
const userOrganizationsSchema = z.array(z.string());

export const userAnomalyDetails = (user: RawAuthenticatedUser) => ({
  hasNumericId: userIdSchema.safeParse(user.id).success,
  hasOrganizations: userOrganizationsSchema.safeParse(user.organizations).success
});

export const shouldNormalizeUser = (user: RawAuthenticatedUser) => {
  const details = userAnomalyDetails(user);
  return !details.hasNumericId || !details.hasOrganizations;
};

export function normalizeUser(user: AuthenticatedUser): AuthenticatedUser;
export function normalizeUser(user: RawAuthenticatedUser): NormalizedAuthenticatedUser;
export function normalizeUser(user: AuthenticatedUser | RawAuthenticatedUser): NormalizedAuthenticatedUser {
  const id = userIdSchema.catch(fallbackUserId).parse(user.id);
  const organizations = userOrganizationsSchema.catch([]).parse(user.organizations);

  return {
    ...user,
    id,
    organizations
  } satisfies NormalizedAuthenticatedUser;
}

export const serializeMembershipResponse = (
  membership: MembershipProjection,
  organization: MembershipOrganization,
  user: NormalizedAuthenticatedUser
) => ({
  url: `${organization.url}/memberships/${user.login}`,
  organization_url: organization.url,
  state: membership.state,
  role: membership.role,
  organization,
  user: Object.fromEntries(Object.entries(user).filter(([, value]) => value !== undefined))
});
