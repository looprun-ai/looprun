/**
 * THE SIMULATION GATE, end to end and deterministically.
 *
 * A call is a SCHEMA-LICENSED SIMULATION when its declared schema carries `simulate` and it is called
 * with `simulate: true`. Such a call changes nothing, and the world validates it in full, so
 * `evaluatePreTool` runs only the guards in `ALWAYS_GUARD_KINDS` over it — the world's own answer is the
 * enforcement for every other rule. `simulate: true` on a tool whose schema never declared it is an act
 * like any other: an executor drops the unknown argument and the world is changed.
 *
 * ```
 *   cancelBooking({ bookingId: 'bk_1', simulate: true })   schema declares simulate  → allow
 *   purgeLogs({ simulate: true })                          schema does not           → deny
 *   cancelBooking({ bookingId: 'bk_1', simulate: true })    the same one, twice      → deny
 * ```
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import { precondition } from '../../src/guards/index.js';
import type { AgentWorld } from '../../src/rules.js';
import { beginTurn, createActionHistory, recordToolResult } from '../../src/runtime/action-history.js';
import { ALWAYS_GUARD_KINDS, evaluatePreTool } from '../../src/runtime/turn.js';

/** A spec whose every listed tool is denied by an agent-authored guard — the mirror that makes the
 *  gate's verdict visible: whatever passes here passed BECAUSE it is a simulation. */
function mirrorSpec(): AgentSpecBase {
  const spec = new AgentSpecBase({
    id: 'simulation-routes',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: ['cancelBooking', 'purgeLogs'],
    destructiveTools: ['cancelBooking', 'purgeLogs'],
  });
  spec.addGuard('preTool', ['cancelBooking', 'purgeLogs'], precondition(() => false, 'the mirror denies every call'), {
    id: 'agent:mirror',
  });
  return spec;
}

/** `evaluatePreTool` never reaches the world — the world is here only to satisfy the signature. */
const world = { toolCalls: [] } as unknown as AgentWorld;

/** An action history whose schema licence covers `cancelBooking` and NOT `purgeLogs`. */
function licensed() {
  const actionHistory = createActionHistory();
  actionHistory.simulatableTools = new Set(['cancelBooking']);
  beginTurn(actionHistory, 0, 'cancel bk_1');
  return actionHistory;
}

describe('the always-family is the whole of the gate', () => {
  it('names exactly the kinds a simulation still answers to', () => {
    expect([...ALWAYS_GUARD_KINDS]).toEqual(['noDuplicateCall']);
  });
});

describe('positive — a schema-licensed simulation passes a denying guard', () => {
  it('runs while the same call without the flag is denied', async () => {
    const spec = mirrorSpec();
    const simulation = await evaluatePreTool(spec, licensed(), world, 'cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(simulation.verdict).toBe('allow');

    const act = await evaluatePreTool(spec, licensed(), world, 'cancelBooking', { bookingId: 'bk_1' });
    expect(act.verdict).not.toBe('allow');
  });
});

describe('negative — the flag alone licenses nothing', () => {
  it('denies simulate:true on a tool whose schema never declared it', async () => {
    const verdict = await evaluatePreTool(mirrorSpec(), licensed(), world, 'purgeLogs', { simulate: true });
    expect(verdict.verdict).toBe('deny');
  });

  it('denies a repeated identical simulation — a looping simulation is still a loop', async () => {
    const spec = mirrorSpec();
    const actionHistory = licensed();
    const args = { bookingId: 'bk_1', simulate: true };

    const first = await evaluatePreTool(spec, actionHistory, world, 'cancelBooking', args);
    expect(first.verdict).toBe('allow');
    recordToolResult(actionHistory, 'cancelBooking', args, { requiresConfirmation: true, bookingId: 'bk_1' });

    const second = await evaluatePreTool(spec, actionHistory, world, 'cancelBooking', args);
    expect(second.verdict).toBe('deny');
  });
});

describe('neutral — the look-alikes the gate leaves alone', () => {
  it('a simulation of another record is not the first one repeated', async () => {
    const spec = mirrorSpec();
    const actionHistory = licensed();
    const first = { bookingId: 'bk_1', simulate: true };

    await evaluatePreTool(spec, actionHistory, world, 'cancelBooking', first);
    recordToolResult(actionHistory, 'cancelBooking', first, { requiresConfirmation: true, bookingId: 'bk_1' });

    const other = await evaluatePreTool(spec, actionHistory, world, 'cancelBooking', { bookingId: 'bk_2', simulate: true });
    expect(other.verdict).toBe('allow');
  });

  it('simulate:false is an act, gated exactly as a call with no flag at all', async () => {
    const verdict = await evaluatePreTool(mirrorSpec(), licensed(), world, 'cancelBooking', { bookingId: 'bk_1', simulate: false });
    expect(verdict.verdict).not.toBe('allow');
  });
});

/**
 * The turn's single destructive act is spent, and the next record can still be ASKED about: a
 * simulation is not a second act, so the throttle that stops the second ACT does not stop the question
 * that precedes it.
 */
describe('the throttle counts acts, and a simulation is not one', () => {
  it('lets a simulation run in a turn whose destructive act already landed', async () => {
    const spec = new AgentSpecBase({
      id: 'throttle-after-effect',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: ['cancelBooking'],
      destructiveTools: ['cancelBooking'],
    });
    const acted: AgentWorld = {
      exec: () => ({ success: true }),
      advanceTurn: () => {},
      ingestAttachment: (u: string) => u,
      toolCalls: [{ name: 'cancelBooking', args: { bookingId: 'bk_1' }, result: { id: 'bk_1' }, tookEffect: true }],
      sseActions: [],
    };
    const actionHistory = createActionHistory();
    actionHistory.simulatableTools = new Set(['cancelBooking']);
    beginTurn(actionHistory, 0, 'CONFIRM BK_1');
    recordToolResult(actionHistory, 'cancelBooking', { bookingId: 'bk_1' }, { id: 'bk_1' }, acted);

    const nextAct = await evaluatePreTool(spec, actionHistory, acted, 'cancelBooking', { bookingId: 'bk_2' });
    expect(nextAct.verdict).not.toBe('allow');

    const question = await evaluatePreTool(spec, actionHistory, acted, 'cancelBooking', { bookingId: 'bk_2', simulate: true });
    expect(question.verdict).toBe('allow');
  });
});
