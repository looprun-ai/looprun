/**
 * llmCheck — the LLM-judged guard kind (core unit level): the guard's own verdict semantics
 * (deny / allow / failMode), what it records when a call reaches no verdict, the fail-loud-at-start
 * judge gate, and the async-coexistence with a deterministic guard. The full-loop behaviour (redrive,
 * config load, case-35) is proven in the mastra package; here everything runs against a crafted ctx /
 * a built spec, no framework.
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentSpecBase, custom, llmCheck, llmCheckLie } from '../src/index.js';
import { assertJudgePresent, specInstallsLlmCheck, specInstallsLieCheck, JUDGE_UNREACHABLE, JUDGE_UNREADABLE, LIE_QUESTION } from '../src/internal.js';
import type { Judge, GuardCtx } from '../src/index.js';

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

/** A judge that answers every question the same way, whatever it is asked. */
const answers = (text: string): Judge => async () => text;

describe('llmCheck — verdict semantics', () => {
  it('returns the named violation VERBATIM as the deny', async () => {
    const judge = answers('VIOLATION: the user never authorised THIS act');
    const reason = await llmCheck({ question: 'q?' }).check(baseCtx({ judge }));
    expect(reason).toBe('the user never authorised THIS act');
  });

  it('NONE → allow (null)', async () => {
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: answers('NONE') }))).toBeNull();
  });

  it('the guard composes the envelope: the question is the QUESTION and the reply arrives fenced as data', async () => {
    let prompt = '';
    const judge: Judge = async (p) => { prompt = p; return 'NONE'; };
    await llmCheck({ question: 'did the yes cover this?' }).check(baseCtx({ judge, reply: 'all set' }));
    expect(prompt).toContain('QUESTION:');
    expect(prompt).toContain('did the yes cover this?');
    expect(prompt).toMatch(/<<<\nall set\n>>>/);
  });

  it('renders the turn record through the ctx renderOpts, so the judge reads the DOMAIN outcome word', async () => {
    const did = [{ op: 'cancel', target: 'Dentist 2026-03-03', outcome: 'cancelled' }];

    let neutral = '';
    await llmCheck({ question: 'q?' }).check(
      baseCtx({ judge: async (p) => { neutral = p; return 'NONE'; }, reply: 'Cancelled.', did }),
    );
    expect(neutral).toContain('No operation was carried out on this turn.');
    expect(neutral).not.toContain('Dentist 2026-03-03');

    let domain = '';
    await llmCheck({ question: 'q?' }).check(
      baseCtx({
        judge: async (p) => { domain = p; return 'NONE'; },
        reply: 'Cancelled.',
        did,
        renderOpts: { outcomes: { cancelled: 'success' } },
      }),
    );
    expect(domain).toContain('Dentist 2026-03-03: done');
  });

  it('failMode open (default): an UNREACHABLE judge (throws) allows', async () => {
    const dead: Judge = async () => { throw new Error('offline'); };
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: dead }))).toBeNull();
  });

  it('failMode closed: an UNREACHABLE judge (throws) denies with a generic figure-free reason', async () => {
    const dead: Judge = async () => { throw new Error('offline'); };
    const reason = await llmCheck({ question: 'q?', failMode: 'closed' }).check(baseCtx({ judge: dead }));
    expect(reason).toMatch(/could not be completed/i);
  });

  it('a REJECTED promise is treated as unreachable too (failMode decides)', async () => {
    const judge: Judge = () => Promise.reject(new Error('timeout'));
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge }))).toBeNull();
    expect(await llmCheck({ question: 'q?', failMode: 'closed' }).check(baseCtx({ judge }))).not.toBeNull();
  });

  it('THROWS (author bug) when no judge is on the ctx — never a silent allow', async () => {
    await expect(llmCheck({ question: 'q?' }).check(baseCtx({ judge: undefined }))).rejects.toThrow(/no judge/i);
  });

  it('dim selects the hook family: default behavior (onReply), run for preTool', () => {
    expect(llmCheck({ question: 'q?' }).dim).toBe('behavior');
    expect(llmCheck({ question: 'q?', dim: 'run' }).dim).toBe('run');
  });
});

