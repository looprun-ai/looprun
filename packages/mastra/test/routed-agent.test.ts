import { test, expect } from 'vitest';
import type { AgentSpec, ChatMsg, DeclaredWorld, ForeignExchange, ModelStep, ModelTarget,
              Msg, TurnReturned } from '@looprun-ai/core';
import { ModelSeat, ScriptedModel, TurnFailure, WorldBuilder, mcpWorld,
         world } from '@looprun-ai/core';
import { RoutedAgent, type RoutedSubjectCfg } from '../src/routed-agent.js';
import { LoopRunAgent, type GovernedResult } from '../src/loop-run-agent.js';
import { assemble } from '../src/agent-assembly.js';
import { BOOKING, callStep, finishStep } from './fixtures/booking-world.js';

const DESCRIPTIONS = { yard: 'job schedules and hand-overs', billing: 'invoices and refunds' };

/** A world where one desk's read returns the id another desk needs, and the turn head shows
 *  no entity at all — so the only ground a second desk can stand on is what an act
 *  returned. Job jb_2 carries a bare number where jb_1 carries an invoice id. */
const WORKSITE = world({
  records: { jobs: { jb_1: { crew: 'Ana', invoice: 'in_7001' },
                     jb_2: { crew: 'Bo', ref: 7001 } },
             invoices: { in_7001: { settled: false } } },
  reads: { getJob: { form: 'get', entity: 'jobs', label: 'Look up the job' },
           getInvoice: { form: 'get', entity: 'invoices', label: 'Look up the invoice' } },
  tail: []
});

/** A world with a write, so what one desk changes is a thing another desk can read. */
const JOBS = world({
  records: { jobs: { jb_a: { crew: 'Ana' } } },
  reads: { getJob: { form: 'get', entity: 'jobs', label: 'Look up the job' } },
  writes: { setCrew: { form: 'set', entity: 'jobs', label: 'Assign the crew' } },
  presets: { handover: [{ entity: 'jobs', id: 'jb_a', set: { crew: 'Cleo' } }] }
});

const DESKS: Record<string, AgentSpec> = {
  yard: { name: 'yard', persona: 'You run the yard.', description: DESCRIPTIONS.yard, summary: 'the yard' },
  billing: { name: 'billing', persona: 'You run billing.', description: DESCRIPTIONS.billing, summary: 'the billing' } };

/** A router decision as the port answers it, with the tokens the provider billed. */
function routeStep(chosen: string, inputTokens = 0, outputTokens = 0): ModelStep {
  return { calls: [{ tool: 'route', args: { desk: chosen } }], text: '',
           usage: { inputTokens, outputTokens, cachedInputTokens: 0, reasoningTokens: 0 } };
}

const unreadable: ModelStep = { calls: [], text: '' };

/** A desk handing the message back, with the tokens the provider billed for reading it. */
const returns = (reason: string, inputTokens = 0, outputTokens = 0): ModelStep =>
  ({ calls: [{ tool: 'notMine', args: { reason } }], text: '',
     usage: { inputTokens, outputTokens, cachedInputTokens: 0, reasoningTokens: 0 } });

const SCRIPTED: ModelTarget = { id: 'scripted', provider: 'scripted', keyEnv: null,
                                tier: 'cloud', certified: true };

type DeliveryOpts = { session?: string; before?: readonly ForeignExchange[];
                      returnable?: boolean; grounded?: readonly string[] };

/** A desk that keeps the ids the house delivered to it — `delivered` is the grounding
 *  provenance seam, one entry per delivery. */
class Desk extends LoopRunAgent {
  readonly delivered: (readonly string[] | undefined)[] = [];
  override generateRouted(text: string, opts: DeliveryOpts):
      Promise<GovernedResult | TurnReturned> {
    this.delivered.push(opts.grounded);
    return super.generateRouted(text, opts);
  }
}

/** One desk whose seat is a ScriptedModel the test holds — `seen` is the desk's own
 *  window, its tool cards and the foreign text it was handed. Desk replies carry no
 *  figures: a figure no record grounds redrives the turn. */
