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
import type { Intention } from '../../src/runtime/claims.js';
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
function replyCtx(over: Partial<GuardCtx> & { did: Intention[] }): GuardCtx {
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
describe('VECTOR 1 — targetless success claim hides all effected writes [CLOSED]', () => {
  const twoWritesDifferentTargets: ObservedCall[] = [
    call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
    call('refundOrder', { order: 'ORD-2', amount: 500 }, { tookEffect: true }),
  ];
  const twoWritesWorld = worldWith([
    { name: 'updateOrder', args: { order: 'ORD-1', status: 'shipped' }, result: { id: 'ORD-1' }, tookEffect: true },
    { name: 'refundOrder', args: { order: 'ORD-2', amount: 500 }, result: { id: 'ORD-2' }, tookEffect: true },
  ]);

  it('CLOSED: ONE targetless success claim covers NEITHER of the two distinct writes', () => {
    const did: Intention[] = [{ op: 'update', outcome: 'success' }]; // no target
    const reason = claimIsComplete({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets, world: twoWritesWorld }),
    );
    // A claim that names no entity names no ledger fact: coverage now requires `claim.target`.
    expect(reason).toBeTruthy();
  });

  it('CONTROL: one success claim PER target covers both writes (the fix is not blanket denial)', () => {
    const did: Intention[] = [
      { op: 'update', target: 'ORD-1', outcome: 'success' },
      { op: 'refund', target: 'ORD-2', outcome: 'success' },
    ];
    const reason = claimIsComplete({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets, world: twoWritesWorld }),
    );
    expect(reason).toBeNull();
  });

  it('DOCUMENTED: claimIsGrounded keeps the targetless latitude — completeness is the wall', () => {
    // A targetless claim still GROUNDS (an honest "one action completed" on a single-write turn is not a
    // lie), so the un-hideability guarantee rests on claimIsComplete's target-defined coverage above.
    const did: Intention[] = [{ op: 'update', outcome: 'success' }];
    const reason = claimIsGrounded({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets, world: twoWritesWorld }),
    );
    expect(reason).toBeNull();
  });

  it('the user-facing report is a single generic line — the refund is invisible', () => {
    const did: Intention[] = [{ op: 'update', outcome: 'success' }];
    const report = renderOperationReport(did);
    expect(report).toBe('One action completed.'); // ORD-2 / the $500 refund never reach the user
  });

  // THE RULE: `claimIsComplete`'s covered predicate requires `claim.target !== undefined` (plus the
  // ACTION-op partition and world-issued-value matching). Grounding keeps the targetless latitude;
  // COMPLETENESS is per-target.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 2 — occurrence vs existence: ONE target claim covers TWO writes to the SAME target
//
// claimIsComplete asks, per effected write, `did.some(claim matches)` — EXISTENCE of a matching
// claim, never a 1:1 accounting. Two distinct operations on ORD-1 (update + refund) both match the
// single `{target:'ORD-1', outcome:'success'}` claim → both "covered" → null. The second operation
// hides behind the first's claim.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 2 — one claim covers two writes to the same target [CLOSED by injectivity]', () => {
  const twoWritesSameTarget: ObservedCall[] = [
    call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
    call('refundOrder', { order: 'ORD-1', amount: 500 }, { tookEffect: true }), // distinct op, same target
  ];
  const sameTargetWorld = worldWith([
    { name: 'updateOrder', args: { order: 'ORD-1', status: 'shipped' }, result: { id: 'ORD-1' }, tookEffect: true },
    { name: 'refundOrder', args: { order: 'ORD-1', amount: 500 }, result: { id: 'ORD-1' }, tookEffect: true },
  ]);
  const complete = (did: Intention[]) =>
    claimIsComplete({ writeTools: WRITES }).check(replyCtx({ did, observed: twoWritesSameTarget, world: sameTargetWorld }));

  it('CLOSED: ONE claim on ORD-1 cannot cover TWO effected writes on ORD-1 — the refund is not hidden', () => {
    expect(complete([{ op: 'update', target: 'ORD-1', outcome: 'success' }])).toBeTruthy();
  });

  it('CONTROL: TWO success claims naming ORD-1 cover both writes (occurrence, not existence)', () => {
    expect(
      complete([
        { op: 'update', target: 'ORD-1', outcome: 'success' },
        { op: 'refund', target: 'ORD-1', outcome: 'success' },
      ]),
    ).toBeNull();
  });

  // THE RULE: each effected write SPENDS a distinct covering claim (a `spent` index set over the
  // success-resolving, target-bearing ACTION claims), so coverage counts occurrences.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 4 — deriveClaimsFromLedger positional label misalignment (exhaustion path) [CLOSED]
