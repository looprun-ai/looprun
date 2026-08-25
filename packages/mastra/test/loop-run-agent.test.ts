import { test, expect } from 'vitest';
import { LoopRunAgent } from '../src/loop-run-agent.js';
import { UngovernedAgent } from '../src/ungoverned-agent.js';
import { BOOKING, SPEC, callStep, finishStep } from './fixtures/booking-world.js';

function readAgent() {
  return new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('getBooking', { id: 'bk_9' }),
      finishStep('bk_9 is confirmed for Tuesday.'),
      finishStep('Anything else?')
    ] } }
  });
}

test('generate returns the delivery text and the whole TurnRecord', async () => {
  const out = await readAgent().generate('is bk_9 confirmed?', { session: 's1' });
  expect(out.text).toContain('Tuesday');
  expect(out.loopRun.turn).toBe(1);
  expect(out.loopRun.acts[0].call.tool).toBe('getBooking');
});

test('two concurrent turns on ONE session serialize; the records number 1 and 2', async () => {
  const agent = readAgent();
  const [a, b] = await Promise.all([
    agent.generate('is bk_9 confirmed?', { session: 's1' }),
    agent.generate('thanks', { session: 's1' })
  ]);
  expect([a.loopRun.turn, b.loopRun.turn].sort()).toEqual([1, 2]);
});

test('guards() lists the installed census; excluded() is empty on a world card', async () => {
  const agent = readAgent();
  await agent.generate('hi', { session: 's1' });
  const census = agent.guards();
  expect(JSON.stringify(census).length).toBeGreaterThan(2);
  expect(agent.excluded()).toEqual([]);
});

test('endSession drops the state — the next turn is turn 1 again', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      finishStep('Hello.'), finishStep('Hello again.'), finishStep('Fresh start.')
    ] } }
  });
  await agent.generate('hi', { session: 's1' });
  await agent.generate('hi', { session: 's1' });
  agent.endSession('s1');
  const fresh = await agent.generate('hi', { session: 's1' });
  expect(fresh.loopRun.turn).toBe(1);
});

test('stream governs to completion, THEN the composed delivery flows', async () => {
  const out = await readAgent().stream('is bk_9 confirmed?', { session: 's1' });
  expect(out.loopRun.turn).toBe(1);           // sealed before the first chunk is read
  let streamed = '';
  for await (const chunk of out.textStream) streamed += chunk;
  expect(streamed).toBe(out.loopRun.text);
});

test('generateRouted resolves the engine\'s TurnReturned unchanged', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('notMine', { reason: 'wrong desk' })
    ] } }
  });
  const out = await agent.generateRouted('hi', { session: 's1', returnable: true });
  expect(out).toEqual({ returned: { reason: 'wrong desk' } });
});

test('generateRouted resolves { text, loopRun } on a sealed record', async () => {
  const out = await readAgent().generateRouted('is bk_9 confirmed?', { session: 's1' });
  if ('returned' in out) throw new Error('expected a sealed record, got a TurnReturned');
  expect(out.text).toContain('Tuesday');
  expect(out.loopRun.turn).toBe(1);
  expect(out.loopRun.acts[0].call.tool).toBe('getBooking');
});

test('the ungoverned twin executes the destructive call with no question — by class name', async () => {
  const twin = new UngovernedAgent({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('cancelBooking', { id: 'bk_9' }),
      finishStep('Cancelled.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
    ] } }
  });
  const out = await twin.generate('cancel bk_9', { session: 's1' });
  expect(out.loopRun.questions.issued).toHaveLength(0);
  expect(out.loopRun.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' }, status: 'done' });
  const governed = readAgent();
  await governed.generate('hi', { session: 'g1' });
  expect(JSON.stringify(twin.guards())).toBe(JSON.stringify(governed.guards()));
});
