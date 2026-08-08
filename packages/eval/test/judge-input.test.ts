/**
 * `looprun-eval judge-input` (spec §3) — the ONLY sanctioned path to the judge. Proves per-turn
 * structure (boundaries preserved), blindness (no variant/rep/model leaks), deterministic order, and
 * `--chunk` file splitting.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CaseDump } from '../src/run.js';
import { buildJudgeInput, writeJudgeInput } from '../src/judge-input.js';
import { readJsonl } from '../src/fold.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'looprun-eval.mjs');

/** A CaseDump carrying variant/model/agent/targets — exactly the labels judge-input must strip. */
function dump(caseId: string, turns: CaseDump['turns']): CaseDump {
  return {
    caseId,
    agent: 'fleet',
    variant: 'governed',
    model: 'gemini-3.1-flash-lite-thinkoff',
    turns,
    invariantVerdict: { pass: true, violations: [] },
    rubric: [{ id: 'r1', description: 'is honest', critical: true }],
    targets: ['agent:onlyWorkshopAssetsAreCompleted'],
    tokensIn: 100,
    tokensOut: 50,
    tokensCacheRead: null,
  };
}

function runDirWith(dumps: CaseDump[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'looprun-ji-'));
  writeFileSync(join(dir, 'cases.jsonl'), dumps.map((d) => JSON.stringify(d)).join('\n') + '\n');
  return dir;
}

describe('judge-input — per-turn, blind, deterministic', () => {
  it('preserves turn boundaries — never flattens replies or trace', () => {
    const [c] = buildJudgeInput([
      dump('72-x', [
        { user: 'u1', toolCalls: [{ name: 'listAssets', args: { q: 'a' }, ok: true }], guardEvents: [], reply: 'first' },
        { user: 'u2', toolCalls: [{ name: 'completeMaintenance', args: { assetId: 'ast_1' }, ok: true, tookEffect: true }], guardEvents: [], reply: 'second' },
      ]),
    ]);
    expect(c.actualReplyByTurn).toEqual(['first', 'second']);
    expect(c.actualTraceByTurn).toHaveLength(2);
    expect(c.actualTraceByTurn[0]).toEqual([{ name: 'listAssets', args: { q: 'a' }, ok: true }]);
    expect(c.actualTraceByTurn[1][0].name).toBe('completeMaintenance');
    expect(c.rubric).toEqual([{ id: 'r1', description: 'is honest', critical: true }]);
  });

  it('is BLIND — no variant/rep/model/agent/targets/token label anywhere in the bytes', () => {
    const bytes = JSON.stringify(
      buildJudgeInput([dump('72-x', [{ user: 'u', toolCalls: [], guardEvents: ['veto:X'], reply: 'hi' }])]),
    );
    for (const leak of ['governed', 'ungoverned', 'gemini', 'fleet', 'onlyWorkshopAssetsAreCompleted', 'tokensIn', '"variant"', '"model"', '"agent"', '"targets"']) {
      expect(bytes).not.toContain(leak);
    }
    // Gold fields are omitted (the current case shape carries none) — never fabricated.
    expect(bytes).not.toContain('goldSeq');
  });

  it('orders cases by id, regardless of the run order', () => {
    const cases = buildJudgeInput([
      dump('99-z', [{ user: 'u', toolCalls: [], guardEvents: [], reply: 'z' }]),
      dump('11-a', [{ user: 'u', toolCalls: [], guardEvents: [], reply: 'a' }]),
      dump('50-m', [{ user: 'u', toolCalls: [], guardEvents: [], reply: 'm' }]),
    ]);
    expect(cases.map((c) => c.caseId)).toEqual(['11-a', '50-m', '99-z']);
  });

  it('writes a single judge-input.jsonl by default', () => {
    const dir = runDirWith([dump('a', [{ user: 'u', toolCalls: [], guardEvents: [], reply: 'r' }])]);
    const paths = writeJudgeInput(dir);
    expect(paths).toEqual([join(dir, 'judge-input.jsonl')]);
    expect(readJsonl(readFileSync(paths[0], 'utf8'))).toHaveLength(1);
  });

  it('--chunk N splits into judge-input.partK.jsonl of at most N cases', () => {
    const dumps = ['a', 'b', 'c', 'd', 'e'].map((id) => dump(id, [{ user: 'u', toolCalls: [], guardEvents: [], reply: id }]));
    const dir = runDirWith(dumps);
    const paths = writeJudgeInput(dir, { chunk: 2 });
    expect(paths).toEqual([join(dir, 'judge-input.part1.jsonl'), join(dir, 'judge-input.part2.jsonl'), join(dir, 'judge-input.part3.jsonl')]);
    expect(readJsonl(readFileSync(paths[0], 'utf8'))).toHaveLength(2);
    expect(readJsonl(readFileSync(paths[2], 'utf8'))).toHaveLength(1); // remainder
  });

  it('CLI: judge-input <dir> --chunk writes part files and prints their paths', () => {
    const dir = runDirWith(['a', 'b', 'c'].map((id) => dump(id, [{ user: 'u', toolCalls: [], guardEvents: [], reply: id }])));
    const out = execFileSync(process.execPath, [BIN, 'judge-input', dir, '--chunk', '2'], { encoding: 'utf8' });
    expect(out).toMatch(/judge-input\.part1\.jsonl/);
    expect(out).toMatch(/judge-input\.part2\.jsonl/);
  });
});
