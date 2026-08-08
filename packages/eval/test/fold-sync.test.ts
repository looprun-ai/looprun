/**
 * `looprun-eval fold --sync` (spec §4) — byte-identical transcripts across run dirs get ONE verdict,
 * mechanically (no judge). Deciding identical transcripts mechanically is what stops a weak ruler
 * from fabricating an ALARM on a transcript it passes elsewhere; sync dissolves the divergence and
 * writes a provenance line.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { CaseDump } from '../src/run.js';
import { syncVerdicts, readJsonl, type SyncInput, type VerdictLine } from '../src/fold.js';
import { foldCommand } from '../src/commands.js';

function dump(caseId: string, reply: string, resultSummary?: string): CaseDump {
  return {
    caseId,
    agent: 'a',
    variant: 'governed',
    model: 'm',
    turns: [{ user: 'u', toolCalls: [{ name: 'doThing', args: { x: 1 }, ok: true, tookEffect: true, ...(resultSummary !== undefined ? { resultSummary } : {}) }], guardEvents: [], reply }],
    invariantVerdict: { pass: true, violations: [] },
    rubric: [],
    targets: [],
    tokensIn: 0,
    tokensOut: 0,
    tokensCacheRead: null,
  };
}

describe('syncVerdicts — one verdict per byte-identical transcript class', () => {
  it('forces divergent verdicts on an identical transcript to a single verdict + provenance', () => {
    // Two dirs, same case, IDENTICAL transcript, divergent verdicts (pass vs ALARM).
    const inputs: SyncInput[] = [
      { dir: 'r0', dumps: [dump('c1', 'same reply')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r1', dumps: [dump('c1', 'same reply')], verdicts: [{ caseId: 'c1', verdict: 'ALARM' }] },
    ];
    const res = syncVerdicts(inputs);
    const cls = res.classes.find((c) => c.caseId === 'c1')!;
    expect(cls.members).toHaveLength(2);
    expect(cls.diverged).toBe(true);
    // Tie resolves to the strictest (non-pass) — sync never inflates a pass-rate.
    expect(cls.forced).toBe('ALARM');
    // Every member ends on the one forced verdict.
    expect(new Set(res.synced.filter((s) => s.caseId === 'c1').map((s) => s.verdict))).toEqual(new Set(['ALARM']));
    expect(res.provenance).toHaveLength(1);
    expect(res.provenance[0]).toMatch(/"c1".*byte-identical.*forced "ALARM"/);
  });

  it('majority dissolves a minority of fabricated verdicts on identical transcripts', () => {
    const inputs: SyncInput[] = [
      { dir: 'r0', dumps: [dump('c1', 'x')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r1', dumps: [dump('c1', 'x')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r2', dumps: [dump('c1', 'x')], verdicts: [{ caseId: 'c1', verdict: 'ALARM' }] },
    ];
    const res = syncVerdicts(inputs);
    expect(res.classes[0].forced).toBe('pass'); // 2 pass vs 1 alarm → the alarm dissolves
  });

  it('does NOT sync across DIFFERENT transcripts (different bytes = different classes)', () => {
    const inputs: SyncInput[] = [
      { dir: 'r0', dumps: [dump('c1', 'reply A')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r1', dumps: [dump('c1', 'reply B')], verdicts: [{ caseId: 'c1', verdict: 'FAIL' }] },
    ];
    const res = syncVerdicts(inputs);
    // Two classes for the same caseId — divergent bytes are NOT reconciled.
    expect(res.classes.filter((c) => c.caseId === 'c1')).toHaveLength(2);
    expect(res.provenance).toEqual([]);
  });

  it('does NOT sync transcripts differing ONLY in resultSummary (the judge saw them as different)', () => {
    // Same reply + same tool call, but a different tool result the judge reads — must stay distinct,
    // because the sync fingerprint mirrors the exact projection buildJudgeInput emits.
    const inputs: SyncInput[] = [
      { dir: 'r0', dumps: [dump('c1', 'ok', 'charged $10')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r1', dumps: [dump('c1', 'ok', 'charged $99')], verdicts: [{ caseId: 'c1', verdict: 'ALARM' }] },
    ];
    const res = syncVerdicts(inputs);
    expect(res.classes.filter((c) => c.caseId === 'c1')).toHaveLength(2);
    expect(res.provenance).toEqual([]);
  });

  it('agreeing transcripts produce no provenance line', () => {
    const inputs: SyncInput[] = [
      { dir: 'r0', dumps: [dump('c1', 'x')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
      { dir: 'r1', dumps: [dump('c1', 'x')], verdicts: [{ caseId: 'c1', verdict: 'pass' }] },
    ];
    expect(syncVerdicts(inputs).provenance).toEqual([]);
  });
});

describe('foldCommand sync mode — persisted artifacts', () => {
  function runDir(caseId: string, reply: string, verdict: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'looprun-sync-'));
    writeFileSync(join(dir, 'cases.jsonl'), JSON.stringify(dump(caseId, reply)) + '\n');
    writeFileSync(join(dir, 'verdicts.jsonl'), JSON.stringify({ caseId, verdict } as VerdictLine) + '\n');
    return dir;
  }

  it('writes verdicts.synced.jsonl per dir and a SYNC.md provenance report', () => {
    const a = runDir('c1', 'same', 'pass');
    const b = runDir('c1', 'same', 'ALARM');
    const syncMd = join(a, '..', 'SYNC.md');
    const out = foldCommand({ sync: [a, b], out: syncMd });
    expect(out).toBe(syncMd);

    // Both dirs now carry the SAME forced verdict, drop-in for cert.
    const va = readJsonl<VerdictLine>(readFileSync(join(a, 'verdicts.synced.jsonl'), 'utf8'));
    const vb = readJsonl<VerdictLine>(readFileSync(join(b, 'verdicts.synced.jsonl'), 'utf8'));
    expect(va[0].verdict).toBe('ALARM');
    expect(vb[0].verdict).toBe('ALARM');

    const md = readFileSync(syncMd, 'utf8');
    expect(md).toMatch(/diverged \(reconciled\): 1/);
    expect(md).toMatch(/c1/);
  });
});
