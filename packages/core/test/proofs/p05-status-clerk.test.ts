import { test, expect } from 'vitest';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import { StatusClerk } from '../../src/run/status-clerk.js';
import type { TurnDraft } from '../../src/run/session.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P5 · R3.6 — the whole grading table: the engine derives the user-facing word from
// the tool's OWN answer and never guesses — exactly what an MCP surface gives.

const clerk = new StatusClerk();

function draft(): TurnDraft {
  return { turn: 1, userText: '', servedBy: '', acts: [], corrections: [],
           issued: [], consumed: [], closed: [], finish: null, closedBy: 'model', text: '', delivery: null,
           microTried: [], grounded: [],
           usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
                    modelCalls: 0 } };
}

const answer = (done: 'yes' | 'no' | 'unknown') => ({ answer: { result: null, done }, actId: 'a1' });

test("done:'yes' grades done on the executor's word", () => {
  expect(clerk.grade(answer('yes'), 'write', draft()))
    .toMatchObject({ status: 'done', reason: null, evidence: 'executor' });
});

test("done:'no' grades not-done/refused", () => {
  expect(clerk.grade(answer('no'), 'write', draft()))
    .toMatchObject({ status: 'not-done', reason: 'refused', evidence: 'executor' });
});

test("done:'unknown' grades unknown — never success, never nothing-changed", () => {
  expect(clerk.grade(answer('unknown'), 'write', draft()))
    .toMatchObject({ status: 'unknown', reason: null });
});

test('a throw on a read is a TurnFailure', () => {
  expect(() => clerk.grade({ threw: 'ECONNRESET', actId: 'a1' }, 'read', draft()))
    .toThrow(TurnFailure);
});

test('a throw on a write grades unknown — it may have landed', () => {
  expect(clerk.grade({ threw: 'ECONNRESET', actId: 'a1' }, 'write', draft()))
    .toMatchObject({ status: 'unknown', reason: null, evidence: 'engine' });
});

test('a veto grades not-done/blocked with engine evidence', () => {
  expect(clerk.grade({ verdict: { kind: 'refuse', guardName: 'g', detail: 'd' }, actId: 'a1' },
    'destructive', draft()))
    .toMatchObject({ status: 'not-done', reason: 'blocked', evidence: 'engine' });
});

test("done:'no' on a destructive act grades not-done/refused — the answer alone speaks", () => {
  expect(clerk.grade(answer('no'), 'destructive', draft()))
    .toMatchObject({ status: 'not-done', reason: 'refused', evidence: 'executor' });
});

test('a surface that answers no is taken at its word, whatever its records did', async () => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_1' }),
    finishStep('The surface refused the cancellation.',
      [{ tool: 'cancelBooking', target: 'bk_1', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' }]);
  const { engine } = testEngine({
    model,
    behaviors: {
      cancelBooking: () => ({ result: { refused: 'policy' }, done: 'no' })
    }
  });

  const r = await engine.chat('s1', 'cancel bk_1');

  expect(r.acts[0]).toMatchObject({ said: 'no', status: 'not-done', reason: 'refused',
    evidence: 'executor' });
  expect(r.corrections.map(c => c.kind)).not.toContain('recordCorrected');
});
