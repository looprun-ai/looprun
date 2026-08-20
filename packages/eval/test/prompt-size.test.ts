import { describe, expect, it } from 'vitest';
import { AgentFactory, factsFromWorld, PromptWriter } from '@looprun-ai/core';
import { echoes, promptLines } from '../src/lints.js';

const SUBJECTS = ['atlas-next', 'atlas-skill'] as const;

describe('prompt size per desk', () => {
  it('prints the two Atlas authorings', async () => {
    for (const name of SUBJECTS) {
      const base = `/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/${name}`;
      const { contract, specs } = await import(`${base}/subject.ts`);
      const { subjectWorld } = await import(`${base}/subject.ts`);
      const facts = factsFromWorld(subjectWorld);
      let system = 0, cards = 0; const by: Record<number, number> = {};
      const desks = Object.values(specs) as any[];
      for (const spec of desks) {
        const compiled = new AgentFactory().governed(spec, contract, facts);
        const pw = new PromptWriter(compiled);
        const s = pw.system();
        system += s.length;
        cards += pw.toolCards().reduce((n: number, c: any) => n + JSON.stringify(c).length, 0);
        for (const f of [5,7,9]) { by[f] = (by[f] ?? 0) + echoes(promptLines(compiled as any, s), f).length; }
      }
      console.log(name.padEnd(12), 'desks', desks.length,
        '| system', system, `(${Math.round(system / desks.length)}/desk)`,
        '| cards', cards, '| total', system + cards, '| echoes@5/7/9', by[5], by[7], by[9]);
    }
    expect(true).toBe(true);
  });
});
