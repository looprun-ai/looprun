/**
 * CORE CLAIMS module — the structural spine the cross-check guards, the action history plumbing and the
 * did→message renderer all build on. These tests pin the EXACT names and the strict shape law:
 * `validateClaims` is exhaustive typed checking, never a `typeof`/`trim` guess, and `resolveOutcome`
 * lets core meaning win over any domain shadow.
 *
 * Runner note: the `test` binding comes from vitest (the package's runner) while the assertions are
 * written against `node:assert/strict`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  resolveOutcome,
  validateClaims,
  isAskEvent,
  respondPayload,
  CORE_OUTCOMES,
  assertNoCoreOutcomeShadow,
} from '../src/runtime/claims.js';

test('core outcomes resolve to themselves without a map', () => {
  for (const o of CORE_OUTCOMES) assert.equal(resolveOutcome(o, undefined), o);
});
test('domain outcome resolves through the map; undeclared resolves to null', () => {
  assert.equal(resolveOutcome('settled', { settled: 'success' }), 'success');
  assert.equal(resolveOutcome('settled', undefined), null);
  assert.equal(resolveOutcome('vanished', { settled: 'success' }), null);
});
test('a domain word may not shadow a core outcome', () => {
  // map entry keyed by a core outcome is ignored: core meaning wins
  assert.equal(resolveOutcome('success', { success: 'refused' as const }), 'success');
});
test('m10 — a CASE-VARIANT core key is a shadow too, and is rejected at SPEC LOAD', () => {
  // `resolveOutcome` is case-sensitive, so 'Success' is NOT a core word and WOULD resolve through the
  // map — a domain could redefine a core outcome by casing alone. The shadow law is enforced once, at
  // load: any key whose lowercased form is a core word is refused before a turn ever runs.
  assert.equal(resolveOutcome('Success', { Success: 'failure' as const }), 'failure'); // why the load gate exists
  assert.throws(() => assertNoCoreOutcomeShadow({ Success: 'failure' }, 'a'), /Success/);
  assert.throws(() => assertNoCoreOutcomeShadow({ SUCCESS: 'failure' }, 'a'), /outcome/i);
  assert.throws(() => assertNoCoreOutcomeShadow({ not_Found: 'success' }, 'a'), /not_Found/);
  assert.throws(() => assertNoCoreOutcomeShadow({ success: 'success' }, 'a'), /success/);
});
test('m10 — a genuine domain vocabulary loads without complaint', () => {
  assert.equal(assertNoCoreOutcomeShadow({ settled: 'success', bounced: 'failure' }, 'a'), undefined);
  assert.equal(assertNoCoreOutcomeShadow(undefined, 'a'), undefined);
});
test('validateClaims: non-array, non-object items, wrong field types, empty op are ERRORS', () => {
  assert.ok(validateClaims('nope').errors.length);
  assert.ok(validateClaims([null]).errors.length);
  assert.ok(validateClaims([{ op: '', outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 42 }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 'success', amount: 'big' }]).errors.length);
});
test('validateClaims: [] is REJECTED (every respond declares at least one intention)', () => {
  const r = validateClaims([]);
  assert.deepEqual(r.claims, []);
  assert.ok(r.errors.length);
});
test('validateClaims: the speech/action partition', () => {
  // a speech op alone is valid (no outcome, no amount)
  assert.deepEqual(validateClaims([{ op: 'inform' }]), { claims: [{ op: 'inform' }], errors: [] });
  // a speech op must NOT carry outcome or amount
  assert.ok(validateClaims([{ op: 'ask', outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'greet', amount: 1 }]).errors.length);
  // an action op REQUIRES an outcome
  assert.ok(validateClaims([{ op: 'refund' }]).errors.length);
});
test('isAskEvent keys on respond + an ask intention in did', () => {
  assert.ok(isAskEvent({ name: 'respond', args: { did: [{ op: 'ask' }] } }));
  assert.ok(!isAskEvent({ name: 'respond', args: { asked: true } })); // a bare boolean is not an ask
  assert.ok(!isAskEvent({ name: 'respond', args: {} }));
  assert.ok(!isAskEvent({ name: 'askUser', args: { did: [{ op: 'ask' }] } })); // `respond` is the only terminal
});

// ── beyond the brief snippet: pin the extra strictness + tolerant extraction the later tasks lean on ──
test('validateClaims: unknown extra keys on a claim are an ERROR', () => {
  assert.ok(validateClaims([{ op: 'cancel', outcome: 'success', note: 'x' }]).errors.length);
});
test('validateClaims: a well-formed claim (with optional target/amount) is VALID', () => {
  const r = validateClaims([{ op: 'refund', target: 'INV-7', outcome: 'success', amount: 42 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.claims, [{ op: 'refund', target: 'INV-7', outcome: 'success', amount: 42 }]);
});
test('validateClaims: target present but blank/non-string is an ERROR; amount non-finite is an ERROR', () => {
  assert.ok(validateClaims([{ op: 'cancel', target: '  ', outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', target: 7, outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 'success', amount: Number.POSITIVE_INFINITY }]).errors.length);
});
test('respondPayload: tolerant extraction of message/did (a stray `asked` arg is ignored)', () => {
  const p = respondPayload({ message: 'done', did: [{ op: 'refund', outcome: 'success' }], asked: true });
  assert.equal(p.message, 'done');
  assert.deepEqual(p.did, [{ op: 'refund', outcome: 'success' }]);
  assert.ok(!('asked' in p)); // a bare `asked` arg never reaches the payload
});
test('respondPayload: absent fields default (message="", did=[])', () => {
  assert.deepEqual(respondPayload({}), { message: '', did: [] });
});
