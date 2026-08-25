import { test, expect } from 'vitest';
import type { AgentSpec, ChatMsg, ModelStep, ModelTarget, Msg } from '@looprun-ai/core';
import { ModelSeat, ScriptedModel, TurnFailure, mcpWorld, world } from '@looprun-ai/core';
import { RoutedAgent, type RoutedSubjectCfg } from '../src/routed-agent.js';
import { LoopRunAgent } from '../src/loop-run-agent.js';
import { assemble } from '../src/agent-assembly.js';
import { BOOKING, callStep, finishStep } from './fixtures/booking-world.js';

const HANDLES = { yard: 'job schedules and hand-overs', billing: 'invoices and refunds' };

/** A world with a write, so what one desk changes is a thing another desk can read. */
const JOBS = world({
  records: { jobs: { jb_a: { crew: 'Ana' } } },
  reads: { getJob: { form: 'get', entity: 'jobs', label: 'Look up the job' } },
  writes: { setCrew: { form: 'set', entity: 'jobs', label: 'Assign the crew' } }
});

const DESKS: Record<string, AgentSpec> = {
  yard: { name: 'yard', persona: 'You run the yard.', handles: HANDLES.yard },
  billing: { name: 'billing', persona: 'You run billing.', handles: HANDLES.billing } };

/** A router decision as the port answers it, with the tokens the provider billed. */
function routeStep(chosen: string, inputTokens = 0, outputTokens = 0): ModelStep {
  return { calls: [{ tool: 'route', args: { desk: chosen } }], text: '',
           usage: { inputTokens, outputTokens, cachedInputTokens: 0, reasoningTokens: 0 } };
}

const unreadable: ModelStep = { calls: [], text: '' };

const returns = (reason: string): ModelStep =>
  ({ calls: [{ tool: 'notMine', args: { reason } }], text: '' });

const SCRIPTED: ModelTarget = { id: 'scripted', provider: 'scripted', keyEnv: null,
                                tier: 'cloud', certified: true };

/** One desk whose seat is a ScriptedModel the test holds — `seen` is the desk's own
 *  window, its tool cards and the foreign text it was handed. Desk replies carry no
 *  figures: a figure no record grounds redrives the turn. */
function desk(name: string, steps: readonly ModelStep[]):
    { agent: LoopRunAgent; model: ScriptedModel } {
  const model = new ScriptedModel(steps);
  const agent = new LoopRunAgent(
    { spec: { name, persona: 'You are the desk.' }, world: BOOKING,
      model: { scripted: { steps: [] } } },
    async cfg => {
      const built = await assemble(cfg);
      return { ...built, config: { ...built.config,
        seat: ModelSeat.create([SCRIPTED], 'scripted', () => model) } };
    });
  return { agent, model };
}

function house(router: ScriptedModel, desks: Record<string, LoopRunAgent>): RoutedAgent {
  return new RoutedAgent({ name: 'northgate', desks, handles: HANDLES, router });
}

test('a message routes to a desk; the record carries the routing and the router\'s tokens', async () => {
  const router = new ScriptedModel([routeStep('billing', 310, 8)]);
  const yard = desk('yard', []);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const out = await agent.generate('has the invoice been paid?', { session: 's1' });

  expect(out.text).toContain('paid');
  expect(out.loopRun.routing).toEqual({ desk: 'billing', returned: null });
  expect(out.loopRun.usage.modelCalls).toBe(2);          // one router step, one desk step
  expect(out.loopRun.usage.inputTokens).toBe(310);       // the scripted desk reports no numbers
  expect(out.loopRun.usage.outputTokens).toBe(8);
  expect(yard.model.seen).toHaveLength(0);               // the other desk was never touched
});

test('a continuation carries the current desk and the last exchange into the window', async () => {
  const router = new ScriptedModel([routeStep('billing'), routeStep('billing')]);
  const billing = desk('billing', [finishStep('The invoice is paid.'),
                                   finishStep('It settled on Tuesday.')]);
  const agent = house(router, { yard: desk('yard', []).agent, billing: billing.agent });

  const first = await agent.generate('has the invoice been paid?', { session: 's1' });
  await agent.generate('when?', { session: 's1' });

  expect(router.seen[0].system).toContain('The conversation is just opening.');
  expect(router.seen[1].system).toContain('The conversation so far sits at the billing desk.');
  expect(router.seen[1].messages).toEqual([
    { role: 'user', text: 'has the invoice been paid?' },
    { role: 'assistant', text: first.text },
    { role: 'user', text: 'when?' }]);
});

