/**
 * @looprun-ai/eval — build the judge's input file from a run dir. THE ONLY SANCTIONED PATH TO THE
 * JUDGE (spec §3): the dispatcher passes paths, never interpretive rules, and the sealed
 * `judge-prompt.md` remains the ruler.
 *
 * Judge input built ad hoc fails three ways: a flattened trace leaves the ruler guessing turn
 * boundaries, a monolithic file blows the context window, and per-dispatch interpretive rules
 * contaminate later rounds. This verb kills all three:
 *   - per-case JSONL with the turn boundaries PRESERVED (`actualReplyByTurn`, `actualTraceByTurn`),
 *     never flattened;
 *   - BLIND — no arm label, no rep/model label, no agent/targets, nothing that hints at which arm
 *     produced the transcript, so two judges of the same run see identical bytes;
 *   - deterministic case order (by id), so the bytes are reproducible;
 *   - `--chunk N` splits into `judge-input.partK.jsonl` files sized for incremental verdict writing.
 *
 * GOLD FIELDS: the spec §3 names `goldSeq` / `goldReply`, but the current subject case shape
 * ({@link SubjectCase} / `evals/cases.json`) carries no gold sequence or gold reply — the exam is
 * rubric-driven, not gold-diffed. We emit `goldSeq` / `goldReply` ONLY when a dump actually carries
 * them (future-proof, never fabricated); today that is never, and the judge works rubric-only. When a
 * gold-carrying case shape lands, the emit here starts populating them with no format change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonl } from './fold.js';
import type { CaseDump, DumpToolCall } from './run.js';

/** One tool call in a preserved-per-turn trace. Blind by construction — no arm/model/agent. */
export interface JudgeTraceCall {
  name: string;
  args: unknown;
  ok?: boolean;
  tookEffect?: boolean;
  resultSummary?: string;
}

/** One case as the judge sees it — rubric + per-turn replies and traces, nothing that names the arm. */
export interface JudgeInputCase {
  caseId: string;
  rubric: unknown[];
  /** The model's final reply for each turn, in turn order (boundaries preserved). */
  actualReplyByTurn: string[];
  /** The tool calls of each turn, in turn order — an array per turn (never flattened). */
  actualTraceByTurn: JudgeTraceCall[][];
  /** Emitted ONLY when the dump carries it — the current case shape does not (see module note). */
  goldSeq?: string[];
  goldReply?: string;
}

/** A dump MAY carry gold (a future case shape); today none does. Read defensively, never fabricate. */
type MaybeGold = CaseDump & { goldSeq?: string[]; goldReply?: string };

function traceCall(c: DumpToolCall): JudgeTraceCall {
  return {
    name: c.name,
    args: c.args,
    ...(c.ok !== undefined ? { ok: c.ok } : {}),
    ...(c.tookEffect !== undefined ? { tookEffect: c.tookEffect } : {}),
    ...(c.resultSummary !== undefined ? { resultSummary: c.resultSummary } : {}),
  };
}

function toJudgeCase(d: CaseDump): JudgeInputCase {
  const g = d as MaybeGold;
  return {
    caseId: d.caseId,
    rubric: d.rubric,
    actualReplyByTurn: d.turns.map((t) => t.reply),
    actualTraceByTurn: d.turns.map((t) => t.toolCalls.map(traceCall)),
    ...(g.goldSeq ? { goldSeq: g.goldSeq } : {}),
    ...(g.goldReply !== undefined ? { goldReply: g.goldReply } : {}),
  };
}

/** Project run dumps into blind, deterministically-ordered judge cases (sorted by caseId). */
export function buildJudgeInput(dumps: CaseDump[]): JudgeInputCase[] {
  return [...dumps]
    .sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0))
    .map(toJudgeCase);
}

export interface WriteJudgeInputOptions {
  /** Split into `judge-input.partK.jsonl` files of at most N cases each. Absent = one file. */
  chunk?: number;
}

/**
 * Read a run dir's `cases.jsonl`, build the blind judge input, and write it back into the dir.
 * Returns the paths written. No `--chunk` → a single `judge-input.jsonl`; `--chunk N` → one or more
 * `judge-input.partK.jsonl` (K is 1-based), each JSONL line one case.
 */
export function writeJudgeInput(runDir: string, opts: WriteJudgeInputOptions = {}): string[] {
  const dumps = readJsonl<CaseDump>(readFileSync(join(runDir, 'cases.jsonl'), 'utf8'));
  const lines = buildJudgeInput(dumps).map((c) => JSON.stringify(c));

  if (!opts.chunk || opts.chunk < 1) {
    const path = join(runDir, 'judge-input.jsonl');
    writeFileSync(path, lines.join('\n') + '\n');
    return [path];
  }

  const paths: string[] = [];
  for (let i = 0, part = 1; i < lines.length; i += opts.chunk, part += 1) {
    const path = join(runDir, `judge-input.part${part}.jsonl`);
    writeFileSync(path, lines.slice(i, i + opts.chunk).join('\n') + '\n');
    paths.push(path);
  }
  return paths;
}
