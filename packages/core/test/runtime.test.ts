/** The governed-turn machine: ledger, preTool evaluation, and the finalizeReply pipeline. */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, precondition, replyMentions, jargonScrub, custom } from '../src/index.js';
import type { AgentWorld, DomainContract } from '../src/index.js';
import {
  createLedger,
  beginTurn,
  resultOk,
  recordToolResult,
  recordTerminal, recordTerminalCall,
  recordVeto,
  vetoStormHit,
  VETO_STORM_LIMIT,
} from '../src/runtime/ledger.js';
import { evaluatePreTool, evaluateOnInput, finalizeReply, redriveMessage } from '../src/runtime/turn.js';

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

const CONTRACT: DomainContract = {
  voice: 'v',
  stateBlock: () => '',
  coreInvariants: ['x'],
  languageClause: 'lang',
  exhaustionReply: (_w, okTools) => `contract-closure:${okTools.join(',')}`,
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
    // Terminal recording is a PAIR since the same-step concurrency fix: recordTerminalCall pushes
    // the observed entry (hook time, synchronous), recordTerminal captures the reply (execute time).
    recordTerminalCall(ledger, 'replyToUser', { text: 'hi' });
    recordTerminal(ledger, 'replyToUser', { text: 'hi' });
    expect(ledger.terminalReply).toBe('hi');
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
    const out = await finalizeReply(spec, CONTRACT, fixtureWorld(), ledger, 'Some Jargon here.', async () => '', 1);
    expect(out.text).toBe('Some plain words here.');
    expect(out.exhausted).toBe(false);
    expect(ledger.turnCorrections).toContain('mutate:jargonScrub');
  });

  it('redrives once with the correction message and accepts the fixed text', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    spec.addReplyCheck(replyMentions({ terms: ['price'], anyTerm: true }, 'Mention the price.'), { id: 'agent:price' });
    const ledger = createLedger();
    const seen: string[] = [];
    const out = await finalizeReply(
      spec,
      CONTRACT,
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
    expect(ledger.turnCorrections).toContain('redrive:replyMentions');
  });

  it('commits the deterministic closure after redrives exhaust (contract closure)', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    spec.addReplyCheck(replyMentions({ terms: ['impossible-token-xyz'], anyTerm: true }, 'nope'), { id: 'agent:impossible' });
    const ledger = createLedger();
    recordToolResult(ledger, 'water', {}, { success: true });
    const out = await finalizeReply(spec, CONTRACT, fixtureWorld(), ledger, 'text', async () => 'still wrong', 1);
    expect(out.exhausted).toBe(true);
    expect(out.violations).toContain('replyMentions');
    expect(out.text).toBe('contract-closure:water');
    expect(ledger.turnCorrections).toContain('exhaustion-terminal');
  });

  it('prefers the spec-level exhaustionReply over the contract closure', async () => {
    const spec = new AgentSpecBase({
      id: 'a',
      mode: 'M',
      persona,
      tools: [],
      exhaustionReply: () => 'spec-closure',
    });
    spec.addReplyCheck(replyMentions({ terms: ['impossible-token-xyz'], anyTerm: true }, 'nope'), { id: 'agent:impossible' });
    const out = await finalizeReply(spec, CONTRACT, fixtureWorld(), createLedger(), 'text', async () => 'still wrong', 0);
    expect(out.text).toBe('spec-closure');
  });

  it('emptyReply (minimal layer) forces content', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    const out = await finalizeReply(spec, CONTRACT, fixtureWorld(), createLedger(), '   ', async () => 'Real reply.', 1);
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