test('none refuses at the front desk, touches no desk, and the ledger still grows', async () => {
  const router = new ScriptedModel([routeStep('none', 300, 6), routeStep('billing')]);
  const yard = desk('yard', []);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const out = await agent.generate('what is the weather tomorrow?', { session: 's1' });

  expect(out.text).toBe(
    'No desk at northgate performs this. The house covers: yard, billing.');
  expect(out.loopRun).toEqual({
    turn: 1, servedBy: 'front-desk', userText: 'what is the weather tomorrow?',
    acts: [], questions: { issued: [], consumed: [], closed: [] },
    finish: null, corrections: [], text: out.text, closedBy: 'engine',
    usage: { inputTokens: 300, outputTokens: 6, cachedInputTokens: 0,
             reasoningTokens: 0, modelCalls: 1 },
    routing: { desk: null, returned: null } });
  expect(yard.model.seen).toHaveLength(0);
  expect(billing.model.seen).toHaveLength(0);

  // The house said it; the ledger carries it, so the next window reads it back.
  await agent.generate('has the invoice been paid?', { session: 's1' });
  expect(router.seen[1].messages[1]).toEqual({ role: 'assistant', text: out.text });
  expect(router.seen[1].system).toContain('The conversation is just opening.');
});

test('a returned message re-routes once; the reason rides the window and the door is gone', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('billing')]);
  const yard = desk('yard', [returns('invoices are billing\'s work')]);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const out = await agent.generate('has the invoice been paid?', { session: 's1' });

  expect(router.seen[1].system).toContain(
    'yard returned this message: invoices are billing\'s work');
  expect(out.loopRun.routing).toEqual({ desk: 'billing',
    returned: { by: 'yard', reason: 'invoices are billing\'s work' } });
  expect(yard.model.seen[0].tools.map(t => t.name)).toContain('notMine');
  expect(billing.model.seen[0].tools.map(t => t.name)).not.toContain('notMine');
  expect(out.loopRun.usage.modelCalls).toBe(3);          // two router steps, one desk step
});

test('a re-route onto the SAME desk re-delivers without the return door', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('yard')]);
  const yard = desk('yard', [returns('not sure this is mine'),
                             finishStep('The Henderson job runs on Tuesday.')]);
  const agent = house(router, { yard: yard.agent, billing: desk('billing', []).agent });

  const out = await agent.generate('who is on the Henderson job?', { session: 's1' });

  expect(out.text).toContain('Henderson');
  expect(out.loopRun.routing).toEqual({ desk: 'yard',
    returned: { by: 'yard', reason: 'not sure this is mine' } });
  expect(yard.model.seen[1].tools.map(t => t.name)).not.toContain('notMine');
});

test('before carries exactly the foreign entries since that desk\'s last visit', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('billing'), routeStep('yard')]);
  const yard = desk('yard', [finishStep('The Henderson job runs on Tuesday.'),
                             finishStep('Ana is on it.')]);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const job = await agent.generate('when does the Henderson job run?', { session: 's1' });
  const money = await agent.generate('is the invoice paid?', { session: 's1' });
  await agent.generate('who is on it?', { session: 's1' });

  // Billing's only window: the yard exchange it never saw, then the new message.
  expect(spoken(billing.model.seen[0].messages)).toEqual([
    'when does the Henderson job run?', job.text, 'is the invoice paid?']);
  // The yard's second window: its OWN sealed turn, then the billing exchange since
  // that turn, then the new message. Nothing of the yard's own repeats as foreign.
  const yardAgain = spoken(yard.model.seen[1].messages);
  expect(yardAgain).toHaveLength(5);
  expect(yardAgain[0]).toBe('when does the Henderson job run?');
  expect(yardAgain[2]).toBe('is the invoice paid?');
  expect(yardAgain[3]).toBe(money.text);
  expect(yardAgain[4]).toBe('who is on it?');
});

test('an unreadable decision retries once identically, then fails the turn', async () => {
  const retried = new ScriptedModel([unreadable, routeStep('billing')]);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(retried, { yard: desk('yard', []).agent, billing: billing.agent });
  const out = await agent.generate('is the invoice paid?', { session: 's1' });
  expect(out.loopRun.routing?.desk).toBe('billing');
  expect(retried.seen[0]).toEqual(retried.seen[1]);      // the SAME window, put again
  expect(out.loopRun.usage.modelCalls).toBe(3);          // both router steps are billed

  const never = new ScriptedModel([unreadable, unreadable]);
  const dead = house(never, { yard: desk('yard', []).agent, billing: desk('billing', []).agent });
  await expect(dead.generate('is the invoice paid?', { session: 's1' }))
    .rejects.toThrow(new TurnFailure('network',
      'the front desk returned no readable decision'));
});

