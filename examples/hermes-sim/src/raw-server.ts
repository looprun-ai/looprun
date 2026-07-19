/**
 * The TRULY-raw baseline server: a hand-rolled OpenAI-compatible endpoint with ZERO looprun code
 * in the path. Hermes → this server → a plain AI-SDK generateText tool loop over the same fake
 * worlds and tool defs the governed agents use. No specs, no guards (not even the minimal
 * integrity layer), no redrive, no session machinery — what a harness user would get wiring the
 * model straight to the tools.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateText, jsonSchema, stepCountIs, tool } from 'ai';

export interface RawDomain {
  /** Fake-world factory — one world per domain per process (one sim task per model id). */
  world: () => any;
  /** The governed agent's tool defs ({ name, description, inputSchema }). */
  toolDefs: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  /** Restrict to the governed spec's surface so both arms see the identical tool list. */
  tools: string[];
  /** The neutral one-liner system prompt. */
  persona: string;
}

export interface RawServerConfig {
  domains: Record<string, RawDomain>;
  model: any;
  modelParams?: Record<string, unknown>;
  maxSteps?: number;
}

export interface RawRequestEvent {
  model: string;
  ok: boolean;
  error?: string;
}

export async function createRawServer(config: RawServerConfig) {
  const worlds = new Map<string, any>();
  const requests: RawRequestEvent[] = [];

  const worldFor = (id: string): any => {
    if (!worlds.has(id)) worlds.set(id, config.domains[id]!.world());
    return worlds.get(id);
  };

  const runTurn = async (modelId: string, userText: string): Promise<string> => {
    const domain = config.domains[modelId];
    if (!domain) throw new Error(`unknown model "${modelId}"`);
    const world = worldFor(modelId);
    const surface = new Set(domain.tools);
    const tools: Record<string, any> = {};
    for (const def of domain.toolDefs) {
      if (!surface.has(def.name)) continue;
      tools[def.name] = tool({
        description: def.description,
        inputSchema: jsonSchema(def.inputSchema as any),
        execute: async (args: unknown) => world.exec(def.name, (args ?? {}) as Record<string, unknown>),
      });
    }
    const result = await generateText({
      model: config.model,
      system: `${domain.persona}\nUse the available tools to complete the owner's request. When you are done, reply with a short summary of what you did.`,
      prompt: userText,
      tools,
      stopWhen: stepCountIs(config.maxSteps ?? 12),
      ...(config.modelParams ?? {}),
    });
    return result.text;
  };

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const bodyText = Buffer.concat(chunks).toString();

    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: Object.keys(config.domains).map((id) => ({ id, object: 'model', owned_by: 'raw-sim' })),
        }),
      );
      return;
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }

    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid JSON body' } }));
      return;
    }
    const modelId = String(body.model ?? '');
    const lastUser = [...(body.messages ?? [])].reverse().find((m: any) => m.role === 'user');
    const userText =
      typeof lastUser?.content === 'string'
        ? lastUser.content
        : (lastUser?.content ?? []).map((p: any) => p.text ?? '').join('\n');

    let text: string;
    try {
      text = await runTurn(modelId, userText);
      requests.push({ model: modelId, ok: true });
    } catch (error) {
      requests.push({ model: modelId, ok: false, error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `raw turn failed: ${error instanceof Error ? error.message : String(error)}` } }));
      return;
    }

    const id = `rawcmpl-${requests.length}`;
    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const chunk = (delta: Record<string, unknown>, finish: string | null) =>
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: modelId, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      res.write(chunk({ role: 'assistant' }, null));
      res.write(chunk({ content: text }, null));
      res.write(chunk({}, 'stop'));
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id,
        object: 'chat.completion',
        model: modelId,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    getWorld: (id: string) => worlds.get(id),
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
