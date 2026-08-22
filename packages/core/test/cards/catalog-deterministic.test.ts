import { test, expect } from 'vitest';
import type { CallCtx, InputCtx, Json, ReplyCtx, ResultCtx, StateSnapshot } from '../../src/contract/vocabulary.js';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import { argAbsent, blockPattern, checkResult, choiceFromUser, mustAccountFor, precondition,
         questionAnswered, valueFromUser } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const STATE: StateSnapshot = HOSTILE.card.records;

function callCtx(tool: string, args: Record<string, Json>,
                 state: StateSnapshot | null = STATE, userText = '',
                 userTexts: readonly string[] = [userText]): CallCtx {
  return { call: { tool, args, key: JSON.stringify({ args, tool }) }, effect: 'destructive',
           consented: false, state, userText, userTexts, turnActs: [], pastActs: [] };
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

const DELIVERY = { true: ['delivered', 'drop it off'], false: ['collect', 'pick it up'] };
const RULE = 'Send whether delivery is included only as the customer chose it.';

test('choiceFromUser passes a choice the user stated this turn', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { includeDelivery: true }, STATE,
    'Have it Delivered on Friday.'))).toBeNull();
  expect(g.rule).toBe(RULE);
});

test('choiceFromUser reads every message of the conversation, not the current one alone', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { includeDelivery: false }, STATE, 'Go ahead.',
    ['I will collect it myself.', 'Room 12, Friday.', 'Go ahead.']))).toBeNull();
});

test('choiceFromUser refuses a choice nobody stated — the rule alone is the denial', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { includeDelivery: true }, STATE,
    'Book room 12 for Friday.'))).toBe('');
});

test('choiceFromUser refuses a value it carries no words for', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { includeDelivery: 'maybe' }, STATE, 'Deliver it.')))
    .toContain('carries no words for that option');
});

test('choiceFromUser refuses a call the gated argument never arrives on', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { id: 'bk_9' }, STATE, 'Comp room 12.'))).toBe('');
});

test('choiceFromUser refuses a value the user negated, and grounds the opposite', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery',
    { true: ['delivery', 'deliver'], false: ['collect', 'pick it up'] }, RULE)
    .compile('contract', FACTS);
  const said = "They're collecting it themselves, no delivery needed.";
  expect(g.deny(callCtx('compRoom', { includeDelivery: true }, STATE, said))).toBe('');
  expect(g.deny(callCtx('compRoom', { includeDelivery: false }, STATE, said))).toBeNull();
});

test("choiceFromUser reads a contraction as the negator it is", () => {
  const DAMAGE = { damage: ['damage', 'damaged'], loss: ['stolen', 'lost'] };
  const g = choiceFromUser('compRoom', 'type', DAMAGE, RULE).compile('contract', FACTS);
  const said = "The excavator wasn't damaged — it was stolen off the site overnight.";
  expect(g.deny(callCtx('compRoom', { type: 'damage' }, STATE, said))).toBe('');
  expect(g.deny(callCtx('compRoom', { type: 'loss' }, STATE, said))).toBeNull();
});

test('choiceFromUser reads a negation clause by clause, never across the whole message', () => {
  const g = choiceFromUser('compRoom', 'includeDelivery', DELIVERY, RULE)
    .compile('contract', FACTS);
  expect(g.deny(callCtx('compRoom', { includeDelivery: true }, STATE,
    'There is no rush; have it delivered on Friday.'))).toBeNull();
});

test('questionAnswered demands words for a question — empty and tool roll-calls violate', () => {
  const g = questionAnswered().compile('engine', FACTS);
  const ctx = (message: string, userText: string): ReplyCtx =>
    ({ message, report: [], userText, turnActs: [], pastActs: [] });
  expect(g.deny(ctx('', 'Can I still rent it out next week?'))).toContain('question');
  expect(g.deny(ctx('Completed: getBooking, cancelBooking.', 'Can I rent it out next week?')))
    .toContain('not an answer');
  expect(g.deny(ctx('No — the claim froze it.', 'Can I still rent it out next week?'))).toBeNull();
  expect(g.deny(ctx('', 'File the claim against ast_excv01.'))).toBeNull();
  expect(g.deny(ctx('Completed: getBooking.', 'File the claim.'))).toBeNull();
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
