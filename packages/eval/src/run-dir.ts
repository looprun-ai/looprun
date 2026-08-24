/** The run dir is the ONLY state between verbs: each verb reads files, does one
 *  thing, writes files, exits. Dumps are one JSON per (case, variant); line files
 *  are JSONL. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
         writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TurnRecord } from '@looprun-ai/core';

export interface CaseDump {
  readonly case: string;
  readonly variant: 'governed' | 'ungoverned';
  readonly split: 'fix' | 'held-out';
  readonly records: readonly TurnRecord[];
  readonly servedBy: string;
  readonly invariantFailures: readonly string[];
  readonly failure: { readonly kind: string; readonly detail: string } | null;
  /** What each turn cost: the sealed record's token and call totals, plus the wall
   *  clock the runner measured around the turn. */
  readonly usage: readonly { readonly turn: number; readonly inputTokens: number;
    readonly outputTokens: number; readonly cachedInputTokens: number;
    readonly reasoningTokens: number;
    readonly wallClockMs: number; readonly modelCalls: number }[];
}

export function writeDump(runDir: string, dump: CaseDump): void {
  mkdirSync(join(runDir, 'dumps'), { recursive: true });
  writeFileSync(join(runDir, 'dumps', `${dump.case}.${dump.variant}.json`),
    JSON.stringify(dump, null, 1));
}

export function readDump(runDir: string, caseId: string,
                         variant: CaseDump['variant']): CaseDump {
  return JSON.parse(readFileSync(join(runDir, 'dumps', `${caseId}.${variant}.json`),
    'utf8')) as CaseDump;
}

export function listDumps(runDir: string): readonly CaseDump[] {
  const dir = join(runDir, 'dumps');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as CaseDump);
}

export function appendLine(runDir: string, file: string, row: unknown): void {
  mkdirSync(runDir, { recursive: true });
  appendFileSync(join(runDir, file), `${JSON.stringify(row)}\n`);
}

export function readLines<T>(runDir: string, file: string): readonly T[] {
  const path = join(runDir, file);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as T);
}

export function writeLines(runDir: string, file: string, rows: readonly unknown[]): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, file), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
