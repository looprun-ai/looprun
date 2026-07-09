/**
 * @looprun/core runtime — the per-conversation observation LEDGER (framework-free).
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
}

export function createLedger(): TurnLedger {
  return { observed: [], turnIndex: 0, producedThisTurn: [], turnCorrections: [], attachments: [], terminalReply: '' };
}

/** Reset the per-turn fields (the conversation-scoped `observed` is kept). */
export function beginTurn(ledger: TurnLedger, turnIndex: number): void {
  ledger.turnIndex = turnIndex;
  ledger.producedThisTurn = [];
  ledger.turnCorrections = [];
  ledger.attachments = [];
  ledger.terminalReply = '';
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
}

/** Record an EXECUTED tool call's outcome (afterToolCall): ok flag, confirmation flag, produced label. */
export function recordToolResult(ledger: TurnLedger, name: string, args: Record<string, unknown>, output: unknown): void {
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
