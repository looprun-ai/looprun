/** The governed-turn machine: ledger, preTool evaluation, and the finalizeReply pipeline. */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  createLedger,
  beginTurn,
  resultOk,
  recordToolResult,
  recordTerminal,
  recordVeto,
  vetoStormHit,
  VETO_STORM_LIMIT,
  evaluatePreTool,
  evaluateOnInput,
  finalizeReply,
  redriveMessage,
  precondition,
  replyMustMention,
  jargonScrub,
  custom,
} from '../src/index.js';
import type { AgentWorld, TrunkTheme } from '../src/index.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return {
    exec: () => ({}),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
    ...state,
  };
}

const persona = 'You are the plant-care agent.';

const THEME: TrunkTheme = {
  voice: 'v',
  stateBlock: () => '',
  coreInvariants: ['x'],
  languageClause: 'lang',
  exhaustionReply: (_w, okTools) => `theme-closure:${okTools.join(',')}`,
};

describe('ledger', () => {
  it('resultOk flags structural failures', () => {
    expect(resultOk({ success: true })).toBe(true);
    expect(resultOk({ success: false })).toBe(false);
    expect(resultOk({ error: 'boom' })).toBe(false);
    expect(resultOk({ PREREQ_NOT_MET: true })).toBe(false);
    expect(resultOk('plain')).toBe(true);
    expect(resultOk(undefined)).toBe(true);
  });

  it('recordToolResult captures ok, labels and confirmation flags', () => {
    const ledger = createLedger();
    recordToolResult(ledger, 'gen', { a: 1 }, { label: 'i101' });
    recordToolResult(ledger, 'del', { confirmed: false }, { requiresConfirmation: true });
    recordToolResult(ledger, 'bad', {}, { success: false });
    expect(ledger.producedThisTurn).toEqual(['i101']);
    expect(ledger.observed[1].resultFlags?.requiresConfirmation).toBe(true);
    expect(ledger.observed[2].ok).toBe(false);
  });

  it('beginTurn resets per-turn state but keeps observed', () => {
    const ledger = createLedger();
    recordToolResult(ledger, 'gen', {}, { label: 'i101' });
    recordTerminal(ledger, 'replyToUser', { text: 'hi' });
    beginTurn(ledger, 1);
    expect(ledger.observed.length).toBe(2);
    expect(ledger.producedThisTurn).toEqual([]);
    expect(ledger.terminalReply).toBe('');
    expect(ledger.turnIndex).toBe(1);
  });
});

describe('evaluatePreTool', () => {
  it('denies on a failing precondition and records the veto', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['repot'] });
    spec.addGuard('preTool', ['repot'], precondition((w) => w.plan === 'pro', 'Needs pro plan.'), { id: 'agent:pro' });
    const ledger = createLedger();
    const verdict = await evaluatePreTool(spec, ledger, fixtureWorld({ plan: 'starter' }), 'repot', {});
    expect(verdict.verdict).toBe('deny');
    if (verdict.verdict === 'deny') expect(verdict.reason).toBe('Needs pro plan.');
    expect(ledger.observed[0]).toMatchObject({ name: 'repot', ok: false });
    expect(ledger.turnCorrections).toEqual(['run:precondition:repot']);
  });

  it('allows when guards pass, and noDuplicateCall vetoes an exact same-turn repeat', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const ledger = createLedger();
    const world = fixtureWorld();
    expect((await evaluatePreTool(spec, ledger, world, 'water', { id: 7 })).verdict).toBe('allow');
    recordToolResult(ledger, 'water', { id: 7 }, { success: true });
    const dup = await evaluatePreTool(spec, ledger, world, 'water', { id: 7 });
    expect(dup.verdict).toBe('deny');
  });
});

describe('evaluateOnInput', () => {
  it('refuses the turn before any LLM call', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    spec.addGuard('onInput', 'any', custom({ kind: 'gate', dim: 'run', check: () => 'refused', prose: () => 'g' }), {
      id: 'agent:gate',
    });
    const ledger = createLedger();
    expect(await evaluateOnInput(spec, ledger, fixtureWorld())).toBe('refused');
    expect(ledger.turnCorrections).toEqual(['onInput:gate']);
  });
});

