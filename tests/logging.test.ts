/** @file Unit tests for structured request logging and REST error logging helpers. */
import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import type {NextFunction} from 'express';
import type {SimulationHandlers} from '@simulacrum/foundation-simulator';
import {registerStructuredRequestLogger} from '../src/extend-api.ts';
import {errorDetails, logRestHandlerError, withErrorLogging, withErrorLoggingForHandlers} from '../src/rest/index.ts';

type FoundationRouter = Parameters<typeof registerStructuredRequestLogger>[0];
type SimulationHandler = SimulationHandlers[string];

const stubSimulationRoute = {} as Parameters<SimulationHandler>[4];

const stubArgs = (): Parameters<SimulationHandler> => [
  {} as Parameters<SimulationHandler>[0],
  {} as Parameters<SimulationHandler>[1],
  {} as Parameters<SimulationHandler>[2],
  (() => {}) as NextFunction,
  stubSimulationRoute
];

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
    let middleware:
      | ((request: Record<string, unknown>, response: MockResponse, next: NextFunction) => void)
      | undefined;
    const router = {
      use: (fn: (request: Record<string, unknown>, response: MockResponse, next: NextFunction) => void) => {
        middleware = fn;
      }
    };
    return {
      router: router as unknown as FoundationRouter,
      getMiddleware: () => middleware
    };
  };

  type MockResponse = {
    statusCode: number;
    on: (event: string, listener: () => void) => void;
    emitFinish: () => void;
  };

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

  it('does not register middleware when DIGITALPUDDLE_REQUEST_LOG is unset', () => {
    delete process.env.DIGITALPUDDLE_REQUEST_LOG;
    let useCalls = 0;
    const router = {
      use: () => {
        useCalls++;
      }
    };
    registerStructuredRequestLogger(router as unknown as FoundationRouter);
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
    registerStructuredRequestLogger(router as unknown as FoundationRouter);
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
    const middleware = getMiddleware();

    let nextCalls = 0;
    const next = () => {
      nextCalls++;
    };

    middleware!({method: 'GET', path: '/x', url: '/x'}, createMockResponse(), next as NextFunction);

    expect(nextCalls).toBe(1);
  });

  it('logs a JSON line on response.finish with required keys', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    response.statusCode = 201;

    middleware!({method: 'POST', path: '/items', url: '/items'}, response, (() => {}) as NextFunction);

    response.emitFinish();

    expect(logged).toHaveLength(1);
    const payload = JSON.parse(logged[0]!) as Record<string, unknown>;
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
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!({method: 'GET', path: '/z', url: '/z'}, response, (() => {}) as NextFunction);
    response.emitFinish();

    const payload = JSON.parse(logged[0]!) as {event: string};
    expect(payload.event).toBe('digitalpuddle.http.response');
  });

  it('records non-negative durationMs', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!({method: 'GET', path: '/z', url: '/z'}, response, (() => {}) as NextFunction);
    response.emitFinish();

    const payload = JSON.parse(logged[0]!) as {durationMs: number};
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(payload.durationMs)).toBe(true);
  });

  it('uses request.path when non-empty', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!(
      {method: 'GET', path: '/explicit', originalUrl: '/ignored', url: '/ignored'},
      response,
      (() => {}) as NextFunction
    );
    response.emitFinish();

    expect((JSON.parse(logged[0]!) as {path: string}).path).toBe('/explicit');
  });

  it('uses pathname from originalUrl when path is empty', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!(
      {method: 'GET', path: '', originalUrl: '/from-original?x=1', url: '/fallback'},
      response,
      (() => {}) as NextFunction
    );
    response.emitFinish();

    expect((JSON.parse(logged[0]!) as {path: string}).path).toBe('/from-original');
  });

  it('falls back to "/" when path and originalUrl are absent', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!({method: 'GET', path: ''}, response, (() => {}) as NextFunction);
    response.emitFinish();

    expect((JSON.parse(logged[0]!) as {path: string}).path).toBe('/');
  });

  it('falls back to "/" when originalUrl cannot be parsed', () => {
    process.env.DIGITALPUDDLE_REQUEST_LOG = '1';
    const {router, getMiddleware} = createCaptureRouter();
    registerStructuredRequestLogger(router);
    const middleware = getMiddleware()!;

    const logged: string[] = [];
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };

    const response = createMockResponse();
    middleware!(
      {method: 'GET', path: '', originalUrl: 'http://%%bad%%', url: '/'},
      response,
      (() => {}) as NextFunction
    );
    response.emitFinish();

    expect((JSON.parse(logged[0]!) as {path: string}).path).toBe('/');
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

  it('errorDetails returns name, message, and stack for Error instances', () => {
    const error = new Error('boom');
    expect(errorDetails(error)).toEqual({
      name: error.name,
      message: error.message,
      stack: error.stack
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
    console.error = (message?: unknown) => {
      lines.push(String(message));
    };

    logRestHandlerError('my.operation', new Error('failed'));

    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!) as {
      event: string;
      operationId: string;
      error: {name: string; message: string; stack?: string};
    };
    expect(payload.event).toBe('digitalpuddle.rest.handler.error');
    expect(payload.operationId).toBe('my.operation');
    expect(payload.error.name).toBe('Error');
    expect(payload.error.message).toBe('failed');
    expect(typeof payload.error.stack).toBe('string');
  });

  it('withErrorLogging returns the handler result when the handler succeeds', async () => {
    const wrapped = withErrorLogging('ok.op', (async () => ({
      status: 200,
      json: {ok: true}
    })) as unknown as SimulationHandler);

    const result = (await wrapped(...stubArgs())) as unknown as {status: number; json: {ok: boolean}};
    expect(result).toEqual({status: 200, json: {ok: true}});
  });

  it('withErrorLogging logs and rethrows when the handler throws', async () => {
    const lines: string[] = [];
    console.error = (message?: unknown) => {
      lines.push(String(message));
    };

    const wrapped = withErrorLogging('bad.op', async () => {
      throw new Error('nope');
    });

    await expect(wrapped(...stubArgs())).rejects.toThrow('nope');

    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!) as {event: string; operationId: string};
    expect(payload.event).toBe('digitalpuddle.rest.handler.error');
    expect(payload.operationId).toBe('bad.op');
  });

  it('withErrorLoggingForHandlers wraps every handler in the map', async () => {
    const lines: string[] = [];
    console.error = (message?: unknown) => {
      lines.push(String(message));
    };

    const handlers: {alpha: SimulationHandler; beta: SimulationHandler} = {
      alpha: async () => Promise.resolve(),
      beta: async () => Promise.reject(new Error('beta failed'))
    };
    const wrapped = withErrorLoggingForHandlers(handlers as SimulationHandlers) as typeof handlers;

    const wrappedAlpha = wrapped.alpha;
    const wrappedBeta = wrapped.beta;
    expect(wrappedAlpha).toBeDefined();
    expect(wrappedBeta).toBeDefined();

    expect(wrappedAlpha).not.toBe(handlers.alpha);
    expect(wrappedBeta).not.toBe(handlers.beta);

    await wrappedAlpha!(...stubArgs());
    expect(lines).toHaveLength(0);

    await expect(wrappedBeta!(...stubArgs())).rejects.toThrow('beta failed');
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]!) as {operationId: string}).operationId).toBe('beta');
  });
});
