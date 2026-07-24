/** fold + cert over the run artifacts (cases.jsonl + verdicts.jsonl) — no LLM, no network. */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foldVerdicts } from '../src/fold.js';
import { certCommand, foldCommand } from '../src/commands.js';
import type { CaseDump } from '../src/run.js';

const dump = (caseId: string, pass: boolean, violations: string[] = []): CaseDump => ({
  caseId,
  agent: 'front-desk',
  arm: 'governed',
  model: 'scripted',
  turns: [],
  invariantVerdict: { pass, violations },
  rubric: [{ id: 'r', description: 'd' }],
  targets: [],
  tokensIn: 1,
  tokensOut: 1,
});

function writeRunDir(): { dir: string; dumps: CaseDump[] } {
  const dir = mkdtempSync(join(tmpdir(), 'looprun-eval-'));
  const dumps = [dump('01-a', true), dump('02-b', false, ['forbidden call executed: reserveRoom (1x)']), dump('03-c', true)];
  writeFileSync(join(dir, 'cases.jsonl'), dumps.map((d) => JSON.stringify(d)).join('\n') + '\n');
  // 02-b gets a judge pass (invariants still fail it); 03-c is UNJUDGED (counted FAIL, loudly)
  writeFileSync(
    join(dir, 'verdicts.jsonl'),
    [
      JSON.stringify({ caseId: '01-a', verdict: 'pass', reasons: [] }),
      JSON.stringify({ caseId: '02-b', overall: 'pass' }), // `overall` accepted as verdict alias
    ].join('\n') + '\n',
  );
  return { dir, dumps };
}

describe('foldVerdicts', () => {
  it('final pass = invariants AND judge; missing verdict = FAIL', () => {
    const { dumps } = writeRunDir();
    const fold = foldVerdicts(dumps, [
      { caseId: '01-a', verdict: 'pass' },
      { caseId: '02-b', overall: 'pass' },
    ]);
    expect(fold).toMatchObject({ passes: 1, total: 3, missing: 1 });
    expect(fold.rows.map((r) => r.final)).toEqual(['pass', 'FAIL', 'FAIL']);
    expect(fold.rows[1].reasons[0]).toContain('forbidden call executed');
    expect(fold.rows[2].judge).toBe('unjudged');
  });
});

describe('fold + cert commands', () => {
  it('fold writes RESULTS.md; cert emits cert.json + CERT.md with the reps=1 statement', () => {
    const { dir } = writeRunDir();

    const resultsPath = foldCommand({ dump: join(dir, 'cases.jsonl'), verdicts: join(dir, 'verdicts.jsonl') });
    const results = readFileSync(resultsPath, 'utf8');
    expect(results).toContain('**1/3**');
    expect(results).toContain('| 03-c | pass | unjudged | FAIL |');

    const summary = certCommand({ dir, date: '2026-01-15', note: 'fixture run.' });
    expect(summary).toMatchObject({
      model: 'scripted',
      cases: 3,
      bar: 0.9,
      certified: false,
      reps: 1,
      generatedAt: '2026-01-15',
    });
    expect(summary.passRate).toBeCloseTo(1 / 3);
    expect(summary.artifactNote).toContain('reps=1');
    expect(summary.artifactNote).toContain('fixture run.');

    const certJson = JSON.parse(readFileSync(join(dir, 'cert.json'), 'utf8'));
    expect(certJson.perCase).toEqual([
      { caseId: '01-a', final: 'pass' },
      { caseId: '02-b', final: 'FAIL' },
      { caseId: '03-c', final: 'FAIL' },
    ]);
    const certMd = readFileSync(join(dir, 'CERT.md'), 'utf8');
    expect(certMd).toContain('BELOW BAR');
    expect(certMd).toContain('reps: 1');
    expect(certMd).toContain('generated: 2026-01-15');
  });

  it('cert has no wall-clock default: generatedAt absent when --date is not passed', () => {
    const { dir } = writeRunDir();
    const summary = certCommand({ dir, bar: 0.3 });
    expect(summary.generatedAt).toBeUndefined();
    expect(summary.certified).toBe(true); // 1/3 ≥ 0.3
    expect(readFileSync(join(dir, 'cert.json'), 'utf8')).not.toContain('generatedAt');
  });
});
