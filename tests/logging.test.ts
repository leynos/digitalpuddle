/** @file Unit tests for structured request logging and REST error logging helpers. */
import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import type {NextFunction} from 'express';
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';
import {z} from 'zod';
import {registerStructuredRequestLogger} from '../src/extend-api.ts';
import {errorDetails, logRestHandlerError, withErrorLogging, withErrorLoggingForHandlers} from '../src/rest/index.ts';

type FoundationRouter = Parameters<typeof registerStructuredRequestLogger>[0];
type SimulationHandler = SimulationHandlers[string];
type MockRequest = {
  method: string;
  path: string;
  originalUrl?: string;
  url?: string;
};
type MockResponse = {
  statusCode: number;
  on: (event: string, listener: () => void) => void;
  emitFinish: () => void;
};
type CapturedMiddleware = (request: MockRequest, response: MockResponse, next: NextFunction) => void;
type CapturingRouter = {use: (fn: CapturedMiddleware) => void};

// SAFETY: The request logger setup calls only `use`, which this fixture captures.
const asFoundationRouter = (router: CapturingRouter): FoundationRouter => router as FoundationRouter;

const noopNext: NextFunction = () => {};

// SAFETY: These test handlers do not inspect the framework callback argument.
const stubSimulationRoute = {} as Parameters<SimulationHandler>[4];

const stubArgs = (): Parameters<SimulationHandler> => [
  // SAFETY: The wrapped handlers in these tests do not inspect the request context.
  {} as Parameters<SimulationHandler>[0],
  // SAFETY: The wrapped handlers in these tests do not inspect the request.
  {} as Parameters<SimulationHandler>[1],
  // SAFETY: The wrapped handlers in these tests do not inspect the response.
  {} as Parameters<SimulationHandler>[2],
  noopNext,
  stubSimulationRoute
];

const createMockResponse = (): MockResponse => {
  const finishListeners: Array<() => void> = [];
  return {
    statusCode: 200,
    on(event: string, listener: () => void) {
      if (event === 'finish') {
        finishListeners.push(listener);
      }
    },
    emitFinish() {
      for (const listener of finishListeners) {
        listener();
      }
    }
  };
};

const requireMiddleware = (middleware: CapturedMiddleware | undefined): CapturedMiddleware => {
  if (middleware === undefined) {
    throw new Error('request logger middleware was not registered');
  }
  return middleware;
};

const requireHandler = (handler: SimulationHandler | undefined): SimulationHandler => {
  if (handler === undefined) {
    throw new Error('expected handler was not registered');
  }
  return handler;
};

const responseLogSchema = z.object({
  event: z.literal('digitalpuddle.http.response'),
  method: z.string(),
  path: z.string(),
  status: z.number(),
  durationMs: z.number()
});
const errorLogSchema = z.object({
  event: z.literal('digitalpuddle.rest.handler.error'),
  operationId: z.string(),
  error: z.object({name: z.string(), message: z.string(), stack: z.string().optional()})
});
const successfulHandler: SimulationHandler = async () => ({
  status: 200,
  json: {ok: true}
});
const successfulHandlerResultSchema = z.object({status: z.number(), json: z.object({ok: z.boolean()})});