// A call that SETTLES without a verdict found no violation. Scoring either shape as a detection would
// let one broken endpoint deny every reply in the session — so both allow, and both are recorded, or an
// outage and a clean session are the same observation.
describe('llmCheck — a call that settles without a verdict allows, and is RECORDED', () => {
  it('an EMPTY answer allows and records the non-run as UNREACHABLE — failMode does not fire', async () => {
    const notes: string[] = [];
    const reason = await llmCheck({ question: 'q?', failMode: 'closed' }).check(
      baseCtx({ judge: answers('   '), notes }),
    );
    expect(reason).toBeNull();
    expect(notes).toEqual([JUDGE_UNREACHABLE]);
  });

  it('an ILLEGIBLE answer allows and records it as UNREADABLE, not unreachable', async () => {
    const notes: string[] = [];
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: answers('hmm, possibly'), notes }))).toBeNull();
    expect(notes).toEqual([JUDGE_UNREADABLE]);
  });

  it('a VIOLATION line with no reason after it is malformed, not a deny', async () => {
    const notes: string[] = [];
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: answers('VIOLATION:'), notes }))).toBeNull();
    expect(notes).toEqual([JUDGE_UNREADABLE]);
  });

  it('a readable answer naming no violation records NOTHING', async () => {
    const notes: string[] = [];
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: answers('NONE'), notes }))).toBeNull();
    expect(notes).toEqual([]);
  });

  it('a ctx with no notes array does not break the call', async () => {
    const dead: Judge = async () => { throw new Error('offline'); };
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: dead }))).toBeNull();
  });
});

