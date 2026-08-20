/** Folds the in-session judge's verdicts under ONE closed vocabulary —
 *  pass | fail | unreadable, one field, no alias. A missing verdict is a loud
 *  FAIL; a conflicting duplicate is a loud divergence; the join runs on the
 *  blind row key, never on prose. */
import { listDumps, readLines } from './run-dir.js';
import { rowKey } from './judge-inputs.js';

export type Verdict = 'pass' | 'fail' | 'unreadable';
interface VerdictRow { readonly row: string; readonly verdict: Verdict; readonly note?: string }

export interface FoldReport {
  readonly perCase: readonly { readonly case: string; readonly variant: string;
    readonly verdict: Verdict }[];
  readonly missing: readonly string[];
  readonly divergent: readonly string[];
}

export interface SyncReport { readonly mismatches: readonly string[] }

export function fold(runDir: string): FoldReport {
  const key = rowKey(runDir);
  const rows = readLines<VerdictRow>(runDir, 'verdicts.jsonl');
  const byRow = new Map<string, Verdict[]>();
  for (const r of rows) {
    byRow.set(r.row, [...byRow.get(r.row) ?? [], r.verdict]);
  }
  const perCase: { case: string; variant: string; verdict: Verdict }[] = [];
  const missing: string[] = [];
  const divergent: string[] = [];
  for (const [row, target] of Object.entries(key)) {
    const verdicts = byRow.get(row) ?? [];
    if (verdicts.length === 0) {
      missing.push(`${target.case}.${target.variant}`);
      perCase.push({ ...target, verdict: 'fail' });
      continue;
    }
    if (new Set(verdicts).size > 1) {
      divergent.push(`${target.case}.${target.variant}`);
      perCase.push({ ...target, verdict: 'fail' });
      continue;
    }
    perCase.push({ ...target, verdict: verdicts[0] });
  }
  return { perCase, missing, divergent };
}

export function sync(runDir: string): SyncReport {
  const key = rowKey(runDir);
  const rows = readLines<VerdictRow>(runDir, 'verdicts.jsonl');
  const mismatches: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (key[r.row] === undefined) mismatches.push(`verdict names unknown row '${r.row}'`);
    if (seen.has(r.row)) mismatches.push(`row '${r.row}' carries more than one verdict`);
    seen.add(r.row);
    if (!['pass', 'fail', 'unreadable'].includes(r.verdict)) {
      mismatches.push(`row '${r.row}' carries an off-vocabulary verdict '${String(r.verdict)}'`);
    }
  }
  void listDumps(runDir);
  return { mismatches };
}
