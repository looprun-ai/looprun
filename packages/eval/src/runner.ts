/**
 * @looprun-ai/eval — the case runner (Stage T/S of the measured loop).
 *
 * For each case in scope: world = worldFactory(preset, rep) → runSpecConversation → dump record
 * + deterministic invariant gate + Claude-judge task. The streamed `→ pass/fail` lines are the
 * INVARIANT GATE ONLY, never the quality verdict — quality comes from the Claude judge.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSpecConversation } from '@looprun-ai/mastra';
import { toolCallFailures } from './invariants.js';
import type { ObsCall } from './invariants.js';
import { caseById } from './config.js';
import { resolveModel } from './model-resolve.js';
import type { AutoFail, DumpRecord, EvalCase, EvalConfig, JudgeTask } from './types.js';

export interface RunOptions {
  /** Restrict to one agent bucket (caseMap key). Default: every agent. */
  agent?: string;
  /** Case ids (csv already split) or 'full'. Default: full. */
  cases?: string[];
  reps?: number;
  /** Model override (registry alias). */
  model?: string;
  /** Output dir override (default `<outDir>/<date>-<domain>[-cert]`). */
  out?: string;
  certTag?: boolean;
  /** ISO date used in the default output dir (injectable for tests). */
  date?: string;
  log?: (line: string) => void;
}

export interface RunSummary {
  outDir: string;
  perAgent: Array<{ agent: string; dump: string; tasks: string; autofail: string; cases: number; invariantFails: number }>;
  totals: { cases: number; invariantFails: number; tokensIn: number; tokensOut: number };
  modelLabel: string;
}

function agentBuckets(config: EvalConfig, opts: RunOptions): Array<{ agent: string; ids: string[] }> {
  const scope = opts.cases && opts.cases[0] !== 'full' ? new Set(opts.cases) : null;
  const agents = opts.agent ? [opts.agent] : Object.keys(config.caseMap);
  const out: Array<{ agent: string; ids: string[] }> = [];
  for (const agent of agents) {
    const all = config.caseMap[agent];
    if (!all) throw new Error(`looprun-eval: agent "${agent}" is not in caseMap.`);
    const ids = scope ? all.filter((id) => scope.has(id)) : all;
    if (ids.length) out.push({ agent, ids });
  }
  return out;
}