function desk(name: string, steps: readonly ModelStep[], card: DeclaredWorld = BOOKING):
    { agent: Desk; model: ScriptedModel } {
  const model = new ScriptedModel(steps);
  const agent = new Desk(
    { spec: { name, persona: 'You are the desk.' }, world: card,
      model: { scripted: { steps: [] } } },
    async cfg => {
      const built = await assemble(cfg);
      return { ...built, config: { ...built.config,
        seat: ModelSeat.create([SCRIPTED], 'scripted', () => model) } };
    });
  return { agent, model };
}

function house(router: ScriptedModel, desks: Record<string, LoopRunAgent>): RoutedAgent {
  return new RoutedAgent({ name: 'northgate', desks, description: DESCRIPTIONS,
    summaries: ['the yard', 'the billing'], router });
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

test('none refuses at the front desk, touches no desk, and the history still grows', async () => {
  const router = new ScriptedModel([routeStep('none', 300, 6), routeStep('billing')]);
  const yard = desk('yard', []);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const out = await agent.generate('what is the weather tomorrow?', { session: 's1' });

  expect(out.text).toBe(
    'No desk at northgate performs this. The house covers: the yard and the billing.');
  expect(out.loopRun).toEqual({
    turn: 1, servedBy: 'front-desk', userText: 'what is the weather tomorrow?',
    acts: [], questions: { issued: [], consumed: [], closed: [] },
    finish: null, corrections: [], text: out.text,
    delivery: { by: 'floor', retried: false, facts: [] }, closedBy: 'engine',
    usage: { inputTokens: 300, outputTokens: 6, cachedInputTokens: 0,
             reasoningTokens: 0, modelCalls: 1 },
    routing: { desk: null, returned: null } });
  expect(yard.model.seen).toHaveLength(0);
  expect(billing.model.seen).toHaveLength(0);

  // The house said it; the history carries it, so the next window reads it back.
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
  // Two router steps, the yard's read that handed it back, and the desk that served.
  expect(out.loopRun.usage.modelCalls).toBe(4);
});

test('a returned-then-served turn bills the desk call that handed the message back', async () => {
  const router = new ScriptedModel([routeStep('yard', 300, 5), routeStep('billing', 310, 6)]);
  const yard = desk('yard', [returns('invoices are billing\'s work', 120, 4)]);
  const billing = desk('billing', [finishStep('The invoice is paid.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const out = await agent.generate('has the invoice been paid?', { session: 's1' });

  expect(out.loopRun.usage.modelCalls).toBe(4);
  // 300 + 310 at the front desk, 120 at the yard; the scripted desk that served
  // reports no numbers.
  expect(out.loopRun.usage.inputTokens).toBe(730);
  expect(out.loopRun.usage.outputTokens).toBe(15);
});

test('a return the front desk answers with none still bills the desk that read it', async () => {
  const router = new ScriptedModel([routeStep('yard', 300, 5), routeStep('none', 310, 6)]);
  const yard = desk('yard', [returns('that is nobody\'s work here', 120, 4)]);
  const agent = house(router, { yard: yard.agent, billing: desk('billing', []).agent });

  const out = await agent.generate('what is the weather tomorrow?', { session: 's1' });

  expect(out.loopRun.routing).toEqual(
    { desk: null, returned: { by: 'yard', reason: 'that is nobody\'s work here' } });
  expect(out.loopRun.usage.modelCalls).toBe(3);
  expect(out.loopRun.usage.inputTokens).toBe(730);
  expect(out.loopRun.usage.outputTokens).toBe(15);
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

test('a desk\'s own act mints the id the next desk stands on, and the record names its origin', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('billing')]);
  const yard = desk('yard', [callStep('getJob', { id: 'jb_1' }),
                             finishStep('Ana is on jb_1; the invoice is in_7001.')], WORKSITE);
  const billing = desk('billing', [callStep('getInvoice', { id: 'in_7001' }),
                                   finishStep('Invoice in_7001 is open.')], WORKSITE);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  await agent.generate('who is on job jb_1?', { session: 's1' });
  const settled = await agent.generate('settle its invoice', { session: 's1' });

  // Billing never read in_7001 and the operator never typed it: the yard's own act
  // returned it, and that is the whole of its licence to be used.
  expect(billing.agent.delivered[0]).toContain('in_7001');
  expect(settled.loopRun.acts[0].status).toBe('done');
  expect(settled.loopRun.routing?.grounded)
    .toContainEqual({ id: 'in_7001', origin: 'yard:getJob' });
});

test('an id several acts carry keeps the FIRST act that returned it as its origin', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('billing')]);
  const yard = desk('yard', [callStep('getJob', { id: 'jb_1' }),
                             callStep('getInvoice', { id: 'in_7001' }),
                             finishStep('Ana is on jb_1 and in_7001 is open.')], WORKSITE);
  const billing = desk('billing', [finishStep('Noted on the worksite file.')], WORKSITE);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  await agent.generate('who is on job jb_1?', { session: 's1' });
  const next = await agent.generate('note it on the worksite file', { session: 's1' });

  // getJob returned it and getInvoice took it as an argument — one mark, the first act.
  expect((next.loopRun.routing?.grounded ?? []).filter(m => m.id === 'in_7001'))
    .toEqual([{ id: 'in_7001', origin: 'yard:getJob' }]);
});

