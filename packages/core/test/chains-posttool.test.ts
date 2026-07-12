/**
 * The postTool (OUTPUT-dim) enforcement + the flowChain completion pass — the two additive
 * governed-turn mechanisms, driven without a live model.
 */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  createLedger,
  recordToolResult,
  enforcePostTool,
  shouldFireChain,
  runChainCompletionPass,
  resultInvariant,
  finalizeReply,
  custom,
} from '../src/index.js';
import type { AgentWorld, ChainSpec, GuardCtx, TrunkTheme, ObservedCall } from '../src/index.js';

const persona = 'You are the test agent.';
const THEME: TrunkTheme = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
};

function fixtureWorld(exec?: (name: string, args: Record<string, unknown>) => unknown): AgentWorld {
  return {
    exec: exec ?? (() => ({ success: true })),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
  };
}

describe('enforcePostTool (OUTPUT-dim result invariants)', () => {
  it('collects an output correction + a reply violation for each failing invariant', async () => {
    const g = resultInvariant((r) => (r as { ok?: boolean }).ok === true, 'The result was not ok.');
    const ctx: GuardCtx = { args: {}, tool: 'save', world: fixtureWorld(), observed: [], turnIndex: 0, result: { ok: false } };
    const out = await enforcePostTool([g], ctx);
    expect(out.corrections).toEqual(['output:resultInvariant:save']);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0].reason).toBe('The result was not ok.');
  });

  it('is a no-op when every invariant passes', async () => {
    const g = resultInvariant((r) => (r as { ok?: boolean }).ok === true, 'nope');
    const ctx: GuardCtx = { args: {}, tool: 'save', world: fixtureWorld(), observed: [], turnIndex: 0, result: { ok: true } };
    expect(await enforcePostTool([g], ctx)).toEqual({ corrections: [], violations: [] });
  });

  it('postToolViolations on the ledger join the finalizeReply violation set (relayed once via redrive)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['save'], theme: THEME });
    const ledger = createLedger();
    ledger.postToolViolations.push({
      guard: custom({ kind: 'resultInvariant', dim: 'output', check: () => null, prose: () => '' }),
      reason: 'Report the real saved state.',
    });
    const seen: string[] = [];
    const out = await finalizeReply(spec, THEME, fixtureWorld(), ledger, 'All good.', async (m) => { seen.push(m); return 'Saved with the real state.'; }, 1);
    expect(seen[0]).toContain('Report the real saved state.');
    expect(out.text).toBe('Saved with the real state.');
    expect(ledger.turnCorrections).toContain('redrive:resultInvariant');
  });
});

describe('shouldFireChain', () => {
  const chain: ChainSpec = { after: 'a', call: 'b', mode: 'direct' };
  const obs = (calls: Array<[string, boolean]>): ObservedCall[] =>
    calls.map(([name, ok]) => ({ name, args: {}, ok, turnIndex: 0 }));

  it('fires when `after` ran OK this turn and `call` is missing', () => {
    expect(shouldFireChain(chain, fixtureWorld(), obs([['a', true]]), 0)).toBe(true);
  });
  it('does not fire when `after` did not run OK', () => {
    expect(shouldFireChain(chain, fixtureWorld(), obs([['a', false]]), 0)).toBe(false);
  });
  it('does not fire when `call` already ran OK', () => {
    expect(shouldFireChain(chain, fixtureWorld(), obs([['a', true], ['b', true]]), 0)).toBe(false);
  });
  it('honors the `when` predicate (world/observed only)', () => {
    const gated: ChainSpec = { ...chain, when: (w) => (w as { go?: boolean }).go === true };
    expect(shouldFireChain(gated, fixtureWorld(), obs([['a', true]]), 0)).toBe(false);
    expect(shouldFireChain({ ...gated }, { ...fixtureWorld(), go: true }, obs([['a', true]]), 0)).toBe(true);
  });
});

describe('runChainCompletionPass (direct mode)', () => {
  function harness(chain: ChainSpec, opts: { deny?: boolean; terminalReplyPresent?: boolean } = {}) {
    const ledger = createLedger();
    recordToolResult(ledger, 'a', {}, { success: true }); // `after` ran OK this turn
    const execed: string[] = [];
    const world = fixtureWorld((name) => { execed.push(name); return { success: true }; });
    return {
      ledger, execed, world,
      ctx: {
        world,
        observed: ledger.observed,
        turnIndex: 0,
        terminalReplyPresent: opts.terminalReplyPresent ?? true,
        beforeToolCall: async () => (opts.deny ? { proceed: false as const, output: { error: 'nope' } } : undefined),
        afterToolCall: async ({ toolName, input, output }: { toolName: string; input: unknown; output?: unknown }) =>
          recordToolResult(ledger, toolName, (input ?? {}) as Record<string, unknown>, output),
        forceLlmCall: async () => {},
      },
    };
  }

  it('fires a missing follow-up through the guard-checked path + emits a restate violation', async () => {
    const h = harness({ after: 'a', call: 'b', mode: 'direct', args: { x: 1 } });
    const res = await runChainCompletionPass([{ after: 'a', call: 'b', mode: 'direct', args: { x: 1 } }], h.ctx);
    expect(h.execed).toEqual(['b']);
    expect(res.corrections).toEqual(['chain:b']);
    expect(res.replyViolations).toHaveLength(1);
    expect(res.replyViolations[0].guard.kind).toBe('chainRestate');
  });

  it('records chain-vetoed and never calls the world when a preTool guard denies', async () => {
    const h = harness({ after: 'a', call: 'b', mode: 'direct' }, { deny: true });
    const res = await runChainCompletionPass([{ after: 'a', call: 'b', mode: 'direct' }], h.ctx);
    expect(h.execed).toEqual([]);
    expect(res.corrections).toEqual(['chain-vetoed:b']);
    expect(res.replyViolations).toHaveLength(0);
  });

  it('skips (no work) when the trigger does not fire', async () => {
    const ledger = createLedger(); // `after` never ran
    const res = await runChainCompletionPass([{ after: 'a', call: 'b', mode: 'direct' }], {
      world: fixtureWorld(), observed: ledger.observed, turnIndex: 0, terminalReplyPresent: true,
      beforeToolCall: async () => undefined, afterToolCall: async () => {}, forceLlmCall: async () => {},
    });
    expect(res).toEqual({ corrections: [], replyViolations: [], llmCalls: 0 });
  });

  it('omits the restate violation when no terminal reply exists yet', async () => {
    const h = harness({ after: 'a', call: 'b', mode: 'direct' }, { terminalReplyPresent: false });
    const res = await runChainCompletionPass([{ after: 'a', call: 'b', mode: 'direct' }], h.ctx);
    expect(res.corrections).toEqual(['chain:b']);
    expect(res.replyViolations).toHaveLength(0);
  });
});
