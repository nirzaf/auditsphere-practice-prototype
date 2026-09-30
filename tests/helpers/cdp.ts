export class CdpTab {
  private seq = 0;
  private pending = new Map<number, (message: any) => void>();
  private commands: string[] = [];
  readonly requests: string[] = [];
  readonly blockedExternalRequests: string[] = [];
  readonly exceptions: string[] = [];
  readonly networkFailures: string[] = [];

  constructor(
    private ws: WebSocket,
    private allowedOrigin: string,
    private additionalOrigins: string[] = []
  ) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Network.loadingFailed') this.networkFailures.push(message.params.errorText);
      if (message.method === 'Network.requestWillBeSent')
        this.requests.push(message.params.request.url);
      if (message.method === 'Fetch.requestPaused') {
        const url = message.params.request.url as string;
        let sameOrigin = false;
        try {
          sameOrigin = new URL(url).origin === this.allowedOrigin || this.additionalOrigins.includes(new URL(url).origin);
        } catch {}
        if (!sameOrigin) this.blockedExternalRequests.push(url);
        void this.command(
          sameOrigin ? 'Fetch.continueRequest' : 'Fetch.failRequest',
          sameOrigin
            ? { requestId: message.params.requestId }
            : { requestId: message.params.requestId, errorReason: 'BlockedByClient' }
        ).catch((error) => {
          const detail = String(error);
          // A page may cancel a request while CDP is delivering Fetch.requestPaused.
          // In that narrow race Chrome rejects the stale interception ID; it is not
          // an application exception and the request is already no longer pending.
          if (!/Fetch\.(?:continueRequest|failRequest): Invalid InterceptionId/i.test(detail))
            this.exceptions.push(detail);
        });
      }
      if (message.method === 'Runtime.exceptionThrown')
        this.exceptions.push(
          message.params.exceptionDetails.exception?.description ||
            message.params.exceptionDetails.text ||
            'browser exception'
        );
      if (message.id) this.pending.get(message.id)?.(message);
      if (message.id) this.pending.delete(message.id);
    });
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.seq;
    this.commands.push(
      `${id}:${method}${typeof params.expression === 'string' ? `(${params.expression.slice(0, 100)})` : ''}`
    );
    if (this.commands.length > 12) this.commands.shift();
    let timeout: ReturnType<typeof setTimeout>;
    const response = new Promise<any>((resolve, reject) => {
      this.pending.set(id, resolve);
      timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Chrome DevTools command timed out: ${method} (request ${id}; recent commands: ${this.commands.slice(-12).join(', ')})`
          )
        );
      }, 15000);
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    const message = await response.finally(() => clearTimeout(timeout));
    if (message.error) throw new Error(`${method}: ${message.error.message}`);
    return message.result;
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          'JavaScript evaluation failed'
      );
    return result.result.value as T;
  }

  async blockExternalHttp(): Promise<void> {
    await this.command('Fetch.enable', {
      patterns: [{ urlPattern: 'http://*/*' }, { urlPattern: 'https://*/*' }]
    });
  }

  close() {
    this.ws.close();
  }
}
