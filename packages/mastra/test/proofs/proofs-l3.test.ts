/**
 * L3 — isolated full-loop proofs. Every GuardProof case that carries an `l3` block is driven through
 * the real runSpecConversation (scripted model + fresh FixtureWorld) on a spec that isolates the
 * guard under proof, and must surface the expected recoveryEvents signal (veto / redrive / refusal)
 * or a clean pass.
 */
import { describe, expect, it } from 'vitest';
import { buildIsolatedSpec } from '@looprun-ai/core/testing';
import { assertSignal, pickRecord, runProofLoop } from '../../src/testing/index.js';
import { GUARD_PROOFS } from '../../../core/test/proofs/catalog.js';

for (const proof of GUARD_PROOFS) {
  const loopCases = proof.cases.filter((c) => c.l3 !== undefined);
  if (!loopCases.length) continue;
  describe(`L3 · ${proof.guard}`, () => {
    for (const c of loopCases) {
      it(`${c.polarity} · ${c.name} → expect=${c.l3!.expect}`, async () => {
        const spec = buildIsolatedSpec(proof);
        const res = await runProofLoop(spec, c.l3!);
        expect(res.errorMsg, `loop error: ${res.errorMsg}`).toBeUndefined();
        const record = pickRecord(res, c.l3!);
        const verdict = assertSignal(record, proof, c.l3!);
        expect(verdict.ok, verdict.detail).toBe(true);
      });
    }
  });
}

describe('L3 coverage floor', () => {
  it('every proof has at least one loop case', () => {
    const missing = GUARD_PROOFS.filter((p) => !p.cases.some((c) => c.l3)).map((p) => p.guard);
    expect(missing).toEqual([]);
  });
});
