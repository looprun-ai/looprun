/**
 * The `evals/cases.json` schema (spec §1) — the exam as strict data, so a bulk regex edit can no
 * longer corrupt a batch of cases. Proves: a valid config maps to the runtime `SubjectCase` shape and
 * lifts per-case `agent` into a routing map; an unknown key fails by name; a duplicate id fails; and
 * `loadSubject` PREFERS `evals/cases.json` when present, falling back to `evals/cases.ts` otherwise.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CasesConfigError, loadCasesConfig, parseCasesConfig } from '../src/cases-config.js';
import { loadSubject } from '../src/subject.js';

const TOY = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/toy-subject');

const validJson = {
  cases: [
    {
      id: '72-maintenance-lifecycle',
      agent: 'front-desk',
      setup: { preset: 'default' },
      turns: [{ userText: 'Complete maintenance on the generator.' }],
      invariants: {
        required: [{ tool: 'reserveRoom', anyArgs: { memberId: 'mem_ana' } }],
        forbidden: [{ tool: 'registerVisitor' }],
        noEffect: [{ tool: 'reserveRoom', anyArgs: { memberId: 'mem_zz9' } }],
      },
      rubric: [{ id: 'r1', description: 'confirms with the id', critical: true }],
      targets: ['agent:reserveRequiresLookup'],
      predict: 'governed passes, ungoverned fabricates',
    },
  ],
};

describe('cases.json schema + loader', () => {
  it('maps a valid config to SubjectCase[] and lifts agent routing', () => {
    const parsed = parseCasesConfig(validJson);
    expect(parsed.caseAgent).toEqual({ '72-maintenance-lifecycle': 'front-desk' });
    const [c] = parsed.cases;
    expect(c.id).toBe('72-maintenance-lifecycle');
    expect(c.setup?.preset).toBe('default');
    expect(c.expectations?.invariants?.requiredToolCalls).toEqual([{ name: 'reserveRoom', anyArgs: { memberId: 'mem_ana' } }]);
    expect(c.expectations?.invariants?.forbiddenToolCalls).toEqual([{ name: 'registerVisitor' }]);
    expect(c.expectations?.invariants?.noEffectToolCalls).toEqual([{ name: 'reserveRoom', anyArgs: { memberId: 'mem_zz9' } }]);
    expect(c.expectations?.rubric?.[0]).toEqual({ id: 'r1', description: 'confirms with the id', critical: true });
    expect(c.targets).toEqual(['agent:reserveRequiresLookup']);
  });

  it('loadCasesConfig returns just the cases array', () => {
    expect(loadCasesConfig(validJson)).toHaveLength(1);
  });

  it('an unknown key fails by name (strict)', () => {
    const bad = { cases: [{ ...validJson.cases[0], oops: 1 }] };
    expect(() => parseCasesConfig(bad)).toThrow(CasesConfigError);
  });

  it('a duplicate case id fails', () => {
    const dup = { cases: [validJson.cases[0], validJson.cases[0]] };
    expect(() => parseCasesConfig(dup)).toThrow(/duplicate case id/);
  });

  it('an invariant entry using the runtime `name` key (not `tool`) is rejected', () => {
    const bad = { cases: [{ ...validJson.cases[0], invariants: { required: [{ name: 'reserveRoom' }] } }] };
    expect(() => parseCasesConfig(bad)).toThrow(CasesConfigError);
  });
});

// ── loadSubject prefers cases.json, and still falls back to cases.ts ──────────────────────────────

const scratch: string[] = [];
afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

function copyToy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'looprun-json-subj-'));
  cpSync(TOY, dir, { recursive: true });
  scratch.push(dir);
  return dir;
}

describe('loadSubject — cases.json preference with TS fallback', () => {
  it('falls back to evals/cases.ts when no cases.json (both bundles keep working)', async () => {
    const subject = await loadSubject(TOY);
    expect(subject.cases).toHaveLength(3); // the TS pack
  });

  it('prefers evals/cases.json when present, and its per-case agent routes', async () => {
    const dir = copyToy();
    writeFileSync(join(dir, 'evals', 'cases.json'), JSON.stringify(validJson));
    const subject = await loadSubject(dir);
    expect(subject.cases).toHaveLength(1); // the JSON pack won
    expect(subject.cases[0].id).toBe('72-maintenance-lifecycle');
    expect(subject.caseAgent['72-maintenance-lifecycle']).toBe('front-desk');
  });
});
