/** The held-out split is the half of the exam the fix loop never reads. A repair a held-out case
 *  drove is a subject fitted to the answer key, and the score the run earns afterwards measures
 *  the fitting — so certification refuses it rather than reporting it. */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { certify } from '../src/certifier.js';
import { appendLine, writeDump, writeLines, type CaseDump } from '../src/run-dir.js';

function dumpOf(caseId: string, split: CaseDump['split']): CaseDump {
  return { case: caseId, variant: 'governed', split, servedBy: 'scripted',
    invariantFailures: [], failure: null, usage: [],
    records: [{ turn: 1, servedBy: 'scripted', userText: 'u',
      acts: [], questions: { issued: [], consumed: [], closed: [] },
      finish: null, corrections: [], text: 't', closedBy: 'model',
      delivery: { by: 'floor' as const, retried: false, facts: [] },
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
        modelCalls: 1 } }] };
}

function runDirOf(repairs: readonly { case: string; detail: string }[]): string {
  const runDir = mkdtempSync(join(tmpdir(), 'held-out-'));
  mkdirSync(join(runDir, 'dumps'), { recursive: true });
  writeDump(runDir, dumpOf('c1', 'fix'));
  writeDump(runDir, dumpOf('c2', 'held-out'));
  writeLines(runDir, 'verdicts.jsonl',
    [{ row: 'r001', verdict: 'pass' }, { row: 'r002', verdict: 'pass' }]);
  for (const repair of repairs) appendLine(runDir, 'repairs.jsonl', repair);
  return runDir;
}

test('a repair driven by a fix-split case leaves the certification standing', () => {
  const certified = certify([runDirOf([{ case: 'c1', detail: 'the cap sentence' }])], 0.9);
  expect(certified.voided).toEqual([]);
  expect(certified.pass).toBe(true);
});

test('a repair driven by a held-out case voids the certification, naming the case', () => {
  const certified = certify([runDirOf([{ case: 'c2', detail: 'the cap sentence' }])], 0.9);
  expect(certified.pass).toBe(false);
  expect(certified.voided.join('\n')).toContain('c2');
});

test('a run that records no repair at all certifies as it always did', () => {
  expect(certify([runDirOf([])], 0.9).pass).toBe(true);
});
