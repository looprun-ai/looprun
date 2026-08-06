/**
 * RED-TEAM SHAPE — adversarial proof-by-construction against the VALUE-SHAPE guards, the structured
 * respond surface (validateClaims / respondPayload), and the runtime composition (premature-terminal
 * invalidation, superseded-terminal pruning, redrive snapshot/restore, blank-delivery floor, the
 * did → operation-report renderer + honesty cross-check).
 *
 * Convention:
 *   - a `.toBeNull()` on a should-be-DENIED ctx = a CONFIRMED BREAK (the guard allowed a forbidden thing).
 *   - a `.not.toBeNull()` / a rejected-shape assertion = the guard HOLDS.
 * Each `it` is labelled BREAK / CLOSED / DOCUMENTED. Throwaway; not committed; does not modify source.
 */
import { describe, expect, it } from 'vitest';
import {
  argRequired,
  argAbsent,
  argFormat,
  noDuplicateCall,
  maxCalls,
  confirmFirst,
  destructiveThrottle,
  claimIsGrounded,
  claimIsComplete,
} from '../../src/guards/index.js';
import {
  validateClaims,
  respondPayload,
  renderOperationReport,
  isAskEvent,
  hasAskIntent,
} from '../../src/runtime/claims.js';
import {
  createActionHistory,
  beginTurn,
  recordTerminalCall,
  recordTerminal,
  clearDeliveredTerminal,
  pruneSupersededTerminals,
} from '../../src/runtime/action-history.js';
import { prematureTerminalCalls, prematureTerminalTools, supersededTerminalCalls } from '../../src/runtime/terminal.js';
import { finalizeReply } from '../../src/runtime/turn.js';
import { isBlankDelivery } from '../../src/runtime/claims.js';
import { AgentSpecBase } from '../../src/index.js';
import type { AgentWorld, GuardCtx, ObservedCall } from '../../src/index.js';
import type { RespondPayload } from '../../src/runtime/claims.js';