describe('registerStructuredRequestLogger', () => {
  let previousRequestLog: string | undefined;
  let originalConsoleInfo: typeof console.info;

  beforeEach(() => {
    previousRequestLog = process.env.DIGITALPUDDLE_REQUEST_LOG;
    originalConsoleInfo = console.info.bind(console);
  });

  afterEach(() => {
    if (previousRequestLog === undefined) {
      delete process.env.DIGITALPUDDLE_REQUEST_LOG;
    } else {
      process.env.DIGITALPUDDLE_REQUEST_LOG = previousRequestLog;
    }

    console.info = originalConsoleInfo;
  });

  const createCaptureRouter = () => {
    let middleware: CapturedMiddleware | undefined;
    const router = {
      use: (fn: CapturedMiddleware) => {
        middleware = fn;
      }
    };
    return {
      router: asFoundationRouter(router),
      getMiddleware: () => middleware
    };
  };

  it('does not register middleware when DIGITALPUDDLE_REQUEST_LOG is unset', () => {
    delete process.env.DIGITALPUDDLE_REQUEST_LOG;
    let useCalls = 0;
    const router = {
      use: () => {
        useCalls++;
      }
    };
    registerStructuredRequestLogger(asFoundationRouter(router));
    expect(useCalls).toBe(0);
  });

  it('does not register middleware when DIGITALPUDDLE_REQUEST_LOG is "0"', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '0';
    let useCalls = 0;
    const router = {
      use: () => {
        useCalls++;
      }
    };
    registerStructuredRequestLogger(asFoundationRouter(router));
    expect(useCalls).toBe(0);
  });

  it('registers middleware when DIGITALPUDDLE_REQUEST_LOG is "1"', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    expect(getMiddleware()).toBeDefined();
  });

  it('registers middleware when DIGITALPUDDLE_REQUEST_LOG is "true"', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = 'true';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    expect(getMiddleware()).toBeDefined();
  });

  it('invokes next()', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    let nextCalls = 0;
    const next: NextFunction = () => {
      nextCalls++;
    };

    middleware({method: 'GET', path: '/x', url: '/x'}, createMockResponse(), next);

    expect(nextCalls).toBe(1);
  });

  it('logs a JSON line on response.finish with required keys', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    response.statusCode = 201;

    middleware({method: 'POST', path: '/items', url: '/items'}, response, noopNext);

    response.emitFinish();

    expect(logged).toHaveLength(1);
    const payload = responseLogSchema.parse(JSON.parse(logged[0]!));
    expect(payload).toHaveProperty('event');
    expect(payload).toHaveProperty('method');
    expect(payload).toHaveProperty('path');
    expect(payload).toHaveProperty('status');
    expect(payload).toHaveProperty('durationMs');
  });

  it('sets event to digitalpuddle.http.response', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware({method: 'GET', path: '/z', url: '/z'}, response, noopNext);
    response.emitFinish();

    const payload = responseLogSchema.parse(JSON.parse(logged[0]!));
    expect(payload.event).toBe('digitalpuddle.http.response');
  });

  it('records non-negative durationMs', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware({method: 'GET', path: '/z', url: '/z'}, response, noopNext);
    response.emitFinish();

    const payload = responseLogSchema.parse(JSON.parse(logged[0]!));
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(payload.durationMs)).toBe(true);
  });

  it('uses request.path when non-empty', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware({method: 'GET', path: '/explicit', originalUrl: '/ignored', url: '/ignored'}, response, noopNext);
    response.emitFinish();

    expect(responseLogSchema.parse(JSON.parse(logged[0]!)).path).toBe('/explicit');
  });

  it('uses pathname from originalUrl when path is empty', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware!({method: 'GET', path: '', originalUrl: '/from-original?x=1', url: '/fallback'}, response, noopNext);
    response.emitFinish();

    expect(responseLogSchema.parse(JSON.parse(logged[0]!)).path).toBe('/from-original');
  });

  it('falls back to "/" when path and originalUrl are absent', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware({method: 'GET', path: ''}, response, noopNext);
    response.emitFinish();

    expect(responseLogSchema.parse(JSON.parse(logged[0]!)).path).toBe('/');
  });

  it('falls back to "/" when originalUrl cannot be parsed', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = requireMiddleware(getMiddleware());

    const logged: string[] = [];
    console.info = (message?: string) => {
      logged.push(message ?? '');
    };

    const response = createMockResponse();
    middleware({method: 'GET', path: '', originalUrl: 'http://%%bad%%', url: '/'}, response, noopNext);
    response.emitFinish();

    expect(responseLogSchema.parse(JSON.parse(logged[0]!)).path).toBe('/');
  });
});

describe('REST error logging helpers', () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error.bind(console);
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('errorDetails returns name and message for Error instances', () => {
    const error = new Error('boom');
    expect(errorDetails(error)).toEqual({
      name: error.name,
      message: error.message
    });
  });

  it('errorDetails returns NonError envelope for non-Error values', () => {
    expect(errorDetails(42)).toEqual({
      name: 'NonError',
      message: '42'
    });
  });

  it('logRestHandlerError writes structured JSON to console.error', () => {
    const lines: string[] = [];
    console.error = (message?: string) => {
      lines.push(message ?? '');
    };

    logRestHandlerError('my.operation', new Error('failed'));

    expect(lines).toHaveLength(1);
    const payload = errorLogSchema.parse(JSON.parse(lines[0]!));
    expect(payload.event).toBe('digitalpuddle.rest.handler.error');
    expect(payload.operationId).toBe('my.operation');
    expect(payload.error.name).toBe('Error');
    expect(payload.error.message).toBe('failed');
    expect(payload.error.stack).toBeUndefined();
  });

  it('withErrorLogging returns the handler result when the handler succeeds', async () => {
    const wrapped = withErrorLogging('ok.op', successfulHandler);

    const result = await wrapped(...stubArgs());
    expect(successfulHandlerResultSchema.parse(result)).toEqual({
      status: 200,
      json: {ok: true}
    });
  });

  it('withErrorLogging logs and rethrows when the handler throws', async () => {
    const lines: string[] = [];
    console.error = (message?: string) => {
      lines.push(message ?? '');
    };

    const wrapped = withErrorLogging('bad.op', async () => {
      throw new Error('nope');
    });

    await expect(wrapped(...stubArgs())).rejects.toThrow('nope');

    expect(lines).toHaveLength(1);
    const payload = errorLogSchema.parse(JSON.parse(lines[0]!));
    expect(payload.event).toBe('digitalpuddle.rest.handler.error');
    expect(payload.operationId).toBe('bad.op');
  });

  it('withErrorLoggingForHandlers wraps every handler in the map', async () => {
    const lines: string[] = [];
    console.error = (message?: string) => {
      lines.push(message ?? '');
    };

    const handlers: SimulationHandlers = {
      alpha: async () => {},
      beta: async () => {
        throw new Error('beta failed');
      }
    };
    const wrapped = withErrorLoggingForHandlers(handlers);

    const wrappedAlpha = requireHandler(wrapped['alpha']);
    const wrappedBeta = requireHandler(wrapped['beta']);

    expect(wrappedAlpha).not.toBe(handlers['alpha']);
    expect(wrappedBeta).not.toBe(handlers['beta']);

    await wrappedAlpha(...stubArgs());
    expect(lines).toHaveLength(0);

    await expect(wrappedBeta(...stubArgs())).rejects.toThrow('beta failed');
    expect(lines).toHaveLength(1);
    expect(errorLogSchema.parse(JSON.parse(lines[0]!)).operationId).toBe('beta');
  });
});
