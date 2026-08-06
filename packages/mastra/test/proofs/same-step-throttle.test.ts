/**
 * destructiveThrottle must see a same-STEP sibling, not only earlier turns.
 *
 * THE BUG: the throttle reads `ctx.observed`, but a domain tool lands in `observed` only in
 * afterToolCall (AFTER execute). The AI SDK dispatches a step's tool calls concurrently (Promise.all),
 * so two `cancelMove(confirmed:true)` emitted in ONE step are both gated (beforeToolCall) before either
 * enters `observed` — the second never sees the first, and TWO destructive actions take effect in one
 * turn (moving case 15-cancel-bulk-throttle failed identically in the governed AND ungoverned variants).
 *
 * THE FIX: the backend now registers each admitted domain call synchronously on `ledger.inFlightCalls`
 * (before its guard await, so a later same-step sibling sees it) and passes the earlier siblings to the
 * preTool guards as `ctx.siblingCallsThisStep`. ONLY `destructiveThrottle` reads that field, so every
 * other guard sees the unchanged `observed` — the same-step visibility is a zero-blast-radius
 * augmentation. The cross-step path (observed) is untouched.
 *
 * These proofs pin BOTH directions: the guard now counts a same-step sibling effect (mutation-provable —
 * revert the guard change and the first `it` goes green→red), and every legal cancel flow (simulate,
 * simulate→execute, single cancel) still passes.
 */
import { describe, it, expect } from 'vitest';
import { destructiveThrottle } from '@looprun-ai/core';
import { AgentSpecBase } from '@looprun-ai/core';
import type { ObservedCall } from '@looprun-ai/core';
import { craftCtx } from '@looprun-ai/core/testing';
import { pickRecord, runProofLoop } from '../../src/testing/index.js';

