/** @file Compile-time tests for worker runtime contracts. */
import type {KubernetesEngine} from '../src/engines/index.ts';
import type {createWorkerRuntime, WorkerClock, WorkerPorts, WorkerRuntime} from '../src/worker/index.ts';

declare const clock: WorkerClock;

clock satisfies {
  readonly now: () => Date;
};

declare const ports: WorkerPorts;

ports satisfies {
  readonly clock: WorkerClock;
  readonly kubernetesEngine?: KubernetesEngine;
};

declare const runtime: WorkerRuntime;

runtime satisfies {
  readonly ports: WorkerPorts;
};

declare const createRuntime: typeof createWorkerRuntime;

createRuntime satisfies (ports: WorkerPorts) => WorkerRuntime;
