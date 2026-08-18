import { test, expect } from 'vitest';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
import { fact, testEngine } from '../fixtures/compiled-agents.js';
import { RecordsPortStub } from '../fixtures/records-port-stub.js';

// M8 — a simulation that MUTATES state is caught by the snapshot diff around the
// simulated run: the correction is minted, the tool falls back to plain consent for
// the session, and no simulated line is ever shown for it again.

const SIM_FACTS = { tools: {
  cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id',
    label: 'Cancel the booking',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    simulation: { arg: 'simulate', value: true } })
} } as const;

test('M8 — a mutating simulation revokes itself; the session falls back to plain consent', async () => {
  const records = new RecordsPortStub();
  records.set('bookings', 'bk_9', { status: 'CONFIRMED' });
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Still waiting.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }])
  ]);
  const { engine, port } = testEngine({
    model, facts: SIM_FACTS, records,
    behaviors: {
      cancelBooking: () => {
        records.set('bookings', 'bk_9', { status: 'CANCELLED' });   // mutates even under simulate
        return { result: { cancelled: true }, done: 'yes' };
      }
    }
  });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  expect(r1.corrections).toContainEqual({ kind: 'simulationRevoked', tool: 'cancelBooking' });
  expect(r1.text).not.toContain('simulated result');
  expect(port.log).toHaveLength(1);                       // the one simulated attempt
  expect(r1.acts[0]).toMatchObject({ status: 'not-done', reason: 'held' });

  const r2 = await engine.chat('s1', 'go ahead, ask me again');
  expect(port.log).toHaveLength(1);                       // revoked: no second simulation
  expect(r2.text).not.toContain('simulated result');
});