const call = (name: string, over: Partial<ObservedCall> = {}): ObservedCall => ({
  name,
  args: {},
  ok: true,
  turnIndex: 0,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// L1 — the guard now reads same-step siblings (the fix), and only counts EFFECTS
// ─────────────────────────────────────────────────────────────────────────────
describe('destructiveThrottle counts a same-STEP sibling effect', () => {
  it('THE FIX: a same-step sibling EXECUTE (confirmed:true) throttles the second destructive call', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002', confirmed: true },
      observed: [], // the sibling is NOT in observed yet — that is the whole bug
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: true } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  // WHAT COUNTS AS A SIMULATE DEPENDS ON WHETHER THE CALL HAS RUN. A same-step
  // sibling has NOT executed, so `tookEffect` is `undefined` for every one of them BY CONSTRUCTION — the
  // world cannot have recorded an effect that has not happened. The EXECUTED rule ("a simulate is a call the
  // world recorded as changing nothing") therefore cannot be applied here: it would count every admitted
  // destructive sibling and veto the honest MULTI-SIMULATION pinned two tests below. For a call that has not
  // run, its declared flags are the only evidence that exists.
  it('a same-step sibling SIMULATE (confirmed:false) does NOT throttle — a simulate changes nothing', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2001', confirmed: true },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: false } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('a same-step sibling that requiresConfirmation (simulate result) does NOT throttle', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2001', confirmed: true },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001' }, resultFlags: { requiresConfirmation: true } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('CONTROL: a same-step MULTI-SIMULATION passes — two simulations in one step are not an effect', async () => {
    // "Simulation cancelling both of my bookings" is a legal request, and the model answers it with two
    // `confirmed:false` calls in ONE step. Neither has run when the second is gated, so neither can have
    // an effect on record; vetoing the second would deny the simulation for an effect nothing has had.
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002', confirmed: false },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: false } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('CONTROL: a same-step sibling that is CONFIRMED still throttles', async () => {
    // The sibling declares the ACT, so it is the one effect this turn is allowed.
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002', confirmed: true },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: true } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('a same-step sibling that OMITS the flag is a simulation too — parity with confirmFirst', async () => {
    // `confirmFirst` licenses "a `flag:false`/ABSENT simulate" and returns null on any `flag !== true`, so an
    // omitted flag is a not-yet-confirmed call to the consent gate. Keying the throttle on
    // `confirmed === false` alone made the two kinds disagree on exactly the case they claim to agree on.
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002' },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001' } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('CONTROL: a FLAGLESS (prior-ask) tool has no simulation shape — the first sibling throttles', async () => {
    // `AgentSpecBase` passes its `'prior-ask'` tools as `flagless`: they carry no confirm flag at all, so
    // "not confirmed" says nothing about them and every admitted call is an act. Without this, the
    // not-confirmed rule above would leave the same-step cap inert on the whole prior-ask mechanism.
    const g = destructiveThrottle(['cancelMove'], { flagless: ['cancelMove'] });
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002' },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001' } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('CONTROL: the legal CROSS-STEP two-step tail still passes — a recorded simulate, then the execute', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2001', confirmed: true },
      observed: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: false }, tookEffect: false })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('REGRESSION FLOOR: the FIRST destructive call in a step (no earlier sibling) passes', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({ tool: 'cancelMove', args: { moveId: 'mv_2001', confirmed: true }, siblingCallsThisStep: [] });
    expect(await g.check(ctx)).toBeNull();
  });

  it('REGRESSION FLOOR: a cross-STEP prior EFFECT (in observed) still throttles', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002', confirmed: true },
      observed: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: true } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('BACKEND-AGNOSTIC: with siblingCallsThisStep ABSENT (alien/one-call-per-step), the guard falls back to observed', async () => {
    const g = destructiveThrottle(['cancelMove']);
    // No siblingCallsThisStep key at all — exactly what a single-dispatch backend passes.
    const clean = craftCtx({ tool: 'cancelMove', args: { moveId: 'mv_2001', confirmed: true } });
    expect(await g.check(clean)).toBeNull();
    const dirty = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2002', confirmed: true },
      observed: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: true } })],
    });
    expect(await g.check(dirty)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L3 — the full backend loop: two confirmed destructives in ONE step ⇒ one effect
// ─────────────────────────────────────────────────────────────────────────────
describe('full loop — a same-step bulk destructive is throttled to ONE effect', () => {
  const spec = (): AgentSpecBase =>
    new AgentSpecBase({
      id: 'same-step-throttle',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: ['searchItem', 'deleteItem'],
      destructiveTools: ['deleteItem'],
    });

  it('turn-1 emits TWO deleteItem(confirmed:true) in one step → the SECOND is vetoed by the throttle', async () => {
    // Turn 0 simulations BOTH records, so the engine raises a question for each. Turn 1's message carries
    // both tokens, then emits both confirmed deletes in a SINGLE scripted step (one array = one model
    // response = one concurrent dispatch) — both are consent-licensed, so the SECOND effect is caught by
    // destructiveThrottle, which is what this proof pins.
    const res = await runProofLoop(spec(), {
      preset: 'seeded-media',
      turns: [{ userText: 'delete p001 and p002' }, { userText: 'CONFIRM p001 and CONFIRM p002' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'deleteItem', args: { id: 'p002' } }],
        [{ tool: 'respond', args: { message: 'Deleting p001 and p002 is permanent — are you sure?', did: [{ op: 'inform' }] } }],
        [
          { tool: 'deleteItem', args: { id: 'p001', confirmed: true } },
          { tool: 'deleteItem', args: { id: 'p002', confirmed: true } },
        ],
        [{ tool: 'respond', args: { message: 'Done — p001 was deleted; p002 still needs handling.', did: [{ op: 'inform' }] } }],
      ],
      expect: 'pass',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = pickRecord(res, { preset: 'seeded-media', turns: [], script: [], expect: 'pass', turn: 1 });
    expect(rec?.recoveryEvents ?? []).toContain('run:destructiveThrottle:deleteItem');
  });

  it('REGRESSION: a single confirmed delete in turn 1 is NOT throttled', async () => {
    const res = await runProofLoop(spec(), {
      preset: 'seeded-media',
      turns: [{ userText: 'delete p001' }, { userText: 'CONFIRM p001' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'respond', args: { message: 'Deleting p001 is permanent — are you sure?', did: [{ op: 'inform' }] } }],
        [{ tool: 'deleteItem', args: { id: 'p001', confirmed: true } }],
        [{ tool: 'respond', args: { message: 'Done — p001 is gone.', did: [{ op: 'inform' }] } }],
      ],
      expect: 'pass',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = pickRecord(res, { preset: 'seeded-media', turns: [], script: [], expect: 'pass', turn: 1 });
    expect(rec?.recoveryEvents ?? []).not.toContain('run:destructiveThrottle:deleteItem');
  });
});
