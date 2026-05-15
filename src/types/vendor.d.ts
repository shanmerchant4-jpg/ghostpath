// Minimal ambient declarations for untyped dependencies used in GhostPath.

declare module 'http-proxy' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  interface WebProxyOptions {
    target?: string;
    changeOrigin?: boolean;
  }

  interface ProxyServer {
    web(req: IncomingMessage, res: ServerResponse, options: WebProxyOptions): void;
    on(
      event: 'error',
      listener: (err: Error, req: IncomingMessage, res: ServerResponse) => void,
    ): this;
  }

  class HttpProxy {
    static createProxyServer(options?: WebProxyOptions): ProxyServer;
  }

  export = HttpProxy;
}
