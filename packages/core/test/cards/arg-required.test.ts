import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

test('a whitespace-only required arg counts as MISSING and refuses loudly', async () => {
  const model = new ScriptedModel([
    callStep('sendEmail', { to: '   ' }),
    finishStep('I could not send the email.',
      [{ tool: 'sendEmail', target: 'unknown', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const { engine, port } = testEngine({ model });

  const r = await engine.chat('s1', 'send the email');

  expect(port.log).toHaveLength(0);
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked', evidence: 'engine' });
  expect(r.acts[0].sentence).toContain("'to' is required and missing");
});

test('a non-coercible value refuses loudly, naming the arg — never a silent drop', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: { nested: true } }),
    finishStep('I could not read that booking.')
  ]);
  const { engine, port } = testEngine({ model });

  const r = await engine.chat('s1', 'check the booking');

  expect(port.log).toHaveLength(0);
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked', evidence: 'engine' });
  expect(r.acts[0].sentence).toContain("'id'");
});
