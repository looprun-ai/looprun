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

// This audit covers the STRUCTURAL guards — the kinds that decide on structure, where a prose↔check
// divergence is a real defect. Text judgment is `llmCheck`'s job and is stated as a rubric, not audited
// against a pattern.

// ─────────────────────────────────────────────────────────────────────────────
// confirmFirst: nothing the AGENT produces is a licence (all STRUCTURAL)
// ─────────────────────────────────────────────────────────────────────────────
describe('confirmFirst is licensed only by a consent the user typed', () => {
  const oneStep = (): Guard => confirmFirst();

  it('a turn-1 attempt VETOED BY THIS GUARD does not unlock turn 2', async () => {
    // The self-defeat this rules out: the guard denies purgeAll in turn 1 and the backend records that
    // veto as {ok:false}. A record of the attempt is not a record of the user agreeing to it.
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('purgeAll', { ok: false, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await oneStep().check(ctx)).toBeTruthy();
  });

  it("an earlier-turn SUCCESSFUL call of the tool itself does not unlock", async () => {
    // Admitting this would let one consent carry an unbounded destructive run: turn 1 licenses turn 2,
    // turn 2's run licenses turn 3, and so on.
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('purgeAll', { ok: true, tookEffect: true, turnIndex: 0 })],
      turnIndex: 1,
    });
    expect(await oneStep().check(ctx)).toBeTruthy();
  });

  it('a prior-turn respond declaring an ask does not unlock', async () => {
    const ctx = craftCtx({
      tool: 'purgeAll',
      history: [{ turnIndex: 0, userText: 'purge', reply: 'Purge everything?', toolCalls: [], did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [] }],
      turnIndex: 1,
    });
    expect(await oneStep().check(ctx)).toBeTruthy();
  });

  it('the consumed token for THIS act unlocks it', async () => {
    const ctx = craftCtx({
      tool: 'purgeAll',
      consent: [{ tool: 'purgeAll', meaning: 'purge every item', token: 'CONFIRM PURGE-EVERY', issuedTurn: 0, consumedTurn: 1 }],
      turnIndex: 1,
    });
    expect(await oneStep().check(ctx)).toBeNull();
  });

  it('gates only the ACT — a schema-licensed simulation runs so the world can raise the question', async () => {
    const g = confirmFirst();
    const sim = new Set(['deleteItem']);
    expect(await g.check(craftCtx({ tool: 'deleteItem', args: { id: 'x1', simulate: true }, simulatableTools: sim, turnIndex: 1 }))).toBeNull();
    expect(await g.check(craftCtx({ tool: 'deleteItem', args: { id: 'x1' }, simulatableTools: sim, turnIndex: 1 }))).toBeTruthy();
  });

  it('a simulate on a tool whose schema has none is an act — the args cannot license the bypass', async () => {
    const g = confirmFirst();
    expect(await g.check(craftCtx({ tool: 'deleteItem', args: { id: 'x1', simulate: true }, turnIndex: 1 }))).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// destructiveThrottle must not count the SIMULATE, which would make an exemption dead code
// ─────────────────────────────────────────────────────────────────────────────
describe('destructiveThrottle does not count confirmation simulations', () => {
  // A simulate is a call the world RECORDED as having changed nothing (`tookEffect:false`), which is
  // what every backend with a world action history writes. An UNRECORDED call is unverified, not effect-free.
  it('THE BUG: a simulate (requiresConfirmation, ok:true) must not block the approved execute', async () => {
    const g = destructiveThrottle(['deleteItem']);
    const ctx = craftCtx({
      tool: 'deleteItem',
      args: { id: 'p001' },
      observed: [call('deleteItem', { args: { id: 'p001', simulate: true }, tookEffect: false, resultFlags: { requiresConfirmation: true } })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('an explicit simulate:true call that changed nothing likewise does not count', async () => {
    const g = destructiveThrottle(['deleteItem']);
    const ctx = craftCtx({
      tool: 'deleteItem',
      args: { id: 'p001' },
      observed: [call('deleteItem', { args: { id: 'p001', simulate: true }, tookEffect: false })],
    });
    expect(await g.check(ctx)).toBeNull();
  });

  it('a simulate:true call with UNKNOWN effect DOES count — fail closed', async () => {
    const g = destructiveThrottle(['deleteItem']);
    const ctx = craftCtx({
      tool: 'deleteItem',
      args: { id: 'p002', simulate: true },
      observed: [call('deleteItem', { args: { id: 'p001', simulate: true } })], // no world record
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('REGRESSION FLOOR: a real prior EFFECT still throttles the second destructive call', async () => {
    const g = destructiveThrottle(['deleteItem', 'purgeAll']);
    const ctx = craftCtx({
      tool: 'purgeAll',
      observed: [call('deleteItem', { args: { id: 'p001' } })],
    });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('REGRESSION FLOOR: a flag-less destructive success still counts as an effect', async () => {
    const g = destructiveThrottle(['purgeAll', 'deleteItem']);
    const ctx = craftCtx({ tool: 'deleteItem', observed: [call('purgeAll')] });
    expect(await g.check(ctx)).toBeTruthy();
  });

  it('FULL FLOW (L3): simulate → approved execute in one turn completes with no recovery events', async () => {
    // Turn 0 simulates: the world answers "I need confirmation on p001" and the engine renders the
    // question. Turn 1 carries the code the user typed, re-simulates (which changes nothing) and then
    // executes. The re-simulation must not count against the one-destructive-action-per-turn cap.
    const spec = new AgentSpecBase({
      id: 'audit-throttle',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: ['searchItem', 'deleteItem'],
      destructiveTools: ['deleteItem'],
    });
    const res = await runProofLoop(spec, {
      preset: 'seeded-media',
      turns: [{ userText: 'delete p001' }, { userText: '{{CODE1}}' }],
      script: [
        [{ tool: 'deleteItem', args: { id: 'p001', simulate: true } }],
        [{ tool: 'respond', args: { message: 'Deleting p001 is permanent — are you sure?', did: [{ op: 'inform' }] } }],
        [{ tool: 'deleteItem', args: { id: 'p001', simulate: true } }],
        [{ tool: 'deleteItem', args: { id: 'p001' } }],
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
    expect(() => jargonScrub({ '(beta)': 'early access' })).not.toThrow();
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
describe('resultInvariant and consentRequired do not render `reason` as prose', () => {
  const accusation = 'You reported the summary, but the report came back empty — say what actually happened.';

  it('resultInvariant: prose is a RULE, not the deny text', () => {
    const g = resultInvariant(() => true, accusation);
    expect(g.prose()).not.toBe(accusation);
    expect(g.prose()).not.toMatch(/\byou (reported|described|claimed|said)\b/i);
  });

  it('resultInvariant: an explicit prose override wins', () => {
    const g = resultInvariant(() => true, accusation, { prose: 'report a summary only when the report has rows' });
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
});
