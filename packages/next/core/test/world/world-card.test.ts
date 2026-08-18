import { test, expect } from 'vitest';
import { CardError } from '../../src/contract/vocabulary.js';
import { world } from '../../src/world/world.js';

test('world freezes the card and validates: a run form without an executor throws CardError', () => {
  expect(() => world({ records: {}, writes: {
    compRoom: { form: 'run', entity: 'bookings', label: 'Comp' }
  } })).toThrow(CardError);
  try {
    world({ records: {}, writes: { compRoom: { form: 'run', entity: 'bookings', label: 'Comp' } } });
  } catch (e) {
    expect((e as CardError).problems[0].code).toBe('WORLD_EXECUTOR_MISSING');
    expect((e as CardError).problems[0].sentence).toContain('compRoom');
  }
});

test('an executor naming no declared run tool throws', () => {
  expect(() => world({ records: {} }, { ghost: () => ({ result: null, patches: [] }) }))
    .toThrow(/WORLD_EXECUTOR_UNKNOWN/);
});

test('one tool name in two effect blocks throws, both problems collected at once', () => {
  try {
    world({ records: {},
      reads: { x: { form: 'get', entity: 'a', label: 'X' } },
      writes: { x: { form: 'set', entity: 'a', label: 'X' },
                y: { form: 'run', entity: 'a', label: 'Y' } } });
    throw new Error('expected CardError');
  } catch (e) {
    const codes = (e as CardError).problems.map(p => p.code);
    expect(codes).toContain('WORLD_TOOL_DUP');
    expect(codes).toContain('WORLD_EXECUTOR_MISSING');
  }
});

test('a valid declaration comes back deep-frozen with its executors', () => {
  const run = () => ({ result: { ok: true }, patches: [] });
  const d = world({ records: { bookings: { bk_1: { status: 'CONFIRMED' } } },
    reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up' } },
    writes: { compRoom: { form: 'run', entity: 'bookings', label: 'Comp' } } }, { compRoom: run });
  expect(Object.isFrozen(d) && Object.isFrozen(d.card) && Object.isFrozen(d.card.records)).toBe(true);
  expect(d.executors.compRoom).toBe(run);
});
