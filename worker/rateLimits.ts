import type { RouteContext } from './router';
import type { RateLimiterBinding } from './env';
import { ApiError } from './errors';

export type RateLimitBindingName = 'RATE_LIMITER';

export function requireRateLimitBindings(ctx: RouteContext, ...bindingNames: RateLimitBindingName[]): void {
  if (!['production', 'staging'].includes(ctx.env.ENVIRONMENT ?? 'local')) return;
  const missing = bindingNames.find(name => !ctx.env[name]);
  if (missing) throw new ApiError('UNAVAILABLE', 'Request protection is temporarily unavailable.');
}

/**
 * Applies a named Cloudflare rate-limit binding. Production fails closed when
 * a required binding is absent; local development remains usable without it.
 */
export async function enforceNamedRateLimit(
  ctx: RouteContext,
  bindingName: RateLimitBindingName,
  key: string
): Promise<void> {
  requireRateLimitBindings(ctx, bindingName);
  const limiter: RateLimiterBinding | undefined = ctx.env[bindingName];
  if (!limiter) {
    return;
  }
  if (!(await limiter.limit({ key })).success) {
    throw new ApiError('RATE_LIMITED', 'Too many requests. Wait and try again.');
  }
}
