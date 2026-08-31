/** The script a reply owes is the script the OPERATOR has been writing in, and a turn
 *  whose whole message is an approval code carries no script of its own. The reply is
 *  held against the latest operator message that carries words — otherwise the desk may
 *  answer in another writing system entirely, on precisely the turn where the operator
 *  sends six digits and nothing else. */
import { test, expect } from 'vitest';
import type { TurnRecord } from '../../src/contract/vocabulary.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { fact, testEngine } from '../fixtures/compiled-agents.js';

const CONSENT_FACTS = { tools: {
  cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id',
    label: 'Cancel the booking',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    does: 'Cancels one booking by id.' })
} } as const;

const ENGLISH_ASK = 'Please cancel the booking bk_9 for the guest today, she has asked '
  + 'us to let the room go and will not be arriving this evening.';
const CJK_REPLY = '\u4e88\u7d04 bk_9 \u306f\u30ad\u30e3\u30f3\u30bb\u30eb\u3055\u308c\u307e\u3057\u305f\u3002'
  + '\u304a\u90e8\u5c4b\u306f\u4eca\u591c\u304b\u3089\u7a7a\u5ba4\u3068\u306a\u308a\u307e\u3059\u3002'
  + '\u3054\u4f9d\u983c\u306e\u3068\u304a\u308a\u624b\u914d\u3044\u305f\u3057\u307e\u3057\u305f\u306e\u3067'
  + '\u3054\u5b89\u5fc3\u304f\u3060\u3055\u3044\u3002';

test('a reply in another script is refused on the turn the operator answered with a code',
  async () => {
    const model = new ScriptedModel([
      callStep('cancelBooking', { id: 'bk_9' }), finishStep('Held for your approval.'),
      { calls: [], text: '' }, { calls: [], text: '' },
      finishStep(CJK_REPLY, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }],
        ['F1']),
      { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
      { calls: [], text: '' }, { calls: [], text: '' }
    ]);
    const { engine } = testEngine({ model, facts: CONSENT_FACTS,
      behaviors: { cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }) } });

    const asked = await engine.chat('s1', ENGLISH_ASK) as TurnRecord;
    const code = asked.questions.issued[0].code;
    const answered = await engine.chat('s1', code) as TurnRecord;

    // The operator's whole message is digits — the latin message before it is the
    // reference, and the reply in another script never reaches the operator.
    expect(code).toMatch(/^\d+$/);
    expect(answered.corrections).toContainEqual(expect.objectContaining(
      { kind: 'proseReader', check: 'language' }));
    expect(answered.text).not.toContain('\u30ad\u30e3\u30f3\u30bb\u30eb');
  });
