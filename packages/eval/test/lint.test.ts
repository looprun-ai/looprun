/** The guard-purity lint rules (surviving goldens). */
import { describe, expect, it } from 'vitest';
import { lintSource } from '../src/lint.js';

describe('lint rules', () => {
  it('flags banned tokens, stateful regex, firewall reads and contract persona', () => {
    const spec = lintSource('src/agents/x/gen-spec.ts', [
      'const t = Date.now();',
      'if (/abc/g.test(x)) {}',
      'const u = ctx.userText;',
    ].join('\n'));
    expect(spec.map((s) => s.rule)).toEqual(['purity', 'stateful-regex', 's1-firewall']);
    expect(spec[0].line).toBe(1);

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
