/**
 * destructiveClaimRequiresSuccess — the `succeeded` escape hatch (added 2026-07-23, pharmacy run).
 *
 * THE TRAP (the same one noFabricatedSuccess already documents): the default `tookEffect` reads
 * `ObservedCall.ok`, and `ok` means "the call EXECUTED", never "the action SUCCEEDED". A world that
 * RETURNS its refusal as a result (`{ voided:false, reason }`) rather than throwing yields `ok:true`,
 * so a BLOCKED deletion reads as "took effect" and this guard wrongly stays quiet — a fabricated
 * "it's voided" claim rides through un-vetoed.
 *
 * THE FIX: an optional `succeeded?: (ctx) => boolean` opt, mirroring the sibling. When passed, it — not
 * `o.ok` — decides whether a destructive action took effect. Absent ⇒ byte-identical to every existing
 * bundle (and the W1 world-contract gate keeps `o.ok` honest for generated worlds, so the default is
 * already sound there; the hatch is the fallback for a world the gate cannot fix).
 *
 * Mutation-provable: revert the `opts.succeeded ? … : …` line in guards.ts and case C goes green→red
 * (the hatch is ignored, `o.ok` wins, tookEffect becomes true, the guard returns null).
 */
import { describe, it, expect } from 'vitest';
import { destructiveClaimRequiresSuccess } from '../../src/guards.js';
import type { ObservedCall } from '../../src/rules.js';
import { craftCtx } from '../../src/testing/index.js';

const OPTS = {
  claimRe: /\b(deleted|voided|removed)\b/i,
  askRe: /\b(confirm|are you sure)\b/i,
  offerRe: /\b(would you like|shall i)\b/i,
};
const call = (name: string, over: Partial<ObservedCall> = {}): ObservedCall => ({
  name,
  args: {},
  ok: true,
  turnIndex: 0,
  ...over,
});
const CLAIM = 'Done — the dispense is voided.';

describe('destructiveClaimRequiresSuccess · the succeeded hatch', () => {
  it('A · DEFAULT + a healthy world (refused write → ok:false): fires on the fabricated claim', async () => {
    // The post-W1 generated world reports a refused write as ok:false — so the default path is sound.
    const g = destructiveClaimRequiresSuccess(['voidDispense'], OPTS);
    const ctx = craftCtx({ reply: CLAIM, observed: [call('voidDispense', { ok: false, args: { confirmed: true } })] });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('B · DEFAULT + a refusal-as-result world (ok:true on a REFUSED call): the documented UNSOUNDNESS — stays quiet', async () => {
    // With no hatch, o.ok(true) && confirmed===true reads a blocked void as "took effect" → no fire.
    const g = destructiveClaimRequiresSuccess(['voidDispense'], OPTS);
    const ctx = craftCtx({ reply: CLAIM, observed: [call('voidDispense', { ok: true, args: { confirmed: true } })] });
    expect(await g.check(ctx)).toBeNull();
  });

  it('C · THE HATCH: succeeded:()=>false makes the same refusal-as-result ctx FIRE', async () => {
    const g = destructiveClaimRequiresSuccess(['voidDispense'], { ...OPTS, succeeded: () => false });
    const ctx = craftCtx({ reply: CLAIM, observed: [call('voidDispense', { ok: true, args: { confirmed: true } })] });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('D · THE HATCH: succeeded:()=>true suppresses — a GENUINE success is never vetoed', async () => {
    const g = destructiveClaimRequiresSuccess(['voidDispense'], { ...OPTS, succeeded: () => true });
    const ctx = craftCtx({ reply: CLAIM, observed: [call('voidDispense', { ok: true, args: { confirmed: true } })] });
    expect(await g.check(ctx)).toBeNull();
  });
});

/**
 * N1 (airline-irops 2026-07-24) — the guard now prefers the WORLD's `ObservedCall.tookEffect` (the B1
 * signal) over the confirm-flag heuristic. This closes two classes the heuristic got wrong: (i) a
 * below-threshold two-step tool the WORLD one-steps (commits with confirmed:false) and (ii) a MIXED
 * success+refusal turn (one write took effect, a sibling was refused) — both previously vetoed an HONEST
 * "I did it" reply into an exhaustion stub. The fallback keeps every hand-crafted (tookEffect-less) proof
 * byte-identical.
 *
 * Mutation-provable: revert the `o.tookEffect !== undefined ? … : …` line and N1-a / N1-b go null→truthy.
 */
describe('destructiveClaimRequiresSuccess · N1 — keys on the world tookEffect signal', () => {
  const g = destructiveClaimRequiresSuccess(['issueVoucher'], { ...OPTS, claimRe: /\b(issued|voided|deleted)\b/i });
  const VCLAIM = 'I issued the voucher; the second could not be added.';

  it('N1-a · MIXED turn: a call that TOOK EFFECT + a sibling REFUSED + an honest claim → does NOT veto', async () => {
    // The case-13 shape: voucher #1 committed (tookEffect:true), voucher #2 refused (ok:false). The heuristic
    // would see confirmed!==true on #1 AND some(!ok) → fire. The world signal recognises #1's mutation.
    const ctx = craftCtx({
      reply: VCLAIM,
      observed: [
        call('issueVoucher', { ok: true, tookEffect: true, args: { amount: 100 } }),
        call('issueVoucher', { ok: false, tookEffect: false, args: { amount: 150 } }),
      ],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('N1-b · a below-threshold ONE-STEP commit (confirmed:false but tookEffect:true) + a claim → does NOT veto', async () => {
    const ctx = craftCtx({ reply: 'The voucher was issued.', observed: [call('issueVoucher', { ok: true, tookEffect: true, args: { confirmed: false } })] });
    expect(await g.check(ctx)).toBeNull();
  });

  it('N1-c · NEGATIVE: a claim over a call that did NOT take effect (tookEffect:false) still FIRES', async () => {
    const ctx = craftCtx({ reply: 'The voucher was issued.', observed: [call('issueVoucher', { ok: true, tookEffect: false, args: { confirmed: false } })] });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('N1-d · FALLBACK: a tookEffect-LESS ctx keeps the confirm-flag heuristic (proof-fixture parity)', async () => {
    // No tookEffect field → old path: ok && confirmed===true = took effect → no veto (unchanged).
    const ctx = craftCtx({ reply: 'The voucher was issued.', observed: [call('issueVoucher', { ok: true, args: { confirmed: true } })] });
    expect(await g.check(ctx)).toBeNull();
  });
});
