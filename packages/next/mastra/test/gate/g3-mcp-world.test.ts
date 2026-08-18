import { test, expect, afterAll } from 'vitest';
import type { McpWorldCard } from '@looprun-ai/next-core';
import { LoopRunAgent } from '../../src/loop-run-agent.js';
import { SPEC, callStep, finishStep } from '../fixtures/booking-world.js';
import { startMcpFixture, type McpFixture } from '../fixtures/mcp-fixture.js';

// G3 — an mcpWorld card against an in-process MCP server: SurfaceGate reconciles,
// deny-by-default excludes what the card does not declare, one governed call
// round-trips over the protocol's own wire.
let fixture: McpFixture | null = null;
afterAll(async () => { await fixture?.close(); });

const CARD: McpWorldCard = {
  reads: { getBooking: { label: 'Look up the booking' } }
  // cancelBooking is served by the host but NOT declared — deny-by-default excludes it.
};

test('G3 — reconcile, exclude, and one governed round-trip', async () => {
  fixture = await startMcpFixture();
  const agent = new LoopRunAgent({
    spec: SPEC, world: CARD, mcp: { url: fixture.url },
    model: { scripted: { steps: [
      callStep('getBooking', { id: 'bk_9' }),
      finishStep('bk_9 is confirmed.')
    ] } }
  });
  const out = await agent.generate('is bk_9 confirmed?', { session: 's1' });
  expect(out.loopRun.acts[0]).toMatchObject({ call: { tool: 'getBooking' }, status: 'done' });
  expect(JSON.stringify(out.loopRun.acts[0].result)).toContain('CONFIRMED');
  expect(agent.excluded()).toEqual(['cancelBooking']);
});
