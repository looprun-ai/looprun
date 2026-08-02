/**
 * The `@looprun-ai/core/internal` twin of `public-consumer.ts` — same purpose, same compile.
 *
 * The seam has downstream consumers that DO emit declarations (`@looprun-ai/mastra` builds with
 * `declaration: true`), so `/internal`'s signatures must be just as nameable as the barrel's. Note
 * what this file does NOT re-import: the closure of these signatures also reaches `AgentSpec`,
 * `AgentWorld`, `Guard`, `GuardCtx`, `ToolDef`, `AgentControls`, `Layer` and friends — all nameable
 * from `@looprun-ai/core`, so `/internal` deliberately does not duplicate them. This file proves
 * that "nameable from the sibling barrel" is in fact enough for declaration emit.
 */
import {
  resolveGuards,
  renderScopedSpecTrunk,
  normalizeModelParams,
  resolveModelSettings,
  createLedger,
  beginTurn,
  resultOk,
  recordToolResult,
  recordTerminal,
  recordTerminalCall,
  pruneSupersededTerminals,
  vetoStormHit,
  isTerminal,
  terminalProtocol,
  forcedTerminalPrompt,
  terminalToolDefs,
  normalizeTerminalToolDef,
  prematureTerminalTools,
  supersededTerminalCalls,
  renderTurnPrompt,
  evaluatePreTool,
  evaluateOnInput,
  enforcePostTool,
  redriveMessage,
  defaultExhaustionReply,
  finalizeReply,
  governanceVeto,
  runChainCompletionPass,
  GuardExecutionError,
  DENY_ONLY_PROSE_KINDS,
  CONFIRM_CLASS_KINDS,
  ARMED_SEAMS,
} from '@looprun-ai/core/internal';
import type {
  GuardBinding,
  TurnLedger,
  TokenUsage,
  RuntimeTurnRecord,
  ReplyViolation,
  FinalizedReply,
} from '@looprun-ai/core/internal';
import type { AgentSpec, AgentWorld, DomainContract } from '@looprun-ai/core';

// ── Inferred returns across every seam ───────────────────────────────────────
export const ledger = createLedger();
export const stormed = vetoStormHit(ledger);
export const defs = terminalToolDefs();
export const protocol = terminalProtocol(true);
export const forced = forcedTerminalPrompt(false);
export const denyKinds = DENY_ONLY_PROSE_KINDS;
export const confirmKinds = CONFIRM_CLASS_KINDS;
export const seams = ARMED_SEAMS;

export function resolve(bindings: GuardBinding[], tool: string) {
  return resolveGuards(bindings, tool);
}
export function trunk(w: AgentWorld, s: AgentSpec, d: DomainContract) {
  return renderScopedSpecTrunk(w, s, [], d);
}
export function params(p: Record<string, unknown>) {
  return resolveModelSettings(normalizeModelParams(p));
}
export function preTool(spec: AgentSpec, l: TurnLedger, w: AgentWorld, tool: string, args: Record<string, unknown>) {
  return evaluatePreTool(spec, l, w, tool, args);
}
export function onInput(spec: AgentSpec, l: TurnLedger, w: AgentWorld) {
  return evaluateOnInput(spec, l, w);
}
export function postTool(spec: AgentSpec, l: TurnLedger, w: AgentWorld, tool: string) {
  return enforcePostTool(resolveGuards(spec.guards.postTool, tool), {
    world: w,
    observed: l.observed,
    turnIndex: 0,
    userText: '',
    history: [],
    tool,
    args: {},
    result: {},
  });
}
export function chainPass(spec: AgentSpec, ctx: Parameters<typeof runChainCompletionPass>[1]) {
  return runChainCompletionPass(spec.controls.chains, ctx);
}
export function veto(kind: string) {
  return governanceVeto(kind, 'reason', true);
}
export function prompt(spec: AgentSpec, w: AgentWorld, d: DomainContract) {
  return renderTurnPrompt({ spec, world: w, contract: d, userText: 'hi' });
}
export function redrive(v: ReplyViolation[]) {
  return redriveMessage(v);
}
export function exhaustion(w: AgentWorld, d: DomainContract) {
  return defaultExhaustionReply(d, w, [], [], []);
}
export function premature(steps: unknown) {
  return prematureTerminalTools(steps);
}
export function superseded(steps: unknown) {
  return supersededTerminalCalls(steps);
}

// ── Ledger writers + the remaining values, so nothing is unreferenced ────────
export function record(l: TurnLedger, w: AgentWorld): void {
  beginTurn(l, 0);
  recordToolResult(l, 'addEvent', {}, { ok: true }, w);
  recordTerminal(l, 'respond', {});
  recordTerminalCall(l, 'respond', {});
  pruneSupersededTerminals(l, []);
}
export const ok = resultOk({ ok: true });
export const term = isTerminal('respond');
export const normalized = normalizeTerminalToolDef({ name: 'respond', description: 'd', inputSchema: { type: 'object' } });

// ── Authored positions ───────────────────────────────────────────────────────
export const usage: TokenUsage | undefined = undefined;
export const rec: RuntimeTurnRecord[] = [];
export const finalized: FinalizedReply | undefined = undefined;
export const err = new GuardExecutionError({
  hook: 'preTool',
  bindingId: 'agent:x',
  guardKind: 'x',
  phase: 'check',
  cause: new Error('boom'),
});
export function finalize(...args: Parameters<typeof finalizeReply>) {
  return finalizeReply(...args);
}
