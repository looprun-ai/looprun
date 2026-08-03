/**
 * RED-TEAM — the completeness cluster: claimIsComplete + deriveClaimsFromLedger + the did→message
 * renderer. GOAL: make the FORBIDDEN THING pass — a real action (a write that tookEffect this turn)
 * hidden from the user, yet the honesty core reports "all reported".
 *
 * Each `describe` is one attack vector. A test that ASSERTS the broken behavior (the forbidden pass)
 * and GOES GREEN on the current code IS the proof of the break. Comments carry the exact fix.
 *
 * Findings mirror: .superpowers/sdd/redteam-completeness.md
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../../src/rules.js';
import type { TurnClaim } from '../../src/runtime/claims.js';
import { claimIsComplete, claimIsGrounded } from '../../src/guards/honesty.js';
import { deriveClaimsFromLedger, renderOperationReport } from '../../src/runtime/claims.js';
import { createLedger, beginTurn, recordToolResult } from '../../src/runtime/ledger.js';

/** A world whose `toolCalls` carry the RESULT (and tookEffect) the ledger observed for a call. */
function worldWith(
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>,
): GuardCtx['world'] {
  return {
    exec: () => ({ success: true }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls,
    sseActions: [],
  } as GuardCtx['world'];
}

/** A reply-side GuardCtx (turnIndex 0) — the shape `checkReply` builds. */
function replyCtx(over: Partial<GuardCtx> & { did: TurnClaim[] }): GuardCtx {
  return {
    args: {},
    world: over.world ?? worldWith([]),
    observed: [],
    turnIndex: 0,
    userText: '',
    history: [],
    reply: 'anything',
    attemptedThisTurn: [],
    ...over,
  } as GuardCtx;
}

const call = (name: string, args: Record<string, unknown>, over: Partial<ObservedCall> = {}): ObservedCall => ({
  name,
  args,
  ok: true,
  turnIndex: 0,
  ...over,
});

const WRITES = ['updateOrder', 'refundOrder', 'cancelOrder'] as const;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 1 — a TARGETLESS `success` claim covers EVERY effected write (main path, most dangerous)
//
// claimMatchesCall → targetIn(claim.target, …) → `if (target === undefined) return true`. A claim
// with NO `target` (structurally VALID: validateClaims makes target optional) matches EVERY call.
// So ONE `{op, outcome:'success'}` with no target satisfies claimIsComplete for ANY number of
// effected writes to ANY targets. The renderer shows the single generic line "One action completed."
// while N distinct writes to N distinct targets all happened. Silent actions, hidden by construction.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 1 — targetless success claim hides all effected writes [BROKE]', () => {
  const twoWritesDifferentTargets: ObservedCall[] = [
    call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
    call('refundOrder', { order: 'ORD-2', amount: 500 }, { tookEffect: true }),
  ];

  it('claimIsComplete returns null for ONE targetless success claim against TWO distinct writes', () => {
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }]; // no target
    const reason = claimIsComplete({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets }),
    );
    // FORBIDDEN PASS: two writes (ORD-1 shipped, ORD-2 refunded $500) landed; one vague claim "covers"
    // both. The completeness core says nothing is hidden.
    expect(reason).toBeNull();
  });

  it('claimIsGrounded ALSO passes the same targetless claim — nothing else catches it', () => {
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }];
    const reason = claimIsGrounded({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets }),
    );
    expect(reason).toBeNull();
  });

  it('the user-facing report is a single generic line — the refund is invisible', () => {
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }];
    const report = renderOperationReport(did);
    expect(report).toBe('One action completed.'); // ORD-2 / the $500 refund never reach the user
  });

  // EXACT FIX: claimIsComplete must require a claim that ACTUALLY names this write's target, i.e. a
  // targetless claim must NOT count as covering an effected write. In `claimIsComplete.check`, replace
  // `claimMatchesCall(ctx, claim, c)` in the `covered` predicate with a variant that returns false when
  // `claim.target === undefined` (a "some action succeeded" claim names no ledger fact for THIS write).
  // Equivalently: add `claim.target !== undefined &&` to the covered predicate. Grounding may keep the
  // targetless-matches-all latitude (an honest single write), but COMPLETENESS must be per-target.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 2 — occurrence vs existence: ONE target claim covers TWO writes to the SAME target
