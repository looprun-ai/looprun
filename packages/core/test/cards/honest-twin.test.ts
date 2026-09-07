import { test, expect } from 'vitest';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { PromptWriter } from '../../src/run/prompt-writer.js';
import { BOOKING_SURFACE, fact } from '../fixtures/compiled-agents.js';

// The ungoverned twin tells the truth about itself: with nothing armed, the prompt says no
// call is held and asks the desk to seek the operator's word itself; the governed build says
// nothing of the kind, because there the engine holds the call.

const SURFACE = { tools: { ...BOOKING_SURFACE.tools,
  cancelBooking: fact({ ...BOOKING_SURFACE.tools.cancelBooking, effect: 'destructive' }) } };
const SPEC = { name: 'desk', persona: 'You are the desk.', guards: [
  { name: 'oneQuestion', rule: 'Put it up by making the call — the system holds it.', on: 'reply' as const },
  { name: 'declareHonestly', rule: 'Say what ran and what did not.', on: 'reply' as const }] };
const CONTRACT = { name: 'house' };

test('the ungoverned twin says no call is held, in the prefix and on the destructive card', () => {
  const compiled = new AgentFactory().ungoverned(SPEC, CONTRACT, SURFACE);
  const writer = new PromptWriter(compiled);
  expect(writer.system()).toContain('Nothing here holds a call');
  expect(writer.system()).not.toContain('the system holds it');
  expect(writer.system()).toContain('Say what ran and what did not.');
  const card = writer.toolCards().find(c => c.name === 'cancelBooking');
  expect(card?.does).toContain('Ask the operator for explicit confirmation before this call');
  expect(writer.toolCards().find(c => c.name === 'getBooking')?.does).not.toContain('explicit confirmation');
});

test('the governed build says nothing of the kind', () => {
  const compiled = new AgentFactory().governed(SPEC, CONTRACT, SURFACE);
  const writer = new PromptWriter(compiled);
  expect(writer.system()).not.toContain('Nothing here holds a call');
  expect(writer.system()).toContain('the system holds it');
  expect(writer.toolCards().find(c => c.name === 'cancelBooking')?.does).not.toContain('explicit confirmation');
});
