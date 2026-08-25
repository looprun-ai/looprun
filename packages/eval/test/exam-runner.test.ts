import { test, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { world } from '@looprun-ai/core';
import type { ExamCase, ModelStep } from '@looprun-ai/core';
import { SubjectLoader, type Subject } from '../src/subject-loader.js';
import { ExamRunner } from '../src/exam-runner.js';
import { readDump } from '../src/run-dir.js';

const MINI = join(fileURLToPath(import.meta.url), '../fixtures/mini-subject');

const call = (tool: string, args: Record<string, unknown>): ModelStep =>
  ({ calls: [{ tool, args }], text: '' });
const finish = (message: string, report: { tool: string; target: string; word: string }[] = []):
  ModelStep => ({ calls: [{ tool: 'finish', args: { message, report } }], text: '' });
const routeStep = (desk: string): ModelStep =>
  ({ calls: [{ tool: 'route', args: { desk } }], text: '' });

/** A two-desk house, world-free — these cases only ever call finish. */
function routedSubject(): Subject {
  return { dir: '', contract: undefined, presets: [undefined], cases: [], targets: [],
    world: world({ records: {} }),
    specs: {
      yard: { name: 'yard', persona: 'You run the yard.', handles: 'job schedules' },
      billing: { name: 'billing', persona: 'You run billing.', handles: 'invoices and refunds' }
    } };
}

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

test('the dump carries what each turn cost — per-turn usage totals', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-06', split: 'fix', turns: ['cancel bk_9'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const usage = { inputTokens: 100, outputTokens: 10, cachedInputTokens: 40, reasoningTokens: 0 };
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    { ...call('cancelBooking', { id: 'bk_9' }), usage },
    { ...finish('I need your approval.',
        [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]), usage }
  ] } }, runDir);

  expect(dump.usage).toHaveLength(1);
  expect(dump.usage[0]).toMatchObject({ turn: 1, inputTokens: 200, outputTokens: 20,
    cachedInputTokens: 80, modelCalls: 2 });
  expect(dump.usage[0].wallClockMs).toBeGreaterThanOrEqual(0);
});

test('a port with no numbers reports zeros, never lies', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-07', split: 'fix', turns: ['hello'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed',
    { scripted: { steps: [finish('Hello.')] } }, runDir);

  expect(dump.usage[0]).toMatchObject({ turn: 1, inputTokens: 0, outputTokens: 0,
    cachedInputTokens: 0, modelCalls: 1 });
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

test('a routed case plays through the house — each record carries the desk that served it', async () => {
  const subject = routedSubject();
  const c: ExamCase = { id: 'route-01', split: 'fix',
    turns: ['put a crew on the job', 'look at the invoice'],
    route: ['yard', 'billing'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  // Element 0 reads as a finish to whichever desk is picked (its own first turn) and
  // as an unreadable decision to the router — which then retries onto element 1, the
  // real 'yard' decision. Turn two's decision reads clean on the router's first try.
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    finish('Hello.'), routeStep('yard'), routeStep('billing')
  ] } }, runDir);

  expect(dump.records).toHaveLength(2);
  expect(dump.records[0].routing?.desk).toBe('yard');
  expect(dump.records[1].routing?.desk).toBe('billing');
  expect(dump.invariantFailures).toEqual([]);
});

test('a route mismatch lands in invariantFailures', async () => {
  const subject = routedSubject();
  const c: ExamCase = { id: 'route-02', split: 'fix',
    turns: ['look at the invoice'], route: ['billing'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    finish('Hello.'), routeStep('yard')
  ] } }, runDir);

  expect(dump.records[0].routing?.desk).toBe('yard');
  expect(dump.invariantFailures).toEqual(['route mismatch at turn 1: expected billing, got yard']);
});

test('a desk-pinned case runs exactly as before — no routing field, no route checks', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-08', split: 'fix', agent: 'concierge',
    turns: ['is bk_9 confirmed?'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed',
    { scripted: { steps: [finish('It is confirmed.')] } }, runDir);

  expect(dump.records[0].routing).toBeUndefined();
  expect(dump.invariantFailures).toEqual([]);
});

test('a routed case dispatched ungoverned refuses — the label never lies', async () => {
  const subject = routedSubject();
  const c: ExamCase = { id: 'route-03', split: 'fix',
    turns: ['look at the invoice'], route: ['billing'], rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'ungoverned', { scripted: { steps: [
    finish('Hello.'), routeStep('billing')
  ] } }, runDir);

  expect(dump.records).toEqual([]);
  expect(dump.failure).toEqual({ kind: 'construction',
    detail: `a routed case has no ungoverned twin; run it governed` });
});
