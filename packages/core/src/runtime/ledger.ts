/**
 * @looprun-ai/core runtime — the per-conversation observation LEDGER (framework-free).
 *
 * The ledger is what guards read (`ctx.observed`, `producedThisTurn`, …): the model's own verified
 * tool activity — never the user text (magnet firewall). `observed` accumulates for the whole
 * conversation; the other fields reset per turn via `beginTurn`.
 */
import type { AgentWorld, Guard, ObservedCall } from '../rules.js';
import { canonArgs } from '../guards.js';

/** An OUTPUT-dim (postTool) result-invariant failure OR a flowChain restate — carried on the ledger
 *  and JOINED into the onReply violation set so the same bounded no-tools redrive relays its text. */
export interface PostToolViolation {
  guard: Guard;
  reason: string;
}

export interface TurnLedger {
  observed: ObservedCall[];
  turnIndex: number;
  producedThisTurn: string[];
  turnCorrections: string[];
  attachments: string[];
  terminalReply: string;
  /** Consecutive guard-vetoed rounds this turn (reset when a call passes guards and executes). */
  vetoStreak: number;
  /** OUTPUT-dim (postTool) result-invariant violations + flowChain restates accrued this turn — joined
   *  into the onReply violation set before the redrive loop (see finalizeReply). Reset per turn. */
  postToolViolations: PostToolViolation[];
  /** Domain calls ADMITTED (passed preTool guards) this step but not yet reconciled into `observed`
   *  (a domain tool lands in `observed` only after execute). The model runtime dispatches a step's
   *  calls concurrently, so a same-step sibling is invisible to the next call's guards via `observed`
   *  alone; this synchronous list closes that gap. Each entry is pushed before the guard await,
   *  removed on veto (never ran) or reconciled out when the result is recorded, and cleared at turn
   *  start. Passed to preTool guards as `siblingCallsThisStep`; only the throttle reads it. */
  inFlightCalls: ObservedCall[];
}

/**
 * Veto-storm limit: with the terminal protocol (toolChoice 'required') a model that cannot
 * satisfy a guard has no way to stop — it flails, and every vetoed round is a full LLM call
 * (measured 2026-07-11: a 4B burned 15 consecutive vetoed rounds — 17 calls for 2 effective).
 * At this many consecutive vetoes the loop stops and the forced-terminal close runs.
 */
export const VETO_STORM_LIMIT = 3;

/** True when the turn is in a veto storm (see VETO_STORM_LIMIT). */
export function vetoStormHit(ledger: TurnLedger): boolean {
  return ledger.vetoStreak >= VETO_STORM_LIMIT;
}

export function createLedger(): TurnLedger {
  return { observed: [], turnIndex: 0, producedThisTurn: [], turnCorrections: [], attachments: [], terminalReply: '', vetoStreak: 0, postToolViolations: [], inFlightCalls: [] };
}

/** Reset the per-turn fields (the conversation-scoped `observed` is kept). */
export function beginTurn(ledger: TurnLedger, turnIndex: number): void {
  ledger.turnIndex = turnIndex;
  ledger.producedThisTurn = [];
  ledger.turnCorrections = [];
  ledger.attachments = [];
  ledger.terminalReply = '';
  ledger.vetoStreak = 0;
  ledger.postToolViolations = [];
  ledger.inFlightCalls = [];
}

/** Structural success check on a tool result ({success:false} / {error} / {PREREQ_NOT_MET} ⇒ failed). */
export function resultOk(r: unknown): boolean {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (o.success === false || o.PREREQ_NOT_MET === true || typeof o.error === 'string') return false;
  }
  return true;
}

/** Record a guard VETO of a tool call (the call did not run). */
export function recordVeto(ledger: TurnLedger, name: string, args: Record<string, unknown>, correction: string): void {
  ledger.observed.push({ name, args, ok: false, turnIndex: ledger.turnIndex });
  ledger.turnCorrections.push(correction);
  ledger.vetoStreak++;
}

/** Record an EXECUTED tool call's outcome (afterToolCall): ok flag, confirmation flag, produced label. */
export function recordToolResult(ledger: TurnLedger, name: string, args: Record<string, unknown>, output: unknown, world?: AgentWorld): void {
  ledger.vetoStreak = 0; // an executed call passed guards — the model is not looping
  const ok = output !== undefined && resultOk(output);
  const requiresConfirmation = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
  // Same-step reconcile: this call is now in `observed` — drop its provisional in-flight sibling
  // record to avoid double-counting it against a later same-step call.
  const inFlightIx = ledger.inFlightCalls.findIndex((o) => o.name === name && canonArgs(o.args) === canonArgs(args));
  if (inFlightIx >= 0) ledger.inFlightCalls.splice(inFlightIx, 1);
  // tookEffect (B1): match this call against the world's ledger (by name+args, like the in-flight
  // reconcile above) to learn whether it MUTATED the world — so noFalseFailureClaim can distinguish an
  // action-success from a read-success and NOT veto an honest "cannot do X / no record found" reply on
  // a read-only turn.
  const wtc = world
    ? [...world.toolCalls].reverse().find((t) => t.name === name && canonArgs((t.args ?? {}) as Record<string, unknown>) === canonArgs(args))
    : undefined;
  ledger.observed.push({
    name,
    args,
    ok,
    turnIndex: ledger.turnIndex,
    ...(world ? { tookEffect: wtc?.tookEffect === true } : {}),
    ...(requiresConfirmation ? { resultFlags: { requiresConfirmation: true } } : {}),
  });
  if (ok) {
    const lbl = (output as { label?: unknown } | null | undefined)?.label;
    if (typeof lbl === 'string') ledger.producedThisTurn.push(lbl);
  }
}

/** Record a TERMINAL tool call (replyToUser/askUser): capture the user-facing text. */
/** Record a terminal CALL in the observed ledger. Called from the guard hooks' SYNCHRONOUS segment
 *  (before any await): the model runtime dispatches a step's tool calls concurrently (Promise.all)
 *  but STARTS them in emission order, so a synchronous hook-time push makes a same-step `askUser`
 *  visible to a sibling destructive call's preTool checks — closing the noActAfterAskSameTurn
 *  same-step bypass (proof-suite finding, fixed 2026-07-15). */
export function recordTerminalCall(ledger: TurnLedger, name: string, args: Record<string, unknown>): void {
  ledger.observed.push({ name, args, ok: true, turnIndex: ledger.turnIndex });
}

/** Capture the terminal REPLY text (the observed push happens at hook time via recordTerminalCall). */
export function recordTerminal(ledger: TurnLedger, name: string, args: Record<string, unknown>): void {
  const text = typeof args.text === 'string' ? args.text : '';
  if (text.trim()) ledger.terminalReply = text;
}
