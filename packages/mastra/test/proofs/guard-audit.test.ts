/**
 * GUARD AUDIT — one proof per hole a guard must not reopen.
 *
 * Each block pins a way the guard layer can drift from what the BACKEND actually records, so an edit
 * that reopens the hole is attributed immediately.
 *
 * Three of them share one root cause worth stating once: `observed` carries runtime-owned terminal
 * calls, a vetoed attempt is still an `observed` entry, and a destructive tool need not carry a
 * confirm flag at all. Each drift turns a safety gate into a gate that vetoes HONEST replies.
 */
import { describe, expect, it } from 'vitest';
import {
  confirmFirst,
  consentRequired,
  destructiveThrottle,
  forbidThisTurn,
  jargonScrub,
  noDuplicateCall,
  pendingConfirmMustAsk,
  resultInvariant,
} from '@looprun-ai/core';
import { AgentSpecBase } from '@looprun-ai/core';
import type { Guard, ObservedCall } from '@looprun-ai/core';
import { craftCtx } from '@looprun-ai/core/testing';
import { pickRecord, runProofLoop } from '../../src/testing/index.js';

const call = (name: string, over: Partial<ObservedCall> = {}): ObservedCall => ({
  name,
  args: {},
  ok: true,
  turnIndex: 0,
  ...over,
});

// NOTE (no-regex law, 2026-08-02): the regex-param honesty guards audited here — noFalseFailureClaim,
// noUngroundedRegulatedFigure, destructiveClaimRequiresSuccess, noCompetitorClaim, noInstructionFromData,
// noOutOfSurfaceActionClaim, noFabricatedSuccess, minimalDisclosure — are DELETED (text judgment is
// llmCheck's job), so their audit blocks are gone. What remains audits the STRUCTURAL guards.

