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
describe('VECTOR 1 — targetless success claim hides all effected writes [CLOSED by M3]', () => {
  const twoWritesDifferentTargets: ObservedCall[] = [
    call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
    call('refundOrder', { order: 'ORD-2', amount: 500 }, { tookEffect: true }),
  ];
  const twoWritesWorld = worldWith([
    { name: 'updateOrder', args: { order: 'ORD-1', status: 'shipped' }, result: { id: 'ORD-1' }, tookEffect: true },
    { name: 'refundOrder', args: { order: 'ORD-2', amount: 500 }, result: { id: 'ORD-2' }, tookEffect: true },
  ]);

  it('CLOSED: ONE targetless success claim covers NEITHER of the two distinct writes', () => {
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }]; // no target
    const reason = claimIsComplete({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets, world: twoWritesWorld }),
    );
    // A claim that names no entity names no ledger fact: coverage now requires `claim.target`.
    expect(reason).toBeTruthy();
  });

  it('CONTROL: one success claim PER target covers both writes (the fix is not blanket denial)', () => {
    const did: TurnClaim[] = [
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
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }];
    const reason = claimIsGrounded({ writeTools: WRITES }).check(
      replyCtx({ did, observed: twoWritesDifferentTargets, world: twoWritesWorld }),
    );
    expect(reason).toBeNull();
  });

  it('the user-facing report is a single generic line — the refund is invisible', () => {
    const did: TurnClaim[] = [{ op: 'update', outcome: 'success' }];
    const report = renderOperationReport(did);
    expect(report).toBe('One action completed.'); // ORD-2 / the $500 refund never reach the user
  });

  // FIX AS LANDED (MI-T3 / M3): `claimIsComplete`'s covered predicate requires `claim.target !== undefined`
  // (plus the ACTION-op partition and world-issued-value matching). Grounding keeps the targetless
  // latitude, exactly as this vector prescribed; COMPLETENESS is per-target.
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VECTOR 2 — occurrence vs existence: ONE target claim covers TWO writes to the SAME target
//
// claimIsComplete asks, per effected write, `did.some(claim matches)` — EXISTENCE of a matching
// claim, never a 1:1 accounting. Two distinct operations on ORD-1 (update + refund) both match the
// single `{target:'ORD-1', outcome:'success'}` claim → both "covered" → null. The second operation
// hides behind the first's claim.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('VECTOR 2 — one claim covers two writes to the same target [CLOSED by M3 injectivity]', () => {
  const twoWritesSameTarget: ObservedCall[] = [
    call('updateOrder', { order: 'ORD-1', status: 'shipped' }, { tookEffect: true }),
    call('refundOrder', { order: 'ORD-1', amount: 500 }, { tookEffect: true }), // distinct op, same target
  ];
  const sameTargetWorld = worldWith([
    { name: 'updateOrder', args: { order: 'ORD-1', status: 'shipped' }, result: { id: 'ORD-1' }, tookEffect: true },
    { name: 'refundOrder', args: { order: 'ORD-1', amount: 500 }, result: { id: 'ORD-1' }, tookEffect: true },
  ]);
  const complete = (did: TurnClaim[]) =>
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

  // FIX AS LANDED (MI-T3 / M3): each effected write SPENDS a distinct covering claim (a `spent` index set
  // over the success-resolving, target-bearing ACTION claims), so coverage counts occurrences.
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
