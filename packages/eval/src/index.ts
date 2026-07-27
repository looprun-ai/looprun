/**
 * @looprun-ai/eval — public API (the CLI `looprun-eval` wraps these).
 */
export {
  loadSubject,
  validateSubject,
  agentForCase,
  checkTrunkStatic,
  readDeclaredTarget,
} from './subject.js';
export type {
  Subject,
  SubjectCase,
  CaseTurn,
  CaseInvariants,
  ReqCall,
  RubricItem,
  DeclaredTarget,
} from './subject.js';
export { runCase, toolCallMatches, evaluateInvariants } from './run.js';
export type { CaseDump, DumpTurn, DumpToolCall, InvariantVerdict, RunCaseOptions } from './run.js';
export { stripGovernance } from './ungoverned.js';
export type { UngovernedBundle } from './ungoverned.js';
export { selectModel } from './provider.js';
export type { SelectedModel, TargetSelection } from './provider.js';
export { foldVerdicts, renderResultsMd, readJsonl } from './fold.js';
export type { FoldResult, FoldRow, VerdictLine } from './fold.js';
export { buildCert } from './cert.js';
export type { CertOptions, CertSummary } from './cert.js';
export { runCommand, foldCommand, certCommand } from './commands.js';
export type { RunCommandOptions, FoldCommandOptions, CertCommandOptions } from './commands.js';
export type { EvalCase, EvalConfig } from './legacy-types.js';
export { lintSource, lintPaths, lintSpecLaws, lintSpecExecution, BANNED_TOKENS } from './lint.js';
export type { LintViolation } from './lint.js';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the packaged generic judge prompt (`looprun-eval judge-prompt`). */
export function judgePromptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'judge-prompt.md');
}
export { computeArtifactHash, mintSeal, verifySeal, sealedFiles } from './seal.js';
