/** The guard-purity lint rules (surviving goldens). */
import { describe, expect, it } from 'vitest';
import { lintSource } from '../src/lint.js';

describe('lint rules', () => {
  it('flags banned tokens, stateful regex and contract persona', () => {
    const spec = lintSource('src/agents/x/gen-spec.ts', [
      'const t = Date.now();',
      'if (/abc/g.test(x)) {}',
    ].join('\n'));
    expect(spec.map((s) => s.rule)).toEqual(['purity', 'stateful-regex']);
    expect(spec[0].line).toBe(1);

    // firewall retired (2026-08-02): reading user text / history is no longer a finding.
    expect(lintSource('src/agents/x/gen-spec.ts', 'const u = ctx.userText;\nconst h = ctx.history;')).toEqual([]);

    const contract = lintSource('src/agents/x/contract.ts', "  persona: 'never here',\n  voice: 'ok',");
    expect(contract.map((s) => s.rule)).toEqual(['contract-persona']);

    // persona in a NON-contract file is fine (it belongs on specs)
    expect(lintSource('src/agents/x/gen-spec.ts', "  persona: 'You are…',")).toEqual([]);
  });

  it('self-test: the lint fires on every rule (a lint that cannot fail is no law)', () => {
    expect(lintSource('a.ts', 'fetch("x")')).not.toEqual([]);
    expect(lintSource('a.ts', 'generateText({})')).not.toEqual([]);
    expect(lintSource('a.ts', 'Math.random()')).not.toEqual([]);
  });
});

// ── Execution-based spec-quality checks (unsat pairs + order cycles) ─────────────────────────────
import { AgentSpecBase, custom, replyConfirmsLabels, requiresBefore } from '@looprun-ai/core';
import { lintSpecExecution } from '../src/lint.js';

function cleanSpec() {
  const spec = new AgentSpecBase({ id: 'clean', mode: 'M', persona: 'You are clean.', tools: ['a', 'b'] });
  spec.addGuard('preTool', ['b'], requiresBefore(['a']), { id: 'agent:order' });
  spec.addReplyCheck(replyConfirmsLabels(['REF-1'], 'name the reference'), { id: 'agent:labels' });
  return spec;
}

describe('lintSpecExecution — unsatisfiable reply requirements', () => {
  it('clean spec: no findings', async () => {
    expect(await lintSpecExecution({ clean: cleanSpec() })).toEqual([]);
  });

  it('reports UNSAT-RISK when a required label is vetoed by another onReply guard (custom banRe)', async () => {
    const spec = new AgentSpecBase({ id: 'unsat', mode: 'M', persona: 'You are unsat.', tools: ['a'] });
    spec.addReplyCheck(replyConfirmsLabels(['REF-1'], 'name the reference'), { id: 'agent:labels' });
    spec.addReplyCheck(
      custom({
        kind: 'banInternalRefs',
        dim: 'behavior',
        check: (ctx) => (/REF-\d+/.test(ctx.reply ?? '') ? 'Never expose internal reference codes.' : null),
        prose: () => 'never expose internal reference codes',
      }),
      { id: 'agent:banRefs' },
    );
    const findings = await lintSpecExecution({ unsat: spec });
    expect(findings.some((f) => f.includes('UNSAT-RISK') && f.includes('agent:labels') && f.includes('agent:banRefs') && f.includes('"REF-1"'))).toBe(true);
  });

  it('a throwing check() is its own finding, not a crash', async () => {
    const spec = new AgentSpecBase({ id: 'thrower', mode: 'M', persona: 'You are thrower.', tools: ['a'] });
    spec.addReplyCheck(replyConfirmsLabels(['REF-1'], 'name it'), { id: 'agent:labels' });
    spec.addReplyCheck(
      custom({ kind: 'boom', dim: 'behavior', check: () => { throw new Error('kaput'); }, prose: () => 'x' }),
      { id: 'agent:boom' },
    );
    const findings = await lintSpecExecution({ thrower: spec });
    expect(findings.some((f) => f.includes('THREW') && f.includes('agent:boom'))).toBe(true);
  });
});

describe('lintSpecExecution — ordering cycles', () => {
  it('reports ORDER-CYCLE for a planted requiresBefore cycle', async () => {
    const spec = new AgentSpecBase({ id: 'cyclic', mode: 'M', persona: 'You are cyclic.', tools: ['a', 'b'] });
    spec.addGuard('preTool', ['a'], requiresBefore(['b']), { id: 'agent:aAfterB' });
    spec.addGuard('preTool', ['b'], requiresBefore(['a']), { id: 'agent:bAfterA' });
    const findings = await lintSpecExecution({ cyclic: spec });
    expect(findings.some((f) => f.includes('ORDER-CYCLE'))).toBe(true);
  });

  it('reports ORDER-CYCLE when a chain follow-up closes the loop', async () => {
    const spec = new AgentSpecBase({
      id: 'chainCycle', mode: 'M', persona: 'You are chained.', tools: ['a', 'b'],
      chains: [{ after: 'b', call: 'a', mode: 'direct' }],
    });
    spec.addGuard('preTool', ['b'], requiresBefore(['a']), { id: 'agent:bAfterA' });
    // b requires a before; the chain forces a AFTER b — a → b → a.
    const findings = await lintSpecExecution({ chainCycle: spec });
    expect(findings.some((f) => f.includes('ORDER-CYCLE'))).toBe(true);
  });
});
