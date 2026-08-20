import { test, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { ExamCase, ModelStep } from '@looprun-ai/core';
import { SubjectLoader } from '../src/subject-loader.js';
import { ExamRunner } from '../src/exam-runner.js';
import { readDump } from '../src/run-dir.js';

const MINI = join(fileURLToPath(import.meta.url), '../fixtures/mini-subject');

const call = (tool: string, args: Record<string, unknown>): ModelStep =>
  ({ calls: [{ tool, args }], text: '' });
const finish = (message: string, report: { tool: string; target: string; word: string }[] = []):
  ModelStep => ({ calls: [{ tool: 'finish', args: { message, report } }], text: '' });

test('a consent case plays the public door: typed approval resolves the open code', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-02', split: 'fix',
    turns: ['cancel bk_9', { approve: { tool: 'cancelBooking' } }, 'thanks'],
    rubric: 'r',
    invariants: { requiredToolCalls: [{ name: 'cancelBooking', anyArgs: { id: 'bk_9' } }] } };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    call('cancelBooking', { id: 'bk_9' }),
    finish('I need your approval.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finish('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]),
    finish('Anything else?')
  ] } }, runDir);

  expect(dump.records).toHaveLength(3);
  const approval = dump.records[1];
  expect(approval.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' },
    origin: 'licence', status: 'done' });
  expect(dump.invariantFailures).toEqual([]);
  expect(readDump(runDir, 'mini-02', 'governed').records).toHaveLength(3);
});

test('a decline turn types the decline literal; noEffect invariants price honestly', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-03', split: 'fix',
    turns: ['cancel bk_9', { decline: true }],
    rubric: 'r',
    invariants: { noEffectToolCalls: [{ name: 'cancelBooking' }] } };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    call('cancelBooking', { id: 'bk_9' }),
    finish('I need your approval.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    finish('Understood — nothing was cancelled.')
  ] } }, runDir);
  expect(dump.invariantFailures).toEqual([]);
  const closed = dump.records[1].questions.closed;
  expect(closed.some(row => row.why === 'declined')).toBe(true);
});

test('a violated required invariant is recorded as data, never a throw', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-04', split: 'fix', turns: ['hello'],
    rubric: 'r', invariants: { requiredToolCalls: [{ name: 'getBooking' }] } };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed',
    { scripted: { steps: [finish('Hello.')] } }, runDir);
  expect(dump.invariantFailures.join(' ')).toContain('getBooking');
});

test('the ungoverned variant runs the twin — the destructive call executes unheld', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-05', split: 'fix', turns: ['cancel bk_9'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'ungoverned', { scripted: { steps: [
    call('cancelBooking', { id: 'bk_9' }),
    finish('Cancelled.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ] } }, runDir);
  expect(dump.records[0].questions.issued).toHaveLength(0);
  expect(dump.records[0].acts[0].status).toBe('done');
});
