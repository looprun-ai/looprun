/**
 * Increment 3b round-trip: the toy-subject world, declared as a `world.json` LITERAL, serialized
 * (JSON.parse(JSON.stringify(...))) and loaded via `loadWorldConfig`, produces the SAME ledger and
 * return values as the in-memory `defineWorld` build of the identical spec — across the parity
 * sequences. The value of the test is proving the zod schema round-trips every field faithfully
 * (nothing dropped, nothing mangled), so the JSON form is behaviorally identical to the TS form.
 */
import { describe, expect, it } from 'vitest';
import { defineWorld } from '@looprun-ai/core/internal';
import type { WorldSpec } from '@looprun-ai/core/internal';
import { loadWorldConfig } from '../src/world-config.js';

// The same declarative toy spec used by world-parity.test.ts — every field is JSON-serializable.
const toySpec: WorldSpec = {
  clock: '2026-07-01',
  entities: {
    member: { idPrefix: 'mem' },
    room: { idPrefix: 'room' },
    booking: { idPrefix: 'bk' },
    visitor: { idPrefix: 'vis' },
  },
  seed: {
    member: [{ id: 'mem_ana', name: 'Ana Souza', query: 'ana souza' }],
    room: [{ id: 'room_1', name: 'Reading Room 1' }],
  },
  presets: {
    default: [],
    booked: [{ op: 'setCounter', entity: 'booking', value: 1 }],
  },
  derived: { lateFee: { formula: 'days * dailyRate * 0.5', inputs: ['days', 'dailyRate'] } },
  tools: {
    lookupMember: {
      kind: 'read',
      args: [{ name: 'query', type: 'string' }],
      read: { find: { key: 'member', entity: 'member', byField: 'query', argRef: 'query', returns: ['id', 'name'] } },
    },
    listRooms: {
      kind: 'read',
      args: [{ name: 'date', type: 'string', optional: true }],
      read: { collection: { key: 'rooms', value: [{ id: 'room_1', name: 'Reading Room 1' }] } },
    },
    reserveRoom: {
      kind: 'write',
      args: [
        { name: 'roomId', type: 'string' },
        { name: 'memberId', type: 'string' },
        { name: 'date', type: 'string', optional: true },
      ],
      gates: [{ kind: 'exists', entity: 'member', matchField: 'id', argRef: 'memberId', error: 'unknown member' }],
      create: { entity: 'booking', id: 'counter', idKey: 'bookingId' },
    },
    registerVisitor: {
      kind: 'write',
      args: [{ name: 'name', type: 'string' }],
      create: { entity: 'visitor', id: { fixed: 'vis_1' }, idKey: 'visitorId' },
    },
    getInvoice: {
      kind: 'read',
      args: [{ name: 'memberId', type: 'string', optional: true }],
      read: { constant: { key: 'invoice', value: { id: 'inv_1', amount: 42 } } },
    },
  },
};

const inMemory = defineWorld(toySpec);
const fromJson = loadWorldConfig(JSON.parse(JSON.stringify(toySpec))); // serialize → load

type Call = [name: string, args: Record<string, unknown>];

function ledger(w: { toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> }) {
  return w.toolCalls.map((c) => ({ name: c.name, args: c.args, result: c.result, tookEffect: c.tookEffect }));
}

function replay(preset: string, calls: Call[]) {
  const mem = inMemory(preset);
  const json = fromJson(preset);
  const memOut = calls.map(([n, a]) => mem.exec(n, a));
  const jsonOut = calls.map(([n, a]) => json.exec(n, a));
  return { mem, json, memOut, jsonOut };
}

describe('3b round-trip — world.json (loadWorldConfig) ≡ in-memory defineWorld', () => {
  const sequences: Array<{ label: string; preset: string; calls: Call[] }> = [
    {
      label: 'reserve happy path (default ⇒ bk_1)',
      preset: 'default',
      calls: [
        ['lookupMember', { query: 'Ana Souza' }],
        ['listRooms', { date: '2026-07-02' }],
        ['reserveRoom', { roomId: 'room_1', memberId: 'mem_ana', date: '2026-07-02' }],
      ],
    },
    {
      label: 'unknown member ⇒ gate denies, no booking',
      preset: 'booked',
      calls: [['reserveRoom', { roomId: 'room_1', memberId: 'mem_ghost' }]],
    },
    {
      label: 'booked preset ⇒ next booking is bk_2',
      preset: 'booked',
      calls: [['reserveRoom', { roomId: 'room_1', memberId: 'mem_ana' }]],
    },
    {
      label: 'visitor + invoice reads + terminal + unknown tool',
      preset: 'default',
      calls: [
        ['registerVisitor', { name: 'Walk In' }],
        ['getInvoice', { memberId: 'mem_ana' }],
        ['respond', { message: 'hi', did: [{ op: 'inform' }] }],
        ['mysteryTool', { x: 1 }],
      ],
    },
  ];

  for (const seq of sequences) {
    it(`${seq.label}: same return values`, () => {
      const { memOut, jsonOut } = replay(seq.preset, seq.calls);
      expect(jsonOut).toEqual(memOut);
    });
    it(`${seq.label}: same ledger`, () => {
      const { mem, json } = replay(seq.preset, seq.calls);
      expect(ledger(json)).toEqual(ledger(mem));
    });
  }

  it('projection parity across presets (carries the clock, same status/counters)', () => {
    for (const preset of ['default', 'booked']) {
      expect(fromJson(preset).projection()).toEqual(inMemory(preset).projection());
    }
  });

  it('derived formula survives serialization and evaluates identically', () => {
    expect(fromJson('default').derived.lateFee({ days: 3, dailyRate: 100 })).toBe(
      inMemory('default').derived.lateFee({ days: 3, dailyRate: 100 }),
    );
  });

  it('the loader rejects an unknown key by name (strict, path-qualified)', () => {
    const bad = { ...JSON.parse(JSON.stringify(toySpec)), bogusTopLevel: true };
    expect(() => loadWorldConfig(bad)).toThrow(/world config invalid at/);
  });

  it('the loader rejects a banned free-function key before zod', () => {
    const bad = JSON.parse(JSON.stringify(toySpec));
    bad.tools.reserveRoom.predicate = 'x';
    expect(() => loadWorldConfig(bad)).toThrow(/regex\/free-function is not supported/);
  });
});
