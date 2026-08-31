import { test, expect } from 'vitest';
import type { AgentSpec, ModelStep, TurnRecord } from '@looprun-ai/core';
import { world } from '@looprun-ai/core';
import { LoopRunAgent } from '@looprun-ai/mastra';
import { Server } from '../../src/server.js';


// G2 — the same consent case as G1, through HTTP: the code rides the envelope's
// typed record, the approval turn executes engine-side, all over the real wire.
const BOOKING = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED' } } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'Cancel the booking' } }
});
const SPEC: AgentSpec = { name: 'hotel', persona: 'You are the hotel desk.' };

const step = (calls: { tool: string; args: Record<string, unknown> }[], text = ''): ModelStep =>
  ({ calls, text });
const finish = (message: string, report: { tool: string; target: string; word: string }[] = [],
                facts: readonly string[] = []) =>
  step([{ tool: 'finish', args: { message, report, facts } }]);

test('G2 — hold and approve over POST /v1/chat/completions', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      step([{ tool: 'cancelBooking', args: { id: 'bk_9' } }]),
      finish('I need your approval to cancel bk_9.',
        [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
      step([]),
      step([]),
      finish('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
      // The done write mints its receipt, and the desk's own message must carry it.
    ] } }
  });
  const server = await Server.start({ agents: { hotel: agent }, auth: { apiKeys: ['k1'] } });
  const post = async (content: string) => {
    const res = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer k1' },
      body: JSON.stringify({ model: 'hotel', session: 's1',
        messages: [{ role: 'user', content }] })
    });
    expect(res.status).toBe(200);
    return await res.json() as { choices: [{ message: { content: string } }];
                                 meta: { loopRun: TurnRecord } };
  };
  try {
    const first = await post('cancel booking bk_9');
    const code = first.meta.loopRun.questions.issued[0].code;
    expect(first.choices[0].message.content).toContain(code);

    const second = await post(code);
    expect(second.meta.loopRun.acts[0]).toMatchObject({
      call: { tool: 'cancelBooking' }, origin: 'licence', status: 'done' });
  } finally { await server.close(); }
});