//
// claimIsComplete asks, per effected write, `did.some(claim matches)` — EXISTENCE of a matching
// claim, never a 1:1 accounting. Two distinct operations on ORD-1 (update + refund) both match the
// single `{target:'ORD-1', outcome:'success'}` claim → both "covered" → null. The second operation
// hides behind the first's claim.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 2 — one claim covers two writes to the same target [BROKE]', () => {
  it('claimIsComplete returns null — the second effected write on ORD-1 is hidden', () => {
    const twoWritesSameTarget: ObservedCall[] = [
      call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
      call('refundOrder', { order: 'ORD-1', amount: 500 }, { tookEffect: true }), // distinct op, same target
    ];
    const did: TurnClaim[] = [{ op: 'update', target: 'ORD-1', outcome: 'success' }];
    const reason = claimIsComplete({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesSameTarget }),
    );
    // FORBIDDEN PASS: the $500 refund on ORD-1 is a real action the user is never told about; the one
    // "ORD-1: done" line reads as a single operation.
    expect(reason).toBeNull();
  });

  // EXACT FIX (deeper than V1): completeness needs occurrence-counting, not existence. Each effected
  // write must be matched to a DISTINCT covering claim. Consume claims as they are spent:
  //   const remaining = [...did.filter(c => resolveOutcome(c.outcome,map)==='success')];
  //   for (const c of effectedWrites) {
  //     const ix = remaining.findIndex(claim => claim.target !== undefined && claimMatchesCall(ctx, claim, c));
  //     if (ix < 0) return <unreported>;
  //     remaining.splice(ix, 1); // this claim is now spent
  //   }
  // With per-target claims (V1 fix) + one-claim-per-write consumption, two writes to ORD-1 need TWO
  // success claims naming ORD-1.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 4 — deriveClaimsFromLedger positional label misalignment (exhaustion path, T4 minor)
