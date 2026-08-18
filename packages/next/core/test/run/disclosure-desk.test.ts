import { test, expect } from 'vitest';
import type { Act } from '../../src/contract/vocabulary.js';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { DisclosureDesk } from '../../src/run/disclosure-desk.js';
import { fact } from '../fixtures/compiled-agents.js';

const MISMATCHED = { tools: {
  getBooking: fact({ name: 'getBooking', effect: 'read', target: 'bookingRef',
    schema: { type: 'object', properties: { bookingRef: { type: 'string' } }, required: ['bookingRef'] } }),
  cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id', label: 'Cancel the booking',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } })
} } as const;

const compiled = new AgentFactory().governed(
  { name: 'a', persona: 'p' },
  { name: 'd', disclosure: { cancelBooking: {
      needs: { booking: { tool: 'getBooking', args: { bookingRef: 'id' } } },
      before: 'Cancelling {booking.room} on {booking.day} is permanent.',
      after: 'Cancelled room {booking.room}.',
      later: 'Booking {args.id} stays cancelled.' } } },
  MISMATCHED);
const desk = new DisclosureDesk(compiled.disclosureBindings);

const HELD = { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'k' };

function readAct(result: Act['result']): Act {
  return { id: 'a1', turn: 1, origin: 'engine',
    call: { tool: 'getBooking', args: { bookingRef: 'bk_9' }, key: 'r' },
    effect: 'read', said: 'yes', status: 'done', reason: null, evidence: 'executor',
    sentence: 'getBooking(bk_9) — done', result, questionId: null, guard: null };
}

test('owedReads is the declared rename of the frozen held call — nothing else', () => {
  expect(desk.owedReads('cancelBooking', HELD)).toEqual([
    { alias: 'booking', tool: 'getBooking', args: { bookingRef: 'bk_9' } }
  ]);
  expect(desk.owedReads('getBooking', HELD)).toEqual([]);
});

test('the three tenses fill slots from the reads and the held args', () => {
  const reads = new Map([['booking', readAct({ room: '12', day: 'Tuesday' })]]);
  const t = desk.tenses('cancelBooking', HELD, reads);
  expect(t.before).toBe('Cancelling 12 on Tuesday is permanent.');
  expect(t.after).toBe('Cancelled room 12.');
  expect(t.later).toBe('Booking bk_9 stays cancelled.');
});

test('a slot no read filled is LOUD — compile proved derivability, so this is an executor lie', () => {
  const reads = new Map([['booking', readAct({ day: 'Tuesday' })]]);
  expect(() => desk.tenses('cancelBooking', HELD, reads)).toThrow(TurnFailure);
});

test('a tool with no binding owes nothing and renders nothing', () => {
  expect(desk.owedReads('unknownTool', HELD)).toEqual([]);
  const t = desk.tenses('unknownTool', HELD, new Map());
  expect(t).toEqual({ before: null, after: null, later: null });
});
