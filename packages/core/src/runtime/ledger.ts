/**
 * @looprun-ai/core runtime — the per-conversation observation LEDGER (framework-free).
 *
 * The ledger is what guards read (`ctx.observed`, `producedThisTurn`, …): the model's own verified
 * tool activity — never the user text (magnet firewall). `observed` accumulates for the whole
 * conversation; the other fields reset per turn via `beginTurn`.
 */
import type { ObservedCall } from '../rules.js';

export interface TurnLedger {
  observed: ObservedCall[];
  turnIndex: number;
  producedThisTurn: string[];
  turnCorrections: string[];
  attachments: string[];
  terminalReply: string;
  /** Consecutive guard-vetoed rounds this turn (reset when a call passes guards and executes). */
  vetoStreak: number;
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
  return { observed: [], turnIndex: 0, producedThisTurn: [], turnCorrections: [], attachments: [], terminalReply: '', vetoStreak: 0 };
}

/** Reset the per-turn fields (the conversation-scoped `observed` is kept). */
export function beginTurn(ledger: TurnLedger, turnIndex: number): void {
  ledger.turnIndex = turnIndex;
  ledger.producedThisTurn = [];
  ledger.turnCorrections = [];
  ledger.attachments = [];
  ledger.terminalReply = '';
  ledger.vetoStreak = 0;
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
export function recordToolResult(ledger: TurnLedger, name: string, args: Record<string, unknown>, output: unknown): void {
  ledger.vetoStreak = 0; // an executed call passed guards — the model is not looping
  const ok = output !== undefined && resultOk(output);
  const requiresConfirmation = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
  ledger.observed.push({
    name,
    args,
    ok,
    turnIndex: ledger.turnIndex,
    ...(requiresConfirmation ? { resultFlags: { requiresConfirmation: true } } : {}),
  });
  if (ok) {
    const lbl = (output as { label?: unknown } | null | undefined)?.label;
    if (typeof lbl === 'string') ledger.producedThisTurn.push(lbl);
  }
}

/** Record a TERMINAL tool call (replyToUser/askUser): capture the user-facing text. */
export function recordTerminal(ledger: TurnLedger, name: string, args: Record<string, unknown>): void {
  const text = typeof args.text === 'string' ? args.text : '';
  if (text.trim()) ledger.terminalReply = text;
  ledger.observed.push({ name, args, ok: true, turnIndex: ledger.turnIndex });
}
