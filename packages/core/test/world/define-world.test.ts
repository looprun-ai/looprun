/**
 * `defineWorld` machinery — the property tests the spec §Testing demands, run ONCE in the engine's
 * own suite so no generated subject re-tests them: RECEPTION, probe≡confirm, unknown-preset throw,
 * echo-safety tagging, determinism, and the clock-carrying projection.
 */
import { describe, expect, it } from 'vitest';
import { defineWorld } from '../../src/internal.js';
import type { WorldSpec } from '../../src/internal.js';

// A small asset world close to the spec's world.json sketch — exercises gates(ref)/two-step/echo.
const assetSpec: WorldSpec = {
  clock: '2026-07-01',
  entities: {
    asset: { idPrefix: 'ast', states: ['available', 'out'] },
    booking: { idPrefix: 'bk', states: ['active'] },
    note: { idPrefix: 'nt' },
  },
  seed: { asset: [{ id: 'ast_1', status: 'available', requiredDeposit: 300 }] },
  presets: {
    default: [],
    primed: [{ op: 'setCounter', entity: 'booking', value: 5 }],
  },
  tools: {
    reserve: {
      kind: 'write',
      args: [{ name: 'assetId', type: 'string' }, { name: 'depositHeld', type: 'number' }, { name: 'urgent', type: 'boolean', optional: true }],
      gates: [{ kind: 'fieldAtLeast', field: 'depositHeld', min: { ref: 'asset.requiredDeposit' }, error: 'DEPOSIT_NOT_COVERED' }],
      create: { entity: 'booking', id: 'counter', idKey: 'bookingId' },
    },
    refund: {
      kind: 'write',
      twoStep: true,
      args: [{ name: 'bookingId', type: 'string' }, { name: 'confirmed', type: 'boolean', optional: true }],
      create: { entity: 'booking', id: { fixed: 'bk_refund' }, idKey: 'refundId' },
    },
    fileNote: {
      kind: 'write',
      args: [{ name: 'body', type: 'string', operator: true }, { name: 'assetId', type: 'string' }],
      create: { entity: 'note', id: 'counter', idKey: 'noteId', store: ['body', 'assetId'] },
    },
  },
};

describe('defineWorld — RECEPTION (#1)', () => {
  it("coerces 'true'/'false' strings and numeric strings, tolerates absent optionals", () => {
    const w = defineWorld(assetSpec)('default');
    // 'true' → boolean, '300' → number so the fieldAtLeast gate reads it numerically.
    const r = w.exec('reserve', { assetId: 'ast_1', depositHeld: '300', urgent: 'true' }) as { ok: boolean };
    expect(r.ok).toBe(true); // 300 >= 300 only if the string coerced to a number
  });

  it('throws fast on a missing required arg', () => {
    const w = defineWorld(assetSpec)('default');
    expect(() => w.exec('reserve', { depositHeld: 300 })).toThrow(/missing required arg 'assetId'/);
  });
});