// ─────────────────────────────────────────────────────────────────────────────
// confirmFirst via:'ask': a VETOED attempt must not unlock the next turn (all STRUCTURAL)
// ─────────────────────────────────────────────────────────────────────────────
describe("confirmFirst({ via: 'ask' }) is SUCCESS-KEYED", () => {
  const guard = (): Guard => confirmFirst({ via: 'ask' });

  it('THE NEGATIVE PROOF: a turn-1 attempt VETOED BY THIS GUARD does not unlock turn 2', async () => {
    // The self-defeat: the guard denies purgeAll in turn 1, the backend records that veto as
    // {ok:false}, and pre-fix the very same record satisfied the "probed earlier" disjunct — so the
    // destructive action ran in turn 2 with the user never asked. Two turns to bypass the gate.
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('purgeAll', { ok: false, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await guard().check(ctx)).toBeTruthy();
  });

  it('a FAILED (not vetoed) earlier attempt likewise does not unlock', async () => {
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('purgeAll', { ok: false, turnIndex: 0 }), call('purgeAll', { ok: false, turnIndex: 1 })],
      turnIndex: 2,
    });
    expect(await guard().check(ctx)).toBeTruthy();
  });

  it('REGRESSION FLOOR: an earlier-turn ask intention still unlocks', async () => {
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('respond', { args: { message: 'Purge everything — are you sure?', did: [{ op: 'ask' }] }, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await guard().check(ctx)).toBeNull();
  });

  it('no-regex law: a prior-turn plain respond (no ask intention) does NOT unlock — only an ask event/probe do', async () => {
    // The former askRe disjunct is retired: a prose confirmation-ask no longer unlocks; the go-ahead must
    // be a STRUCTURAL ask event (a `respond` declaring an `ask` intention) or a same-tool probe. A plain respond that
    // merely phrases a question in its message is NOT an ask event, so this DENIES.
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('respond', { args: { message: 'This wipes every item — are you sure?' }, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await guard().check(ctx)).toBeTruthy();
  });

  it('REGRESSION FLOOR: an earlier-turn SUCCESSFUL call of the tool itself still unlocks', async () => {
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('purgeAll', { turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await guard().check(ctx)).toBeNull();
  });

  it('a same-turn ask event never unlocks (the noActAfterAskSameTurn seam is unchanged)', async () => {
    const ctx = craftCtx({ tool: 'purgeAll', observed: [call('respond', { args: { did: [{ op: 'ask' }] }, turnIndex: 1 })], turnIndex: 1 });
    expect(await guard().check(ctx)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// confirmFirst's string overload must reject a via name
// ─────────────────────────────────────────────────────────────────────────────
describe('confirmFirst rejects a via NAME passed as the string overload', () => {
  it("confirmFirst('ask') throws instead of building a permanently inert guard", () => {
    expect(() => confirmFirst('ask')).toThrow(/via/i);
  });

  it("confirmFirst('probe') throws for the same reason", () => {
    expect(() => confirmFirst('probe')).toThrow(/via/i);
  });

  it("confirmFirst('either') throws for the same reason", () => {
    expect(() => confirmFirst('either')).toThrow(/via/i);
  });

  it('the error names the correct object form so the fix is obvious', () => {
    expect(() => confirmFirst('ask')).toThrow(/confirmFirst\(\{ via: 'ask' \}\)/);
  });

  it('REGRESSION FLOOR: the legitimate string overload (an arg flag NAME) still works', async () => {
    const g = confirmFirst('userApproved');
    const ctx = craftCtx({ tool: 'deleteItem', args: { userApproved: true }, turnIndex: 1 });
    expect(await g.check(ctx)).toBeTruthy(); // no earlier probe → denied, i.e. the guard is LIVE
    const probed = craftCtx({
      tool: 'deleteItem',
      args: { userApproved: true },
      observed: [call('deleteItem', { args: {}, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await g.check(probed)).toBeNull();
  });

  it('REGRESSION FLOOR: the object form and the no-arg default are untouched', async () => {
    expect(() => confirmFirst()).not.toThrow();
    expect(() => confirmFirst({ via: 'ask' })).not.toThrow();
    expect(() => confirmFirst({ flag: 'confirmed' })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// destructiveThrottle must not count the PROBE, which would make an exemption dead code
// ─────────────────────────────────────────────────────────────────────────────
describe('destructiveThrottle does not count confirmation probes', () => {
  it('THE BUG: a probe (requiresConfirmation, ok:true) must not block the approved execute', async () => {
    const g = destructiveThrottle(['deleteItem']);
    const ctx = craftCtx({
      tool: 'deleteItem',
      args: { id: 'p001', confirmed: true },
      observed: [call('deleteItem', { args: { id: 'p001' }, resultFlags: { requiresConfirmation: true } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('an explicit confirmed:false probe likewise does not count', async () => {
    const g = destructiveThrottle(['deleteItem']);
    const ctx = craftCtx({
      tool: 'deleteItem',
      args: { id: 'p001', confirmed: true },
      observed: [call('deleteItem', { args: { id: 'p001', confirmed: false } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('REGRESSION FLOOR: a real prior EFFECT still throttles the second destructive call', async () => {
    const g = destructiveThrottle(['deleteItem', 'purgeAll']);
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('deleteItem', { args: { id: 'p001', confirmed: true } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('REGRESSION FLOOR: a flag-less destructive success still counts as an effect', async () => {
    const g = destructiveThrottle(['purgeAll', 'deleteItem']);
    const ctx = craftCtx({ tool: 'deleteItem', observed: [call('purgeAll')] });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it("pendingConfirmMustAsk's same-turn resolution exemption is reachable, not dead code", async () => {
    // The coherence claim, stated directly: the flow throttle used to block is exactly the flow
    // pendingConfirmMustAsk documents as legal. (Structural: the probe is RESOLVED by a same-record
    // confirmed:true, so the guard is silent regardless of any ask.)
    const g = pendingConfirmMustAsk();
    const ctx = craftCtx({
      observed: [
        call('deleteItem', { args: { id: 'p001' }, resultFlags: { requiresConfirmation: true } }),
        call('deleteItem', { args: { id: 'p001', confirmed: true } }),
      ],
      reply: 'The item was deleted.',
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('FULL FLOW (L3): probe → approved execute in one turn completes with no recovery events', async () => {
    // Turn 0 probes and asks. Turn 1 re-probes (satisfying nothing new) and then executes with
    // confirmed:true — the confirm gate is satisfied by turn 0's OK probe. Pre-fix the throttle vetoed
    // that execute (`run:destructiveThrottle:deleteItem`) because the turn-1 probe counted as an effect.
    const spec = new AgentSpecBase({
      id: 'audit-throttle',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: ['searchItem', 'deleteItem'],
      destructiveTools: ['deleteItem'],
    });
    const res = await runProofLoop(spec, {
      preset: 'seeded-media',
      turns: [{ userText: 'delete p001' }, { userText: 'yes, go ahead' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'respond', args: { message: 'Deleting p001 is permanent — are you sure?', did: [{ op: 'inform' }] } }],
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
        [{ tool: 'deleteItem', args: { id: 'p001', confirmed: true } }],
        [{ tool: 'respond', args: { message: 'Done — p001 is gone.', did: [{ op: 'inform' }] } }],
      ],
      expect: 'pass',
    });
    expect(res.errorMsg).toBeUndefined();
    const record = pickRecord(res, { preset: 'seeded-media', turns: [], script: [], expect: 'pass' });
    expect(record?.recoveryEvents ?? []).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jargonScrub must escape its keys — they are arbitrary domain strings
// ─────────────────────────────────────────────────────────────────────────────
describe('jargonScrub escapes its keys', () => {
  it('THE BUG: a key with regex metacharacters must not throw at construction', () => {
    expect(() => jargonScrub({ 'C++': 'C plus plus' })).not.toThrow();
    expect(() => jargonScrub({ '(beta)': 'preview' })).not.toThrow();
    expect(() => jargonScrub({ 'a*b': 'ab', 'x[1]': 'x one', 'q?': 'q' })).not.toThrow();
  });

  it('a metacharacter key is matched LITERALLY, never as a pattern', () => {
    const m = jargonScrub({ 'a.c': 'REPLACED' });
    const ctx = craftCtx({});
    expect(m.apply('abc and a.c', ctx)).toBe('abc and REPLACED');
  });

  it('REGRESSION FLOOR: ordinary word keys scrub as before (word-boundary, case-insensitive)', () => {
    const m = jargonScrub({ deprovision: 'retire' });
    const ctx = craftCtx({});
    expect(m.apply('We Deprovision it; deprovisioned stays.', ctx)).toBe('We retire it; deprovisioned stays.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// prose≠reason residue
// ─────────────────────────────────────────────────────────────────────────────
describe('resultInvariant and consentRequired no longer render `reason` as prose', () => {
  const accusation = 'You reported the summary, but the report came back empty — say what actually happened.';

  it('resultInvariant: prose is a RULE, not the deny text', () => {
    const g = resultInvariant(() => true, accusation);
    expect(g.prose()).not.toBe(accusation);
    expect(g.prose()).not.toMatch(/\byou (reported|described|claimed|said)\b/i);
  });

  it('resultInvariant: an explicit prose override wins', () => {
    const g = resultInvariant(() => true, accusation, 'report a summary only when the report has rows');
    expect(g.prose()).toBe('report a summary only when the report has rows');
  });

  it('consentRequired: prose is DERIVED from the tool list, not the deny text', () => {
    const reason = 'You sent that without consent on record — do not contact them again.';
    const g = consentRequired({ tools: ['sendEmail', 'storeProfile'], consentOk: () => true, reason });
    expect(g.prose()).not.toBe(reason);
    expect(g.prose()).toContain('sendEmail');
    expect(g.prose()).toContain('storeProfile');
  });

  it('consentRequired: an explicit prose override wins', () => {
    const g = consentRequired({
      tools: ['sendEmail'],
      consentOk: () => true,
      reason: 'no consent',
      prose: 'only email a contact who opted in',
    });
    expect(g.prose()).toBe('only email a contact who opted in');
  });

  it('REGRESSION FLOOR: `reason` is still the DENY text for both', async () => {
    const reason = 'no consent on record';
    const c = consentRequired({ tools: ['sendEmail'], consentOk: () => false, reason });
    expect(await c.check(craftCtx({ tool: 'sendEmail' }))).toBe(reason);
    const r = resultInvariant(() => false, 'invariant broken');
    expect(await r.check(craftCtx({ result: { rows: 0 } }))).toBe('invariant broken');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// proven prose↔check divergences
// ─────────────────────────────────────────────────────────────────────────────
describe('prose states what the check actually enforces', () => {
  it('(a) noDuplicateCall prose carries the TURN scope the check applies', async () => {
    const g = noDuplicateCall();
    expect(g.prose()).toMatch(/turn/i);
    // and the check really is turn-scoped: the same call in an EARLIER turn does not deny.
    const ctx = craftCtx({
      tool: 'searchItem',
      args: { q: 'a' },
      observed: [call('searchItem', { args: { q: 'a' }, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('(b) forbidThisTurn prose states an UNCONDITIONAL ban (the check has no repeat logic)', async () => {
    const g = forbidThisTurn('Not now — finish the current step first.');
    expect(g.prose()).not.toMatch(/\bagain\b/i);
    // the FIRST call is denied too — there is no turn/repeat logic in the check.
    expect(await g.check(craftCtx({ tool: 'updateItem', observed: [] }))).toBeTruthy();
  });
  // (c) replyMaxOccurrences is DELETED (tier-③ reply-text kind, SCG-T5) — its prose↔check divergence
  // audit is gone with the guard; CTA-repetition is now a text-judgment `llmCheck` job.
});
