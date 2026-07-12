/** Offline e2e of the governed turn: veto, redrive, forced-terminal, exhaustion, sessions. */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, requiresBefore, replyMustMention } from '@looprun-ai/core';
import type { AgentWorld, TrunkTheme } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';
import type { ScriptStep } from './scripted-model.js';

const THEME: TrunkTheme = {
  voice: 'You are the assistant of Fixture Plants.',
  stateBlock: (w) => `plan=${String(w.plan ?? 'starter')}`,
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  exhaustionReply: (_w, okTools) => `closure:${okTools.join(',')}`,
};

interface PlantsWorld extends AgentWorld {
  watered: number;
  plan: string;
}

function plantsWorld(): PlantsWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sse: any[] = [];
  const world: PlantsWorld = {
    watered: 0,
    plan: 'starter',
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'replyToUser' || name === 'askUser') {
        sse.push({ name, args });
        return { success: true };
      }
      let result: Record<string, unknown> = { success: true };
      if (name === 'listPlants') result = { success: true, plants: ['fern'] };
      if (name === 'waterPlant') {
        world.watered++;
        result = { success: true, label: 'w1' };
      }
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: sse,
  };
  return world;
}

const TOOL_DEFS = [
  { name: 'listPlants', description: 'List plants.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'waterPlant',
    description: 'Water a plant.',
    inputSchema: { type: 'object', properties: { plant: { type: 'string' } }, required: ['plant'] },
  },
];

function makeSpec() {
  const spec = new AgentSpecBase({
    id: 'plants',
    mode: 'CARE',
    persona: 'You are the plant-care agent.',
    tools: ['listPlants', 'waterPlant'],
    behavior: ['Water only listed plants.'],
    theme: THEME,
  });
  spec.addGuard('preTool', ['waterPlant'], requiresBefore(['listPlants']), { id: 'agent:waterAfterList' });
  return spec;
}

function makeAgent(script: ScriptStep[], world: AgentWorld = plantsWorld(), extra: Record<string, unknown> = {}) {
  const scripted = scriptedModel(script);
  const agent = new LoopRunAgent({
    spec: makeSpec(),
    world,
    toolDefs: TOOL_DEFS,
    model: scripted.model,
    ...extra,
  });
  return { agent, scripted };
}

