import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P1 · R2.7 — a scripted turn seals [toolCall, toolResult, reply] in order, in a
// complete TurnRecord.
test('a scripted turn seals the transcript in order, complete TurnRecord', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('Booking found: room 12 on Tuesday.')
  ]);
  const { engine, port } = testEngine({ model });

  const r = await engine.chat('s1', 'check booking bk_1001');

  expect(port.log).toEqual([{ tool: 'getBooking', args: { id: 'bk_1001' } }]);
  expect(r.turn).toBe(1);
  expect(r.servedBy).toBe('scripted-1');
  expect(r.userText).toBe('check booking bk_1001');
  expect(r.acts).toHaveLength(1);
  expect(r.acts[0]).toMatchObject({
    origin: 'model', effect: 'read', said: 'yes', status: 'done', reason: null,
    evidence: 'executor', questionId: null,
    call: { tool: 'getBooking', args: { id: 'bk_1001' } }
  });
  expect(r.acts[0].result).toEqual({ id: 'bk_1001', room: '12', day: 'Tuesday' });
  expect(r.finish?.message).toBe('Booking found: room 12 on Tuesday.');
  expect(r.corrections).toEqual([]);
  expect(r.closedBy).toBe('model');
  expect(r.text).toBe('Booking found: room 12 on Tuesday.');
  expect(r.delivery).toEqual({ by: 'prose', retried: false, facts: [] });
  expect(r.questions).toEqual({ issued: [], consumed: [], closed: [] });
});
