/** The three bars a skill-authored Atlas answers to, measured against the hand-authored one
 *  in the same run. Determinism is every acting tool carrying a check; tokens are the bytes
 *  the six desks send every turn; the echo count is how often one law is paid for twice. */
import { describe, expect, it } from 'vitest';
import { AgentFactory, factsFromWorld, PromptWriter } from '@looprun-ai/core';
import { doubleStated, echoes, pairing, profile, promptLines, unlicensed } from '../src/lints.js';

const SUBJECTS = ['atlas-next', 'atlas-render-handfixed', 'atlas-render2', 'atlas-emit'] as const;
const ACTING_EFFECTS = ['write', 'destructive'];

describe('the Atlas bars', () => {
  it('prints every subject against the same ruler', async () => {
    for (const name of SUBJECTS) {
      const base = `/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/${name}`;
      let loaded;
      try {
        loaded = await import(`${base}/subject.ts`);
      } catch (e) {
        console.log(name.padEnd(13), 'NOT LOADABLE —', String(e).slice(0, 120));
        continue;
      }
      const { contract, specs, subjectWorld } = loaded;
      const facts = factsFromWorld(subjectWorld);
      const acting = Object.values(facts.tools)
        .filter((f: any) => ACTING_EFFECTS.includes(f.effect))
        .map((f: any) => f.name);

      let system = 0;
      let cards = 0;
      let rows = 0;
      const desks = Object.values(specs) as any[];
      for (const spec of desks) {
        const compiled = new AgentFactory().governed(spec, contract, facts);
        const prefix = new PromptWriter(compiled).system();
        system += prefix.length;
        cards += new PromptWriter(compiled).toolCards()
          .reduce((n: number, c: any) => n + JSON.stringify(c).length, 0);
        rows += echoes(promptLines(compiled as any, prefix)).length;
      }
      const p = profile(base, acting);
      console.log(name.padEnd(13),
        '| checks', String(p.checks).padStart(3),
        '| acting', `${p.actingChecked}/${p.acting}`,
        '| unchecked', String(p.unchecked.length).padStart(2),
        '| prompt', String(system + cards).padStart(7),
        '| echoes', String(rows).padStart(4),
        '| dbl', String(doubleStated(base).length).padStart(3),
        '| unlicensed', String(unlicensed(base).length).padStart(3),
        '| pairing', pairing(base).length);
      if (p.unchecked.length > 0) console.log('   unchecked acts:', p.unchecked.join(', '));
    }
    expect(true).toBe(true);
  });
});
