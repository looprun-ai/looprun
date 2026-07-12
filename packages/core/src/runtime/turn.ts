/**
 * @looprun-ai/core runtime — the governed-TURN state machine (framework-free).
 *
 * Everything deterministic about one turn lives here; a backend (e.g. @looprun-ai/mastra) supplies only
 * the framework glue: how tools are wired, how the LLM is called, and ONE async `redrive` callback
 * that re-generates text with tools disabled.
 *
 * The reply pipeline (finalizeReply): mutators → onReply checks → bounded NO-TOOLS redrive →
 * deterministic honest-abstain closure. The redrive is a plain text re-generation with the
 * correction appended — NEVER a framework retry that re-runs the whole generation (that re-executes
 * side-effecting tools; measured ~100× slower).
 */
import { resolveGuards, resolveMutators } from '../spec.js';
import type { AgentSpec } from '../spec.js';
import type { TrunkTheme } from '../trunk.js';
import type { AgentWorld, Guard, GuardCtx } from '../rules.js';
import { recordVeto, type TurnLedger } from './ledger.js';

export interface ReplyViolation {
  guard: Guard;
  reason: string;
}

export type PreToolVerdict =
  | { verdict: 'allow' }
  | { verdict: 'deny'; reason: string; guard: Guard };

/** Run the preTool guards for one candidate call. On deny, the veto is recorded in the ledger. */
export async function evaluatePreTool(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  tool: string,
  args: Record<string, unknown>,
): Promise<PreToolVerdict> {
  const guards = resolveGuards(spec.guards.preTool, tool);
  const gctx: GuardCtx = {
    args,
    tool,
    world,
    observed: ledger.observed,
    turnIndex: ledger.turnIndex,
    attachmentsThisTurn: ledger.attachments,
  };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      recordVeto(ledger, tool, args, `${g.dim}:${g.kind}:${tool}`);
      // 2nd+ consecutive veto: the model is looping — tell it to close, in unmissable terms.
      const escalated = ledger.vetoStreak >= 2
        ? `${reason} STOP: do not call any more domain tools this turn. Close NOW with replyToUser (or askUser), reporting only what actually succeeded.`
        : reason;
      return { verdict: 'deny', reason: escalated, guard: g };
    }
  }
  return { verdict: 'allow' };
}

/** Run the onInput guards (before any LLM call). Returns the refusal reason, or null to proceed. */
export async function evaluateOnInput(spec: AgentSpec, ledger: TurnLedger, world: AgentWorld): Promise<string | null> {
  const guards = resolveGuards(spec.guards.onInput);
  const gctx: GuardCtx = { args: {}, world, observed: ledger.observed, turnIndex: ledger.turnIndex };
  for (const g of guards) {
    const reason = await g.check(gctx);
    if (reason) {
      ledger.turnCorrections.push(`onInput:${g.kind}`);
      return reason;
    }
  }
  return null;
}

/** Apply the deterministic egress mutators (e.g. jargonScrub) to the reply text. */
export function applyMutators(spec: AgentSpec, ledger: TurnLedger, world: AgentWorld, text: string): string {
  let out = text;
  for (const m of resolveMutators(spec.guards.onReplyMutate)) {
    const mctx: GuardCtx = {
      args: {},
      world,
      observed: ledger.observed,
      turnIndex: ledger.turnIndex,
      reply: out,
      producedThisTurn: ledger.producedThisTurn,
    };
    const next = m.apply(out, mctx);
    if (next !== out) {
      ledger.turnCorrections.push(`mutate:${m.kind}`);
      out = next;
    }
  }
  return out;
}

/** Run the onReply guard checks against a candidate reply. */
export async function checkReply(
  spec: AgentSpec,
  ledger: TurnLedger,
  world: AgentWorld,
  text: string,
): Promise<ReplyViolation[]> {
  const rctx: GuardCtx = {
    args: {},
    world,
    observed: ledger.observed,
    turnIndex: ledger.turnIndex,
    reply: text,
    producedThisTurn: ledger.producedThisTurn,
    attachmentsThisTurn: ledger.attachments,
    notes: ledger.turnCorrections,
  };
  const out: ReplyViolation[] = [];
  for (const g of resolveGuards(spec.guards.onReply)) {
    const r = await g.check(rctx);
    if (r) out.push({ guard: g, reason: r });
  }
  return out;
}

/** The redrive user message a backend sends for a bounded NO-TOOLS re-generation. */
export function redriveMessage(violations: ReplyViolation[]): string {
  const correction = violations.map((v) => `- ${v.reason}`).join('\n');
  return `Revise your last reply to the user:\n${correction}\nReply now in the user's language. Do NOT call a tool.`;
}

/** The built-in honest-abstain closure: a pure function of verified observations. */
export function defaultExhaustionReply(
  theme: TrunkTheme | undefined,
  world: AgentWorld,
  okTools: string[],
  produced: string[],
  violations: string[],
): string {
  if (theme?.exhaustionReply) return theme.exhaustionReply(world, okTools, produced, violations);
  return okTools.length
    ? `Done this step: ${[...new Set(okTools)].join(', ')}${produced.length ? ` (${produced.join(', ')})` : ''}. I could not safely finish the rest — how would you like to proceed?`
    : 'I could not complete this safely — nothing was changed. Could you rephrase or add detail?';
}

export interface FinalizedReply {
  text: string;
  exhausted: boolean;
  violations: string[];
}

/**
 * The whole reply pipeline: mutators → onReply checks → up to `maxRedrives` NO-TOOLS re-generations
 * (via the backend-supplied `redrive` callback) → deterministic exhaustion closure if still violating.
 */
export async function finalizeReply(
  spec: AgentSpec,
  theme: TrunkTheme | undefined,
  world: AgentWorld,
  ledger: TurnLedger,
  initialText: string,
  redrive: (message: string) => Promise<string>,
  maxRedrives: number,
): Promise<FinalizedReply> {
  let text = applyMutators(spec, ledger, world, initialText);

  let violations = await checkReply(spec, ledger, world, text);
  for (let r = 0; r < maxRedrives && violations.length; r++) {
    const next = await redrive(redriveMessage(violations));
    for (const v of violations) ledger.turnCorrections.push(`redrive:${v.guard.kind}`);
    if (next) text = next;
    violations = await checkReply(spec, ledger, world, text);
  }

  const finalViolations = violations.map((v) => v.guard.kind);
  if (finalViolations.length) {
    const okTools = ledger.observed.filter((o) => o.turnIndex === ledger.turnIndex && o.ok).map((o) => o.name);
    const closure = spec.controls.exhaustionReply
      ? spec.controls.exhaustionReply(world, okTools, ledger.producedThisTurn, finalViolations)
      : defaultExhaustionReply(theme, world, okTools, ledger.producedThisTurn, finalViolations);
    ledger.turnCorrections.push('exhaustion-terminal');
    return { text: closure, exhausted: true, violations: finalViolations };
  }

  return { text, exhausted: false, violations: [] };
}
