/**
 * PREMISE COHERENCE — the engine-owned generalization of the run's `premise.test.ts`, WITHOUT its
 * hand exclusions. It must FIRE on each of the three defect shapes the Atlas run named, and go QUIET
 * once the case is corrected:
 *   - accept-when-should-forbid (cases 19/56/59): a forbidden write the world ACCEPTS;
 *   - multi-turn (cases 20/36): a chain the replayer cannot construct → SKIPPED LOUDLY + floor;
 *   - read-side (case 53): a forbidden entry naming a pure READ → forbids nothing.
 * Plus the required-write-refused shape (a case that can never pass) and the reached-verdict FLOOR.
 */
import { describe, expect, it } from 'vitest';
import type { AgentWorld } from '@looprun-ai/core';
import type { Subject, SubjectCase } from '../src/subject.js';
import { checkPremiseCoherence } from '../src/validate.js';

/** A deterministic world with the honesty conventions the checker keys on (ok:false = refused;
 *  tookEffect:true = an accepted write). Only `ast_shop` is in the workshop (completable); a booking
 *  exists only under the `booked` preset. `getStatus` is a pure read. */
class ShopWorld implements AgentWorld {
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown; tookEffect: boolean }> = [];
  sseActions: unknown[] = [];
  hasBooking: boolean;
  [k: string]: unknown;

  constructor(preset = 'default') {
    this.hasBooking = preset === 'booked';
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const push = (result: unknown, tookEffect: boolean) => {
      this.toolCalls.push({ name, args, result, tookEffect });
      return result;
    };
    switch (name) {
      case 'completeMaintenance': {
        const ok = args.assetId === 'ast_shop';
        return ok ? push({ ok: true }, true) : push({ ok: false, error: 'asset not in workshop' }, false);
      }
      case 'cancelBooking':
        return this.hasBooking ? push({ ok: true }, true) : push({ ok: false, error: 'no such booking' }, false);
      case 'chargeDeposit':
        return push({ ok: true }, true); // always accepted — the two-step guards it, not the world
      case 'getStatus':
        return push({ ok: true, status: 'green' }, false); // a pure read
      default:
        return push({ ok: false, error: `unknown tool ${name}` }, false);
    }
  }

  advanceTurn(): void {}
  ingestAttachment(): string {
    return 'att';
  }
}

function mkSubject(cases: SubjectCase[]): Subject {
  return {
    dir: '/fake',
    specs: {},
    contract: {} as never,
    caseAgent: {},
    cases,
    toolDefs: [],
    makeWorld: (preset?: string) => new ShopWorld(preset),
  };
}

const single = (id: string, extra: Partial<SubjectCase>): SubjectCase => ({
  id,
  setup: { preset: 'default' },
  turns: [{ userText: 'do it' }],
  ...extra,
});

describe('premise coherence — fires on the three defect shapes', () => {
  it('accept-when-should-forbid: a forbidden write the world ACCEPTS fires', () => {
    const defect = single('19-accept-when-forbid', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([defect]));
    expect(r.issues.join('\n')).toMatch(/19-accept-when-forbid.*ACCEPTED.*forbids nothing/s);
  });

  it('accept-when-should-forbid: corrected (world REFUSES the forbidden write) is quiet', () => {
    const fixed = single('19-accept-when-forbid', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.issues).toEqual([]);
  });

  it('read-side: a forbidden entry naming a pure READ fires', () => {
    const defect = single('53-read-side', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'getStatus' }] } },
    });
    const r = checkPremiseCoherence(mkSubject([defect]));
    expect(r.issues.join('\n')).toMatch(/53-read-side.*read-side.*enforces nothing/s);
  });

  it('read-side: corrected (forbid a real refused write) is quiet', () => {
    const fixed = single('53-read-side', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'cancelBooking' }] } }, // default preset = no booking → refused → coherent
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.issues).toEqual([]);
  });

  it('multi-turn: a case the replayer cannot construct is SKIPPED LOUDLY', () => {
    const multi: SubjectCase = {
      id: '20-multi-turn',
      setup: { preset: 'default' },
      turns: [{ userText: 'first' }, { userText: 'then' }],
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } },
    };
    // Pad with reached single-turn cases so the floor itself does not also fire — we assert the SKIP line.
    const filler = [1, 2, 3].map((n) => single(`f${n}`, { expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } } }));
    const r = checkPremiseCoherence(mkSubject([multi, ...filler]));
    expect(r.issues.join('\n')).toMatch(/SKIPPED "20-multi-turn": multi-turn/);
    expect(r.reached).toBe(3);
  });

  it('multi-turn: corrected to a single self-contained turn is reached and quiet', () => {
    const fixed = single('20-multi-turn', {
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.issues).toEqual([]);
    expect(r.reached).toBe(1);
  });

  it('required-write-refused: a case whose required write the preset refuses can never pass', () => {
    const defect = single('impossible', {
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([defect]));
    expect(r.issues.join('\n')).toMatch(/required write.*REFUSED.*can never pass/);
  });

  it('consent-timing (confirmed:true) forbidden entries are the two-step business — skipped, not fired', () => {
    const twoStep = single('two-step', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'chargeDeposit', anyArgs: { confirmed: true } }] } },
    });
    // chargeDeposit is always ACCEPTED by the world, so without the consent-timing skip this would fire.
    const r = checkPremiseCoherence(mkSubject([twoStep]));
    expect(r.issues).toEqual([]);
  });

  it('reached floor breaches when too many cases are skipped (pass-by-inability)', () => {
    const allMulti = [1, 2, 3].map((n) => ({
      id: `m${n}`,
      setup: { preset: 'default' },
      turns: [{ userText: 'a' }, { userText: 'b' }],
      expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } },
    }) as SubjectCase);
    const r = checkPremiseCoherence(mkSubject(allMulti), { reachedFloor: 0.5 });
    expect(r.reached).toBe(0);
    expect(r.issues.join('\n')).toMatch(/reached-verdict floor breached: 0\/3/);
  });
});
