/**
 * llmCheck — the LLM-adjudicated guard kind (core unit level): the guard's own verdict semantics
 * (deny / allow / failMode), the fail-loud-at-start adjudicator gate, and the async-coexistence with a
 * deterministic guard. The full-loop behaviour (redrive, config load, case-35) is proven in the mastra
 * package; here everything runs against a crafted ctx / a built spec, no framework.
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentSpecBase, custom, llmCheck } from '../src/index.js';
import { assertAdjudicatorPresent, specInstallsLlmCheck } from '../src/internal.js';
import type { Adjudicator, GuardCtx } from '../src/index.js';

const persona = 'You are the test agent.';
const baseCtx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  args: {},
  world: { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] },
  observed: [],
  turnIndex: 0,
  userText: '',
  history: [],
  reply: 'anything',
  ...over,
});

describe('llmCheck — verdict semantics', () => {
  it('returns the adjudicator violation VERBATIM as the deny', async () => {
    const adjudicator: Adjudicator = async () => ({ violation: 'the user never authorised THIS act' });
    const reason = await llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator }));
    expect(reason).toBe('the user never authorised THIS act');
  });

  it('null verdict → allow (null)', async () => {
    const adjudicator: Adjudicator = async () => ({ violation: null });
    expect(await llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator }))).toBeNull();
  });

  it('the rubric is passed to the adjudicator, with the full ctx', async () => {
    let seenRubric = '';
    let seenUserText = '';
    const adjudicator: Adjudicator = async (rubric, ctx) => {
      seenRubric = rubric;
      seenUserText = ctx.userText;
      return { violation: null };
    };
    await llmCheck({ rubric: 'did the yes cover this?' }).check(baseCtx({ adjudicator, userText: 'go ahead' }));
    expect(seenRubric).toBe('did the yes cover this?');
    expect(seenUserText).toBe('go ahead');
  });

  it('failMode open (default): an UNREACHABLE adjudicator (throws) allows', async () => {
    const adjudicator: Adjudicator = async () => { throw new Error('offline'); };
    expect(await llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator }))).toBeNull();
  });

  it('failMode closed: an UNREACHABLE adjudicator (throws) denies with a generic figure-free reason', async () => {
    const adjudicator: Adjudicator = async () => { throw new Error('offline'); };
    const reason = await llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator }));
    expect(reason).toMatch(/could not be completed/i);
  });

  it('a REJECTED promise is treated as unreachable too (failMode decides)', async () => {
    const adjudicator: Adjudicator = () => Promise.reject(new Error('timeout'));
    expect(await llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator }))).toBeNull();
    expect(await llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator }))).not.toBeNull();
  });

  it('THROWS (author bug) when no adjudicator is on the ctx — never a silent allow', async () => {
    await expect(llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator: undefined }))).rejects.toThrow(/no adjudicator/i);
  });

  it('dim selects the hook family: default behavior (onReply), run for preTool', () => {
    expect(llmCheck({ rubric: 'q?' }).dim).toBe('behavior');
    expect(llmCheck({ rubric: 'q?', dim: 'run' }).dim).toBe('run');
  });
});

describe('llmCheck — a HUNG adjudicator resolves via failMode (timeout), never hangs the turn', () => {
  it('never-settling adjudicator, failMode open → allows after the timeout (default 30000, fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const hung: Adjudicator = () => new Promise(() => {}); // never settles
      const p = llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator: hung })); // no ctx timeout → default 30000
      await vi.advanceTimersByTimeAsync(30000);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never-settling adjudicator, failMode closed → denies after the timeout with the generic reason', async () => {
    vi.useFakeTimers();
    try {
      const hung: Adjudicator = () => new Promise(() => {});
      const p = llmCheck({ rubric: 'q?', failMode: 'closed' }).check(baseCtx({ adjudicator: hung, adjudicatorTimeoutMs: 5000 }));
      await vi.advanceTimersByTimeAsync(5000);
      expect(await p).toMatch(/could not be completed/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fast adjudicator settles BEFORE the timeout and is unaffected', async () => {
    vi.useFakeTimers();
    try {
      const fast: Adjudicator = async () => ({ violation: 'quick deny' });
      const p = llmCheck({ rubric: 'q?' }).check(baseCtx({ adjudicator: fast, adjudicatorTimeoutMs: 30000 }));
      // do not advance the clock; the fast adjudicator resolves on its own microtask
      expect(await p).toBe('quick deny');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('assertAdjudicatorPresent — fail loud at conversation start', () => {
  const specWithLlmCheck = () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?' }), { id: 'agent:x' });
    return spec;
  };

  it('specInstallsLlmCheck detects an installed llmCheck on any hook', () => {
    expect(specInstallsLlmCheck(specWithLlmCheck())).toBe(true);
    expect(specInstallsLlmCheck(new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] }))).toBe(false);
  });

  it('throws a NAMED error when an llmCheck is installed but no adjudicator is registered', () => {
    expect(() => assertAdjudicatorPresent(specWithLlmCheck(), undefined)).toThrow(/installs an llmCheck guard but no adjudicator/i);
  });

  it('does not throw when the adjudicator is registered', () => {
    const adjudicator: Adjudicator = async () => ({ violation: null });
    expect(() => assertAdjudicatorPresent(specWithLlmCheck(), adjudicator)).not.toThrow();
  });

  it('is a no-op for a spec with no llmCheck (zero-diff)', () => {
    const plain = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(() => assertAdjudicatorPresent(plain, undefined)).not.toThrow();
  });
});

describe('async coexistence — an llmCheck awaits, a sync guard does not', () => {
  it('both run and both verdicts are collected when awaited uniformly', async () => {
    const slowDeny: Adjudicator = async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { violation: 'slow deny' };
    };
    const asyncGuard = llmCheck({ rubric: 'q?' });
    const syncGuard = custom({ kind: 'k', dim: 'behavior', check: () => 'sync deny', prose: () => 'p' });
    const ctx = baseCtx({ adjudicator: slowDeny });
    // The runtime awaits every check the same way; a sync check just resolves immediately.
    expect(await asyncGuard.check(ctx)).toBe('slow deny');
    expect(await syncGuard.check(ctx)).toBe('sync deny');
  });
});
