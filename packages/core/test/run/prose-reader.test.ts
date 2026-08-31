/** The prose reader at the seal: two refusals, both language-free. A guard's rule
 *  text delivered outside a refusal frame is an asserted condition, whatever language
 *  the declaration is written in; a reply that wholesale abandons the operator's
 *  language is refused with the operator's own message as the only reference. The
 *  reader carries no vocabulary: claims of reads or acts are the judged channel's. */
import { describe, expect, test } from 'vitest';
import type { Act } from '@looprun-ai/core';
import { languageReference, readProse } from '../../src/run/prose-reader.js';

function act(tool: string, effect: Act['effect'], status: Act['status'],
             reason: Act['reason'] = null): Act {
  const args = { bookingId: 'bk_1' };
  return { id: `a_${tool}_${status}`, turn: 1, origin: 'model',
    call: { tool, args, key: `${tool}:${JSON.stringify(args)}` }, effect,
    said: null, status, reason, evidence: 'engine',
    sentence: `${tool}(bk_1) — ${status}`, owed: null,
    result: status === 'done' ? { id: 'bk_1' } : null,
    questionId: null, guard: null };
}

const reading = (text: string, acts: readonly Act[] = [], userText = 'Cancel booking bk_1.',
                 rules: readonly string[] = [], owed: readonly string[] = []) =>
  readProse({ text, userText, acts, owed, rules });

describe('a rule delivered outside a refusal frame asserts its condition', () => {
  const rule = 'a workspace under a payment hold takes no booking of any kind';

  test('refuses the rule text delivered bare on a turn that refused nothing', () => {
    const r = reading('I am sorry — a workspace under a payment hold takes no booking of any kind.',
      [act('getWorkspace', 'read', 'done')], 'Book the room.', [rule]);
    expect(r?.check).toBe('wallEcho');
  });

  test('passes the rule the turn\'s OWED FACTS carry — the engine demanded that sentence', () => {
    expect(reading('a workspace under a payment hold takes no booking of any kind.',
      [], 'Book the room.', [rule],
      ['a workspace under a payment hold takes no booking of any kind'])).toBeNull();
  });

  test('refuses ANOTHER rule on the same turn — the exemption reaches one sentence', () => {
    const other = 'a refund runs only after a manager approves it in person';
    const r = reading(`I am sorry — ${other}.`, [], 'Book the room.', [rule, other],
      ['a workspace under a payment hold takes no booking of any kind']);
    expect(r?.check).toBe('wallEcho');
  });

  test('passes the same words inside a refusal frame — an act this turn was refused', () => {
    expect(reading('That cannot run: a workspace under a payment hold takes no booking of any kind.',
      [act('createBooking', 'write', 'not-done', 'blocked')], 'Book the room.', [rule]))
      .toBeNull();
  });

  test('the byte-match is language-free: a declared rule in Portuguese echoes the same', () => {
    const ptRule = 'um espaço sob bloqueio de pagamento não aceita nenhuma reserva';
    const r = reading('Desculpe: um espaço sob bloqueio de pagamento não aceita nenhuma reserva.',
      [act('getWorkspace', 'read', 'done')], 'Reserve a sala para amanhã, por favor.', [ptRule]);
    expect(r?.check).toBe('wallEcho');
  });

  test('a short rule never matches', () => {
    expect(reading('There is no double booking here.', [act('getBooking', 'read', 'done')],
      'Anything on today?', ['no double booking'])).toBeNull();
  });
});

