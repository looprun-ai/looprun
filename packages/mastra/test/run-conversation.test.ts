/** Scripted multi-turn runner: record shape + cross-turn guard state. */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, confirmFirst, custom } from '@looprun-ai/core';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { runSpecConversation } from '../src/index.js';
import { repeatedToolCallStop } from '../src/hooks.js';
import { scriptedModel } from './scripted-model.js';
import { nothingDone } from './delivery.js';

const CONTRACT: DomainContract = {
  voice: 'You are the assistant of Fixture Plants.',
  stateBlock: () => 'plan=starter',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

function world(): AgentWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  return {
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'respond') return { success: true };
      // The simulation protocol is the WORLD's: a `simulate:true` destructive call changes nothing and
      // names the record it needs confirmation for, which is what the engine builds its question from.
      if (name === 'deleteItem' && args.simulate === true) {
        const simulation = { requiresConfirmation: true, id: args.id };
        calls.push({ name, args, result: simulation, tookEffect: false });
        return simulation;
      }
      const result = { success: true };
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: [],
  };
}

const TOOL_DEFS = [
  { name: 'listItems', description: 'List.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'deleteItem',
    description: 'Delete an item (destructive).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, simulate: { type: 'boolean' } } },
  },
];

describe('runSpecConversation', () => {
  it('runs a multi-turn conversation with the simulate-first protocol across turns', async () => {
    const spec = new AgentSpecBase({
      id: 'cleaner',
      mode: 'CLEAN',
      persona: 'You are the cleanup agent.',
      tools: ['listItems', 'deleteItem'],
      destructiveTools: ['deleteItem'],
      contract: CONTRACT,
    });

    const scripted = scriptedModel([
      // turn 0: the model reaches for the bare act — the runtime DOWNGRADES it to its own simulation,
      // and the world's "I need confirmation on x" is what puts the question on the screen.
      [{ tool: 'deleteItem', args: { id: 'x' } }],
      [{ tool: 'respond', args: { message: 'Delete x — are you sure?', did: [{ op: 'inform' }] } }],
      // turn 1: the user typed the code the engine issued, so the bare act is now licensed.
      [{ tool: 'deleteItem', args: { id: 'x' } }],
      [{ tool: 'respond', args: { message: 'Deleted x.', did: [{ op: 'inform' }] } }],
    ]);

    const res = await runSpecConversation(
      spec,
      [{ userText: 'delete x' }, { userText: 'CONFIRM x' }],
      { model: scripted.model, world: world(), toolDefs: TOOL_DEFS },
    );

    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(2);
    expect(res.turnRecords[0].assistantFinalText).toContain('To confirm x, reply: CONFIRM X');
    expect(res.turnRecords[0].recoveryEvents).toContain('downgrade:confirmFirst:deleteItem');
    expect(res.turnRecords[1].assistantFinalText).toBe(nothingDone('Deleted x.'));
    expect(res.turnRecords[1].recoveryEvents).toEqual([]); // the bare act is legal after the typed code
    expect(res.turnRecords[1].toolCalls.map((c) => c.name)).toEqual(['deleteItem']);
  });

  it('throws without any contract', async () => {
    const spec = new AgentSpecBase({ id: 'x', mode: 'M', persona: 'You are x.', tools: [] });
    await expect(
      runSpecConversation(spec, [{ userText: 'hi' }], { model: scriptedModel([]).model, world: world(), toolDefs: [] }),
    ).rejects.toThrow(/contract/);
  });

  it('a turn-1 guard sees turn-0 in ctx.history (user text + reply) and its own incoming userText', async () => {
    const seen: Array<{ userText: string; historyUserTexts: string[]; historyReplies: string[] }> = [];
    const captor = custom({
      kind: 'captor', dim: 'run',
      check: (ctx) => {
        seen.push({
          userText: ctx.userText,
          historyUserTexts: ctx.history.map((t) => t.userText),
          historyReplies: ctx.history.map((t) => t.reply),
        });
        return null;
      },
      prose: () => '',
    });
    const spec = new AgentSpecBase({
      id: 'echo', mode: 'M', persona: 'You are the echo agent.', tools: ['listItems'], contract: CONTRACT,
    });
    spec.addGuard('onInput', 'any', captor, { id: 'x:captor' });

    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'Here is turn zero.', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'Here is turn one.', did: [{ op: 'inform' }] } }],
    ]);

    const res = await runSpecConversation(
      spec,
      [{ userText: 'first question' }, { userText: 'second question' }],
      { model: scripted.model, world: world(), toolDefs: TOOL_DEFS },
    );
    expect(res.errorMsg).toBeUndefined();

    // Turn 0: no prior history, incoming userText is the first message.
    expect(seen[0]).toEqual({ userText: 'first question', historyUserTexts: [], historyReplies: [] });
    // Turn 1: sees turn 0 sealed into history, plus its own incoming text.
    expect(seen[1].userText).toBe('second question');
    expect(seen[1].historyUserTexts).toEqual(['first question']);
    expect(seen[1].historyReplies).toEqual([nothingDone('Here is turn zero.')]);
  });

  it('a postTool guard (running in afterToolCall) sees ctx.userText + the sealed prior history', async () => {
    const seen: Array<{ tool?: string; userText: string; historyUserTexts: string[] }> = [];
    const captor = custom({
      kind: 'postCaptor', dim: 'run',
      check: (ctx) => { seen.push({ tool: ctx.tool, userText: ctx.userText, historyUserTexts: ctx.history.map((t) => t.userText) }); return null; },
      prose: () => '',
    });
    const spec = new AgentSpecBase({
      id: 'lister', mode: 'M', persona: 'You are the lister agent.', tools: ['listItems'], contract: CONTRACT,
    });
    spec.addGuard('postTool', ['listItems'], captor, { id: 'x:postCaptor' });

    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'Turn zero done.', did: [{ op: 'inform' }] } }],
      // turn 1: a real domain call → afterToolCall runs the postTool guard.
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'respond', args: { message: 'Here are your items.', did: [{ op: 'inform' }] } }],
    ]);

    const res = await runSpecConversation(
      spec,
      [{ userText: 'just say hi' }, { userText: 'list my items' }],
      { model: scripted.model, world: world(), toolDefs: TOOL_DEFS },
    );
    expect(res.errorMsg).toBeUndefined();

    const post = seen.find((s) => s.tool === 'listItems');
    expect(post).toBeDefined();
    expect(post!.userText).toBe('list my items');
    expect(post!.historyUserTexts).toEqual(['just say hi']);
  });
});

describe('repeatedToolCallStop (lineage-exact anti-loop stop for local models)', () => {
  const step = (calls: Array<[string, unknown]>) => ({ toolCalls: calls.map(([toolName, input]) => ({ toolName, input })) });
  it('fires only when the same tool+args pair appears twice', () => {
    expect(repeatedToolCallStop({ steps: [step([['a', { x: 1 }]]), step([['a', { x: 2 }]])] })).toBe(false);
    expect(repeatedToolCallStop({ steps: [step([['a', { x: 1 }]]), step([['b', { x: 1 }]])] })).toBe(false);
    expect(repeatedToolCallStop({ steps: [step([['a', { x: 1 }]]), step([['a', { x: 1 }]])] })).toBe(true);
    expect(repeatedToolCallStop({ steps: [] })).toBe(false);
  });
});
