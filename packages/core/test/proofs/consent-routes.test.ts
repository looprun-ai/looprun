/**
 * THE TWO CONSENT ROUTES, end to end and deterministically.
 *
 * ROUTE A — the schema can simulate: a bare pre-consent act is DOWNGRADED to its own simulation;
 * the world validates and names the record; the question's code, typed next turn, licenses the
 * same bare call.
 *
 * ROUTE B — the schema cannot simulate: the VETO raises the question from the record the call
 * itself names; the code licenses the same call. A tool with neither a record in its arguments nor
 * a declared label can raise no question and never runs.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import { beginTurn, createActionHistory, recordToolResult } from '../../src/runtime/action-history.js';
import { evaluatePreTool } from '../../src/runtime/turn.js';
import { FIXTURE_TOOL_DEFS, FixtureWorld } from '../../src/testing/index.js';
import type { AgentWorld } from '../../src/rules.js';

describe('Route A — downgrade, simulation, code, act', () => {
  it('bare pre-consent act → simulation executes and asks → typed code licenses the bare act', async () => {
    const spec = new AgentSpecBase({
      id: 'route-a', mode: 'PROOF', persona: 'You are the proof agent.',
      tools: ['deleteItem'], destructiveTools: ['deleteItem'],
    });
    const world = new FixtureWorld('seeded-media');
    const h = createActionHistory();
    h.simulatableTools = spec.simulatableToolNames(FIXTURE_TOOL_DEFS);

    // Turn 0: the model reaches for the bare act.
    beginTurn(h, 0, 'delete p001');
    const v = await evaluatePreTool(spec, h, world, 'deleteItem', { id: 'p001' });
    expect(v.verdict).toBe('downgrade');
    if (v.verdict !== 'downgrade') return;
    // The caller's side of the contract: re-enter once (no second downgrade), execute the simulation.
    const again = await evaluatePreTool(spec, h, world, 'deleteItem', v.args, { canDowngrade: false });
    expect(again.verdict).toBe('allow');
    const output = world.exec('deleteItem', v.args);
    recordToolResult(h, 'deleteItem', v.args, output, world);
    // The simulation changed nothing and raised the question about the record the world named.
    expect(world.toolCalls.at(-1)?.tookEffect).toBe(false);
    expect(h.approvals.filter((a) => a.issuedTurn === h.turnIndex)).toHaveLength(1);
    // The question is about the ACT, not about the rehearsal that raised it.
    expect(h.approvals[0].args).toEqual({ id: 'p001' });
    // The bare attempt is scoring surface; the turn did not become a veto.
    expect(h.attemptedCalls).toEqual([{ name: 'deleteItem', args: { id: 'p001' } }]);
    expect(h.vetoStreak).toBe(0);

    // Turn 1: the user's own words carry the code — the SAME bare call now runs.
    beginTurn(h, 1, h.approvals[0].token);
    expect(h.consentThisTurn).toHaveLength(1);
    const act = await evaluatePreTool(spec, h, world, 'deleteItem', { id: 'p001' });
    expect(act.verdict).toBe('allow');
    const result = world.exec('deleteItem', { id: 'p001' });
    recordToolResult(h, 'deleteItem', { id: 'p001' }, result, world);
    expect(world.toolCalls.at(-1)?.tookEffect).toBe(true);
  });
});

describe('Route B — the veto raises the question from the call', () => {
  const routeBWorld = (): AgentWorld => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls: any[] = [];
    return {
      exec(name: string, args: Record<string, unknown>) {
        const result = { success: true, unsubscribed: args.customerId };
        calls.push({ name, args, result, tookEffect: true });
        return result;
      },
      advanceTurn() {},
      ingestAttachment: () => 'att_1',
      toolCalls: calls,
      sseActions: [],
    } as unknown as AgentWorld;
  };

  it('veto → question about the record the call names → typed code licenses the same call', async () => {
    const spec = new AgentSpecBase({
      id: 'route-b', mode: 'PROOF', persona: 'You are the proof agent.',
      tools: ['unsubscribeCustomer'], destructiveTools: ['unsubscribeCustomer'],
    });
    const world = routeBWorld();
    const h = createActionHistory();
    h.simulatableTools = spec.simulatableToolNames([
      { name: 'unsubscribeCustomer', inputSchema: { properties: { customerId: {} } } },
    ]);

    beginTurn(h, 0, 'remove cust_2001 from the list');
    const v = await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(v.verdict).toBe('deny');
    expect(h.approvals.filter((a) => a.issuedTurn === h.turnIndex)).toHaveLength(1);
    expect(h.approvals[0].args).toEqual({ customerId: 'cust_2001' });
    expect(world.toolCalls).toHaveLength(0); // the world was never reached

    beginTurn(h, 1, h.approvals[0].token);
    const act = await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(act.verdict).toBe('allow');
  });

  it('the code licenses only the record it names — another id stays gated', async () => {
    const spec = new AgentSpecBase({
      id: 'route-b2', mode: 'PROOF', persona: 'You are the proof agent.',
      tools: ['unsubscribeCustomer'], destructiveTools: ['unsubscribeCustomer'],
    });
    const world = routeBWorld();
    const h = createActionHistory();

    beginTurn(h, 0, 'remove cust_2001');
    await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    beginTurn(h, 1, h.approvals[0].token);
    const other = await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_9999' });
    expect(other.verdict).toBe('deny');
  });

  it('a call with no arguments still raises an answerable question', async () => {
    const spec = new AgentSpecBase({
      id: 'route-b3', mode: 'PROOF', persona: 'You are the proof agent.',
      tools: ['purgeAllLogs'], destructiveTools: ['purgeAllLogs'],
    });
    const world = routeBWorld();
    const h = createActionHistory();

    beginTurn(h, 0, 'purge the logs');
    const v = await evaluatePreTool(spec, h, world, 'purgeAllLogs', {});
    expect(v.verdict).toBe('deny');
    expect(h.approvals).toHaveLength(1);
    // A human "yes" is not the literal, so the act stays denied.
    beginTurn(h, 1, 'yes I am sure');
    expect(h.consentThisTurn).toHaveLength(0);
    expect((await evaluatePreTool(spec, h, world, 'purgeAllLogs', {})).verdict).toBe('deny');
    // The literal the engine minted is what licenses it.
    beginTurn(h, 2, h.approvals[0].token);
    expect(h.consentThisTurn).toHaveLength(1);
    expect((await evaluatePreTool(spec, h, world, 'purgeAllLogs', {})).verdict).toBe('allow');
  });
});