describe('LoopRunAgent — one governed turn', () => {
  it('vetoes a guard violation, lets the model recover, and returns the terminal text', async () => {
    const world = plantsWorld();
    const { agent } = makeAgent(
      [
        [{ tool: 'waterPlant', args: { plant: 'fern' } }], // vetoed: requiresBefore(listPlants)
        [{ tool: 'listPlants', args: {} }],
        [{ tool: 'waterPlant', args: { plant: 'fern' } }],
        [{ tool: 'replyToUser', args: { text: 'Watered your fern.' } }],
      ],
      world,
    );
    const res = await agent.generate('Water the fern');
    expect(res.text).toBe('Watered your fern.');
    expect(res.looprun.corrections).toContain('spatial:requiresBefore:waterPlant');
    expect(world.watered).toBe(1); // the vetoed call never reached the world
    const session = agent.getSession();
    expect(session.ledger.observed.map((o) => `${o.name}:${o.ok}`)).toEqual([
      'waterPlant:false',
      'listPlants:true',
      'waterPlant:true',
      'replyToUser:true',
    ]);
  });

  it('rides the volatile state on the user-message tail and keeps the system prompt byte-stable', async () => {
    const world = plantsWorld();
    const { agent, scripted } = makeAgent(
      [
        [{ tool: 'listPlants', args: {} }],
        [{ tool: 'replyToUser', args: { text: 'ok' } }],
        [{ tool: 'listPlants', args: {} }],
        [{ tool: 'replyToUser', args: { text: 'ok2' } }],
      ],
      world,
    );
    await agent.generate('turn one');
    world.plan = 'pro'; // mutate volatile state between turns
    await agent.generate('turn two');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemOf = (call: any) =>
      (call.prompt ?? []).filter((m: { role: string }) => m.role === 'system').map((m: { content: unknown }) => m.content).join('\n');
    const sys1 = systemOf(scripted.received[0]);
    const sys3 = systemOf(scripted.received[2]);
    expect(sys1).toContain('Turn protocol (ABSOLUTE)');
    expect(sys1).toBe(sys3); // byte-stable across turns despite the world mutation

    const lastUser = (call: unknown) => {
      const prompt = (call as { prompt: Array<{ role: string; content: unknown }> }).prompt;
      const users = prompt.filter((m) => m.role === 'user');
      return JSON.stringify(users[users.length - 1]?.content ?? '');
    };
    expect(lastUser(scripted.received[0])).toContain('## Account state');
    expect(lastUser(scripted.received[0])).toContain('plan=starter');
    expect(lastUser(scripted.received[2])).toContain('plan=pro'); // refreshed state in the tail
  });

  it('redrives an onReply violation as a bounded no-tools re-generate', async () => {
    const spec = makeSpec();
    spec.addReplyCheck(replyMustMention(['fern'], 'Mention the plant name.'), { id: 'agent:mentionPlant' });
    const scripted = scriptedModel([
      [{ tool: 'listPlants', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'Done.' } }], // violates: no "fern"
      [{ text: 'Your fern is thriving.' }], // the redrive (toolChoice:none)
    ]);
    const agent = new LoopRunAgent({ spec, world: plantsWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('How is my plant?');
    expect(res.text).toBe('Your fern is thriving.');
    expect(res.looprun.corrections).toContain('redrive:replyMustMention');
    expect(res.looprun.exhausted).toBe(false);
  });

  it('forces a terminal call when the model ends without one', async () => {
    const { agent } = makeAgent([
      [{ tool: 'listPlants', args: {} }],
      [{ text: 'chatty free text, no terminal' }],
      [{ tool: 'replyToUser', args: { text: 'Here is the status.' } }], // the forced fallback
    ]);
    const res = await agent.generate('Status?');
    expect(res.text).toBe('Here is the status.');
    expect(res.looprun.corrections).toContain('forced-terminal');
  });

  it('commits the deterministic closure when redrives exhaust', async () => {
    const spec = makeSpec();
    spec.addReplyCheck(replyMustMention(['impossible-token-xyz'], 'nope'), { id: 'agent:impossible' });
    const scripted = scriptedModel([
      [{ tool: 'listPlants', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'A.' } }],
      [{ text: 'B.' }], // redrive 1 — still violating
    ]);
    const agent = new LoopRunAgent({ spec, world: plantsWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('Hi');
    expect(res.looprun.exhausted).toBe(true);
    expect(res.looprun.violations).toContain('replyMustMention');
    expect(res.text).toBe('closure:listPlants,replyToUser'); // THEME closure over verified ok tools
  });
});

describe('LoopRunAgent — sessions', () => {
  it('rejects a second session on a world INSTANCE', async () => {
    const { agent } = makeAgent([[{ tool: 'replyToUser', args: { text: 'hi' } }]]);
    await agent.generate('a');
    await expect(agent.generate('b', { loopRun: { sessionId: 'other' } })).rejects.toThrow(/world FACTORY/);
  });

  it('isolates sessions with a world factory', async () => {
    const worlds = new Map<string, PlantsWorld>();
    const { agent } = makeAgent(
      [
        [{ tool: 'listPlants', args: {} }],
        [{ tool: 'replyToUser', args: { text: 'ok' } }],
        [{ tool: 'listPlants', args: {} }],
        [{ tool: 'replyToUser', args: { text: 'ok' } }],
      ],
      undefined as unknown as AgentWorld,
      {
        world: (id: string) => {
          const w = plantsWorld();
          worlds.set(id, w);
          return w;
        },
      },
    );
    await agent.generate('a', { loopRun: { sessionId: 's1' } });
    await agent.generate('b', { loopRun: { sessionId: 's2' } });
    expect(worlds.size).toBe(2);
    expect(agent.getSession('s1').ledger.observed.length).toBe(2);
    expect(agent.getSession('s2').ledger.observed.length).toBe(2);
    expect(agent.getSession('s1').turnIndex).toBe(1);
  });
});

describe('LoopRunAgent — review regressions', () => {
  it('#1 native-tools mode: native tools are actually reachable from generate()', async () => {
    const { createTool } = await import('@mastra/core/tools');
    const { z } = await import('zod');
    let executed = false;
    const search = createTool({
      id: 'search',
      description: 'Search.',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: z.object({ q: z.string().optional() }) as any,
      execute: async () => {
        executed = true;
        return { success: true, hits: 1 };
      },
    });
    const scripted = scriptedModel([
      [{ tool: 'search', args: { q: 'x' } }],
      [{ tool: 'replyToUser', args: { text: 'Found it.' } }],
    ]);
    const spec = new AgentSpecBase({
      id: 'searcher', mode: 'M', persona: 'You are the search agent.', tools: ['search'], theme: THEME,
    });
    const agent = new LoopRunAgent({ spec, tools: { search }, model: scripted.model });
    const res = await agent.generate('find x');
    expect(executed).toBe(true);
    expect(res.text).toBe('Found it.');
  });

  it('#2 history holds the reply the user received — never a rejected draft', async () => {
    const spec = makeSpec();
    spec.addReplyCheck(replyMustMention(['impossible-token-xyz'], 'nope'), { id: 'agent:impossible' });
    const scripted = scriptedModel([
      [{ tool: 'listPlants', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'A.' } }],
      [{ text: 'B-rejected-draft.' }], // redrive candidate, still violating
    ]);
    const agent = new LoopRunAgent({ spec, world: plantsWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('Hi');
    const msgs = agent.getSession().messages;
    const texts = msgs.filter((m) => m.role === 'assistant' && typeof m.content === 'string').map((m) => m.content);
    expect(texts).not.toContain('B-rejected-draft.');
    expect(texts[texts.length - 1]).toBe(res.text); // the exhaustion closure the user actually got
  });

  it('#3 concurrent turns on different sessions never cross-execute (AsyncLocalStorage context)', async () => {
    const worlds = new Map<string, PlantsWorld>();
    const counts = new Map<string, number>();
    const { MockLanguageModelV3 } = await import('ai/test');
    const model = new MockLanguageModelV3({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doGenerate: (async (options: any) => {
        const text = JSON.stringify(options.prompt);
        const tag = text.includes('mark A') ? 'A' : 'B';
        const n = (counts.get(tag) ?? 0) + 1;
        counts.set(tag, n);
        await new Promise((r) => setTimeout(r, tag === 'A' ? 40 : 5)); // A resolves LATE
        const content = n === 1
          ? [{ type: 'tool-call', toolCallId: `${tag}${n}`, toolName: 'waterPlant', input: JSON.stringify({ plant: tag }) }]
          : [{ type: 'tool-call', toolCallId: `${tag}${n}`, toolName: 'replyToUser', input: JSON.stringify({ text: tag }) }];
        return { content, finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
    const spec = new AgentSpecBase({
      id: 'plants', mode: 'M', persona: 'You are the plant agent.', tools: ['waterPlant'], theme: THEME,
    });
    const agent = new LoopRunAgent({
      spec,
      world: (id: string) => {
        const w = plantsWorld();
        worlds.set(id, w);
        return w;
      },
      toolDefs: TOOL_DEFS,
      model,
    });
    await Promise.all([
      agent.generate('mark A', { loopRun: { sessionId: 'A' } }),
      agent.generate('mark B', { loopRun: { sessionId: 'B' } }),
    ]);
    const argsOf = (id: string) => worlds.get(id)!.toolCalls.map((c) => (c.args as { plant: string }).plant);
    expect(argsOf('A')).toEqual(['A']); // A's call landed in A's world, despite resolving after B
    expect(argsOf('B')).toEqual(['B']);
  });

  it('#4 terminalProtocol:false still honors a terminal-tool reply', async () => {
    const { agent } = makeAgent(
      [[{ tool: 'replyToUser', args: { text: 'Hello from the tool call.' } }]],
      plantsWorld(),
      { terminalProtocol: false },
    );
    const res = await agent.generate('hi');
    expect(res.text).toBe('Hello from the tool call.');
    expect(res.looprun.exhausted).toBe(false);
  });
});

describe('LoopRunAgent — construction laws', () => {
  it('requires a theme (config or spec)', () => {
    const spec = new AgentSpecBase({ id: 'x', mode: 'M', persona: 'You are x.', tools: [] });
    expect(() => new LoopRunAgent({ spec, world: plantsWorld(), model: scriptedModel([]).model })).toThrow(/theme/);
  });

  it('strict mode throws on validateSpec warnings', () => {
    const spec = new AgentSpecBase({
      id: 'x',
      mode: 'M',
      persona: 'You are x.',
      tools: Array.from({ length: 16 }, (_, i) => `t${i}`),
      theme: THEME,
    });
    expect(
      () => new LoopRunAgent({ spec, world: plantsWorld(), model: scriptedModel([]).model, strict: true }),
    ).toThrow(/≤15/);
  });
});
