/** An in-process MCP server over loopback HTTP — the real wire, zero external network.
 *  Serves two tools and records the headers every request arrived with. */
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export interface McpFixture {
  readonly url: string;
  readonly seenHeaders: { readonly apiKey: string | undefined }[];
  close(): Promise<void>;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'fixture', version: '1.0.0' });
  server.registerTool('getBooking',
    { description: 'Reads one booking.', inputSchema: { id: z.string() } },
    ({ id }) => Promise.resolve({
      content: [{ type: 'text' as const, text: JSON.stringify({ id, status: 'CONFIRMED' }) }]
    }));
  server.registerTool('cancelBooking',
    { description: 'Cancels one booking.', inputSchema: { id: z.string() } },
    ({ id }) => Promise.resolve(id === 'bk_denied'
      ? { isError: true,
          content: [{ type: 'text' as const, text: 'the desk refused the cancellation' }] }
      : { content: [{ type: 'text' as const, text: JSON.stringify({ cancelled: id }) }] }));
  return server;
}

export function startMcpFixture(): Promise<McpFixture> {
  const seenHeaders: { apiKey: string | undefined }[] = [];
  const http = createServer((req, res) => {
    seenHeaders.push({ apiKey: req.headers['x-api-key'] as string | undefined });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { void transport.close(); });
    void buildServer().connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch(() => { res.statusCode = 500; res.end(); });
  });
  return new Promise(resolve => {
    http.listen(0, '127.0.0.1', () => {
      const address = http.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/mcp`,
        seenHeaders,
        close: () => new Promise<void>(done => {
          http.closeAllConnections();
          http.close(() => { done(); });
        })
      });
    });
  });
}
