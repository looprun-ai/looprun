/** The prose reader at the seal: two refusals, both language-free. A guard's rule
 *  text delivered outside a refusal frame is an asserted condition, whatever language
 *  the declaration is written in; a reply that wholesale abandons the operator's
 *  language is refused with the operator's own message as the only reference. The
 *  reader carries no vocabulary: claims of reads or acts are the judged channel's. */
import { describe, expect, test } from 'vitest';
import type { Act } from '@looprun-ai/core';
import { readProse } from '../../src/run/prose-reader.js';

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
                 rules: readonly string[] = []) => readProse({ text, userText, acts, rules });

describe('a rule delivered outside a refusal frame asserts its condition', () => {
  const rule = 'a workspace under a payment hold takes no booking of any kind';

  test('refuses the rule text delivered bare on a turn that refused nothing', () => {
    const r = reading('I am sorry — a workspace under a payment hold takes no booking of any kind.',
      [act('getWorkspace', 'read', 'done')], 'Book the room.', [rule]);
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

describe('the reply speaks the language of the operator turn', () => {
  test('refuses a French reply to an English operator', () => {
    const r = reading('La demande ne peut pas être traitée pour le moment: le dossier est fermé et la machine reste indisponible.',
      [act('getBooking', 'read', 'done')],
      'Can you open the booking for the excavator and tell me what the record says about the hold?');
    expect(r?.check).toBe('language');
  });

  test('refuses an English reply to a Portuguese operator', () => {
    const r = reading('The booking stands open and the record is clear on the day; nothing holds it now.',
      [act('getBooking', 'read', 'done')],
      'Cancele a reserva do cliente e me diga o que o registro fala sobre o bloqueio de hoje.');
    expect(r?.check).toBe('language');
  });

  test('passes a Portuguese reply to a Portuguese operator', () => {
    expect(reading('A reserva segue aberta e o registro está limpo no dia; nada a bloqueia e o valor não mudou.',
      [act('getBooking', 'read', 'done')],
      'Cancele a reserva do cliente e me diga o que o registro fala sobre o bloqueio de hoje.'))
      .toBeNull();
  });

  test('sibling languages sit above the cut — a Spanish reply to a Portuguese operator abstains', () => {
    expect(reading('La reserva sigue abierta y el registro está limpio en el día; nada la bloquea y el valor no cambió.',
      [act('getBooking', 'read', 'done')],
      'Cancele a reserva do cliente e me diga o que o registro fala sobre o bloqueio de hoje.'))
      .toBeNull();
  });

  test('a text too short to profile abstains', () => {
    expect(reading('Done — bk_1.', [act('cancelBooking', 'write', 'done')],
      'Cancele a reserva bk_1, por favor, e me confirme por escrito que ela foi cancelada.'))
      .toBeNull();
  });
});
