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

  // The turn seals nothing, so the one call the desk spent reading the message rides
  // back with the return — it is billed nowhere else.
  expect(returned).toEqual({ returned: { reason: 'not mine' },
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
             modelCalls: 1 } });
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

test('the return carries the tokens the desk spent, frozen like every boundary value', async () => {
  const model = new ScriptedModel([{ calls: [{ tool: 'notMine', args: { reason: 'not mine' } }],
    text: '', usage: { inputTokens: 120, outputTokens: 4, cachedInputTokens: 0,
                       reasoningTokens: 0 } }]);
  const { engine } = testEngine({ model });

  const returned = await engine.chat('s1', 'raise the invoice', { returnable: true });

  if (!('returned' in returned)) throw new Error('expected a return, got a sealed record');
  expect(returned.usage).toEqual({ inputTokens: 120, outputTokens: 4, cachedInputTokens: 0,
                                   reasoningTokens: 0, modelCalls: 1 });
  expect(Object.isFrozen(returned)).toBe(true);
  expect(Object.isFrozen(returned.usage)).toBe(true);
  expect(Object.isFrozen(returned.returned)).toBe(true);
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

test('an answer the engine already read shuts the return door', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    callStep('notMine', { reason: 'billing, not me' }),
    finishStep('Cancelled as approved.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, port } = testEngine({ model, facts: CONSENT_FACTS,
    behaviors: { cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }) } });

  const asked = await engine.chat('s1', 'cancel bk_9');
  const question = asked.questions.issued[0];

  const result = await engine.chat('s1', question.code, { returnable: true });

  // The turn consumed the operator's code before the model spoke: work has begun,
  // so the door is shut and the licensed act seals instead of vanishing with a
  // dropped draft.
  expect('returned' in result).toBe(false);
  const record = result as TurnRecord;
  expect(record.turn).toBe(2);
  expect(record.corrections).toContainEqual(
    { kind: 'returnRefused', detail: 'the return door closed once work began' });
  expect(record.questions.consumed).toContain(question.id);
  expect(port.log.map(c => c.tool)).toContain('cancelBooking');
});

test('grounded ids the door carries pass the floor; the same call without them is refused', async () => {
  const script = () => new ScriptedModel([
    callStep('getBooking', { id: 'bk_9001' }),
    finishStep('The booking is on the record.')
  ]);

  const carried = testEngine({ model: script() });
  const withProvenance = await carried.engine.chat('s1', 'the one the other desk found',
    { grounded: ['bk_9001'] }) as TurnRecord;

  expect(withProvenance.acts[0].status).toBe('done');
  expect(withProvenance.acts[0].guard).toBeNull();

  const alone = testEngine({ model: script() });
  const withoutProvenance = await alone.engine.chat(
    's1', 'the one the other desk found') as TurnRecord;

  expect(withoutProvenance.acts[0].status).toBe('not-done');
  expect(withoutProvenance.acts[0].guard).toBe('groundedIds');
  expect(withoutProvenance.acts[0].sentence).toContain(
    "'bk_9001' in 'id' appears in no result and no message");
});

test('a non-returnable turn never carries the notMine card', async () => {
  const model = new ScriptedModel([finishStep('Nothing to do here.')]);
  const { engine } = testEngine({ model });

  await engine.chat('s1', 'raise the invoice', { before: [] });

  expect(model.seen[0].tools.map(t => t.name)).not.toContain('notMine');
});
