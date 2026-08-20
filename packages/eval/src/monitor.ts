/** Classifies incidents from the TYPED TurnFailure rows the runner recorded —
 *  never a regex over an error message. An unresolved incident blocks
 *  certification; a resolution marker binds to its incident's hash, so a stale
 *  marker can never clear a fresh incident. A never-scanned run dir is itself
 *  a finding — absence is not a pass. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appendLine, readLines } from './run-dir.js';

export interface IncidentRow { readonly case: string; readonly variant: string;
                               readonly kind: string; readonly detail: string;
                               readonly hash: string }
interface ResolutionRow { readonly hash: string; readonly note: string }

export interface MonitorReport {
  readonly incidents: readonly { readonly hash: string; readonly kind: string;
    readonly case: string; readonly resolved: boolean }[];
  readonly clean: boolean;
}

export function scan(runDir: string): MonitorReport {
  if (!existsSync(join(runDir, 'dumps'))) {
    return { incidents: [{ hash: 'no-dumps', kind: 'construction',
      case: 'the run dir holds no dumps — nothing was scanned', resolved: false }], clean: false };
  }
  const failures = readLines<IncidentRow>(runDir, 'failures.jsonl');
  const resolved = new Set(readLines<ResolutionRow>(runDir, 'resolutions.jsonl').map(r => r.hash));
  const incidents = failures.map(f => ({ hash: f.hash, kind: f.kind, case: f.case,
    resolved: resolved.has(f.hash) }));
  return { incidents, clean: incidents.every(i => i.resolved) };
}

export function resolve(runDir: string, hash: string, note: string): void {
  const known = readLines<IncidentRow>(runDir, 'failures.jsonl').some(f => f.hash === hash);
  if (!known) throw new Error(`no incident carries hash '${hash}' in this run dir`);
  appendLine(runDir, 'resolutions.jsonl', { hash, note });
}
