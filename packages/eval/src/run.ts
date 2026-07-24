/**
 * @looprun-ai/eval — run ONE case against ONE target: build the world from the case preset,
 * drive the governed loop for the routed agent, feed the turns sequentially, capture per-turn
 * tool calls / guard events / final reply, and evaluate the deterministic invariants.
 */
import { runSpecConversation } from '@looprun-ai/mastra';
import type { AgentSpec, DomainContract, TurnRecord } from '@looprun-ai/core';
import { agentForCase, type Subject, type SubjectCase, type CaseInvariants } from './subject.js';
import { stripGovernance } from './ungoverned.js';

export interface DumpToolCall {
  name: string;
  args: unknown;
  ok?: boolean;
  tookEffect?: boolean;
  resultSummary?: string;
}

export interface DumpTurn {
  user: string;
  toolCalls: DumpToolCall[];
  guardEvents: string[];
  reply: string;
}

export interface InvariantVerdict {
  pass: boolean;
  violations: string[];
}

export interface CaseDump {
  caseId: string;
  agent: string;
  arm: 'governed' | 'ungoverned';
  model: string;
  turns: DumpTurn[];
  invariantVerdict: InvariantVerdict;
  rubric: unknown[];
  targets: string[];
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

export interface RunCaseOptions {
  /** An AI-SDK LanguageModel (OpenAI-compatible endpoint or a scripted test model). */
  model: unknown;
  /** Label written into the dump (the model id). */
  modelId: string;
  modelParams?: Record<string, unknown>;
  ungoverned?: boolean;
  /** Local-model runaway brake: abort the turn when the model repeats an identical tool call. */
  stopOnRepeatedToolCall?: boolean;
}

interface WorldCall {
  name: string;
  args: unknown;
  result?: unknown;
  tookEffect?: boolean;
}

/** A call succeeded unless its result explicitly says `ok: false`. Reads have no `ok` — they succeed. */
function callOk(call: WorldCall): boolean {
  const r = call.result as { ok?: unknown } | undefined;
  return !(r && typeof r === 'object' && r.ok === false);
}

/** name + every key/value in `anyArgs` strictly equal in the call's args (shallow subset match). */
export function toolCallMatches(call: WorldCall, req: { name: string; anyArgs?: Record<string, unknown> }): boolean {
  if (call.name !== req.name) return false;
  if (!req.anyArgs) return true;
  const args = (call.args ?? {}) as Record<string, unknown>;
  for (const [k, expected] of Object.entries(req.anyArgs)) {
    if (args[k] !== expected) return false;
  }
  return true;
}

/**
 * Deterministic invariant evaluation over the EXECUTED calls of the whole conversation.
 * Required = a matching call succeeded. Forbidden = a matching call was ATTEMPTED at all —
 * deliberately stricter than took-effect-only: a fabrication attempt the world happens to
 * refuse is still a violation (this is what discriminates the two arms).
 */
export function evaluateInvariants(inv: CaseInvariants | undefined, calls: WorldCall[]): InvariantVerdict {
  const violations: string[] = [];
  const observed = calls.map((c) => c.name).join(', ') || '(none)';
  for (const req of inv?.requiredToolCalls ?? []) {
    const hit = calls.some((c) => toolCallMatches(c, req) && callOk(c));
    if (!hit) {
      const want = req.anyArgs ? `${req.name}(${JSON.stringify(req.anyArgs)})` : req.name;
      violations.push(`required call missing or never succeeded: ${want} — observed [${observed}]`);
    }
  }
  for (const forb of inv?.forbiddenToolCalls ?? []) {
    const n = calls.filter((c) => toolCallMatches(c, forb)).length;
    if (n > 0) {
      const what = forb.anyArgs ? `${forb.name}(${JSON.stringify(forb.anyArgs)})` : forb.name;
      violations.push(`forbidden call executed: ${what} (${n}x)`);
    }
  }
  return { pass: violations.length === 0, violations };
}

/** Map a TurnRecord's calls onto the world ledger slice to recover ok/tookEffect per call. */
function dumpTurn(record: TurnRecord, worldCalls: WorldCall[], cursor: { i: number }): DumpTurn {
  const toolCalls: DumpToolCall[] = record.toolCalls.map((tc) => {
    const w = worldCalls[cursor.i];
    if (w && w.name === tc.name) {
      cursor.i += 1;
      return { name: tc.name, args: tc.args, ok: callOk(w), tookEffect: w.tookEffect, resultSummary: tc.resultSummary };
    }
    // No matching world entry — the call was vetoed before execution (or is runtime-internal).
    return { name: tc.name, args: tc.args, resultSummary: tc.resultSummary };
  });
  return {
    user: record.userText,
    toolCalls,
    guardEvents: [...(record.recoveryEvents ?? [])],
    reply: record.assistantFinalText,
  };
}

export async function runCase(subject: Subject, c: SubjectCase, opts: RunCaseOptions): Promise<CaseDump> {
  const agentId = agentForCase(subject, c.id);
  let spec: AgentSpec = subject.specs[agentId];
  let contract: DomainContract = subject.contract;
  const arm: CaseDump['arm'] = opts.ungoverned ? 'ungoverned' : 'governed';
  if (opts.ungoverned) ({ spec, contract } = stripGovernance(spec, contract));

  const world = subject.makeWorld(c.setup?.preset ?? 'default');
  const res = await runSpecConversation(spec, c.turns, {
    model: opts.model,
    modelParams: opts.modelParams ?? { temperature: 0 },
    world,
    toolDefs: subject.toolDefs,
    contract,
    ...(opts.stopOnRepeatedToolCall ? { stopOnRepeatedToolCall: true } : {}),
  });

  const worldCalls = world.toolCalls as WorldCall[];
  const cursor = { i: 0 };
  const turns = res.turnRecords.map((r) => dumpTurn(r, worldCalls, cursor));
  const invariantVerdict = evaluateInvariants(c.expectations?.invariants, worldCalls);

  let tokensIn = 0;
  let tokensOut = 0;
  for (const r of res.turnRecords) {
    tokensIn += r.tokens?.input ?? 0;
    tokensOut += r.tokens?.output ?? 0;
  }

  return {
    caseId: c.id,
    agent: agentId,
    arm,
    model: opts.modelId,
    turns,
    invariantVerdict,
    rubric: c.expectations?.rubric ?? [],
    targets: c.targets ?? [],
    tokensIn,
    tokensOut,
    ...(res.errorMsg ? { error: res.errorMsg } : {}),
  };
}
