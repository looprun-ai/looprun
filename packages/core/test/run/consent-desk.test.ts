import { test, expect } from 'vitest';
import { ConsentDesk } from '../../src/run/consent-desk.js';
import { CanonicalCall, isJson } from '../../src/contract/canonical-call.js';
import type { Json } from '../../src/contract/vocabulary.js';
import type { TurnDraft } from '../../src/run/session.js';

const TOOL_FACT = { schema: { properties: { invoiceId: { type: 'string' } } } };

function call(): CanonicalCall {
  const made = CanonicalCall.of('payInvoice', { invoiceId: 'inv_1' },
    TOOL_FACT as never);
  if (!(made instanceof CanonicalCall)) throw new Error('bad call');
  return made;
}

function draftAt(turn: number, userText = ''): TurnDraft {
  return { turn, userText, servedBy: '', acts: [], corrections: [], issued: [],
           consumed: [], closed: [], finish: null, closedBy: 'model', text: '',
           starved: [] } as unknown as TurnDraft;
}

function deskWithConsumed(consumedTurn: number): { desk: ConsentDesk; code: string } {
  const desk = new ConsentDesk(c => c.data(v => (isJson(v) ? (v as Json) : null)));
  desk.beginTurn();
  const holdDraft = draftAt(consumedTurn - 1);
  const question = desk.hold(call(), 'inv_1', 'Pays inv_1.', holdDraft);
  desk.readAnswer(question.code, draftAt(consumedTurn, question.code));
  desk.markExecuted(question.id, consumedTurn, 'payInvoice(inv_1) — done');
  desk.commit();
  return { desk, code: question.code };
}

test('a code consumed in an EARLIER turn is answered by the record', () => {
  const { desk, code } = deskWithConsumed(2);
  const answers = desk.staleAnswers(code, 3);
  expect(answers).toHaveLength(1);
  expect(answers[0]).toContain('already answered');
  expect(answers[0]).toContain('payInvoice(inv_1) — done');
});

test('the code consumed THIS turn stays silent — its answer sits beside it', () => {
  const { desk, code } = deskWithConsumed(2);
  expect(desk.staleAnswers(code, 2)).toHaveLength(0);
});