//
// recordToolResult pushes ANY ok call's string `label` into producedThisTurn — READS INCLUDED.
// deriveClaimsFromLedger consumes `produced[labelIx++]` for EFFECTED WRITES ONLY, positionally. So a
// read that emitted a label shifts the array, and the write consumes the READ's label as its `target`.
// The exhaustion closure then tells the user the WRONG entity for a real action.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 4 — read label shifts a write target on the derive path [BROKE]', () => {
  it('producedThisTurn (built by the runtime) includes a READ label ahead of the write', () => {
    const world = worldWith([
      { name: 'lookupOrder', args: { q: 'blue widget' }, result: { label: 'SEARCH-RESULT', items: [1] }, tookEffect: false },
      { name: 'refundOrder', args: { order: 'ORD-9' }, result: { ok: true }, tookEffect: true },
    ]);
    const ledger = createLedger();
    beginTurn(ledger, 0);
    // A READ that happens to emit a label (nothing forbids it) …
    recordToolResult(ledger, 'lookupOrder', { q: 'blue widget' }, { label: 'SEARCH-RESULT', items: [1] }, world);
    // … then the WRITE that took effect but emitted no label of its own.
    recordToolResult(ledger, 'refundOrder', { order: 'ORD-9' }, { ok: true }, world);

    expect(ledger.producedThisTurn).toEqual(['SEARCH-RESULT']); // the read's label sits at index 0

    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['refundOrder'], ledger.producedThisTurn);
    // FORBIDDEN: the refund of ORD-9 is reported under the SEARCH's label.
    expect(derived).toEqual([{ op: 'SEARCH-RESULT', target: 'SEARCH-RESULT', outcome: 'success' }]);
    expect(renderOperationReport(derived)).toBe('SEARCH-RESULT: done'); // wrong target for a real action
  });

  it('isolated: a read label at produced[0] is consumed by the first effected write', () => {
    const observed: ObservedCall[] = [
      call('lookupOrder', { q: 'x' }, { tookEffect: false }), // a read (not in writeTools)
      call('refundOrder', { order: 'ORD-9' }, { tookEffect: true }),
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder'], ['SEARCH-RESULT']);
    expect(derived[0].target).toBe('SEARCH-RESULT'); // the write wears the read's label
  });

  // EXACT FIX: deriveClaimsFromLedger must not consume a GLOBAL positional array that includes read
  // labels. Either (a) build producedThisTurn as write-only (recordToolResult pushes a label only when
  // `writes.has(name)`), or better (b) attach each produced label to its OWN observed call (a
  // per-call `producedLabel` field set in recordToolResult) and read `o.producedLabel` in the derive
  // loop instead of a positional cursor. Option (b) also removes the last-write-drops-when-counts-
  // differ hazard entirely, because there is no cursor to misalign.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 3 — deriveClaimsFromLedger mis-buckets an EFFECTED write as pending_confirmation
//
// The derive loop checks `resultFlags.requiresConfirmation` FIRST and `continue`s — BEFORE the
// `tookEffect` branch. A write that BOTH took effect AND carries the confirmation flag is rendered
// "Awaiting your confirmation." The user is told an action is still pending their OK when it already
// happened — a real action mis-reported (and it consumes no label, so it drops out of the success set).
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 3 — effected write + confirmation flag mis-bucketed as pending [BROKE]', () => {
  it('an effected write with requiresConfirmation is derived as pending_confirmation, not success', () => {
    const observed: ObservedCall[] = [
      call('refundOrder', { order: 'ORD-7', amount: 200 }, {
        tookEffect: true,
        resultFlags: { requiresConfirmation: true },
      }),
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder'], ['REFUND-7']);
    // FORBIDDEN: the refund landed (tookEffect:true) yet the engine's own account calls it pending.
    expect(derived).toEqual([{ op: 'operation', outcome: 'pending_confirmation' }]);
    expect(renderOperationReport(derived)).toBe('Awaiting your confirmation.'); // action already done
  });

  // EXACT FIX: an EFFECTED write is a completed action regardless of a stray confirmation flag — test
  // `tookEffect === true` BEFORE `requiresConfirmation` in deriveClaimsFromLedger (reorder the two
  // branches), OR gate the pending branch on `tookEffect !== true`. pending_confirmation is only honest
  // for a write that DID NOT take effect.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 5 — salvage re-validation strictness (CLOSED)
//
// finalizeReply's salvage runs `checkPayload(spec, ledger, world, candidate)` — the SAME onReply guard
// set (claimIsComplete/claimIsGrounded included) as the main path — and delivers the salvaged candidate
// only when `candViolations.length === 0`, OR when EVERY violation is a FORM violation. claimIsComplete
// and claimIsGrounded are in TRUTH_GUARD_KINDS, so isFormViolation is false for them: a candidate whose
// `did` omits or fabricates trips a TRUTH guard and is NEVER salvaged over. Salvage is not a weaker path.
// Proven here at the unit level: the completeness guard applied to a fabricating candidate still fails,
// so the salvage `candViolations.length === 0` gate cannot pass it.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 5 — salvage cannot pass a hiding candidate [CLOSED]', () => {
  it('claimIsComplete (a TRUTH guard, run identically on the salvage path) still fails a hidden write', () => {
    const observed: ObservedCall[] = [
      call('refundOrder', { order: 'ORD-3', amount: 99 }, { tookEffect: true }),
    ];
    // A salvage candidate whose did reports an UNRELATED target — does not cover the ORD-3 refund.
    const did: TurnClaim[] = [{ op: 'note', target: 'ORD-OTHER', outcome: 'success' }];
    const reason = claimIsComplete({ writeTools: WRITES }).check(replyCtx({ did, observed }));
    expect(reason).toBeTruthy(); // salvage's checkPayload sees this too → candViolations ≠ 0 → not salvaged
  });
});
