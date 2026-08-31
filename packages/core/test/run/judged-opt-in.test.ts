import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import type { AgentSpec } from '../../src/cards/cards.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { lieCheck } from '../../src/cards/catalog.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { finishStep } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, OK_BEHAVIORS, scriptedTargets } from '../fixtures/compiled-agents.js';
import { HostileToolPort } from '../fixtures/hostile-tool-port.js';

// The judged pass costs one model call per judged guard. A desk spends it only when its
// own card buys it, and a card carrying a judged guard it never asks is refused at
// construction. The check runs under its OWN system prompt: the desk's transcript is
// evidence in the message array, never the voice the answer comes from.

const CHECK: AgentSpec['guards'] = [lieCheck()];

function engineOf(spec: AgentSpec, model: ModelPort): Engine {
  return Engine.create({
    compiled: new AgentFactory().governed(spec, undefined, BOOKING_SURFACE),
    toolPort: new HostileToolPort(OK_BEHAVIORS),
    recordsPort: null,
    seat: ModelSeat.create(scriptedTargets(1), 'scripted-1', () => model)
  });
}

const DESK = { name: 'booking-desk', persona: 'You are the booking desk.' };

test('a desk that buys no pass carries no judged guard, and spends no judge call', async () => {
  // The card that would go unasked never compiles.
  expect(() => engineOf({ ...DESK, guards: CHECK }, new ScriptedModel([])))
    .toThrow('judgePass');

  const model = new ScriptedModel([finishStep('Nothing was booked today.')]);
  const record = await engineOf({ ...DESK }, model).chat('s1', 'anything today?');

  expect(record.text).toBe('Nothing was booked today.');
  expect(model.seen).toHaveLength(1);
  expect(model.seen.some(s => s.system.includes('checking ONE rule'))).toBe(false);
});

test('a desk that declares the judged pass asks its check under its own system', async () => {
  const model = new ScriptedModel([
    finishStep('Nothing was booked today.'),
    { calls: [], text: 'NO' }
  ]);
  const record = await engineOf({ ...DESK, judgePass: true, guards: CHECK }, model)
    .chat('s1', 'anything today?');

  expect(record.text).toBe('Nothing was booked today.');
  expect(model.seen).toHaveLength(2);
  const [drive, check] = model.seen;
  expect(check.system).toContain('checking ONE rule');
  expect(check.system).not.toBe(drive.system);
  expect(check.tools).toEqual([]);
  const asked = check.messages.at(-1);
  expect(asked?.role === 'acts' ? '' : asked?.text).toContain(lieCheck().judgeQuery ?? '');
});

test('the pass fills the compiled judged rows, and buys nothing on its own', () => {
  const factory = new AgentFactory();
  expect(factory.governed({ ...DESK, judgePass: true }, undefined, BOOKING_SURFACE).judged)
    .toEqual([]);
  expect(factory.governed({ ...DESK, judgePass: true, guards: CHECK }, undefined, BOOKING_SURFACE)
    .judged.map(g => g.name)).toEqual(['lieCheck']);
  // The ungoverned twin asks no judge, whatever the spec bought.
  expect(factory.ungoverned({ ...DESK, judgePass: true, guards: CHECK }, undefined,
    BOOKING_SURFACE).judged).toEqual([]);
});
