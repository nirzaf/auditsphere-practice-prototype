// Cloudflare runtime types for the Worker.
//
// `wrangler types --config wrangler.jsonc worker/worker-configuration.d.ts` is the
// canonical way to refresh this surface, but that command starts miniflare, which
// cannot create its cache directory in every sandboxed environment. The committed
// generated file provides the ambient globals the Worker uses: D1Database, R2Bucket,
// Fetcher, ExecutionContext, ScheduledController, Request, Response, Headers, URL,
// crypto and TextEncoder/TextDecoder.
//
// The Worker's own binding contract lives in worker/env.ts so the deployed
// bindings stay explicit rather than being inferred from a generated global Env.
/// <reference path="./worker-configuration.d.ts" />
