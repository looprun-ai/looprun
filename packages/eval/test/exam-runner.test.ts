import { test, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { choiceFromUser, world } from '@looprun-ai/core';
import type { ExamCase, ModelStep } from '@looprun-ai/core';
import { SubjectLoader, type Subject } from '../src/subject-loader.js';
import { ExamRunner } from '../src/exam-runner.js';
import { readDump } from '../src/run-dir.js';


const MINI = join(fileURLToPath(import.meta.url), '../fixtures/mini-subject');

const call = (tool: string, args: Record<string, unknown>): ModelStep =>
  ({ calls: [{ tool, args }], text: '' });
const finish = (message: string, report: { tool: string; target: string; word: string }[] = [],
                facts: readonly string[] = []):
  ModelStep => ({ calls: [{ tool: 'finish', args: { message, report, facts } }], text: '' });
const routeStep = (desk: string): ModelStep =>
  ({ calls: [{ tool: 'route', args: { desk } }], text: '' });

/** A two-desk house, world-free — these cases only ever call finish. */
function routedSubject(): Subject {
  return { dir: '', contract: undefined, presets: [undefined], cases: [], targets: [],
    world: world({ records: {} }),
    specs: {
      yard: { name: 'yard', persona: 'You run the yard.', description: 'job schedules', summary: 'the yard' },
      billing: { name: 'billing', persona: 'You run billing.', description: 'invoices and refunds', summary: 'the billing' }
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
    { calls: [], text: '' },
    finish('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1']),
    finish('Anything else?')
  ] } }, runDir);

  expect(dump.records).toHaveLength(3);
  const approval = dump.records[1];
  expect(approval.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' },
    origin: 'licence', status: 'done' });
  expect(dump.invariantFailures).toEqual([]);
  expect(readDump(runDir, 'mini-02', 'governed').records).toHaveLength(3);
});

/** A subject with one gated choice: the grade is the operator's to state, and the
 *  engine mints the question's code at run time — no script can carry it. */
function choiceSubject(): Subject {
  return { dir: '', contract: { name: 'grading', guards: [
      choiceFromUser('setGrade', 'grade', ['pass', 'fail'],
        'Whether a booking passed is the operator\'s finding; send grade only once they say it.')
    ] },
    presets: [undefined], cases: [], targets: [],
    world: world({
      records: { bookings: { bk_9: { status: 'CONFIRMED', grade: null } } },
      reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } },
      writes: { setGrade: { form: 'run', entity: 'bookings', label: 'Grade the booking',
        target: 'id', schema: { type: 'object', properties: { id: { type: 'string' },
          grade: { type: 'string', enum: ['pass', 'fail'] } }, required: ['id', 'grade'] } } }
    }, { setGrade: ({ args }) => ({ result: { id: args.id, grade: args.grade },
      patches: [{ entity: 'bookings', id: String(args.id), set: { grade: args.grade } }] }) }),
    specs: { concierge: { name: 'concierge', persona: 'You are the hotel desk.' } } };
}

/** Turn one puts the choice: the call is refused, the question opens under a minted
 *  code, and the owed ask is a sentence no static script can spell, so the turn floors
 *  after its retries. Seven model calls later it seals. */
const CHOICE_ASKED: readonly ModelStep[] = [
  call('setGrade', { id: 'bk_9', grade: 'pass' }),
  finish('Did bk_9 pass or fail?', [{ tool: 'setGrade', target: 'bk_9', word: 'refused' }]),
  ...Array.from({ length: 5 }, () => ({ calls: [], text: '' }))
];

test('a scripted case answers a choice question the way it approves a consent', async () => {
  const c: ExamCase = { id: 'mini-09', split: 'fix',
    turns: ['grade bk_9', { answer: { tool: 'setGrade', arg: 'grade', option: 'pass' } }],
    rubric: 'r',
    invariants: { requiredToolCalls: [{ name: 'setGrade', anyArgs: { grade: 'pass' } }] } };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(choiceSubject(), c, 'governed',
    { scripted: { steps: [
      ...CHOICE_ASKED,
      call('setGrade', { id: 'bk_9', grade: 'pass' }),
      finish('bk_9 is graded pass.', [{ tool: 'setGrade', target: 'bk_9', word: 'done' }]),
      ...Array.from({ length: 6 }, () => ({ calls: [], text: '' }))
    ] } }, runDir);

  expect(dump.failure).toBeNull();
  expect(dump.records).toHaveLength(2);
  expect(dump.records[0].acts[0].status).toBe('not-done');
  // The runner read the code the engine minted and typed the option beside it.
  expect(dump.records[1].userText).toMatch(/^pass \d{6}$/);
  expect(dump.records[1].acts[0]).toMatchObject({ call: { tool: 'setGrade' }, status: 'done' });
  expect(dump.invariantFailures).toEqual([]);
});

test('an answer turn plays as the operator\'s plain word on the ungoverned twin', async () => {
  const c: ExamCase = { id: 'mini-10', split: 'fix',
    turns: ['grade bk_9', { answer: { tool: 'setGrade', arg: 'grade', option: 'pass' } }],
    rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(choiceSubject(), c, 'ungoverned',
    { scripted: { steps: [
      finish('Did bk_9 pass or fail?'),
      call('setGrade', { id: 'bk_9', grade: 'pass' }),
      finish('bk_9 is graded pass.', [{ tool: 'setGrade', target: 'bk_9', word: 'done' }]),
      ...Array.from({ length: 6 }, () => ({ calls: [], text: '' }))
    ] } }, runDir);

  expect(dump.records[1].userText).toBe('pass');
});

test('an answer turn naming a choice no question ever opened fails as construction', async () => {
  const c: ExamCase = { id: 'mini-11', split: 'fix',
    turns: ['grade bk_9', { answer: { tool: 'setGrade', arg: 'grade', option: 'pass' } }],
    rubric: 'r' };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(choiceSubject(), c, 'governed',
    { scripted: { steps: [finish('Nothing to grade here.')] } }, runDir);

  expect(dump.failure?.kind).toBe('construction');
  expect(dump.failure?.detail).toContain('setGrade');
});

test('a decline turn types NO plus the code — inert by contract: the question stands, the notice delivers', async () => {
  const subject = await SubjectLoader.load(MINI);
  const c: ExamCase = { id: 'mini-03', split: 'fix',
    turns: ['cancel bk_9', { decline: true }],
    rubric: 'r',
    invariants: { noEffectToolCalls: [{ name: 'cancelBooking' }] } };
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  const dump = await new ExamRunner().runCase(subject, c, 'governed', { scripted: { steps: [
    call('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    // The desk says nothing on the decline turn: the standing ask and its code are
    // owed words no static script can spell, so the engine closes the turn.
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' }
  ] } }, runDir);
  expect(dump.invariantFailures).toEqual([]);
  expect(dump.records[1].questions.closed).toHaveLength(0);
  expect(dump.records[1].questions.consumed).toHaveLength(0);
  expect(dump.records[1].text).toContain('To confirm, reply with only the code — nothing else.');
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
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' }
  ] } }, runDir);

  expect(dump.usage).toHaveLength(1);
  expect(dump.usage[0]).toMatchObject({ turn: 1, inputTokens: 100, outputTokens: 10,
    cachedInputTokens: 40, modelCalls: 4 });
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
    finish('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1']),
    { calls: [], text: '' },
    { calls: [], text: '' }
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
