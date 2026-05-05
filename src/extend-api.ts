/**
 * @file Express router extension hooks for the simulation server.
 *
 * This module composes caller-provided router extensions with the built-in
 * routes supplied to `createFoundationSimulationServer`, wiring in GraphQL via
 * `createHandler` and exposing the shared `ExtendedSimulationStore`.
 */
import type {createFoundationSimulationServer} from '@simulacrum/foundation-simulator';
import {stringify} from 'querystring';
import {createHandler} from './graphql/handler.ts';
import type {ExtendedSimulationStore} from './store/index.ts';

type FoundationExtendRouter = NonNullable<Parameters<typeof createFoundationSimulationServer>[0]['extendRouter']>;
type FoundationRouter = Parameters<FoundationExtendRouter>[0];

const isStructuredRequestLoggingEnabled = () => {
  const {DIGITALPUDDLE_REQUEST_LOG: requestLog} = process.env;

  return requestLog === '1' || requestLog === 'true';
};

const toRequestPath = (
  pathFromRequest: string,
  originalUrl: string | undefined,
  fallbackUrl: string | undefined
): string => {
  if (pathFromRequest) {
    return pathFromRequest;
  }

  try {
    const candidate = originalUrl ?? fallbackUrl ?? '';
    return new URL(candidate, 'http://localhost').pathname;
  } catch {
    return '/';
  }
};

export const registerStructuredRequestLogger = (router: FoundationRouter) => {
  if (!isStructuredRequestLoggingEnabled()) {
    return;
  }

  router.use((request, response, next) => {
    const startedAt = performance.now();
    const requestPath = toRequestPath(request.path, request.originalUrl, request.url);

    response.on('finish', () => {
      console.info(
        JSON.stringify({
          event: 'digitalpuddle.http.response',
          method: request.method,
          path: requestPath,
          status: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000
        })
      );
    });

    next();
  });
};

/**
 * Wraps a caller-provided router extension with Simulacat Core's built-in
 * routes.
 *
 * @example
 * ```ts
 * const router = extendRouter((app) => {
 *   app.get('/hello', (_request, response) => response.json({ok: true}));
 * });
 * ```
 */
export const extendRouter =
  (
    extend:
      | ((router: Parameters<FoundationExtendRouter>[0], simulationStore: ExtendedSimulationStore) => void)
      | undefined
  ) =>
  (router: Parameters<FoundationExtendRouter>[0], simulationStore: ExtendedSimulationStore) => {
    registerStructuredRequestLogger(router);

    if (extend) {
      extend(router, simulationStore);
    }

    router.get('/health', (_, response) => {
      response.send({status: 'ok'});
    });

    router.use('/graphql', createHandler(simulationStore));

    router.get(['/login/oauth/authorize'], (request, response) => {
      const {redirect_uri, state, env} = request.query as {
        [k: string]: string;
      };
      const code = 'dev_code';
      const qs = stringify({
        code,
        env,
        state
      });

      const routerUrl = `${redirect_uri}?${qs}`;
      response.status(302).redirect(routerUrl);
    });

    router.post(['/login/oauth/access_token', '/api/v3/app/installations/:id/access_tokens'], (_request, response) => {
      // for /login/oauth/access_token
      const access_token = 'dev_access_token';
      // for /app/installations/:id/access_tokens
      const token = 'dev_token';
      const refresh_token = 'dev_refresh_token';
      const repository_selection = 'all';
      response.status(200).json({
        access_token,
        refresh_token,
        token,
        repository_selection
      });
    });
  };
