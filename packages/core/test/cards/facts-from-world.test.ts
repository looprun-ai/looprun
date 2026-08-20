import { test, expect } from 'vitest';
import { mcpWorld } from '../../src/world/world.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

test('factsFromWorld: effects, targets, form schemas, the simulate arg', () => {
  const f = factsFromWorld(HOSTILE);
  expect(f.tools.cancelBooking).toMatchObject({ effect: 'destructive', target: 'id',
    label: 'Cancel the booking', simulation: { arg: 'simulate', value: true } });
  expect(f.tools.getBooking).toMatchObject({ effect: 'read', target: 'id', simulation: null });
  expect(f.tools.compRoom.effect).toBe('write');
  const schema = f.tools.getBooking.schema as { required: readonly string[] };
  expect(schema.required).toContain('id');
});

test('a simulable tool accepts the optional simulate arg in its schema', () => {
  const f = factsFromWorld(HOSTILE);
  const schema = f.tools.cancelBooking.schema as {
    properties: Record<string, unknown>; required: readonly string[] };
  expect(schema.properties.simulate).toBeDefined();
  expect(schema.required).not.toContain('simulate');
});

test('a composed does names the label and entity when the card declares none', () => {
  const f = factsFromWorld(HOSTILE);
  expect(f.tools.getBooking.does).toContain('Look up a booking');
  expect(f.tools.getBooking.does).toContain('bookings');
});

test('an mcp card derives the same fact shape from remote entries', () => {
  const f = factsFromWorld(mcpWorld({ reads: {
    fetchOrder: { label: 'Fetch one order', target: 'orderId', proxy: 'shop',
      schema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] } }
  } }));
  expect(f.tools.fetchOrder).toMatchObject({ effect: 'read', target: 'orderId',
    proxy: 'shop', simulation: null });
});
