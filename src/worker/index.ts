/** @file Worker orchestration contracts for future asynchronous transitions. */
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
