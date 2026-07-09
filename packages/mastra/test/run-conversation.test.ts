/** Scripted multi-turn runner: record shape + cross-turn guard state. */
import { describe, expect, it } from 'vitest';
import { AgentSpecMinimal, confirmFirst } from '@looprun/core';
import type { AgentWorld, TrunkTheme } from '@looprun/core';
import { runSpecConversation } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';

const THEME: TrunkTheme = {
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
      if (name === 'replyToUser' || name === 'askUser') return { success: true };
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
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, confirmed: { type: 'boolean' } } },
  },
];

describe('runSpecConversation', () => {
  it('runs a multi-turn conversation with the confirm-first two-step across turns', async () => {
    const spec = new AgentSpecMinimal({
      id: 'cleaner',
      mode: 'CLEAN',
      persona: 'You are the cleanup agent.',
      tools: ['listItems', 'deleteItem'],
      theme: THEME,
    });
    spec.addGuard('preTool', ['deleteItem'], confirmFirst(), { id: 'agent:confirmFirst' });

    const scripted = scriptedModel([
      // turn 0: model tries confirmed:true directly — vetoed; probes; relays the question.
      [{ tool: 'deleteItem', args: { id: 'x', confirmed: true } }],
      [{ tool: 'deleteItem', args: { id: 'x' } }],
      [{ tool: 'replyToUser', args: { text: 'Delete x — are you sure?' } }],
      // turn 1: user confirmed; probe ran in an EARLIER turn, so confirmed:true is now legal.
      [{ tool: 'deleteItem', args: { id: 'x', confirmed: true } }],
      [{ tool: 'replyToUser', args: { text: 'Deleted x.' } }],
    ]);

    const res = await runSpecConversation(
      spec,
      [{ userText: 'delete x' }, { userText: 'yes, delete it' }],
      { model: scripted.model, world: world(), toolDefs: TOOL_DEFS },
    );

    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(2);
    expect(res.turnRecords[0].assistantFinalText).toBe('Delete x — are you sure?');
    expect(res.turnRecords[0].recoveryEvents).toContain('run:confirmFirst:deleteItem');
    expect(res.turnRecords[1].assistantFinalText).toBe('Deleted x.');
    expect(res.turnRecords[1].recoveryEvents).toEqual([]); // confirmed:true legal after the earlier-turn probe
    expect(res.turnRecords[1].toolCalls.map((c) => c.name)).toEqual(['deleteItem']);
  });

  it('throws without any theme', async () => {
    const spec = new AgentSpecMinimal({ id: 'x', mode: 'M', persona: 'You are x.', tools: [] });
    await expect(
      runSpecConversation(spec, [{ userText: 'hi' }], { model: scriptedModel([]).model, world: world(), toolDefs: [] }),
    ).rejects.toThrow(/theme/);
  });
});
