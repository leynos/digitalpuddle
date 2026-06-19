/**
 * @file User domain serialization and normalisation helpers.
 *
 * This module keeps user and membership projection logic free of HTTP adapter
 * concerns so REST handlers can normalize inherited rows without owning the
 * pure response-shaping rules.
 */
import type {ExtendedSimulationStore} from '../store/index.ts';

export type AuthenticatedUser = ReturnType<ExtendedSimulationStore['schema']['users']['selectTableAsList']>[number];
export type MembershipOrganization = ReturnType<ExtendedSimulationStore['selectors']['allGithubOrganizations']>[number];

export type MembershipProjection = {
  readonly role: 'member';
  readonly state: 'active';
};

export type RawAuthenticatedUser = Partial<AuthenticatedUser> & {
  readonly login: string;
};

export const fallbackUserId = 0;

export const userAnomalyDetails = (user: RawAuthenticatedUser) => ({
  hasNumericId: typeof user.id === 'number' && Number.isFinite(user.id),
  hasOrganizations: Array.isArray(user.organizations)
});

export const shouldNormalizeUser = (user: RawAuthenticatedUser) => {
  const details = userAnomalyDetails(user);
  return !details.hasNumericId || !details.hasOrganizations;
};

export const normalizeUser = (user: AuthenticatedUser | RawAuthenticatedUser): AuthenticatedUser => {
  const hasNumericId = typeof user.id === 'number' && Number.isFinite(user.id);
  const hasOrganizations = Array.isArray(user.organizations);

  return {
    ...user,
    id: hasNumericId ? user.id : fallbackUserId,
    organizations: hasOrganizations ? user.organizations : []
  } as AuthenticatedUser;
};

export const serializeMembershipResponse = (
  membership: MembershipProjection,
  organization: MembershipOrganization,
  user: AuthenticatedUser
) => ({
  url: `${organization.url}/memberships/${user.login}`,
  organization_url: organization.url,
  state: membership.state,
  role: membership.role,
  organization,
  user
});
