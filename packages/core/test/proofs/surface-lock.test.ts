/**
 * THE SURFACE LOCK — the public API is data in this file, not an emergent property of a barrel.
 *
 * Tasks 4–7 of the simplification all edit `src/index.ts`. Without this, a symbol can be added,
 * renamed or dropped and every other test stays green: nothing else in the repo asserts on the
 * SHAPE of the barrel. That is precisely how a contract rots.
 *
 * So the three lists below are the contract, transcribed:
 *   · TAUGHT      — the 47 core rows of the placement table in `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4,
 *                   chapters 03 (11) + 04 (31) + 05 (5). Changing this list changes what looprun
 *                   promises, and must move the outline in the same commit.
 *   · RIDERS      — the type-closure rider (outline §7): pure types reachable from a taught
 *                   signature, exported so a `declaration: true` consumer can name them. NOT taught,
 *                   NOT counted in the taught total. Derived, not chosen — `declaration-emit.test.ts` is what
 *                   proves the list is sufficient; this one proves it has not quietly grown.
 *   · INTERNAL    — the 37 `internal` verdicts of the symbol inventory §7.1, plus
 *                   `GuardExecutionError` (controller ruling: a class the runtime throws at
 *                   consumers must be catchable by class), plus that seam's own riders.
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
// ── Chapter 04 (31) — no-regex law (2026-08-02) deleted 8 regex-param kinds; confirmedNeedsEarlierProbe
//    absorbed into confirmFirst({ via:'probe' }); replyMustMention + replyConfirmsLabels merged into
//    replyMentions({ terms, anyTerm }) (2026-08-02); SCG (2026-08-02) added the three deterministic
//    cross-check honesty kinds (claimIsGrounded/claimIsComplete/claimCoversRubric) ──
const TAUGHT_04 = [
  'Dim', 'Guard', 'GuardCtx', 'ObservedCall',
  'argAbsent', 'argFormat', 'argRequired', 'askedEarlier', 'canonArgs', 'confirmFirst',
  'consentRequired', 'custom', 'llmCheck',
  'claimIsGrounded', 'claimIsComplete', 'claimCoversRubric',
  'degenerationGuard', 'destructiveThrottle', 'emptyReply',
  'forbidThisTurn', 'jargonScrub', 'maxCalls', 'noActAfterAskSameTurn',
  'noDuplicateCall',
  'pendingConfirmMustAsk', 'precondition', 'replyMaxOccurrences',
  'replyMentions', 'replySingleQuestion', 'requiresBefore', 'resultInvariant',
];
// ── Chapter 05 (5) ───────────────────────────────────────────────────────────
const TAUGHT_05 = ['RunResult', 'TurnInput', 'TurnRecord', 'geminiThinkingOff', 'pinnedDecoding'];

const TAUGHT = [...TAUGHT_03, ...TAUGHT_04, ...TAUGHT_05].sort();

const RIDERS = [
  'AgentControls', 'ChainSpec', 'GuardBinding', 'HistoryToolCall', 'HistoryTurn', 'Layer',
  'MutatorBinding', 'ReplyMutator',
  'SamplingSettings', 'SpatialEdge', 'SpecWarning', 'StateDirective', 'TokenUsage',
  // full-context-guards increment: GuardCtx.adjudicator is an Adjudicator, whose verdict is an
  // AdjudicatorVerdict — both ride the barrel so a `declaration:true` consumer can name them.
  'Adjudicator', 'AdjudicatorVerdict',
  // SCG (2026-08-02): claimIsGrounded's `outcomes` param is an OutcomeMap and claimCoversRubric's
  // `outcome` is a CoreOutcome — both ride the barrel to stay nameable.
  'CoreOutcome', 'OutcomeMap',
].sort();

const INTERNAL = [
  // inventory §7.1, verdict `internal` (37) + buildHonestAbstain (config-only increment, post-inventory)
  'ARMED_SEAMS', 'CONFIRM_CLASS_KINDS', 'DENY_ONLY_PROSE_KINDS',
  // Task 4 — the guard vocabulary as DATA, read by the chapter generator (outline §6, decision 4).
  // Documentation infrastructure, deliberately NOT on the taught surface.
  'GUARD_CATALOG', 'GuardCatalogEntry',
  'GuardBinding', 'resolveGuards', 'renderScopedSpecTrunk',
  'normalizeModelParams', 'resolveModelSettings',
  'TokenUsage', 'RuntimeTurnRecord',
  'beginTurn', 'createLedger', 'pruneSupersededTerminals', 'recordTerminal', 'recordTerminalCall',
  'recordToolResult', 'recordTurnHistory', 'resultOk', 'TurnLedger', 'vetoStormHit',
  'forcedTerminalPrompt', 'isTerminal', 'normalizeTerminalToolDef', 'prematureTerminalTools',
  'supersededTerminalCalls', 'terminalProtocol', 'terminalToolDefs',
  'renderTurnPrompt',
  // buildHonestAbstain — the engine-owned honest-abstain closure (config-only increment, post-inventory).
  'buildHonestAbstain', 'defaultExhaustionReply', 'enforcePostTool', 'evaluateOnInput', 'evaluatePreTool',
  'finalizeReply', 'FinalizedReply', 'governanceVeto', 'redriveMessage', 'ReplyViolation',
  'runChainCompletionPass',
  // full-context-guards increment — the fail-loud-at-start adjudicator gate for llmCheck specs.
  'assertAdjudicatorPresent', 'specInstallsLlmCheck',
  // controller ruling — catchable by class across the package boundary
  'GuardExecutionError',
  // the seam's own type-closure riders (the rest of its closure is nameable from '.')
  'ChainPassCtx', 'ChainPassResult', 'GovernanceVeto', 'PostToolEnforcement', 'PostToolViolation',
  'PreToolVerdict', 'TurnPrompt', 'TurnPromptInput',
  // increment 3a — the declarative world builder + its vocabulary (seam, no tutorial chapter yet;
  // AgentWorld the type stays public, defineWorld the builder is host/generator machinery).
  'defineWorld', 'WorldSpec', 'WorldFactory', 'BuiltWorld', 'WorldCall', 'AuditEntry', 'EntityDecl',
  'ArgDecl', 'Gate', 'ToolDecl', 'ReadResult', 'CreateResult', 'TransitionResult', 'PresetDelta', 'DefineWorldOptions',
  'CustomExecutor', 'CustomCtx', 'CustomResult', 'ScalarType', 'FieldType',
  // increment 3b — the `derived` formula mini-language (closed grammar, compiled at load).
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

  it('the taught surface is exactly the outline §4 core rows (47)', () => {
    expect(TAUGHT.length).toBe(47);
    expect(TAUGHT_03.length).toBe(11);
    expect(TAUGHT_04.length).toBe(31);
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
