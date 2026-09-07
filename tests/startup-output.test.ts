/** @file Behavioural tests for CLI startup output and route guidance. */
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {describe, expect, it} from 'bun:test';

import {normaliseStartupOutput} from './support/startup-output';

const projectRoot = path.resolve(import.meta.dirname, '..');

type StartedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: Promise<string>;
};

const childProcessEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const {FORCE_COLOR: _forceColor, ...env} = process.env;
  return {
    ...env,
    ...overrides
  };
};

const getOpenPort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('expected an IPv4 or IPv6 listen address')));
        return;
      }

      const {port} = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const runCommand = (command: string, args: string[], timeoutMs = 30_000) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: childProcessEnv()
    });
    let output = '';
    let mainTimeout: ReturnType<typeof setTimeout> | undefined;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    const clearKillTimeout = () => {
      if (killTimeout !== undefined) {
        clearTimeout(killTimeout);
        killTimeout = undefined;
      }
    };

    const clearMainTimeout = () => {
      if (mainTimeout !== undefined) {
        clearTimeout(mainTimeout);
        mainTimeout = undefined;
      }
    };

    mainTimeout = setTimeout(() => {
      mainTimeout = undefined;
      timedOut = true;
      child.kill('SIGTERM');
      killTimeout = setTimeout(() => {
        killTimeout = undefined;
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    child.on('error', (error) => {
      clearMainTimeout();
      clearKillTimeout();
      reject(error);
    });
    child.once('exit', (code) => {
      clearMainTimeout();
      clearKillTimeout();
      if (timedOut) {
        reject(new Error(`command timed out: ${command} ${args.join(' ')}\n${output}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`command failed with exit code ${code}: ${command} ${args.join(' ')}\n${output}`));
    });
  });

const startProcess = (command: string, args: string[], port: number, expectedOutput: string): StartedProcess => {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: childProcessEnv({PORT: String(port)})
  });

  const output = new Promise<string>((resolve, reject) => {
    let combinedOutput = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`server did not print startup guidance\n${combinedOutput}`));
    }, 15_000);

    const settleResolve = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };

    const settleReject = (reason: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(reason);
    };

    const capture = (data: Buffer) => {
      combinedOutput += data.toString();
      if (combinedOutput.includes(expectedOutput)) {
        settleResolve(combinedOutput);
      }
    };

    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (error) => {
      settleReject(error);
    });
    child.on('exit', (code, signal) => {
      settleReject(
        new Error(`server exited before guidance with code ${code} and signal ${signal}\n${combinedOutput}`)
      );
    });
  });

  return {child, output};
};

const expectSimulationRouteToRespond = async (port: number) => {
  const response = await fetch(`http://localhost:${port}/simulation`);

  expect(response.status).toBe(200);
};

const stopProcess = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  let termTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTermTimer = () => {
    if (termTimer !== undefined) {
      clearTimeout(termTimer);
      termTimer = undefined;
    }
  };

  const clearKillTimer = () => {
    if (killTimer !== undefined) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanupListenersAndTimers = () => {
      clearTermTimer();
      clearKillTimer();
      child.off('exit', onExit);
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      cleanupListenersAndTimers();
      resolve();
    };

    const finishErr = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupListenersAndTimers();
      reject(error);
    };

    const onExit = () => {
      finishOk();
    };

    child.on('exit', onExit);

    if (child.exitCode !== null || child.signalCode !== null) {
      finishOk();
      return;
    }

    child.kill('SIGTERM');

    termTimer = setTimeout(() => {
      termTimer = undefined;
      if (child.exitCode !== null || child.signalCode !== null) {
        finishOk();
        return;
      }

      child.kill('SIGKILL');

      killTimer = setTimeout(() => {
        killTimer = undefined;
        if (child.exitCode !== null || child.signalCode !== null) {
          finishOk();
          return;
        }
        finishErr(new Error('child did not exit after SIGKILL'));
      }, 2000);
    }, 5000);
  });
};

const commonJsStartupGuidance = (port: number) =>
  `DigitalPuddle simulation server started at http://localhost:${port}\nVisit http://localhost:${port}/simulation to view all available routes.`;

const exampleStartupGuidance = (port: number) =>
  `DigitalPuddle baseline server started at http://localhost:${port}\nVisit http://localhost:${port}/simulation to view all available routes.`;

describe('startup output', () => {
  it('prints DigitalPuddle route guidance for the built CommonJS CLI', async () => {
    await runCommand('bun', ['run', 'build']);
    const port = await getOpenPort();
    const {child, output} = startProcess('node', ['./bin/start.cjs'], port, commonJsStartupGuidance(port));

    try {
      const rawOutput = await output;
      const normalisedOutput = normaliseStartupOutput(rawOutput, port);
      expect(normalisedOutput).toMatchSnapshot();
      await expectSimulationRouteToRespond(port);
    } finally {
      await stopProcess(child);
    }
  }, 45_000);

  it('prints DigitalPuddle route guidance for the TypeScript example', async () => {
    const port = await getOpenPort();
    const {child, output} = startProcess(
      'node',
      ['--experimental-transform-types', './example/start.ts'],
      port,
      exampleStartupGuidance(port)
    );

    try {
      const rawOutput = await output;
      const normalisedOutput = normaliseStartupOutput(rawOutput, port);
      expect(normalisedOutput).toMatchSnapshot();
      await expectSimulationRouteToRespond(port);
    } finally {
      await stopProcess(child);
    }
  });
});
