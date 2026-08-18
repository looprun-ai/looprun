import { test, expect } from 'vitest';
import type { Json, StateSnapshot } from '../../src/contract/vocabulary.js';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

test('the custom executor gets a frozen clone — mutation throws; patches land audited', async () => {
  const box: { leaked: StateSnapshot | null } = { leaked: null };
  const declared = world(HOSTILE.card, { compRoom: ({ args, records }) => {
    box.leaked = records;
    return { result: { comped: true },
             patches: [{ entity: 'bookings', id: typeof args.id === 'string' ? args.id : '',
                         set: { room: 'suite' } }] };
  } });
  const w = new WorldBuilder().build(declared);
  const a = await w.call({ tool: 'compRoom', args: { id: 'bk_9' } });
  expect(a.done).toBe('yes');
  expect(w.snapshot().bookings.bk_9.room).toBe('suite');
  expect(w.audit().at(-1)).toMatchObject({ executor: 'custom', done: 'yes' });
  expect(box.leaked).not.toBeNull();
  expect(() => { (box.leaked!.bookings as Record<string, Json>).x = {}; }).toThrow();
});

test('a custom patch naming a missing record is a refusal — done stays honest', async () => {
  const declared = world(HOSTILE.card, { compRoom: () => ({
    result: { comped: true },
    patches: [{ entity: 'bookings', id: 'ghost', set: { room: 'suite' } }] }) });
  const w = new WorldBuilder().build(declared);
  const a = await w.call({ tool: 'compRoom', args: { id: 'bk_9' } });
  expect(a.done).toBe('no');
  expect(w.snapshot().bookings.bk_9.room).toBe('12');
});

test('mintId mints per entity and the minted record lands through make-shaped patches', async () => {
  const declared = world(HOSTILE.card, { compRoom: ({ mintId }) => {
    const id = mintId('bookings');
    return { result: { made: id },
             patches: [{ entity: 'bookings', id, set: { status: 'CONFIRMED' } }] };
  } });
  const w = new WorldBuilder().build(declared);
  const a = await w.call({ tool: 'compRoom', args: { id: 'bk_9' } });
  expect(a.done).toBe('yes');
  const made = (a.result as { made: string }).made;
  expect(w.snapshot().bookings[made]).toMatchObject({ status: 'CONFIRMED' });
});
