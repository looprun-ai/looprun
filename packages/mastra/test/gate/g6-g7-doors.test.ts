import { test, expect } from 'vitest';
import { UngovernedAgent } from '../../src/ungoverned-agent.js';
import { LoopRunAgent } from '../../src/loop-run-agent.js';
import { assemble, assembleUngoverned } from '../../src/agent-assembly.js';
import { BOOKING, SPEC, callStep, finishStep } from '../fixtures/booking-world.js';

// G6 — the ungoverned twin through the public class: byte-identical prompt, the
// destructive call runs unheld, and the class NAME is the only disarming.
test('G6 — UngovernedAgent: same prompt bytes, nothing held', async () => {
  const governed = await assemble({ spec: SPEC, model: { scripted: { steps: [] } }, world: BOOKING });
  const twin = await assembleUngoverned({ spec: SPEC, model: { scripted: { steps: [] } }, world: BOOKING });
  expect(JSON.stringify(twin.config.compiled.promptParts))
    .toBe(JSON.stringify(governed.config.compiled.promptParts));

  const agent = new UngovernedAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('cancelBooking', { id: 'bk_9' }),
      finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }],
        ['F1']),
      { calls: [], text: '' },
      { calls: [], text: '' }
    ] } }
  });
  const out = await agent.generate('cancel bk_9', { session: 's1' });
  expect(out.loopRun.questions.issued).toHaveLength(0);
  expect(out.loopRun.acts[0].status).toBe('done');
});

// G7 — stream(): the turn governs to completion FIRST; the delivered reply then
// streams and reassembles byte-identical.
test('G7 — stream governs to completion, then the delivery flows', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('getBooking', { id: 'bk_9' }),
      finishStep('bk_9 is confirmed for Tuesday.')
    ] } }
  });
  const out = await agent.stream('is bk_9 confirmed?', { session: 's1' });
  expect(out.loopRun.acts[0].status).toBe('done');   // sealed before any chunk is read
  let streamed = '';
  for await (const chunk of out.textStream) streamed += chunk;
  expect(streamed).toBe(out.loopRun.text);
});
