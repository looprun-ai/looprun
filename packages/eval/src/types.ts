/**
 * @looprun/eval — the eval contract of a looprun project.
 *
 * A project exposes ONE `looprun.eval.config.ts` at its root (also the agentspec skill's
 * project sentinel): the generated agent bundle + the generated eval set + the world factory.
 */
import type { AgentSpec, AgentWorld, ToolDef, TrunkTheme } from '@looprun/core';

export interface ReqCall {
  name: string;
  /** Subset match: every key/value here must equal the observed call's arg. */
  anyArgs?: Record<string, unknown>;
}

export interface RubricItem {
  id: string;
  description: string;
  /** Load-bearing item; defaults to true. `overall` = pass iff all critical items pass. */
  critical?: boolean;
}

export interface EvalCase {
  /** `NN-slug` (validated: /^\d{2}-[a-z0-9-]+$/). */
  id: string;
  title: string;
  setup: { preset: string };
  turns: Array<{ userText: string; attachments?: string[] }>;
  expectations: {
    /** Deterministic auto-fail gate — checked against the OBSERVED executed calls, no LLM. */
    invariants?: { requiredToolCalls?: ReqCall[]; forbiddenToolCalls?: ReqCall[] };
    /** The Claude-judged quality rubric. */
    rubric: RubricItem[];
    goldSeq?: string[];
    goldReply?: string[];
  };
}

/** `model` field forms: a registry alias, or a pre-built AI-SDK model (+ params). */
export type ModelRef =
  | string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { model: any; modelParams?: Record<string, unknown>; label?: string };

export interface EvalConfig {
  /** The business/domain slug (result dirs, cert headers). */
  domain: string;
  /** The generated bundle: agent-id → AgentSpec. */
  specs: Record<string, AgentSpec>;
  /** The domain theme (optional when every spec carries `spec.theme`). */
  theme?: TrunkTheme;
  /** Deterministic world per case run. `seed` = the rep index. */
  worldFactory: (preset: string, seed: number) => AgentWorld;
  /** The tool surface (JSON-schema defs) executed via `world.exec`. */
  toolDefs: ToolDef[];
  /** The generated eval set. */
  cases: EvalCase[];
  /** agent-id → case ids (the "user picks the agent" classifier). Every case exactly once. */
  caseMap: Record<string, string[]>;
  /** Domain judge RULES (business-specific pass/fail rules; the generic prompt owns the format). */
  judgePromptPath?: string;
  /** Subject model. Default: 'gemini-3.1-flash-lite-thinkoff' (the validation ruler). */
  model?: ModelRef;
  /** The certification bar (judged pass-rate). Default 0.90. */
  bar?: number;
  maxSteps?: number;
  redrives?: number;
  /** Results root. Default 'eval-results'. */
  outDir?: string;
}

/** One dump record (byte-compatible with the certified judge pipeline). */
export interface DumpRecord {
  caseId: string;
  rep: number;
  goldSeq: string[];
  goldReply: string[];
  actualReply: string[];
  actualTrace: string[];
  actualCalls: Array<{ name: string; args: Record<string, unknown> }>;
  status: string;
  invariantFailures: string[];
  judgeVerdict: string | null;
  judgeReasoning: unknown[];
  errorMsg?: string;
}

export interface AutoFail {
  caseId: string;
  rep: number;
  reason: string;
}

export interface JudgeTask {
  caseId: string;
  rep: number;
  rubric: Array<{ id: string; description: string; critical: boolean }>;
  actualReply: string[];
  actualTrace: string[];
  actualCalls: Array<{ name: string; args: Record<string, unknown> }>;
  goldSeq: string[];
  goldReply: string[];
}

export interface Verdict {
  caseId: string;
  rep: number;
  verdicts: Array<{ id: string; pass: boolean; reasoning: string }>;
  overall: 'pass' | 'fail';
}

export const CASE_ID_RE = /^\d{2}-[a-z0-9-]+$/;
