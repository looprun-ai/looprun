/**
 * CLAIMS as first-class TURN STATE (SCG-T2) — the ledger records the CURRENT turn's `did`/`asked`, the
 * onReply/postTool/mutator GuardCtx expose them, and `recordTurnHistory` freezes them into the sealed
 * turn. Task 1 shipped the TurnClaim core + the single `respond` terminal; this pins the plumbing the
 * cross-check guards (T4) will read: the delivered respond's declaration, reset per turn, retained in
 * history as delivered.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, GuardCtx } from '../src/index.js';
import { createLedger, beginTurn, recordTerminal, recordTerminalCall, recordTurnHistory } from '../src/runtime/ledger.js';
import { finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}

describe('claims in the turn ledger', () => {
  it('a delivered respond surfaces did/asked on the ledger', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund order 7');
    const did = [{ op: 'refund', target: 'order-7', outcome: 'success', amount: 50 }];
    // The real terminal-recording PAIR: recordTerminalCall (hook time) then recordTerminal (execute).
    recordTerminalCall(ledger, 'respond', { message: 'Done.', did, asked: false });
    recordTerminal(ledger, 'respond', { message: 'Done.', did, asked: false });
    expect(ledger.did).toEqual(did);
    expect(ledger.asked).toBe(false);
  });

  it('asked:true is captured', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'Which order?', did: [], asked: true });
    expect(ledger.did).toEqual([]);
    expect(ledger.asked).toBe(true);
  });

  it('an ill-shaped did stores the valid subset and pushes a claims-invalid tag', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', {
      message: 'x',
      did: [{ op: 'ok', outcome: 'success' }, { op: '', outcome: 'success' }, 'nope'],
    });
    expect(ledger.did).toEqual([{ op: 'ok', outcome: 'success' }]);
    expect(ledger.turnCorrections.some((c) => c.startsWith('claims-invalid:'))).toBe(true);
  });

  it('the last non-empty-message respond wins; an empty-message respond does not overwrite it', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'Real.', did: [{ op: 'a', outcome: 'success' }], asked: false });
    recordTerminal(ledger, 'respond', { message: '', did: [], asked: true });
    expect(ledger.did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(ledger.asked).toBe(false);
    expect(ledger.terminalReply).toBe('Real.');
  });

  it('beginTurn resets did/asked', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'x', did: [{ op: 'a', outcome: 'success' }], asked: true });
    beginTurn(ledger, 1);
    expect(ledger.did).toEqual([]);
    expect(ledger.asked).toBe(false);
  });

  it('createLedger starts with an empty declaration', () => {
    const ledger = createLedger();
    expect(ledger.did).toEqual([]);
    expect(ledger.asked).toBe(false);
  });
});

describe('recordTurnHistory retains the claims as delivered, frozen', () => {
  it('stores the turn declaration into history[n].did/asked and freezes it', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', target: 'o7', outcome: 'success' }], asked: false });
    recordTurnHistory(ledger, 'Done.');
    const h = ledger.history[0];
    expect(h.did).toEqual([{ op: 'refund', target: 'o7', outcome: 'success' }]);
    expect(h.asked).toBe(false);
    expect(Object.isFrozen(h.did)).toBe(true);
    expect(Object.isFrozen(h.did[0])).toBe(true);
  });

  it('a later turn does not mutate the prior turn declaration in history', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'first');
    recordTerminal(ledger, 'respond', { message: 'r0', did: [{ op: 'a', outcome: 'success' }], asked: false });
    recordTurnHistory(ledger, 'r0');
    beginTurn(ledger, 1, 'second');
    recordTerminal(ledger, 'respond', { message: 'r1', did: [{ op: 'b', outcome: 'failure' }], asked: true });
    recordTurnHistory(ledger, 'r1');
    expect(ledger.history[0].did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(ledger.history[0].asked).toBe(false);
    expect(ledger.history[1].did).toEqual([{ op: 'b', outcome: 'failure' }]);
    expect(ledger.history[1].asked).toBe(true);
  });
});

describe('GuardCtx carries did/asked on the reply-side hooks', () => {
  it('the onReply ctx built by finalizeReply exposes the ledger did/asked', async () => {
    let captured: GuardCtx | undefined;
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addReplyCheck(custom({ kind: 'probe', dim: 'behavior', check: (ctx) => { captured = ctx; return null; }, prose: () => '' }), { id: 'agent:probe' });
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }], asked: true });

    await finalizeReply(spec, undefined, fixtureWorld(), ledger, 'Done.', async () => '', 1);

    expect(captured?.did).toEqual([{ op: 'refund', outcome: 'success' }]);
    expect(captured?.asked).toBe(true);
  });

  it('the mutator ctx built by finalizeReply exposes the ledger did/asked', async () => {
    const seen: GuardCtx[] = [];
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addMutator({ kind: 'captorMutator', apply: (reply, ctx) => { seen.push(ctx); return reply; } }, { id: 'agent:captorMutator' });
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }], asked: false });

    await finalizeReply(spec, undefined, fixtureWorld(), ledger, 'Done.', async () => '', 0);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].did).toEqual([{ op: 'refund', outcome: 'success' }]);
    expect(seen[0].asked).toBe(false);
  });
});
