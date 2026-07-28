/**
 * ASK-CHANNEL AUDIT — the question channel SURVIVES any guard deny.
 *
 * A preTool DENY tells the model to correct or close the turn. The only closing actions are
 * the terminals; if closing with askUser can fail, every new gate becomes a loop trap: the
 * model retries the "failed" terminal until exhaustion. So terminals are PROTOCOL-owned end
 * to end — their result never comes from the world seam, and a world that answers
 * UNKNOWN_TOOL for names it does not dispatch (the shape of every generated subject world)
 * must never reach the model through a terminal call.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import type { RunResult } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import type { ScriptStep } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';

/** A subject-shaped world: dispatches only its domain tools, answers UNKNOWN_TOOL otherwise. */
class HostileWorld extends FixtureWorld {
  exec(name: string, args: Record<string, unknown>): unknown {
    if (name === 'replyToUser' || name === 'askUser') return { ok: false, error: `UNKNOWN_TOOL:${name}` };
    return super.exec(name, args);
  }
}

const gatedSpec = () => {
  const spec = new AgentSpecBase({
    id: 'ask-channel-audit',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    contract: FIXTURE_DOMAIN,
  } as never);
  spec.addGuard('preTool', ['createItem'], custom({ kind: 'proofDeny', dim: 'run', check: () => 'not allowed yet', prose: () => 'x' }), { id: 'agent:proofDeny' });
  return spec;
};

async function runWith(script: ScriptStep[]): Promise<{ llm: ReturnType<typeof fakeLLM>; result: RunResult }> {
  const llm = fakeLLM(script);
  const result = await runSpecConversation(gatedSpec(), [{ userText: 'do the thing' }], {
    model: llm.model,
    modelParams: {},
    world: new HostileWorld('seeded-media'),
    toolDefs: FIXTURE_TOOL_DEFS,
    contract: FIXTURE_DOMAIN,
    redrives: 0,
  });
  return { llm, result };
}

describe('ask channel survives a preTool deny', () => {
  it('askUser executes as a terminal and closes the turn with the question', async () => {
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'askUser', args: { text: 'Which plan do you want?' } }],
    ]);

    const rec = result.turnRecords[0];
    // (3) the turn ends with the question delivered to the user.
    expect(rec?.assistantFinalText).toBe('Which plan do you want?');
    // The model NEVER sees UNKNOWN_TOOL for a terminal.
    expect(JSON.stringify(llm.received)).not.toContain('UNKNOWN_TOOL');
    // The deny happened (the gate is real) — and no repair machinery had to fire.
    expect(rec?.recoveryEvents).toContain('run:proofDeny:createItem');
    expect(rec?.recoveryEvents).not.toContain('forced-terminal');
    expect((rec?.recoveryEvents ?? []).join(',')).not.toContain('exhaustion');
    expect(rec?.maxIterHit).toBe(false);
    // Exactly the two scripted generations: deny → ask. No loop.
    expect(llm.calls()).toBe(2);
  });

  it('no repair pass ever replays UNKNOWN_TOOL for a terminal to the model', async () => {
    // The loop shape from the field: after the deny the model mixes askUser with a domain call
    // (premature terminal → reply invalidated → forced-terminal fallback). The fallback
    // generation re-reads the history — if the terminal's result came from the world, the model
    // now SEES the failure on its only closing action and retries it until exhaustion.
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'listItems', args: {} }, { tool: 'askUser', args: { text: 'draft?' } }],
      [{ tool: 'askUser', args: { text: 'Which plan do you want?' } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('Which plan do you want?');
    expect(rec?.recoveryEvents).toContain('forced-terminal');
    // The LAW: the wire the model reads never carries UNKNOWN_TOOL for a terminal.
    expect(JSON.stringify(llm.received)).not.toContain('UNKNOWN_TOOL');
    expect(rec?.maxIterHit).toBe(false);
    expect(llm.calls()).toBe(3);
  });

  it('replyToUser closes cleanly through the same hostile world', async () => {
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'replyToUser', args: { text: 'I could not create it.' } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe('I could not create it.');
    expect(JSON.stringify(llm.received)).not.toContain('UNKNOWN_TOOL');
    expect(rec?.recoveryEvents).not.toContain('forced-terminal');
    expect(llm.calls()).toBe(2);
  });
});
