/**
 * The ported governed-turn mechanisms, end-to-end on the scripted model: per-agent sampling merge,
 * postTool (OUTPUT-dim) enforcement, and the flowChain completion pass.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, resultInvariant } from '@looprun-ai/core';
import type { AgentWorld, TrunkTheme } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';

const THEME: TrunkTheme = {
  voice: 'You are the assistant of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  exhaustionReply: (_w, okTools) => `closure:${okTools.join(',')}`,
};

function fixtureWorld(): AgentWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  const world: AgentWorld = {
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'replyToUser' || name === 'askUser') return { success: true };
      let result: Record<string, unknown> = { success: true };
      if (name === 'saveConfig') result = { success: true, applied: false }; // structurally ok, invariant fails
      if (name === 'logAction') result = { success: true, logged: true };
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: [],
  };
  return world;
}

const TOOL_DEFS = [
  { name: 'listItems', description: 'List.', inputSchema: { type: 'object', properties: {} } },
  { name: 'saveConfig', description: 'Save.', inputSchema: { type: 'object', properties: {} } },
  { name: 'logAction', description: 'Log.', inputSchema: { type: 'object', properties: { note: { type: 'string' } } } },
];

describe('per-agent sampling (controls.sampling merged over conversation modelParams)', () => {
  it('the agent temperature wins on the value the model actually receives', async () => {
    const spec = new AgentSpecBase({
      id: 'creative', mode: 'M', persona: 'You are the creative agent.', tools: [], theme: THEME,
      sampling: { temperature: 0.7 },
    });
    const scripted = scriptedModel([[{ tool: 'replyToUser', args: { text: 'hi' } }]]);
    const agent = new LoopRunAgent({ spec, world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model, modelParams: { temperature: 0 } });
    await agent.generate('x');
    expect(scripted.received[0].temperature).toBe(0.7); // 0.7 (agent) beats 0 (conversation)
  });
});

describe('postTool (OUTPUT-dim) enforcement joins the redrive', () => {
  it('relays the failing result invariant through the bounded no-tools redrive', async () => {
    const spec = new AgentSpecBase({
      id: 'admin', mode: 'M', persona: 'You are the admin agent.', tools: ['saveConfig'], theme: THEME,
      behavior: ['Save config and report honestly.'],
    });
    spec.addGuard('postTool', ['saveConfig'], resultInvariant((r) => (r as { applied?: boolean }).applied === true, 'The change was NOT fully applied — report the real state.'), { id: 'agent:appliedInvariant' });
    const scripted = scriptedModel([
      [{ tool: 'saveConfig', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'Saved.' } }], // over-claims — postTool violation pending
      [{ text: 'The change was not fully applied.' }], // the redrive (toolChoice:none)
    ]);
    const agent = new LoopRunAgent({ spec, world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('save it');
    expect(res.looprun.corrections).toContain('output:resultInvariant:saveConfig');
    expect(res.looprun.corrections).toContain('redrive:resultInvariant');
    expect(res.text).toBe('The change was not fully applied.');
  });
});

describe('flowChain completion (controls.chains)', () => {
  it('fires a missing direct follow-up and restates the outcome via the redrive', async () => {
    const spec = new AgentSpecBase({
      id: 'flow', mode: 'M', persona: 'You are the flow agent.', tools: ['listItems', 'logAction'], theme: THEME,
      behavior: ['List, then log.'],
      chains: [{ after: 'listItems', call: 'logAction', mode: 'direct', args: { note: 'audit' } }],
    });
    const scripted = scriptedModel([
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'Listed the items.' } }], // no logAction → chain forces it
      [{ text: 'Listed the items and logged the audit action.' }], // the restate redrive
    ]);
    const world = fixtureWorld();
    const agent = new LoopRunAgent({ spec, world, toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('list and log');
    expect(res.looprun.corrections).toContain('chain:logAction');
    expect(res.looprun.corrections).toContain('redrive:chainRestate');
    expect(world.toolCalls.map((c) => c.name)).toContain('logAction'); // executed via world.exec
    expect(res.text).toBe('Listed the items and logged the audit action.');
  });

  it('does not fire when the follow-up already ran', async () => {
    const spec = new AgentSpecBase({
      id: 'flow', mode: 'M', persona: 'You are the flow agent.', tools: ['listItems', 'logAction'], theme: THEME,
      behavior: ['List, then log.'],
      chains: [{ after: 'listItems', call: 'logAction', mode: 'direct', args: { note: 'audit' } }],
    });
    const scripted = scriptedModel([
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'logAction', args: { note: 'manual' } }],
      [{ tool: 'replyToUser', args: { text: 'Listed and logged.' } }],
    ]);
    const world = fixtureWorld();
    const agent = new LoopRunAgent({ spec, world, toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('list and log');
    expect(res.looprun.corrections.filter((c: string) => c.startsWith('chain:'))).toHaveLength(0);
    expect(world.toolCalls.filter((c) => c.name === 'logAction')).toHaveLength(1); // only the model's own
    expect(res.text).toBe('Listed and logged.');
  });

  it('records chain-vetoed and never calls the world when a preTool guard denies the forced call', async () => {
    const spec = new AgentSpecBase({
      id: 'flow', mode: 'M', persona: 'You are the flow agent.', tools: ['listItems', 'logAction'], theme: THEME,
      behavior: ['List, then log.'],
      chains: [{ after: 'listItems', call: 'logAction', mode: 'direct', args: { note: 'audit' } }],
    });
    spec.addGuard('preTool', ['logAction'], { kind: 'blockLog', dim: 'run', check: () => 'logging is blocked', prose: () => 'never log' }, { id: 'agent:blockLog' });
    const scripted = scriptedModel([
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'Listed the items.' } }],
    ]);
    const world = fixtureWorld();
    const agent = new LoopRunAgent({ spec, world, toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('list and log');
    expect(res.looprun.corrections).toContain('chain-vetoed:logAction');
    expect(world.toolCalls.filter((c) => c.name === 'logAction')).toHaveLength(0);
  });
});
