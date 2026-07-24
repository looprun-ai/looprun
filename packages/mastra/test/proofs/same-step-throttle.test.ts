/**
 * M1 — destructiveThrottle was BLIND to a same-STEP sibling (measured 2026-07-22, moving-desk run).
 *
 * THE BUG: the throttle reads `ctx.observed`, but a domain tool lands in `observed` only in
 * afterToolCall (AFTER execute). The AI SDK dispatches a step's tool calls concurrently (Promise.all),
 * so two `cancelMove(confirmed:true)` emitted in ONE step are both gated (beforeToolCall) before either
 * enters `observed` — the second never sees the first, and TWO destructive actions take effect in one
 * turn (moving case 15-cancel-bulk-throttle failed identically in the governed AND ungoverned arms).
 *
 * THE FIX: the backend now registers each admitted domain call synchronously on `ledger.inFlightCalls`
 * (before its guard await, so a later same-step sibling sees it) and passes the earlier siblings to the
 * preTool guards as `ctx.siblingCallsThisStep`. ONLY `destructiveThrottle` reads that field, so every
 * other guard sees the unchanged `observed` — the same-step visibility is a zero-blast-radius
 * augmentation. The cross-step path (observed) is untouched.
 *
 * These proofs pin BOTH directions: the guard now counts a same-step sibling effect (mutation-provable —
 * revert the guard change and the first `it` goes green→red), and every legal cancel flow (probe,
 * probe→execute, single cancel) still passes.
 */
import { describe, it, expect } from 'vitest';
import { destructiveThrottle } from '@looprun-ai/core';
import { AgentSpecBase } from '@looprun-ai/core';
import type { ObservedCall } from '@looprun-ai/core';
import { craftCtx, FIXTURE_LEXICON } from '@looprun-ai/core/testing';
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
describe('M1 · destructiveThrottle counts a same-STEP sibling effect', () => {
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

  it('a same-step sibling PROBE (confirmed:false) does NOT throttle — a probe changes nothing', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2001', confirmed: true },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001', confirmed: false } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('a same-step sibling that requiresConfirmation (probe result) does NOT throttle', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({
      tool: 'cancelMove',
      args: { moveId: 'mv_2001', confirmed: true },
      siblingCallsThisStep: [call('cancelMove', { args: { moveId: 'mv_2001' }, resultFlags: { requiresConfirmation: true } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('REGRESSION FLOOR: the FIRST destructive call in a step (no earlier sibling) passes', async () => {
    const g = destructiveThrottle(['cancelMove']);
    const ctx = craftCtx({ tool: 'cancelMove', args: { moveId: 'mv_2001', confirmed: true }, siblingCallsThisStep: [] });
    expect(await g.check(ctx)).toBeNull();
  });

  it('REGRESSION FLOOR: a cross-STEP prior EFFECT (in observed) still throttles — the old path is intact', async () => {
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
describe('M1 · full loop — a same-step bulk destructive is throttled to ONE effect', () => {
  const spec = (): AgentSpecBase =>
    new AgentSpecBase({
      id: 'same-step-throttle',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: ['searchItem', 'deleteItem'],
      destructiveTools: ['deleteItem'],
      lexicon: { confirmAskRe: FIXTURE_LEXICON.confirmAskRe },
    });

  it('turn-1 emits TWO deleteItem(confirmed:true) in one step → the SECOND is vetoed by the throttle', async () => {
    // Turn 0 probes + asks (satisfies confirmFirst for turn 1). Turn 1 emits both confirmed deletes in a
    // SINGLE scripted step (one array = one model response = one concurrent dispatch).
    const res = await runProofLoop(spec(), {
      preset: 'seeded-media',
      turns: [{ userText: 'delete p001 and p002' }, { userText: 'yes, delete both — I confirm' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'replyToUser', args: { text: 'Deleting p001 and p002 is permanent — are you sure?' } }],
        [
          { tool: 'deleteItem', args: { id: 'p001', confirmed: true } },
          { tool: 'deleteItem', args: { id: 'p002', confirmed: true } },
        ],
        [{ tool: 'replyToUser', args: { text: 'Done — p001 was deleted; p002 still needs handling.' } }],
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
      turns: [{ userText: 'delete p001' }, { userText: 'yes, confirm' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'replyToUser', args: { text: 'Deleting p001 is permanent — are you sure?' } }],
        [{ tool: 'deleteItem', args: { id: 'p001', confirmed: true } }],
        [{ tool: 'replyToUser', args: { text: 'Done — p001 is gone.' } }],
      ],
      expect: 'pass',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = pickRecord(res, { preset: 'seeded-media', turns: [], script: [], expect: 'pass', turn: 1 });
    expect(rec?.recoveryEvents ?? []).not.toContain('run:destructiveThrottle:deleteItem');
  });
});
