/** The MCP door: { url, headers } from the host env (never the cards) in, the live
 *  tool map out. A tool-level MCP error stays a RESULT ({ isError: true, ... }) — the
 *  protocol's own answer, which HostToolPort prices as done:'no'. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Json, LiveTool } from '@looprun-ai/next-core';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A single text part that parses as JSON is the tool's real payload. */
function normalize(result: Record<string, unknown>): unknown {
  if (result.isError === true) return { isError: true, content: result.content ?? null };
  if (result.structuredContent !== undefined) return result.structuredContent;
  const content = result.content;
  if (Array.isArray(content) && content.length === 1) {
    const part: unknown = content[0];
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
      try { return JSON.parse(part.text) as Json; } catch { return part.text; }
    }
  }
  return content ?? null;
}

export async function connect(mcp: { url: string; headers?: Record<string, string> })
  : Promise<Readonly<Record<string, LiveTool>>> {
  const client = new Client({ name: 'looprun', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(mcp.url),
    mcp.headers ? { requestInit: { headers: mcp.headers } } : undefined);
  await client.connect(transport);
  const { tools } = await client.listTools();
  return Object.freeze(Object.fromEntries(tools.map(t => [t.name, {
    name: t.name,
    description: t.description ?? t.name,
    schema: t.inputSchema as Json,
    execute: async (args: Readonly<Record<string, Json>>) => {
      const result = await client.callTool({ name: t.name, arguments: { ...args } });
      return normalize(result);
    }
  } satisfies LiveTool])));
}
