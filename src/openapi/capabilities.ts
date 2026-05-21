/** @file Release capability policy for DigitalPuddle OpenAPI operations. */
import {z} from 'zod';

export const capabilityValues = ['scriptable', 'engine-backed', 'stubbed', 'unsupported'] as const;

export type Capability = (typeof capabilityValues)[number];

export const capabilitySchema = z.enum(capabilityValues);

export const httpMethodValues = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'] as const;

export type HttpMethod = (typeof httpMethodValues)[number];

export const httpMethodSchema = z.enum(httpMethodValues);

export const runtimeBehaviourValues = ['handler', 'worker', 'fixture', 'not-implemented'] as const;

export type RuntimeBehaviour = (typeof runtimeBehaviourValues)[number];

export const runtimeBehaviourSchema = z.enum(runtimeBehaviourValues);

export const capabilityManifestEntrySchema = z
  .object({
    operationId: z.string().min(1),
    method: httpMethodSchema,
    path: z.string().min(1).startsWith('/v2/').or(z.literal('/v2')),
    capability: capabilitySchema,
    releaseStage: z.string().min(1),
    productArea: z.string().min(1),
    exposeInDocs: z.boolean().default(true),
    runtime: z.object({
      behaviour: runtimeBehaviourSchema,
      handlerRequired: z.boolean().default(false),
      workerRequired: z.boolean().default(false),
      enginePortRequired: z.boolean().default(false),
      deterministicFixture: z.boolean().default(false),
      unsupportedResponseStatus: z.literal(501).optional()
    }),
    followOnPhase: z.string().min(1).optional(),
    notes: z.string().min(1).optional()
  })
  .superRefine((entry, context) => {
    if (entry.capability === 'unsupported' && entry.runtime.unsupportedResponseStatus !== 501) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'unsupported operations must carry 501 response metadata',
        path: ['runtime', 'unsupportedResponseStatus']
      });
    }

    if (entry.capability !== 'unsupported' && entry.runtime.unsupportedResponseStatus !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'only unsupported operations may carry 501 response metadata',
        path: ['runtime', 'unsupportedResponseStatus']
      });
    }

    if (entry.capability !== 'unsupported' && entry.runtime.behaviour === 'not-implemented') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'only unsupported operations may use not-implemented runtime behaviour',
        path: ['runtime', 'behaviour']
      });
    }

    if (entry.capability === 'engine-backed' && !entry.runtime.workerRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'engine-backed operations must require worker-owned orchestration',
        path: ['runtime', 'workerRequired']
      });
    }

    if (entry.capability === 'stubbed' && !entry.runtime.deterministicFixture) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stubbed operations must identify deterministic fixture behaviour',
        path: ['runtime', 'deterministicFixture']
      });
    }
  });

export type CapabilityManifestEntry = z.infer<typeof capabilityManifestEntrySchema>;
export type CapabilityManifestEntryInput = z.input<typeof capabilityManifestEntrySchema>;

export const isSupportedCapability = (capability: Capability): boolean => capability !== 'unsupported';

export const requiresEnginePort = (entry: CapabilityManifestEntry): boolean =>
  entry.capability === 'engine-backed' && entry.runtime.workerRequired && entry.runtime.enginePortRequired;

