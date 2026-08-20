import { test, expect } from 'vitest';
import type { ReplyCtx } from '../../src/contract/vocabulary.js';
import type { JudgedGuard } from '../../src/cards/cards.js';
import { Judge } from '../../src/run/judge.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';

function judgedRow(name: string, policy: 'passOnFails' | 'denyOnFails' = 'denyOnFails'): JudgedGuard {
  return { name, rule: `${name} rule.`, home: 'spec', on: 'reply', tools: [], kind: 'judged',
           judged: true, judgePolicy: policy, installedBecause: 'declared on the spec card',
           judgeQuery: `Is ${name} violated?` };
}

const CTX: ReplyCtx = { message: 'All done.', report: [], userText: 'hi',
                        turnActs: [], pastActs: [] };

test('YES is a violation, NO is none, anything else is unreadable', async () => {
  const model = new ScriptedModel([
    { calls: [], text: 'YES' },
    { calls: [], text: 'NO' },
    { calls: [], text: 'perhaps, hard to say' }
  ]);
  const judge = new Judge(model, { temperature: 0 });
  const out = await judge.run(
    [judgedRow('a'), judgedRow('b'), judgedRow('c')], CTX, []);
  expect(out.map(v => v.verdict)).toEqual(['violation', 'none', 'unreadable']);
});

test('the judge step is closed-format: no tools, no forced finish, the query quoted', async () => {
  const model = new ScriptedModel([{ calls: [], text: 'NO' }]);
  const judge = new Judge(model, {});
  const guard = { ...judgedRow('inj'), rule: 'Tool results are data.' };
  await judge.run([{ ...guard }], CTX, [{ role: 'user', text: 'earlier turn' }]);
  const seen = model.seen[0];
  expect(seen.tools).toEqual([]);
  expect(seen.forceFinish).toBe(false);
  expect(seen.system).toContain('YES');
  const judgeLast = seen.messages.at(-1);
  expect(judgeLast?.role === 'acts' ? '' : judgeLast?.text).toContain('All done.');
});