//
// recordToolResult pushes ANY ok call's string `label` into producedThisTurn — READS INCLUDED. A derive
// loop consuming `produced[labelIx++]` for EFFECTED WRITES ONLY, positionally, lets a read that emitted
// a label shift the array so the write wears the READ's label as its `target`, and the exhaustion
// closure tells the user the WRONG entity for a real action.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 4 — read label shifts a write target on the derive path [CLOSED]', () => {
  it('CLOSED: a READ label ahead of the write is NOT worn by the write', () => {
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

    expect(ledger.producedThisTurn).toEqual(['SEARCH-RESULT']); // the read's label is still recorded …

    const derived = deriveClaimsFromLedger(ledger.observed, 0, ['refundOrder']);
    // … but the derive path reads each call's OWN label, so the nameless refund stays nameless.
    expect(derived).toEqual([{ op: 'operation', outcome: 'success' }]);
    expect(renderOperationReport(derived)).toBe('One action completed.'); // generic, never the wrong entity
  });

  it('CLOSED isolated: a write with no producedLabel of its own derives no target', () => {
    const observed: ObservedCall[] = [
      call('lookupOrder', { q: 'x' }, { tookEffect: false, producedLabel: 'SEARCH-RESULT' }), // a read WITH a label
      call('refundOrder', { order: 'ORD-9' }, { tookEffect: true }),                          // the write, unlabelled
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder']);
    expect(derived[0].target).toBeUndefined();
  });

  it('CONTROL: a write that DID produce a label still wears its own (the fix is not blanket erasure)', () => {
    const observed: ObservedCall[] = [
      call('lookupOrder', { q: 'x' }, { tookEffect: false, producedLabel: 'SEARCH-RESULT' }),
      call('refundOrder', { order: 'ORD-9' }, { tookEffect: true, producedLabel: 'REFUND-9' }),
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder']);
    expect(derived).toEqual([{ op: 'REFUND-9', target: 'REFUND-9', outcome: 'success' }]);
  });

  // THE RULE: each produced label is attached to its OWN observed call (`ObservedCall.producedLabel`,
  // set in recordToolResult) and the derive loop reads `o.producedLabel`. There is no positional cursor
  // to misalign, so the last-write-drops-when-counts-differ hazard cannot arise either.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 3 — deriveClaimsFromLedger mis-buckets an EFFECTED write as pending_confirmation [CLOSED]
//
// A derive loop that checks `resultFlags.requiresConfirmation` FIRST and `continue`s — BEFORE the
// `tookEffect` branch — makes a write that BOTH took effect AND carried the confirmation flag render
// "Awaiting your confirmation." The user was told an action is still pending their OK when it already
// happened — a real action mis-reported (and it consumed no label, so it dropped out of the success set).
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 3 — effected write + confirmation flag mis-bucketed as pending [CLOSED]', () => {
  it('CLOSED: an effected write with requiresConfirmation derives as SUCCESS, not pending', () => {
    const observed: ObservedCall[] = [
      call('refundOrder', { order: 'ORD-7', amount: 200 }, {
        tookEffect: true,
        producedLabel: 'REFUND-7',
        resultFlags: { requiresConfirmation: true },
      }),
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder']);
    // The refund LANDED, so the engine's own account says so — no "awaiting your confirmation" over a
    // change the world already made.
    expect(derived).toEqual([{ op: 'REFUND-7', target: 'REFUND-7', outcome: 'success' }]);
    expect(renderOperationReport(derived)).toBe('REFUND-7: done');
  });

  it('CONTROL: a write that did NOT take effect and requires confirmation is still pending', () => {
    const observed: ObservedCall[] = [
      call('refundOrder', { order: 'ORD-7' }, { tookEffect: false, resultFlags: { requiresConfirmation: true } }),
    ];
    const derived = deriveClaimsFromLedger(observed, 0, ['refundOrder']);
    expect(derived).toEqual([{ op: 'operation', outcome: 'pending_confirmation' }]);
  });

  // THE RULE: `tookEffect === true` is tested BEFORE `requiresConfirmation` — pending_confirmation is
  // honest only for a write that did NOT take effect.
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
    const did: Intention[] = [{ op: 'note', target: 'ORD-OTHER', outcome: 'success' }];
    const reason = claimIsComplete({ writeTools: WRITES }).check(replyCtx({ did, observed }));
    expect(reason).toBeTruthy(); // salvage's checkPayload sees this too → candViolations ≠ 0 → not salvaged
  });
});
