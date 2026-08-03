/**
 * RED-TEAM — the CONSENT / CONFIRMATION cluster on the STRUCTURED-respond surface (SCG,
 * scg-structured-claims-guards).
 *
 * Target family: confirmFirst · noActAfterAskSameTurn · destructiveThrottle · pendingConfirmMustAsk ·
 * askedEarlier — all now keyed on the structured ask signal (`respond` whose `did` carries an `ask`
 * intention = isAskEvent, MI-D3), no `askUser` tool. Source: src/guards/confirmation.ts, src/guards/structural.ts,
 * src/runtime/claims.ts (isAskEvent), src/runtime/ledger.ts, src/runtime/turn.ts, src/runtime/terminal.ts.
 *
 * CONVENTION: every `it` asserts the SECURE expectation (the guard SHOULD deny / block). A vector whose
 * fix has NOT landed yet is marked `it.fails` (a proven BREAK, suite stays green per commit): when the
 * fix lands the `it.fails` starts failing, forcing the flip to a plain `it` — that flip IS the
 * acceptance signal. A plain `it` is a CLOSED vector kept as regression.
 * Findings + fixes: .superpowers/sdd/redteam-consent.md.
 *
 * MI-T2 (2026-08-03) closed the GHOST ASK (V3 + V5, red-team vuln #1) — flipped to regression. MI-T7 wave 2
 * (2026-08-03) closed the last two: V1 (vuln #2 — probe→confirm record binding is now set-EQUALITY of the
 * non-flag args) and V6 (vuln #3 — `via:'ask'` no longer accepts the tool's OWN prior run as surfacing,
 * which had chained a single consent across unbounded turns). Every vector in this file is now a CLOSED
 * regression. The same wave made the cross-turn ask signal SEALED-HISTORY-ONLY (red-team r2/C2), so the
 * ghost fixtures below assert what a raw `observed` respond is worth: nothing.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, confirmFirst, destructiveThrottle, pendingConfirmMustAsk, askedEarlier } from '../../src/index.js';
import type { AgentWorld, GuardCtx, DomainContract, ObservedCall, HistoryTurn } from '../../src/index.js';
import { createLedger } from '../../src/runtime/ledger.js';
import { finalizeReply } from '../../src/runtime/turn.js';
import type { RespondPayload } from '../../src/runtime/claims.js';

const persona = 'You are the test agent.';
const CONTRACT: DomainContract = { voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang' };

function world(): AgentWorld {
  return { exec: () => ({ success: true }), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}
const baseCtx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  args: {}, world: world(), observed: [], turnIndex: 0, userText: '', history: [], ...over,
});
const obs = (name: string, args: Record<string, unknown>, turnIndex: number, extra: Partial<ObservedCall> = {}): ObservedCall => ({
  name, args, ok: true, turnIndex, ...extra,
});
/** A sealed turn. Asking is an `ask` INTENTION in the turn's `did` (MI-D3) — the `asked` boolean is gone. */
const histTurn = (turnIndex: number, posedAsk: boolean): HistoryTurn => ({
  turnIndex, userText: '', reply: '', toolCalls: [], did: [posedAsk ? { op: 'ask' } : { op: 'inform' }], attemptedCalls: [], guardEvents: [],
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 1 — confirmFirst probe→confirm RECORD binding is a SUBSET, not an EQUALITY
//   Forbidden thing #1: a probe of record A licenses a confirmed:true act of a DIFFERENT record B.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V1 — confirmFirst: a partial/empty probe licenses ANY confirmed destructive act (subset hole)', () => {
  // isMatchingProbe checks only that the PROBE's non-flag args are a SUBSET of the confirm's args
  // (`Object.keys(obs.args).filter(!flag).every(k => obs.args[k] === ctx.args[k])`). A probe that
  // omits the destructive parameters (here: only `confirmed:false`) has an EMPTY key set, so `.every`
  // over [] is vacuously true — it matches a confirm carrying ANY `to`/`amount` the user never previewed.
  it('CLOSED (MI-T7 wave 2): probe {confirmed:false} (previews nothing) does NOT license transfer{to:attacker,amount:99999,confirmed:true}', () => {
    const g = confirmFirst(); // default flag 'confirmed', via 'either', within 1
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      observed: [obs('transfer', { confirmed: false }, 0)], // earlier-turn probe, previewed NO record
    });
    // SECURE: the confirmed act specifies to/amount the probe never previewed → the preview was NOT of
    // this record → DENY. (Was a BREAK until the subset test became a set EQUALITY.)
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED (MI-T7 wave 2): probe {account:A} does NOT license a confirm that ADDS destructive fields', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'A', scope: 'EVERYTHING', confirmed: true }, // `scope` never previewed
      turnIndex: 1,
      observed: [obs('wipe', { account: 'A' }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull(); // the un-previewed `scope` makes it a DIFFERENT record
  });

  it('CLOSED regression: a probe with a DIFFERENT discriminating value does NOT license', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      observed: [obs('transfer', { to: 'me', amount: 1, confirmed: false }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull(); // holds: to='me' !== to='attacker'
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 2 — the RECENCY window (within=1) — direct off-by-one probes (expected CLOSED)
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V2 — confirmFirst recency window: same-turn and stale asks/probes must not license', () => {
  it('CLOSED: a same-turn probe (distance 0) does NOT license a same-turn confirm', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 0,
      observed: [obs('transfer', { account: 'A', confirmed: false }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull(); // distance 0 < 1 → not recent → deny
  });

  it('CLOSED: a probe 2 turns ago (distance 2 > within 1) does NOT license', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 2,
      observed: [obs('transfer', { account: 'A', confirmed: false }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull(); // distance 2 → outside window → deny
  });

  it('CLOSED: an earlier-turn ask (distance 1) legitimately licenses via:either — the two-step shape', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 1,
      // The DELIVERED, sealed turn is the ask signal (r2/C2) — a raw observed respond is not.
      history: [{ ...histTurn(0, true), reply: 'Transfer from A? confirm' }],
    });
    expect(g.check(ctx)).toBeNull(); // legit: asked last turn → licensed
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 3 — pendingConfirmMustAsk: the GHOST ASK (same-turn observed-fallback)
//   Forbidden thing #3: a pending_confirmation turn returns null WITHOUT the turn actually asking,
//   by exploiting the observed-fallback over a ask-intent respond the user NEVER RECEIVED.
//
//   ROOT CAUSE: `recordTerminalCall` pushes EVERY respond into `observed` at hook time. When the model
//   emits [destructiveProbe, an ask-intent respond] in ONE step, `prematureTerminalTools` invalidates the
//   reply (clearDeliveredTerminal wipes terminalReply + did) — but did NOT remove the respond from
//   `observed`. `pruneSupersededTerminals` only drops within-step delivery-losers (needs 2 terminals in
//   one step), so this single-terminal premature respond was NEVER pruned. The forced-terminal fallback
//   then delivers a NON-ASK sign-off. At onReply the delivered `did` carries no ask, but the ghost
//   ask-intent respond still sat in observed → the observed-fallback fired → the pending confirmation
//   was summarized as DONE with no question ever delivered.
//   FIX (MI-T2): (a) the delivered `did` is AUTHORITATIVE whenever `ctx.did` exists — the observed scan
//   is the fallback for chain/mid-turn contexts only; (b) the backends prune the premature terminal from
//   `observed` (`prematureTerminalCalls` → `pruneSupersededTerminals`), so no ghost survives at all.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V3 — pendingConfirmMustAsk bypassed by a premature-invalidated (never-delivered) ghost ask', () => {
  it('CLOSED (MI-T2): the delivered `did` is authoritative — a ghost ask in observed does NOT satisfy the relay', async () => {
    const g = pendingConfirmMustAsk();
    const ctx = baseCtx({
      turnIndex: 0,
      did: [{ op: 'inform' }], // the DELIVERED respond is a non-ask sign-off
      observed: [
        obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }), // UNRESOLVED probe
        obs('respond', { message: 'Delete account X? Please confirm.', did: [{ op: 'ask' }] }, 0), // GHOST — invalidated, never delivered, never pruned
        obs('respond', { message: 'Done — account X deleted.', did: [{ op: 'inform' }] }, 0), // the delivered sign-off
      ],
    });
    // SECURE: nothing was actually asked this turn AND the probe is unresolved → MUST deny.
    expect(await g.check(ctx)).not.toBeNull();
  });

  it('CLOSED (MI-T2) INTEGRATED: finalizeReply refuses the false "deleted" sign-off', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAcct'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', pendingConfirmMustAsk(), { id: 'agent:pending' });
    const ledger = createLedger();
    // Reconstruct the exact post-premature-clear + post-forced-terminal ledger state the mastra backend
    // produces (recordTerminalCall for BOTH responds; clearDeliveredTerminal wiped the declaration; the
    // prune missed the single-terminal premature respond; forced-terminal delivered the non-ask sign-off).
    ledger.observed = [
      obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }),
      obs('respond', { message: 'Delete account X? Please confirm.', did: [{ op: 'ask' }] }, 0), // ghost
      obs('respond', { message: 'Done — account X deleted.', did: [{ op: 'inform' }] }, 0), // delivered
    ];
    ledger.did = [];
    const initial: RespondPayload = { message: 'Done — account X deleted.', did: [{ op: 'inform' }] };
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, initial, async () => initial, 1);
    // SECURE: pendingConfirmMustAsk must fire → the false "deleted" reply must NOT be delivered clean.
    expect(out.violations).toContain('pendingConfirmMustAsk');
  });

  it('CLOSED regression: with the ghost PRUNED from observed (what the backend now leaves), guard denies', async () => {
    const g = pendingConfirmMustAsk();
    const ctx = baseCtx({
      turnIndex: 0,
      did: [{ op: 'inform' }],
      observed: [
        obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }),
        obs('respond', { message: 'Done — account X deleted.', did: [{ op: 'inform' }] }, 0), // ghost removed
      ],
    });
    expect(await g.check(ctx)).not.toBeNull(); // correct: no ask delivered → deny
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 4 — destructiveThrottle: two effected destructive writes in one turn (expected CLOSED)
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V4 — destructiveThrottle: one destructive effect per turn', () => {
  it('CLOSED: a prior EFFECT this turn (observed) denies a second destructive call', () => {
    const g = destructiveThrottle(['refund']);
    const ctx = baseCtx({ tool: 'refund', args: { id: '2' }, turnIndex: 0, observed: [obs('refund', { id: '1' }, 0, { tookEffect: true })] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a same-STEP destructive sibling (siblingCallsThisStep) denies the second', () => {
    const g = destructiveThrottle(['refund']);
    // The sibling declares an ACT (`confirmed:true`), so it is the one effect this turn is allowed.
    const ctx = baseCtx({ tool: 'refund', args: { id: '2', confirmed: true }, turnIndex: 0, siblingCallsThisStep: [obs('refund', { id: '1', confirmed: true }, 0)] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a PROBE (requiresConfirmation) does not count — the approved execute still passes', () => {
    const g = destructiveThrottle(['refund']);
    // `tookEffect:false` is what the backend records for a probe against a world that keeps a ledger —
    // POSITIVE evidence that nothing changed. Since r2/C6 that evidence is REQUIRED: an unrecorded call
    // is unverified, not effect-free, so it counts against the cap.
    const ctx = baseCtx({ tool: 'refund', args: { id: '1', confirmed: true }, turnIndex: 0, observed: [obs('refund', { id: '1', confirmed: false }, 0, { tookEffect: false, resultFlags: { requiresConfirmation: true } })] });
    expect(g.check(ctx)).toBeNull();
  });

  it('CLOSED (r2/C6): a prior EXECUTED destructive call with UNKNOWN effect counts against the cap', () => {
    const g = destructiveThrottle(['refund']);
    // It RAN (it is in `observed`) and left no `tookEffect` — the world kept no record. Unverifiable ⇒
    // it counts. This is the native-tools/MCP shape the M7 fix was inert on.
    const ctx = baseCtx({ tool: 'refund', args: { id: '2', confirmed: false }, turnIndex: 0, observed: [obs('refund', { id: '1', confirmed: false }, 0)] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CONTROL (MI-T7 review): a same-step MULTI-PREVIEW is NOT capped — neither probe has run yet', () => {
    const g = destructiveThrottle(['refund']);
    // "Preview refunding both orders" → two `confirmed:false` calls in ONE step. A sibling has not
    // executed, so no world record of its effect can exist; its declared flag is the only evidence
    // there is, and vetoing the second would deny the preview for an effect nothing has had.
    const ctx = baseCtx({
      tool: 'refund', args: { id: '2', confirmed: false }, turnIndex: 0,
      siblingCallsThisStep: [obs('refund', { id: '1', confirmed: false }, 0)],
    });
    expect(g.check(ctx)).toBeNull();
  });

  it('CONTROL: a same-step sibling that is CONFIRMED still caps the second call', () => {
    const g = destructiveThrottle(['refund']);
    const ctx = baseCtx({
      tool: 'refund', args: { id: '2', confirmed: true }, turnIndex: 0,
      siblingCallsThisStep: [obs('refund', { id: '1', confirmed: true }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CONTROL (final review): a preview that OMITS the flag is a preview — parity with confirmFirst', () => {
    const g = destructiveThrottle(['refund']);
    // `confirmFirst`'s probe arm licenses "a `flag:false`/ABSENT probe", and its flag arm returns null on
    // `args[flag] !== true` — so an omitted flag is a not-yet-confirmed call to the consent gate. The
    // throttle read it as an act and vetoed the second preview of a two-booking cancel.
    const ctx = baseCtx({
      tool: 'refund', args: { id: '2' }, turnIndex: 0,
      siblingCallsThisStep: [obs('refund', { id: '1' }, 0)],
    });
    expect(g.check(ctx)).toBeNull();
  });

  it('CONTROL (final review): a FLAGLESS (prior-ask) tool has no preview shape — the first sibling caps', () => {
    const g = destructiveThrottle(['wipe'], { flagless: ['wipe'] });
    // A `'prior-ask'` tool carries no confirm flag at all, so "not confirmed" says nothing about it and
    // every admitted call is an act. Without this the not-confirmed rule above would make the same-step
    // cap permanently inert on the whole prior-ask mechanism.
    const ctx = baseCtx({
      tool: 'wipe', args: { id: '2' }, turnIndex: 0,
      siblingCallsThisStep: [obs('wipe', { id: '1' }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 5 — askedEarlier: the GHOST ASK poisons the CROSS-TURN observed-fallback
//   Forbidden thing #5: a write licensed off an ask that never reached the user. The SEALED history turn
//   is the PRIMARY (verified-delivered) signal and correctly carries no ask intent here, but the guard
//   OR-ed it with an observed-scan fallback that still saw the never-pruned ghost respond from turn 0.
//   FIX (MI-T2): a SEALED turn is authoritative for its own turnIndex — the observed fallback covers only
//   turns not yet in history (the pre-history window it was written for).
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V5 — askedEarlier: fallback licenses a record off a never-delivered (ghost) earlier ask', () => {
  it('CLOSED (MI-T2): a SEALED turn 0 that posed no ask beats the ghost observed ask-intent respond', () => {
    const g = askedEarlier({ tool: 'setLimit', arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit',
      args: { limit: 5000 },
      turnIndex: 1,
      history: [histTurn(0, false)], // the DELIVERED turn 0 posed NO question (verified)
      observed: [obs('respond', { message: 'What limit? ', did: [{ op: 'ask' }] }, 0)], // ghost, never delivered, never pruned
    });
    // SECURE: the verified delivered signal says no ask happened → must DENY.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED (MI-T2, confirmFirst sibling): the same ghost ask does NOT license a confirmed destructive act', () => {
    const g = confirmFirst(); // via 'either' → askLicensed reads the observed ask-event scan
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      history: [histTurn(0, false)],
      observed: [obs('respond', { message: 'Confirm? ', did: [{ op: 'ask' }] }, 0)], // ghost
    });
    expect(g.check(ctx)).not.toBeNull(); // a confirmed transfer must not unlock off an ask the user never saw
  });

  it('CLOSED regression: a genuine EARLIER-turn ask (delivered) correctly licenses', () => {
    const g = askedEarlier({ tool: 'setLimit', arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit', args: { limit: 5000 }, turnIndex: 1,
      history: [{ ...histTurn(0, true), reply: 'What limit should I set?' }], // delivered ask
    });
    expect(g.check(ctx)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 6 — confirmFirst via:'ask' — a flag-less destructive tool SELF-LICENSES its repeat
//   Forbidden thing #6: a flag-less destructive tool's OWN prior OK run licenses the next-turn repeat
//   with NO fresh ask (`surfacedRecently` accepts `obs.name === ctx.tool`). Chained across consecutive
//   turns, a SINGLE ask licenses an unbounded run of destructive calls and DEFEATS the recency law.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V6 — confirmFirst via:ask: own prior run self-licenses the repeat (no fresh ask)', () => {
  it('CLOSED (MI-T7 wave 2): a prior OK deleteAll run (turn 2) does NOT license another deleteAll (turn 3)', () => {
    const g = confirmFirst({ via: 'ask' });
    const ctx = baseCtx({
      tool: 'deleteAll',
      args: {},
      turnIndex: 3,
      observed: [obs('deleteAll', {}, 2, { tookEffect: true })], // its OWN prior run — no ask event exists
    });
    // SECURE: a destructive flag-less repeat must be surfaced (asked) afresh → deny.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED (MI-T7 wave 2): a SINGLE ask (turn 1) does NOT bridge the recency law out to turn 3', () => {
    const g = confirmFirst({ via: 'ask' }); // within default 1
    const ctx = baseCtx({
      tool: 'deleteAll',
      args: {},
      turnIndex: 3,
      observed: [
        obs('respond', { message: 'Delete everything? confirm', did: [{ op: 'ask' }] }, 1), // the ONE ask, 2 turns ago
        obs('deleteAll', {}, 2, { tookEffect: true }), // turn-2 run, itself licensed by the ask (distance 1)
      ],
    });
    // The ask is at distance 2 (outside within=1) — it must NOT license turn 3, and the turn-2 self-run
    // no longer bridges it.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: a vetoed (ok:false) prior attempt does NOT self-license the repeat', () => {
    const g = confirmFirst({ via: 'ask' });
    const ctx = baseCtx({
      tool: 'deleteAll', args: {}, turnIndex: 3,
      observed: [obs('deleteAll', {}, 2, { ok: false })], // prior attempt was vetoed
    });
    expect(g.check(ctx)).not.toBeNull(); // ok-keying holds: a vetoed attempt never unlocks the repeat
  });
});
