/**
 * @looprun-ai/eval — certification over ONE run dir's artifacts: `cases.jsonl` (the dumps)
 * + `verdicts.jsonl` (the judge's folded verdicts). Emits `cert.json` + `CERT.md`.
 *
 * N=1-honest: a run dir is one rep, and the cert says so explicitly (`reps: 1` + the
 * artifact note). Multi-rep aggregation is a separate, later concern — never faked here.
 * `generatedAt` is a caller-supplied parameter (no wall-clock default).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { foldVerdicts, readJsonl } from './fold.js';
import type { VerdictLine } from './fold.js';
import type { CaseDump } from './run.js';

export interface CertOptions {
  /** Model label. Default: the model recorded in the dumps. */
  model?: string;
  /** Certification bar over the final (invariants AND judge) pass-rate. Default 0.9. */
  bar?: number;
  /** ISO date stamped into the cert — caller-supplied (`--date`); omitted when absent. */
  generatedAt?: string;
  /** Free-form provenance note appended to the default artifact note. */
  artifactNote?: string;
}

export interface CertSummary {
  model: string;
  cases: number;
  passRate: number;
  bar: number;
  certified: boolean;
  /** Always 1 — one run dir is one rep (stated, never aggregated away). */
  reps: 1;
  generatedAt?: string;
  artifactNote: string;
  perCase: Array<{ caseId: string; final: 'pass' | 'FAIL' }>;
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function buildCert(runDir: string, opts: CertOptions = {}): CertSummary {
  const dumps = readJsonl<CaseDump>(readFileSync(join(runDir, 'cases.jsonl'), 'utf8'));
  if (!dumps.length) throw new Error(`cert: ${runDir}/cases.jsonl is empty`);
  const verdicts = readJsonl<VerdictLine>(readFileSync(join(runDir, 'verdicts.jsonl'), 'utf8'));
  const fold = foldVerdicts(dumps, verdicts);
  if (fold.missing) {
    process.stderr.write(`[looprun-eval] WARN ${fold.missing} case(s) had NO verdict (counted FAIL) — re-judge those caseIds\n`);
  }

  const bar = opts.bar ?? 0.9;
  const passRate = fold.total ? fold.passes / fold.total : 0;
  const baseNote =
    'reps=1: this certificate covers a single run of the case set (final pass = invariants AND judge). ' +
    'Multi-rep aggregation is out of scope for this artifact.';
  const summary: CertSummary = {
    model: opts.model ?? dumps[0].model,
    cases: fold.total,
    passRate,
    bar,
    certified: fold.total > 0 && passRate >= bar,
    reps: 1,
    ...(opts.generatedAt ? { generatedAt: opts.generatedAt } : {}),
    artifactNote: opts.artifactNote ? `${baseNote} ${opts.artifactNote}` : baseNote,
    perCase: fold.rows.map((r) => ({ caseId: r.caseId, final: r.final })),
  };

  writeFileSync(join(runDir, 'cert.json'), JSON.stringify(summary, null, 2) + '\n');
  writeFileSync(join(runDir, 'CERT.md'), renderCertMd(summary) + '\n');
  return summary;
}

function renderCertMd(s: CertSummary): string {
  return [
    `# Certification — ${s.model}`,
    '',
    ...(s.generatedAt ? [`- generated: ${s.generatedAt}`] : []),
    `- reps: 1 (single run — stated, not aggregated)`,
    `- bar: ≥${pct(s.bar)} (final pass-rate; final = invariants AND judge)`,
    `- **overall: ${s.perCase.filter((c) => c.final === 'pass').length}/${s.cases} = ${pct(s.passRate)} → ${s.certified ? 'CERTIFIED' : 'BELOW BAR'}**`,
    '',
    '| case | final |',
    '|---|---|',
    ...s.perCase.map((c) => `| ${c.caseId} | ${c.final} |`),
    '',
    `> ${s.artifactNote}`,
  ].join('\n');
}
