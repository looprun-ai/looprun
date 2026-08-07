/**
 * A SCHEMA-LICENSED SIMULATION IS A READ. `evaluatePreTool` runs the FULL guard list on an acting
 * call, but a call whose declared schema carries `simulate` and is called with `simulate: true`
 * changes nothing in the world — so every preTool guard whose rule is about a WRITE is answered in
 * full by the world's own simulated response, and only the guards in `ALWAYS_GUARD_KINDS` still gate
 * it (a looping simulation is still a loop).
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, precondition } from '../src/index.js';
import type { AgentWorld } from '../src/index.js';
import { createActionHistory, recordToolResult } from '../src/runtime/action-history.js';
import { evaluatePreTool } from '../src/runtime/turn.js';

const spec = new AgentSpecBase({
  id: 's', mode: 'm', persona: 'p',
  tools: ['cancelBooking', 'purgeLogs'],
  destructiveTools: ['cancelBooking', 'purgeLogs'],
});
// A spec-authored precondition that always denies — the mirror every OTHER preTool guard is against.
spec.addGuard('preTool', ['cancelBooking', 'purgeLogs'], precondition(() => false, 'blocked by mirror'), {
  id: 'agent:mirror',
});

const world = { toolCalls: [] } as unknown as AgentWorld; // evaluatePreTool never calls the world

const history = () => {
  const h = createActionHistory();
  h.simulatableTools = new Set(['cancelBooking']); // purgeLogs' schema declares no `simulate`
  return h;
};

describe('a schema-licensed simulation is a read', () => {
  it('simulate:true on a simulatable tool passes a denying precondition guard', async () => {
    const h = history();
    const verdict = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(verdict.verdict).toBe('allow');
  });

  it('simulate:true on a tool whose schema has no simulate is NOT exempt', async () => {
    const h = history();
    const verdict = await evaluatePreTool(spec, h, world, 'purgeLogs', { simulate: true });
    expect(verdict.verdict).toBe('deny'); // the call is an act; an executor drops unknown args
  });

  it('noDuplicateCall still gates a repeated identical simulation', async () => {
    const h = history();
    const first = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(first.verdict).toBe('allow');
    recordToolResult(h, 'cancelBooking', { bookingId: 'bk_1', simulate: true }, { success: true }); // recorded
    const second = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(second.verdict).toBe('deny'); // a looping simulation is a loop
  });
});
