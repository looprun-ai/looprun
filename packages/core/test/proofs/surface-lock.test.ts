/**
 * THE SURFACE LOCK — the public API is data in this file, not an emergent property of a barrel.
 *
 * Without this, a symbol can be added, renamed or dropped from `src/index.ts` and every other test
 * stays green: nothing else in the repo asserts on the SHAPE of the barrel. That is precisely how a
 * contract rots.
 *
 * So the three lists below are the contract, transcribed:
 *   · TAUGHT      — the 42 core rows of the placement table in `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4,
 *                   chapters 03 (11) + 04 (28) + 05 (5). Changing this list changes what looprun
 *                   promises, and must move the outline in the same commit.
 *   · RIDERS      — the type-closure rider (outline §7): pure types reachable from a taught
 *                   signature, exported so a `declaration: true` consumer can name them. NOT taught,
 *                   NOT counted in the taught total. Derived, not chosen — `declaration-emit.test.ts` is what
 *                   proves the list is sufficient; this one proves it has not quietly grown.
 *   · INTERNAL    — the 37 `internal` verdicts of the symbol inventory §7.1, plus
 *                   `GuardExecutionError` (a class the runtime throws at consumers must be
 *                   catchable by class), plus that seam's own riders.
 *
 * A deliberate surface change EDITS THESE ARRAYS. That is the point, not an inconvenience.
 *
 * Mechanism: the TypeScript compiler API over `src/`, so the assertion covers types as well as
 * values (a runtime `import()` would see only the 33 values) and needs no build step.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'src');

// ── Chapter 03 (11) ──────────────────────────────────────────────────────────
const TAUGHT_03 = [
  'AgentSpec', 'AgentSpecBase', 'AgentSpecConfig', 'AgentScope', 'AgentWorld',
  'DomainContract', 'Hook', 'TerminalPolicy', 'ToolDef', 'ToolTarget', 'validateSpec',
];
// ── Chapter 04 (28 names = the 23 GUARD_CATALOG factories + the 5 supporting types/helpers the chapter
//    teaches beside them; the count is pinned below). Guard kinds take no regex parameters: text
//    judgment is an `llmCheck` question, and reply coverage is the structured cross-check
//    (claimIsGrounded/claimIsComplete/claimCoversRubric) over `did`. `llmCheckLie` is the engine's
//    own lie question, bound by an author who wants the deny — never auto-installed. ──
const TAUGHT_04 = [
  'Dim', 'Guard', 'GuardCtx', 'ObservedCall',
  'argAbsent', 'argFormat', 'argRequired', 'valueFromUser', 'canonArgs', 'confirmFirst',
  'consentRequired', 'custom', 'llmCheckLie', 'llmCheck',
  'claimIsGrounded', 'claimIsComplete', 'claimCoversRubric',
  'degenerationGuard', 'destructiveThrottle',
  'forbidThisTurn', 'jargonScrub', 'maxCalls',
  'noDuplicateCall', 'precondition', 'requiresBefore', 'resultInvariant',
];
// ── Chapter 05 (5) ───────────────────────────────────────────────────────────
const TAUGHT_05 = ['RunResult', 'TurnInput', 'TurnRecord', 'geminiThinkingOff', 'pinnedDecoding'];

const TAUGHT = [...TAUGHT_03, ...TAUGHT_04, ...TAUGHT_05].sort();

const RIDERS = [
  'AgentControls', 'ChainSpec', 'GuardBinding', 'HistoryToolCall', 'HistoryTurn', 'Layer',
  'MutatorBinding', 'ReplyMutator',
  'SamplingSettings', 'SpatialEdge', 'SpecWarning', 'StateDirective', 'TokenUsage',
  // GuardCtx.judge is a Judge — the one seam every judging call rides, on the barrel so a
  // `declaration:true` consumer can name it.
  'Judge',
  // claimIsGrounded's `outcomes` param is an OutcomeMap and claimCoversRubric's `outcome` is a
  // CoreOutcome — both ride the barrel to stay nameable.
  'CoreOutcome', 'OutcomeMap',
].sort();

const INTERNAL = [
  // inventory §7.1, verdict `internal` (37)
  'ARMED_SEAMS', 'CONFIRM_CLASS_KINDS', 'DENY_ONLY_PROSE_KINDS',
  // The guard vocabulary as DATA, read by the chapter generator (outline §6, decision 4).
  // Documentation infrastructure, deliberately NOT on the taught surface.
  'GUARD_CATALOG', 'GuardCatalogEntry',
  'GuardBinding', 'resolveGuards', 'renderScopedSpecTrunk',
  'normalizeModelParams', 'resolveModelSettings',
  'TokenUsage', 'RuntimeTurnRecord',
  'beginTurn', 'createLedger', 'clearDeliveredTerminal', 'pruneSupersededTerminals', 'recordTerminal', 'recordTerminalCall',
  'recordToolResult', 'recordTurnHistory', 'resultOk', 'TurnLedger', 'vetoStormHit',
  'forcedTerminalPrompt', 'isTerminal', 'normalizeTerminalToolDef', 'prematureTerminalTools',
  // The backends prune the PREMATURE (invalidated, never-delivered) terminal from `observed`, so an
  // ask the user never saw cannot license consent; the calls come from here.
  'prematureTerminalCalls',
  // The ONE notion of a terminal payload the runtime will ACCEPT. The backend hook refuses (and does
  // not observe) a call that fails it; `supersededTerminalCalls` uses the same notion to decide which
  // terminal of a step was actually delivered.
  'terminalPayloadRejection',
  // The shadow-law assertion, so the eval CONFIG loader can gate its own `outcomes` block (it builds
  // a contract-less spec, which the spec constructor's call site misses) and report a path-qualified
  // NormsConfigError. Not taught: a domain gets it for free at spec load.
  'assertNoCoreOutcomeShadow',
  'supersededTerminalCalls', 'terminalProtocol', 'terminalToolDefs', 'lastTerminalArgs',
  'renderTurnPrompt',
  // The engine renders the operation report from the verified `did` and derives the true claims for
  // the exhaustion closure; `RespondPayload`/`RenderOpts` ride the surface. The backend seam needs
  // `respondPayload` (args → structured payload for the redrive/fallback re-generation) and
  // `lastTerminalArgs` (the respond call's args from a result's steps).
  'renderOperationReport', 'deriveClaimsFromLedger', 'RespondPayload', 'RenderOpts', 'respondPayload',
  // The turn's OPERATION RECORD as an object. The record is what the reader holds beside the prose, so
  // its exact wording is part of the seam — and the wording itself is the host-declarable text pack,
  // because a challenge the user cannot read is an act they can never consent to.
  'operationRecord', 'OperationRecord', 'EngineText', 'DEFAULT_ENGINE_TEXT', 'resolveEngineText',
  // What the SESSION has already done — one line per entity, its latest state. Input to the lie check
  // and the rewriter; never delivered.
  'sessionRecord', 'SessionRecord', 'SESSION_HEADING',
  // The lie check and the rewrite it gates. The prompts and the pass ride the seam so the
  // gated measurement suite exercises the shipped instrument rather than a copy of it (`Judge` itself
  // is public, and rides finalizeReply's signature).
  'Judge', 'runLieCheck', 'LieCheckInput', 'LieCheckOutcome', 'isChecked',
  'LIE_QUESTION', 'rewritePrompt', 'TURN_HEADING',
  // The judge envelope: the prompt every judging call receives, and how its answer is read.
  // `judgeEnvelope` is the shape over already-rendered `JudgeEvidence`; `judgePrompt` renders a
  // `GuardCtx` into that evidence and is the only caller most guards need.
  'judgePrompt', 'judgeEnvelope', 'JudgeEvidence', 'readJudgeVerdict', 'JUDGE_INSTRUCTIONS',
  'JUDGE_UNREACHABLE', 'JUDGE_UNREADABLE', 'USER_TURN_WINDOW',
  // The mandatory-intention partition: the reserved speech-op vocabulary + partition predicates, the
  // `Intention` shape, and the structured ask signal (`hasAskIntent`) the consent guards key onto.
  'SPEECH_OPS', 'SpeechOp', 'Intention', 'isSpeechOp', 'isActionOp', 'hasAskIntent',
  'enforcePostTool', 'evaluateOnInput', 'evaluatePreTool',
  'finalizeReply', 'FinalizedReply', 'governanceVeto', 'redriveMessage', 'ReplyViolation',
  'runChainCompletionPass',
  // the fail-loud-at-start judge gate for llmCheck specs.
  'assertJudgePresent', 'specInstallsLlmCheck',
  // catchable by class across the package boundary
  'GuardExecutionError',
  // the seam's own type-closure riders (the rest of its closure is nameable from '.')
  'ChainPassCtx', 'ChainPassResult', 'GovernanceVeto', 'PostToolEnforcement', 'PostToolViolation',
  'PreToolVerdict', 'TurnPrompt', 'TurnPromptInput',
  // the declarative world builder + its vocabulary (seam, not taught; `AgentWorld` the type stays
  // public, `defineWorld` the builder is host/generator machinery).
  'defineWorld', 'WorldSpec', 'WorldFactory', 'BuiltWorld', 'WorldCall', 'AuditEntry', 'EntityDecl',
  'ArgDecl', 'Gate', 'ToolDecl', 'ReadResult', 'CreateResult', 'TransitionResult', 'PresetDelta', 'DefineWorldOptions',
  'CustomExecutor', 'CustomCtx', 'CustomResult', 'ScalarType', 'FieldType',
  // the `derived` formula mini-language (closed grammar, compiled at load).
  'compileFormula', 'FormulaError', 'CompiledFormula',
].sort();

/** Every name the module exports — values AND types, aliases resolved by the checker. */
function exportsOf(entry: string): string[] {
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry);
  if (!sf) throw new Error(`entry not found: ${entry}`);
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) throw new Error(`not a module: ${entry}`);
  return checker.getExportsOfModule(mod).map((s) => s.name).sort();
}

