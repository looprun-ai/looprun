import { test, expect } from 'vitest';
import { ConsentDesk } from '../../src/run/consent-desk.js';
import { CanonicalCall, isJson } from '../../src/contract/canonical-call.js';
import type { Json } from '../../src/contract/vocabulary.js';
import type { TurnDraft } from '../../src/run/session.js';

// The code contract: six digits · the exact code alone licenses, in any language ·
// a wrapped code licenses nothing and earns the notice · NO plus the code has no
// effect · a code older than five minutes expires and licenses nothing.

const TOOL_FACT = { schema: { properties: { invoiceId: { type: 'string' } } } };

function call(): CanonicalCall {
  const made = CanonicalCall.of('payInvoice', { invoiceId: 'inv_1' }, TOOL_FACT as never);
  if (!(made instanceof CanonicalCall)) throw new Error('bad call');
  return made;
}

function draftAt(turn: number, userText = ''): TurnDraft {
  return { turn, userText, servedBy: '', acts: [], corrections: [], issued: [],
           consumed: [], closed: [], finish: null, closedBy: 'model', text: '',
           starved: [] } as unknown as TurnDraft;
}

function openDesk(now: () => number = Date.now): { desk: ConsentDesk; code: string } {
  const desk = new ConsentDesk(c => c.data(v => (isJson(v) ? (v as Json) : null)), now);
  desk.beginTurn();
  const question = desk.hold(call(), 'inv_1', 'Pays inv_1.', draftAt(1));
  return { desk, code: question.code };
}

test('the code is six digits', () => {
  const { code } = openDesk();
  expect(code).toMatch(/^\d{6}$/);
});

test('the exact code alone licenses — surrounding whitespace tolerated', () => {
  const { desk, code } = openDesk();
  const consumed = desk.readAnswer(`  ${code}\n`, draftAt(2));
  expect(consumed).toHaveLength(1);
});

test('the code inside any other text licenses nothing and earns the notice', () => {
  const { desk, code } = openDesk();
  expect(desk.readAnswer(`CONFIRM ${code}`, draftAt(2))).toHaveLength(0);
  expect(desk.open()).toHaveLength(1);
  expect(desk.codeNotices(`CONFIRM ${code}`))
    .toEqual(['To confirm, reply with only the code — nothing else.']);
});

test('NO plus the code has no effect — nothing closes, the same notice', () => {
  const { desk, code } = openDesk();
  const draft = draftAt(2);
  expect(desk.readAnswer(`NO ${code}`, draft)).toHaveLength(0);
  expect(draft.closed).toHaveLength(0);
  expect(desk.open()).toHaveLength(1);
  expect(desk.codeNotices(`NO ${code}`))
    .toEqual(['To confirm, reply with only the code — nothing else.']);
});

test('a code older than five minutes expires and licenses nothing', () => {
  let clock = 1_000_000;
  const { desk, code } = openDesk(() => clock);
  clock += 5 * 60_000 + 1;
  const draft = draftAt(2);
  const expired = desk.sweep(2, 99, draft);
  expect(expired).toHaveLength(1);
  expect(draft.closed).toEqual([{ id: expired[0].id, why: 'expired' }]);
  expect(desk.readAnswer(code, draftAt(2))).toHaveLength(0);
});
