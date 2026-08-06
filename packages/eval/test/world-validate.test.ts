/**
 * `looprun-eval validate` world layers (`checkWorldModel`). Drives the three checks off a
 * `gen/world.json` written to a temp dir: preset distinguishability, simulate≡act identity, and
 * determinism. A subject WITHOUT a world.json yields no world issues — a TS world is not validated
 * from a spec.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkWorldModel } from '../src/validate.js';

/** A well-formed asset world: two distinguishable presets, one simulatable tool. */
const goodWorld = {
  clock: '2026-07-01',
  entities: {
    asset: { idPrefix: 'ast', states: ['available', 'out'], fields: { requiredDeposit: 'money' } },
    booking: { idPrefix: 'bk', states: ['active'] },
  },
  seed: { asset: [{ id: 'ast_1', status: 'available', requiredDeposit: 300 }] },
  presets: {
    default: [],
    primed: [{ op: 'setCounter', entity: 'booking', value: 5 }],
  },
  tools: {
    reserve: {
      kind: 'write',
      args: [{ name: 'assetId', type: 'string' }, { name: 'depositHeld', type: 'number' }],
      gates: [{ kind: 'fieldAtLeast', field: 'depositHeld', min: { ref: 'asset.requiredDeposit' }, error: 'DEPOSIT_NOT_COVERED' }],
      create: { entity: 'booking', id: 'counter', idKey: 'bookingId' },
    },
    refund: {
      kind: 'write',
      simulatable: true,
      args: [{ name: 'bookingId', type: 'string' }, { name: 'simulate', type: 'boolean', optional: true }],
      create: { entity: 'booking', id: { fixed: 'bk_refund' }, idKey: 'refundId' },
    },
  },
};

function writeSubject(world: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'looprun-world-'));
  mkdirSync(join(dir, 'gen'), { recursive: true });
  writeFileSync(join(dir, 'gen', 'world.json'), JSON.stringify(world));
  return dir;
}

describe('checkWorldModel — a clean world.json', () => {
  let dir: string;
  beforeAll(() => {
    dir = writeSubject(goodWorld);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reports no issues', () => {
    expect(checkWorldModel(dir)).toEqual([]);
  });
});

describe('checkWorldModel — no world.json', () => {
  it('returns empty (a TS world has no spec to validate)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-noworld-'));
    expect(checkWorldModel(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('checkWorldModel — preset distinguishability FIRES', () => {
  it('a preset whose projection equals default is flagged as indistinguishable', () => {
    // `dead` applies a no-op delta (patch a record that is not seeded) → projection == default.
    const world = {
      ...goodWorld,
      presets: { default: [], dead: [{ op: 'patch', entity: 'asset', id: 'ast_missing', set: { status: 'out' } }] },
    };
    const dir = writeSubject(world);
    const issues = checkWorldModel(dir);
    expect(issues.some((i) => /preset "dead" is INDISTINGUISHABLE/.test(i))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('checkWorldModel — a malformed world.json', () => {
  it('reports a single load failure (schema layer names it too)', () => {
    const dir = writeSubject({ clock: '2026-07-01', tools: {}, presets: {}, bogus: 1 });
    const issues = checkWorldModel(dir);
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/failed to load/);
    rmSync(dir, { recursive: true, force: true });
  });
});
