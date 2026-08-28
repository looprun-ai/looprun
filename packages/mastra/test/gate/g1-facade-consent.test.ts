import { test, expect } from 'vitest';
import { LoopRunAgent } from '../../src/loop-run-agent.js';
import { BOOKING, SPEC, callStep, finishStep } from '../fixtures/booking-world.js';

// G1 — the M1 consent case through the PUBLIC door: hold with a coded question,
// approval by code, the engine executes the held call itself.
test('G1 — hold, approve by code, licensed execution via LoopRunAgent.generate', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('cancelBooking', { id: 'bk_9' }),
      finishStep('I need your approval to cancel bk_9.',
        [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
      { calls: [], text: '' },
      finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
    ] } }
  });

  const first = await agent.generate('cancel booking bk_9', { session: 's1' });
  expect(first.loopRun.acts[0]).toMatchObject({
    call: { tool: 'cancelBooking' }, status: 'not-done', reason: 'held', evidence: 'engine' });
  const code = first.loopRun.questions.issued[0].code;
  expect(first.text).toContain(code);

  const second = await agent.generate(code, { session: 's1' });
  expect(second.loopRun.acts[0]).toMatchObject({
    call: { tool: 'cancelBooking' }, origin: 'licence', status: 'done' });
  expect(second.loopRun.questions.consumed).toContain(first.loopRun.questions.issued[0].id);
});
