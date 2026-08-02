/**
 * Acceptance for increment 3a — "Atlas-as-fixture": a 10-tool slice of the Atlas domain, re-expressed
 * DECLARATIVELY via `defineWorld`, produces EQUIVALENT ledger semantics to the frozen hand-written
 * Atlas world for identical call sequences — the parity claim the toy world could NOT make (two-step
 * transitions, a gated create, a preset beyond `default`).
 *
 * THE SLICE (10 tools):
 *   reads    : listAssets, listBookings, getAsset, getBooking, getCustomer
 *   writes   : createBooking (gated create), createCustomer (mint)
 *   two-step : cancelBooking (confirmed→cancelled), retireAsset (available→retired)
 *   gated    : placeHold (asset must exist), createBooking (asset must have NO active hold)
 *   preset   : `assetHold` (beyond `default`) seeds a hold that blocks a booking on that asset.
 *
 * ENVELOPE MAPPING (why this is SEMANTIC parity, not byte parity):
 *   The hand world returns rich, prose-carrying envelopes (`error` codes, `message`, masked PII,
 *   nested previews); `defineWorld` returns a lean envelope (`{ ok, requiresConfirmation, <idKey> }`).
 *   Those SHAPES differ by design. We compare the LEDGER SEMANTICS both worlds must agree on:
 *     • ok                    — hand `result.ok === true`      ≡ decl `result.ok === true`
 *     • tookEffect            — the ledger row's `tookEffect`   (identical field on both)
 *     • requiresConfirmation  — `result.requiresConfirmation === true` on both
 *     • minted id (writes)    — hand `bookingId|holdId|customerId|assetId` ≡ decl same idKey
 *     • found (find-reads)    — hand `result.found` ≡ decl `<key> !== null`
 *     • state after           — hand record `.status` ≡ decl `projection().status[entity][id]`
 *   Error CODES and MESSAGE PROSE are deliberately NOT compared — a hand `BOOKING_NOT_CANCELLABLE`
 *   and a decl `NOT_CANCELLABLE` are the same refusal for the run's honesty layer (`ok:false`).
 *
 * The hand world is VENDORED (frozen copy, provenance header) under test/fixtures/atlas-hand/ — the
 * source repo must never become a build dependency.
 */
import { describe, expect, it } from 'vitest';
import { defineWorld } from '@looprun-ai/core/internal';
import type { WorldSpec } from '@looprun-ai/core/internal';
import type { AgentWorld } from '@looprun-ai/core';
import { checkPremiseCoherence } from '../src/validate.js';
import type { Subject, SubjectCase } from '../src/subject.js';
import { AtlasWorld, TODAY } from './fixtures/atlas-hand/world.js';

// ── the declarative slice ──────────────────────────────────────────────────────────────────────

