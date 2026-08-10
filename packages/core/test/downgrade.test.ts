/**
 * ROUTE A — a destructive act denied for consent on a simulatable tool is DOWNGRADED to its own
 * simulation: the caller re-enters once with `simulate: true` and executes that instead. The bare
 * attempt stays on the scoring surface; nothing else of a veto happens.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import { createActionHistory, recordDowngradedAttempt } from '../src/runtime/action-history.js';
import { evaluatePreTool } from '../src/runtime/turn.js';
import type { AgentWorld } from '../src/rules.js';

const spec = new AgentSpecBase({
  id: 's', mode: 'm', persona: 'p',
  tools: ['cancelBooking', 'unsubscribeCustomer'],
  destructiveTools: ['cancelBooking', 'unsubscribeCustomer'],
});
const world = { toolCalls: [] } as unknown as AgentWorld; // evaluatePreTool never calls the world

const history = () => {
  const h = createActionHistory();
  h.simulatableTools = new Set(['cancelBooking']);
  return h;
};

describe('the downgrade verdict', () => {
  it('downgrades a bare pre-consent act on a simulatable tool', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(v.verdict).toBe('downgrade');
    if (v.verdict === 'downgrade') expect(v.args).toEqual({ bookingId: 'bk_1001', simulate: true });
  });

  it('a downgrade is not a veto: no observed row, no vetoStreak, no approval issued', async () => {
    const h = history();
    await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(h.observed).toHaveLength(0);
    expect(h.vetoStreak).toBe(0);
    expect(h.approvals).toHaveLength(0);
    expect(h.attemptedCalls).toEqual([{ name: 'cancelBooking', args: { bookingId: 'bk_1001' } }]);
  });

  it('the re-entry with simulate:true is allowed (the bypass licenses it)', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001', simulate: true });
    expect(v.verdict).toBe('allow');
  });

  it('a non-simulatable tool is vetoed and the veto raises the question from the args', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(v.verdict).toBe('deny');
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].args).toEqual({ customerId: 'cust_2001' });
  });

  it('canDowngrade:false routes the simulatable tool through the veto-question path too', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' }, { canDowngrade: false });
    expect(v.verdict).toBe('deny');
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].args).toEqual({ bookingId: 'bk_1001' });
  });
});

describe('recordDowngradedAttempt', () => {
  it('records the attempt for scoring and a guard-events note, and nothing else', () => {
    const h = createActionHistory();
    recordDowngradedAttempt(h, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(h.attemptedCalls).toEqual([{ name: 'cancelBooking', args: { bookingId: 'bk_1001' } }]);
    expect(h.turnCorrections).toEqual(['downgrade:confirmFirst:cancelBooking']);
    expect(h.observed).toHaveLength(0);
    expect(h.vetoStreak).toBe(0);
  });
});
