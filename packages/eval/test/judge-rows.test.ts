import { test, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDump, type CaseDump } from '../src/run-dir.js';
import { buildJudgeInputs, readJudgeParts } from '../src/judge-inputs.js';

// A row an author reads names the stage that wrote the delivered text and the guard
// that sent the desk back — no dump is opened to learn either.

interface JudgeRow {
  readonly turns: readonly {
    readonly corrections: readonly { readonly kind: string;
      readonly guardName: string | null; readonly detail: string | null }[];
    readonly finish: { readonly message: string } | null;
    readonly delivery: { readonly by: string };
  }[];
}

function dumpOf(records: CaseDump['records']): CaseDump {
  return { case: 'c1', variant: 'governed', split: 'fix', servedBy: 'scripted',
    invariantFailures: [], failure: null, usage: [], records };
}

const BASE = { turn: 1, servedBy: 'scripted', userText: 'end the mooring',
  acts: [], questions: { issued: [], consumed: [], closed: [] },
  usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
    modelCalls: 1 } } as const;

function rowsOf(records: CaseDump['records']): readonly JudgeRow[] {
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  writeDump(runDir, dumpOf(records));
  buildJudgeInputs(runDir, () => 'the reply states what the record holds');
  return readJudgeParts(runDir).join('').split('\n').filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as JudgeRow);
}

test('a redriven turn names its guard, its detail, its finish and its delivery stage', () => {
  const [row] = rowsOf([{ ...BASE,
    corrections: [
      { kind: 'redrive', guardName: 'figureIsGrounded',
        detail: 'your reply states 1350 and no record carries it' },
      { kind: 'forcedFinish' }
    ],
    finish: { message: 'Mooring mo_1 is ended; 986 stays owed.', report: [], facts: ['F1'] },
    text: 'Mooring mo_1 is ended; 986 stays owed.', closedBy: 'model',
    delivery: { by: 'prose', retried: false, facts: [] } }]);

  expect(row.turns[0].corrections[0]).toEqual({ kind: 'redrive',
    guardName: 'figureIsGrounded',
    detail: 'your reply states 1350 and no record carries it' });
  // A correction that names no guard says so — the field is present and empty.
  expect(row.turns[0].corrections[1]).toEqual({ kind: 'forcedFinish',
    guardName: null, detail: null });
  expect(row.turns[0].finish?.message).toBe('Mooring mo_1 is ended; 986 stays owed.');
  expect(row.turns[0].delivery.by).toBe('prose');
});

test('an engine-closed turn carries no finish, and the stage that wrote the text is named', () => {
  const [row] = rowsOf([{ ...BASE,
    corrections: [{ kind: 'closeRefused', attempt: 1, text: 'Approve CONFIRM 7Q4MX.' }],
    finish: null, text: 'Say CONFIRM 7Q4MX to end the mooring.', closedBy: 'engine',
    delivery: { by: 'desk', retried: true, facts: [] } }]);

  expect(row.turns[0].finish).toBeNull();
  expect(row.turns[0].delivery.by).toBe('desk');
  expect(row.turns[0].corrections[0])
    .toEqual({ kind: 'closeRefused', guardName: null, detail: 'Approve CONFIRM 7Q4MX.' });
});

test('the enriched row stays blind: no variant, no target, no split', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  writeDump(runDir, dumpOf([{ ...BASE, corrections: [], finish: null, text: 'Done.',
    closedBy: 'engine', delivery: { by: 'floor', retried: false, facts: [] } }]));
  buildJudgeInputs(runDir, () => 'the reply greets honestly');
  const raw = readJudgeParts(runDir).join('\n');
  expect(raw).not.toContain('governed');
  expect(raw).not.toContain('servedBy');
  expect(raw).not.toContain('scripted');
});
