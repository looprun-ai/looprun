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
import type { AgentWorld, ToolDef } from '@looprun-ai/core';
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

function mkSubject(cases: SubjectCase[], toolDefs: ToolDef[] = []): Subject {
  return {
    dir: '/fake',
    specs: {},
    contract: {} as never,
    caseAgent: {},
    cases,
    toolDefs,
    makeWorld: (preset?: string) => new ShopWorld(preset),
  };
}

/** A toolDef whose schema marks the given args required — used to reproduce the reception-refusal
 *  misread (defect 2): an invariant that omits one of these under-specifies the call. */
const toolDef = (name: string, required: string[]): ToolDef => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: Object.fromEntries(required.map((k) => [k, { type: 'string' }])), required },
});

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
    expect(r.blocking.join('\n')).toMatch(/19-accept-when-forbid.*ACCEPTED.*forbids nothing/s);
  });

  it('accept-when-should-forbid: corrected (world REFUSES the forbidden write) is quiet', () => {
    const fixed = single('19-accept-when-forbid', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.blocking).toEqual([]);
  });

  it('read-side: a forbidden entry naming a pure READ fires', () => {
    const defect = single('53-read-side', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'getStatus' }] } },
    });
    const r = checkPremiseCoherence(mkSubject([defect]));
    expect(r.blocking.join('\n')).toMatch(/53-read-side.*read-side.*enforces nothing/s);
  });

  it('read-side: corrected (forbid a real refused write) is quiet', () => {
    const fixed = single('53-read-side', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'cancelBooking' }] } }, // default preset = no booking → refused → coherent
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.blocking).toEqual([]);
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
    expect(r.advisory.join('\n')).toMatch(/SKIPPED "20-multi-turn": multi-turn/);
    expect(r.reached).toBe(3);
    expect(r.blocking).toEqual([]); // defect 1: a SKIP does NOT block when the floor is green
  });

  it('multi-turn: corrected to a single self-contained turn is reached and quiet', () => {
    const fixed = single('20-multi-turn', {
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([fixed]));
    expect(r.blocking).toEqual([]);
    expect(r.reached).toBe(1);
  });

  it('required-write-refused: a case whose required write the preset refuses can never pass', () => {
    const defect = single('impossible', {
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([defect]));
    expect(r.blocking.join('\n')).toMatch(/required write.*REFUSED.*can never pass/);
  });

  it('consent-timing (confirmed:true) forbidden entries are the two-step business — skipped, not fired', () => {
    const twoStep = single('two-step', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'chargeDeposit', anyArgs: { confirmed: true } }] } },
    });
    // chargeDeposit is always ACCEPTED by the world, so without the consent-timing skip this would fire.
    const r = checkPremiseCoherence(mkSubject([twoStep]));
    expect(r.blocking).toEqual([]);
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
    expect(r.blocking.join('\n')).toMatch(/reached-verdict floor breached: 0\/3/);
  });
});

describe('premise coherence — under-specified replay is OUT OF JURISDICTION, not a refusal (defect 2)', () => {
  // completeMaintenance's schema requires BOTH assetId and bay; an invariant that carries only
  // assetId is subset-pinned — the world's RECEPTION would refuse for the missing arg, which says
  // nothing about the premise. The instrument declines jurisdiction rather than misread a refusal.
  const defs = [toolDef('completeMaintenance', ['assetId', 'bay'])];

  it('a required write missing a schema-required arg is SKIPPED (advisory), never "can never pass"', () => {
    const underSpec = single('underspec', {
      // assetId ast_road WOULD be refused by the world — but the missing `bay` means the replay
      // never even reaches that gate; it is out of jurisdiction, not a false "can never pass".
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } },
    });
    // One reached filler so the floor stays green and only the SKIP is under test.
    const filler = single('ok', { expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } } });
    const r = checkPremiseCoherence(mkSubject([underSpec, filler], defs));
    expect(r.blocking).toEqual([]); // NOT flagged "can never pass"
    expect(r.advisory.join('\n')).toMatch(/SKIPPED "underspec".*omits schema-required arg\(s\) bay.*jurisdiction.*subset-pinned/s);
    expect(r.reached).toBe(1); // the filler; the under-specified case is out of jurisdiction
    expect(r.outOfJurisdiction).toBe(1);
  });

  it('a forbidden entry missing a schema-required arg is SKIPPED (advisory), not classified', () => {
    const underSpec = single('underspec-forbid', {
      expectations: { invariants: { forbiddenToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } },
    });
    const filler = single('ok', { expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } } });
    const r = checkPremiseCoherence(mkSubject([underSpec, filler], defs));
    expect(r.blocking).toEqual([]);
    expect(r.advisory.join('\n')).toMatch(/SKIPPED "underspec-forbid".*omits schema-required arg\(s\) bay.*jurisdiction/s);
  });

  it('a FULLY-specified required write genuinely refused by the world STILL blocks (real defect intact)', () => {
    const genuine = single('genuine-refused', {
      // Both required args present, so the replay reaches the world gate — which refuses ast_road.
      expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road', bay: 'b1' } }] } },
    });
    const r = checkPremiseCoherence(mkSubject([genuine], defs));
    expect(r.blocking.join('\n')).toMatch(/genuine-refused.*REFUSED.*can never pass/);
  });

  it('(a) under-spec skips that WOULD breach the old flat ratio leave the denominator → stays green', () => {
    // 1 reached case + 2 subset-pinned cases. Old ratio 1/3 = 0.33 < 0.5 would have breached; the new
    // denominator drops the two jurisdiction declines: 1/(3−2) = 1.00, green, zero blocking.
    const reached = single('reached', { expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } } });
    const under1 = single('under1', { expectations: { invariants: { requiredToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_road' } }] } } });
    const under2 = single('under2', { expectations: { invariants: { forbiddenToolCalls: [{ name: 'completeMaintenance', anyArgs: { assetId: 'ast_shop' } }] } } });
    const r = checkPremiseCoherence(mkSubject([reached, under1, under2], defs), { reachedFloor: 0.5 });
    expect(r.reached).toBe(1);
    expect(r.outOfJurisdiction).toBe(2);
    expect(r.blocking).toEqual([]); // no floor breach — jurisdiction declines are not inability
  });

  it('(b) MULTI-TURN skips alone STILL breach the floor (inability path intact, unchanged)', () => {
    // Three multi-turn cases: all inability, none out of jurisdiction → denominator stays 3, 0/3 breach.
    const allMulti = [1, 2, 3].map((n) => ({
      id: `mt${n}`,
      setup: { preset: 'default' },
      turns: [{ userText: 'a' }, { userText: 'b' }],
      expectations: { invariants: { requiredToolCalls: [{ name: 'getStatus' }] } },
    }) as SubjectCase);
    const r = checkPremiseCoherence(mkSubject(allMulti, defs), { reachedFloor: 0.5 });
    expect(r.outOfJurisdiction).toBe(0);
    expect(r.blocking.join('\n')).toMatch(/reached-verdict floor breached: 0\/3/);
  });
});
