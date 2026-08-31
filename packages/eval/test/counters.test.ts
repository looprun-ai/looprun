import { test, expect } from 'vitest';
import { computeCounters } from '../src/counters.js';
import type { CaseDump } from '../src/run-dir.js';

const record = (over: object): never => ({ turn: 1, servedBy: 's', userText: 'check the booking',
  acts: [], questions: { issued: [], consumed: [], closed: [] }, finish: null,
  corrections: [], text: 'All is well.', delivery: { by: 'prose', retried: false, facts: [] },
  closedBy: 'model',
  usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
           modelCalls: 1 }, ...over }) as never;

const dump = (...records: never[]): CaseDump => ({ case: 'c', variant: 'governed',
  split: 'fix', records, servedBy: 's', invariantFailures: [], failure: null,
  usage: [] }) as never;

test('a clean run counts zeros, with the delivery mix stated', () => {
  const counters = computeCounters([dump(
    record({}),
    record({ delivery: { by: 'desk', retried: false, facts: [] } })
  )]);
  expect(counters).toEqual({ emptyDeliveries: 0, framesLeaked: 0, rawJson: 0,
    readLinesDelivered: 0, twoOutcomes: 0, floorDeliveries: 0, proseDeliveries: 1,
    deskDeliveries: 1, deskRetries: 0, proseReaderRedrives: 0,
    languageMismatches: 0 });
});

test('a leaked frame, a floor delivery, a retry and the reader\'s refusals are each charged', () => {
  const counters = computeCounters([dump(
    record({ text: 'Done. cancelBooking(bk_9) — not-done (held)',
      delivery: { by: 'desk', retried: true, facts: [] } }),
    record({ text: 'On the record. cancelBooking(bk_9) — done',
      delivery: { by: 'floor', retried: false, facts: [] } }),
    record({ userText: 'cancele a reserva bk_9 para o cliente que pediu',
      text: 'The booking is cancelled and the deposit of the record is released.',
      corrections: [
        { kind: 'proseReader', check: 'language', detail: 'not the operator\'s language' },
        { kind: 'proseReader', check: 'wallEcho', detail: 'a rule delivered as world fact' }
      ] })
  )]);
  expect(counters.framesLeaked).toBe(1);          // the floor's frames are lawful
  expect(counters.floorDeliveries).toBe(1);
  expect(counters.deskRetries).toBe(1);
  expect(counters.proseReaderRedrives).toBe(2);   // every reader refusal on the record
  expect(counters.languageMismatches).toBe(1);    // the language refusals among them
});

test('an empty delivery and a read line in the desk\'s reply are charged', () => {
  const counters = computeCounters([dump(
    record({ text: '' }),
    record({ text: 'Here: getBooking(bk_9) result line.',
      delivery: { by: 'desk', retried: false, facts: [] },
      acts: [{ id: 'a1', turn: 1, origin: 'model', effect: 'read', said: 'yes',
        status: 'done', reason: null, evidence: 'executor',
        sentence: 'getBooking(bk_9) result line.', owed: null,
        call: { tool: 'getBooking', args: {}, key: 'k' }, result: null,
        questionId: null, guard: null }] })
  )]);
  expect(counters.emptyDeliveries).toBe(1);
  expect(counters.readLinesDelivered).toBe(1);
});
