/**
 * @looprun-ai/eval — public API (the CLI `looprun-eval` wraps these).
 */
export type {
  EvalCase,
  EvalConfig,
  ModelRef,
  ReqCall,
  RubricItem,
  DumpRecord,
  AutoFail,
  JudgeTask,
  Verdict,
} from './types.js';
export { CASE_ID_RE } from './types.js';
export { findConfigPath, loadConfig, checkConfig, caseById } from './config.js';
export type { LoadedConfig, CheckIssue } from './config.js';
export { toolCallMatches, toolCallFailures } from './invariants.js';
export type { ObsCall } from './invariants.js';
export { runEval } from './runner.js';
export type { RunOptions, RunSummary } from './runner.js';
export { mergeVerdicts, mergeVerdictFiles } from './judge.js';
export type { MergeResult } from './judge.js';
export { buildCert } from './cert.js';
export type { CertSummary } from './cert.js';
export { lintSource, lintPaths, lintSpecLaws, BANNED_TOKENS } from './lint.js';
export type { LintViolation } from './lint.js';
export { initProject } from './init.js';
export { resolveModel } from './model-resolve.js';
export type { ResolvedModel } from './model-resolve.js';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the packaged generic Claude-judge prompt (`looprun-eval judge-prompt`). */
export function judgePromptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'judge-prompt.md');
}
