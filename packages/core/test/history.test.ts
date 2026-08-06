/**
 * Full-context guards — the conversation `history` + real `onInput` text.
 *
 * Property: EVERY hook's GuardCtx carries the read-only `history` (prior turns, user text included) and
 * the current turn's incoming `userText`. `onInput` sees the real incoming text, not a blind
 * `args: {}`. And `recordTurnHistory` seals a completed turn into `action history.history`, frozen.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, DomainContract, GuardCtx, ReplyMutator } from '../src/index.js';
import {
  createActionHistory,
  beginTurn,
  recordToolResult,
  recordVeto,
  recordTurnHistory,
} from '../src/runtime/action-history.js';
import { evaluateOnInput, evaluatePreTool, finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}

const CONTRACT: DomainContract = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
};

/** A silent guard that captures the ctx it was handed. `dim` picks the hook it may install on:
 *  'run' for onInput/preTool, 'behavior' for onReply. */
function captor(dim: 'run' | 'behavior' = 'run') {
  const seen: GuardCtx[] = [];
  const guard = custom({ kind: 'captor', dim, check: (ctx) => { seen.push(ctx); return null; }, prose: () => '' });
  return { seen, guard };
}

describe('recordTurnHistory', () => {
  it('seals the turn: userText, reply, executed toolCalls, vetoed attempts, guardEvents', () => {
    const actionHistory = createActionHistory();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'createItem', args: { name: 'Alpha' }, result: { label: 'itm-1' }, tookEffect: true });
    beginTurn(actionHistory, 0, 'create Alpha and delete x1');
    recordToolResult(actionHistory, 'createItem', { name: 'Alpha' }, { label: 'itm-1' }, world);
    recordVeto(actionHistory, 'deleteItem', { id: 'x1' }, 'behavior:confirmFirst:deleteItem');

    recordTurnHistory(actionHistory, 'Created Alpha; I need confirmation to delete x1.', world);

    expect(actionHistory.history).toHaveLength(1);
    const t = actionHistory.history[0];
    expect(t.turnIndex).toBe(0);
    expect(t.userText).toBe('create Alpha and delete x1');
    expect(t.reply).toBe('Created Alpha; I need confirmation to delete x1.');
    // Executed, non-terminal, non-vetoed call — with the world result joined in.
    expect(t.toolCalls).toEqual([{ name: 'createItem', args: { name: 'Alpha' }, ok: true, tookEffect: true, result: { label: 'itm-1' } }]);
    // The guard-vetoed call rides attemptedCalls, NOT toolCalls.
    expect(t.attemptedCalls).toEqual([{ name: 'deleteItem', args: { id: 'x1' } }]);
    expect(t.guardEvents).toContain('behavior:confirmFirst:deleteItem');
  });

  it('excludes terminal calls from history toolCalls', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'hi');
    actionHistory.observed.push({ name: 'respond', args: { message: 'hi there', did: [] }, ok: true, turnIndex: 0 });
    recordTurnHistory(actionHistory, 'hi there');
    expect(actionHistory.history[0].toolCalls).toEqual([]);
  });

  it('freezes the entry and its arrays (ctx.history is read-only)', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'x');
    recordTurnHistory(actionHistory, 'y');
    const t = actionHistory.history[0];
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.toolCalls)).toBe(true);
    expect(Object.isFrozen(t.attemptedCalls)).toBe(true);
    expect(Object.isFrozen(t.guardEvents)).toBe(true);
  });

  it('accumulates across turns; beginTurn keeps history but resets currentUserText', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'first');
    recordTurnHistory(actionHistory, 'r0');
    beginTurn(actionHistory, 1, 'second');
    expect(actionHistory.currentUserText).toBe('second');
    expect(actionHistory.history).toHaveLength(1);
    expect(actionHistory.history[0].userText).toBe('first');
    recordTurnHistory(actionHistory, 'r1');
    expect(actionHistory.history.map((t) => t.userText)).toEqual(['first', 'second']);
  });
});

describe('every hook sees userText + prior history', () => {
  const priorTurn = () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'the first thing I said');
    recordTurnHistory(actionHistory, 'the first reply');
    beginTurn(actionHistory, 1, 'the second thing I said');
    return actionHistory;
  };

  it('onInput sees the real incoming userText (not a blind {}) + the prior history', async () => {
    const c = captor('run');
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addGuard('onInput', 'any', c.guard, { id: 'x:captor' });
    const actionHistory = priorTurn();

    await evaluateOnInput(spec, actionHistory, fixtureWorld());

    expect(c.seen).toHaveLength(1);
    expect(c.seen[0].userText).toBe('the second thing I said');
    expect(c.seen[0].history).toHaveLength(1);
    expect(c.seen[0].history[0].userText).toBe('the first thing I said');
    expect(c.seen[0].history[0].reply).toBe('the first reply');
  });

  it('preTool sees userText + history', async () => {
    const c = captor('run');
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addGuard('preTool', ['act'], c.guard, { id: 'x:captor' });
    const actionHistory = priorTurn();

    await evaluatePreTool(spec, actionHistory, fixtureWorld(), 'act', { foo: 1 });

    expect(c.seen[0].userText).toBe('the second thing I said');
    expect(c.seen[0].history[0].userText).toBe('the first thing I said');
    // The current turn's tool args still ride ctx.args — userText is a distinct field.
    expect(c.seen[0].args).toEqual({ foo: 1 });
  });

  it('onReply sees userText + history', async () => {
    const c = captor('behavior');
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addGuard('onReply', 'any', c.guard, { id: 'x:captor' });
    const actionHistory = priorTurn();

    await finalizeReply(spec, CONTRACT, fixtureWorld(), actionHistory, { message: 'a reply', did: [{ op: 'inform' }] }, async () => ({ message: '', did: [] }), 0);

    const mine = c.seen.filter((s) => s.reply === 'a reply');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].userText).toBe('the second thing I said');
    expect(mine[0].history[0].userText).toBe('the first thing I said');
  });

  it('onReplyMutate (a mutator) sees userText + history', async () => {
    const seen: GuardCtx[] = [];
    const mutator: ReplyMutator = { kind: 'captorMutator', apply: (reply, ctx) => { seen.push(ctx); return reply; } };
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addMutator(mutator, { id: 'x:captorMutator' });
    const actionHistory = priorTurn();

    await finalizeReply(spec, CONTRACT, fixtureWorld(), actionHistory, { message: 'a reply', did: [{ op: 'inform' }] }, async () => ({ message: '', did: [] }), 0);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].userText).toBe('the second thing I said');
    expect(seen[0].history[0].userText).toBe('the first thing I said');
    expect(seen[0].history[0].reply).toBe('the first reply');
  });
});
