/** @file Git branch fixture schema and canonical branch keys. */
import {faker} from '@faker-js/faker';
import {z} from 'zod';

const GITHUB_API_HOST = 'https://api.github.com';

/**
 * Validates and normalizes a seeded GitHub branch fixture, deriving a commit
 * SHA and protection URL when they are omitted.
 *
 * @internal
 */
export const githubBranchSchema = z
  .object({
    owner: z.string(),
    repo: z.string(),
    name: z.string().optional().default('main'),
    commit: z
      .object({
        sha: z.string().optional(),
        url: z.string().optional()
      })
      .optional()
      .default({}),
    protected: z.boolean().optional().default(true),
    protection: z.record(z.string(), z.unknown()).optional(),
    protection_url: z.string().optional()
  })
  .transform((branch) => {
    const sha = branch.commit.sha ?? faker.git.commitSha();
    const commit = {
      sha,
      url: branch.commit.url ?? `${GITHUB_API_HOST}/repos/${branch.owner}/${branch.repo}/commits/${sha}`
    };
    const protection_url =
      branch.protection_url ??
      `${GITHUB_API_HOST}/repos/${branch.owner}/${branch.repo}/branches/${branch.name}/protection`;

    return {
      ...branch,
      commit,
      protection_url
    };
  });

export type GitHubBranch = z.infer<typeof githubBranchSchema>;

export const branchStoreKey = (branch: GitHubBranch) => `${branch.owner}/${branch.repo}:${branch.name}`;
