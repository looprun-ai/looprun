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

test('a slot the reads answer nothing for refuses the call with the plain default', () => {
  const reads = new Map([['booking', readAct({ day: 'Tuesday' })]]);
  expect(desk.emptyRefusal('cancelBooking', HELD, reads))
    .toBe('the records hold nothing for this call to act on');
  expect(() => desk.tenses('cancelBooking', HELD, reads)).toThrow(TurnFailure);
});

test('the card empty sentence speaks instead, rendered over the held args', () => {
  const withEmpty = new AgentFactory().governed(
    { name: 'a', persona: 'p' },
    { name: 'd', disclosure: { cancelBooking: {
        needs: { booking: { tool: 'getBooking', args: { bookingRef: 'id' } } },
        before: 'Cancelling {booking.room} on {booking.day} is permanent.',
        empty: 'Booking {args.id} carries no room to cancel.' } } },
    MISMATCHED);
  const emptyDesk = new DisclosureDesk(withEmpty.disclosureBindings);
  const reads = new Map([['booking', readAct({ day: 'Tuesday' })]]);
  expect(emptyDesk.emptyRefusal('cancelBooking', HELD, reads))
    .toBe('Booking bk_9 carries no room to cancel.');
});

test('a digits step reaches into a list — the first row fills the slot', () => {
  const listed = new AgentFactory().governed(
    { name: 'a', persona: 'p' },
    { name: 'd', disclosure: { getBooking: {
        after: 'Room {result.rows.0.room} stands first.' } } },
    MISMATCHED);
  const listedDesk = new DisclosureDesk(listed.disclosureBindings);
  expect(listedDesk.afterOf('getBooking', { tool: 'getBooking', args: {}, key: 'k' },
    { rows: [{ room: '12' }, { room: '7' }] })).toBe('Room 12 stands first.');
  expect(listedDesk.afterOf('getBooking', { tool: 'getBooking', args: {}, key: 'k' },
    { rows: [] })).toBeNull();
});

test('emptyRefusal stays silent while every tense fills', () => {
  const reads = new Map([['booking', readAct({ room: '12', day: 'Tuesday' })]]);
  expect(desk.emptyRefusal('cancelBooking', HELD, reads)).toBeNull();
  expect(desk.emptyRefusal('unknownTool', HELD, new Map())).toBeNull();
});

test('a tool with no binding owes nothing and renders nothing', () => {
  expect(desk.owedReads('unknownTool', HELD)).toEqual([]);
  const t = desk.tenses('unknownTool', HELD, new Map());
  expect(t).toEqual({ before: null, after: null, later: null });
});

const MARINA = { tools: {
  getReport: fact({ name: 'getReport', effect: 'read', target: 'reportId',
    schema: { type: 'object', properties: { reportId: { type: 'string' } }, required: ['reportId'] } }),
  getBond: fact({ name: 'getBond', effect: 'read', target: 'mooringId',
    schema: { type: 'object', properties: { mooringId: { type: 'string' } }, required: ['mooringId'] } }),
  settleReport: fact({ name: 'settleReport', effect: 'destructive', target: 'reportId', label: 'Settle a damage report',
    schema: { type: 'object', properties: { reportId: { type: 'string' }, deduction: { type: 'number' } }, required: ['reportId', 'deduction'] } })
} } as const;

const chainedDesk = new DisclosureDesk(new AgentFactory().governed(
  { name: 'a', persona: 'p' },
  { name: 'd', disclosure: { settleReport: {
      needs: { report: { tool: 'getReport', args: { reportId: 'reportId' } },
               bond: { tool: 'getBond', args: { mooringId: 'report.report.mooringId' } } },
      before: 'Settling {report.report.id} takes {args.deduction} out of the {bond.held} bond on {report.report.mooringId}.',
      cap: { arg: 'deduction', at: 'bond.held',
        refusal: 'A deduction of {args.deduction} cannot pass: the bond on {report.report.mooringId} holds {bond.held}, and the difference is settled outside this desk.' } } } },
  MARINA).disclosureBindings);

const HELD_SETTLE = { tool: 'settleReport', args: { reportId: 'rp_1', deduction: 900 }, key: 'k' };

function chainAct(tool: string, result: Act['result']): Act {
  return { id: 'a1', turn: 1, origin: 'engine',
    call: { tool, args: {}, key: 'r' },
    effect: 'read', said: 'yes', status: 'done', reason: null, evidence: 'executor',
    sentence: `${tool}() — done`, result, questionId: null, guard: null };
}

test('a chained alias runs after the alias it reads, filled from that answer', () => {
  const steps = chainedDesk.owedReads('settleReport', HELD_SETTLE);
  expect(steps.map(s => s.alias)).toEqual(['report', 'bond']);
  expect(steps[0].args).toEqual({ reportId: 'rp_1' });
  const reads = new Map([['report', chainAct('getReport', { report: { id: 'rp_1', mooringId: 'moor_7' } })]]);
  expect(chainedDesk.fillOwed(steps[1], reads)).toEqual({ mooringId: 'moor_7' });
});

test('the cap anchors on the chained alias and refuses with every figure rendered', () => {
  const reads = new Map([
    ['report', chainAct('getReport', { report: { id: 'rp_1', mooringId: 'moor_7' } })],
    ['bond', chainAct('getBond', { held: 640 })]
  ]);
  const refusal = chainedDesk.overCap('settleReport', HELD_SETTLE, reads);
  expect(refusal).toBe('A deduction of 900 cannot pass: the bond on moor_7 holds 640, '
    + 'and the difference is settled outside this desk.');
});

test('aliases that read each other have no running order, and construction refuses them', () => {
  expect(() => new AgentFactory().governed(
    { name: 'a', persona: 'p' },
    { name: 'd', disclosure: { settleReport: {
        needs: { report: { tool: 'getReport', args: { reportId: 'bond.reportId' } },
                 bond: { tool: 'getBond', args: { mooringId: 'report.report.mooringId' } } },
        before: 'x' } } },
    MARINA)).toThrow(/form a cycle/);
});
