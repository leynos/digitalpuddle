/** @file Compile-time assertions for the extracted REST user-handler boundary. */
import {createUserHandlers} from '../src/handlers/user.ts';
import type {UserHandler, UserHandlerContext, UserHandlerRequest, UserHandlerResponse} from '../src/handlers/user.ts';
import type {ExtendedSimulationStore} from '../src/store/index.ts';

declare const simulationStore: ExtendedSimulationStore;
declare const context: UserHandlerContext;
declare const request: UserHandlerRequest;
declare const response: UserHandlerResponse;

const handlers = createUserHandlers(simulationStore);
const authenticationHandler: UserHandler = handlers['users/get-authenticated'];
const membershipsHandler: UserHandler = handlers['orgs/list-memberships-for-authenticated-user'];
const authenticationResult: Promise<void> = authenticationHandler(context, request, response);
const membershipsResult: Promise<void> = membershipsHandler(context, request, response);

void authenticationResult;
void membershipsResult;