const atlasSlice: WorldSpec = {
  clock: TODAY, // the hand world's own reference clock — must match, byte-for-byte
  entities: {
    asset: { idPrefix: 'ast', states: ['available', 'reserved', 'out', 'retired'] },
    booking: { idPrefix: 'bk', states: ['confirmed', 'cancelled', 'out', 'returned'] },
    customer: { idPrefix: 'cust' },
    hold: { idPrefix: 'hold' },
  },
  seed: {
    // Statuses are seeded to the values the hand world's syncAssetStatuses() derives in `default`.
    asset: [
      { id: 'ast_excv01', status: 'reserved' }, // held by bk_1001 (confirmed)
      { id: 'ast_excv02', status: 'available' },
      { id: 'ast_ltwr01', status: 'available' },
    ],
    booking: [
      { id: 'bk_1001', status: 'confirmed', assetId: 'ast_excv01', customerId: 'cust_2001' },
      { id: 'bk_1002', status: 'out', assetId: 'ast_bmlf01', customerId: 'cust_2002' },
    ],
    customer: [{ id: 'cust_2001', name: 'Redline Construction LLC' }],
  },
  presets: {
    // Counters mirror the hand world's constructor: booking=1003, customer=2003, hold=6000 → next
    // ids are bk_1004 / cust_2004 / hold_6001, exactly as the hand world mints them.
    default: [
      { op: 'setCounter', entity: 'booking', value: 1003 },
      { op: 'setCounter', entity: 'customer', value: 2003 },
      { op: 'setCounter', entity: 'hold', value: 6000 },
    ],
    // `assetHold` = the hand preset: an active compliance hold freezes ast_excv01.
    assetHold: [
      { op: 'setCounter', entity: 'booking', value: 1003 },
      { op: 'setCounter', entity: 'customer', value: 2003 },
      { op: 'setCounter', entity: 'hold', value: 6001 },
      { op: 'addRecord', entity: 'hold', record: { id: 'hold_6001', assetId: 'ast_excv01', scope: 'asset', active: true } },
    ],
  },
  tools: {
    // reads
    listAssets: { kind: 'read', read: { collection: { key: 'assets', value: ['ast_excv01', 'ast_excv02', 'ast_ltwr01'] } } },
    listBookings: { kind: 'read', read: { collection: { key: 'bookings', value: ['bk_1001', 'bk_1002'] } } },
    getAsset: { kind: 'read', args: [{ name: 'assetId', type: 'string' }], read: { find: { key: 'asset', entity: 'asset', byField: 'id', argRef: 'assetId' } } },
    getBooking: { kind: 'read', args: [{ name: 'bookingId', type: 'string' }], read: { find: { key: 'booking', entity: 'booking', byField: 'id', argRef: 'bookingId' } } },
    getCustomer: { kind: 'read', args: [{ name: 'customerId', type: 'string' }], read: { find: { key: 'customer', entity: 'customer', byField: 'id', argRef: 'customerId' } } },

    // gated create — the asset must carry NO active hold (the `absent` gate)
    createBooking: {
      kind: 'write',
      args: [
        { name: 'assetId', type: 'string', optional: true },
        { name: 'customerId', type: 'string', optional: true },
        { name: 'startDate', type: 'string', optional: true },
        { name: 'endDate', type: 'string', optional: true },
      ],
      gates: [{ kind: 'absent', entity: 'hold', matchField: 'assetId', argRef: 'assetId', error: 'ASSET_ON_HOLD' }],
      create: { entity: 'booking', id: 'counter', idKey: 'bookingId' },
    },
    createCustomer: {
      kind: 'write',
      args: [{ name: 'name', type: 'string' }, { name: 'email', type: 'string' }],
      create: { entity: 'customer', id: 'counter', idKey: 'customerId' },
    },

    // two-step transitions — a state gate, then probe≡confirm, then an in-place status patch
    cancelBooking: {
      kind: 'transition',
      twoStep: true,
      args: [{ name: 'bookingId', type: 'string' }, { name: 'confirmed', type: 'boolean', optional: true }],
      gates: [{ kind: 'stateIs', entity: 'booking', argRef: 'bookingId', state: 'confirmed', error: 'NOT_CANCELLABLE' }],
      transition: { entity: 'booking', argRef: 'bookingId', to: 'cancelled', idKey: 'bookingId' },
    },
    retireAsset: {
      kind: 'transition',
      twoStep: true,
      args: [{ name: 'assetId', type: 'string' }, { name: 'confirmed', type: 'boolean', optional: true }],
      gates: [{ kind: 'stateIs', entity: 'asset', argRef: 'assetId', state: 'available', error: 'ASSET_NOT_RETIRABLE' }],
      transition: { entity: 'asset', argRef: 'assetId', to: 'retired', idKey: 'assetId' },
    },

    // gated create — the asset must exist (the `exists` gate)
    placeHold: {
      kind: 'write',
      args: [{ name: 'type', type: 'string' }, { name: 'scope', type: 'string' }, { name: 'reason', type: 'string' }, { name: 'assetId', type: 'string' }],
      gates: [{ kind: 'exists', entity: 'asset', matchField: 'id', argRef: 'assetId', error: 'NOT_FOUND_ASSET' }],
      create: { entity: 'hold', id: 'counter', idKey: 'holdId' },
    },
  },
};

const makeAtlasSlice = defineWorld(atlasSlice);

// ── the envelope mapping: both worlds → one canonical semantic record ────────────────────────────

const READ_TOOLS = new Set(['listAssets', 'listBookings', 'getAsset', 'getBooking', 'getCustomer']);
const FIND_KEY: Record<string, string> = { getAsset: 'asset', getBooking: 'booking', getCustomer: 'customer' };

interface Semantic {
  ok: boolean;
  tookEffect: boolean;
  requiresConfirmation: boolean;
  mintedId: string | null; // writes only
  found: boolean | null; // find-reads only
}

/** Hand world → canonical semantics (its rich envelope, mapped down). */
function handSem(name: string, r: Record<string, unknown>, tookEffect: boolean): Semantic {
  const isRead = READ_TOOLS.has(name);
  return {
    ok: r.ok === true,
    tookEffect,
    requiresConfirmation: r.requiresConfirmation === true,
    mintedId: isRead ? null : idOf(r),
    found: name in FIND_KEY ? r.found === true : null,
  };
}

/** Declarative world → canonical semantics (its lean envelope, mapped up). */
function declSem(name: string, r: Record<string, unknown>, tookEffect: boolean): Semantic {
  const isRead = READ_TOOLS.has(name);
  const key = FIND_KEY[name];
  return {
    ok: r.ok === true,
    tookEffect,
    requiresConfirmation: r.requiresConfirmation === true,
    mintedId: isRead ? null : idOf(r),
    found: key ? r[key] != null : null,
  };
}

