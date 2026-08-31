/** Blind, chunked judge inputs for the agent in the session — no file anywhere
 *  calls a third-party model. No variant, model or rep label appears; the
 *  evidence is COMPLETE: user text, reply, acts, rule events, vetoed calls.
 *  The agent reads judge-input.part*.jsonl and writes verdicts.jsonl itself.
 *
 *  A ROW NAMES ITS STAGES. Every correction carries the guard that fired and the
 *  sentence it sent back; the turn carries the finish the desk wrote and the
 *  delivery mark that says which stage authored the words the operator read
 *  (`prose` = the desk's own finish · `desk` = the close-step · `floor` = the
 *  deterministic writer). An author diagnosing a failed row never opens a dump. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Correction, TurnRecord } from '@looprun-ai/core';
import { listDumps, writeLines } from './run-dir.js';
import { writeCounters } from './counters.js';

const CHUNK = 10;

/** One correction as a row carries it: the kind, the guard whose rule fired, and the
 *  sentence the desk was sent back with. A correction that names neither says null —
 *  the field is present and empty, never absent. */
interface JudgeCorrection { readonly kind: string; readonly guardName: string | null;
                            readonly detail: string | null }

interface JudgeTurn { readonly turn: number; readonly user: string; readonly reply: string;
  readonly acts: readonly { readonly call: string; readonly args: unknown;
    readonly status: string; readonly sentence: string; readonly result: unknown }[];
  readonly questions: readonly string[];
  readonly corrections: readonly JudgeCorrection[];
  /** The message the desk itself wrote, or null when the engine closed the turn. */
  readonly finish: { readonly message: string } | null;
  readonly delivery: { readonly by: TurnRecord['delivery']['by'] } }

function readCorrection(c: Correction): JudgeCorrection {
  return { kind: c.kind,
    guardName: 'guardName' in c ? c.guardName : null,
    detail: 'detail' in c ? c.detail : 'text' in c ? c.text : null };
}

/** One judge row per (case, blind key). The blind key hides the variant behind a
 *  per-run shuffle-free alias derived from file order — the judge never learns
 *  which side it is grading. */
export function buildJudgeInputs(runDir: string, rubricOf: (caseId: string) => string):
  readonly string[] {
  const dumps = listDumps(runDir);
  const rows = dumps.map((dump, i) => ({
    row: `r${String(i + 1).padStart(3, '0')}`,
    case: dump.case,
    rubric: rubricOf(dump.case),
    turns: dump.records.map((r): JudgeTurn => ({
      turn: r.turn, user: r.userText, reply: r.text,
      acts: r.acts.map(a => ({ call: a.call.tool, args: a.call.args,
        status: a.status, sentence: a.sentence, result: a.result })),
      questions: r.questions.issued.map(q => q.sentence),
      corrections: r.corrections.map(readCorrection),
      finish: r.finish === null ? null : { message: r.finish.message },
      delivery: { by: r.delivery.by }
    })),
    failed: dump.failure !== null
  }));
  const paths: string[] = [];
  for (let at = 0; at < rows.length; at += CHUNK) {
    const file = `judge-input.part${String(Math.floor(at / CHUNK) + 1)}.jsonl`;
    writeLines(runDir, file, rows.slice(at, at + CHUNK));
    paths.push(join(runDir, file));
  }
  writeCounters(runDir, dumps);
  return paths;
}

/** The row → (case, variant) key the fold uses; the judge file itself never
 *  carries it. */
export function rowKey(runDir: string): Readonly<Record<string, { case: string; variant: string }>> {
  const dumps = listDumps(runDir);
  return Object.fromEntries(dumps.map((dump, i) =>
    [`r${String(i + 1).padStart(3, '0')}`, { case: dump.case, variant: dump.variant }]));
}

export function readJudgeParts(runDir: string): readonly string[] {
  return readdirSync(runDir).filter(f => f.startsWith('judge-input.part'))
    .map(f => readFileSync(join(runDir, f), 'utf8'));
}