describe('surface lock — the barrels are the tutorial contract', () => {
  const publicExports = exportsOf(join(SRC, 'index.ts'));
  const internalExports = exportsOf(join(SRC, 'internal.ts'));

  it('the taught surface is exactly the outline §4 core rows (42)', () => {
    expect(TAUGHT.length).toBe(42);
    expect(TAUGHT_03.length).toBe(11);
    expect(TAUGHT_04.length).toBe(26);
    expect(TAUGHT_05.length).toBe(5);
    expect(publicExports.filter((n) => !RIDERS.includes(n))).toEqual(TAUGHT);
  });

  it('the type-closure riders are exactly the derived list — no more, no less', () => {
    expect(publicExports.filter((n) => RIDERS.includes(n))).toEqual(RIDERS);
  });

  it('@looprun-ai/core exports the taught surface plus its riders, and nothing else', () => {
    expect(publicExports).toEqual([...TAUGHT, ...RIDERS].sort());
  });

  it('@looprun-ai/core/internal is exactly the inventory §7.1 internal verdicts plus its riders', () => {
    expect(internalExports).toEqual(INTERNAL);
  });

  it('no name is a taught symbol and an internal symbol at once', () => {
    expect(TAUGHT.filter((n) => INTERNAL.includes(n))).toEqual([]);
  });

  // SELF-TEST: a lock that cannot fail locks nothing.
  it('detects a drifted surface (self-test)', () => {
    expect(publicExports).not.toEqual([...TAUGHT, ...RIDERS, 'aSymbolNobodyExports'].sort());
  });
});
