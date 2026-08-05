/**
 * RED-TEAM ROUND 2 — the ASK-GHOST + CONSENT cluster on the MANDATORY-INTENTION surface.
 *
 * `redteam-consent.test.ts` covers the premature-terminal ghost ask, closed by making the SEALED
 * `HistoryTurn.did` authoritative for its own turn and wiring `prematureTerminalCalls` +
 * `pruneSupersededTerminals` into both mastra loops. This file attacks what is LEFT: every remaining
 * route by which
 *   (a) a consent-gated act is licensed by a question the user never received  (FALSE-ALLOW — severe), or
 *   (b) a delivered question fails to license a legitimate act                 (FALSE-DENY).
 *
 * CONVENTION (binding): every `it` asserts the SECURE expectation. A vector whose
 * fix has not landed is a proven BREAK marked `it.fails(...)`; a plain `it` is a CLOSED regression. When a
 * fix lands the `it.fails` starts failing, forcing the flip to a plain `it` — that flip IS the acceptance.
 *
 * Findings + fix specifications: .superpowers/sdd/2026-08-03-mandatory-intention/redteam-r2-c.md
 * End-to-end (real mastra loop) siblings: packages/mastra/test/redteam-r2-consent-l3.test.ts
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, confirmFirst, askedEarlier } from '../../src/index.js';
import type { AgentWorld, GuardCtx, DomainContract, ObservedCall, HistoryTurn } from '../../src/index.js';
import { DEFAULT_ENGINE_TEXT } from '../../src/runtime/engine-text.js';
import { createLedger, recordTurnHistory } from '../../src/runtime/ledger.js';
import { finalizeReply } from '../../src/runtime/turn.js';
import { hasAskIntent } from '../../src/runtime/claims.js';
import type { RespondPayload } from '../../src/runtime/claims.js';

const persona = 'You are the test agent.';
const CONTRACT: DomainContract = {
  voice: 'v',
  stateBlock: () => '',
  coreInvariants: ['x'],
  languageClause: 'lang',
  writeTools: ['deleteAcct'],
};

function world(): AgentWorld {
  return { exec: () => ({ success: true }), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}
const baseCtx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  args: {}, world: world(), observed: [], turnIndex: 0, userText: '', history: [], ...over,
});
const obs = (name: string, args: Record<string, unknown>, turnIndex: number, extra: Partial<ObservedCall> = {}): ObservedCall => ({
  name, args, ok: true, turnIndex, ...extra,
});
/** A SEALED turn. `reply` is the text the user ACTUALLY received — an ask over a BLANK reply licenses
 *  nothing, so a fixture that means "we asked" must carry the question. */
