/**
 * RED-TEAM — the CONSENT / CONFIRMATION cluster on the STRUCTURED-respond surface (SCG,
 * scg-structured-claims-guards).
 *
 * Target family: confirmFirst · noActAfterAskSameTurn · destructiveThrottle · pendingConfirmMustAsk ·
 * askedEarlier — all now keyed on the structured ask signal (`respond` + `asked:true` = isAskEvent),
 * no `askUser` tool. Source: src/guards/confirmation.ts, src/guards/structural.ts,
 * src/runtime/claims.ts (isAskEvent), src/runtime/ledger.ts, src/runtime/turn.ts, src/runtime/terminal.ts.
 *
 * CONVENTION: every `it` asserts the SECURE expectation (the guard SHOULD deny / block). A test that
 * currently FAILS (red) is a proven BREAK — a forbidden act slips through today. A test that PASSES
 * (green) is a CLOSED vector kept as a regression. Findings + fixes: .superpowers/sdd/redteam-consent.md.
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
const histTurn = (turnIndex: number, asked: boolean): HistoryTurn => ({
  turnIndex, userText: '', reply: '', toolCalls: [], did: [], asked, attemptedCalls: [], guardEvents: [],
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
  it('probe {confirmed:false} (previews nothing) licenses transfer{to:attacker,amount:99999,confirmed:true}', () => {
    const g = confirmFirst(); // default flag 'confirmed', via 'either', within 1
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      observed: [obs('transfer', { confirmed: false }, 0)], // earlier-turn probe, previewed NO record
    });
    // SECURE: the confirmed act specifies to/amount the probe never previewed → the preview was NOT of
    // this record → must DENY. Today it returns null (licensed) — BREAK.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('probe {account:A} licenses a confirm that ADDS destructive fields (partial-record subset)', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'A', scope: 'EVERYTHING', confirmed: true }, // `scope` never previewed
      turnIndex: 1,
      observed: [obs('wipe', { account: 'A' }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull(); // BREAK: subset match licenses the un-previewed `scope`
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
      observed: [obs('respond', { message: 'Transfer from A? confirm', asked: true }, 0)],
    });
    expect(g.check(ctx)).toBeNull(); // legit: asked last turn → licensed
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 3 — pendingConfirmMustAsk: the GHOST ASK (same-turn observed-fallback)
//   Forbidden thing #3: a pending_confirmation turn returns null WITHOUT the turn actually asking,
//   by exploiting the observed-fallback over a respond{asked:true} the user NEVER RECEIVED.
//
//   ROOT CAUSE: `recordTerminalCall` pushes EVERY respond into `observed` at hook time. When the model
//   emits [destructiveProbe, respond{asked:true}] in ONE step, `prematureTerminalTools` invalidates the
//   reply (clearDeliveredTerminal wipes terminalReply/did/asked) — but does NOT remove the respond from
//   `observed`. `pruneSupersededTerminals` only drops within-step delivery-losers (needs 2 terminals in
//   one step), so this single-terminal premature respond is NEVER pruned. The forced-terminal fallback
//   then delivers a NON-ASK sign-off (asked:false). At onReply ctx.asked=false, but the ghost
//   respond{asked:true} still sits in observed → the observed-fallback fires → the pending confirmation
//   is summarized as DONE with no question ever delivered.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V3 — pendingConfirmMustAsk bypassed by a premature-invalidated (never-delivered) ghost ask', () => {
  it('UNIT: ctx.asked=false + a ghost respond{asked:true} in observed → guard ALLOWS (BREAK)', async () => {
    const g = pendingConfirmMustAsk();
    const ctx = baseCtx({
      turnIndex: 0,
      asked: false, // the DELIVERED respond is a non-ask sign-off
      observed: [
        obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }), // UNRESOLVED probe
        obs('respond', { message: 'Delete account X? Please confirm.', asked: true }, 0), // GHOST — invalidated, never delivered, never pruned
        obs('respond', { message: 'Done — account X deleted.', asked: false }, 0), // the delivered sign-off
      ],
    });
    // SECURE: nothing was actually asked this turn AND the probe is unresolved → MUST deny.
    // Today the observed-fallback sees the ghost asked:true → returns null. BREAK.
    expect(await g.check(ctx)).not.toBeNull();
  });

  it('INTEGRATED: finalizeReply delivers the false "deleted" sign-off — the pending confirm is dropped', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAcct'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', pendingConfirmMustAsk(), { id: 'agent:pending' });
    const ledger = createLedger();
    // Reconstruct the exact post-premature-clear + post-forced-terminal ledger state the mastra backend
    // produces (recordTerminalCall for BOTH responds; clearDeliveredTerminal wiped did/asked; prune
    // missed the single-terminal premature respond; forced-terminal delivered the asked:false sign-off).
    ledger.observed = [
      obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }),
      obs('respond', { message: 'Delete account X? Please confirm.', asked: true }, 0), // ghost
      obs('respond', { message: 'Done — account X deleted.', asked: false }, 0), // delivered
    ];
    ledger.did = [];
    ledger.asked = false;
    const initial: RespondPayload = { message: 'Done — account X deleted.', did: [], asked: false };
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, initial, async () => initial, 1);
    // SECURE: pendingConfirmMustAsk must fire → the false "deleted" reply must NOT be delivered clean.
    expect(out.violations).toContain('pendingConfirmMustAsk'); // today: [] → BREAK
  });

  it('CLOSED regression: with the ghost PRUNED from observed (what the backend SHOULD leave), guard denies', async () => {
    const g = pendingConfirmMustAsk();
    const ctx = baseCtx({
      turnIndex: 0,
      asked: false,
      observed: [
        obs('deleteAcct', { id: 'X' }, 0, { resultFlags: { requiresConfirmation: true } }),
        obs('respond', { message: 'Done — account X deleted.', asked: false }, 0), // ghost removed
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
    const ctx = baseCtx({ tool: 'refund', args: { id: '2' }, turnIndex: 0, siblingCallsThisStep: [obs('refund', { id: '1' }, 0)] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a PROBE (requiresConfirmation) does not count — the approved execute still passes', () => {
    const g = destructiveThrottle(['refund']);
    const ctx = baseCtx({ tool: 'refund', args: { id: '1', confirmed: true }, turnIndex: 0, observed: [obs('refund', { id: '1', confirmed: false }, 0, { resultFlags: { requiresConfirmation: true } })] });
    expect(g.check(ctx)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VECTOR 5 — askedEarlier: the GHOST ASK poisons the CROSS-TURN observed-fallback
//   Forbidden thing #5: a write licensed off an ask that never reached the user. history.asked is the
//   PRIMARY (verified-delivered) signal and is correctly FALSE here, but the guard ORs it with the
//   observed-scan fallback, which still sees the never-pruned ghost respond{asked:true} from turn 0.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('V5 — askedEarlier: fallback licenses a record off a never-delivered (ghost) earlier ask', () => {
  it('BREAK: history[0].asked=false but a ghost observed respond{asked:true} licenses the record', () => {
    const g = askedEarlier({ tool: 'setLimit', arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit',
      args: { limit: 5000 },
      turnIndex: 1,
      history: [histTurn(0, false)], // the DELIVERED turn 0 posed NO question (verified)
      observed: [obs('respond', { message: 'What limit? ', asked: true }, 0)], // ghost, never delivered, never pruned
    });
    // SECURE: the verified delivered signal says no ask happened → must DENY. The OR-fallback licenses. BREAK.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('BREAK (confirmFirst sibling): the same ghost ask cross-turn licenses a confirmed destructive act', () => {
    const g = confirmFirst(); // via 'either' → askLicensed reads the observed ask-event scan
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      history: [histTurn(0, false)],
      observed: [obs('respond', { message: 'Confirm? ', asked: true }, 0)], // ghost
    });
    expect(g.check(ctx)).not.toBeNull(); // BREAK: a confirmed transfer unlocked off an ask the user never saw
  });

  it('CLOSED regression: a genuine EARLIER-turn ask (delivered) correctly licenses', () => {
    const g = askedEarlier({ tool: 'setLimit', arg: 'limit' });
    const ctx = baseCtx({
      tool: 'setLimit', args: { limit: 5000 }, turnIndex: 1,
      history: [histTurn(0, true)], // delivered ask
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
  it('BREAK: a prior OK deleteAll run (turn 2) licenses another deleteAll (turn 3) with NO ask anywhere', () => {
    const g = confirmFirst({ via: 'ask' });
    const ctx = baseCtx({
      tool: 'deleteAll',
      args: {},
      turnIndex: 3,
      observed: [obs('deleteAll', {}, 2, { tookEffect: true })], // its OWN prior run — no ask event exists
    });
    // SECURE: a destructive flag-less repeat must be surfaced (asked) afresh → deny. Self-license = BREAK.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('BREAK: a SINGLE ask (turn 1) bridges the recency law — turn-3 delete is 2 turns from the ask yet licensed', () => {
    const g = confirmFirst({ via: 'ask' }); // within default 1
    const ctx = baseCtx({
      tool: 'deleteAll',
      args: {},
      turnIndex: 3,
      observed: [
        obs('respond', { message: 'Delete everything? confirm', asked: true }, 1), // the ONE ask, 2 turns ago
        obs('deleteAll', {}, 2, { tookEffect: true }), // turn-2 run, itself licensed by the ask (distance 1)
      ],
    });
    // The ask is at distance 2 (outside within=1) — it must NOT license turn 3. Only the turn-2 self-run
    // (distance 1) bridges it. SECURE expectation: deny. Today: null. BREAK — recency defeated.
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