describe('finalizeReply pipeline', () => {
  it('applies mutators before checks', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    spec.addMutator(jargonScrub({ Jargon: 'plain words' }), { id: 'agent:scrub' });
    const ledger = createLedger();
    const out = await finalizeReply(spec, THEME, fixtureWorld(), ledger, 'Some Jargon here.', async () => '', 1);
    expect(out.text).toBe('Some plain words here.');
    expect(out.exhausted).toBe(false);
    expect(ledger.turnCorrections).toContain('mutate:jargonScrub');
  });

  it('redrives once with the correction message and accepts the fixed text', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    spec.addReplyCheck(replyMustMention(['price'], 'Mention the price.'), { id: 'agent:price' });
    const ledger = createLedger();
    const seen: string[] = [];
    const out = await finalizeReply(
      spec,
      THEME,
      fixtureWorld(),
      ledger,
      'No mention.',
      async (msg) => {
        seen.push(msg);
        return 'The price is $5.';
      },
      2,
    );
    expect(out).toMatchObject({ text: 'The price is $5.', exhausted: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('Mention the price.');
    expect(ledger.turnCorrections).toContain('redrive:replyMustMention');
  });

  it('commits the deterministic closure after redrives exhaust (theme closure)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addReplyCheck(replyMustMention(['impossible-token-xyz'], 'nope'), { id: 'agent:impossible' });
    const ledger = createLedger();
    recordToolResult(ledger, 'water', {}, { success: true });
    const out = await finalizeReply(spec, THEME, fixtureWorld(), ledger, 'text', async () => 'still wrong', 1);
    expect(out.exhausted).toBe(true);
    expect(out.violations).toContain('replyMustMention');
    expect(out.text).toBe('theme-closure:water');
    expect(ledger.turnCorrections).toContain('exhaustion-terminal');
  });

  it('prefers the spec-level exhaustionReply over the theme closure', async () => {
    const spec = new AgentSpecBase({
      id: 'a',
      mode: 'M',
      persona,
      tools: [],
      exhaustionReply: () => 'spec-closure',
    });
    spec.addReplyCheck(replyMustMention(['impossible-token-xyz'], 'nope'), { id: 'agent:impossible' });
    const out = await finalizeReply(spec, THEME, fixtureWorld(), createLedger(), 'text', async () => 'still wrong', 0);
    expect(out.text).toBe('spec-closure');
  });

  it('emptyReply (minimal layer) forces content', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    const out = await finalizeReply(spec, THEME, fixtureWorld(), createLedger(), '   ', async () => 'Real reply.', 1);
    expect(out.text).toBe('Real reply.');
  });

  it('redriveMessage lists every violation', () => {
    const msg = redriveMessage([
      { guard: { kind: 'a', dim: 'behavior', check: () => null, prose: () => '' }, reason: 'r1' },
      { guard: { kind: 'b', dim: 'behavior', check: () => null, prose: () => '' }, reason: 'r2' },
    ]);
    expect(msg).toContain('- r1');
    expect(msg).toContain('- r2');
    expect(msg).toContain('Do NOT call a tool');
  });
});

describe('veto-storm breaker (a vetoed model with toolChoice required cannot stop on its own)', () => {
  it('trips after VETO_STORM_LIMIT consecutive vetoes and resets on an executed call or new turn', () => {
    const ledger = createLedger();
    for (let i = 0; i < VETO_STORM_LIMIT - 1; i++) recordVeto(ledger, 't', {}, 'run:noDuplicateCall:t');
    expect(vetoStormHit(ledger)).toBe(false);
    recordVeto(ledger, 't', {}, 'run:noDuplicateCall:t');
    expect(vetoStormHit(ledger)).toBe(true);
    recordToolResult(ledger, 't', {}, { success: true }); // an executed call passed guards
    expect(vetoStormHit(ledger)).toBe(false);
    recordVeto(ledger, 't', {}, 'run:noDuplicateCall:t');
    beginTurn(ledger, 1); // new turn resets the streak
    expect(ledger.vetoStreak).toBe(0);
  });
});
