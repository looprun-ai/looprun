import { describe, expect, it } from 'vitest';
import { assembleFacts } from '../../src/run/delivery-facts.js';

const act = (over: object): never => ({ id: 'a1', turn: 1, origin: 'model', effect: 'write',
  call: { tool: 't', args: {}, key: 'k' }, said: 'yes', status: 'done', reason: null,
  evidence: 'executor', sentence: 't() — done. x', owed: null, result: null,
  questionId: null, guard: null, ...over }) as never;

describe('assembleFacts', () => {
  it('an owed receipt rides with state ran; an owed refusal with state refused', () => {
    const facts = assembleFacts([
      act({ owed: { kind: 'receipt', text: 'clm_3001 is filed.' } }),
      act({ status: 'not-done', reason: 'blocked',
            owed: { kind: 'refusal', text: 'The cap refuses it.' } })
    ], [], [], []);
    expect(facts).toEqual([
      { kind: 'receipt', text: 'clm_3001 is filed.', state: 'ran' },
      { kind: 'refusal', text: 'The cap refuses it.', state: 'refused' }
    ]);
  });

  it('a done read with owed null stays out — its material is the composer\'s, never owed', () => {
    expect(assembleFacts([act({ owed: null, effect: 'read' })], [], [], [])).toEqual([]);
  });

  it('a done write with owed null still owes its record line — the world changed', () => {
    expect(assembleFacts([act({ owed: null })], [], [], [])).toEqual([
      { kind: 'receipt', text: 't() — done. x', state: 'ran' }
    ]);
  });

  it('an open question is an ask fact plus a code fact, the ask held', () => {
    const q = { id: 'q1', code: '384912', call: { tool: 't', args: {} },
      sentence: 'Cancelling bk_1 releases the nights.', state: 'open', bornAtTurn: 1 } as never;
    expect(assembleFacts([], [q], [], [])).toEqual([
      { kind: 'ask', text: 'Cancelling bk_1 releases the nights.', state: 'held' },
      { kind: 'code', text: '384912', state: null }
    ]);
  });

  it('closures and notes ride as their own kinds', () => {
    const facts = assembleFacts([], [], [{ id: 'q9', why: 'expired' }], ['A note.']);
    expect(facts).toEqual([
      { kind: 'closure', text: 'Question q9 closed: expired.', state: null },
      { kind: 'note', text: 'A note.', state: null }
    ]);
  });
});
