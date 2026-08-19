import { test, expect } from 'vitest';
import type { CallCtx, InputCtx, ReplyCtx, ResultCtx, StateSnapshot } from '../../src/contract/vocabulary.js';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import { argAbsent, blockPattern, checkResult, mustAccountFor, precondition,
         valueFromUser } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const STATE: StateSnapshot = HOSTILE.card.records;

function callCtx(tool: string, args: Record<string, string>,
                 state: StateSnapshot | null = STATE, userText = ''): CallCtx {
  return { call: { tool, args, key: JSON.stringify({ args, tool }) }, effect: 'destructive',
           consented: false, state, userText, userTexts: [userText], turnActs: [], pastActs: [] };
}

function replyCtx(message: string, report: ReplyCtx['report'] = []): ReplyCtx {
  return { message, report, userText: '', turnActs: [], pastActs: [] };
}

test('argAbsent denies when the forbidden declared arg arrives', () => {
  const g = argAbsent('sendEmail', 'bcc').compile('contract', FACTS);
  expect(g.deny(callCtx('sendEmail', { to: 'a@b.c' }))).toBeNull();
  expect(g.deny(callCtx('sendEmail', { to: 'a@b.c', bcc: 'x@y.z' }))).toContain('bcc');
});

test('precondition resolves the record from the tool OWN entity — two entities, one id', () => {
  const twoEntities: StateSnapshot = {
    bookings: { x_1: { paid: true, marker: 'booking-row' } },
    invoices: { x_1: { paid: false, marker: 'invoice-row' } }
  };
  const g = precondition('cancelBooking', ({ record }) => record?.paid === true,
                         'Only paid bookings cancel.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'x_1' }, twoEntities))).toBeNull();
});

test('precondition denies while the record fails the check — the rule alone is the denial', () => {
  const g = precondition('cancelBooking',
    ({ state }) => state.invoices?.inv_1?.paid === true,
    'The invoice must be paid first.').compile('contract', FACTS);
  const verdict = g.deny(callCtx('cancelBooking', { id: 'bk_9' }));
  expect(verdict).toBe('');
  expect(g.rule).toBe('The invoice must be paid first.');
});

test('precondition on a stateless surface is loud, never a silent pass', () => {
  const g = precondition('cancelBooking', ({ record }) => record !== null, 'r').compile('contract', FACTS);
  expect(() => g.deny(callCtx('cancelBooking', { id: 'bk_9' }, null))).toThrow(TurnFailure);
});

test('checkResult wraps the author check over the result ctx', () => {
  const g = checkResult('compRoom', ctx =>
    (ctx.result as { comped?: boolean }).comped === true ? null : 'the room was not comped')
    .compile('contract', FACTS);
  const ok: ResultCtx = { call: { tool: 'compRoom', args: {}, key: 'k' }, result: { comped: true },
                          state: STATE, userText: '', turnActs: [], pastActs: [] };
  expect(g.deny(ok)).toBeNull();
  expect(g.deny({ ...ok, result: { comped: false } })).toContain('not comped');
});

test('mustAccountFor demands the record at the declared status — whole-value equality', () => {
  const g = mustAccountFor({ records: ['bk_9'], status: 'done' }).compile('contract', FACTS);
  expect(g.deny(replyCtx('ok', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]))).toBeNull();
  expect(g.deny(replyCtx('ok', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }])))
    .toContain('bk_9');
  expect(g.deny(replyCtx('ok', []))).toContain('bk_9');
});

test('valueFromUser passes only a value the user wrote as contiguous whole tokens', () => {
  const g = valueFromUser('sendEmail', 'to').compile('contract', FACTS);
  expect(g.deny(callCtx('sendEmail', { to: 'ana@example.com' }, STATE,
    'send it to ana@example.com please'))).toBeNull();
  expect(g.deny(callCtx('sendEmail', { to: 'eve@example.com' }, STATE,
    'send it to ana@example.com please'))).toContain('to');
  expect(g.deny(callCtx('sendEmail', { to: 'ana' }, STATE,
    'reach ana@example.com'))).toContain('to');
});

test('valueFromUser reads a number arg by its digits — the user must have written them', () => {
  const g = valueFromUser('registerAsset', 'requiredDeposit').compile('contract', FACTS);
  const call = (deposit: number, userText: string): CallCtx =>
    ({ ...callCtx('registerAsset', {}, STATE, userText),
       call: { tool: 'registerAsset', args: { requiredDeposit: deposit }, key: 'k' } });
  expect(g.deny(call(3000, 'Deposit is 3000, condition good.'))).toBeNull();
  expect(g.deny(call(0, 'Add a new machine: Genie S-65, 780 a day.')))
    .toContain('requiredDeposit');
});

test('blockPattern denies on input by default and on reply when asked', () => {
  const input = blockPattern('no-cpf-in', /\d{3}\.\d{3}\.\d{3}-\d{2}/,
    'A CPF never passes through.').compile('contract', FACTS);
  expect(input.on).toBe('input');
  const inCtx: InputCtx = { userText: 'my cpf is 123.456.789-01', turnActs: [], pastActs: [] };
  expect(input.deny(inCtx)).toContain('blocked');
  expect(input.deny({ ...inCtx, userText: 'hello' })).toBeNull();

  const reply = blockPattern('no-cpf-out', /\d{3}\.\d{3}\.\d{3}-\d{2}/,
    'A CPF never leaves.', { on: 'reply' }).compile('contract', FACTS);
  expect(reply.on).toBe('reply');
  expect(reply.deny(replyCtx('the cpf is 123.456.789-01'))).toContain('blocked');
});
