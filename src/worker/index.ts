/**
 * @file Worker orchestration contracts for future asynchronous transitions.
 *
 * This module defines the runtime ports that future workers will use for time
 * and engine interaction. It keeps asynchronous state-transition orchestration
 * separate from HTTP handlers while allowing tests to assemble a runtime from
 * caller-provided ports today.
 */
import type {KubernetesEngine} from '../engines/index.ts';

export type WorkerClock = {
  readonly now: () => Date;
};

export type WorkerPorts = {
  readonly clock: WorkerClock;
  readonly kubernetesEngine?: KubernetesEngine;
};

export type WorkerRuntime = {
  readonly ports: WorkerPorts;
};

export const createWorkerRuntime = (ports: WorkerPorts): WorkerRuntime => ({ports});
