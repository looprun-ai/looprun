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

/**
 * Multi-rep certification: K run dirs of the SAME case set → one band. The law is the FLOOR:
 * `certified` means every rep clears the bar (floor ≥ bar), never the mean or the majority —
 * a coin-flip rep below the bar voids the band. Majority is reported per case as evidence.
 */
export interface CertBand {
  model: string;
  cases: number;
  reps: number;
  bar: number;
  /** The rep run dirs, as given — index i everywhere below refers to runDirs[i]. */
  runDirs: string[];
  /** Per-rep final pass-rates, same order as runDirs. */
  rates: number[];
  floor: number;
  /** Index into runDirs of the floor rep (first one at the minimum). */
  floorRep: number;
  ceil: number;
  /** Index into runDirs of the ceil rep (first one at the maximum). */
  ceilRep: number;
  mean: number;
  /** Pass-rate of the per-case majority verdicts (evidence, never the certification basis). */
  majorityRate: number;
  /** floor ≥ bar — the bar is a FLOOR over reps, not a target for the mean. */
  certified: boolean;
  generatedAt?: string;
  artifactNote: string;
  perCase: Array<{ caseId: string; finals: Array<'pass' | 'FAIL'>; majority: 'pass' | 'FAIL' }>;
}

export interface CertBandOptions extends CertOptions {
  /** Where cert-band.json + CERT-BAND.md land. Default: the parent of the first run dir. */
  out?: string;
}

export function buildCertBand(runDirs: string[], opts: CertBandOptions = {}): CertBand {
  if (runDirs.length < 2) throw new Error('cert band: needs at least 2 run dirs (one dir = plain cert)');
  const reps = runDirs.map((dir) => buildCert(dir, opts)); // each rep keeps its own N=1-honest cert
  const caseIds = reps[0].perCase.map((c) => c.caseId);
  for (const [i, rep] of reps.entries()) {
    const ids = rep.perCase.map((c) => c.caseId);
    if (ids.length !== caseIds.length || ids.some((id, j) => id !== caseIds[j])) {
      throw new Error(`cert band: rep ${i} (${runDirs[i]}) covers a different case set — reps must run the SAME cases`);
    }
  }

  const bar = opts.bar ?? 0.9;
  const rates = reps.map((r) => r.passRate);
  const perCase = caseIds.map((caseId, j) => {
    const finals = reps.map((r) => r.perCase[j].final);
    const passes = finals.filter((f) => f === 'pass').length;
    return { caseId, finals, majority: (passes * 2 > finals.length ? 'pass' : 'FAIL') as 'pass' | 'FAIL' };
  });
  const majorityRate = perCase.length ? perCase.filter((c) => c.majority === 'pass').length / perCase.length : 0;
  const baseNote =
    `reps=${reps.length}: certification law is the FLOOR — every rep must clear the bar. ` +
    'Majority verdicts are reported as evidence, never as the certification basis.';
  const band: CertBand = {
    model: opts.model ?? reps[0].model,
    cases: caseIds.length,
    reps: reps.length,
    bar,
    runDirs: [...runDirs],
    rates,
    floor: Math.min(...rates),
    floorRep: rates.indexOf(Math.min(...rates)),
    ceil: Math.max(...rates),
    ceilRep: rates.indexOf(Math.max(...rates)),
    mean: rates.reduce((a, b) => a + b, 0) / rates.length,
    majorityRate,
    certified: caseIds.length > 0 && Math.min(...rates) >= bar,
    ...(opts.generatedAt ? { generatedAt: opts.generatedAt } : {}),
    artifactNote: opts.artifactNote ? `${baseNote} ${opts.artifactNote}` : baseNote,
    perCase,
  };

  const outDir = opts.out ?? join(runDirs[0], '..');
  writeFileSync(join(outDir, 'cert-band.json'), JSON.stringify(band, null, 2) + '\n');
  writeFileSync(join(outDir, 'CERT-BAND.md'), renderCertBandMd(band) + '\n');
  return band;
}

function renderCertBandMd(b: CertBand): string {
  return [
    `# Certification band — ${b.model} · K=${b.reps}`,
    '',
    ...(b.generatedAt ? [`- generated: ${b.generatedAt}`] : []),
    ...b.runDirs.map((d, i) => `- r${i}: \`${d}\` → ${pct(b.rates[i])}${i === b.floorRep ? ' ← floor' : i === b.ceilRep ? ' ← ceil' : ''}`),
    `- band ${pct(b.floor)}–${pct(b.ceil)} · mean ${pct(b.mean)} · majority ${pct(b.majorityRate)}`,
    `- bar: ≥${pct(b.bar)} as a FLOOR over reps`,
    `- **verdict: floor ${pct(b.floor)} ${b.certified ? '≥' : '<'} bar → ${b.certified ? 'CERTIFIED' : 'BELOW BAR'}**`,
    '',
    `| case | ${b.rates.map((_, i) => `r${i}`).join(' | ')} | majority |`,
    `|---|${b.rates.map(() => '---|').join('')}---|`,
    ...b.perCase.map((c) => `| ${c.caseId} | ${c.finals.join(' | ')} | ${c.majority} |`),
    '',
    `> ${b.artifactNote}`,
  ].join('\n');
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
