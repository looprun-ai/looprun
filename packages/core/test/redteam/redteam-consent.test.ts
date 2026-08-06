/**
 * RED-TEAM — the CONSENT / CONFIRMATION cluster on the STRUCTURED-respond surface.
 *
 * Target family: confirmFirst · destructiveThrottle · valueFromUser — the gates around a destructive
 * act. What licenses one is a token the ENGINE issued for a record and the USER typed back; the agent
 * has no channel that produces one. Source: src/guards/confirmation.ts, src/guards/structural.ts,
 * src/runtime/approval-request.ts, src/runtime/action-history.ts, src/runtime/turn.ts.
 *
 * CONVENTION: every `it` asserts the SECURE expectation (the guard SHOULD deny / block). A vector whose
 * fix has NOT landed yet is marked `it.fails` (a proven BREAK, suite stays green per commit): when the
 * fix lands the `it.fails` starts failing, forcing the flip to a plain `it` — that flip IS the
 * acceptance signal. A plain `it` is a CLOSED vector kept as regression.
 * Findings + fixes: .superpowers/sdd/redteam-consent.md.
 *
 * Every vector in this file is a CLOSED regression. What closes them: a consent names the record it was
 * given for and is compared by whole-value equality, so it never travels to another record or another
 * tool; and nothing the agent emits — a declared ask, its own prior successful run, a sealed history
 * turn — is admitted as evidence of one.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, confirmFirst, destructiveThrottle, valueFromUser } from '../../src/index.js';
import type { AgentWorld, GuardCtx, DomainContract, ObservedCall, HistoryTurn } from '../../src/index.js';
import { createActionHistory } from '../../src/runtime/action-history.js';
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
/** A sealed turn. Asking is an `ask` INTENTION in the turn's `did`. */
const histTurn = (turnIndex: number, posedAsk: boolean): HistoryTurn => ({
  turnIndex, userText: '', reply: '', toolCalls: [], did: [posedAsk ? { op: 'ask' } : { op: 'inform' }], attemptedCalls: [], guardEvents: [],
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 1 — a consent must not travel: not to another record, not to another tool
// ════════════════════════════════════════════════════════════════════════════════════════════════
const consentFor = (tool: string, subject?: string): GuardCtx['consent'] => [
  { tool, ...(subject === undefined ? {} : { subject }), meaning: subject ?? tool, token: `CONFIRM ${(subject ?? tool).toUpperCase()}`, issuedTurn: 0, consumedTurn: 1 },
];

describe('V1 — a consent licenses the act it was given for, and nothing else', () => {
  it('CLOSED: a consent for record A does NOT license an act on record B', () => {
    const g = confirmFirst();
    const ctx = baseCtx({ tool: 'transfer', args: { account: 'B', confirmed: true }, turnIndex: 1, consent: consentFor('transfer', 'A') });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a consent for record BK-1 does NOT license BK-12 — the token is a whole value', () => {
    const g = confirmFirst();
    const ctx = baseCtx({ tool: 'cancel', args: { id: 'BK-12', confirmed: true }, turnIndex: 1, consent: consentFor('cancel', 'BK-1') });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a consent for one tool does NOT license another', () => {
    const g = confirmFirst();
    const ctx = baseCtx({ tool: 'wipe', args: { account: 'A', confirmed: true }, turnIndex: 1, consent: consentFor('transfer', 'A') });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: an act carrying extra destructive fields is still licensed — the record is what was agreed', () => {
    // The token names the RECORD, so a field the user never simulated cannot make it a different act:
    // what bounds the blast radius of an agreed act is destructiveThrottle, not the consent gate.
    const g = confirmFirst();
    const ctx = baseCtx({ tool: 'wipe', args: { account: 'A', scope: 'EVERYTHING', confirmed: true }, turnIndex: 1, consent: consentFor('wipe', 'A') });
    expect(g.check(ctx)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 2 — nothing the AGENT produces is a consent
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V2 — the agent has no channel that licenses a destructive act', () => {
  it('CLOSED: an empty consent set denies', () => {
    const g = confirmFirst();
    expect(g.check(baseCtx({ tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 1, consent: [] }))).not.toBeNull();
  });

  it('CLOSED: a sealed turn that declared an ask licenses nothing', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 1,
      history: [{ ...histTurn(0, true), reply: 'Transfer from A? confirm' }],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: the tool\'s own earlier successful run licenses nothing', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 2,
      observed: [obs('transfer', { account: 'A', confirmed: true }, 1, { tookEffect: true })],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: the token the user typed for THIS record licenses the act — the two-step shape', () => {
    const g = confirmFirst();
    const ctx = baseCtx({ tool: 'transfer', args: { account: 'A', confirmed: true }, turnIndex: 1, consent: consentFor('transfer', 'A') });
    expect(g.check(ctx)).toBeNull();
  });
});

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

  it('CLOSED: a SIMULATE (requiresConfirmation) does not count — the approved execute still passes', () => {
    const g = destructiveThrottle(['refund']);
    // `tookEffect:false` is what the backend records for a simulate against a world that keeps a action history —
    // POSITIVE evidence that nothing changed. That evidence is REQUIRED: an unrecorded call is
    // unverified, not effect-free, so it counts against the cap.
    const ctx = baseCtx({ tool: 'refund', args: { id: '1', confirmed: true }, turnIndex: 0, observed: [obs('refund', { id: '1', confirmed: false }, 0, { tookEffect: false, resultFlags: { requiresConfirmation: true } })] });
    expect(g.check(ctx)).toBeNull();
  });

  it('CLOSED: a prior EXECUTED destructive call with UNKNOWN effect counts against the cap', () => {
    const g = destructiveThrottle(['refund']);
    // It RAN (it is in `observed`) and left no `tookEffect` — the world kept no record. Unverifiable ⇒
    // it counts. This is the native-tools/MCP shape, where no world action history exists to consult.
    const ctx = baseCtx({ tool: 'refund', args: { id: '2', confirmed: false }, turnIndex: 0, observed: [obs('refund', { id: '1', confirmed: false }, 0)] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CONTROL: a same-step MULTI-SIMULATION is NOT capped — neither simulation has run yet', () => {
    const g = destructiveThrottle(['refund']);
    // "Simulate refunding both orders" → two `simulate:true` calls in ONE step. A sibling has not
    // executed, so no world record of its effect can exist; its declared `simulate:true` is the only
    // evidence there is, and vetoing the second would deny the simulation for an effect nothing has had.
    const ctx = baseCtx({
      tool: 'refund', args: { id: '2', simulate: true }, turnIndex: 0,
      siblingCallsThisStep: [obs('refund', { id: '1', simulate: true }, 0)],
    });
    expect(g.check(ctx)).toBeNull();
  });

  it('CONTROL: a BARE same-step sibling is the act it will be — the second call caps', () => {
    const g = destructiveThrottle(['refund']);
    const ctx = baseCtx({
      tool: 'refund', args: { id: '2' }, turnIndex: 0,
      siblingCallsThisStep: [obs('refund', { id: '1' }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CONTROL (final review): only an explicit simulate:true declares a sibling simulation', () => {
    const g = destructiveThrottle(['wipe']);
    // A sibling that has not run offers no world record; its own `simulate:true` is the only possible
    // declaration. A bare sibling is an act, so the cap engages from the first one — a tool that cannot
    // simulate is capped without any configuration.
    const ctx = baseCtx({
      tool: 'wipe', args: { id: '2' }, turnIndex: 0,
      siblingCallsThisStep: [obs('wipe', { id: '1' }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 5 — valueFromUser: the GHOST ASK poisons the CROSS-TURN observed-fallback
//   Forbidden thing #5: a write licensed off an ask that never reached the user. The SEALED history turn
//   is the PRIMARY (verified-delivered) signal and correctly carries no ask intent here, but the guard
//   OR-ed it with an observed-scan fallback that still saw the never-pruned ghost respond from turn 0.
//   FIX: a SEALED turn is authoritative for its own turnIndex — the observed fallback covers only
//   turns not yet in history (the pre-history window it was written for).
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V5 — valueFromUser: the value the world records must be the value the user said', () => {
  it('CLOSED: a ghost respond declaring a question licenses no value', () => {
    const g = valueFromUser({ arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit',
      args: { limit: '5000' },
      turnIndex: 1,
      userText: 'go ahead',
      history: [histTurn(0, false)],
      observed: [obs('respond', { message: 'What limit? ', did: [{ op: 'ask' }] }, 0)], // never delivered
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: the same ghost ask does NOT license a confirmed destructive act', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      history: [histTurn(0, false)],
      observed: [obs('respond', { message: 'Confirm? ', did: [{ op: 'ask' }] }, 0)], // ghost
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: the figure the user actually gave is recorded', () => {
    const g = valueFromUser({ arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit', args: { limit: '5000' }, turnIndex: 1,
      userText: 'set it to 5000',
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
  it('CLOSED: a prior OK deleteAll run (turn 2) does NOT license another deleteAll (turn 3)', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({
      tool: 'deleteAll',
      args: {},
      turnIndex: 3,
      observed: [obs('deleteAll', {}, 2, { tookEffect: true })], // its OWN prior run — no ask event exists
    });
    // SECURE: a destructive flag-less repeat must be surfaced (asked) afresh → deny.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a SINGLE ask (turn 1) does NOT bridge the recency law out to turn 3', () => {
    const g = confirmFirst({ flag: false }); // within default 1
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
    // does not bridge it.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: a vetoed (ok:false) prior attempt does NOT self-license the repeat', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({
      tool: 'deleteAll', args: {}, turnIndex: 3,
      observed: [obs('deleteAll', {}, 2, { ok: false })], // prior attempt was vetoed
    });
    expect(g.check(ctx)).not.toBeNull(); // ok-keying holds: a vetoed attempt never unlocks the repeat
  });
});