describe('the reply is written in the operator\'s own script', () => {
  const held = (replies: readonly string[], operatorTexts: readonly string[]) =>
    replies.map(text => readProse({ text, userText: languageReference(operatorTexts),
      acts: [act('getAsset', 'read', 'done')], owed: [], rules: [] })?.check ?? null);

  test('the reference is the LATEST operator message that carries letters', () => {
    expect(languageReference(['Cancel job wo_1 for her, she has changed her mind about it.',
      'And end the mooring mo_1 while you are in there, please.']))
      .toBe('And end the mooring mo_1 while you are in there, please.');
  });

  test('a bare approval code carries no letters — the earlier message is the reference', () => {
    expect(languageReference(['Hanne Dahl has changed her mind about the lift. Cancel job wo_1.',
      '481235'])).toBe('Hanne Dahl has changed her mind about the lift. Cancel job wo_1.');
    expect(languageReference(['481235'])).toBe('');
    expect(languageReference([])).toBe('');
  });

  test('a CJK reply to a latin operator refuses', () => {
    expect(held(['\u4f5c\u696d wo_1 \u306f\u30ad\u30e3\u30f3\u30bb\u30eb\u3055\u308c\u307e\u3057\u305f\u3002'
      + '\u3053\u308c\u306b\u3088\u308b\u8ffd\u52a0\u306e\u6599\u91d1\u306f\u3042\u308a\u307e\u305b\u3093\u3002'
      + '\u9020\u8239\u6240\u306e\u767b\u9332\u7c3f\u304b\u3089\u5b8c\u5168\u306b\u524a\u9664\u3055\u308c\u3066'
      + '\u3044\u307e\u3059\u306e\u3067\u3054\u5b89\u5fc3\u304f\u3060\u3055\u3044\u3002'],
    ['Hanne Dahl has changed her mind about the lift. Cancel job wo_1.', '481235']))
      .toEqual(['language']);
  });

  test('a latin reply to a CJK operator refuses', () => {
    expect(held(['Job wo_1 is cancelled and nothing is charged for it. The haul-out is off the '
      + 'yard register for good, and a cancelled job is never reopened.'],
    ['\u4f5c\u696d wo_1 \u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
      + '\u6301\u3061\u4e3b\u304c\u6c17\u3092\u5909\u3048\u307e\u3057\u305f\u306e\u3067\u3001'
      + '\u767b\u9332\u7c3f\u304b\u3089\u5916\u3057\u3066\u304f\u3060\u3055\u3044\u3002']))
      .toEqual(['language']);
  });

  test('a CYRILLIC reply to a latin operator refuses', () => {
    expect(held(['\u0417\u0430\u0434\u0430\u043d\u0438\u0435 wo_1 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u043e, '
      + '\u0438 \u043d\u0438\u043a\u0430\u043a\u043e\u0439 \u043f\u043b\u0430\u0442\u044b \u0437\u0430 '
      + '\u044d\u0442\u043e \u043d\u0435 \u0432\u0437\u0438\u043c\u0430\u0435\u0442\u0441\u044f.'],
    ['Hanne Dahl has changed her mind about the lift. Cancel job wo_1.']))
      .toEqual(['language']);
  });

  test('japanese is ONE script: han beside kana passes its own operator', () => {
    expect(held(['\u4f5c\u696d wo_1 \u306f\u30ad\u30e3\u30f3\u30bb\u30eb\u3055\u308c\u307e\u3057\u305f\u3002'
      + '\u8ffd\u52a0\u306e\u6599\u91d1\u306f\u3042\u308a\u307e\u305b\u3093\u3002'
      + '\u767b\u9332\u7c3f\u304b\u3089\u524a\u9664\u3055\u308c\u3066\u3044\u307e\u3059\u3002'],
    ['\u4f5c\u696d wo_1 \u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
      + '\u6301\u3061\u4e3b\u304c\u6c17\u3092\u5909\u3048\u307e\u3057\u305f\u306e\u3067\u3001'
      + '\u767b\u9332\u7c3f\u304b\u3089\u5916\u3057\u3066\u304f\u3060\u3055\u3044\u3002']))
      .toEqual([null]);
  });

  test('a text too short to name a script abstains', () => {
    expect(reading('Done — bk_1.', [act('cancelBooking', 'write', 'done')],
      'Cancele a reserva bk_1, por favor, e me confirme por escrito que ela foi cancelada.'))
      .toBeNull();
  });
});

/** THE ACCEPTED LIMIT, pinned by the transcripts that measured it: two languages
 *  sharing a script are the same class, so none of these ever floors a reply. The
 *  latin-against-latin mismatch belongs to the judged channel, never to this one. */
describe('a latin reply to a latin operator always passes', () => {
  const held = (replies: readonly string[], operatorTexts: readonly string[]) =>
    replies.map(text => readProse({ text, userText: languageReference(operatorTexts),
      acts: [act('getAsset', 'read', 'done')], owed: [], rules: [] })?.check ?? null);

  test('the DANISH receipt on a bare-code turn abstains', () => {
    expect(held(['Job wo_1, som var en planlagt optagning af Sea Ranger, er nu annulleret, og '
      + 'der er intet gebyr forbundet med dette. Da systemet kun tillader annullering af åbne '
      + 'opgaver, og wo_1 ikke længere findes som en aktiv opgave i registeret, er det enten '
      + 'allerede blevet afsluttet eller annulleret tidligere.'],
    ['Hanne Dahl has changed her mind about the lift. Cancel job wo_1.', '481235']))
      .toEqual([null]);
  });

  test('the SPANISH and FRENCH receipts abstain', () => {
    expect(held([
      'El amarre mo_1 ha sido finalizado correctamente: Kittiwake ya no ocupa el atraque "A-05", '
      + 'el cual queda libre desde esta noche, y el saldo de 986 permanece adeudado.',
      'Le mouillage mo_1 est terminé : Kittiwake a quitté le poste A-05, qui est libre à partir '
      + 'de ce soir, et un solde de 986 reste dû.'
    ], ['Tomas Ferreira is taking Kittiwake home early. End her mooring, mo_1.', '573791']))
      .toEqual([null, null]);
  });

  test('the PORTUGUESE reply that falsified a trigram cut abstains', () => {
    expect(held(['O proprietário da "ves_1" solicitou 180 litros de combustível, mas a escolha '
      + 'do tipo de combustível é responsabilidade do proprietário e nada nos registos a decide '
      + 'por ele.'],
    ['Sea Ranger is alongside the fuel berth and her owner has asked for 180 litres of diesel. '
      + 'She is ves_1.'])).toEqual([null]);
  });

  test('the ENGLISH ask a trigram cut floored passes, and so does the English it drove out', () => {
    const conversation = ['What is ast_genr01 in the shop for and when is it due back?',
      'The hydraulic job finished early — put it back in service.'];
    expect(held(['A machine comes out of the workshop in a real condition, and only you know '
      + 'which one. Please choose one of the following conditions for ast_genr01 and reply with '
      + 'the option and the code 665225 alone: [1] excellent, [2] good, [3] fair, [4] poor, or '
      + '[5] damaged.',
    'I cannot file an incident report. There is no tool on this surface to file an incident '
      + 'report. Please contact the harbormaster, Nadia Okonjo (st_1), as this is not an '
      + 'operation this desk performs.'], conversation)).toEqual([null, null]);
  });

  test('an English reply to a Portuguese operator abstains — one script, one class', () => {
    expect(reading('The booking stands open and the record is clear on the day; nothing holds it now.',
      [act('getBooking', 'read', 'done')],
      'Cancele a reserva do cliente e me diga o que o registro fala sobre o bloqueio de hoje.'))
      .toBeNull();
  });
});
