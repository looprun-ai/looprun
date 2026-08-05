/**
 * llmCheck through the real loop: the case-35 "two-acts-one-yes" shape structure alone cannot close, the
 * fail-loud-at-start judge gate, and an async llmCheck coexisting (ordered) with a sync onReply
 * guard. Core-level verdict/failMode semantics are proven in @looprun-ai/core; here we drive
 * runSpecConversation with a scripted model + a scripted judge.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom, llmCheck } from '@looprun-ai/core';
import type { AgentWorld, DomainContract, Judge } from '@looprun-ai/core';
import { assertJudgePresent } from '@looprun-ai/core/internal';
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
  // The rubric IS the case-35 question. Its verdict is the judge's; failMode default 'open'.
  spec.addGuard('onReply', 'any', llmCheck({ rubric: 'Did the user explicitly authorise EVERY action the reply claims — not merely a related one?' }), { id: 'agent:licence' });
  return spec;
}

describe('llmCheck — fail loud at conversation start (core-level gate)', () => {
  // `runSpecConversation` resolves a judge for every run (the default below), so a spec that
  // installs an llmCheck with no judge runs cleanly through this backend. The gate this protects
  // is one layer down: `assertJudgePresent` itself, guarding a caller that resolves nothing.
  it('a spec that installs an llmCheck with NO judge throws through assertJudgePresent', () => {
    const spec = bookingSpec();
    expect(() => assertJudgePresent(spec, undefined)).toThrow(/installs an llmCheck guard but no judge/i);
  });
});

describe('the judge the backend resolves', () => {
  function defaultedSpec(): AgentSpecBase {
    const spec = new AgentSpecBase({ id: 'defaulted', mode: 'M', persona: 'You are the agent.', tools: [], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'does the reply overstate?' }), { id: 'agent:rubric' });
    return spec;
  }

  it('a spec binding a rubric runs with NO judge in deps', async () => {
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'hi', did: [{ op: 'inform' }] } }]]);
    const res = await runSpecConversation(defaultedSpec(), [{ userText: 'hello' }], {
      model: scripted.model,
      world: world(),
      toolDefs: TOOL_DEFS,
      // no judge — the backend resolves its own default
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(1);
  });

  it('a supplied judge WINS over the default', async () => {
    let called = false;
    const mine: Judge = async () => {
      called = true;
      return 'NONE';
    };
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'hi', did: [{ op: 'inform' }] } }]]);
    await runSpecConversation(defaultedSpec(), [{ userText: 'hello' }], {
      model: scripted.model,
      world: world(),
      toolDefs: TOOL_DEFS,
      judge: mine,
    });
    expect(called).toBe(true);
  });
});

describe('llmCheck — case 35: two acts, one yes (structure alone cannot close it)', () => {
  // The judge reads the ENVELOPE the guard composed: the person's own last turns, the agent's prose
  // fenced as data, and the operations this turn and earlier turns carried out. Structure (observed
  // calls) sees a legal cancelBooking plus a terminal reply and would pass; the model verdict is what
  // catches a reply claiming a SECOND cancellation that neither the person's words nor a list covers.
  const licenceJudge: Judge = async (prompt) => {
    const asked = prompt.match(/USER REQUEST[^\n]*\n<<<\n([\s\S]*?)\n>>>/)?.[1] ?? '';
    const reply = prompt.match(/REPLY UNDER JUDGEMENT[^\n]*\n<<<\n([\s\S]*?)\n>>>/)?.[1] ?? '';
    const claimsSecond = /also cancelled|other booking|both bookings/i.test(reply);
    const licensedByUser = /all my bookings|both of them/i.test(asked);
    const alreadyDone = /Dentist appointment: done/.test(prompt);
    return claimsSecond && !licensedByUser && !alreadyDone
      ? 'VIOLATION: The user authorised one cancellation; the reply claims a second the user never licensed.'
      : 'NONE';
  };

  it('denies (redrives) the reply that claims an un-authorised second act, then passes the corrected one', async () => {
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Done — I also cancelled the other booking for you.', did: [{ op: 'inform' }] } }],
      // redrive (no tools): the corrected reply claims only the licensed act (no second-act phrasing).
      [{ tool: 'respond', args: { message: 'Your 3pm booking is cancelled. Nothing else was changed.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: licenceJudge,
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
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: licenceJudge,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).not.toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('Your 3pm booking is cancelled.'));
  });

  // THE PERSON'S WORDS licence it. Nothing in either list covers the second act on this turn — only
  // what the user said two turns ago does, and the envelope carries it.
  it('the SECOND act is LICENSED when an earlier turn authorised it → no redrive', async () => {
    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'Which ones — just the 3pm, or all of them?', did: [{ op: 'inform' }] } }],
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Done — I also cancelled the other booking for you.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [
      { userText: 'cancel all my bookings' },
      { userText: 'yes, cancel them' },
    ], { model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: licenceJudge });
    expect(res.errorMsg).toBeUndefined();
    // turn 1's reply claims a second act; turn 0's "all my bookings" is in the USER REQUEST block.
    expect(res.turnRecords[1].recoveryEvents).not.toContain('redrive:llmCheck');
  });

  // THE SESSION LIST accounts for it. The person never authorised a second act in words here — an
  // earlier turn simply already carried it out, and the list says so.
  it('the SECOND act is ACCOUNTED FOR when an earlier turn carried it out → no redrive', async () => {
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: 'dentist' } }],
      [{ tool: 'respond', args: { message: 'The dentist appointment is cancelled.', did: [{ op: 'cancel', target: 'Dentist appointment', outcome: 'success' }] } }],
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Done — I also cancelled the dentist appointment for you.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(bookingSpec(), [
      { userText: 'cancel the dentist appointment' },
      { userText: 'now cancel my 3pm one too' },
    ], { model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: licenceJudge });
    expect(res.errorMsg).toBeUndefined();
    // turn 1's reply names a second cancellation; the SESSION list carries it from turn 0 → judge allows.
    expect(res.turnRecords[1].recoveryEvents).not.toContain('redrive:llmCheck');
  });
});

describe('llmCheck — a HUNG judge resolves via failMode through the real loop (no hang)', () => {
  it('failMode closed + a never-settling judge → the turn resolves via the timeout, not a hang', async () => {
    const hung: Judge = () => new Promise(() => {}); // never settles
    const spec = new AgentSpecBase({ id: 'closed', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?', failMode: 'closed' }), { id: 'agent:closed' });
    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'first draft', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'second draft', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS,
      judge: hung, judgeTimeoutMs: 20, // small timeout so the test does not sleep
    });
    expect(res.errorMsg).toBeUndefined();
    // closed failMode fires on every un-verifiable draft → the bounded redrive relayed it (turn resolved).
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
  });

  it('failMode open + a never-settling judge → the reply is allowed through after the timeout', async () => {
    const hung: Judge = () => new Promise(() => {});
    const spec = new AgentSpecBase({ id: 'open', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?' }), { id: 'agent:open' }); // default open
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'the answer', did: [{ op: 'inform' }] } }]]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS,
      judge: hung, judgeTimeoutMs: 20,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).not.toContain('redrive:llmCheck');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('the answer'));
  });
});

describe('llmCheck — async coexistence with a sync onReply guard', () => {
  it('both a slow async llmCheck and a sync reply guard are enforced in one turn', async () => {
    const slowDeny: Judge = async (prompt) => {
      await new Promise((r) => setTimeout(r, 3));
      return /bad/i.test(prompt) ? 'VIOLATION: the judge says bad' : 'NONE';
    };
    const spec = new AgentSpecBase({ id: 'both', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'q?' }), { id: 'agent:async' });
    spec.addGuard('onReply', 'any', custom({ kind: 'syncBad', dim: 'behavior', check: (ctx) => (/bad/i.test(ctx.reply ?? '') ? 'sync says bad' : null), prose: () => 'no bad word' }), { id: 'agent:sync' });

    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'this is bad', did: [{ op: 'inform' }] } }],
      [{ tool: 'respond', args: { message: 'this is fine now', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'hi' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: slowDeny,
    });
    expect(res.errorMsg).toBeUndefined();
    // BOTH guards fired on the first draft → both relayed through the same bounded redrive.
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:llmCheck');
    expect(res.turnRecords[0].recoveryEvents).toContain('redrive:syncBad');
    expect(res.turnRecords[0].assistantFinalText).toBe(nothingDone('this is fine now'));
  });
});

describe('llmCheck — a CALL-SIDE outage is recorded on the turn, not a silent allow', () => {
  const dead: Judge = async () => {
    throw new Error('offline');
  };

  it('a preTool llmCheck outage lands in recoveryEvents', async () => {
    const spec = new AgentSpecBase({ id: 'pre-outage', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('preTool', ['cancelBooking'], llmCheck({ rubric: 'Did the user authorise THIS cancellation?', dim: 'run' }), { id: 'agent:pre' });
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Your 3pm booking is cancelled.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: dead,
    });
    expect(res.errorMsg).toBeUndefined();
    // failMode 'open' (default): the outage never denies the call, but the non-run still lands.
    expect(res.turnRecords[0].recoveryEvents).toContain('llmcheck-unreachable:open');
  });

  it('a postTool llmCheck outage lands in recoveryEvents', async () => {
    const spec = new AgentSpecBase({ id: 'post-outage', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract: CONTRACT });
    spec.addGuard('postTool', ['cancelBooking'], llmCheck({ rubric: 'Did the cancellation result look right?', dim: 'output' }), { id: 'agent:post' });
    const scripted = scriptedModel([
      [{ tool: 'cancelBooking', args: { id: '3pm' } }],
      [{ tool: 'respond', args: { message: 'Your 3pm booking is cancelled.', did: [{ op: 'inform' }] } }],
    ]);
    const res = await runSpecConversation(spec, [{ userText: 'cancel my 3pm booking' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS, judge: dead,
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords[0].recoveryEvents).toContain('llmcheck-unreachable:open');
  });
});

describe('llmCheck — the contract outcome map reaches the judge (render-options wiring)', () => {
  // No judge is supplied, so the backend resolves the DEFAULT one. The contract's own `outcomes` map
  // rides the ledger onto the guard ctx, and the guard renders the turn record through it. A scripted
  // judge callback captures the prompt the isolated judging call receives, which is where that record
  // text actually lands.
  it('a domain outcome word declared on the contract renders into the LEDGER the judge is shown', async () => {
    const contract: DomainContract = { ...CONTRACT, outcomes: { cancelled: 'success' } };
    const spec = new AgentSpecBase({ id: 'ledger-wiring', mode: 'M', persona: 'You are the agent.', tools: ['cancelBooking'], contract });
    spec.addGuard('onReply', 'any', llmCheck({ rubric: 'does the reply overstate?' }), { id: 'agent:ledger' });

    let judgePrompt = '';
    const scripted = scriptedModel(
      [[{ tool: 'respond', args: { message: 'Your dentist appointment is cancelled.', did: [{ op: 'cancel', target: 'Dentist appointment', outcome: 'cancelled' }] } }]],
      { judge: (prompt) => { judgePrompt = prompt; return 'NONE'; } },
    );
    const res = await runSpecConversation(spec, [{ userText: 'cancel my dentist appointment' }], {
      model: scripted.model, world: world(), toolDefs: TOOL_DEFS,
      // no `judge` — the backend must thread `contract.outcomes` onto the ctx itself.
    });
    expect(res.errorMsg).toBeUndefined();
    expect(judgePrompt).toContain('Dentist appointment: done');
  });
});
