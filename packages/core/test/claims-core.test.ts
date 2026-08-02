/**
 * CORE CLAIMS module (SCG-T1) — the structural spine the cross-check guards (T2), the ledger
 * plumbing (T4) and the did→message renderer (T5) all build on. These tests pin the EXACT names and
 * the strict shape law: `validateClaims` is exhaustive typed checking (no `typeof`/`trim` guesses that
 * the red-team broke), and `resolveOutcome` lets core meaning win over any domain shadow.
 *
 * Runner note: the SCG brief wrote these with `node:test`; the core package runs under vitest, so the
 * `test` binding comes from vitest while the assertions stay verbatim on `node:assert/strict`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveOutcome, validateClaims, isAskEvent, respondPayload, CORE_OUTCOMES } from '../src/runtime/claims.js';

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
test('validateClaims: non-array, non-object items, wrong field types, empty op are ERRORS', () => {
  assert.ok(validateClaims('nope').errors.length);
  assert.ok(validateClaims([null]).errors.length);
  assert.ok(validateClaims([{ op: '', outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 42 }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 'success', amount: 'big' }]).errors.length);
});
test('validateClaims: [] is VALID (a read-only/ask turn did nothing)', () => {
  assert.deepEqual(validateClaims([]), { claims: [], errors: [] });
});
test('isAskEvent keys on respond+asked:true only', () => {
  assert.ok(isAskEvent({ name: 'respond', args: { asked: true } }));
  assert.ok(!isAskEvent({ name: 'respond', args: {} }));
  assert.ok(!isAskEvent({ name: 'askUser', args: {} })); // the old terminal is DEAD
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
test('respondPayload: tolerant extraction of message/did/asked', () => {
  const p = respondPayload({ message: 'done', did: [{ op: 'refund', outcome: 'success' }], asked: true });
  assert.equal(p.message, 'done');
  assert.equal(p.asked, true);
  assert.deepEqual(p.did, [{ op: 'refund', outcome: 'success' }]);
});
test('respondPayload: absent fields default (message="", did=[], asked=false)', () => {
  assert.deepEqual(respondPayload({}), { message: '', did: [], asked: false });
});
