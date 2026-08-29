import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLine, writeDump, type CaseDump } from '../src/run-dir.js';
import { scan, resolve } from '../src/monitor.js';
import { buildJudgeInputs, readJudgeParts, rowKey } from '../src/judge-inputs.js';

function dumpOf(caseId: string, variant: CaseDump['variant']): CaseDump {
  return { case: caseId, variant, split: 'fix', servedBy: 'scripted',
    invariantFailures: [], failure: null, usage: [],
    records: [{ turn: 1, servedBy: 'scripted', userText: 'hi',
      acts: [], questions: { issued: [], consumed: [], closed: [] },
      finish: null, corrections: [], text: 'Hello.', closedBy: 'model',
      delivery: { by: 'floor' as const, retried: false, facts: [] },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
        modelCalls: 1 } }] };
}

test('a never-scanned dir is a finding; an incident blocks until ITS hash resolves', () => {
  const empty = mkdtempSync(join(tmpdir(), 'run-'));
  expect(scan(empty).clean).toBe(false);

  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  mkdirSync(join(runDir, 'dumps'), { recursive: true });
  writeDump(runDir, dumpOf('c1', 'governed'));
  appendLine(runDir, 'failures.jsonl',
    { case: 'c1', variant: 'governed', kind: 'network', detail: 'boom', hash: 'abc123' });
  expect(scan(runDir).clean).toBe(false);
  expect(() => { resolve(runDir, 'zzz', 'note'); }).toThrow('zzz');
  resolve(runDir, 'abc123', 'transient, re-ran clean');
  expect(scan(runDir).clean).toBe(true);
});

test('judge parts are blind and complete; the row key maps back outside the file', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'run-'));
  writeDump(runDir, dumpOf('c1', 'governed'));
  writeDump(runDir, dumpOf('c1', 'ungoverned'));
  const paths = buildJudgeInputs(runDir, () => 'the reply greets honestly');
  expect(paths).toHaveLength(1);
  const raw = readJudgeParts(runDir).join('\n');
  expect(raw).not.toContain('governed');
  expect(raw).not.toContain('servedBy');
  expect(raw).toContain('the reply greets honestly');
  expect(raw).toContain('Hello.');
  const key = rowKey(runDir);
  expect(Object.values(key).map(k => k.variant).sort()).toEqual(['governed', 'ungoverned']);
});
