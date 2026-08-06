/**
 * RED-TEAM BATCH A — adversarial proof-by-construction against the flow + args guards:
 *   requiresBefore, forbidThisTurn, maxCalls, noDuplicateCall, argRequired, argAbsent, argFormat.
 *
 * Each block builds a GuardCtx that SHOULD be denied and asserts what the guard actually returns.
 * A guard that returns null (allow) on a should-be-denied ctx = a CONFIRMED BREAK (documented as such).
 * A guard that returns a deny string = HOLDS for that vector.
 *
 * Throwaway. Not committed. Does not modify guard source.
 */
import { describe, expect, it } from 'vitest';
import {
  requiresBefore,
  forbidThisTurn,
  maxCalls,
  noDuplicateCall,
  argRequired,
  argAbsent,
  argFormat,
} from '../../src/guards/index.js';
import type { AgentWorld, GuardCtx, ObservedCall } from '../../src/index.js';

function world(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}
const base = (over: Partial<GuardCtx>): GuardCtx => ({
  args: {}, world: world(), observed: [], turnIndex: 0, userText: '', history: [], ...over,
});
const oc = (over: Partial<ObservedCall>): ObservedCall => ({ name: 'x', args: {}, ok: true, turnIndex: 0, ...over });

// ───────────────────────── requiresBefore ─────────────────────────
describe('requiresBefore — attack recency / failed-dep smuggle', () => {
  const g = requiresBefore(['readRecord']);

  it('HOLDS: a FAILED dep (ok:false) does NOT satisfy', () => {
    const ctx = base({ tool: 'write', observed: [oc({ name: 'readRecord', ok: false })], turnIndex: 2 });
    expect(g.check(ctx)).not.toBeNull(); // denied → holds
  });

  it('DOCUMENTED: an ok dep that returned an EMPTY/vacuous result STILL satisfies (ok===true is the only signal)', () => {
    // requiresBefore has no access to the dep's payload; ok:true from an empty read grounds the write.
    const ctx = base({ tool: 'write', observed: [oc({ name: 'readRecord', ok: true })], turnIndex: 5 });
    expect(g.check(ctx)).toBeNull(); // allowed by design (evidence guard)
  });

  it('DOCUMENTED: unbounded default lets a STALE turn-0 read ground a turn-99 write', () => {
    const ctx = base({ tool: 'write', observed: [oc({ name: 'readRecord', ok: true, turnIndex: 0 })], turnIndex: 99 });
    expect(g.check(ctx)).toBeNull(); // allowed by design (within unbounded)
  });

  it('ATTACK: with within=1, does a FUTURE-turn dep (turnIndex > current) smuggle through?', () => {
    // turnIndex - o.turnIndex = -1 → the `>= 0` clause should exclude it.
    const gw = requiresBefore(['readRecord'], { within: 1 });
    const ctx = base({ tool: 'write', observed: [oc({ name: 'readRecord', ok: true, turnIndex: 3 })], turnIndex: 2 });
    expect(gw.check(ctx)).not.toBeNull(); // must be denied
  });

  it('BREAK-SIMULATE: with UNBOUNDED default, a FUTURE-turn dep satisfies (no >=0 guard when within==null)', () => {
    // within==null skips the turn-delta clause entirely → any ok dep, even from a later turnIndex, counts.
    const ctx = base({ tool: 'write', observed: [oc({ name: 'readRecord', ok: true, turnIndex: 7 })], turnIndex: 2 });
    // Assert ACTUAL behaviour (allow). Whether this is exploitable depends on whether observed can ever
    // carry a future turnIndex; in normal runtime it cannot, so severity is INFO.
    expect(g.check(ctx)).toBeNull();
  });
});

// ───────────────────────── forbidThisTurn ─────────────────────────
describe('forbidThisTurn — attack any re-enable path', () => {
  const g = forbidThisTurn('nope');
  it('HOLDS: denies the FIRST call, empty everything', () => {
    expect(g.check(base({ tool: 'x' }))).toBe('nope');
  });
  it('HOLDS: no history / observed / world state re-enables it', () => {
    const ctx = base({ tool: 'x', observed: [oc({ name: 'x', ok: true })], world: world({ allow: true }) });
    expect(g.check(ctx)).toBe('nope');
  });
});

