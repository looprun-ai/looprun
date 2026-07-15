/**
 * THE COVERAGE RATCHET — a computed 100% floor with no stored counter (nothing to merge-conflict):
 * every Guard-returning export in src/guards.ts must carry a GuardProof with ≥1 positive, ≥1 negative
 * and ≥1 neutral case (and both L1 verdict classes); every ReplyMutator export must be listed in
 * PROVEN_MUTATORS (and proven in proofs-l1.test.ts). A new guard kind shipped without a proof turns
 * this red — that is the point.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUARD_PROOFS, PROVEN_MUTATORS } from './catalog.js';

const GUARDS_TS = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/guards.ts');
const src = readFileSync(GUARDS_TS, 'utf8');

/** Every `export function` in guards.ts, classified by its signature's return type (the FIRST
 *  `): Guard|ReplyMutator|string {` after the name — the same discriminator the guard-catalog parity
 *  lane uses). */
function exportedFactories(): { name: string; returns: string }[] {
  const out: { name: string; returns: string }[] = [];
  const re = /export function (\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const slice = src.slice(m.index);
    const sig = slice.match(/\)\s*:\s*(Guard|ReplyMutator|string)\s*\{/);
    if (sig) out.push({ name: m[1], returns: sig[1] });
  }
  return out;
}

const factories = exportedFactories();
const guardKinds = factories.filter((f) => f.returns === 'Guard').map((f) => f.name);
const mutatorKinds = factories.filter((f) => f.returns === 'ReplyMutator').map((f) => f.name);
const proven = new Map(GUARD_PROOFS.map((p) => [p.guard, p]));

/** Kinds whose check() unconditionally fires by DESIGN (target-scoping is their only off switch) —
 *  an honest `l1:'silent'` ctx cannot exist, so they must instead prove ctx-independence with ≥2
 *  fires cases plus an L3 pass case showing the target scoping. */
const ALWAYS_FIRE_KINDS = new Set(['forbidThisTurn']);

describe('coverage ratchet', () => {
  it('extractor self-test (non-vacuous): finds the known kinds', () => {
    expect(guardKinds.length).toBeGreaterThanOrEqual(25);
    expect(guardKinds).toContain('requiresBefore');
    expect(guardKinds).toContain('noFabricatedSuccess');
    expect(guardKinds).toContain('custom');
    expect(mutatorKinds).toContain('jargonScrub');
  });

  it('every Guard kind has a GuardProof', () => {
    const missing = guardKinds.filter((k) => !proven.has(k));
    expect(missing, `unproven guard kind(s): [${missing.join(', ')}] — add a GuardProof to the catalog`).toEqual([]);
  });

  it('no ghost proofs (every proof maps to a real guards.ts export)', () => {
    const kinds = new Set(guardKinds);
    const ghosts = GUARD_PROOFS.map((p) => p.guard).filter((g) => !kinds.has(g));
    expect(ghosts).toEqual([]);
  });

  it('one proof per kind (no duplicates)', () => {
    const seen = new Set<string>();
    const dups = GUARD_PROOFS.map((p) => p.guard).filter((g) => (seen.has(g) ? true : (seen.add(g), false)));
    expect(dups).toEqual([]);
  });

  it('every ReplyMutator export is proven (listed in PROVEN_MUTATORS)', () => {
    const missing = mutatorKinds.filter((k) => !PROVEN_MUTATORS.includes(k));
    expect(missing, `unproven mutator(s): [${missing.join(', ')}] — prove them in proofs-l1 and list them`).toEqual([]);
    const ghosts = PROVEN_MUTATORS.filter((k) => !mutatorKinds.includes(k));
    expect(ghosts).toEqual([]);
  });
});

// Per-kind completeness as TOP-LEVEL `proof completeness · <kind>` describes (not nested under
// `coverage ratchet`) so each test's full name STARTS with the `proof completeness ·` prefix the
// governance proof runner (scripts/proofs/run-proofs.mjs) tallies coverage by.
for (const proof of GUARD_PROOFS) {
  describe(`proof completeness · ${proof.guard}`, () => {
    it('has ≥1 positive, ≥1 negative, ≥1 neutral case', () => {
      for (const pol of ['positive', 'negative', 'neutral'] as const) {
        expect(
          proof.cases.some((c) => c.polarity === pol),
          `missing a ${pol} case`,
        ).toBe(true);
      }
    });
    it('has both L1 verdict classes (a fires case and a silent case with a crafted ctx)', () => {
      expect(proof.cases.some((c) => c.ctx !== undefined && c.l1 === 'fires')).toBe(true);
      if (ALWAYS_FIRE_KINDS.has(proof.guard)) {
        // No honest silent ctx exists — require ctx-independence (≥2 fires) + an L3 pass case
        // proving the target scoping is the real off switch.
        expect(proof.cases.filter((c) => c.ctx !== undefined && c.l1 === 'fires').length).toBeGreaterThanOrEqual(2);
        expect(proof.cases.some((c) => c.l3?.expect === 'pass')).toBe(true);
      } else {
        expect(proof.cases.some((c) => c.ctx !== undefined && c.l1 === 'silent')).toBe(true);
      }
    });
  });
}
