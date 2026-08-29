import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLine, writeDump, writeLines, type CaseDump } from '../src/run-dir.js';
import { fold, sync } from '../src/folder.js';
import { certify } from '../src/certifier.js';
import { seal, verify } from '../src/seal.js';

function dumpOf(caseId: string, variant: CaseDump['variant'],
                over: Partial<CaseDump> = {}): CaseDump {
  return { case: caseId, variant, split: 'fix', servedBy: 'scripted',
    invariantFailures: [], failure: null, usage: [],
    records: [{ turn: 1, servedBy: 'scripted', userText: 'u',
      acts: [], questions: { issued: [], consumed: [], closed: [] },
      finish: null, corrections: [], text: 't', closedBy: 'model',
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0,
        modelCalls: 1 } }],
    ...over };
}

function repDir(rows: { id: string; verdict?: string; failed?: boolean }[]): string {
  const runDir = mkdtempSync(join(tmpdir(), 'rep-'));
  mkdirSync(join(runDir, 'dumps'), { recursive: true });
  const verdicts: { row: string; verdict: string }[] = [];
  rows.forEach((r, i) => {
    writeDump(runDir, dumpOf(r.id, 'governed',
      r.failed === true ? { failure: { kind: 'network', detail: 'x' } } : {}));
    if (r.failed === true) {
      appendLine(runDir, 'failures.jsonl',
        { case: r.id, variant: 'governed', kind: 'network', detail: 'x', hash: `h${String(i)}` });
    }
    if (r.verdict !== undefined) {
      verdicts.push({ row: `r${String(i + 1).padStart(3, '0')}`, verdict: r.verdict });
    }
  });
  writeLines(runDir, 'verdicts.jsonl', verdicts);
  return runDir;
}

test('fold: missing verdict = loud FAIL; conflicting duplicate = divergence', () => {
  const runDir = repDir([{ id: 'c1', verdict: 'pass' }, { id: 'c2' }]);
  appendLine(runDir, 'verdicts.jsonl', { row: 'r001', verdict: 'fail' });
  const report = fold(runDir);
  expect(report.missing).toEqual(['c2.governed']);
  expect(report.divergent).toEqual(['c1.governed']);
  expect(report.perCase.every(r => r.verdict === 'fail')).toBe(true);
});

test('sync flags unknown rows and off-vocabulary verdicts', () => {
  const runDir = repDir([{ id: 'c1', verdict: 'pass' }]);
  appendLine(runDir, 'verdicts.jsonl', { row: 'r999', verdict: 'maybe' });
  const mismatches = sync(runDir).mismatches.join(' ');
  expect(mismatches).toContain('r999');
  expect(mismatches).toContain('off-vocabulary');
});

test('certify: the floor holds over every rep; an incident voids; failing cases named', () => {
  const good = repDir([{ id: 'c1', verdict: 'pass' }, { id: 'c2', verdict: 'pass' }]);
  const soso = repDir([{ id: 'c1', verdict: 'pass' }, { id: 'c2', verdict: 'fail' }]);
  const certified = certify([good, good], 0.9);
  expect(certified.pass).toBe(true);
  const failed = certify([good, soso], 0.9);
  expect(failed.pass).toBe(false);
  expect(failed.failingCases).toEqual(['c2']);

  const incident = repDir([{ id: 'c1', verdict: 'pass', failed: true }]);
  expect(certify([incident], 0.9).voided.length).toBeGreaterThan(0);
});

test('certify: a monitor alert voids its run and takes it out of the evidence', () => {
  const good = repDir([{ id: 'c1', verdict: 'pass' }]);
  const degraded = repDir([{ id: 'c1', verdict: 'fail' }]);
  writeFileSync(join(degraded, 'MONITOR.md'),
    '# what was watched\nALERT: cpu contended\n');
  const certified = certify([good, degraded], 0.9);
  expect(certified.scores).toEqual([1]);
  expect(certified.voided).toHaveLength(1);
  expect(certified.voided[0]).toContain('ALERT: cpu contended');
  expect(certified.failingCases).toEqual([]);
  expect(certified.pass).toBe(false);
});

test('certify: a quiet monitor, and no monitor at all, leave the run in the evidence', () => {
  const quiet = repDir([{ id: 'c1', verdict: 'pass' }]);
  writeFileSync(join(quiet, 'MONITOR.md'),
    '# what was watched\nEvery rep ran on an idle host.\n');
  expect(certify([quiet], 0.9).voided).toEqual([]);
  expect(certify([quiet], 0.9).pass).toBe(true);

  const unwatched = repDir([{ id: 'c1', verdict: 'pass' }]);
  expect(certify([unwatched], 0.9).voided).toEqual([]);
  expect(certify([unwatched], 0.9).pass).toBe(true);
});

test('seal walks the whole dir; one changed byte voids verify', () => {
  const dir = mkdtempSync(join(tmpdir(), 'subject-'));
  mkdirSync(join(dir, 'ask'));
  writeFileSync(join(dir, 'subject.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'ask', 'targets.json'), '{}');
  const record = seal(dir);
  expect(record.files.map(f => f.path)).toEqual(['ask/targets.json', 'subject.ts']);
  expect(verify(dir, record)).toEqual([]);
  writeFileSync(join(dir, 'subject.ts'), 'export const x = 2;\n');
  expect(verify(dir, record)).toEqual(['subject.ts']);
});
