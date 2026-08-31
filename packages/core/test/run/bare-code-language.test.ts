/** The language a reply owes is the language the OPERATOR has been writing, and a turn
 *  whose whole message is an approval code carries no language of its own. The reply is
 *  held against the latest operator message that carries words — otherwise the desk may
 *  answer in a language nobody used, on precisely the turn where the operator sends six
 *  digits and nothing else. */
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
const SPANISH_REPLY = 'La reserva bk_9 ha sido cancelada correctamente y la habitacion '
  + 'queda libre desde esta noche, tal como usted lo ha solicitado.';

test('a reply in another language is refused on the turn the operator answered with a code',
  async () => {
    const model = new ScriptedModel([
      callStep('cancelBooking', { id: 'bk_9' }), finishStep('Held for your approval.'),
      { calls: [], text: '' }, { calls: [], text: '' },
      finishStep(SPANISH_REPLY, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }],
        ['F1']),
      { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
      { calls: [], text: '' }, { calls: [], text: '' }
    ]);
    const { engine } = testEngine({ model, facts: CONSENT_FACTS,
      behaviors: { cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }) } });

    const asked = await engine.chat('s1', ENGLISH_ASK) as TurnRecord;
    const code = asked.questions.issued[0].code;
    const answered = await engine.chat('s1', code) as TurnRecord;

    // The operator's whole message is digits — the conversation's English is the
    // reference, and the Spanish reply never reaches the operator.
    expect(code).toMatch(/^\d+$/);
    expect(answered.corrections).toContainEqual(expect.objectContaining(
      { kind: 'proseReader', check: 'language' }));
    expect(answered.text).not.toContain('cancelada');
  });
