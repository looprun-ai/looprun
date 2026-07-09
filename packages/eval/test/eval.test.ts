/** Fidelity goldens: invariant matcher, merge math, lint rules, cert aggregation. */
import { describe, expect, it } from 'vitest';
import { toolCallMatches, toolCallFailures, mergeVerdicts, lintSource, checkConfig } from '../src/index.js';
import type { DumpRecord, Verdict, AutoFail } from '../src/index.js';

describe('invariant matcher (certified semantics)', () => {
  it('anyArgs is a shallow subset match with strict equality', () => {
    const obs = { name: 'generateImage', args: { aspectRatio: '9:16', n: 1 }, tookEffect: true };
    expect(toolCallMatches(obs, { name: 'generateImage' })).toBe(true);
    expect(toolCallMatches(obs, { name: 'generateImage', anyArgs: { aspectRatio: '9:16' } })).toBe(true);
    expect(toolCallMatches(obs, { name: 'generateImage', anyArgs: { aspectRatio: '1:1' } })).toBe(false);
    expect(toolCallMatches(obs, { name: 'generateImage', anyArgs: { n: '1' } })).toBe(false); // strict !==
    expect(toolCallMatches(obs, { name: 'editImage' })).toBe(false);
  });

  it('required missing / forbidden tookEffect produce the certified messages', () => {
    const observed = [
      { name: 'editImage', args: {}, tookEffect: true },
      { name: 'deleteAll', args: {}, tookEffect: false },
    ];
    const fails = toolCallFailures(
      { requiredToolCalls: [{ name: 'refineImage' }], forbiddenToolCalls: [{ name: 'editImage' }, { name: 'deleteAll' }] },
      observed,
    );
    expect(fails).toHaveLength(2);
    expect(fails[0]).toContain('requiredToolCall refineImage({}) missing — observed [editImage, deleteAll]');
    expect(fails[1]).toContain('forbiddenToolCall editImage({}) took effect');
    // forbidden with tookEffect:false does NOT fire (denied/no-effect calls are exonerated)
    expect(fails.some((f) => f.startsWith('forbiddenToolCall deleteAll'))).toBe(false);
  });
});

describe('merge math (certified semantics)', () => {
  const rec = (caseId: string, rep = 0): DumpRecord => ({
    caseId, rep, goldSeq: [], goldReply: [], actualReply: [''], actualTrace: [], actualCalls: [],
    status: 'ran', invariantFailures: [], judgeVerdict: null, judgeReasoning: [],
  });
  const v = (caseId: string, overall: 'pass' | 'fail', rep = 0): Verdict => ({ caseId, rep, verdicts: [], overall });

  it('autofail wins; missing verdict = fail loudly; pass counted', () => {
    const dump = [rec('01-a'), rec('02-b'), rec('03-c'), rec('04-d')];
    const autofails: AutoFail[] = [{ caseId: '02-b', rep: 0, reason: 'invariant: x' }];
    const verdicts = [v('01-a', 'pass'), v('03-c', 'fail'), v('02-b', 'pass') /* ignored: autofail wins */];
    const res = mergeVerdicts(dump, verdicts, autofails);
    expect(res).toMatchObject({ judged: 2, autofail: 1, missing: 1, pass: 1, total: 4 });
    expect(dump.find((r) => r.caseId === '01-a')!.status).toBe('pass');
    expect(dump.find((r) => r.caseId === '02-b')!.status).toBe('fail'); // autofail beats the pass verdict
    expect(dump.find((r) => r.caseId === '03-c')!.status).toBe('fail');
    expect(dump.find((r) => r.caseId === '04-d')!.status).toBe('fail'); // unjudged → fail
    expect(dump.find((r) => r.caseId === '04-d')!.judgeVerdict).toBeNull();
  });

  it('keys by caseId#rep', () => {
    const dump = [rec('01-a', 0), rec('01-a', 1)];
    const res = mergeVerdicts(dump, [v('01-a', 'pass', 1)], []);
    expect(dump[0].status).toBe('fail'); // rep 0 unjudged
    expect(dump[1].status).toBe('pass');
    expect(res.missing).toBe(1);
  });
});

describe('lint rules', () => {
  it('flags banned tokens, stateful regex, firewall reads and theme persona', () => {
    const spec = lintSource('src/agents/x/gen-spec.ts', [
      'const t = Date.now();',
      'if (/abc/g.test(x)) {}',
      'const u = ctx.userText;',
    ].join('\n'));
    expect(spec.map((s) => s.rule)).toEqual(['purity', 'stateful-regex', 's1-firewall']);
    expect(spec[0].line).toBe(1);

    const theme = lintSource('src/agents/x/theme.ts', "  persona: 'never here',\n  voice: 'ok',");
    expect(theme.map((s) => s.rule)).toEqual(['theme-persona']);

    // persona in a NON-theme file is fine (it belongs on specs)
    expect(lintSource('src/agents/x/gen-spec.ts', "  persona: 'You are…',")).toEqual([]);
  });

  it('self-test: the lint fires on every rule (a lint that cannot fail is no law)', () => {
    expect(lintSource('a.ts', 'fetch("x")')).not.toEqual([]);
    expect(lintSource('a.ts', 'generateText({})')).not.toEqual([]);
    expect(lintSource('a.ts', 'Math.random()')).not.toEqual([]);
  });
});

describe('checkConfig', () => {
  it('catches caseMap gaps, double-mapping and world-seam holes', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec: any = { id: 'a1', surface: { tools: ['t1'] }, theme: { voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'l' } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      domain: 'd',
      specs: { a1: spec },
      worldFactory: () => ({ exec: () => ({}), advanceTurn: () => {}, ingestAttachment: () => '', toolCalls: [], sseActions: [] }),
      toolDefs: [{ name: 't1', description: '', inputSchema: {} }],
      cases: [
        { id: '01-a', title: '', setup: { preset: 'p' }, turns: [{ userText: 'x' }], expectations: { rubric: [{ id: 'r', description: 'd' }] } },
        { id: '02-b', title: '', setup: { preset: 'p' }, turns: [{ userText: 'x' }], expectations: { rubric: [{ id: 'r', description: 'd' }] } },
        { id: 'bad_id', title: '', setup: { preset: 'p' }, turns: [{ userText: 'x' }], expectations: { rubric: [{ id: 'r', description: 'd' }] } },
      ],
      caseMap: { a1: ['01-a', '01-a'], ghost: ['02-b'] },
    };
    const msgs = checkConfig(config).filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs.some((m) => m.includes('bad_id'))).toBe(true);
    expect(msgs.some((m) => m.includes('mapped to both'))).toBe(true);
    expect(msgs.some((m) => m.includes('"ghost" is not in specs'))).toBe(true);
    expect(msgs.some((m) => m.includes('not mapped to any agent'))).toBe(true);
  });
});
