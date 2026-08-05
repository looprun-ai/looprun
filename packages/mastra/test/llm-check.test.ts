/**
 * llmCheck through the real loop: the case-35 "two-acts-one-yes" shape structure alone cannot close, the
 * fail-loud-at-start adjudicator gate, and an async llmCheck coexisting (ordered) with a sync onReply
 * guard. Core-level verdict/failMode semantics are proven in @looprun-ai/core; here we drive
 * runSpecConversation with a scripted model + a scripted host adjudicator.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom, llmCheck } from '@looprun-ai/core';
import type { AgentWorld, DomainContract, Adjudicator } from '@looprun-ai/core';
import { assertAdjudicatorPresent } from '@looprun-ai/core/internal';
import { runSpecConversation } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';
import { nothingDone } from './delivery.js';

const CONTRACT: DomainContract = {
  voice: 'You are the assistant of Fixture Bookings.',
  stateBlock: () => 'plan=starter',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

function world(): AgentWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  return {
    exec(name: string, args: Record<string, unknown>) {
      if (name === 'respond') return { success: true };
      const result = { success: true };
      calls.push({ name, args, result, tookEffect: true });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: calls,
    sseActions: [],
  };
}

const TOOL_DEFS = [
  { name: 'cancelBooking', description: 'Cancel a booking (destructive).', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
];

function bookingSpec(): AgentSpecBase {
  const spec = new AgentSpecBase({ id: 'bookings', mode: 'M', persona: 'You are the bookings agent.', tools: ['cancelBooking'], contract: CONTRACT });
  // The rubric IS the case-35 question. Its verdict is the adjudicator's; failMode default 'open'.
  spec.addGuard('onReply', 'any', llmCheck({ rubric: 'Did the user explicitly authorise EVERY action the reply claims — not merely a related one?' }), { id: 'agent:licence' });
  return spec;
}

describe('llmCheck — fail loud at conversation start (core-level gate)', () => {
  // `runSpecConversation` resolves an adjudicator for every run (the default below), so a spec that
  // installs an llmCheck with no adjudicator runs cleanly through this backend. The gate this protects
  // is one layer down: `assertAdjudicatorPresent` itself, guarding a caller that resolves nothing.
  it('a spec that installs an llmCheck with NO adjudicator throws through assertAdjudicatorPresent', () => {
    const spec = bookingSpec();
    expect(() => assertAdjudicatorPresent(spec, undefined)).toThrow(/installs an llmCheck guard but no adjudicator/i);
  });
});

describe('the adjudicator the backend resolves', () => {
  function defaultedSpec(): AgentSpecBase {
    const spec = new AgentSpecBase({ id: 'defaulted', mode: 'M', persona: 'You are the agent.', tools: [], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'does the reply overstate?' }), { id: 'agent:rubric' });
    return spec;
  }

  it('a spec binding a rubric runs with NO adjudicator in deps', async () => {
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'hi', did: [{ op: 'inform' }] } }]]);
    const res = await runSpecConversation(defaultedSpec(), [{ userText: 'hello' }], {
      model: scripted.model,
      world: world(),
      toolDefs: TOOL_DEFS,
      // no adjudicator — the backend resolves its own default
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(1);
  });

  it('a supplied adjudicator WINS over the default', async () => {
    let called = false;
    const mine: Adjudicator = async () => {
      called = true;
      return { violation: null };
    };
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'hi', did: [{ op: 'inform' }] } }]]);
    await runSpecConversation(defaultedSpec(), [{ userText: 'hello' }], {
      model: scripted.model,
      world: world(),
      toolDefs: TOOL_DEFS,
      adjudicator: mine,
    });
    expect(called).toBe(true);
  });
});

describe('llmCheck — case 35: two acts, one yes (structure alone cannot close it)', () => {
  // The adjudicator reads the FULL context (history + userText): the user authorised cancelling the 3pm
  // booking only. Structure (observed calls) sees a legal cancelBooking + a terminal reply and would pass;
  // the model verdict is what catches the reply claiming a SECOND cancellation the user never licensed.
  const licenceAdjudicator: Adjudicator = async (_rubric, ctx) => {
    const authorised = [ctx.userText, ...ctx.history.map((t) => t.userText)].join(' ').toLowerCase();
    const claimsSecond = /other booking|both bookings|also cancelled/i.test(ctx.reply ?? '');
    const licensedSecond = /other|both|all my bookings/i.test(authorised);
    return { violation: claimsSecond && !licensedSecond ? 'The user authorised one cancellation; the reply claims a second the user never licensed.' : null };
  };

  it('denies (redrives) the reply that claims an un-authorised second act, then passes the corrected one', async () => {
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Done — I also cancelled the other booking for you.', did: [{ op: 'inform' }] } }],
      // redrive (no tools): the corrected reply claims only the licensed act (no second-act phrasing).
      [{ tool: 'respond', args: { message: 'Your 3pm booking is cancelled. Nothing else was changed.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: licenceAdjudicator,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toMatch(/nothing else was changed/i);
  });

  it('passes cleanly when the reply claims only the authorised act', async () => {
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Your 3pm booking is cancelled.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: licenceAdjudicator,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).not.toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('Your 3pm booking is cancelled.'));
  });

  it('the SECOND act is licensed when an earlier turn authorised it → no redrive', async () => {
    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'Which ones — just the 3pm, or all of them?', did: [{ op: 'inform' }] } }],
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Done — I also cancelled the other booking for you.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [
      { userText: 'cancel all my bookings' },
      { userText: 'yes, cancel them' },
    ], { model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: licenceAdjudicator });
    expect(res.errorMsg).toBeUndefined();
    // turn 1's reply claims a second act, but turn 0's "all my bookings" licensed it → adjudicator allows.
    expect(res.turnRecords[1].recoveryEvents).not.toContain('redrive:llmCheck');
  });
});

describe('llmCheck — a HUNG adjudicator resolves via failMode through the real loop (no hang)', () => {
  it('failMode closed + a never-settling adjudicator → the turn resolves via the timeout, not a hang', async () => {
    const hung: Adjudicator = () => new Promise(() => {}); // never settles
    const spec = new AgentSpecBase({ id: 'closed', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?', failMode: 'closed' }), { id: 'agent:closed' });
    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'first draft', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'second draft', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS,
      adjudicator: hung, adjudicatorTimeoutMs: 20, // small timeout so the test does not sleep
    });
    expect(res.errorMsg).toBeUndefined();
    // closed failMode fires on every un-verifiable draft → the bounded redrive relayed it (turn resolved).
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
  });

  it('failMode open + a never-settling adjudicator → the reply is allowed through after the timeout', async () => {
    const hung: Adjudicator = () => new Promise(() => {});
    const spec = new AgentSpecBase({ id: 'open', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?' }), { id: 'agent:open' }); // default open
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'the answer', did: [{ op: 'inform' }] } }]]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS,
      adjudicator: hung, adjudicatorTimeoutMs: 20,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).not.toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('the answer'));
  });
});

describe('llmCheck — async coexistence with a sync onReply guard', () => {
  it('both a slow async llmCheck and a sync reply guard are enforced in one turn', async () => {
    const slowDeny: Adjudicator = async (_r, ctx) => {
      await new Promise((r) => setTimeout(r, 3));
      return { violation: /bad/i.test(ctx.reply ?? '') ? 'adjudicator says bad' : null };
    };
    const spec = new AgentSpecBase({ id: 'both', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?' }), { id: 'agent:async' });
    spec.addGuard('onReply', 'any', custom({ kind: 'syncBad', dim: 'behavior', check: (ctx) => (/bad/i.test(ctx.reply ?? '') ? 'sync says bad' : null), prose: () => 'no bad word' }), { id: 'agent:sync' });

    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'this is bad', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'this is fine now', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: slowDeny,
    });
    expect(res.errorMsg).toBeUndefined();
    // BOTH guards fired on the first draft → both relayed through the same bounded redrive.
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:syncBad');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('this is fine now'));
  });
});