describe('defineWorld — gates with {ref} (#8)', () => {
  it('fieldAtLeast resolves min from a seed field and denies below it', () => {
    const w = defineWorld(assetSpec)('default');
    const r = w.exec('reserve', { assetId: 'ast_1', depositHeld: 100 }) as { ok: boolean; error?: string };
    expect(r).toEqual({ ok: false, error: 'DEPOSIT_NOT_COVERED' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false);
  });
});

describe('defineWorld — stateIs gate (#8)', () => {
  const stateSpec: WorldSpec = {
    clock: '2026-07-01',
    entities: { asset: { idPrefix: 'ast', states: ['available', 'out'] }, log: { idPrefix: 'lg' } },
    seed: {
      asset: [
        { id: 'ast_free', status: 'available' },
        { id: 'ast_busy', status: 'out' },
      ],
    },
    presets: { default: [] },
    tools: {
      checkOut: {
        kind: 'transition',
        entity: 'asset',
        from: 'available',
        to: 'out',
        args: [{ name: 'assetId', type: 'string' }],
        gates: [{ kind: 'stateIs', entity: 'asset', argRef: 'assetId', state: 'available', error: 'NOT_AVAILABLE' }],
        create: { entity: 'log', id: 'counter', idKey: 'logId' },
      },
    },
  };

  it('admits from the right state', () => {
    const w = defineWorld(stateSpec)('default');
    const r = w.exec('checkOut', { assetId: 'ast_free' }) as { ok: boolean; logId?: string };
    expect(r).toEqual({ ok: true, logId: 'lg_1' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(true);
  });

  it('denies from the wrong state', () => {
    const w = defineWorld(stateSpec)('default');
    const r = w.exec('checkOut', { assetId: 'ast_busy' });
    expect(r).toEqual({ ok: false, error: 'NOT_AVAILABLE' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false);
  });
});

describe('defineWorld — absent gate (#8, extension)', () => {
  // `absent` is the mirror of `exists`: it DENIES when a matching record is present. It expresses
  // the Atlas "no active hold on this asset" rule the parity slice needs (createBooking on a held asset).
  const holdSpec: WorldSpec = {
    clock: '2026-07-01',
    entities: { booking: { idPrefix: 'bk' }, hold: { idPrefix: 'hold' } },
    seed: { hold: [{ id: 'hold_1', assetId: 'ast_held', active: true }] },
    presets: { default: [] },
    tools: {
      book: {
        kind: 'write',
        args: [{ name: 'assetId', type: 'string' }],
        gates: [{ kind: 'absent', entity: 'hold', matchField: 'assetId', argRef: 'assetId', error: 'ASSET_ON_HOLD' }],
        create: { entity: 'booking', id: 'counter', idKey: 'bookingId' },
      },
    },
  };

  it('denies when a matching record EXISTS (mirror of exists)', () => {
    const w = defineWorld(holdSpec)('default');
    const r = w.exec('book', { assetId: 'ast_held' });
    expect(r).toEqual({ ok: false, error: 'ASSET_ON_HOLD' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false);
  });

  it('admits when no matching record is present', () => {
    const w = defineWorld(holdSpec)('default');
    const r = w.exec('book', { assetId: 'ast_free' }) as { ok: boolean; bookingId?: string };
    expect(r).toEqual({ ok: true, bookingId: 'bk_1' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(true);
  });
});

describe('defineWorld — transition executor patches state (extension)', () => {
  // A `transition` tool PATCHES an existing record's status (no new record minted) — the shape the
  // Atlas parity slice needs for cancelBooking (confirmed→cancelled) and retireAsset (available→retired).
  const cancelSpec: WorldSpec = {
    clock: '2026-07-01',
    entities: { booking: { idPrefix: 'bk', states: ['confirmed', 'cancelled'] } },
    seed: { booking: [{ id: 'bk_1', status: 'confirmed' }, { id: 'bk_2', status: 'out' }] },
    presets: { default: [] },
    tools: {
      cancel: {
        kind: 'transition',
        twoStep: true,
        transition: { entity: 'booking', argRef: 'bookingId', to: 'cancelled', idKey: 'bookingId' },
        args: [{ name: 'bookingId', type: 'string' }, { name: 'confirmed', type: 'boolean', optional: true }],
        gates: [{ kind: 'stateIs', entity: 'booking', argRef: 'bookingId', state: 'confirmed', error: 'NOT_CANCELLABLE' }],
      },
    },
  };

  it('confirm patches the target record status and marks tookEffect', () => {
    const w = defineWorld(cancelSpec)('default');
    const probe = w.exec('cancel', { bookingId: 'bk_1' }) as { requiresConfirmation?: boolean };
    expect(probe.requiresConfirmation).toBe(true);
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false); // probe is side-effect-free
    expect((w.projection() as { status: { booking: Record<string, unknown> } }).status.booking.bk_1).toBe('confirmed');

    const done = w.exec('cancel', { bookingId: 'bk_1', confirmed: true });
    expect(done).toEqual({ ok: true, status: 'cancelled', bookingId: 'bk_1' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(true);
    expect((w.projection() as { status: { booking: Record<string, unknown> } }).status.booking.bk_1).toBe('cancelled');
  });

  it('the state gate denies from the wrong state (no patch, no effect)', () => {
    const w = defineWorld(cancelSpec)('default');
    const r = w.exec('cancel', { bookingId: 'bk_2', confirmed: true });
    expect(r).toEqual({ ok: false, error: 'NOT_CANCELLABLE' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false);
    expect((w.projection() as { status: { booking: Record<string, unknown> } }).status.booking.bk_2).toBe('out');
  });
});

describe('defineWorld — two-step probe ≡ confirm (#2)', () => {
  it('an unconfirmed probe is side-effect-free and previews; confirm mints', () => {
    const w = defineWorld(assetSpec)('default');
    const probe = w.exec('refund', { bookingId: 'bk_1' }) as { requiresConfirmation?: boolean };
    expect(probe.requiresConfirmation).toBe(true);
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(false); // no side effect on probe
    const confirm = w.exec('refund', { bookingId: 'bk_1', confirmed: true }) as { ok: boolean; refundId?: string };
    expect(confirm).toEqual({ ok: true, refundId: 'bk_refund' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(true);
  });

  it('probe and confirm evaluate the SAME gates (identity)', () => {
    // a two-step tool with a failing gate denies identically on probe and confirm.
    const gated: WorldSpec = {
      ...assetSpec,
      tools: {
        ...assetSpec.tools,
        refund: {
          kind: 'write',
          twoStep: true,
          args: [{ name: 'assetId', type: 'string' }, { name: 'depositHeld', type: 'number' }, { name: 'confirmed', type: 'boolean', optional: true }],
          gates: [{ kind: 'fieldAtLeast', field: 'depositHeld', min: { ref: 'asset.requiredDeposit' }, error: 'DEPOSIT_NOT_COVERED' }],
          create: { entity: 'booking', id: { fixed: 'bk_refund' }, idKey: 'refundId' },
        },
      },
    };
    const w = defineWorld(gated)('default');
    const probe = w.exec('refund', { assetId: 'ast_1', depositHeld: 1 });
    const confirm = w.exec('refund', { assetId: 'ast_1', depositHeld: 1, confirmed: true });
    expect(probe).toEqual({ ok: false, error: 'DEPOSIT_NOT_COVERED' });
    expect(confirm).toEqual(probe);
  });
});

describe('defineWorld — unknown preset THROWS (#6)', () => {
  it('never a silent half-state', () => {
    expect(() => defineWorld(assetSpec)('nope')).toThrow(/unknown preset 'nope'/);
  });
});

describe('defineWorld — echo-safety (#5)', () => {
  it('segregates operator-authored stored strings from agent-dictated ones', () => {
    const w = defineWorld(assetSpec)('default');
    w.exec('fileNote', { body: 'call the owner', assetId: 'ast_1' });
    const echo = w.toolCalls.at(-1)?.echo;
    expect(echo).toEqual({ operator: { body: 'call the owner' }, agent: { assetId: 'ast_1' } });
  });

  it('leaves a purely agent-dictated create untagged', () => {
    const w = defineWorld(assetSpec)('default');
    w.exec('reserve', { assetId: 'ast_1', depositHeld: 500 });
    expect(w.toolCalls.at(-1)?.echo).toBeUndefined();
  });
});

describe('defineWorld — projection (#4) + determinism', () => {
  it('always carries the clock and declared status keys', () => {
    const w = defineWorld(assetSpec)('default');
    const p = w.projection() as { today: string; status: Record<string, unknown> };
    expect(p.today).toBe('2026-07-01');
    expect(Object.keys(p.status).sort()).toEqual(['asset', 'booking', 'note']);
  });

  it('same preset + same calls ⇒ deep-equal projection (byte-identical)', () => {
    const run = () => {
      const w = defineWorld(assetSpec)('primed');
      w.exec('reserve', { assetId: 'ast_1', depositHeld: 500 });
      w.exec('fileNote', { body: 'x', assetId: 'ast_1' });
      return w.projection();
    };
    expect(run()).toEqual(run());
  });

  it('the preset delta lands: primed pre-sets the booking counter so the next id is bk_6', () => {
    const w = defineWorld(assetSpec)('primed');
    const r = w.exec('reserve', { assetId: 'ast_1', depositHeld: 500 }) as { bookingId: string };
    expect(r.bookingId).toBe('bk_6');
  });
});

describe('defineWorld — custom executor (#7)', () => {
  it('runs a host-registered executor and lists it in the self-description', () => {
    const spec: WorldSpec = {
      clock: '2026-07-01',
      entities: { thing: { idPrefix: 'th' } },
      presets: { default: [] },
      tools: { doThing: { kind: 'custom', custom: 'doThing' } },
    };
    const make = defineWorld(spec, { custom: { doThing: ({ mintId }) => ({ result: { ok: true, id: mintId('thing') }, tookEffect: true }) } });
    const w = make('default');
    expect(w.exec('doThing', {})).toEqual({ ok: true, id: 'th_1' });
    expect(w.toolCalls.at(-1)?.tookEffect).toBe(true);
    expect(make.describe().customExecutors).toEqual(['doThing']);
  });

  it('throws when a custom tool names an unregistered executor', () => {
    const spec: WorldSpec = { clock: '2026-07-01', presets: { default: [] }, tools: { x: { kind: 'custom', custom: 'missing' } } };
    expect(() => defineWorld(spec)).toThrow(/unregistered executor 'missing'/);
  });

  it('throws when a registered executor is referenced by no custom tool (dead wiring)', () => {
    const spec: WorldSpec = { clock: '2026-07-01', presets: { default: [] }, tools: {} };
    expect(() => defineWorld(spec, { custom: { orphan: () => ({ result: null, tookEffect: false }) } })).toThrow(
      /registered executor 'orphan' is referenced by no custom tool/,
    );
  });
});

describe('defineWorld — build contract', () => {
  it("throws a NAMED error when the WorldSpec declares no 'default' preset", () => {
    const spec: WorldSpec = { clock: '2026-07-01', presets: { other: [] }, tools: {} };
    expect(() => defineWorld(spec)).toThrow(/WorldSpec must declare a 'default' preset/);
  });

  it("builds the 'default' preset when the caller names none", () => {
    const spec: WorldSpec = { clock: '2026-07-01', entities: { a: { idPrefix: 'a' } }, presets: { default: [] }, tools: {} };
    const w = defineWorld(spec)();
    expect((w.projection() as { today: string }).today).toBe('2026-07-01');
  });
});
