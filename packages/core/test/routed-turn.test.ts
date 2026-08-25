import { test, expect } from 'vitest';
import type { TurnRecord } from '../src/contract/vocabulary.js';
import { ScriptedModel } from '../src/run/scripted-model.js';
import { callStep, finishStep } from './fixtures/scripted-model.js';
import { fact, testEngine } from './fixtures/compiled-agents.js';

/** A surface whose one tool holds for consent, so a turn can carry an open question. */
const CONSENT_FACTS = { tools: {
  cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id',
    label: 'Cancel the booking',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    does: 'Cancels one booking by id.' })
} } as const;

test('before exchanges ride the window as plain text between history and the new message', async () => {
  const model = new ScriptedModel([finishStep('Nothing to do here.')]);
  const { engine } = testEngine({ model });

  await engine.chat('s1', 'now raise the invoice',
    { before: [{ desk: 'money', userText: 'u1', replyText: 'r1' }] });

  expect(model.seen[0].messages).toEqual([
    { role: 'user', text: 'u1' },
    { role: 'assistant', text: 'r1' },
    { role: 'user', text: 'now raise the invoice' }
  ]);
});

test('a returnable turn offers notMine and a first-call notMine returns without sealing', async () => {
  const model = new ScriptedModel([
    callStep('notMine', { reason: 'not mine' }),
    finishStep('Nothing to do here.')
  ]);
  const { engine, port } = testEngine({ model });

  const returned = await engine.chat('s1', 'raise the invoice', { returnable: true });

  expect(returned).toEqual({ returned: { reason: 'not mine' } });
  const names = model.seen[0].tools.map(t => t.name);
  expect(names).toContain('notMine');
  // The finish stays last: forceFinish targets the last card on the surface.
  expect(names[names.length - 1]).toBe('finish');
  expect(port.log).toEqual([]);

  // The tape is untouched: the next turn is still turn 1 and its window carries
  // no sealed exchange.
  const next = await engine.chat('s1', 'what can you do');
  expect((next as TurnRecord).turn).toBe(1);
  expect(model.seen[1].messages).toEqual([{ role: 'user', text: 'what can you do' }]);
});

test('notMine after an act is refused and the turn continues', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1001' }),
    callStep('notMine', { reason: 'wrong desk' }),
    finishStep('Your booking is on the record.')
  ]);
  const { engine } = testEngine({ model });

  const result = await engine.chat('s1', 'check booking bk_1001', { returnable: true });

  expect('returned' in result).toBe(false);
  const record = result as TurnRecord;
  expect(record.acts.map(a => a.call.tool)).toEqual(['getBooking']);
  expect(record.corrections).toContainEqual(
    { kind: 'returnRefused', detail: 'the return door closed once work began' });
  expect(record.finish?.message).toBe('Your booking is on the record.');
});

test('a decline the engine already read shuts the return door', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    callStep('notMine', { reason: 'billing, not me' }),
    finishStep('Kept as is.')
  ]);
  const { engine, port } = testEngine({ model, facts: CONSENT_FACTS,
    behaviors: { cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }) } });

  const asked = await engine.chat('s1', 'cancel bk_9');
  const question = asked.questions.issued[0];
  const decline = question.code.replace('CONFIRM', 'NO');

  const result = await engine.chat('s1', `no, keep it — ${decline}`, { returnable: true });

  // The turn read the operator's NO before the model spoke: work has begun, so the
  // door is shut and the decline seals instead of vanishing with a dropped draft.
  expect('returned' in result).toBe(false);
  const record = result as TurnRecord;
  expect(record.turn).toBe(2);
  expect(record.corrections).toContainEqual(
    { kind: 'returnRefused', detail: 'the return door closed once work began' });
  expect(record.questions.closed).toEqual([{ id: question.id, why: 'declined' }]);
  expect(port.log).toEqual([]);
});

test('a non-returnable turn never carries the notMine card', async () => {
  const model = new ScriptedModel([finishStep('Nothing to do here.')]);
  const { engine } = testEngine({ model });

  await engine.chat('s1', 'raise the invoice', { before: [] });

  expect(model.seen[0].tools.map(t => t.name)).not.toContain('notMine');
});
