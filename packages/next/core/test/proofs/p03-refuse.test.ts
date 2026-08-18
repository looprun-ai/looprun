import { test, expect } from 'vitest';
import { maxCalls } from '../../src/cards/catalog.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';

// P3 · R5.6 — refuse: the act records not-done/blocked with the guard's sentence in
// the delivery, and the model continues the turn.
test('a refused call seals blocked with the rule in the delivery; the turn still closes by model', async () => {
  const guard = maxCalls('sendEmail', 1, { scope: 'conversation', reason: 'One email per person, ever.' })
    .compile('contract', BOOKING_SURFACE);
  const model = new ScriptedModel([
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Email sent.', [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }]),
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('I could not send a second email.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'blocked' }])
  ]);
  const { engine, port } = testEngine({ model, guards: [guard] });

  const r1 = await engine.chat('s1', 'email ana@example.com the confirmation');
  expect(r1.acts[0]).toMatchObject({ status: 'done', call: { tool: 'sendEmail' } });

  const r2 = await engine.chat('s1', 'send it again');
  expect(r2.acts).toHaveLength(1);
  expect(r2.acts[0]).toMatchObject({
    origin: 'model', said: null, status: 'not-done', reason: 'blocked', evidence: 'engine'
  });
  expect(r2.acts[0].sentence).toContain('One email per person, ever.');
  expect(r2.text).toContain('One email per person, ever.');
  expect(r2.closedBy).toBe('model');
  expect(port.log.filter(c => c.tool === 'sendEmail')).toHaveLength(1);
});
