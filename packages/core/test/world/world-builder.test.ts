import { test, expect } from 'vitest';
import { CardError } from '../../src/contract/vocabulary.js';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const build = (preset?: string) => new WorldBuilder().build(HOSTILE, preset);

test('the MAINTENANCE gate refuses cancelBooking honestly — engine-independent', async () => {
  const w = build();
  const a = await w.call({ tool: 'cancelBooking', args: { id: 'bk_66' } });
  expect(a.done).toBe('no');
  expect(JSON.stringify(a.result)).toContain('MAINTENANCE');
  expect(w.snapshot().bookings.bk_66).toBeDefined();
});

test('a gated CONFIRMED record removes for real; done answered from the world write', async () => {
  const w = build();
  const a = await w.call({ tool: 'cancelBooking', args: { id: 'bk_9' } });
  expect(a.done).toBe('yes');
  expect(w.snapshot().bookings.bk_9).toBeUndefined();
  expect(w.audit().at(-1)).toMatchObject({ done: 'yes', executor: 'declared' });
});

test('simulate runs the shared path and commits nothing', async () => {
  const w = build();
  const a = await w.call({ tool: 'cancelBooking', args: { id: 'bk_9', simulate: true } });
  expect(a.done).toBe('yes');
  expect(w.snapshot().bookings.bk_9).toBeDefined();
  expect(w.audit().at(-1)?.call.args.simulate).toBe(true);
});

test('an unknown tool and a missing record are honest refusals, never throws', async () => {
  const w = build();
  expect((await w.call({ tool: 'ghost', args: {} })).done).toBe('no');
  const missing = await w.call({ tool: 'getBooking', args: { id: 'bk_404' } });
  expect(missing.done).toBe('no');
});

test('get reads the record; list reads the entity; the snapshot is deep-frozen', async () => {
  const w = build();
  const got = await w.call({ tool: 'getBooking', args: { id: 'bk_9' } });
  expect(got.done).toBe('yes');
  expect(JSON.stringify(got.result)).toContain('Tuesday');
  const snap = w.snapshot();
  expect(Object.isFrozen(snap.bookings.bk_9)).toBe(true);
});

test('a preset patch naming a missing record throws at build', () => {
  const bad = world({ ...HOSTILE.card, presets: { broken:
    [{ entity: 'bookings', id: 'ghost', set: { status: 'X' } }] } }, HOSTILE.executors);
  expect(() => new WorldBuilder().build(bad, 'broken')).toThrow(CardError);
  expect(() => build('missing-preset')).toThrow(CardError);
});

test('a non-coercible declared arg is a refusal naming the arg, never a stringified object', async () => {
  const w = build();
  const a = await w.call({ tool: 'getBooking', args: { id: { nested: true } } });
  expect(a.done).toBe('no');
  expect(JSON.stringify(a.result)).toContain('id');
});
