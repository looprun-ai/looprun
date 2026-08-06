/**
 * CLAIMS as first-class TURN STATE — the action history records the CURRENT turn's
 * `did`, the onReply/postTool/mutator GuardCtx expose it, and `recordTurnHistory` freezes it into the
 * sealed turn. Asking is an `ask` INTENTION inside that `did` — there is no `asked` field on the
 * action history, on `HistoryTurn` or on `GuardCtx`; every reader answers the question with
 * `hasAskIntent`. This pins the plumbing the cross-check AND consent guards read: the delivered respond's
 * declaration, reset per turn, retained in history as delivered.
 */
import { describe, expect, it } from 'vitest';
import { hasAskIntent } from '../src/runtime/claims.js';
import { AgentSpecBase, custom } from '../src/index.js';
import type { AgentWorld, GuardCtx } from '../src/index.js';
import { createActionHistory, beginTurn, recordTerminal, recordTerminalCall, recordTurnHistory } from '../src/runtime/action-history.js';
import { finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}

describe('claims in the turn actionHistory', () => {
  it('a delivered respond surfaces did on the actionHistory', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'refund order 7');
    const did = [{ op: 'refund', target: 'order-7', outcome: 'success', amount: 50 }];
    // The real terminal-recording PAIR: recordTerminalCall (hook time) then recordTerminal (execute).
    recordTerminalCall(actionHistory, 'respond', { message: 'Done.', did });
    recordTerminal(actionHistory, 'respond', { message: 'Done.', did });
    expect(actionHistory.did).toEqual(did);
    expect(hasAskIntent(actionHistory.did)).toBe(false);
  });

  it('an ask intention is captured — that IS the ask signal', () => {
    const actionHistory = createActionHistory();
    recordTerminal(actionHistory, 'respond', { message: 'Which order?', did: [{ op: 'ask' }] });
    expect(actionHistory.did).toEqual([{ op: 'ask' }]);
    expect(hasAskIntent(actionHistory.did)).toBe(true);
  });

  it('a stray `asked:true` arg does not make the turn an ask', () => {
    const actionHistory = createActionHistory();
    recordTerminal(actionHistory, 'respond', { message: 'Which order?', did: [{ op: 'inform' }], asked: true });
    expect(actionHistory.did).toEqual([{ op: 'inform' }]);
    expect(hasAskIntent(actionHistory.did)).toBe(false);
  });

  it('an ill-shaped did stores the valid subset and pushes a claims-invalid tag', () => {
    const actionHistory = createActionHistory();
    recordTerminal(actionHistory, 'respond', {
      message: 'x',
      did: [{ op: 'ok', outcome: 'success' }, { op: '', outcome: 'success' }, 'nope'],
    });
    expect(actionHistory.did).toEqual([{ op: 'ok', outcome: 'success' }]);
    expect(actionHistory.turnCorrections.some((c) => c.startsWith('claims-invalid:'))).toBe(true);
  });

  it('the last non-empty-message respond wins; an empty-message respond does not overwrite it', () => {
    const actionHistory = createActionHistory();
    recordTerminal(actionHistory, 'respond', { message: 'Real.', did: [{ op: 'a', outcome: 'success' }] });
    recordTerminal(actionHistory, 'respond', { message: '', did: [{ op: 'ask' }] });
    expect(actionHistory.did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(hasAskIntent(actionHistory.did)).toBe(false);
    expect(actionHistory.terminalReply).toBe('Real.');
  });

  it('beginTurn resets the declaration', () => {
    const actionHistory = createActionHistory();
    recordTerminal(actionHistory, 'respond', { message: 'x', did: [{ op: 'a', outcome: 'success' }, { op: 'ask' }] });
    beginTurn(actionHistory, 1);
    expect(actionHistory.did).toEqual([]);
    expect(hasAskIntent(actionHistory.did)).toBe(false);
  });

  it('createActionHistory starts with an empty declaration', () => {
    const actionHistory = createActionHistory();
    expect(actionHistory.did).toEqual([]);
    expect(hasAskIntent(actionHistory.did)).toBe(false);
  });
});

describe('recordTurnHistory retains the claims as delivered, frozen', () => {
  it('stores the turn declaration into history[n].did and freezes it', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'refund 7');
    recordTerminal(actionHistory, 'respond', { message: 'Done.', did: [{ op: 'refund', target: 'o7', outcome: 'success' }] });
    recordTurnHistory(actionHistory, 'Done.');
    const h = actionHistory.history[0];
    expect(h.did).toEqual([{ op: 'refund', target: 'o7', outcome: 'success' }]);
    expect(hasAskIntent(h.did)).toBe(false);
    expect(Object.isFrozen(h.did)).toBe(true);
    expect(Object.isFrozen(h.did[0])).toBe(true);
  });

  it('a later turn does not mutate the prior turn declaration in history', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'first');
    recordTerminal(actionHistory, 'respond', { message: 'r0', did: [{ op: 'a', outcome: 'success' }] });
    recordTurnHistory(actionHistory, 'r0');
    beginTurn(actionHistory, 1, 'second');
    recordTerminal(actionHistory, 'respond', { message: 'r1', did: [{ op: 'b', outcome: 'failure' }, { op: 'ask' }] });
    recordTurnHistory(actionHistory, 'r1');
    expect(actionHistory.history[0].did).toEqual([{ op: 'a', outcome: 'success' }]);
    expect(hasAskIntent(actionHistory.history[0].did)).toBe(false);
    expect(actionHistory.history[1].did).toEqual([{ op: 'b', outcome: 'failure' }, { op: 'ask' }]);
    expect(hasAskIntent(actionHistory.history[1].did)).toBe(true);
  });
});

describe('GuardCtx carries the declaration on the reply-side hooks', () => {
  it('the onReply ctx built by finalizeReply exposes the actionHistory did (ask intention included)', async () => {
    let captured: GuardCtx | undefined;
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addReplyCheck(custom({ kind: 'simulate', dim: 'behavior', check: (ctx) => { captured = ctx; return null; }, prose: () => '' }), { id: 'agent:simulate' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'refund 7');
    recordTerminal(actionHistory, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }, { op: 'ask' }] });

    // The delivered respond IS the payload finalizeReply reads — it seats ctx.did from it.
    await finalizeReply(spec, undefined, fixtureWorld(), actionHistory, { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }, { op: 'ask' }] }, async () => ({ message: '', did: [] }), 1);

    expect(captured?.did).toEqual([{ op: 'refund', outcome: 'success' }, { op: 'ask' }]);
    expect(hasAskIntent(captured!.did!)).toBe(true);
  });

  it('the mutator ctx built by finalizeReply exposes the actionHistory did', async () => {
    const seen: GuardCtx[] = [];
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    spec.addMutator({ kind: 'captorMutator', apply: (reply, ctx) => { seen.push(ctx); return reply; } }, { id: 'agent:captorMutator' });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'refund 7');
    recordTerminal(actionHistory, 'respond', { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }] });

    await finalizeReply(spec, undefined, fixtureWorld(), actionHistory, { message: 'Done.', did: [{ op: 'refund', outcome: 'success' }] }, async () => ({ message: '', did: [] }), 0);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].did).toEqual([{ op: 'refund', outcome: 'success' }]);
    expect(hasAskIntent(seen[0].did!)).toBe(false);
  });
});
