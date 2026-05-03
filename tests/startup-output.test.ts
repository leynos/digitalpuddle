/** @file Behavioural tests for CLI startup output and route guidance. */
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import {describe, expect, it} from 'bun:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

type StartedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: Promise<string>;
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
      env: process.env
    });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`command timed out: ${command} ${args.join(' ')}\n${output}`));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
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
    env: {
      ...process.env,
      PORT: String(port)
    }
  });

  const output = new Promise<string>((resolve, reject) => {
    let combinedOutput = '';
    const timeout = setTimeout(() => {
      reject(new Error(`server did not print startup guidance\n${combinedOutput}`));
    }, 15_000);

    const capture = (data: Buffer) => {
      combinedOutput += data.toString();
      if (combinedOutput.includes(expectedOutput)) {
        clearTimeout(timeout);
        resolve(combinedOutput);
      }
    };

    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before guidance with code ${code} and signal ${signal}\n${combinedOutput}`));
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

  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill('SIGTERM');
  await exitPromise;
};

describe('startup output', () => {
  it('prints DigitalPuddle route guidance for the built CommonJS CLI', async () => {
    await runCommand('bun', ['run', 'build']);
    const port = await getOpenPort();
    const expectedOutput = `DigitalPuddle simulation server started at http://localhost:${port}\nVisit http://localhost:${port}/simulation to view all available routes.`;
    const {child, output} = startProcess('node', ['./bin/start.cjs'], port, expectedOutput);

    try {
      await expect(output).resolves.toContain(expectedOutput);
      await expectSimulationRouteToRespond(port);
    } finally {
      await stopProcess(child);
    }
  }, 45_000);

  it('prints DigitalPuddle route guidance for the TypeScript example', async () => {
    const port = await getOpenPort();
    const expectedOutput = `DigitalPuddle baseline server started at http://localhost:${port}\nVisit http://localhost:${port}/simulation to view all available routes.`;
    const {child, output} = startProcess(
      'node',
      ['--experimental-transform-types', './example/start.ts'],
      port,
      expectedOutput
    );

    try {
      await expect(output).resolves.toContain(expectedOutput);
      await expectSimulationRouteToRespond(port);
    } finally {
      await stopProcess(child);
    }
  });
});
