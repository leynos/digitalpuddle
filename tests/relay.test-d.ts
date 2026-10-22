/** @file Compile-time tests for Relay pagination overloads. */
import {applyRelayPagination} from '../src/graphql/relay.ts';
import type {Page} from '../src/graphql/relay.ts';

interface OrganizationNode {
  login: string;
}

declare const organizations: OrganizationNode[];

const unmappedPage = applyRelayPagination(organizations, {first: 2});
unmappedPage satisfies Page<OrganizationNode>;

const mappedPage = applyRelayPagination(organizations, {first: 2}, (organization) => organization.login);
mappedPage satisfies Page<string>;

// @ts-expect-error the mapper changes nodes from source organizations to strings.
const mappedPageWithSourceNodes: Page<OrganizationNode> = mappedPage;
void mappedPageWithSourceNodes;
