export interface R2LockEnvironment {
  CLOUDFLARE_R2_LOCKS_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

export function resolveR2LockToken(environment: R2LockEnvironment): string | undefined {
  return environment.CLOUDFLARE_R2_LOCKS_TOKEN ?? environment.CLOUDFLARE_API_TOKEN;
}