const idOf = (r: Record<string, unknown>): string | null =>
  (r.bookingId as string) ?? (r.holdId as string) ?? (r.customerId as string) ?? (r.assetId as string) ?? null;

// ── replay harness ───────────────────────────────────────────────────────────────────────────────

type Call = [name: string, args: Record<string, unknown>];

function lastTookEffect(w: AgentWorld): boolean {
  const calls = w.toolCalls as Array<{ tookEffect?: boolean }>;
  return calls[calls.length - 1]?.tookEffect === true;
}

function replay(preset: string, calls: Call[]) {
  const hand = new AtlasWorld(preset);
  const decl = makeAtlasSlice(preset);
  const handSemantics: Semantic[] = [];
  const declSemantics: Semantic[] = [];
  for (const [n, a] of calls) {
    const hr = hand.exec(n, a) as Record<string, unknown>;
    handSemantics.push(handSem(n, hr, lastTookEffect(hand)));
    const dr = decl.exec(n, a) as Record<string, unknown>;
    declSemantics.push(declSem(n, dr, lastTookEffect(decl)));
  }
  return { hand, decl, handSemantics, declSemantics };
}

/** Status of an entity record in each world (hand accessor vs decl projection). */
function handStatus(w: AgentWorld, entity: 'booking' | 'asset', id: string): unknown {
  const list = (w as unknown as Record<string, Array<{ id: string; status: string }>>)[entity + 's'];
  return list.find((x) => x.id === id)?.status;
}
function declStatus(w: AgentWorld, entity: string, id: string): unknown {
  const status = (w.projection() as { status: Record<string, Record<string, unknown>> }).status;
  return status[entity]?.[id];
}

// ── the acceptance sequences (≥6) ────────────────────────────────────────────────────────────────

describe('increment 3a — Atlas slice: declarative ≡ hand (semantic parity)', () => {
  it('S1 probe→confirm across turns (cancelBooking bk_1001): same ledger semantics + state after', () => {
    const { hand, decl, handSemantics, declSemantics } = replay('default', [
      ['cancelBooking', { bookingId: 'bk_1001' }],
      ['cancelBooking', { bookingId: 'bk_1001', confirmed: true }],
    ]);
    expect(declSemantics).toEqual(handSemantics);
    // probe: ok, requires confirmation, no effect. confirm: took effect, minted the same id.
    expect(handSemantics[0]).toMatchObject({ ok: true, requiresConfirmation: true, tookEffect: false });
    expect(handSemantics[1]).toMatchObject({ ok: true, tookEffect: true, mintedId: 'bk_1001' });
    expect(declStatus(decl, 'booking', 'bk_1001')).toBe('cancelled');
    expect(handStatus(hand, 'booking', 'bk_1001')).toBe('cancelled');
    expect(declStatus(decl, 'booking', 'bk_1001')).toBe(handStatus(hand, 'booking', 'bk_1001'));
  });

  it('S2 probe-only (retireAsset ast_ltwr01): a side-effect-free probe leaves the asset available', () => {
    const { hand, decl, handSemantics, declSemantics } = replay('default', [['retireAsset', { assetId: 'ast_ltwr01' }]]);
    expect(declSemantics).toEqual(handSemantics);
    expect(handSemantics[0]).toMatchObject({ ok: true, requiresConfirmation: true, tookEffect: false });
    expect(declStatus(decl, 'asset', 'ast_ltwr01')).toBe('available');
    expect(handStatus(hand, 'asset', 'ast_ltwr01')).toBe('available');
  });

  it('S3 gate refusal (cancelBooking bk_1002 is out): refused, no effect, state unchanged', () => {
    const { hand, decl, handSemantics, declSemantics } = replay('default', [['cancelBooking', { bookingId: 'bk_1002' }]]);
    expect(declSemantics).toEqual(handSemantics);
    expect(handSemantics[0]).toMatchObject({ ok: false, requiresConfirmation: false, tookEffect: false });
    expect(declStatus(decl, 'booking', 'bk_1002')).toBe('out');
    expect(handStatus(hand, 'booking', 'bk_1002')).toBe('out');
  });

  it('S4 preset-seeded state (createBooking on a held asset, assetHold preset): refused, nothing minted', () => {
    const { hand, decl, handSemantics, declSemantics } = replay('assetHold', [
      ['createBooking', { assetId: 'ast_excv01', customerId: 'cust_2001', startDate: '2026-08-01', endDate: '2026-08-05' }],
    ]);
    expect(declSemantics).toEqual(handSemantics);
    expect(handSemantics[0]).toMatchObject({ ok: false, tookEffect: false, mintedId: null });
    // no bk_1004 was minted in either world
    expect(declStatus(decl, 'booking', 'bk_1004')).toBeUndefined();
    expect(handStatus(hand, 'booking', 'bk_1004')).toBeUndefined();
  });

  it('S5 reads (listAssets, getAsset, getBooking, getCustomer, listBookings): all ok, no effect, found agree', () => {
    const { handSemantics, declSemantics } = replay('default', [
      ['listAssets', {}],
      ['getAsset', { assetId: 'ast_excv01' }],
      ['getBooking', { bookingId: 'bk_1001' }],
      ['getCustomer', { customerId: 'cust_2001' }],
      ['listBookings', {}],
    ]);
    expect(declSemantics).toEqual(handSemantics);
    for (const s of handSemantics) expect(s).toMatchObject({ ok: true, tookEffect: false });
    // the three find-reads all resolve their record
    expect(handSemantics.slice(1, 4).map((s) => s.found)).toEqual([true, true, true]);
  });

  it('S6 unknown-id failure + mints (getAsset/getBooking miss, createBooking/createCustomer/placeHold mint)', () => {
    const { handSemantics, declSemantics } = replay('default', [
      ['getAsset', { assetId: 'ast_nope' }],
      ['getBooking', { bookingId: 'bk_9999' }],
      ['createBooking', { assetId: 'ast_excv02', customerId: 'cust_2001', startDate: '2026-08-01', endDate: '2026-08-05' }],
      ['createCustomer', { name: 'New Yard Co', email: 'ops@newyard.co' }],
      ['placeHold', { type: 'safety', scope: 'asset', reason: 'inspection due', assetId: 'ast_excv02' }],
    ]);
    expect(declSemantics).toEqual(handSemantics);
    // unknown ids: found:false in both worlds
    expect(handSemantics[0]).toMatchObject({ ok: true, found: false });
    expect(handSemantics[1]).toMatchObject({ ok: true, found: false });
    // the three writes mint the SAME deterministic ids
    expect(handSemantics[2]).toMatchObject({ ok: true, tookEffect: true, mintedId: 'bk_1004' });
    expect(handSemantics[3]).toMatchObject({ ok: true, tookEffect: true, mintedId: 'cust_2004' });
    expect(handSemantics[4]).toMatchObject({ ok: true, tookEffect: true, mintedId: 'hold_6001' });
  });
});

