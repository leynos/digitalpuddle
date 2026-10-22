/**
 * @file User domain normalisation helpers.
 *
 * This module owns the user shapes and normalization rules used by the
 * inherited REST adapter without depending on persistence or HTTP types.
 */
import {z} from 'zod';

export type AuthenticatedUser = {
  readonly id: number;
  readonly login: string;
  readonly name: string;
  readonly bio: string;
  readonly email: string;
  readonly url?: string | undefined;
  readonly avatar_url: string;
  readonly organizations: string[];
  readonly created_at: string;
};

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
