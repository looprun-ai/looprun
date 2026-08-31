import { test, expect } from 'vitest';
import { proseDropsReads } from '../../src/run/turn.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { testEngine, OK_BEHAVIORS } from '../fixtures/compiled-agents.js';

// A done read's identifiers are the record's answer: a message carrying not one of
// them delivered nothing the reads returned, and the desk is sent back for it.

const readAct = (result: unknown): never => ({ id: 'a1', turn: 1, origin: 'model',
  effect: 'read', call: { tool: 'getLog', args: {}, key: 'k' }, said: 'yes',
  status: 'done', reason: null, evidence: 'executor', sentence: 'getLog() — done.',
  owed: null, result, questionId: null, guard: null }) as never;

test('prose that carries none of a read\'s identifiers drops the read', () => {
  const acts = [readAct({ entries: [{ actor: 'mb_1', detail: 'in_9 issued' }] })];
  expect(proseDropsReads(acts, 'The log shows the recent activity.')).toBe(true);
  expect(proseDropsReads(acts, 'mb_1 issued in_9.')).toBe(false);
});

test('a read returning no identifiers demands nothing of the prose', () => {
  expect(proseDropsReads([readAct({ holds: [], count: 0 })],
    'No freeze stands on the machine.')).toBe(false);
  expect(proseDropsReads([], 'Nothing was read this turn.')).toBe(false);
});

test('a message that names none of a read\'s identifiers is sent back, then seals', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('The room is free that day.', []),
    finishStep('Booking bk_9 has room 12 on Tuesday.', [])
  ]);
  const { engine } = testEngine({ model, behaviors: OK_BEHAVIORS });

  const r = await engine.chat('s1', 'check booking bk_9');

  const sentBack = r.corrections.flatMap(c =>
    c.kind === 'redrive' && c.guardName === 'readIsSpoken' ? [c.detail] : []);
  expect(sentBack).toHaveLength(1);
  expect(r.finish?.message).toBe('Booking bk_9 has room 12 on Tuesday.');
  expect(r.delivery.by).toBe('prose');
});
