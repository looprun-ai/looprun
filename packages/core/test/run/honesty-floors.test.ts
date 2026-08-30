/** The honesty floors over the DELIVERED words: a done act never vanishes from the
 *  delivery facts, a truthful report line is never called a contradiction while an
 *  untruthful one always is, a standing sentence never reaches the operator with an
 *  unfilled slot, and a missing argument is never narrated as an absent record. */
import { describe, expect, test } from 'vitest';
import type { Act, Json, ToolFact } from '@looprun-ai/core';
import type { TurnDraft } from '../../src/run/session.js';
import { assembleFacts } from '../../src/run/delivery-facts.js';
import { contradictedLine } from '../../src/run/turn.js';
import { ConsentDesk } from '../../src/run/consent-desk.js';
import { DisclosureDesk } from '../../src/run/disclosure-desk.js';
import { CanonicalCall } from '../../src/contract/canonical-call.js';

function blankDraft(): TurnDraft {
  return { turn: 1, userText: '', servedBy: '', acts: [], corrections: [],
    issued: [], consumed: [], closed: [], finish: null, closedBy: 'model', text: '',
    delivery: null, microTried: [], grounded: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
      modelCalls: 0 } };
}

function act(tool: string, status: Act['status'], reason: Act['reason'],
             owed: Act['owed'], args: Record<string, string> = { bookingId: 'bk_1' }): Act {
  return { id: `a_${tool}_${status}`, turn: 1, origin: 'model',
    call: { tool, args, key: `${tool}:${JSON.stringify(args)}` }, effect: 'write',
    said: null, status, reason, evidence: 'engine',
    sentence: `${tool}(bk_1) — ${status}`, owed, result: status === 'done' ? { moved: 'bk_1' } : null,
    questionId: null, guard: null };
}

describe('a done act never vanishes from the delivery facts', () => {
  test('a blocked attempt then a done write: the facts carry BOTH — the refusal and the receipt', () => {
    const blocked = act('moveBooking', 'not-done', 'blocked',
      { kind: 'refusal', text: 'the availability read has not run this conversation' });
    const done = act('moveBooking', 'done', null, null);
    const facts = assembleFacts([blocked, done], [], [], []);
    expect(facts.some(f => f.kind === 'receipt' && f.state === 'ran'
      && f.text.includes('moveBooking'))).toBe(true);
  });

  test('a done read stays composer material, not an owed fact', () => {
    const read: Act = { ...act('getBooking', 'done', null, null), effect: 'read' };
    expect(assembleFacts([read], [], [], [])).toEqual([]);
  });
});

describe('a report line is contradicted only when NO act supports it', () => {
  const pair = [
    act('moveBooking', 'not-done', 'blocked',
      { kind: 'refusal', text: 'the read has not run' }),
    act('moveBooking', 'done', null, null),
  ];
  test('the truthful word over a blocked-then-done pair stands', () => {
    expect(contradictedLine([{ tool: 'moveBooking', target: 'bk_1', word: 'done' }], pair))
      .toBeUndefined();
  });
  test('a word no act of the tool carries is the contradiction', () => {
    expect(contradictedLine([{ tool: 'moveBooking', target: 'bk_1', word: 'unknown' }], pair))
      .toEqual({ tool: 'moveBooking', target: 'bk_1', word: 'unknown' });
  });
});

describe('a standing sentence never reaches the operator with an unfilled slot', () => {
  test('a consumed later learns its result at execution and stands FILLED', () => {
    const desk = new ConsentDesk(c => c.data(v => JSON.parse(JSON.stringify(v)) as Json));
    desk.beginTurn();
    const decl = { schema: { properties: { scope: { type: 'string' } } } } as unknown as ToolFact;
    const call = CanonicalCall.of('holdRoom', { scope: 'suite' }, decl);
    if ('badArg' in call) throw new Error('bad call');
    const q = desk.hold(call, null, 'Hold the room?', { ...blankDraft(), turn: 1 },
      { after: null, later: 'Hold {result.holdId} is standing at {result.scope} level.' });
    desk.readAnswer(q.code, { ...blankDraft(), turn: 2 });
    desk.markExecuted(q.id, 2, 'holdRoom() — done', { holdId: 'hd_9', scope: 'suite' });
    expect(desk.laterTexts(3)).toContain('Hold hd_9 is standing at suite level.');
    desk.commit();
  });

  test('an owed text still carrying a slot never becomes a delivery fact', () => {
    const slotted = act('moveBooking', 'not-done', 'blocked',
      { kind: 'refusal', text: 'the window {args.endDate} is not readable' });
    expect(assembleFacts([slotted], [], [], [])).toEqual([]);
  });

  test('a consumed later carrying {result.holdId} is dropped, not delivered raw', () => {
    const desk = new ConsentDesk(c => c.data(v => JSON.parse(JSON.stringify(v)) as Json));
    desk.beginTurn();
    const decl = { schema: { properties: { scope: { type: 'string' } } } } as unknown as ToolFact;
    const call = CanonicalCall.of('holdRoom', { scope: 'suite' }, decl);
    if ('badArg' in call) throw new Error('bad call');
    const draft1 = { ...blankDraft(), turn: 1 };
    const q = desk.hold(call, null, 'Hold the room?', draft1,
      { after: null, later: 'Hold {result.holdId} is standing at {result.scope} level.' });
    desk.readAnswer(q.code, { ...blankDraft(), turn: 2 });
    desk.markExecuted(q.id, 2, 'holdRoom() — done');
    expect(desk.laterTexts(3).some(s => s.includes('{'))).toBe(false);
    desk.commit();
  });
});

describe('a missing argument is never narrated as an absent record', () => {
  test("the default empty sentence names the call's own missing argument", () => {
    const desk = new DisclosureDesk({
      quoteIt: { needs: {},
        before: 'Quoting runs {args.startDate} to {args.endDate}.',
        after: null, later: null, cap: null, empty: null },
    });
    const sentence = desk.emptyRefusal('quoteIt',
      { tool: 'quoteIt', args: { startDate: '2026-07-20' }, key: 'k' }, new Map());
    expect(sentence).not.toBeNull();
    expect(sentence).not.toContain('records hold nothing');
    expect(sentence).toContain('endDate');
  });
});
