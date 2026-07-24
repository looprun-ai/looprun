/**
 * COLLECTIVE — the non-interference proof. ONE super-agent carries EVERY proof's guard (at the
 * catalog.ts collective-ruleset params) over the shared fixture surface; each proof's loop cases are
 * replayed against it and must keep their verdict:
 *   - a negative case still surfaces ITS guard's signal, and no guard OUTSIDE the whitelist
 *     (the guard under proof + the always-on auto layer) fires — a new guard that falsely fires on an
 *     old scenario turns this red;
 *   - a pass case stays byte-clean (zero recovery events) even with all guards mounted.
 * Content-contract reply guards are excluded (`collective: 'skip'` — see catalog.ts for the rationale).
 */
import { describe, expect, it } from 'vitest';
import { AUTO_LAYER_KINDS, buildCollectiveSpec } from '@looprun-ai/core/testing';
import { assertSignal, pickRecord, runProofLoop } from '../../src/testing/index.js';
import { GUARD_PROOFS } from '../../../core/test/proofs/catalog.js';

const META = new Set(['forced-terminal', 'exhaustion-terminal', 'exhaustion-salvage', 'error']);

/** The guard KIND a recoveryEvents tag attributes, or null for meta/bookkeeping tags. */
function eventKind(tag: string): string | null {
  // `salvage:form-only:<kinds>` is BOOKKEEPING, not an attribution: it records that the finalizer
  // delivered the best candidate despite FORM-class violations (already attributed by the same turn's
  // `redrive:<kind>` tags). `premature-terminal:<tools>` is a RUNTIME TURN-MECHANISM tag of the same
  // class as `forced-terminal` — attributing either to a guard would read as interference.
  if (META.has(tag) || tag.startsWith('premature-terminal') || tag.startsWith('salvage:') || tag.startsWith('salvage-miss:') || tag.startsWith('mutate:')) return null;
  const parts = tag.split(':');
  if (parts[0] === 'redrive' || parts[0] === 'onInput') return parts[1] ?? null;
  if (parts.length === 3) return parts[1]; // `${dim}:${kind}:${tool}` veto or `output:${kind}:${tool}`
  return tag;
}

const collectiveProofs = GUARD_PROOFS.filter((p) => p.collective !== 'skip');

describe('collective non-interference (super-agent)', () => {
  it('the collective spec builds with every non-skipped guard installed', () => {
    const spec = buildCollectiveSpec(GUARD_PROOFS);
    const installed = [
      ...spec.guards.onInput,
      ...spec.guards.preTool,
      ...spec.guards.postTool,
      ...spec.guards.onReply,
    ];
    for (const p of collectiveProofs) {
      expect(
        installed.some((b) => b.guard.kind === (p.make ? p.make().kind : p.guard)),
        `guard '${p.guard}' missing from the collective spec`,
      ).toBe(true);
    }
  });

  for (const proof of collectiveProofs) {
    const loopCases = proof.cases.filter((c) => c.l3 !== undefined);
    if (!loopCases.length) continue;
    describe(`collective · ${proof.guard}`, () => {
      for (const c of loopCases) {
        it(`${c.polarity} · ${c.name} → expect=${c.l3!.expect}`, async () => {
          const spec = buildCollectiveSpec(GUARD_PROOFS);
          const res = await runProofLoop(spec, c.l3!);
          expect(res.errorMsg, `loop error: ${res.errorMsg}`).toBeUndefined();
          const record = pickRecord(res, c.l3!);
          const verdict = assertSignal(record, proof, c.l3!);
          expect(verdict.ok, verdict.detail).toBe(true);
          // Non-interference: every attributed kind across ALL turns is the guard under proof, an
          // always-on auto-layer kind, or a declared legitimate co-firing (l3.alsoFires).
          const whitelist = new Set<string>([proof.guard, ...AUTO_LAYER_KINDS, ...(c.l3!.alsoFires ?? [])]);
          const foreign = res.turnRecords
            .flatMap((r) => r.recoveryEvents ?? [])
            .map(eventKind)
            .filter((k): k is string => k != null && !whitelist.has(k));
          expect(foreign, `foreign guard(s) fired: [${foreign.join(', ')}]`).toEqual([]);
        });
      }
    });
  }
});
