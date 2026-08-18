import { test, expect } from 'vitest';
import type { LiveWorldCard, McpWorldCard } from '@looprun-ai/next-core';
import { BuiltWorld, CardError, Engine, TurnFailure } from '@looprun-ai/next-core';
import { assemble, assembleUngoverned } from '../src/agent-assembly.js';
import { BOOKING, SPEC, callStep, finishStep } from './fixtures/booking-world.js';

const SCRIPTED = { scripted: { steps: [finishStep('Hello.')] } };

test('a world card assembles the author door: built world seated, consent armed', async () => {
  const { config, surface } = await assemble({ spec: SPEC, model: SCRIPTED, world: BOOKING });
  expect(config.toolPort).toBeInstanceOf(BuiltWorld);
  expect(config.recordsPort).toBe(config.toolPort);
  expect(config.compiled.guards.some(g => typeof g.hold === 'function')).toBe(true);
  expect(surface).toBeNull();
});

test('the scripted seat drives a real governed turn end to end', async () => {
  const { config } = await assemble({
    spec: SPEC,
    model: { scripted: { steps: [
      callStep('getBooking', { id: 'bk_9' }),
      finishStep('bk_9 is confirmed for Tuesday.')
    ] } },
    world: BOOKING
  });
  const rec = await Engine.create(config).chat('s1', 'is bk_9 confirmed?');
  expect(rec.text).toContain('Tuesday');
  expect(rec.acts[0].call.tool).toBe('getBooking');
});

test('a liveWorld missing a declared tool throws the aggregated CardError', async () => {
  const card: LiveWorldCard = { host: 'crm', reads: { getGuest: { label: 'Look up the guest' } } };
  const failed = await assemble({ spec: SPEC, model: SCRIPTED, world: card, live: {} })
    .catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(CardError);
  expect((failed as CardError).problems[0].code).toBe('SURFACE_TOOL_MISSING');
});

test('a liveWorld adopts live schemas the card left undeclared; the report lists exclusions', async () => {
  const card: LiveWorldCard = { host: 'crm', reads: { getGuest: { label: 'Look up the guest' } } };
  const schema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
  const { config, surface } = await assemble({ spec: SPEC, model: SCRIPTED, world: card, live: {
    getGuest: { name: 'getGuest', description: 'guest', schema,
      execute: () => Promise.resolve({ guest: 'g_1' }) },
    offSurface: { name: 'offSurface', description: 'extra', schema: { type: 'object' },
      execute: () => Promise.resolve(null) }
  } });
  expect(JSON.stringify(config.compiled.facts.tools.getGuest.schema)).toBe(JSON.stringify(schema));
  expect(surface?.active).toEqual(['getGuest']);
  expect(surface?.excluded).toEqual([{ name: 'offSurface', why: 'off-surface' }]);
});

test('an mcpWorld card without the host-env mcp door fails loud at construction', async () => {
  const card: McpWorldCard = { reads: { getBooking: { label: 'Look up the booking' } } };
  const failed = await assemble({ spec: SPEC, model: SCRIPTED, world: card })
    .catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(TurnFailure);
  expect((failed as TurnFailure).kind).toBe('construction');
});

test('the ungoverned twin compiles byte-identical prompt parts with nothing armed', async () => {
  const governed = await assemble({ spec: SPEC, model: SCRIPTED, world: BOOKING });
  const ungoverned = await assembleUngoverned({
    spec: SPEC, world: BOOKING,
    model: { scripted: { steps: [
      callStep('cancelBooking', { id: 'bk_9' }),
      finishStep('Cancelled.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
    ] } }
  });
  expect(JSON.stringify(ungoverned.config.compiled.promptParts))
    .toBe(JSON.stringify(governed.config.compiled.promptParts));
  // The disarming is behavioral: the destructive call runs with no question raised.
  const rec = await Engine.create(ungoverned.config).chat('s1', 'cancel bk_9');
  expect(rec.questions.issued).toHaveLength(0);
  expect(rec.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' }, status: 'done' });
});
