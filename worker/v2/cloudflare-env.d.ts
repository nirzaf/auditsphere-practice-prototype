// Cloudflare runtime types for the v2 Worker.
//
// `wrangler types --config wrangler.jsonc worker/v2/cloudflare-env.d.ts` is the
// canonical way to refresh this file, but that command starts miniflare, which
// cannot create its cache directory in every sandboxed environment. This file
// therefore references the repo's already-generated runtime type surface
// (worker/worker-configuration.d.ts) for the ambient globals the Worker uses:
// D1Database, R2Bucket, Fetcher, ExecutionContext, ScheduledController, Request,
// Response, Headers, URL, crypto and TextEncoder/TextDecoder.
//
// The Worker's own binding contract lives in worker/v2/env.ts so the deployed
// bindings stay explicit rather than being inferred from a generated global Env.
/// <reference path="../../worker/worker-configuration.d.ts" />
