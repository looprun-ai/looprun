/**
 * Full-context guards — the conversation `history` + real `onInput` text (firewall retired 2026-08-02).
 *
 * Property: EVERY hook's GuardCtx carries the read-only `history` (prior turns, user text included) and
 * the current turn's incoming `userText`. `onInput` sees the real incoming text — no longer a blind
 * `args: {}`. And `recordTurnHistory` seals a completed turn into `ledger.history`, frozen.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, DomainContract, GuardCtx } from '../src/index.js';
import {
  createLedger,
  beginTurn,
  recordToolResult,
  recordVeto,
  recordTurnHistory,
} from '../src/runtime/ledger.js';
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
    const ledger = createLedger();
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'createItem', args: { name: 'Alpha' }, result: { label: 'itm-1' }, tookEffect: true });
    beginTurn(ledger, 0, 'create Alpha and delete x1');
    recordToolResult(ledger, 'createItem', { name: 'Alpha' }, { label: 'itm-1' }, world);
    recordVeto(ledger, 'deleteItem', { id: 'x1' }, 'behavior:confirmFirst:deleteItem');

    recordTurnHistory(ledger, 'Created Alpha; I need confirmation to delete x1.', world);

    expect(ledger.history).toHaveLength(1);
    const t = ledger.history[0];
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
    const ledger = createLedger();
    beginTurn(ledger, 0, 'hi');
    ledger.observed.push({ name: 'replyToUser', args: { text: 'hi there' }, ok: true, turnIndex: 0 });
    recordTurnHistory(ledger, 'hi there');
    expect(ledger.history[0].toolCalls).toEqual([]);
  });

  it('freezes the entry and its arrays (ctx.history is read-only)', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'x');
    recordTurnHistory(ledger, 'y');
    const t = ledger.history[0];
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.toolCalls)).toBe(true);
    expect(Object.isFrozen(t.attemptedCalls)).toBe(true);
    expect(Object.isFrozen(t.guardEvents)).toBe(true);
  });

  it('accumulates across turns; beginTurn keeps history but resets currentUserText', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'first');
    recordTurnHistory(ledger, 'r0');
    beginTurn(ledger, 1, 'second');
    expect(ledger.currentUserText).toBe('second');
    expect(ledger.history).toHaveLength(1);
    expect(ledger.history[0].userText).toBe('first');
    recordTurnHistory(ledger, 'r1');
    expect(ledger.history.map((t) => t.userText)).toEqual(['first', 'second']);
  });
});

describe('every hook sees userText + prior history', () => {
  const priorTurn = () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'the first thing I said');
    recordTurnHistory(ledger, 'the first reply');
    beginTurn(ledger, 1, 'the second thing I said');
    return ledger;
  };

  it('onInput sees the real incoming userText (not a blind {}) + the prior history', async () => {
    const c = captor('run');
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addGuard('onInput', 'any', c.guard, { id: 'x:captor' });
    const ledger = priorTurn();

    await evaluateOnInput(spec, ledger, fixtureWorld());

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
    const ledger = priorTurn();

    await evaluatePreTool(spec, ledger, fixtureWorld(), 'act', { foo: 1 });

    expect(c.seen[0].userText).toBe('the second thing I said');
    expect(c.seen[0].history[0].userText).toBe('the first thing I said');
    // The current turn's tool args still ride ctx.args — userText is a distinct field.
    expect(c.seen[0].args).toEqual({ foo: 1 });
  });

  it('onReply sees userText + history', async () => {
    const c = captor('behavior');
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: ['act'] });
    spec.addGuard('onReply', 'any', c.guard, { id: 'x:captor' });
    const ledger = priorTurn();

    await finalizeReply(spec, CONTRACT, fixtureWorld(), ledger, 'a reply', async () => '', 0);

    const mine = c.seen.filter((s) => s.reply === 'a reply');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].userText).toBe('the second thing I said');
    expect(mine[0].history[0].userText).toBe('the first thing I said');
  });
});
