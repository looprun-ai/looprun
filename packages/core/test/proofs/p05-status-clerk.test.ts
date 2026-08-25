import { test, expect } from 'vitest';
import type { StateSnapshot } from '../../src/contract/vocabulary.js';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import { StatusClerk } from '../../src/run/status-clerk.js';
import type { TurnDraft } from '../../src/run/session.js';
import { RecordsPortStub } from '../fixtures/records-port-stub.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P5 · R3.6 — the whole grading table: the engine derives the user-facing word and
// never guesses; the snapshot diff overrules a lying executor.

const clerk = new StatusClerk();

function draft(): TurnDraft {
  return { turn: 1, userText: '', servedBy: '', acts: [], corrections: [],
           issued: [], consumed: [], closed: [], finish: null, closedBy: 'model', text: '',
           microTried: [], grounded: [],
           usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
                    modelCalls: 0 } };
}

const answer = (done: 'yes' | 'no' | 'unknown') => ({ answer: { result: null, done }, actId: 'a1' });

test("done:'yes' grades done on the executor's word", () => {
  expect(clerk.grade(answer('yes'), 'write', null, null, draft()))
    .toMatchObject({ status: 'done', reason: null, evidence: 'executor' });
});

test("done:'no' grades not-done/refused", () => {
  expect(clerk.grade(answer('no'), 'write', null, null, draft()))
    .toMatchObject({ status: 'not-done', reason: 'refused', evidence: 'executor' });
});

test("done:'unknown' grades unknown — never success, never nothing-changed", () => {
  expect(clerk.grade(answer('unknown'), 'write', null, null, draft()))
    .toMatchObject({ status: 'unknown', reason: null });
});

test('a throw on a read is a TurnFailure', () => {
  expect(() => clerk.grade({ threw: 'ECONNRESET', actId: 'a1' }, 'read', null, null, draft()))
    .toThrow(TurnFailure);
});

test('a throw on a write grades unknown — it may have landed', () => {
  expect(clerk.grade({ threw: 'ECONNRESET', actId: 'a1' }, 'write', null, null, draft()))
    .toMatchObject({ status: 'unknown', reason: null, evidence: 'engine' });
});

test('a veto grades not-done/blocked with engine evidence', () => {
  expect(clerk.grade({ verdict: { kind: 'refuse', guardName: 'g', detail: 'd' }, actId: 'a1' },
    'destructive', null, null, draft()))
    .toMatchObject({ status: 'not-done', reason: 'blocked', evidence: 'engine' });
});

test("a state change under done:'no' corrects the act to done and mints recordCorrected", () => {
  const before: StateSnapshot = { bookings: { bk_1: { status: 'CONFIRMED' } } };
  const after: StateSnapshot = { bookings: { bk_1: { status: 'CANCELLED' } } };
  const grade = clerk.grade(answer('no'), 'destructive', before, after, draft());
  expect(grade).toMatchObject({ status: 'done', reason: null, evidence: 'diff' });
  expect(grade.corrections).toEqual([{ kind: 'recordCorrected', actId: 'a1', said: 'no' }]);
});

test("an unchanged state under done:'no' stays not-done/refused", () => {
  const same: StateSnapshot = { bookings: { bk_1: { status: 'CONFIRMED' } } };
  expect(clerk.grade(answer('no'), 'destructive', same, same, draft()))
    .toMatchObject({ status: 'not-done', reason: 'refused', evidence: 'executor' });
});

test('the sealed act carries the diff correction end to end', async () => {
  const records = new RecordsPortStub();
  records.set('bookings', 'bk_1', { status: 'CONFIRMED' });
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_1' }),
    finishStep('Cancelled.', [{ tool: 'cancelBooking', target: 'bk_1', word: 'done' }])
  ]);
  const { engine } = testEngine({
    model, records,
    behaviors: {
      cancelBooking: () => {
        records.set('bookings', 'bk_1', { status: 'CANCELLED' });
        return { result: { refused: 'policy' }, done: 'no' };
      }
    }
  });

  const r = await engine.chat('s1', 'cancel bk_1');

  expect(r.acts[0]).toMatchObject({ said: 'no', status: 'done', evidence: 'diff' });
  expect(r.corrections).toContainEqual({ kind: 'recordCorrected', actId: r.acts[0].id, said: 'no' });
});