// ── shared fixtures ──────────────────────────────────────────────────────────
function world(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}
const base = (over: Partial<GuardCtx>): GuardCtx => ({
  args: {}, world: world(), observed: [], turnIndex: 0, userText: '', history: [], ...over,
});
const oc = (over: Partial<ObservedCall>): ObservedCall => ({ name: 'x', args: {}, ok: true, turnIndex: 0, ...over });

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — EVERY VALUE-SHAPE VECTOR AGAINST argRequired / argAbsent / argFormat
// These attack the guards with typeof/trim guesses and pin the CURRENT verdict, so any silent
// regression in the guard surface is caught. A "DOCUMENTED GAP" case is an accepted design gap: these
// are container/type-agnostic field guards.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 0 — value-shape vectors', () => {
  describe('argRequired', () => {
    const g = argRequired('title');
    it('HOLDS: missing/empty/blank/null/undefined all denied', () => {
      expect(g.check(base({ args: {} }))).not.toBeNull();
      expect(g.check(base({ args: { title: '' } }))).not.toBeNull();
      expect(g.check(base({ args: { title: '   ' } }))).not.toBeNull();
      expect(g.check(base({ args: { title: null } }))).not.toBeNull();
      expect(g.check(base({ args: { title: undefined } }))).not.toBeNull();
    });
    it('DOCUMENTED GAP still reproduces: [] , {} , zero-width, 0, false all PASS a required-field gate', () => {
      expect(g.check(base({ args: { title: [] } }))).toBeNull();
      expect(g.check(base({ args: { title: {} } }))).toBeNull();
      expect(g.check(base({ args: { title: '​' } }))).toBeNull(); // trim() does not strip U+200B
      expect(g.check(base({ args: { title: 0 } }))).toBeNull();
      expect(g.check(base({ args: { title: false } }))).toBeNull();
    });
  });

  describe('argAbsent', () => {
    const g = argAbsent('secret');
    it('HOLDS: a real value / empty string / 0 / false are all PRESENT → denied', () => {
      expect(g.check(base({ args: { secret: 'x' } }))).not.toBeNull();
      expect(g.check(base({ args: { secret: '' } }))).not.toBeNull();
      expect(g.check(base({ args: { secret: 0 } }))).not.toBeNull();
      expect(g.check(base({ args: { secret: false } }))).not.toBeNull();
    });
    it('DOCUMENTED GAP still reproduces: key present as null/undefined BYPASSES (!= null is false)', () => {
      expect(g.check(base({ args: { secret: null } }))).toBeNull();
      expect(g.check(base({ args: { secret: undefined } }))).toBeNull();
    });
  });

  describe('argFormat', () => {
    const g = argFormat('id', '^[0-9]+$');
    it('HOLDS: string values are validated (malformed denied, well-formed allowed)', () => {
      expect(g.check(base({ args: { id: 'abc' } }))).not.toBeNull();
      expect(g.check(base({ args: { id: '123' } }))).toBeNull();
    });
    it('DOCUMENTED GAP still reproduces: a NON-STRING value entirely bypasses format validation', () => {
      expect(g.check(base({ args: { id: 12.5 } }))).toBeNull();            // number
      expect(g.check(base({ args: { id: ['drop table'] } }))).toBeNull();  // array
      expect(g.check(base({ args: { id: { $ne: null } } }))).toBeNull();   // object (NoSQL-injection shape)
    });
    it('DOCUMENTED GAP still reproduces: an UNANCHORED author pattern matches a substring', () => {
      const gu = argFormat('id', '[0-9]+');
      expect(gu.check(base({ args: { id: '1; DROP TABLE users' } }))).toBeNull();
    });
  });

  describe('noDuplicateCall / maxCalls — counting still ok-filtered + turn-scoped', () => {
    it('HOLDS: key-order-independent dup denied; failed prior does not block retry', () => {
      const g = noDuplicateCall();
      const prior = oc({ name: 'save', args: { a: 1, b: 2 }, turnIndex: 0 });
      expect(g.check(base({ tool: 'save', args: { b: 2, a: 1 }, observed: [prior], turnIndex: 0 }))).not.toBeNull();
      const failed = oc({ name: 'save', args: { a: 1 }, ok: false, turnIndex: 0 });
      expect(g.check(base({ tool: 'save', args: { a: 1 }, observed: [failed], turnIndex: 0 }))).toBeNull();
    });
    it('DOCUMENTED GAP still reproduces: only OK calls count — N failed calls never trip maxCalls', () => {
      const g = maxCalls('bulk', 1, 'cap');
      const fails = [oc({ name: 'bulk', ok: false }), oc({ name: 'bulk', ok: false }), oc({ name: 'bulk', ok: false })];
      expect(g.check(base({ tool: 'bulk', observed: fails, turnIndex: 0 }))).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — validateClaims STRICT SHAPE (forbidden #1):
// prototype pollution, Symbol keys, coercible outcome, NaN/Infinity amount, deeply-nested did.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 1 — validateClaims strict shape (forbidden #1)', () => {
  it('CLOSED prototype-pollution: an own "__proto__" key is caught as an unknown key (not applied)', () => {
    // JSON.parse creates an OWN enumerable __proto__ property (a literal would set the prototype instead).
    const did = JSON.parse('[{"op":"x","outcome":"success","__proto__":{"polluted":true}}]');
    const { claims, errors } = validateClaims(did);
    expect(claims).toEqual([]);
    expect(errors.some((e) => e.includes('unknown key "__proto__"'))).toBe(true);
    // and the global prototype was never polluted by the mere act of validating
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('CLOSED constructor/prototype keys: "constructor"/"prototype" are unknown keys → rejected', () => {
    const did = JSON.parse('[{"op":"x","outcome":"success","constructor":1,"prototype":2}]');
    const { claims, errors } = validateClaims(did);
    expect(claims).toEqual([]);
    expect(errors.filter((e) => e.includes('unknown key')).length).toBe(2);
  });
  it('CLOSED coercible outcome: outcome as a NUMBER (Object-coerces to "5") is rejected — not a string', () => {
    const { claims, errors } = validateClaims([{ op: 'refund', outcome: 5 }]);
    expect(claims).toEqual([]);
    expect(errors.some((e) => e.includes('outcome must be a non-empty string'))).toBe(true);
  });
  it('CLOSED op-as-object: an object op ({toString}) that would coerce is rejected', () => {
    const { claims } = validateClaims([{ op: { toString: () => 'evil' }, outcome: 'success' }]);
    expect(claims).toEqual([]);
  });
  it('CLOSED amount NaN/Infinity: rejected (Number.isFinite gate)', () => {
    expect(validateClaims([{ op: 'x', outcome: 'success', amount: NaN }]).claims).toEqual([]);
    expect(validateClaims([{ op: 'x', outcome: 'success', amount: Infinity }]).claims).toEqual([]);
    expect(validateClaims([{ op: 'x', outcome: 'success', amount: -Infinity }]).claims).toEqual([]);
    // a finite value (incl. -0) survives
    expect(validateClaims([{ op: 'x', outcome: 'success', amount: -0 }]).claims.length).toBe(1);
  });
  it('CLOSED extra-key smuggle: an unknown scalar key on a claim is rejected, never carried into the claim', () => {
    const { claims, errors } = validateClaims([{ op: 'x', outcome: 'success', injected: 'sneaky' }]);
    expect(claims).toEqual([]);
    expect(errors.some((e) => e.includes('unknown key "injected"'))).toBe(true);
  });
  it('DOCUMENTED (harmless): a SYMBOL key evades the unknown-key scan (Object.keys ignores symbols) but is DROPPED — the rebuilt claim carries only op/outcome', () => {
    const sym = Symbol('x');
    const item: Record<string | symbol, unknown> = { op: 'refund', outcome: 'success', [sym]: 'ignored' };
    const { claims, errors } = validateClaims([item]);
    expect(errors).toEqual([]);                     // symbol not seen as an unknown key
    expect(claims).toEqual([{ op: 'refund', outcome: 'success' }]); // rebuilt from known fields ONLY → symbol gone
    expect(Object.getOwnPropertySymbols(claims[0]!).length).toBe(0);
  });
  it('CLOSED nested did: a claim whose value is itself an array/object where a string is required is rejected', () => {
    expect(validateClaims([{ op: 'x', outcome: 'success', target: ['a'] }]).claims).toEqual([]);
    expect(validateClaims([[{ op: 'x', outcome: 'success' }]]).claims).toEqual([]); // did[i] is an array → not an object
  });
  it('CLOSED downstream safety: every survivor is a real {op,outcome} — renderer never NPEs on a claim field', () => {
    const { claims } = validateClaims([{ op: 'x', outcome: 'success', target: 't' }]);
    expect(() => renderOperationReport(claims)).not.toThrow();
  });
  it('CLOSED: an EMPTY did is rejected — there is no undeclared turn', () => {
    const { claims, errors } = validateClaims([]);
    expect(claims).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });
  it('CLOSED: a speech op smuggling an outcome/amount is rejected (a speech act is not grounded)', () => {
    expect(validateClaims([{ op: 'inform', outcome: 'success' }]).claims).toEqual([]);
    expect(validateClaims([{ op: 'ask', outcome: 'success' }]).claims).toEqual([]);
    expect(validateClaims([{ op: 'greet', amount: 9999 }]).claims).toEqual([]);
  });
  it('CLOSED: an action op with NO outcome is rejected (an operation always reports honestly)', () => {
    expect(validateClaims([{ op: 'refund', target: 'BK5' }]).claims).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — respondPayload TOLERANT extraction (forbidden #3). It only ever DEGRADES
// (never fabricates a FAVORABLE payload): a bad did → [], a bad message → ''; a bare `asked` arg
// never reaches the payload (asking is an `ask` intention).
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 2 — respondPayload extraction (forbidden #3)', () => {
  it('CLOSED did-not-array: a string/object/number did degrades to [] (no fabricated claim survives)', () => {
    expect(respondPayload({ message: 'hi', did: 'not-an-array' }).did).toEqual([]);
    expect(respondPayload({ message: 'hi', did: { op: 'x', outcome: 'success' } }).did).toEqual([]);
    expect(respondPayload({ message: 'hi', did: 7 }).did).toEqual([]);
  });
  it('CLOSED message-not-string: a numeric/object message degrades to "" (never Object-coerced)', () => {
    expect(respondPayload({ message: 42, did: [] }).message).toBe('');
    expect(respondPayload({ message: { toString: () => 'evil' }, did: [] }).message).toBe('');
  });
  it('CLOSED: no value of a bare `asked` arg reaches the payload or reads as an ask', () => {
    for (const v of [1, 'yes', 'true', {}, [], 'false', true]) {
      const p = respondPayload({ message: 'x', did: [], asked: v });
      expect('asked' in p).toBe(false);
      expect(isAskEvent({ name: 'respond', args: { message: 'x', did: [], asked: v } })).toBe(false);
    }
  });
  it('CLOSED partial did: the well-formed subset survives, malformed entries are dropped (favorable claim NOT smuggled)', () => {
    const p = respondPayload({ message: 'x', did: [{ op: 'good', outcome: 'success' }, { op: 'bad', outcome: 5 }] });
    expect(p.did).toEqual([{ op: 'good', outcome: 'success' }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — REDRIVE snapshot/restore: does a rejected candidate leak? (forbidden #4)
// did/asked/observed are restored; turnCorrections is NOT (T6 flag). Prove it is telemetry-only:
// NO guard in the surface reads ctx.notes, so a leaked correction cannot change any verdict.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 3 — turnCorrections leak on the reject path is telemetry-only (forbidden #4)', () => {
  it('CLOSED: growing turnCorrections (ctx.notes) changes NO honesty-guard verdict', () => {
    const g = claimIsGrounded({ writeTools: ['deleteAccount'] });
    const did = [{ op: 'del', target: 'ACC-9', outcome: 'success' as const }];
    const w = world({ toolCalls: [{ name: 'deleteAccount', args: { id: 'ACC-9' }, result: { label: 'ACC-9' }, tookEffect: true }] });
    const calls = [oc({ name: 'deleteAccount', args: { id: 'ACC-9' }, ok: true, tookEffect: true, turnIndex: 0 })];
    const clean = base({ did, observed: calls, world: w, notes: [] } as Partial<GuardCtx>);
    const poisoned = base({ did, observed: calls, world: w, notes: ['claims-invalid:3', 'redrive:claimIsGrounded', 'exhaustion-salvage'] } as Partial<GuardCtx>);
    // A leaked correction list from a rejected redrive candidate must not flip grounding either way.
    expect(g.check(clean)).toBe(g.check(poisoned));
    expect(g.check(poisoned)).toBeNull(); // honestly grounded → allowed, notes irrelevant
  });
  it('CLOSED: attemptedThisTurn (the field that COULD poison blocked/refused grounding) is NOT written by a respond-only redrive', () => {
    // A redrive is respond-only (activeTools:['respond']); recordVeto — the ONLY writer of attemptedCalls —
    // fires solely on a DOMAIN-tool veto, which cannot occur when no domain tool is active. So the
    // reject-path field the honesty core actually reads never accretes a phantom attempt.
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0);
    recordTerminalCall(actionHistory, 'respond', { message: 'draft', did: [{ op: 'inform' }] });
    expect(actionHistory.attemptedCalls).toEqual([]); // a terminal is never a vetoed attempt
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — a PREMATURE terminal must not leave an undelivered ASK in `observed`, where it would
// license a cross-turn destructive action (forbidden: bypass a destructive protocol).
//
// supersededTerminalCalls covers the TWO-terminal case (it prunes the observed ask entry). The
// PREMATURE path — a SINGLE ask-intent `respond` sharing a step with a domain call — invalidates
// the DELIVERED declaration (clearDeliveredTerminal wipes did + terminalReply); on its own that does
// NOT prune the observed entry, because superseded requires ≥2 terminals in the step, so the ask-intent
// `respond` would survive in the conversation-scoped action history and read as "the user was asked" next turn.
// The backends therefore feed `prematureTerminalCalls(steps)` to the SAME prune, so both undelivered
// paths end at the same place. These vectors are the regression.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 4 — the premature-terminal ask leak is pruned, so no cross-turn license survives', () => {
  /** Reproduce EXACTLY the backend's post-generate terminal reconciliation (agent.ts / run-conversation.ts). */
  function replayBackendTerminalReconcile(steps: unknown, actionHistory: ReturnType<typeof createActionHistory>) {
    const premature = prematureTerminalTools(steps);
    if (premature.length && actionHistory.terminalReply.trim()) clearDeliveredTerminal(actionHistory);
    pruneSupersededTerminals(actionHistory, prematureTerminalCalls(steps));
    pruneSupersededTerminals(actionHistory, supersededTerminalCalls(steps));
  }

  it('the premature ask-intent respond is REMOVED from observed by the invalidation path', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 1);
    // Turn 1, ONE step: a domain read + an asking respond, emitted together (the premature shape).
    recordTerminalCall(actionHistory, 'respond', { message: 'Delete account 5? (yes/no)', did: [{ op: 'ask' }] });
    recordTerminal(actionHistory, 'respond', { message: 'Delete account 5? (yes/no)', did: [{ op: 'ask' }] });
    const steps = [{ toolCalls: [
      { toolName: 'lookupAccount', args: { id: 5 } },
      { toolName: 'respond', args: { message: 'Delete account 5? (yes/no)', did: [{ op: 'ask' }] } },
    ] }];
    // Sanity: this IS a premature terminal, and NOT a superseded-terminal case.
    expect(prematureTerminalTools(steps)).toEqual(['lookupAccount']);
    expect(supersededTerminalCalls(steps)).toEqual([]);

    replayBackendTerminalReconcile(steps, actionHistory);

    // The delivered declaration is wiped …
    expect(actionHistory.terminalReply).toBe('');
    expect(hasAskIntent(actionHistory.did)).toBe(false);
    // … AND the observed ask event is gone with it — nothing left to read as consent.
    expect(actionHistory.observed.filter((o) => o.ok && isAskEvent(o))).toEqual([]);
  });

  it('CLOSED: next turn, confirmFirst DENIES deleteAccount in both shapes — no declaration is a licence', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 1);
    recordTerminalCall(actionHistory, 'respond', { message: 'Delete account 5?', did: [{ op: 'ask' }] });
    recordTerminal(actionHistory, 'respond', { message: 'Delete account 5?', did: [{ op: 'ask' }] });
    const steps = [{ toolCalls: [
      { toolName: 'lookupAccount', args: { id: 5 } },
      { toolName: 'respond', args: { message: 'Delete account 5?', did: [{ op: 'ask' }] } },
    ] }];
    replayBackendTerminalReconcile(steps, actionHistory);
    // (the user actually saw the forced-terminal reply — a NON-asking sign-off — not this question)

    // Turn 2: the model now fires the confirmed destructive call.
    beginTurn(actionHistory, 2); // observed is conversation-scoped → the leaked ask persists
    const gEither = confirmFirst();
    const gAsk = confirmFirst({ flag: false });
    const ctxEither = base({ tool: 'deleteAccount', args: { confirmed: true, id: 5 }, observed: actionHistory.observed, turnIndex: 2 });
    const ctxAsk = base({ tool: 'deleteAccount', args: {}, observed: actionHistory.observed, turnIndex: 2 });

    // SECURE: no phantom license survives the prune — both variants deny.
    expect(gEither.check(ctxEither)).not.toBeNull();
    expect(gAsk.check(ctxAsk)).not.toBeNull();
  });

  it('CONTROL: with the ask entry pruned by hand, confirmFirst denies just the same', () => {
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 1);
    recordTerminalCall(actionHistory, 'respond', { message: 'Delete account 5?', did: [{ op: 'ask' }] });
    // Simulate the pruning the premature path OMITS: drop the leaked ask entry.
    actionHistory.observed = actionHistory.observed.filter((o) => !isAskEvent(o));
    beginTurn(actionHistory, 2);
    const g = confirmFirst();
    const ctx = base({ tool: 'deleteAccount', args: { confirmed: true, id: 5 }, observed: actionHistory.observed, turnIndex: 2 });
    expect(g.check(ctx)).not.toBeNull(); // no phantom license → denied, as intended
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — ★ THE BREAK ★  SUBSTRING target matching lets ONE claim ABSORB MULTIPLE effected
// writes, defeating claimIsComplete's "no silent action". Two destructive writes on entities whose
// ids share a substring, reported as ONE claim → both guards pass, the second write is silent.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 5 — substring target absorption hides a second effected write (CLOSED)', () => {
  // Two effected deletes this turn: account "5" and account "50".
  const w = world({ toolCalls: [
    { name: 'deleteAccount', args: { id: '5' }, result: { label: '5' }, tookEffect: true },
    { name: 'deleteAccount', args: { id: '50' }, result: { label: '50' }, tookEffect: true },
  ] });
  const calls: ObservedCall[] = [
    oc({ name: 'deleteAccount', args: { id: '5' }, ok: true, tookEffect: true, turnIndex: 0 }),
    oc({ name: 'deleteAccount', args: { id: '50' }, ok: true, tookEffect: true, turnIndex: 0 }),
  ];
  // ONE claim, target "5" — a substring of BOTH "5" and "50".
  const did = [{ op: 'delete', target: '5', outcome: 'success' as const }];

  it('CLOSED claimIsGrounded: the target "5" grounds ONLY against the "5" write (whole-value equality)', () => {
    const g = claimIsGrounded({ writeTools: ['deleteAccount'] });
    expect(g.check(base({ did, observed: calls, world: w, turnIndex: 0 }))).toBeNull(); // honest for the "5" delete
  });
  it('CLOSED claimIsComplete: the "50" delete is NOT absorbed by the "5" claim → unreported-action violation', () => {
    const g = claimIsComplete({ writeTools: ['deleteAccount'] });
    // "5" does not substring-match the value "50", so deleting account "50" stays unreported and the
    // guard that exists to forbid exactly this ("report every action that takes effect") fires.
    expect(g.check(base({ did, observed: calls, world: w, turnIndex: 0 }))).not.toBeNull();
  });
  it('CONTROL: declaring BOTH deletes covers both writes', () => {
    const g = claimIsComplete({ writeTools: ['deleteAccount'] });
    const both = [
      { op: 'delete', target: '5', outcome: 'success' as const },
      { op: 'delete', target: '50', outcome: 'success' as const },
    ];
    expect(g.check(base({ did: both, observed: calls, world: w, turnIndex: 0 }))).toBeNull();
  });
  it('CONTROL: a PARTIAL claim set still fires — every effected write needs its own claim', () => {
    const g = claimIsComplete({ writeTools: ['deleteAccount'] });
    const preciseButPartial = [{ op: 'delete', target: '50', outcome: 'success' as const }]; // only covers "50"
    expect(g.check(base({ did: preciseButPartial, observed: calls, world: w, turnIndex: 0 }))).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — BLANK-DELIVERY FLOOR (forbidden #5):
// an exhaustionReply OVERRIDE that returns a zero-width string must still floor to a non-empty closure.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 6 — blank-delivery floor holds against a zero-width override (forbidden #5)', () => {
  it('CLOSED: a spec.controls.exhaustionReply returning U+2060 does NOT deliver blank', async () => {
    const spec = new AgentSpecBase({
      id: 'a', mode: 'M', persona: 'p', tools: [],
      exhaustionReply: () => '⁠​', // word-joiner + zero-width space: survives .trim()
    });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0);
    // A payload that will be REJECTED by a stubbed onReply violation path is not needed here — instead
    // force the exhaustion branch by making the initial payload trip the floor AND leaving redrives at 0
    // so we reach a composed delivery. Simplest: an empty message + empty did composes to '' → floor.
    const blank: RespondPayload = { message: '', did: [] };
    const out = await finalizeReply(spec, undefined, world(), actionHistory, blank, async () => blank, 0);
    expect(out.exhausted).toBe(true);
    // Even though the override returned a zero-width string, the floor swapped in the engine closure.
    expect(out.text.replace(/[​⁠﻿‌‍]/g, '').trim().length).toBeGreaterThan(0);
  });

  // ── the floor strips by CATEGORY, never from an ENUMERATED list ─────
  // U+2063 invisible separator, U+2062 invisible times, U+2064 invisible plus, U+180E Mongolian vowel
  // separator, U+3164 Hangul filler: all render as NOTHING. Any hand-written character list omits some
  // of them, and a reply made of the omitted ones reads as content and is delivered as the user's
  // answer. Stripping by CHARACTER CATEGORY (Cf + Default_Ignorable_Code_Point) before the emptiness
  // test is a closed class, not a list someone has to remember to extend.
  it('CLOSED: the exotic invisibles are blank — per character and combined', () => {
    // Written as escapes on purpose: these characters are INVISIBLE in a source file.
    const INVISIBLES = ['\u2061', '\u2062', '\u2063', '\u2064', '\u180E', '\u3164', '\u115F', '\u1160', '\uFFA0'];
    for (const ch of INVISIBLES) {
      expect(isBlankDelivery(ch), `U+${ch.codePointAt(0)!.toString(16).toUpperCase()} must read as blank`).toBe(true);
    }
    expect(isBlankDelivery(INVISIBLES.join(''))).toBe(true);
    expect(isBlankDelivery(' \u2063\n\u3164\t')).toBe(true); // mixed with whitespace
  });

  it('CLOSED control: real text (including text CARRYING an invisible) is never blank', () => {
    expect(isBlankDelivery('Done.')).toBe(false);
    expect(isBlankDelivery('\u2063Done.\u3164')).toBe(false);
    expect(isBlankDelivery('한글')).toBe(false); // a Hangul SYLLABLE is content; only the FILLER is not
  });

  it('CLOSED: a message of exotic invisibles routes finalizeReply to the non-empty closure', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    const actionHistory = createActionHistory();
    beginTurn(actionHistory, 0);
    const invisible: RespondPayload = { message: '\u2063\u3164\u180E', did: [{ op: 'inform' }] };
    const out = await finalizeReply(spec, undefined, world(), actionHistory, invisible, async () => invisible, 0);
    expect(out.exhausted).toBe(true);
    expect(isBlankDelivery(out.text)).toBe(false);
    expect(actionHistory.turnCorrections).toContain('exhaustion-blank-floor');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — `amount` is CORROBORATED against the same action history fact that grounds the claim. An
// advisory `amount` — any finite number validateClaims accepts, read by no guard — would let a domain
// `renderClaim` that surfaces it deliver a fabricated magnitude inside the block the engine advertises
// as verified.
// ═══════════════════════════════════════════════════════════════════════════════
describe('SECTION 7 — amount is corroborated against the actionHistory fact that grounds the claim', () => {
  it('a fabricated amount on an otherwise-grounded claim is DENIED', () => {
    const g = claimIsGrounded({ writeTools: ['refund'] });
    const w = world({ toolCalls: [{ name: 'refund', args: { order: 'BK5', value: 5 }, result: { label: 'BK5', refunded: 5 }, tookEffect: true }] });
    const calls = [oc({ name: 'refund', args: { order: 'BK5', value: 5 }, ok: true, tookEffect: true, turnIndex: 0 })];
    const did = [{ op: 'refund', target: 'BK5', outcome: 'success' as const, amount: 999999 }]; // real refund $5
    expect(g.check(base({ did, observed: calls, world: w, turnIndex: 0 }))).toBeTruthy();
  });

  it('CONTROL: the amount the WORLD reported grounds', () => {
    const g = claimIsGrounded({ writeTools: ['refund'] });
    const w = world({ toolCalls: [{ name: 'refund', args: { order: 'BK5', value: 5 }, result: { label: 'BK5', refunded: 5 }, tookEffect: true }] });
    const calls = [oc({ name: 'refund', args: { order: 'BK5', value: 5 }, ok: true, tookEffect: true, turnIndex: 0 })];
    const did = [{ op: 'refund', target: 'BK5', outcome: 'success' as const, amount: 5 }];
    expect(g.check(base({ did, observed: calls, world: w, turnIndex: 0 }))).toBeNull();
  });
  it('MITIGATION at core: the engine renderer DROPS amount, so the fabricated magnitude never reaches the user by default', () => {
    const line = renderOperationReport([{ op: 'refund', target: 'BK5', outcome: 'success', amount: 999999 }]);
    expect(line).not.toContain('999999');
  });
});