// ───────────────────────── maxCalls ─────────────────────────
describe('maxCalls — attack count scope / ok-filter', () => {
  it('HOLDS: exactly n ok calls allowed, (n+1)-th denied (turn scope)', () => {
    const g = maxCalls('bulk', 2, 'cap');
    const two = [oc({ name: 'bulk', turnIndex: 0 }), oc({ name: 'bulk', turnIndex: 0 })];
    expect(g.check(base({ tool: 'bulk', observed: two, turnIndex: 0 }))).toBe('cap'); // 3rd denied
  });

  it('DOCUMENTED: turn scope RESETS across turns — n calls per turn, unbounded conversation total', () => {
    const g = maxCalls('bulk', 1, 'cap');
    const prevTurn = [oc({ name: 'bulk', turnIndex: 0 })];
    // new turn (turnIndex 1): the turn-0 call does not count → allowed again
    expect(g.check(base({ tool: 'bulk', observed: prevTurn, turnIndex: 1 }))).toBeNull();
  });

  it('ATTACK: FAILED calls do not consume the budget — can a model fail-spam then still act?', () => {
    const g = maxCalls('bulk', 1, 'cap');
    // one ok already done → next must be denied even though a failed one also sits there
    const obs = [oc({ name: 'bulk', ok: false, turnIndex: 0 }), oc({ name: 'bulk', ok: true, turnIndex: 0 })];
    expect(g.check(base({ tool: 'bulk', observed: obs, turnIndex: 0 }))).toBe('cap');
  });

  it('DOCUMENTED: only OK calls count — N failed calls never trip the cap (retry storm on failures)', () => {
    const g = maxCalls('bulk', 1, 'cap');
    const fails = [oc({ name: 'bulk', ok: false }), oc({ name: 'bulk', ok: false }), oc({ name: 'bulk', ok: false })];
    expect(g.check(base({ tool: 'bulk', observed: fails, turnIndex: 0 }))).toBeNull(); // still allowed
  });

  it('HOLDS: conversation scope counts across turns', () => {
    const g = maxCalls('bulk', 1, 'cap', { scope: 'conversation' });
    const obs = [oc({ name: 'bulk', turnIndex: 0 })];
    expect(g.check(base({ tool: 'bulk', observed: obs, turnIndex: 5 }))).toBe('cap');
  });
});

