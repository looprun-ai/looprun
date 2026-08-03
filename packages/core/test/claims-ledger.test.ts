/**
 * CLAIMS as first-class TURN STATE — the ledger records the CURRENT turn's
 * `did`, the onReply/postTool/mutator GuardCtx expose it, and `recordTurnHistory` freezes it into the
 * sealed turn. Asking is an `ask` INTENTION inside that `did` — there is no `asked` field on the
 * ledger, on `HistoryTurn` or on `GuardCtx`; every reader answers the question with
 * `hasAskIntent`. This pins the plumbing the cross-check AND consent guards read: the delivered respond's
 * declaration, reset per turn, retained in history as delivered.
 */
import { describe, expect, it } from 'vitest';
import { hasAskIntent } from '../src/runtime/claims.js';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, GuardCtx } from '../src/index.js';
import { createLedger, beginTurn, recordTerminal, recordTerminalCall, recordTurnHistory } from '../src/runtime/ledger.js';
import { finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}

describe('claims in the turn ledger', () => {
  it('a delivered respond surfaces did on the ledger', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund order 7');
    const did = [{ op: 'refund', target: 'order-7', outcome: 'success', amount: 50 }];
    // The real terminal-recording PAIR: recordTerminalCall (hook time) then recordTerminal (execute).
    recordTerminalCall(ledger, 'respond', { message: 'Done.', did });
    recordTerminal(ledger, 'respond', { message: 'Done.', did });
    expect(ledger.did).toEqual(did);
    expect(hasAskIntent(ledger.did)).toBe(false);
  });

  it('an ask intention is captured — that IS the ask signal', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'Which order?', did: [{ op: 'ask' }] });
    expect(ledger.did).toEqual([{ op: 'ask' }]);
    expect(hasAskIntent(ledger.did)).toBe(true);
  });

  it('a stray `asked:true` arg does not make the turn an ask', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'Which order?', did: [{ op: 'inform' }], asked: true });
    expect(ledger.did).toEqual([{ op: 'inform' }]);
    expect(hasAskIntent(ledger.did)).toBe(false);
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
    recordTerminal(ledger, 'respond', { message: 'Real.', did: [{ op: 'a', outcome: 'success' }] });
    recordTerminal(ledger, 'respond', { message: '', did: [{ op: 'ask' }] });
    expect(ledger.did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(hasAskIntent(ledger.did)).toBe(false);
    expect(ledger.terminalReply).toBe('Real.');
  });

  it('beginTurn resets the declaration', () => {
    const ledger = createLedger();
    recordTerminal(ledger, 'respond', { message: 'x', did: [{ op: 'a', outcome: 'success' }, { op: 'ask' }] });
    beginTurn(ledger, 1);
    expect(ledger.did).toEqual([]);
    expect(hasAskIntent(ledger.did)).toBe(false);
  });

  it('createLedger starts with an empty declaration', () => {
    const ledger = createLedger();
    expect(ledger.did).toEqual([]);
    expect(hasAskIntent(ledger.did)).toBe(false);
  });
});

describe('recordTurnHistory retains the claims as delivered, frozen', () => {
  it('stores the turn declaration into history[n].did and freezes it', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', target: 'o7', outcome: 'success' }] });
    recordTurnHistory(ledger, 'Done.');
    const h = ledger.history[0];
    expect(h.did).toEqual([{ op: 'refund', target: 'o7', outcome: 'success' }]);
    expect(hasAskIntent(h.did)).toBe(false);
    expect(Object.isFrozen(h.did)).toBe(true);
    expect(Object.isFrozen(h.did[0])).toBe(true);
  });

  it('a later turn does not mutate the prior turn declaration in history', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'first');
    recordTerminal(ledger, 'respond', { message: 'r0', did: [{ op: 'a', outcome: 'success' }] });
    recordTurnHistory(ledger, 'r0');
    beginTurn(ledger, 1, 'second');
    recordTerminal(ledger, 'respond', { message: 'r1', did: [{ op: 'b', outcome: 'failure' }, { op: 'ask' }] });
    recordTurnHistory(ledger, 'r1');
    expect(ledger.history[0].did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(hasAskIntent(ledger.history[0].did)).toBe(false);
    expect(ledger.history[1].did).toEqual([{ op: 'b', outcome: 'failure' }, { op: 'ask' }]);
    expect(hasAskIntent(ledger.history[1].did)).toBe(true);
  });
});

describe('GuardCtx carries the declaration on the reply-side hooks', () => {
  it('the onReply ctx built by finalizeReply exposes the ledger did (ask intention included)', async () => {
    let captured: GuardCtx | undefined;
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addReplyCheck(custom({ kind: 'probe', dim: 'behavior', check: (ctx) => { captured = ctx; return null; }, prose: () => '' }), { id: 'agent:probe' });
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }, { op: 'ask' }] });

    // The delivered respond IS the payload finalizeReply reads — it seats ctx.did from it.
    await finalizeReply(spec, undefined, fixtureWorld(), ledger, { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }, { op: 'ask' }] }, async () => ({ message: '', did: [] }), 1);

    expect(captured?.did).toEqual([{ op: 'refund', outcome: 'success' }, { op: 'ask' }]);
    expect(hasAskIntent(captured!.did!)).toBe(true);
  });

  it('the mutator ctx built by finalizeReply exposes the ledger did', async () => {
    const seen: GuardCtx[] = [];
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addMutator({ kind: 'captorMutator', apply: (reply, ctx) => { seen.push(ctx); return reply; } }, { id: 'agent:captorMutator' });
    const ledger = createLedger();
    beginTurn(ledger, 0, 'refund 7');
    recordTerminal(ledger, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }] });

    await finalizeReply(spec, undefined, fixtureWorld(), ledger, { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }] }, async () => ({ message: '', did: [] }), 0);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].did).toEqual([{ op: 'refund', outcome: 'success' }]);
    expect(hasAskIntent(seen[0].did!)).toBe(false);
  });
});
