/**
 * buildHonestAbstain — the engine-owned honest-abstain closure.
 *
 * MEASURED DEFECT it fixes: a hand-written exhaustionReply announced a probe (a WRITE tool whose
 * `tookEffect` was false — it landed no change) as a completed action. The closure derives what may
 * be announced from the world ledger: a WRITE name is announced ONLY if some ledger entry under it
 * actually took effect; a read (a name that is not a write) is always safe to announce.
 */
import { describe, expect, it } from 'vitest';
import { buildHonestAbstain } from '../src/internal.js';
import type { AgentWorld } from '../src/index.js';

function worldWith(ledger: Array<{ name: string; tookEffect?: boolean }>): AgentWorld {
  return {
    exec: () => undefined,
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: ledger.map((e) => ({ name: e.name, args: {}, tookEffect: e.tookEffect })),
    sseActions: [],
  } as unknown as AgentWorld;
}

describe('buildHonestAbstain — a no-effect probe is never announced as done', () => {
  it('drops a no-effect write, keeps an effected write and a read', () => {
    // Arrange: cancelDispatch probed (no effect), createBooking landed, getMember is a read.
    const world = worldWith([
      { name: 'cancelDispatch', tookEffect: false },
      { name: 'createBooking', tookEffect: true },
      { name: 'getMember' },
    ]);

    // Act
    const s = buildHonestAbstain(
      world,
      ['cancelDispatch', 'createBooking', 'getMember'],
      ['cancelDispatch', 'createBooking'],
    );

    // Assert
    expect(s).not.toContain('cancelDispatch'); // no-effect WRITE never announced as succeeded
    expect(s).toContain('createBooking'); // effected write is announced
    expect(s).toContain('getMember'); // reads are announced
  });

  it('announces a write once ANY entry under it took effect (retry after a failed probe)', () => {
    const world = worldWith([
      { name: 'createBooking', tookEffect: false },
      { name: 'createBooking', tookEffect: true },
    ]);

    const s = buildHonestAbstain(world, ['createBooking'], ['createBooking']);

    expect(s).toContain('createBooking');
  });

  it('announces nothing (safe-nothing-changed) when every write was a no-effect probe and no reads ran', () => {
    const world = worldWith([{ name: 'cancelDispatch', tookEffect: false }]);

    const s = buildHonestAbstain(world, ['cancelDispatch'], ['cancelDispatch']);

    expect(s).not.toContain('cancelDispatch');
  });
});
