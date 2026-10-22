/** @file Compile-time tests for inherited data and schema utility overloads. */
import {normalizeUser} from '../src/domain/user.ts';
import type {AuthenticatedUser, NormalizedAuthenticatedUser, RawAuthenticatedUser} from '../src/domain/user.ts';
import {getSchema} from '../src/utils.ts';

type OpenApiSchemaContract = {
  readonly openapi?: string | undefined;
  readonly swagger?: string | undefined;
  readonly paths: object;
};

declare const authenticatedUser: AuthenticatedUser;
const preservedAuthenticatedUser: AuthenticatedUser = normalizeUser(authenticatedUser);
void preservedAuthenticatedUser;

declare const rawAuthenticatedUser: RawAuthenticatedUser;
const normalizedAuthenticatedUser: NormalizedAuthenticatedUser = normalizeUser(rawAuthenticatedUser);
void normalizedAuthenticatedUser;

// @ts-expect-error -- Normalizing raw input does not claim it is a database row.
const rawInputAsAuthenticatedUser: AuthenticatedUser = normalizeUser(rawAuthenticatedUser);
void rawInputAsAuthenticatedUser;

const bundledOpenApiSchema: OpenApiSchemaContract = getSchema('api.github.com.json');
const customOpenApiSchema: OpenApiSchemaContract = getSchema('custom.json');
void bundledOpenApiSchema;
void customOpenApiSchema;

const bundledGraphqlSchema: string = getSchema('schema.docs.graphql');
const enterpriseGraphqlSchema: string = getSchema('schema.docs-enterprise.graphql');
void bundledGraphqlSchema;
void enterpriseGraphqlSchema;

declare const arbitrarySchemaName: string;
const arbitrarySchema: string | OpenApiSchemaContract = getSchema(arbitrarySchemaName);
void arbitrarySchema;

// @ts-expect-error -- A JSON literal returns a parsed schema rather than text.
const openApiSchemaAsText: string = getSchema('api.github.com.json');
void openApiSchemaAsText;

// @ts-expect-error -- A general string may select either supported format.
const arbitrarySchemaAsText: string = getSchema(arbitrarySchemaName);
void arbitrarySchemaAsText;

// @ts-expect-error -- A named GraphQL schema returns text, not an OpenAPI shape.
const graphqlSchemaAsOpenApi: OpenApiSchemaContract = getSchema('schema.docs.graphql');
void graphqlSchemaAsOpenApi;
