/** Floor-law certification over K rep run dirs, per model: a case passes a rep
 *  when its governed dump sealed clean (no TurnFailure, no invariant failure) and
 *  the folded verdict says pass. Held-out cases are EXCLUDED from fix-loop
 *  reports and INCLUDED here. An unresolved incident in any rep voids the whole
 *  certification, and a rep whose monitor page raised an alert is voided and
 *  counted in nothing: what a degraded machine measures is itself. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listDumps } from './run-dir.js';
import { fold } from './folder.js';
import { scan } from './monitor.js';

export interface Certification {
  readonly reps: number;
  readonly bar: number;
  readonly scores: readonly number[];
  readonly heldOutIncluded: boolean;
  readonly failingCases: readonly string[];
  readonly pass: boolean;
  readonly voided: readonly string[];
}

/** What the person watching the machine wrote down: every line of the run's own MONITOR.md that
 *  opens with `ALERT:` — the colon is the whole signal. A monitor raising a fault writes
 *  `ALERT: rolling decode 28.4 tok/s …`; a monitor with nothing to report writes prose about
 *  alerts, `ALERTS: none — the host was idle`, and prose about alerts is not an alert. A run dir
 *  carrying no monitor page raises none — the page is written by whoever watched the host, and a
 *  run nobody watched is not a run somebody reported a fault in. */
function alertsIn(runDir: string): readonly string[] {
  const page = join(runDir, 'MONITOR.md');
  if (!existsSync(page)) return [];
  return readFileSync(page, 'utf8').split('\n').map(line => line.trim())
    .filter(line => line.startsWith('ALERT:'));
}

export function certify(runDirs: readonly string[], bar: number): Certification {
  const voided: string[] = [];
  const scores: number[] = [];
  const failing = new Set<string>();
  let heldOutSeen = false;

  for (const runDir of runDirs) {
    const alerts = alertsIn(runDir);
    if (alerts.length > 0) {
      voided.push(`${runDir}: the monitor page raised ${alerts.join(' · ')} — a run taken on a `
        + `degraded host measures the host, so its cases count for nothing here and nothing `
        + `against the subject.`);
      continue;
    }
    const monitor = scan(runDir);
    if (!monitor.clean) {
      voided.push(`${runDir}: unresolved incidents block certification`);
    }
    const folded = fold(runDir);
    const verdictOf = new Map(folded.perCase.map(row =>
      [`${row.case}.${row.variant}`, row.verdict]));
    const governed = listDumps(runDir).filter(d => d.variant === 'governed');
    if (governed.length === 0) {
      voided.push(`${runDir}: no governed dumps`);
      continue;
    }
    let passed = 0;
    for (const dump of governed) {
      if (dump.split === 'held-out') heldOutSeen = true;
      const clean = dump.failure === null && dump.invariantFailures.length === 0
        && verdictOf.get(`${dump.case}.governed`) === 'pass';
      if (clean) passed += 1;
      else failing.add(dump.case);
    }
    scores.push(passed / governed.length);
  }

  return {
    reps: runDirs.length, bar, scores, heldOutIncluded: heldOutSeen,
    failingCases: [...failing].sort(),
    pass: voided.length === 0 && scores.length > 0 && scores.every(s => s >= bar),
    voided
  };
}
