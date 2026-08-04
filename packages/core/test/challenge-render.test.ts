/**
 * THE DELIVERED TEXT — the agent's prose, the engine's question, the engine's account, in that order.
 */
import { describe, it, expect } from 'vitest';
import { composeDeliveryText } from '../src/runtime/turn.js';
import type { Challenge } from '../src/runtime/challenge.js';

const challenge: Challenge = {
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
};

describe('composeDeliveryText', () => {
  it('puts the question between the prose and the record', () => {
    expect(composeDeliveryText('Your booking BK-1 carries a fee.', [{ op: 'inform' }], [challenge])).toBe(
      'Your booking BK-1 carries a fee.\n\n' +
        'To confirm BK-1, reply: CONFIRM BK-1\n\n' +
        'No operation was carried out on this turn.',
    );
  });

  it('delivers the record alone when no question was raised', () => {
    expect(composeDeliveryText('All set.', [{ op: 'inform' }], [])).toBe(
      'All set.\n\nNo operation was carried out on this turn.',
    );
  });

  it('renders one line per question raised this turn', () => {
    const second: Challenge = { ...challenge, subject: 'BK-2', meaning: 'BK-2', token: 'CONFIRM BK-2' };
    const text = composeDeliveryText('Two bookings carry fees.', [{ op: 'inform' }], [challenge, second]);
    expect(text).toContain('To confirm BK-1, reply: CONFIRM BK-1');
    expect(text).toContain('To confirm BK-2, reply: CONFIRM BK-2');
  });

  it('delivers the question even when the prose is blank', () => {
    expect(composeDeliveryText('', [{ op: 'inform' }], [challenge])).toBe(
      'To confirm BK-1, reply: CONFIRM BK-1\n\nNo operation was carried out on this turn.',
    );
  });

  it('speaks the sentences the host declared, around the same token', () => {
    const text = composeDeliveryText('Pronto.', [{ op: 'inform' }], [challenge], {
      engineText: {
        recordClosureNone: 'Nenhuma operacao foi realizada neste turno.',
        challenge: (meaning, token) => `Para confirmar ${meaning}, responda: ${token}`,
      },
    });
    expect(text).toBe(
      'Pronto.\n\n' +
        'Para confirmar BK-1, responda: CONFIRM BK-1\n\n' +
        'Nenhuma operacao foi realizada neste turno.',
    );
  });

  it('renders the operation lines under the question', () => {
    const text = composeDeliveryText(
      'Done.',
      [{ op: 'cancel', target: 'BK-2', outcome: 'success' }],
      [challenge],
    );
    expect(text).toBe(
      'Done.\n\n' +
        'To confirm BK-1, reply: CONFIRM BK-1\n\n' +
        'BK-2: done\nNothing else was changed on this turn.',
    );
  });
});
