/** Native/MCP tools behind ToolPort.call. The answer law is protocol facts only:
 *  a tool-level error result answers 'no' (the tool itself answered); a clean write
 *  answers 'unknown' unless the tool's protocol attests effect; a rejection on a
 *  write answers 'unknown' (the send's fate is unknowable) and on a read answers
 *  'no'. This port never answers 'yes' on its own and never speaks engine
 *  vocabulary. Proxies are declared on the surface card: a string renames to the
 *  real live tool; a compose block executes its reads and merges the results. */
import type { Json, LiveTool, McpWorldCard, ReadyCall, RemoteToolEntry,
              ToolAnswer } from '@looprun-ai/core';

type Effect = 'read' | 'write' | 'destructive';
type Row = { readonly entry: RemoteToolEntry; readonly effect: Effect };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function toJson(v: unknown): Json {
  if (v === undefined) return null;
  return JSON.parse(JSON.stringify(v)) as Json;
}

function firstLine(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'tool call failed';
  return message.split('\n')[0];
}

export class HostToolPort {
  private readonly rows = new Map<string, Row>();
  private readonly live: Readonly<Record<string, LiveTool>>;

  constructor(card: McpWorldCard, live: Readonly<Record<string, LiveTool>>) {
    this.live = live;
    const blocks: readonly [Effect, Readonly<Record<string, RemoteToolEntry>> | undefined][] =
      [['read', card.reads], ['write', card.writes], ['destructive', card.destructive]];
    for (const [effect, block] of blocks) {
      for (const [name, entry] of Object.entries(block ?? {})) {
        this.rows.set(name, { entry, effect });
      }
    }
  }

  async call(call: ReadyCall): Promise<ToolAnswer> {
    const row = this.rows.get(call.tool);
    if (!row) return { result: { error: `no declared tool is named '${call.tool}'` }, done: 'no' };
    const proxy = row.entry.proxy;
    if (typeof proxy === 'object') return this.compose(proxy.compose, call.args);
    const liveName = proxy ?? call.tool;
    const tool = this.live[liveName];
    if (!tool) return { result: { error: `no live tool is named '${liveName}'` }, done: 'no' };
    try {
      const raw = await tool.execute(call.args);
      if (isRecord(raw) && raw.isError === true) return { result: toJson(raw), done: 'no' };
      if (row.effect === 'read') return { result: toJson(raw), done: 'yes' };
      return { result: toJson(raw), done: tool.attests === true ? 'yes' : 'unknown' };
    } catch (e: unknown) {
      return { result: { error: firstLine(e) },
               done: row.effect === 'read' ? 'no' : 'unknown' };
    }
  }

  private async compose(reads: readonly string[],
                        args: ReadyCall['args']): Promise<ToolAnswer> {
    const merged: Record<string, Json> = {};
    for (const name of reads) {
      const tool = this.live[name];
      if (!tool) return { result: { error: `no live tool is named '${name}'` }, done: 'no' };
      try {
        const raw = await tool.execute(args);
        if (isRecord(raw) && raw.isError === true) return { result: toJson(raw), done: 'no' };
        const json = toJson(raw);
        if (isRecord(json)) Object.assign(merged, json);
      } catch (e: unknown) {
        return { result: { error: firstLine(e) }, done: 'no' };
      }
    }
    return { result: merged, done: 'yes' };
  }
}
