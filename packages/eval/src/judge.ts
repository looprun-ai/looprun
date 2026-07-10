/**
 * @looprun-ai/eval — Claude-verdict merge (the certified math, ported verbatim):
 * autofail wins → missing verdict = fail, LOUDLY → status/judgeVerdict/judgeReasoning folded in.
 * The judge itself is the Claude Code agent (ruler discipline: Claude only, never the subject
 * model's family) — this module only folds its verdict lines back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { AutoFail, DumpRecord, Verdict } from './types.js';

export interface MergeResult {
  judged: number;
  autofail: number;
  missing: number;
  pass: number;
  total: number;
  records: DumpRecord[];
}

export function mergeVerdicts(dump: DumpRecord[], verdicts: Verdict[], autofails: AutoFail[]): MergeResult {
  const key = (id: string, rep: number | undefined) => `${id}#${rep ?? 0}`;
  const autofail = new Set(autofails.map((a) => key(a.caseId, a.rep)));
  const byKey = new Map(verdicts.map((v) => [key(v.caseId, v.rep), v]));

  let pass = 0;
  let judged = 0;
  let missing = 0;
  for (const r of dump) {
    const k = key(r.caseId, r.rep);
    if (autofail.has(k)) {
      r.status = 'fail';
      r.judgeVerdict = 'fail';
      continue;
    }
    const v = byKey.get(k);
    if (!v) {
      r.status = 'fail';
      r.judgeVerdict = null;
      missing++;
      continue; // unjudged → fail, loudly
    }
    r.status = v.overall === 'pass' ? 'pass' : 'fail';
    r.judgeVerdict = v.overall;
    r.judgeReasoning = v.verdicts;
    judged++;
    if (r.status === 'pass') pass++;
  }
  return { judged, autofail: autofail.size, missing, pass, total: dump.length, records: dump };
}

/** File-level wrapper: <agent>.dump.json + <agent>.verdicts.jsonl (+ .autofail.json) → .judged.json */
export function mergeVerdictFiles(dumpPath: string, verdictsPath: string, autofailPath?: string, outPath?: string): MergeResult {
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as DumpRecord[];
  const verdicts = readFileSync(verdictsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Verdict);
  const afPath = autofailPath ?? dumpPath.replace(/\.dump\.json$/, '.autofail.json');
  let autofails: AutoFail[] = [];
  try {
    autofails = JSON.parse(readFileSync(afPath, 'utf8')) as AutoFail[];
  } catch {
    /* no autofail file → none */
  }
  const result = mergeVerdicts(dump, verdicts, autofails);
  const out = outPath ?? dumpPath.replace(/\.dump\.json$/, '.judged.json');
  writeFileSync(out, JSON.stringify(result.records, null, 2));
  console.log(
    `merge: judged=${result.judged} autofail=${result.autofail} missingVerdict=${result.missing} → pass=${result.pass}/${result.total} → ${out}`,
  );
  if (result.missing) console.log(`WARN ${result.missing} records had NO verdict (counted fail) — re-judge those caseIds`);
  return result;
}
