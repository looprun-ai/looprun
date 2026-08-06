/**
 * @looprun-ai/eval — the always-armed run-dir monitor (spec §3). Arming a monitor by hand loses every
 * failure that lands before someone remembers to variant it, so it is armed by construction: every run
 * dir is scanned the moment it finishes, and the campaign REFUSES to certify over an unresolved
 * incident.
 *
 * Two engine-side vigils (the local-only FINGERPRINT/SPEED tok/s vigils are deliberately out of
 * scope — they need a local decode this instrument never sees):
 *   - NETWORK — a case whose run `error` carries a transport marker. The token spend already
 *     happened; the point is that the number never silently folds a transport failure into a
 *     quality FAIL.
 *   - HOLES   — a case with no judgeable transcript: a non-network run error, or an empty turn set.
 *     A hole cannot be judged, so certifying over it would be pass-by-absence.
 *
 * An incident is UNRESOLVED until the operator drops a `MONITOR.resolved` marker in the dir (having
 * fixed or knowingly accepted it). `campaign resume` gates the certification step on this.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonl } from './fold.js';
import type { CaseDump } from './run.js';

/** Transport-failure markers — the class a run `error` must match to be scored as NETWORK. */
const NETWORK_RE =
  /(fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network error|getaddrinfo|timed out|timeout|\b429\b|\b5\d\d\b)/i;

/** The marker file whose presence marks a dir's incidents as resolved (operator-dropped). */
export const RESOLVED_MARKER = 'MONITOR.resolved';

export interface MonitorIncident {
  caseId: string;
  detail: string;
}

export interface MonitorReport {
  dir: string;
  network: MonitorIncident[];
  holes: MonitorIncident[];
  /** network + holes — the count the cert gate reads. */
  incidents: number;
}

/** Scan a finished run dir's `cases.jsonl` for network incidents and judgeless holes. Pure read. */
export function scanRunDir(dir: string): MonitorReport {
  let dumps: CaseDump[] = [];
  try {
    dumps = readJsonl<CaseDump>(readFileSync(join(dir, 'cases.jsonl'), 'utf8'));
  } catch {
    /* no cases.jsonl yet — nothing to scan */
  }
  const network: MonitorIncident[] = [];
  const holes: MonitorIncident[] = [];
  for (const d of dumps) {
    if (d.error && NETWORK_RE.test(d.error)) {
      network.push({ caseId: d.caseId, detail: d.error });
    } else if (d.error) {
      holes.push({ caseId: d.caseId, detail: `run error: ${d.error}` });
    } else if (!d.turns.length) {
      holes.push({ caseId: d.caseId, detail: 'no turns recorded (empty transcript)' });
    }
  }
  return { dir, network, holes, incidents: network.length + holes.length };
}

/** Scan a run dir and persist `monitor.json` + `MONITOR.md`. Returns the report. */
export function writeMonitor(dir: string): MonitorReport {
  const report = scanRunDir(dir);
  writeFileSync(join(dir, 'monitor.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(dir, 'MONITOR.md'), renderMonitorMd(report) + '\n');
  return report;
}

/** True when a dir carries incidents AND the operator has not dropped the {@link RESOLVED_MARKER}. */
export function hasUnresolvedIncidents(dir: string): boolean {
  let report: MonitorReport;
  try {
    report = JSON.parse(readFileSync(join(dir, 'monitor.json'), 'utf8')) as MonitorReport;
  } catch {
    return false; // never scanned = no recorded incident to block on
  }
  const count = (report.network?.length ?? 0) + (report.holes?.length ?? 0);
  return count > 0 && !existsSync(join(dir, RESOLVED_MARKER));
}

function renderMonitorMd(r: MonitorReport): string {
  const rows = (list: MonitorIncident[]) => list.map((i) => `| ${i.caseId} | ${i.detail.replace(/\n/g, ' ')} |`);
  return [
    `# Monitor — ${r.dir}`,
    '',
    `Vigils: NETWORK + HOLES (always armed). Incidents: **${r.incidents}**.`,
    r.incidents
      ? `Drop a \`${RESOLVED_MARKER}\` file in this dir once each incident is fixed or knowingly accepted — the campaign refuses to certify until then.`
      : 'Clean — no transport failures, no judgeless holes.',
    '',
    '## NETWORK',
    ...(r.network.length ? ['| case | detail |', '|---|---|', ...rows(r.network)] : ['None.']),
    '',
    '## HOLES',
    ...(r.holes.length ? ['| case | detail |', '|---|---|', ...rows(r.holes)] : ['None.']),
  ].join('\n');
}
