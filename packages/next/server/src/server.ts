/** node:http around the handler; loopback bind by default; the TTL sweep ends idle
 *  engine sessions on every agent. */
import { createServer } from 'node:http';
import { WireHandler, type ServerConfig } from './wire-handler.js';

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const SWEEP_EVERY_MS = 1000;

export class Server {
  static start(cfg: ServerConfig): Promise<{ readonly url: string; close(): Promise<void> }> {
    const handler = new WireHandler(cfg);
    const http = createServer((req, res) => {
      void handler.handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    const ttl = cfg.sessionTtlMs ?? DEFAULT_TTL_MS;
    const sweep = setInterval(() => {
      for (const engineId of handler.sessions.idle(ttl)) {
        for (const agent of Object.values(cfg.agents)) agent.endSession(engineId);
      }
    }, Math.min(ttl, SWEEP_EVERY_MS));
    sweep.unref();
    return new Promise(resolve => {
      http.listen(cfg.port ?? 0, cfg.bind ?? '127.0.0.1', () => {
        const address = http.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        resolve({
          url: `http://${cfg.bind ?? '127.0.0.1'}:${port}`,
          close: () => new Promise<void>(done => {
            clearInterval(sweep);
            http.closeAllConnections();
            http.close(() => { done(); });
          })
        });
      });
    });
  }
}