test('endSession drops the routed state and every desk\'s — the next turn is turn 1', async () => {
  const router = new ScriptedModel([routeStep('billing'), routeStep('billing')]);
  const billing = desk('billing', [finishStep('The invoice is paid.'),
                                   finishStep('It is still paid.')]);
  const agent = house(router, { yard: desk('yard', []).agent, billing: billing.agent });

  await agent.generate('is the invoice paid?', { session: 's1' });
  agent.endSession('s1');
  const fresh = await agent.generate('is the invoice paid?', { session: 's1' });

  expect(fresh.loopRun.turn).toBe(1);
  expect(router.seen[1].system).toContain('The conversation is just opening.');
});

test('fromSubject hands back the lone LoopRunAgent when the subject declares one desk', () => {
  const only: AgentSpec = { name: 'concierge', persona: 'You are the hotel desk.' };
  const agent = RoutedAgent.fromSubject({ specs: { concierge: only }, world: BOOKING,
    model: { scripted: { steps: [finishStep('Hello.')] } } });
  expect(agent).toBeInstanceOf(LoopRunAgent);
});

test('fromSubject builds the routed house and names it after the contract', () => {
  const specs: Record<string, AgentSpec> = {
    yard: { name: 'yard', persona: 'You run the yard.', handles: HANDLES.yard },
    billing: { name: 'billing', persona: 'You run billing.', handles: HANDLES.billing } };
  const agent = RoutedAgent.fromSubject({ specs, world: BOOKING,
    contract: { name: 'northgate-tool-hire' },
    model: { scripted: { steps: [finishStep('Hello.')] } } });
  expect(agent).toBeInstanceOf(RoutedAgent);
  expect(agent.name).toBe('northgate-tool-hire');
  expect((agent as RoutedAgent).deskNames).toEqual(['yard', 'billing']);
});

test('every desk of the house acts on ONE world — what the yard writes, billing reads', async () => {
  // Both desks run the SAME script: read the job, assign the crew, close. The yard goes
  // first, so billing's read is the only place the two worlds could disagree.
  const turn: readonly ModelStep[] = [
    callStep('getJob', { id: 'jb_a' }),
    callStep('setCrew', { id: 'jb_a', set: { crew: 'Bruno' } }),
    finishStep('The crew is assigned.', [{ tool: 'setCrew', target: 'jb_a', word: 'done' }])];
  const agent = RoutedAgent.fromSubject(
    { specs: DESKS, world: JOBS, model: { scripted: { steps: turn } } },
    () => new ScriptedModel([routeStep('yard'), routeStep('billing')]));

  const yard = await agent.generate('put a crew on the job', { session: 's1' });
  const billing = await agent.generate('who is on it for the invoice?', { session: 's1' });

  expect(yard.loopRun.acts[0].result).toMatchObject({ crew: 'Ana' });
  expect(billing.loopRun.acts[0].result).toMatchObject({ crew: 'Bruno' });
});

test('two messages on one session serialize — the second window carries the first exchange', async () => {
  const router = new ScriptedModel([routeStep('billing'), routeStep('billing')]);
  const billing = desk('billing', [finishStep('The invoice is paid.'),
                                   finishStep('It settled on Tuesday.')]);
  const agent = house(router, { yard: desk('yard', []).agent, billing: billing.agent });

  const [first] = await Promise.all([
    agent.generate('has the invoice been paid?', { session: 's1' }),
    agent.generate('when?', { session: 's1' })]);

  // Neither ledger entry is lost: the second front-desk window reads the first back.
  expect(router.seen[1].messages).toEqual([
    { role: 'user', text: 'has the invoice been paid?' },
    { role: 'assistant', text: first.text },
    { role: 'user', text: 'when?' }]);
  expect(router.seen[1].system).toContain('The conversation so far sits at the billing desk.');
});

test('fromSubject refuses a desk that declares no handles line', () => {
  const specs: Record<string, AgentSpec> = {
    yard: { name: 'yard', persona: 'You run the yard.', handles: HANDLES.yard },
    billing: { name: 'billing', persona: 'You run billing.' } };
  expect(() => RoutedAgent.fromSubject({ specs, world: BOOKING,
    model: { scripted: { steps: [] } } })).toThrow(/billing/);
});

/** The plain user and assistant lines of a desk's window — an acts message is the
 *  engine's own typed channel, never a spoken turn. */
function spoken(messages: readonly Msg[]): readonly string[] {
  return messages.filter((m): m is ChatMsg => m.role !== 'acts').map(m => m.text);
}

test('the routed door serves declared worlds — a live card is unrepresentable', () => {
  const live = mcpWorld({ reads: { getJob: { label: 'Look up the job' } } });
  const cfg: RoutedSubjectCfg = { specs: DESKS,
    // @ts-expect-error a live card carries no records for the house to share; the routed
    // door takes the declared world it builds once and hands to every desk.
    world: live,
    model: { scripted: { steps: [] } } };
  expect(cfg.specs).toBe(DESKS);          // never constructed from — the TYPE is the test
});
