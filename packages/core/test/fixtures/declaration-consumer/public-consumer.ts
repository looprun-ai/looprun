/**
 * A CONSUMER of `@looprun-ai/core` compiled with `declaration: true`.
 *
 * This file is never compiled by this package (see the `exclude` in tsconfig.json) — it is compiled
 * by `test/proofs/declaration-emit.test.ts`, from a temp directory whose `node_modules/@looprun-ai/
 * core` symlinks to this package, so module resolution goes through the REAL `exports` map.
 *
 * WHAT IT PROVES. Declaration emit must be able to NAME every type it writes. A downstream library
 * that writes `export const w = validateSpec(spec)` gets `TS4023: exported variable 'w' has or is
 * using name 'SpecWarning' from external module … but cannot be named` the moment `SpecWarning` is
 * off the barrel — a break invisible to `pnpm -r build`, because this repo's own packages compile
 * with `declaration: true` only for themselves. Hence the type-closure rider (index.ts, bottom).
 *
 * So every export below is deliberately shaped to force a type into the emitted `.d.ts`: an inferred
 * return, a subclass, a field read. Adding a public value means adding it here.
 */
import {
  AgentSpecBase,
  validateSpec,
  geminiThinkingOff,
  pinnedDecoding,
  custom,
  requiresBefore,
  forbidThisTurn,
  argRequired,
  argAbsent,
  argFormat,
  precondition,
  maxCalls,
  canonArgs,
  noDuplicateCall,
  confirmFirst,
  destructiveThrottle,
  resultInvariant,
  degenerationGuard,
  consentRequired,
  jargonScrub,
} from '@looprun-ai/core';
import type {
  AgentSpec,
  AgentSpecConfig,
  AgentScope,
  TerminalPolicy,
  DomainContract,
  ToolDef,
  AgentWorld,
  Hook,
  ToolTarget,
  Guard,
  GuardCtx,
  ObservedCall,
  Dim,
  TurnInput,
  TurnRecord,
  RunResult,
} from '@looprun-ai/core';

// Subclassing drags the ENTIRE class surface into the emitted declaration — constructor parameter,
// every field, every method signature. This one export is the densest simulate in the file.
export class SchedulerSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler',
      mode: 'calendar',
      persona: 'You are the calendar assistant.',
      tools: ['listEvents', 'addEvent', 'cancelEvent'],
      destructiveTools: ['cancelEvent'],
    });
  }
}

const spec = new SchedulerSpec();

// ── Inferred returns: each names a type the consumer never wrote ─────────────
export const warnings = validateSpec(spec);
export const mutator = jargonScrub({ sync: 'update' });
export const decoding = pinnedDecoding({ seed: 7 });
export const thinking = geminiThinkingOff();
export const installedId = spec.addGuard('preTool', ['addEvent'], argRequired('startsAt'));
export const isPure = spec.isPureGuardSet;

// ── Field reads: the authored shapes hanging off the taught config/spec ──────
export function readControls(s: AgentSpec) {
  return s.controls;
}
export function readFlow(s: AgentSpec) {
  return s.flow;
}
export function readGuards(s: AgentSpec) {
  return s.guards;
}
export function readScope(s: AgentSpec) {
  return s.scope;
}
export function readSurface(s: AgentSpec) {
  return s.surface;
}
export function readContract(s: AgentSpec) {
  return s.contract;
}
export function readSampling(c: AgentSpecConfig) {
  return c.sampling;
}
export function readDirectives(c: AgentSpecConfig) {
  return c.directives;
}
export function readChains(c: AgentSpecConfig) {
  return c.chains;
}
export function readTerminal(c: AgentSpecConfig) {
  return c.terminal;
}
export function readTurnRecords(r: RunResult) {
  return r.turnRecords;
}
export function readUsage(t: TurnRecord) {
  return t.tokens;
}
export function readObserved(ctx: GuardCtx) {
  return ctx.observed;
}
export function readSensitiveFields(c: DomainContract) {
  return c.sensitiveFields;
}
export function readScrubTextFields(c: DomainContract) {
  return c.scrubTextFields;
}

// ── The whole factory catalog: emits every parameter type of every guard ─────
export const catalog = {
  custom,
  requiresBefore,
  forbidThisTurn,
  argRequired,
  argAbsent,
  argFormat,
  precondition,
  maxCalls,
  canonArgs,
  noDuplicateCall,
  confirmFirst,
  destructiveThrottle,
  resultInvariant,
  degenerationGuard,
  consentRequired,
  jargonScrub,
};

// ── Authored positions for the taught types (rule 1 of outline §0) ───────────
export const scope: AgentScope = { lane: 'calendar', others: [{ label: 'Billing', covers: 'invoices' }] };
export const terminal: TerminalPolicy = (w: AgentWorld) => Boolean(w.state);
export const turns: TurnInput[] = [{ userText: 'what is on my calendar today?' }];
export const toolDefs: ToolDef[] = [{ name: 'listEvents', description: 'list', inputSchema: { type: 'object' } }];
export const contract: DomainContract = {
  voice: 'You are the assistant of a small business.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "Reply in the user's language.",
};
export const dim: Dim = 'behavior';
export const hook: Hook = 'onReply';
export const target: ToolTarget = 'any';
export const aGuard: Guard = custom({ kind: 'k', dim: 'behavior', check: () => null, prose: () => 'p' });
export const calls: ObservedCall[] = [];
