/**
 * THE DELIVERED TEXT CARRIES EVERY OPEN APPROVAL — not only the ones this turn issued.
 *
 * An approval request stays open until the user's own words carry its token, a newer question about
 * the same act supersedes it, or the record it names changes. There is no turn window: a question
 * raised two turns ago and still unanswered is still outstanding work, so it renders again on this
 * turn's delivery exactly as it did on the turn it was born.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import type { AgentWorld } from '../src/rules.js';
import { beginTurn, createActionHistory, recordToolResult } from '../src/runtime/action-history.js';
import { finalizeReply } from '../src/runtime/turn.js';

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

const spec = (id: string) =>
  new AgentSpecBase({
    id,
    mode: 'PROOF',
    persona: 'You are the test agent.',
    tools: ['chargeDeposit'],
    destructiveTools: ['chargeDeposit'],
  });

describe('an approval issued last turn and still open', () => {
  it('renders in this turn delivery, even though this turn asks nothing new', async () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'charge the deposit for bk_1001');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { requiresConfirmation: true, id: 'bk_1001' });

    // Turn 2: the incoming message does not carry the code, so nothing is consumed and nothing new
    // is issued — the only open approval is the one from turn 1.
    beginTurn(actionHistory, 1, 'what else can you tell me about my account?');
    const out = await finalizeReply(
      spec('open-approvals'),
      undefined,
      fixtureWorld(),
      actionHistory,
      { message: 'Here is what I can tell you.', did: [{ op: 'inform' }] },
      async () => ({ message: '', did: [] }),
      0,
    );

    expect(out.text).toContain('To confirm bk_1001, reply: CONFIRM BK_1001');
  });
});

describe('a consumed or closed approval', () => {
  it('renders nothing once the user types its code', async () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'charge the deposit for bk_1001');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { requiresConfirmation: true, id: 'bk_1001' });

    beginTurn(actionHistory, 1, 'CONFIRM BK_1001');
    expect(actionHistory.consentThisTurn).toHaveLength(1);

    const out = await finalizeReply(
      spec('consumed-approval'),
      undefined,
      fixtureWorld(),
      actionHistory,
      { message: 'Done.', did: [{ op: 'inform' }] },
      async () => ({ message: '', did: [] }),
      0,
    );

    expect(out.text).not.toContain('CONFIRM BK_1001');
  });

  it('renders nothing once the record it names moves and closes the question', async () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0, 'charge the deposit for bk_1001');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { requiresConfirmation: true, id: 'bk_1001' });

    // The record moved: a write on bk_1001 took effect, so the open question about it closes.
    const world = fixtureWorld();
    world.toolCalls.push({ name: 'chargeDeposit', args: { id: 'bk_1001' }, result: { id: 'bk_1001' }, tookEffect: true });
    beginTurn(actionHistory, 1, 'go ahead and charge it directly');
    recordToolResult(actionHistory, 'chargeDeposit', { id: 'bk_1001' }, { id: 'bk_1001' }, world);
    expect(actionHistory.approvals[0]!.closed).toBe(true);

    const out = await finalizeReply(
      spec('closed-approval'),
      undefined,
      world,
      actionHistory,
      { message: 'Charged.', did: [{ op: 'inform' }] },
      async () => ({ message: '', did: [] }),
      0,
    );

    expect(out.text).not.toContain('CONFIRM BK_1001');
  });
});
