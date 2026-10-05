// Browser-free command context.
//
// Domain command bodies must not depend on the browser. Everything they need
// that is not pure data (clock, id generation, event logging, subscriber
// notification) is injected here so the SAME command code can run inside the
// React store and inside the Cloudflare Worker.
//
// See docs/prototype/cloud-full-stack-architecture.md.

export interface CommandContext {
  /** ISO-8601 timestamp for this command. Injected so rules stay deterministic in tests. */
  now(): string;
  /** Unique id generator, e.g. newId('CNT') -> 'CNT-<uuid>'. */
  newId(prefix: string): string;
  /** Append a domain event line. Store: local event feed. Worker: audit_events row. */
  log(text: string, ref: string, type?: string): void;
  /** Notify subscribers. Store: re-render. Worker: no-op. */
  notify(): void;
}

/** Context used by the Worker: wall clock, crypto ids, no-op notification. */
export const runtimeCommandContext = (
  log: CommandContext['log'] = () => {},
  notify: CommandContext['notify'] = () => {}
): CommandContext => ({
  now: () => new Date().toISOString(),
  newId: (prefix: string) => `${prefix}-${crypto.randomUUID()}`,
  log,
  notify
});
