/**
 * @looprun-ai/eval — fold judge verdicts into per-case final rows.
 * Final pass = invariants AND judge. A missing verdict is a FAIL, loudly — never a silent skip.
 */
import type { CaseDump } from './run.js';

export interface VerdictLine {
  caseId: string;
  verdict?: string;
  /** Accepted as a verdict alias. */
  overall?: string;
  reasons?: string[];
}

export interface FoldRow {
  caseId: string;
  invariants: boolean;
  judge: string;
  final: 'pass' | 'FAIL';
  reasons: string[];
}

export interface FoldResult {
  rows: FoldRow[];
  passes: number;
  total: number;
  /** Cases with NO verdict line (counted FAIL). */
  missing: number;
}

export function foldVerdicts(dumps: CaseDump[], verdictLines: VerdictLine[]): FoldResult {
  const verdicts = new Map(
    verdictLines.map((v) => [v.caseId, { verdict: v.verdict ?? v.overall ?? 'unjudged', reasons: v.reasons }]),
  );
  let passes = 0;
  let missing = 0;
  const rows: FoldRow[] = dumps.map((d) => {
    const v = verdicts.get(d.caseId);
    if (!v) missing++;
    const judge = v ? v.verdict : 'unjudged';
    const final: FoldRow['final'] = d.invariantVerdict.pass && judge === 'pass' ? 'pass' : 'FAIL';
    if (final === 'pass') passes++;
    return {
      caseId: d.caseId,
      invariants: d.invariantVerdict.pass,
      judge,
      final,
      reasons: [...d.invariantVerdict.violations, ...(v?.reasons ?? [])],
    };
  });
  return { rows, passes, total: dumps.length, missing };
}

export function renderResultsMd(dumps: CaseDump[], fold: FoldResult): string {
  return [
    `# Results — ${dumps[0]?.model ?? '?'} · ${dumps[0]?.arm ?? '?'}`,
    '',
    `Final pass = invariants AND judge. **${fold.passes}/${fold.total}**`,
    '',
    '| case | invariants | judge | final | reasons |',
    '|---|---|---|---|---|',
    ...fold.rows.map((r) => `| ${r.caseId} | ${r.invariants ? 'pass' : 'FAIL'} | ${r.judge} | ${r.final} | ${r.reasons.join('; ') || '—'} |`),
  ].join('\n');
}

export function readJsonl<T>(text: string): T[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}
