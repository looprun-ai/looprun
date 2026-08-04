/**
 * ASK-CHANNEL AUDIT — the question channel SURVIVES any guard deny.
 *
 * A preTool DENY tells the model to correct or close the turn. The only closing action is the
 * `respond` terminal; if closing with it can fail, every new gate becomes a loop trap: the model
 * retries the "failed" terminal until exhaustion. So the terminal is PROTOCOL-owned end to end —
 * its result never comes from the world seam, and a world that answers UNKNOWN_TOOL for names it
 * does not dispatch (the shape of every generated subject world) must never reach the model
 * through the terminal call.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import type { RunResult } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import type { ScriptStep } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';
import { nothingDone } from '../delivery.js';

/** A subject-shaped world: dispatches only its domain tools, answers UNKNOWN_TOOL otherwise — including
 *  for the runtime `respond` terminal, which the protocol must NEVER route here. */
class HostileWorld extends FixtureWorld {
  exec(name: string, args: Record<string, unknown>): unknown {
    if (name === 'respond') return { ok: false, error: `UNKNOWN_TOOL:${name}` };
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
  it('an ask intention executes as a terminal and closes the turn with the question', async () => {
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'respond', args: { message: 'Which plan do you want?', did: [{ op: 'ask' }] } }],
    ]);

    const rec = result.turnRecords[0];
    // (3) the turn ends with the question delivered to the user.
    expect(rec?.assistantFinalText).toBe(nothingDone('Which plan do you want?'));
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
    // The loop shape from the field: after the deny the model mixes the ask intention with a
    // domain call (premature terminal → reply invalidated → forced-terminal fallback). The fallback
    // generation re-reads the history — if the terminal's result came from the world, the model
    // now SEES the failure on its only closing action and retries it until exhaustion.
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'listItems', args: {} }, { tool: 'respond', args: { message: 'draft?', did: [{ op: 'ask' }] } }],
      [{ tool: 'respond', args: { message: 'Which plan do you want?', did: [{ op: 'ask' }] } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe(nothingDone('Which plan do you want?'));
    expect(rec?.recoveryEvents).toContain('forced-terminal');
    // The invalidated premature respond is also pruned from `observed`, so the question the
    // user never received cannot license consent in this turn or any later one.
    expect(rec?.recoveryEvents).toContain('premature-terminal-pruned:respond');
    // The LAW: the wire the model reads never carries UNKNOWN_TOOL for a terminal.
    expect(JSON.stringify(llm.received)).not.toContain('UNKNOWN_TOOL');
    expect(rec?.maxIterHit).toBe(false);
    expect(llm.calls()).toBe(3);
  });

  it('a plain respond closes cleanly through the same hostile world', async () => {
    const { llm, result } = await runWith([
      [{ tool: 'createItem', args: { title: 'X' } }],
      [{ tool: 'respond', args: { message: 'I could not create it.', did: [{ op: 'inform' }] } }],
    ]);

    const rec = result.turnRecords[0];
    expect(rec?.assistantFinalText).toBe(nothingDone('I could not create it.'));
    expect(JSON.stringify(llm.received)).not.toContain('UNKNOWN_TOOL');
    expect(rec?.recoveryEvents).not.toContain('forced-terminal');
    expect(llm.calls()).toBe(2);
  });
});