describe('llmCheck — a HUNG judge resolves via failMode (timeout), never hangs the turn', () => {
  it('never-settling judge, failMode open → allows after the timeout (default 30000, fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const hung: Judge = () => new Promise(() => {}); // never settles
      const p = llmCheck({ question: 'q?' }).check(baseCtx({ judge: hung })); // no ctx timeout → default 30000
      await vi.advanceTimersByTimeAsync(30000);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never-settling judge, failMode closed → denies after the timeout with the generic reason', async () => {
    vi.useFakeTimers();
    try {
      const hung: Judge = () => new Promise(() => {});
      const p = llmCheck({ question: 'q?', failMode: 'closed' }).check(baseCtx({ judge: hung, judgeTimeoutMs: 5000 }));
      await vi.advanceTimersByTimeAsync(5000);
      expect(await p).toMatch(/could not be completed/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fast judge settles BEFORE the timeout and is unaffected', async () => {
    vi.useFakeTimers();
    try {
      const fast = answers('VIOLATION: quick deny');
      const p = llmCheck({ question: 'q?' }).check(baseCtx({ judge: fast, judgeTimeoutMs: 30000 }));
      // do not advance the clock; the fast judge resolves on its own microtask
      expect(await p).toBe('quick deny');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('assertJudgePresent — fail loud at conversation start', () => {
  const specWithLlmCheck = () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addGuard('onReply', 'any', llmCheck({ question: 'q?' }), { id: 'agent:x' });
    return spec;
  };

  it('specInstallsLlmCheck detects an installed llmCheck on any hook', () => {
    expect(specInstallsLlmCheck(specWithLlmCheck())).toBe(true);
    expect(specInstallsLlmCheck(new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] }))).toBe(false);
  });

  it('throws a NAMED error when an llmCheck is installed but no judge is registered', () => {
    expect(() => assertJudgePresent(specWithLlmCheck(), undefined)).toThrow(/installs an llmCheck guard but no judge/i);
  });

  it('does not throw when the judge is registered', () => {
    expect(() => assertJudgePresent(specWithLlmCheck(), answers('NONE'))).not.toThrow();
  });

  it('is a no-op for a spec with no llmCheck (zero-diff)', () => {
    const plain = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(() => assertJudgePresent(plain, undefined)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// llmCheckLie — the LIE BACKSTOP. The structured cross-check grounds the DECLARATION against the
// ledger, but the `message` is free prose beside it: an agent can declare an honest `inform` and
// still WRITE that it refunded €500. No structural signal reads that. This is the priced, opt-in
// backstop — the engine's own lie question, bound by an author who wants the deny. It is NEVER
// auto-installed and never the primary guarantee.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('llmCheckLie — the engine\'s lie question (available, not auto-installed)', () => {
  /** A fake judge standing in for the host model. It reads the SAME two blocks a real judge reads —
   *  the fenced reply and the turn's rendered operation record — and reports the mismatch the
   *  question asks about: prose asserting an operation while the record names none. Deterministic,
   *  so the proof is reproducible, and it fails if the guard stops sending either block. */
  const LIE_JUDGE: Judge = async (prompt) => {
    const reply = prompt.match(/REPLY UNDER JUDGEMENT[^\n]*\n<<<\n([\s\S]*?)\n>>>/)?.[1] ?? '';
    const recordNamesNothing = prompt.includes('No operation was carried out on this turn.');
    const asserted = ['refund', 'cancel'].find((op) => reply.toLowerCase().includes(op));
    return asserted && recordNamesNothing
      ? `VIOLATION: Your message states you performed "${asserted}" but your declaration does not carry that operation. Say only what you declared.`
      : 'NONE';
  };

  it('DECLARES, and never denies on its own — the runtime owns the verdict', async () => {
    // One of the two outcomes of a violation is a REWRITE, and a `check` can only return a deny
    // string or null. So the whole decision lives in the runtime, and this guard is the declaration
    // that the agent wants the question asked. The end-to-end outcomes are asserted where the
    // routing lives, over a real `finalizeReply`.
    const reason = await llmCheckLie().check(
      baseCtx({
        judge: LIE_JUDGE,
        did: [{ op: 'inform' }], // the agent declared it only INFORMED …
        reply: 'I went ahead and processed the refund of 500 for you.', // … while the prose claims a refund
      }),
    );
    expect(reason).toBeNull();
  });

  it('is its OWN kind, so the runtime can find the binding and read its failMode', () => {
    const g = llmCheckLie();
    expect(g.kind).toBe('llmCheckLie');
    expect(g.dim).toBe('behavior');  // a reply verdict → onReply
    // It is not an `llmCheck`, so the fail-loud judge gate does not fire on it: an absent judge
    // leaves the question unasked and the record still ships beneath the prose.
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addGuard('onReply', 'any', g, { id: 'agent:lie' });
    expect(specInstallsLlmCheck(spec)).toBe(false);
    expect(specInstallsLieCheck(spec)).toBe(true);
  });

  // The DEFAULT is `closed`. A backstop that deletes itself the moment its own seam fails is not a
  // backstop: a judge outage would otherwise silently remove the only named mitigation of the
  // prose residual, with nothing written anywhere. The `open` arm stays reachable for an author who
  // prefers the model's prose to the guarantee.
  it('declares failMode CLOSED by default, and carries an explicit open opt-out', () => {
    expect(llmCheckLie().failMode).toBe('closed');
    expect(llmCheckLie({ failMode: 'open' }).failMode).toBe('open');
  });

  // The binding REBUILDS the guard, so a declared field it forgets is a field the author set and the
  // runtime never sees — the open opt-out would silently revert to denying every reply.
  it('the declared failMode survives being bound on a spec', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addGuard('onReply', 'any', llmCheckLie({ failMode: 'open' }), { id: 'agent:lie' });
    expect(spec.guards.onReply.find((b) => b.id === 'agent:lie')?.guard.failMode).toBe('open');
  });

  it('carries the engine\'s own lie question as its prose', () => {
    expect(llmCheckLie().prose()).toBe(LIE_QUESTION);
  });

  // The DEFAULT is `closed`. A backstop that deletes itself the moment its own seam fails is not a
  // backstop: a judge outage would otherwise silently remove the only named mitigation of the
  // prose residual, with nothing written anywhere. The `open` arm stays reachable for an author who
  // prefers the model's prose to the guarantee, and BOTH arms record the non-run.
  it('bare llmCheck keeps its OPEN default — an author-bound lint, not the lie backstop', async () => {
    const dead: Judge = async () => { throw new Error('offline'); };
    expect(await llmCheck({ question: 'q?' }).check(baseCtx({ judge: dead }))).toBeNull();
  });

  it('is NOT auto-installed: a spec with destructive tools and a contract installs no llmCheck', () => {
    const spec = new AgentSpecBase({
      id: 'a', mode: 'M', persona, tools: ['cancelBooking'], destructiveTools: ['cancelBooking'],
    });
    expect(specInstallsLlmCheck(spec)).toBe(false);
  });
});

describe('the engine lie question', () => {
  it('asks what the reader would BELIEVE, not what the reply mentions', () => {
    expect(LIE_QUESTION).toMatch(/would they be left\s+believing/i);
    expect(LIE_QUESTION).not.toMatch(/does the reply (state|mention)/i);
  });

  it('carries the carve-out that keeps an honest refusal or promise quiet', () => {
    expect(LIE_QUESTION).toMatch(/refused, promised for the future, offered, or asked about is NOT done/);
  });

  it('carries the carve-out that a change in either list is not a lie', () => {
    expect(LIE_QUESTION).toMatch(/appears in either list also answers NONE/);
  });

  it('llmCheckLie carries that question and nothing from the author', () => {
    expect(llmCheckLie().prose()).toBe(LIE_QUESTION);
  });

  it('llmCheckLie is reply-side — its dim is behavior', () => {
    expect(llmCheckLie().dim).toBe('behavior');
  });
});

describe('async coexistence — an llmCheck awaits, a sync guard does not', () => {
  it('both run and both verdicts are collected when awaited uniformly', async () => {
    const slowDeny: Judge = async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'VIOLATION: slow deny';
    };
    const asyncGuard = llmCheck({ question: 'q?' });
    const syncGuard = custom({ kind: 'k', dim: 'behavior', check: () => 'sync deny', prose: () => 'p' });
    const ctx = baseCtx({ judge: slowDeny });
    // The runtime awaits every check the same way; a sync check just resolves immediately.
    expect(await asyncGuard.check(ctx)).toBe('slow deny');
    expect(await syncGuard.check(ctx)).toBe('sync deny');
  });
});
