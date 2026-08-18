import { test, expect } from 'vitest';
import type { ReadyCall, ToolAnswer } from '../../src/contract/vocabulary.js';
import type { ToolPort } from '../../src/contract/ports.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { Engine } from '../../src/run/engine.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { finishStep } from '../fixtures/scripted-model.js';
import { bookingAgent, scriptedTargets } from '../fixtures/compiled-agents.js';

// P9 · R2.6 — two calls in one step execute serially, in emission order: the second
// call enters the executor only after the first exited.
class TracingToolPort implements ToolPort {
  readonly events: string[] = [];
  async call(call: ReadyCall): Promise<ToolAnswer> {
    const id = typeof call.args.id === 'string' ? call.args.id : '?';
    this.events.push(`enter:${id}`);
    if (id === 'bk_slow') await new Promise(resolve => setTimeout(resolve, 25));
    this.events.push(`exit:${id}`);
    return { result: { id }, done: 'yes' };
  }
}

test('emission order rules: the slow first call fully exits before the second enters', async () => {
  const port = new TracingToolPort();
  const model = new ScriptedModel([
    { calls: [
      { tool: 'getBooking', args: { id: 'bk_slow' } },
      { tool: 'getBooking', args: { id: 'bk_fast' } }
    ], text: '' },
    finishStep('Both read.')
  ]);
  const targets = scriptedTargets(1);
  const engine = Engine.create({
    compiled: bookingAgent(),
    toolPort: port,
    recordsPort: null,
    seat: ModelSeat.create(targets, targets[0].id, () => model)
  });

  const r = await engine.chat('s1', 'read bk_slow and bk_fast');

  expect(port.events).toEqual(['enter:bk_slow', 'exit:bk_slow', 'enter:bk_fast', 'exit:bk_fast']);
  expect(r.acts.map(a => a.call.args.id)).toEqual(['bk_slow', 'bk_fast']);
});
