import { test, expect } from 'vitest';
import type { Act, ReplyCtx } from '../../src/contract/vocabulary.js';
import { HonestyCheck } from '../../src/run/honesty-check.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const checker = new HonestyCheck(factsFromWorld(HOSTILE));

function act(tool: string, id: string, status: Act['status'], reason: Act['reason'],
             effect: Act['effect'] = 'write'): Act {
  return { id: `a_${tool}_${id}`, turn: 1, origin: 'model',
    call: { tool, args: { id }, key: `${tool}:${id}` }, effect, said: null,
    status, reason, evidence: 'engine', sentence: `${tool}(${id}) — ${status}`,
    result: null, questionId: null, guard: null };
}

function ctx(report: ReplyCtx['report'], turnActs: readonly Act[], message = 'ok'): ReplyCtx {
  return { message, report, userText: '', turnActs, pastActs: [] };
}

test('a claim matching no act is lying — the denial names the claim', () => {
  const v = checker.check(ctx([{ tool: 'compRoom', target: 'bk_9', word: 'done' }], []));
  expect(v).toHaveLength(1);
  expect(v[0].guardName).toBe('claimIsGrounded');
  expect(v[0].detail).toContain('compRoom');
});

test('a leftover must-claim act is hiding — the denial names the tool and target', () => {
  const v = checker.check(ctx([], [act('compRoom', 'bk_9', 'done', null)]));
  expect(v).toHaveLength(1);
  expect(v[0].guardName).toBe('claimIsComplete');
  expect(v[0].detail).toContain('compRoom');
  expect(v[0].detail).toContain('bk_9');
});

test('the word carries an evidence class — refused needs a recorded refusal', () => {
  const blocked = act('compRoom', 'bk_9', 'not-done', 'blocked');
  const v = checker.check(ctx([{ tool: 'compRoom', target: 'bk_9', word: 'refused' }], [blocked]));
  expect(v.some(x => x.guardName === 'claimIsGrounded')).toBe(true);
  const ok = checker.check(ctx([{ tool: 'compRoom', target: 'bk_9', word: 'blocked' }], [blocked]));
  expect(ok).toEqual([]);
});

test('a held act supports a held line; reads are never owed as claims', () => {
  const held = act('cancelBooking', 'bk_9', 'not-done', 'held', 'destructive');
  const read = act('getBooking', 'bk_9', 'done', null, 'read');
  expect(checker.check(ctx([{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }],
    [held, read]))).toEqual([]);
});

test('matching is order-free and one act grounds one claim', () => {
  const a1 = act('compRoom', 'bk_9', 'done', null);
  const a2 = act('compRoom', 'bk_66', 'done', null);
  expect(checker.check(ctx([
    { tool: 'compRoom', target: 'bk_66', word: 'done' },
    { tool: 'compRoom', target: 'bk_9', word: 'done' }
  ], [a1, a2]))).toEqual([]);
  const doubled = checker.check(ctx([
    { tool: 'compRoom', target: 'bk_9', word: 'done' },
    { tool: 'compRoom', target: 'bk_9', word: 'done' }
  ], [a1]));
  expect(doubled.some(x => x.guardName === 'claimIsGrounded')).toBe(true);
});

test('no_tool_called grounds on absence — an act of that tool and target makes it a contradiction', () => {
  const clean = checker.check(ctx([{ tool: 'compRoom', target: 'bk_9', word: 'no_tool_called' }], []));
  expect(clean).toHaveLength(0);

  const ran = act('compRoom', 'bk_9', 'done', null);
  const v = checker.check(ctx(
    [{ tool: 'compRoom', target: 'bk_9', word: 'no_tool_called' },
     { tool: 'compRoom', target: 'bk_9', word: 'done' }], [ran]));
  expect(v).toHaveLength(1);
  expect(v[0].guardName).toBe('claimIsGrounded');
  expect(v[0].detail).toContain('contradicts');
});
