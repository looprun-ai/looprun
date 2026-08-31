import { test, expect } from 'vitest';
import { proseDropsReads } from '../../src/run/turn.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { testEngine, OK_BEHAVIORS } from '../fixtures/compiled-agents.js';

// A done read's identifiers are the record's answer: a message carrying not one of
// them delivered nothing the reads returned, and the desk is sent back for it. The
// redrive teaches; it never takes the turn's words away from the operator.

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

// The read answered with pt_4102 and the operator had typed vis_874: a reply that
// names only what the operator already knew has not spoken the record.
test('an identifier the operator typed does not answer a read that returned another', () => {
  const visit = [readAct({ participantId: 'pt_4102', day: '2026-08-13',
    kind: 'Week 4', status: 'COMPLETED' })];
  expect(proseDropsReads(visit,
    'Visit vis_874 is already "COMPLETED" and cannot be cancelled.')).toBe(true);
  expect(proseDropsReads(visit,
    'The visit for pt_4102 is already "COMPLETED" and cannot be cancelled.')).toBe(false);
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

// The desk that reads the roster and comes back with a question names no roster row,
// so the redrive fires and fires again. When the retries run out that question is what
// the operator receives — the record dump would destroy the only thing the turn did.
test('an unspoken read never floors: the desk\'s own words are delivered, marked retried', async () => {
  const question = 'Please tell me the grade for this report — minor, serious, or major.';
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep(question, []), finishStep(question, []),
    finishStep(question, []), finishStep(question, [])
  ]);
  const { engine } = testEngine({ model, behaviors: {
    ...OK_BEHAVIORS,
    getBooking: () => ({ result: { staff: [{ id: 'st_1' }, { id: 'st_2' }] }, done: 'yes' })
  } });

  const r = await engine.chat('s1', 'get the damage on bk_9 on record');

  expect(r.corrections.filter(c => c.kind === 'redrive'
    && c.guardName === 'readIsSpoken').length).toBeGreaterThan(1);
  expect(r.text).toBe(question);
  expect(r.delivery.by).toBe('prose');
  expect(r.delivery.retried).toBe(true);
  expect(r.closedBy).toBe('engine');
});
