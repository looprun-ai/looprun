/** The ask-then-echo loop through the REAL engine: the desk proposes a coded value, the engine
 *  refuses and opens the question, the operator answers on the next turn, and only then does the
 *  act run. The code the operator echoes is the one the engine minted — never a constant, and
 *  never one the operator was not shown. */
import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine, BOOKING_SURFACE, fact } from '../fixtures/compiled-agents.js';
import { choiceFromUser } from '../../src/cards/catalog.js';

const ROUTE = ['toTheCard', 'asStoreCredit'];
const RULE = 'Send the refund route only as the customer chose it.';

const SURFACE = { tools: { ...BOOKING_SURFACE.tools,
  refund: fact({ name: 'refund', effect: 'write', target: 'id',
    schema: { type: 'object',
              properties: { id: { type: 'string' }, route: { type: 'string' } },
              required: ['id', 'route'] },
    does: 'Refunds one booking by id.' }) } };

const GUARD = choiceFromUser('refund', 'route', ROUTE, RULE).compile('contract', SURFACE);

/** The engine under one choice-gated act. `done` is what the executor answers with. */
function rig(model: ScriptedModel, done: 'yes' | 'unknown' = 'yes') {
  return testEngine({ model, facts: SURFACE, guards: [GUARD],
    behaviors: { refund: () => ({ result: { refunded: true }, done }) } });
}

/** The six digits the engine minted, read out of the refusal the operator was shown — the
 *  operator has no other source for them. */
function mintedCode(sentence: string): string {
  const found = /<option> (\d{6})/.exec(sentence);
  if (found === null) throw new Error(`no minted code in: ${sentence}`);
  return found[1];
}

test('the engine asks, the operator answers, and only then does the act run', async () => {
  const model = new ScriptedModel([
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('Which refund route should I use?',
      [{ tool: 'refund', target: 'bk_1', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' },
    callStep('refund', { id: 'bk_1', route: 'asStoreCredit' }),
    finishStep('The refund went out as store credit.',
      [{ tool: 'refund', target: 'bk_1', word: 'done' }]),
    { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const { engine, port } = rig(model);

  const asked = await engine.chat('s1', 'Refund bk_1 please.');
  expect(port.log).toHaveLength(0);
  expect(asked.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked' });
  expect(asked.acts[0].sentence).toContain('[1] toTheCard');
  expect(asked.acts[0].sentence).toContain('[2] asStoreCredit');

  const code = mintedCode(asked.acts[0].sentence);
  expect(code).toMatch(/^\d{6}$/);

  const ran = await engine.chat('s1', `2 ${code}`);
  expect(ran.acts[0]).toMatchObject({ status: 'done' });
  expect(port.log).toHaveLength(1);
  expect(port.log[0].args).toMatchObject({ id: 'bk_1', route: 'asStoreCredit' });
});

test('the answer licenses the act ONCE — the next record is asked again, under a new code', async () => {
  const model = new ScriptedModel([
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('Which route?', [{ tool: 'refund', target: 'bk_1', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' },
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('Refunded to the card.', [{ tool: 'refund', target: 'bk_1', word: 'done' }]),
    { calls: [], text: '' }, { calls: [], text: '' },
    callStep('refund', { id: 'bk_2', route: 'toTheCard' }),
    finishStep('Which route for bk_2?',
      [{ tool: 'refund', target: 'bk_2', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const { engine, port } = rig(model);

  const asked = await engine.chat('s1', 'Refund bk_1.');
  const code = mintedCode(asked.acts[0].sentence);
  const ran = await engine.chat('s1', `1 ${code}`);
  expect(ran.acts[0]).toMatchObject({ status: 'done' });

  // A second record, and the answer the operator already gave is spent.
  const again = await engine.chat('s1', 'Now refund bk_2 the same way.');
  expect(again.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked' });
  expect(port.log).toHaveLength(1);
  const second = mintedCode(again.acts[0].sentence);
  expect(second).toMatch(/^\d{6}$/);
  expect(second).not.toBe(code);
});

test('an act that comes back UNKNOWN spends the answer too — the next record is asked again', async () => {
  const model = new ScriptedModel([
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('Which route?', [{ tool: 'refund', target: 'bk_1', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' },
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('I could not confirm the refund.',
      [{ tool: 'refund', target: 'bk_1', word: 'unknown' }]),
    callStep('refund', { id: 'bk_2', route: 'toTheCard' }),
    finishStep('Which route for bk_2?',
      [{ tool: 'refund', target: 'bk_2', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const { engine, port } = rig(model, 'unknown');

  const asked = await engine.chat('s1', 'Refund bk_1.');
  const code = mintedCode(asked.acts[0].sentence);
  const unclear = await engine.chat('s1', `1 ${code}`);
  expect(unclear.acts[0]).toMatchObject({ status: 'unknown' });

  // The write may have landed. The answer is spent either way: bk_2 is asked from scratch.
  const again = await engine.chat('s1', 'Now refund bk_2 the same way.');
  expect(again.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked' });
  expect(port.log).toHaveLength(1);
  expect(mintedCode(again.acts[0].sentence)).not.toBe(code);
});

test('an echo arriving before the engine ever asked licenses nothing', async () => {
  const model = new ScriptedModel([
    callStep('refund', { id: 'bk_1', route: 'toTheCard' }),
    finishStep('Which route?', [{ tool: 'refund', target: 'bk_1', word: 'refused' }]),
    { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const { engine, port } = rig(model);

  const r = await engine.chat('s1', '1 481922');
  expect(port.log).toHaveLength(0);
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked' });
});
