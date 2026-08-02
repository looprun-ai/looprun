/**
 * llmCheck through the real loop: the case-35 "two-acts-one-yes" shape structure alone cannot close, the
 * fail-loud-at-start adjudicator gate, and an async llmCheck coexisting (ordered) with a sync onReply
 * guard. Core-level verdict/failMode semantics are proven in @looprun-ai/core; here we drive
 * runSpecConversation with a scripted model + a scripted host adjudicator.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom, llmCheck } from '@looprun-ai/core';
import type { AgentWorld, DomainContract, Adjudicator } from '@looprun-ai/core';
import { runSpecConversation } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';

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
      if (name === 'replyToUser' || name === 'askUser') return { success: true };
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

describe('llmCheck — fail loud at conversation start', () => {
  it('a spec that installs an llmCheck with NO adjudicator throws BEFORE the first turn', async () => {
    const spec = bookingSpec();
    await expect(
      runSpecConversation(spec, [{ userText: 'cancel my 3pm booking' }], {
        model: scriptedModel([[{ tool: 'replyToUser', args: { text: 'done' } }]]).model,
        world: world(),
        toolDefs: TOOL_DEFS,
        // no adjudicator
      }),
    ).rejects.toThrow(/installs an llmCheck guard but no adjudicator/i);
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
      [{ tool: 'replyToUser', args: { text: 'Done — I also cancelled the other booking for you.' } }],
      // redrive (no tools): the corrected reply claims only the licensed act (no second-act phrasing).
      [{ text: 'Your 3pm booking is cancelled. Nothing else was changed.' }],
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
      [{ tool: 'replyToUser', args: { text: 'Your 3pm booking is cancelled.' } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: licenceAdjudicator,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).not.toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toBe('Your 3pm booking is cancelled.');
  });

  it('the SECOND act is licensed when an earlier turn authorised it → no redrive', async () => {
    const scripted = scriptedModel([
      [{ tool: 'replyToUser', args: { text: 'Which ones — just the 3pm, or all of them?' } }],
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'replyToUser', args: { text: 'Done — I also cancelled the other booking for you.' } }],
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
      [{ tool: 'replyToUser', args: { text: 'this is bad' } }],
      [{ text: 'this is fine now' }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, adjudicator: slowDeny,
    });
    expect(res.errorMsg).toBeUndefined();
    // BOTH guards fired on the first draft → both relayed through the same bounded redrive.
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:syncBad');
    expect(res.turnRecords[0].assistantFinalText).toBe('this is fine now');
  });
});
