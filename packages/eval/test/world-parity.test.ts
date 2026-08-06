/**
 * A world expressed DECLARATIVELY via `defineWorld` produces the SAME action history
 * (name/args/result/tookEffect) as the equivalent hand-written world for identical call sequences,
 * on every preset. This is what lets a hand-written world be replaced by a spec without any
 * observable change to what the engine records.
 */
import { describe, expect, it } from 'vitest';
import { defineWorld } from '@looprun-ai/core/internal';
import type { WorldSpec } from '@looprun-ai/core/internal';
import { ToyWorld } from './fixtures/toy-subject/gen/world.js';

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
    // 'booked' = one existing booking → the next booking id is bk_2 (matches ToyWorld.bookingCount).
    default: [],
    booked: [{ op: 'setCounter', entity: 'booking', value: 1 }],
  },
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
        { name: 'startTime', type: 'string', optional: true },
        { name: 'endTime', type: 'string', optional: true },
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

const makeToy = defineWorld(toySpec);

type Call = [name: string, args: Record<string, unknown>];

/** ActionHistory slice the eval reader (`run.ts` callOk/dumpTurn) actually consumes. */
function actionHistory(w: { toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> }) {
  return w.toolCalls.map((c) => ({ name: c.name, args: c.args, result: c.result, tookEffect: c.tookEffect }));
}

function replay(preset: string, calls: Call[]) {
  const hand = new ToyWorld(preset);
  const decl = makeToy(preset);
  const handOut = calls.map(([n, a]) => hand.exec(n, a));
  const declOut = calls.map(([n, a]) => decl.exec(n, a));
  return { hand, decl, handOut, declOut };
}

describe('increment 3a acceptance — declarative toy world ≡ hand ToyWorld', () => {
  const sequences: Array<{ label: string; preset: string; calls: Call[] }> = [
    {
      label: 'reserve-room happy path (default preset ⇒ bk_1)',
      preset: 'default',
      calls: [
        ['lookupMember', { query: 'Ana Souza' }],
        ['listRooms', { date: '2026-07-02' }],
        ['reserveRoom', { roomId: 'room_1', memberId: 'mem_ana', date: '2026-07-02', startTime: '14:00', endTime: '16:00' }],
      ],
    },
    {
      label: 'unknown member ⇒ no fabricated booking',
      preset: 'booked',
      calls: [
        ['lookupMember', { query: 'Carla Mendes' }],
        ['reserveRoom', { roomId: 'room_1', memberId: 'mem_ghost' }],
      ],
    },
    {
      label: 'booked preset ⇒ next booking is bk_2',
      preset: 'booked',
      calls: [['reserveRoom', { roomId: 'room_1', memberId: 'mem_ana' }]],
    },
    {
      label: 'visitor + invoice reads',
      preset: 'default',
      calls: [
        ['registerVisitor', { name: 'Walk In' }],
        ['getInvoice', { memberId: 'mem_ana' }],
        ['getInvoice', {}],
      ],
    },
    {
      label: 'terminal + unknown tool',
      preset: 'default',
      calls: [
        ['respond', { message: 'hi', did: [{ op: 'inform' }] }],
        ['mysteryTool', { x: 1 }],
      ],
    },
  ];

  for (const seq of sequences) {
    it(`${seq.label}: same return values`, () => {
      const { handOut, declOut } = replay(seq.preset, seq.calls);
      expect(declOut).toEqual(handOut);
    });

    it(`${seq.label}: same actionHistory`, () => {
      const { hand, decl } = replay(seq.preset, seq.calls);
      expect(actionHistory(decl)).toEqual(actionHistory(hand));
    });
  }
});
