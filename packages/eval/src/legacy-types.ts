/**
 * @deprecated LEGACY project-config types — kept ONLY so existing example bundles that
 * default-export a `looprun.eval.config.ts` keep typechecking. The runner no longer loads
 * this config: subjects are directories (`norms/` + `gen/` + `evals/` + `ask/`) consumed by
 * `looprun-eval run --subject <dir>`. Migrate bundles to the subject layout; these types
 * will be removed with it.
 */
import type { AgentSpec, AgentWorld, ToolDef, DomainContract } from '@looprun-ai/core';
import type { CaseInvariants, RubricItem } from './subject.js';

/** @deprecated See module note — use the subject layout (`SubjectCase`). */
export interface EvalCase {
  id: string;
  title: string;
  setup: { preset: string };
  turns: Array<{ userText: string; attachments?: string[] }>;
  expectations: {
    invariants?: CaseInvariants;
    rubric: RubricItem[];
    goldSeq?: string[];
    goldReply?: string[];
  };
}

/** @deprecated See module note — use the subject layout (`Subject`). */
export interface EvalConfig {
  domain: string;
  specs: Record<string, AgentSpec>;
  contract?: DomainContract;
  worldFactory: (preset: string, seed: number) => AgentWorld;
  toolDefs: ToolDef[];
  cases: EvalCase[];
  caseMap: Record<string, string[]>;
  judgePromptPath?: string;
  model?: unknown;
  bar?: number;
  maxSteps?: number;
  redrives?: number;
  outDir?: string;
}