// ───────────────────────── noDuplicateCall ─────────────────────────
describe('noDuplicateCall — attack canonicalization gaps', () => {
  const g = noDuplicateCall();

  it('HOLDS: different KEY ORDER is the same call (canonArgs sorts)', () => {
    const prior = oc({ name: 'save', args: { a: 1, b: 2 }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { b: 2, a: 1 }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).not.toBeNull(); // denied
  });

  it('HOLDS: explicit undefined key ≡ absent (canonArgs drops undefined)', () => {
    const prior = oc({ name: 'save', args: { a: 1 }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { a: 1, b: undefined }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).not.toBeNull(); // denied (treated as duplicate)
  });

  it('HOLDS: nested-object key order canonicalized', () => {
    const prior = oc({ name: 'save', args: { o: { x: 1, y: 2 } }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { o: { y: 2, x: 1 } }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CORRECT-ALLOW: type coercion 1 vs "1" are genuinely different args → allowed', () => {
    const prior = oc({ name: 'save', args: { a: 1 }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { a: '1' }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).toBeNull(); // different call, correctly not a dup
  });

  it('DOCUMENTED: whitespace in a string value is a different call (JSON.stringify exact)', () => {
    const prior = oc({ name: 'save', args: { q: 'hello' }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { q: 'hello ' }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).toBeNull(); // trailing space ⇒ not caught (they are different queries)
  });

  it('DOCUMENTED: turn-scoped — a cross-turn exact repeat is ALLOWED (legit re-read)', () => {
    const prior = oc({ name: 'save', args: { a: 1 }, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { a: 1 }, observed: [prior], turnIndex: 1 });
    expect(g.check(ctx)).toBeNull(); // by design
  });

  it('HOLDS: a FAILED prior identical call does NOT block the retry (only ok dups deny)', () => {
    const prior = oc({ name: 'save', args: { a: 1 }, ok: false, turnIndex: 0 });
    const ctx = base({ tool: 'save', args: { a: 1 }, observed: [prior], turnIndex: 0 });
    expect(g.check(ctx)).toBeNull(); // retry after failure allowed (intended)
  });
});

// ───────────────────────── argRequired ─────────────────────────
describe('argRequired — attack empty/blank/container shapes', () => {
  const g = argRequired('title');

  it('HOLDS: missing → denied', () => expect(g.check(base({ args: {} }))).not.toBeNull());
  it('HOLDS: empty string → denied', () => expect(g.check(base({ args: { title: '' } }))).not.toBeNull());
  it('HOLDS: whitespace-only → denied', () => expect(g.check(base({ args: { title: '   ' } }))).not.toBeNull());
  it('HOLDS: null → denied', () => expect(g.check(base({ args: { title: null } }))).not.toBeNull());
  it('HOLDS: undefined → denied', () => expect(g.check(base({ args: { title: undefined } }))).not.toBeNull());

  it('BREAK-SIMULATE: empty ARRAY [] passes a required-field gate (prose says "non-empty")', () => {
    // v==null false, not a string → empty=false → ALLOWED. An empty list satisfies "required".
    expect(g.check(base({ args: { title: [] } }))).toBeNull();
  });

  it('BREAK-SIMULATE: empty OBJECT {} passes a required-field gate', () => {
    expect(g.check(base({ args: { title: {} } }))).toBeNull();
  });

  it('BREAK-SIMULATE: zero-width/unicode-blank string ("\\u200B") passes (trim() does not strip it)', () => {
    expect(g.check(base({ args: { title: '​' } }))).toBeNull();
  });

  it('DOCUMENTED: number 0 and false pass (arguably legitimate values)', () => {
    expect(g.check(base({ args: { title: 0 } }))).toBeNull();
    expect(g.check(base({ args: { title: false } }))).toBeNull();
  });
});

// ───────────────────────── argAbsent ─────────────────────────
describe('argAbsent — attack null/undefined smuggle', () => {
  const g = argAbsent('secret');

  it('HOLDS: present with a real value → denied', () => {
    expect(g.check(base({ args: { secret: 'x' } }))).not.toBeNull();
  });
  it('HOLDS: present as empty string → denied (empty string is present, != null)', () => {
    expect(g.check(base({ args: { secret: '' } }))).not.toBeNull();
  });
  it('HOLDS: present as 0 / false → denied', () => {
    expect(g.check(base({ args: { secret: 0 } }))).not.toBeNull();
    expect(g.check(base({ args: { secret: false } }))).not.toBeNull();
  });
  it('BREAK-SIMULATE: key present with value null bypasses (field IS present but != null is false)', () => {
    expect(g.check(base({ args: { secret: null } }))).toBeNull();
  });
  it('BREAK-SIMULATE: key present with value undefined bypasses', () => {
    expect(g.check(base({ args: { secret: undefined } }))).toBeNull();
  });
});

// ───────────────────────── argFormat ─────────────────────────
describe('argFormat — attack non-string bypass + anchoring', () => {
  const g = argFormat('id', '^[0-9]+$');

  it('HOLDS: malformed string → denied', () => {
    expect(g.check(base({ args: { id: 'abc' } }))).not.toBeNull();
  });
  it('HOLDS: well-formed string → allowed', () => {
    expect(g.check(base({ args: { id: '123' } }))).toBeNull();
  });

  it('BREAK-SIMULATE: a NON-STRING value (number) entirely bypasses format validation', () => {
    // typeof v !== 'string' → return null. A malformed-by-type id is unchecked.
    expect(g.check(base({ args: { id: 12.5 } }))).toBeNull();
  });
  it('BREAK-SIMULATE: an ARRAY value bypasses format validation', () => {
    expect(g.check(base({ args: { id: ['drop table'] } }))).toBeNull();
  });
  it('BREAK-SIMULATE: an OBJECT value bypasses format validation', () => {
    expect(g.check(base({ args: { id: { $ne: null } } }))).toBeNull();
  });

  it('BREAK-SIMULATE: empty string bypasses argFormat alone (delegated to argRequired; gap if used solo)', () => {
    expect(g.check(base({ args: { id: '' } }))).toBeNull();
  });

  it('BREAK-SIMULATE: UNANCHORED author pattern matches a substring (injection tail slips through)', () => {
    const gu = argFormat('id', '[0-9]+'); // author forgot ^...$
    expect(gu.check(base({ args: { id: '123; DROP TABLE users' } }))).toBeNull(); // matches substring → allowed
  });

  it('HOLDS: $ without /m — a trailing-newline payload is correctly DENIED by ^\\w+$', () => {
    const gm = argFormat('name', '^\\w+$');
    // Checked the classic JS anchor gap: it does NOT apply here — \w excludes \n and non-multiline $
    // does not match before a trailing newline, so "safe\n" is denied. Anchored patterns hold.
    expect(gm.check(base({ args: { name: 'safe\n' } }))).not.toBeNull();
  });
});