const normalizeOperationPath = (path: string): string => {
  const normalized = path.replaceAll(/\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
};

export const createOperationKey = (method: HttpMethod | string, path: string): string =>
  `${method.toUpperCase()} ${normalizeOperationPath(path)}`;

export const validateCapabilityManifest = (
  entries: readonly CapabilityManifestEntryInput[]
): readonly CapabilityManifestEntry[] => {
  const parsedEntries = z.array(capabilityManifestEntrySchema).parse(entries);
  const seenKeys = new Set<string>();

  for (const entry of parsedEntries) {
    const key = createOperationKey(entry.method, entry.path);
    if (seenKeys.has(key)) {
      throw new Error(`duplicate capability operation key: ${key}`);
    }
    seenKeys.add(key);
  }

  return parsedEntries;
};

const scriptableRuntime = {
  behaviour: 'handler',
  handlerRequired: true,
  workerRequired: false,
  enginePortRequired: false,
  deterministicFixture: false
} as const;

const engineBackedRuntime = {
  behaviour: 'worker',
  handlerRequired: true,
  workerRequired: true,
  enginePortRequired: true,
  deterministicFixture: false
} as const;

const stubbedRuntime = {
  behaviour: 'fixture',
  handlerRequired: true,
  workerRequired: false,
  enginePortRequired: false,
  deterministicFixture: true
} as const;

const unsupportedRuntime = {
  behaviour: 'not-implemented',
  handlerRequired: false,
  workerRequired: false,
  enginePortRequired: false,
  deterministicFixture: false,
  unsupportedResponseStatus: 501
} as const;

export const v1CapabilityManifest = validateCapabilityManifest([
  {
    operationId: 'account.get',
    method: 'GET',
    path: '/v2/account',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Account',
    runtime: scriptableRuntime
  },
  {
    operationId: 'account.getRateLimit',
    method: 'GET',
    path: '/v2/account/ratelimit',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Account',
    runtime: scriptableRuntime
  },
  {
    operationId: 'regions.list',
    method: 'GET',
    path: '/v2/regions',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Regions',
    runtime: scriptableRuntime
  },
  {
    operationId: 'sizes.list',
    method: 'GET',
    path: '/v2/sizes',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Sizes',
    runtime: scriptableRuntime
  },
  {
    operationId: 'images.list',
    method: 'GET',
    path: '/v2/images',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Images',
    runtime: scriptableRuntime
  },
  {
    operationId: 'sshKeys.list',
    method: 'GET',
    path: '/v2/ssh_keys',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'SSH keys',
    runtime: scriptableRuntime
  },
  {
    operationId: 'sshKeys.create',
    method: 'POST',
    path: '/v2/ssh_keys',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'SSH keys',
    runtime: scriptableRuntime
  },
  {
    operationId: 'sshKeys.get',
    method: 'GET',
    path: '/v2/ssh_keys/{id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'SSH keys',
    runtime: scriptableRuntime
  },
  {
    operationId: 'sshKeys.delete',
    method: 'DELETE',
    path: '/v2/ssh_keys/{id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'SSH keys',
    runtime: scriptableRuntime
  },
  {
    operationId: 'projects.list',
    method: 'GET',
    path: '/v2/projects',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Projects',
    runtime: scriptableRuntime
  },
  {
    operationId: 'projects.create',
    method: 'POST',
    path: '/v2/projects',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Projects',
    runtime: scriptableRuntime
  },
  {
    operationId: 'projects.get',
    method: 'GET',
    path: '/v2/projects/{id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Projects',
    runtime: scriptableRuntime
  },
  {
    operationId: 'projects.assignResources',
    method: 'POST',
    path: '/v2/projects/{id}/resources',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Projects',
    runtime: scriptableRuntime
  },
  {
    operationId: 'projects.listResources',
    method: 'GET',
    path: '/v2/projects/{id}/resources',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Projects',
    runtime: scriptableRuntime
  },
  {
    operationId: 'actions.get',
    method: 'GET',
    path: '/v2/actions/{id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Actions',
    runtime: scriptableRuntime
  },
  {
    operationId: 'kubernetes.getOptions',
    method: 'GET',
    path: '/v2/kubernetes/options',
    capability: 'stubbed',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: stubbedRuntime,
    notes: 'Static supported versions and options.'
  },
  {
    operationId: 'kubernetes.listClusters',
    method: 'GET',
    path: '/v2/kubernetes/clusters',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: scriptableRuntime
  },
  {
    operationId: 'kubernetes.createCluster',
    method: 'POST',
    path: '/v2/kubernetes/clusters',
    capability: 'engine-backed',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: engineBackedRuntime,
    notes: 'Provisions k3d-backed cluster.'
  },
  {
    operationId: 'kubernetes.getCluster',
    method: 'GET',
    path: '/v2/kubernetes/clusters/{id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: scriptableRuntime,
    notes: 'Status reflects worker progression.'
  },
  {
    operationId: 'kubernetes.deleteCluster',
    method: 'DELETE',
    path: '/v2/kubernetes/clusters/{id}',
    capability: 'engine-backed',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: engineBackedRuntime,
    notes: 'Tears down k3d cluster.'
  },
  {
    operationId: 'kubernetes.getKubeconfig',
    method: 'GET',
    path: '/v2/kubernetes/clusters/{id}/kubeconfig',
    capability: 'engine-backed',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: engineBackedRuntime,
    notes: 'Returns kubeconfig YAML.'
  },
  {
    operationId: 'kubernetes.listNodePools',
    method: 'GET',
    path: '/v2/kubernetes/clusters/{id}/node_pools',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: scriptableRuntime,
    notes: 'Lists initial pool state created with the cluster.'
  },
  {
    operationId: 'kubernetes.getNodePool',
    method: 'GET',
    path: '/v2/kubernetes/clusters/{id}/node_pools/{pool_id}',
    capability: 'scriptable',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: scriptableRuntime,
    notes: 'Retrieves initial pool state.'
  },
  {
    operationId: 'kubernetes.updateNodePool',
    method: 'PUT',
    path: '/v2/kubernetes/clusters/{id}/node_pools/{pool_id}',
    capability: 'unsupported',
    releaseStage: 'v1',
    productArea: 'Kubernetes',
    runtime: unsupportedRuntime,
    followOnPhase: 'node-pool scale operations',
    notes: 'Mutating node-pool operations are deferred by ADR 0006.'
  },
  {
    operationId: 'droplets.list',
    method: 'GET',
    path: '/v2/droplets',
    capability: 'unsupported',
    releaseStage: 'v1',
    productArea: 'Droplets',
    runtime: unsupportedRuntime,
    followOnPhase: 'Droplet slice',
    notes: 'Droplet routes and engines are deferred by ADR 0006.'
  },
  {
    operationId: 'spacesKeys.list',
    method: 'GET',
    path: '/v2/spaces/keys',
    capability: 'unsupported',
    releaseStage: 'v1',
    productArea: 'Spaces',
    runtime: unsupportedRuntime,
    followOnPhase: 'Spaces access-key control plane',
    notes: 'Spaces object traffic goes directly to MinIO in v1.'
  },
  {
    operationId: 'digitalocean.unsupported',
    method: 'GET',
    path: '/v2/{path*}',
    capability: 'unsupported',
    releaseStage: 'v1',
    productArea: 'Catch-all',
    exposeInDocs: false,
    runtime: unsupportedRuntime,
    notes: 'Fallback policy for known but unimplemented DigitalOcean operations.'
  }
] as const);
