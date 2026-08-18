import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P2 · R8.2 — a duplicate call restates the first result within its turn; a
// read repeated on a LATER turn runs fresh, because the record may have moved.
test('the duplicate call restates the first result without re-execution', async () => {
  const model = new ScriptedModel([
    { calls: [
      { tool: 'getBooking', args: { id: 'bk_1001' } },
      { tool: 'getBooking', args: { id: 'bk_1001' } }
    ], text: '' },
    finishStep('Booking bk_1001 is room 12 on Tuesday.'),
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('Still room 12 on Tuesday.')
  ]);
  const { engine, port } = testEngine({ model });

  const r1 = await engine.chat('s1', 'check bk_1001');
  expect(port.log.filter(c => c.tool === 'getBooking')).toHaveLength(1);
  expect(r1.acts).toHaveLength(2);
  expect(r1.acts[0]).toMatchObject({ status: 'done', evidence: 'executor' });
  expect(r1.acts[1]).toMatchObject({ status: 'done', evidence: 'engine' });
  expect(r1.acts[1].result).toEqual(r1.acts[0].result);
  expect(r1.acts[1].sentence).toContain('first result restated');

  const r2 = await engine.chat('s1', 'check bk_1001 again');
  expect(port.log.filter(c => c.tool === 'getBooking')).toHaveLength(2);
  expect(r2.acts[0]).toMatchObject({ status: 'done', evidence: 'executor' });
});