test('TEXT MINTS NOTHING: an id a desk planted in its reply grounds no call at the next desk', async () => {
  const router = new ScriptedModel([routeStep('yard'), routeStep('billing')]);
  // Job jb_2 carries a bare number and no invoice id. The yard states one anyway — words
  // the next desk reads back, and nothing an act ever produced.
  const yard = desk('yard', [callStep('getJob', { id: 'jb_2' }),
                             finishStep('Bo is on it — the invoice is in_7001.')], WORKSITE);
  const billing = desk('billing', [callStep('getInvoice', { id: 'in_7001' }),
                                   finishStep('I could not confirm that.'),
                                   { calls: [], text: '' },
                                   { calls: [], text: '' }], WORKSITE);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const said = await agent.generate('who is on job jb_2?', { session: 's1' });
  const settled = await agent.generate('settle its invoice', { session: 's1' });

  expect(said.text).toContain('in_7001');                    // the words did carry it
  expect(billing.agent.delivered[0]).not.toContain('in_7001');
  expect((settled.loopRun.routing?.grounded ?? []).map(m => m.id)).not.toContain('in_7001');
  expect(settled.loopRun.acts[0].status).toBe('not-done');
  expect(settled.loopRun.acts[0].guard).toBe('groundedIds');
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

test('every routed record counts the HOUSE\'s turns, whatever tape the desk kept', async () => {
  const router = new ScriptedModel([routeStep('billing'), routeStep('yard'),
                                    routeStep('billing'), routeStep('none')]);
  const yard = desk('yard', [finishStep('The Henderson job runs on Tuesday.')]);
  const billing = desk('billing', [finishStep('The invoice is paid.'),
                                   finishStep('It settled on Tuesday.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const counted: number[] = [];
  for (const text of ['is the invoice paid?', 'when does the Henderson job run?',
                      'when did it settle?', 'what is the weather tomorrow?']) {
    counted.push((await agent.generate(text, { session: 's1' })).loopRun.turn);
  }

  // Two desks and a front-desk refusal, and the dump reads one conversation.
  expect(counted).toEqual([1, 2, 3, 4]);
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
    yard: { name: 'yard', persona: 'You run the yard.', description: DESCRIPTIONS.yard, summary: 'the yard' },
    billing: { name: 'billing', persona: 'You run billing.', description: DESCRIPTIONS.billing, summary: 'the billing' } };
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
    finishStep('The crew is assigned.', [{ tool: 'setCrew', target: 'jb_a', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }];
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

  // Neither history entry is lost: the second front-desk window reads the first back.
  expect(router.seen[1].messages).toEqual([
    { role: 'user', text: 'has the invoice been paid?' },
    { role: 'assistant', text: first.text },
    { role: 'user', text: 'when?' }]);
  expect(router.seen[1].system).toContain('The conversation so far sits at the billing desk.');
});

test('fromSubject refuses a desk that declares no description line', () => {
  const specs: Record<string, AgentSpec> = {
    yard: { name: 'yard', persona: 'You run the yard.', description: DESCRIPTIONS.yard, summary: 'the yard' },
    billing: { name: 'billing', persona: 'You run billing.' } };
  expect(() => RoutedAgent.fromSubject({ specs, world: BOOKING,
    model: { scripted: { steps: [] } } })).toThrow(/billing/);
});

test('fromSubject refuses a description line that says nothing — blank is no line', () => {
  const specs: Record<string, AgentSpec> = {
    yard: { name: 'yard', persona: 'You run the yard.', description: DESCRIPTIONS.yard, summary: 'the yard' },
    billing: { name: 'billing', persona: 'You run billing.', description: '   ', summary: 'the desk' } };
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

test('a pre-built world and a preset name on one config refuse — that is two answers', async () => {
  const built = new WorldBuilder().build(JOBS);
  await expect(assemble({ spec: DESKS.yard, world: JOBS, built, preset: 'handover',
    model: { scripted: { steps: [] } } })).rejects.toThrow(TurnFailure);
  await expect(assemble({ spec: DESKS.yard, world: JOBS, built, preset: 'handover',
    model: { scripted: { steps: [] } } }))
    .rejects.toThrow(/already carries the scenario it was built with/);
});

test('fromSubject applies the preset to the ONE world it builds', async () => {
  const turn: readonly ModelStep[] = [callStep('getJob', { id: 'jb_a' }),
                                      finishStep('The crew is on it.')];
  const agent = RoutedAgent.fromSubject(
    { specs: DESKS, world: JOBS, preset: 'handover',
      model: { scripted: { steps: turn } } },
    () => new ScriptedModel([routeStep('yard')]));

  const out = await agent.generate('who is on the job?', { session: 's1' });
  expect(out.loopRun.acts[0].result).toMatchObject({ crew: 'Cleo' });
});

test('fromSubject refuses a preset the world card never declared', () => {
  expect(() => RoutedAgent.fromSubject({ specs: DESKS, world: JOBS, preset: 'nope',
    model: { scripted: { steps: [] } } })).toThrow(/nope/);
});

test('a message that is exactly a live code routes to the desk holding the question — the router is never asked', async () => {
  const router = new ScriptedModel([routeStep('yard')]);
  const yard = desk('yard', [
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('Cancelled as approved.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const billing = desk('billing', [finishStep('Never reached.')]);
  const agent = house(router, { yard: yard.agent, billing: billing.agent });

  const asked = await agent.generate('cancel bk_9', { session: 's1' });
  expect(asked.loopRun.routing?.desk).toBe('yard');
  const question = asked.loopRun.questions.issued[0];

  const done = await agent.generate(question.code, { session: 's1' });
  expect(done.loopRun.routing).toEqual({ desk: 'yard', returned: null });
  expect(done.loopRun.questions.consumed).toContain(question.id);
  // The router slept through the code: one decision on the tape, from turn one.
  expect(router.seen).toHaveLength(1);
  expect(billing.model.seen).toHaveLength(0);
});

test('a desk of the house is handed each colleague\'s own description line', async () => {
  const specs: Record<string, AgentSpec> = {
    yard: { name: 'yard', persona: 'You run the yard.', description: DESCRIPTIONS.yard, summary: 'the yard' },
    billing: { name: 'billing', persona: 'You run billing.', description: DESCRIPTIONS.billing, summary: 'the billing' } };
  const agent = RoutedAgent.fromSubject({ specs, world: BOOKING,
    model: { scripted: { steps: [] } } }) as RoutedAgent;

  const desks = (agent as never as { desks: Record<string, { ready: Promise<{ assembled:
    { config: { compiled: unknown } } }> }> }).desks;
  const yard = JSON.stringify((await desks.yard.ready).assembled.config.compiled);
  const billing = JSON.stringify((await desks.billing.ready).assembled.config.compiled);

  expect(yard).toContain(DESCRIPTIONS.billing);     // the colleague's own line, injected
  expect(billing).toContain(DESCRIPTIONS.yard);
});
