import { test, expect } from 'vitest';
import type { Json } from '../../src/contract/vocabulary.js';
import { SurfaceGate, type LiveTool } from '../../src/cards/surface-gate.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { mcpWorld } from '../../src/world/world.js';

const SCHEMA: Json = { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] };
const FACTS = factsFromWorld(mcpWorld({ reads: {
  fetchOrder: { label: 'Fetch one order', target: 'orderId', schema: SCHEMA }
} }));

function liveTool(name: string, schema: Json): LiveTool {
  return { name, description: 'remote', schema, execute: () => Promise.resolve(null) };
}

test('a live tool off the declared surface is excluded, deny-by-default, with a report', () => {
  const gate = new SurfaceGate();
  const report = gate.check(FACTS, [liveTool('fetchOrder', SCHEMA), liveTool('dropTables', {})], null);
  expect(report.active).toEqual(['fetchOrder']);
  expect(report.excluded).toEqual([{ name: 'dropTables', why: 'off-surface' }]);
});

test('a declared tool the host no longer serves throws', () => {
  expect(() => new SurfaceGate().check(FACTS, [], null)).toThrow(/fetchOrder/);
});

test('a live schema differing from the declared one throws — drift never passes', () => {
  const drifted: Json = { type: 'object', properties: { orderId: { type: 'number' } }, required: ['orderId'] };
  expect(() => new SurfaceGate().check(FACTS, [liveTool('fetchOrder', drifted)], null))
    .toThrow(/fetchOrder/);
});

test('the fingerprint is canonical — key order never changes it', () => {
  const gate = new SurfaceGate();
  const reordered = factsFromWorld(mcpWorld({ reads: {
    fetchOrder: { label: 'Fetch one order', target: 'orderId',
      schema: { required: ['orderId'], properties: { orderId: { type: 'string' } }, type: 'object' } }
  } }));
  expect(gate.fingerprint(FACTS)).toBe(gate.fingerprint(reordered));
  expect(gate.fingerprint(FACTS)).toMatch(/^[0-9a-f]{64}$/);
});

test('a matching seal passes; a stale seal throws', () => {
  const gate = new SurfaceGate();
  const seal = gate.fingerprint(FACTS);
  expect(() => gate.check(FACTS, [liveTool('fetchOrder', SCHEMA)], seal)).not.toThrow();
  expect(() => gate.check(FACTS, [liveTool('fetchOrder', SCHEMA)], 'stale')).toThrow(/seal/i);
});