// ── reproduction (a): the projection carries the clock on EVERY preset of the slice ───────────────

describe('increment 3a — reproduction (a): projection always carries the clock', () => {
  for (const preset of ['default', 'assetHold']) {
    it(`preset "${preset}": projection().today === the declared clock (the no-clock defect stays fixed)`, () => {
      const w = makeAtlasSlice(preset);
      expect((w.projection() as { today: string }).today).toBe(TODAY);
      // and it agrees with the hand world's own clock
      expect((new AtlasWorld(preset).projection() as { today: string }).today).toBe(TODAY);
    });
  }
});

// ── reproduction (b): a wrong-record preset makes `validate`'s premise layer FIRE ─────────────────

describe('increment 3a — reproduction (b): the wrong-record preset class fires premise coherence', () => {
  const forbidBookingOnExcv01: SubjectCase = {
    id: 'atlas-forbid-booking',
    // the case's premise: createBooking on ast_excv01 must be REFUSED (the asset is under a hold).
    setup: { preset: 'assetHold' },
    turns: [{ userText: 'try to book the held excavator' }],
    expectations: { invariants: { forbiddenToolCalls: [{ name: 'createBooking', anyArgs: { assetId: 'ast_excv01' } }] } },
  };

  const mkSubject = (preset: string): Subject => ({
    dir: '/fake',
    specs: {},
    contract: {} as never,
    caseAgent: {},
    cases: [{ ...forbidBookingOnExcv01, setup: { preset } }],
    toolDefs: [],
    makeWorld: (p?: string) => makeAtlasSlice(p) as unknown as AgentWorld,
  });

  it('the CORRECT preset (assetHold seeds the hold) refuses the forbidden write — premise is quiet', () => {
    const r = checkPremiseCoherence(mkSubject('assetHold'));
    expect(r.issues).toEqual([]);
  });

  it('the WRONG-RECORD preset (default: the hold was never seeded) ACCEPTS it — premise FIRES', () => {
    const r = checkPremiseCoherence(mkSubject('default'));
    expect(r.issues.join('\n')).toMatch(/atlas-forbid-booking.*createBooking.*ACCEPTED.*forbids nothing/s);
  });
});