export async function runEval(config: EvalConfig, opts: RunOptions = {}): Promise<RunSummary> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const reps = opts.reps ?? 1;
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const outDir = opts.out ?? join(config.outDir ?? 'eval-results', `${date}-${config.domain}${opts.certTag ? '-cert' : ''}`);
  mkdirSync(outDir, { recursive: true });

  const resolved = await resolveModel(opts.model ?? config.model);
  log(`subject model: ${resolved.label}`);
  log('NOTE: streamed pass/fail = the deterministic INVARIANT GATE, not quality — quality is the Claude judge.');
  if (typeof (opts.model ?? config.model ?? 'gemini-3.1-flash-lite-thinkoff') === 'string') {
    log('ruler discipline: unpinned model aliases can drift across days — replicate a control before cross-day comparisons.');
  }

  const byId = caseById(config);
  const buckets = agentBuckets(config, opts);
  if (!buckets.length) throw new Error('looprun-eval: nothing to run (empty case scope).');

  const perAgent: RunSummary['perAgent'] = [];
  let totCases = 0;
  let totInv = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const { agent, ids } of buckets) {
    const spec = config.specs[agent];
    if (!spec) throw new Error(`looprun-eval: no spec for agent "${agent}".`);
    const dump: DumpRecord[] = [];
    const autofail: AutoFail[] = [];
    const tasks: string[] = [];

    for (let rep = 0; rep < reps; rep++) {
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) throw new Error(`looprun-eval: unknown case "${id}".`);
        const record = await runCase(config, spec, c, rep, resolved.model, resolved.modelParams);
        dump.push(record);
        totCases++;
        tokensIn += record.tokensIn ?? 0;
        tokensOut += record.tokensOut ?? 0;
        const invariantGate = record.invariantFailures.length === 0 && !record.errorMsg;
        log(`  ${agent} ${id} r${rep} → ${invariantGate ? 'pass' : 'FAIL'} (invariant gate)`);
        if (!invariantGate) {
          totInv++;
          autofail.push({
            caseId: id,
            rep,
            reason: record.errorMsg ? `error: ${record.errorMsg}` : `invariant: ${record.invariantFailures.join('; ')}`,
          });
          continue;
        }
        const task: JudgeTask = {
          caseId: id,
          rep,
          rubric: c.expectations.rubric.map((ri) => ({ id: ri.id, description: ri.description, critical: ri.critical !== false })),
          actualReply: record.actualReply,
          actualTrace: record.actualTrace,
          actualCalls: record.actualCalls,
          goldSeq: record.goldSeq,
          goldReply: record.goldReply,
        };
        tasks.push(JSON.stringify(task));
      }
    }

    dump.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.rep - b.rep);
    const dumpPath = join(outDir, `${agent}.dump.json`);
    const tasksPath = join(outDir, `${agent}.tasks.jsonl`);
    const autofailPath = join(outDir, `${agent}.autofail.json`);
    writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
    writeFileSync(tasksPath, tasks.join('\n') + (tasks.length ? '\n' : ''));
    writeFileSync(autofailPath, JSON.stringify(autofail, null, 2));
    perAgent.push({ agent, dump: dumpPath, tasks: tasksPath, autofail: autofailPath, cases: dump.length, invariantFails: autofail.length });
  }

  log('');
  log(`tokens: in=${tokensIn} out=${tokensOut} (subject ${resolved.label})`);
  log(`next: judge each *.tasks.jsonl with the generic prompt (looprun-eval judge-prompt)` +
    (config.judgePromptPath ? ` + the domain rules (${config.judgePromptPath})` : '') +
    `, write *.verdicts.jsonl, then: looprun-eval judge-merge <dump> <verdicts>`);

  return { outDir, perAgent, totals: { cases: totCases, invariantFails: totInv, tokensIn, tokensOut }, modelLabel: resolved.label };
}

interface DumpRecordWithTokens extends DumpRecord {
  tokensIn?: number;
  tokensOut?: number;
}

async function runCase(
  config: EvalConfig,
  spec: EvalConfig['specs'][string],
  c: EvalCase,
  rep: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  modelParams: Record<string, unknown>,
): Promise<DumpRecordWithTokens> {
  const world = config.worldFactory(c.setup.preset, rep);
  const res = await runSpecConversation(spec, c.turns, {
    model,
    modelParams,
    world,
    toolDefs: config.toolDefs,
    ...(config.theme ? { theme: config.theme } : {}),
    ...(config.maxSteps != null ? { maxSteps: config.maxSteps } : {}),
    ...(config.redrives != null ? { redrives: config.redrives } : {}),
  });

  // Observed EXECUTED calls (guard-denied calls never reach the world → absent here).
  const observed: ObsCall[] = res.turnRecords.flatMap((t) =>
    (t.toolCalls ?? []).map((tc) => ({
      name: tc.name,
      args: (typeof tc.args === 'string' ? safeParse(tc.args) : (tc.args as Record<string, unknown>)) ?? {},
      tookEffect: tc.tookEffect !== false,
    })),
  );

  const invariantFailures = toolCallFailures(c.expectations.invariants, observed);

  let tokensIn = 0;
  let tokensOut = 0;
  for (const t of res.turnRecords) {
    tokensIn += t.tokens.input ?? 0;
    tokensOut += t.tokens.output ?? 0;
  }

  return {
    caseId: c.id,
    rep,
    goldSeq: c.expectations.goldSeq ?? [],
    goldReply: c.expectations.goldReply ?? [],
    actualReply: res.turnRecords.map((t) => t.assistantFinalText ?? ''),
    actualTrace: observed.map((o) => o.name),
    actualCalls: observed.map((o) => ({ name: o.name, args: o.args })),
    status: 'ran',
    invariantFailures,
    judgeVerdict: null,
    judgeReasoning: [],
    ...(res.errorMsg ? { errorMsg: res.errorMsg } : {}),
    tokensIn,
    tokensOut,
  };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
