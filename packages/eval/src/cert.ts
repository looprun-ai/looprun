/**
 * @looprun-ai/eval — certification: fold every *.judged.json in a results dir into cert.json + CERT.md.
 * Certified = judged pass-rate ≥ bar (default 0.90) across ALL reps (screen N=1, certify N=3).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DumpRecord } from './types.js';

export interface CertSummary {
  domain: string;
  date: string;
  model: string;
  bar: number;
  reps: number;
  perAgent: Array<{ agent: string; pass: number; total: number; rate: number }>;
  perRep: Array<{ rep: number; pass: number; total: number; rate: number }>;
  overall: { pass: number; total: number; rate: number };
  certified: boolean;
}

export function buildCert(dir: string, opts: { domain: string; model: string; bar?: number; date?: string }): CertSummary {
  const bar = opts.bar ?? 0.9;
  const files = readdirSync(dir).filter((f) => f.endsWith('.judged.json'));
  if (!files.length) throw new Error(`looprun-eval cert: no *.judged.json in ${dir} — run judge-merge first.`);

  const perAgent: CertSummary['perAgent'] = [];
  const byRep = new Map<number, { pass: number; total: number }>();
  let pass = 0;
  let total = 0;
  for (const f of files) {
    const records = JSON.parse(readFileSync(join(dir, f), 'utf8')) as DumpRecord[];
    const agent = basename(f, '.judged.json');
    let aPass = 0;
    for (const r of records) {
      total++;
      const rep = byRep.get(r.rep) ?? { pass: 0, total: 0 };
      rep.total++;
      if (r.status === 'pass') {
        pass++;
        aPass++;
        rep.pass++;
      }
      byRep.set(r.rep, rep);
    }
    perAgent.push({ agent, pass: aPass, total: records.length, rate: records.length ? aPass / records.length : 0 });
  }
  const perRep = [...byRep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rep, v]) => ({ rep, pass: v.pass, total: v.total, rate: v.total ? v.pass / v.total : 0 }));

  const summary: CertSummary = {
    domain: opts.domain,
    date: opts.date ?? new Date().toISOString().slice(0, 10),
    model: opts.model,
    bar,
    reps: perRep.length,
    perAgent,
    perRep,
    overall: { pass, total, rate: total ? pass / total : 0 },
    certified: total > 0 && pass / total >= bar,
  };

  writeFileSync(join(dir, 'cert.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(dir, 'CERT.md'), renderCertMd(summary));
  return summary;
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

function renderCertMd(s: CertSummary): string {
  const lines = [
    `# Certification — ${s.domain}`,
    '',
    `- date: ${s.date}`,
    `- subject model: ${s.model}`,
    `- bar: ≥${pct(s.bar)} (LLM-judged pass-rate; invariant auto-fails count as fails)`,
    `- reps: ${s.reps}`,
    `- **overall: ${s.overall.pass}/${s.overall.total} = ${pct(s.overall.rate)} → ${s.certified ? 'CERTIFIED ✅' : 'BELOW BAR ❌'}**`,
    '',
    '| agent | pass | total | rate |',
    '|---|---|---|---|',
    ...s.perAgent.map((a) => `| ${a.agent} | ${a.pass} | ${a.total} | ${pct(a.rate)} |`),
    '',
    '| rep | pass | total | rate |',
    '|---|---|---|---|',
    ...s.perRep.map((r) => `| r${r.rep} | ${r.pass} | ${r.total} | ${pct(r.rate)} |`),
    '',
  ];
  return lines.join('\n');
}
