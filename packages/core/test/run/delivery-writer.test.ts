import { describe, expect, test } from 'vitest';
import { DeliveryWriter } from '../../src/run/delivery-writer.js';

const act = (tool: string, args: Record<string, unknown>, status: string, reason: string | null,
             effect: string, sentence: string, questionId: string | null = null) => ({
  origin: 'model', call: { tool, args, key: JSON.stringify({ args: Object.fromEntries(Object.entries(args).sort()), tool }) },
  effect, said: 'yes', status, reason, evidence: 'executor', sentence, result: null,
  id: 'a1', turn: 1, questionId, guard: null
} as never);

describe('settled', () => {
  test('one act per canonical call — arg order never splits it', () => {
    const dw = new DeliveryWriter();
    const done = act('issueRefund', { amount: 100, invoiceId: 'inv_7001' }, 'done', null, 'destructive', 'x — done. 100 back.');
    const retry = act('issueRefund', { invoiceId: 'inv_7001', amount: 100 }, 'not-done', 'blocked', 'destructive', 'x — not-done (again)');
    expect(dw.settled([done, retry])).toEqual([done]);
  });
});

describe('compose', () => {
  test('prose covering ids and figures silences the receipt', () => {
    const dw = new DeliveryWriter();
    const w = act('cancelBooking', { bookingId: 'bk_1001' }, 'done', null, 'destructive',
      'cancelBooking(bk_1001) — done. bk_1001 is cancelled: 0 of deposit stands.');
    expect(dw.compose('A bk_1001 foi cancelada; 0 de caução segue retido.', [w], [], []))
      .toBe('A bk_1001 foi cancelada; 0 de caução segue retido.');
  });
  test('a missing figure prints the unframed receipt beneath the prose', () => {
    const dw = new DeliveryWriter();
    const w = act('cancelBooking', { bookingId: 'bk_1001' }, 'done', null, 'destructive',
      'cancelBooking(bk_1001) — done. bk_1001 is cancelled: 0 of deposit stands.');
    expect(dw.compose('A bk_1001 foi cancelada.', [w], [], []))
      .toBe('A bk_1001 foi cancelada.\n\nbk_1001 is cancelled: 0 of deposit stands.');
  });
  test('the woven ask suppresses the question line; a thin prose does not', () => {
    const dw = new DeliveryWriter();
    const q = { id: 'q1', code: 'CONFIRM abc123', call: {} as never, sentence: 'Cancelling bk_1001 ends the rental.', state: 'open', bornAtTurn: 1 } as never;
    const held = act('cancelBooking', { bookingId: 'bk_1001' }, 'not-done', 'held', 'destructive', 'x — not-done (awaiting approval)', 'q1');
    expect(dw.compose('Cancelling bk_1001 ends the rental. Reply CONFIRM abc123.', [held], [q], []))
      .toBe('Cancelling bk_1001 ends the rental. Reply CONFIRM abc123.');
    expect(dw.compose('Pronto para cancelar.', [held], [q], []))
      .toBe('Pronto para cancelar.\n\n[CONFIRM abc123] Cancelling bk_1001 ends the rental.');
  });
  test('a pure-text read prints as a quote on an ask turn and only there', () => {
    const dw = new DeliveryWriter();
    const policy = act('lookupPolicy', {}, 'done', null, 'read',
      'lookupPolicy() — done. The published policy reads: "a hold lifts once resolved".');
    const held = act('releaseHold', { holdId: 'hold_6001' }, 'not-done', 'held', 'destructive', 'x', 'q1');
    expect(dw.compose('m', [policy, held], [], [])).toContain('The published policy reads');
    expect(dw.compose('m', [policy], [], [])).toBe('m');
  });
  test('never empty: with no prose, the settled sentences speak', () => {
    const dw = new DeliveryWriter();
    const w = act('issueRefund', { invoiceId: 'inv_7001' }, 'done', null, 'destructive',
      'issueRefund(inv_7001) — done. 100 is paid back on inv_7001.');
    expect(dw.compose('', [w], [], [], [], true)).toBe('100 is paid back on inv_7001.');
  });
});

describe('modelView', () => {
  test('the memory keeps every settled sentence the delivery may drop', () => {
    const dw = new DeliveryWriter();
    const r = act('getMember', {}, 'done', null, 'read', 'getMember() — done. Member mem_1001, role billing.');
    expect(dw.modelView('short prose', [r], [])).toContain('role billing');
    expect(dw.compose('short prose', [r], [], [])).toBe('short prose');
  });
});