const histTurn = (turnIndex: number, did: HistoryTurn['did'], reply = ''): HistoryTurn => ({
  turnIndex, userText: '', reply, toolCalls: [], did, attemptedCalls: [], guardEvents: [],
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C1 — THE REDRIVE DESYNC GHOST  (new; the engine ITSELF manufactures the ghost)
//
//   finalizeReply's redrive loop adopts the re-generated payload's `did` UNCONDITIONALLY but keeps the
//   PREVIOUS `message` when the re-generation returned a blank one:
//       const message = next.message.trim() ? applyMutators(...) : payload.message;
//       payload = { message, did: next.did };
//   So a redrive that answers `{ message: '', did: [{op:'ask'}] }` produces a payload whose DELIVERED
//   text is the OLD, pre-correction message (which poses no question at all) while the turn's verified
//   `did` — the record `recordTurnHistory` SEALS, and therefore the ONE authoritative cross-turn ask
//   signal (`askedInDeliveredTurn`'s history arm) — declares that the agent ASKED.
//
//   The premature-terminal prune does not reach this: it is not an undelivered `respond` in `observed`
//   that a prune could remove. It is the SEALED history record itself, so it is authoritative BY
//   CONSTRUCTION and every consent guard believes it.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('C1 — redrive message/did desync manufactures a sealed ask the user never received', () => {
  /** The exact attack shape: the initial payload violates claimIsGrounded, and the redrive answers with a
   *  blank message carrying an `ask` intention — so an engine that kept the previous message while adopting
   *  the new `did` would seal an ask the user never received. */
  async function runDesync(): Promise<{ text: string; did: HistoryTurn['did'] }> {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAcct'], contract: CONTRACT });
    const ledger = createLedger();
    // Nothing ran this turn — the initial declaration of a completed deletion is ungrounded.
    const initial: RespondPayload = { message: 'Done — account X has been deleted.', did: [{ op: 'delete', target: 'X', outcome: 'success' }] };
    const out = await finalizeReply(
      spec, CONTRACT, world(), ledger, initial,
      // The corrected re-generation: the model drops the false claim but puts NOTHING in `message`
      // (it declares the turn as a question in `did` alone).
      async () => ({ message: '', did: [{ op: 'ask' }] }),
      1,
    );
    recordTurnHistory(ledger, out.text, world());
    return { text: out.text, did: ledger.history[0]!.did };
  }

  it('CLOSED: the blank re-generation is REJECTED WHOLE — no phantom ask, no stale sentence', async () => {
    const { text, did } = await runDesync();
    // The engine does not splice the new `did` onto the pre-redrive message. The whole re-generation is
    // dropped, the turn exhausts, and the delivered text is the engine-derived closure — so the
    // uncorrected "deleted" sentence is NOT delivered either.
    expect(text).not.toContain('Done — account X has been deleted.');
    // SECURE: the engine must never seal an ask it did not deliver.
    expect(hasAskIntent(did)).toBe(false);
  });

  it('CLOSED: no licence is manufactured — a confirmed destructive act next turn is denied', async () => {
    const { did } = await runDesync();
    const g = confirmFirst(); // default flag 'confirmed', via 'either', within 1
    const ctx = baseCtx({
      tool: 'deleteAcct',
      args: { id: 'X', confirmed: true },
      turnIndex: 1,
      history: [histTurn(0, did, 'Done — account X has been deleted.')], // the sealed turn 0
      observed: [],
    });
    // SECURE: no question ever reached the user, so `confirmed:true` is denied.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: a redrive that DOES deliver its own message keeps message and did in sync', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAcct'], contract: CONTRACT });
    const ledger = createLedger();
    const initial: RespondPayload = { message: 'Done — account X has been deleted.', did: [{ op: 'delete', target: 'X', outcome: 'success' }] };
    const out = await finalizeReply(
      spec, CONTRACT, world(), ledger, initial,
      async () => ({ message: 'Delete account X — are you sure?', did: [{ op: 'ask' }] }),
      1,
    );
    // The delivered text IS the question, so sealing the ask is honest.
    expect(out.text).toBe('Delete account X — are you sure?\n\nNo operation was carried out on this turn.');
    expect(hasAskIntent(out.did)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C2 — (round-1 V1, STILL OPEN, mine to close) confirmFirst probe→confirm binding is a SUBSET
//
//   isMatchingProbe requires only that the PROBE's non-flag args are a SUBSET of the confirm's:
//       Object.keys(obs.args).filter(k => k !== flag).every(k => obs.args[k] === ctx.args[k])
//   `.every` over an EMPTY key set is vacuously true, so a probe that previewed NOTHING (or previewed a
//   strictly smaller record) licenses a `confirmed:true` call carrying any destructive parameter the
//   user never saw. The preview and the executed act are then different acts.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('C2 (V1) — a partial/empty probe licenses ANY confirmed destructive act', () => {
  it('CLOSED: probe {confirmed:false} does NOT license transfer{to:attacker,amount:99999,confirmed:true}', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'transfer',
      args: { to: 'attacker', amount: 99999, confirmed: true },
      turnIndex: 1,
      observed: [obs('transfer', { confirmed: false }, 0)], // previewed NOTHING
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: probe {account:A} does NOT license a confirm that ADDS scope:EVERYTHING', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'A', scope: 'EVERYTHING', confirmed: true },
      turnIndex: 1,
      observed: [obs('wipe', { account: 'A', confirmed: false }, 0)], // previewed a strictly SMALLER record
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: a confirm that DROPS an arg the probe carried is already denied', () => {
    // The reverse direction: `.every` walks the PROBE's keys, and `obs.args.scope !== ctx.args.scope`
    // (undefined) catches it. Pinned so the set-EQUALITY fix cannot regress the check it DOES make.
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'A', confirmed: true },
      turnIndex: 1,
      observed: [obs('wipe', { account: 'A', scope: 'ONE', confirmed: false }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: the token the user typed for this record licenses it — the legit two-step', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'A', scope: 'ONE', confirmed: true },
      turnIndex: 1,
      consent: [{ tool: 'wipe', subject: 'A', meaning: 'A', token: 'CONFIRM A', issuedTurn: 0, consumedTurn: 1 }],
    });
    expect(g.check(ctx)).toBeNull();
  });

  it('CLOSED regression: a DIFFERENT discriminating value does not license', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'wipe',
      args: { account: 'B', confirmed: true },
      turnIndex: 1,
      observed: [obs('wipe', { account: 'A', confirmed: false }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C3 — (round-1 V6, STILL OPEN, mine to close) via:'ask' accepts the tool's OWN prior OK run
//
//   `surfacedRecently = askedInDeliveredTurn(...) || observed.some(o.ok && o.name === ctx.tool && recent)`
//   The second arm makes a SUCCESSFUL prior run of the destructive tool itself count as "the action was
//   surfaced". Chained turn by turn, one ask at turn 1 licenses turn 2, whose run licenses turn 3, … —
//   an unbounded destructive run off a single consent, and the recency law (`within`) is bridged.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('C3 (V6) — via:ask self-licenses its own repeat', () => {
  it('CLOSED: a prior OK deleteAll (turn 2) does NOT license deleteAll (turn 3)', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({ tool: 'deleteAll', args: {}, turnIndex: 3, observed: [obs('deleteAll', {}, 2, { tookEffect: true })] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: ONE ask at turn 1 does NOT bridge the recency law out to turn 3', () => {
    const g = confirmFirst({ flag: false }); // within = 1
    const ctx = baseCtx({
      tool: 'deleteAll', args: {}, turnIndex: 3,
      history: [histTurn(1, [{ op: 'ask' }], 'Delete everything?'), histTurn(2, [{ op: 'deleteAll', outcome: 'success' }], 'Deleted.')],
      observed: [obs('deleteAll', {}, 2, { tookEffect: true })],
    });
    // The ask is 2 turns back (outside within:1); only the turn-2 self-run bridges it. SECURE: deny.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: the chain is BROKEN — turn 9 is not licensed by turn 8', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({
      tool: 'deleteAll', args: {}, turnIndex: 9,
      history: [histTurn(1, [{ op: 'ask' }], 'Delete everything?')],
      observed: [obs('respond', { message: 'Delete everything?', did: [{ op: 'ask' }] }, 1), obs('deleteAll', {}, 8, { tookEffect: true })],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: a vetoed (ok:false) prior attempt does not self-license', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({ tool: 'deleteAll', args: {}, turnIndex: 3, observed: [obs('deleteAll', {}, 2, { ok: false })] });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: the legit shape (question at turn 1 → token at turn 2) is still licensed', () => {
    const g = confirmFirst({ flag: false });
    const ctx = baseCtx({
      tool: 'deleteAll', args: {}, turnIndex: 2,
      consent: [{ tool: 'deleteAll', meaning: 'delete everything', token: 'CONFIRM DELETE-EVERYTHING', issuedTurn: 1, consumedTurn: 2 }],
    });
    expect(g.check(ctx)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C4 — the UNSEALED-TURN window in askedInDeliveredTurn's observed fallback
//
//   `askedInDeliveredTurn` has no `observed` fallback for turns NOT in history. Such a fallback would
//   rest on every backend sealing every turn, which is not something the guard can verify. Consent
//   evidence is a DELIVERED TURN RECORD or it does not exist, so an unsealed turn fails CLOSED. These
//   pin the MECHANISM; the end-to-end proof (and the stream-sealing that keeps the licence available)
//   is in the L3 sibling file.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('C4 — an UNSEALED earlier turn re-opens the raw observed ask scan', () => {
  it('CLOSED: with turn 0 unsealed, a raw observed ask-intent respond licenses NOTHING', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'deleteAcct',
      args: { id: 'X', confirmed: true },
      turnIndex: 1,
      history: [], // turn 0 was never sealed
      observed: [obs('respond', { message: '', did: [{ op: 'ask' }] }, 0)], // a respond the user never received
    });
    // SECURE: consent evidence must come from a DELIVERED turn record, never from a raw hook-time push.
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED: askedEarlier does not license an operator-value write off the unsealed ghost', () => {
    const g = askedEarlier({ tool: 'record', arg: 'value' });
    const ctx = baseCtx({
      tool: 'record',
      args: { value: '42' },
      turnIndex: 1,
      history: [],
      observed: [obs('respond', { message: '', did: [{ op: 'ask' }] }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED regression: once turn 0 IS sealed with a non-ask did, the same observed ghost is ignored', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'deleteAcct',
      args: { id: 'X', confirmed: true },
      turnIndex: 1,
      history: [histTurn(0, [{ op: 'inform' }])],
      observed: [obs('respond', { message: '', did: [{ op: 'ask' }] }, 0)],
    });
    expect(g.check(ctx)).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C5 — the `ask` INTENTION is SELF-DECLARED and never bound to the delivered message
//
//   Asking is a declaration (`did` carries `{op:'ask'}`) and the no-regex law admits no reply-text
//   check. Nothing deterministic connects the declaration to the message: a turn may declare `ask`
//   while `message` poses no question at all — and that declaration is what `askedInDeliveredTurn`
//   reads as "the user was asked".
//
//   STATUS — CLOSED. What licenses a destructive act is a token the ENGINE issued for a record and the
//   USER typed back, so a declaration is never evidence and the question of whether the agent's own
//   message poses a question never arises: the question the user answers is one the engine wrote.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('C5 — a declared ask licenses nothing, whatever its message says', () => {
  it('CLOSED: a sealed ask over a BLANK delivered reply licenses nothing', () => {
    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'deleteAcct', args: { id: 'X', confirmed: true }, turnIndex: 1,
      history: [histTurn(0, [{ op: 'ask' }], '\u200b \u3164\u2063')], // declared an ask, delivered nothing
    });
    expect(g.check(ctx)).not.toBeNull();
  });





  it('a sealed turn declaring ask over a pure sign-off message licenses NOTHING', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAcct'], contract: CONTRACT });
    const ledger = createLedger();
    // A clean, violation-free turn: a speech-only declaration is never ledger-grounded.
    const initial: RespondPayload = { message: 'All set. Have a good day.', did: [{ op: 'ask' }] };
    const out = await finalizeReply(spec, CONTRACT, world(), ledger, initial, async () => initial, 1);
    recordTurnHistory(ledger, out.text, world());
    expect(out.violations).toEqual([]);
    expect(out.text).toBe(`All set. Have a good day.\n\n${DEFAULT_ENGINE_TEXT.recordClosureNone}`);

    const g = confirmFirst();
    const ctx = baseCtx({
      tool: 'deleteAcct', args: { id: 'X', confirmed: true }, turnIndex: 1,
      history: [...ledger.history],
    });
    // SECURE: a licence must rest on a question the user could answer, not on a self-issued label.
    expect(g.check(ctx)).not.toBeNull();
  });
});
