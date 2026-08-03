/**
 * THE PER-RUN SHEET — the six rows the plan requires, computed for one scenario.
 *
 * ```
 *   trunk stability    same system bytes across every generation of the conversation
 *   prompt size        characters + tokens, split trunk / protocol / tool schemas / state
 *   format defects     invalid JSON · missing required · unknown key · wrong type · did absent · did empty
 *   value defects      outcome outside the vocabulary · speech op with an outcome · target the world never issued
 *   recovery cost      redrives · forced-terminal fallbacks · exhaustion closures
 *   refusal to close   turns whose every terminal the runtime refused, or that emitted none
 * ```
 *
 * Everything is derived from two records the runtime already produces — the `TurnRecord`s and the
 * message history — plus the recorded prompts. Nothing is asked of the model twice and nothing is
 * re-rendered.
 */
import type { TurnRecord } from '@looprun-ai/core';
import { classifyTerminal, issuedStrings, type Defect, type FormatDefectKind, type ValueDefectKind } from './defects.js';
import { callsOfTurn, type Recorder } from './recording-model.js';
import { estimateTokens, measureCall, trunkStability, type PromptMeasurement, type TrunkStability } from './prompt-size.js';

/** One `respond` the model emitted, classified. */
export interface TerminalSheet {
  message: string;
  did: unknown;
  format: Array<Defect<FormatDefectKind>>;
  value: Array<Defect<ValueDefectKind>>;
  /** The runtime's own refusal reason for these bytes, or `null` when it would deliver them. */
  engineRejected: string | null;
}

export interface RecoveryCost {
  /** Redrive ROUNDS. Exact at the battery's `redrives: 1`; a lower bound above it (see below). */
  redrives: number;
  forcedTerminals: number;
  exhaustionClosures: number;
  /** `respond` payloads the runtime refused before they executed. */
  terminalRejections: number;
}

export interface TurnSheet {
  turn: number;
  userText: string;
  prompt: PromptMeasurement;
  /** Every `respond` this turn emitted, in order. */
  terminals: TerminalSheet[];
  formatDefects: Array<Defect<FormatDefectKind>>;
  valueDefects: Array<Defect<ValueDefectKind>>;
  recovery: RecoveryCost;
  /** The model produced at least one terminal the runtime would deliver. */
  closedByModel: boolean;
  /** The FIRST terminal was clean — the model got the shape right without being corrected. */
  validTurn: boolean;
  recoveryEvents: string[];
  reply: string;
}

export interface ScenarioSheet {
  id: string;
  axis: 'capacity' | 'resistance';
  title: string;
  turns: TurnSheet[];
  trunk: TrunkStability;
  /** Turns whose first terminal was clean, over turns run. */
  validTurnRate: number;
  redrivesPerTurn: number;
  /** Turns that never produced a terminal the runtime would deliver. */
  refusalToClose: number;
  /** The world's tool calls, as the ledger recorded them — the resistance detectors read these. */
  worldCalls: Array<{ name: string; args: unknown; tookEffect?: boolean }>;
  error?: string;
}

/**
 * The battery pins `redrives: 1` (the runtime default), where the correction log determines the
 * round count exactly: `finalizeReply` logs one `redrive:<kind>` per RELAYED VIOLATION, so the
 * entries cannot be counted directly, but at one permitted round their presence IS the round.
 * Raising the budget would make this a lower bound, which is why the battery does not raise it.
 */
export const BATTERY_REDRIVES = 1;

function countRecovery(events: readonly string[]): RecoveryCost {
  const anyRedrive = events.some((e) => e.startsWith('redrive'));
  return {
    redrives: anyRedrive ? 1 : 0,
    forcedTerminals: events.filter((e) => e === 'forced-terminal').length,
    exhaustionClosures: events.filter((e) => e.startsWith('exhaustion-')).length,
    terminalRejections: events.filter((e) => e === 'terminal-rejected').length,
  };
}

/**
 * The `respond` calls of each turn, mined from the conversation's message history.
 *
 * Segmentation is by USER message, and that is exact rather than convenient: the runtime pushes one
 * user message per turn and never pushes the redrive, forced-terminal or chain PROMPTS — only their
 * response messages. So every assistant message after the Nth user message belongs to turn N.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function terminalsByTurn(messages: any[], turnCount: number): unknown[][] {
  const byTurn: unknown[][] = Array.from({ length: turnCount }, () => []);
  let turn = -1;
  for (const m of messages ?? []) {
    if (m?.role === 'user') {
      turn++;
      continue;
    }
    if (turn < 0 || turn >= turnCount) continue;
    for (const part of partsOf(m)) {
      if (isToolCallPart(part) && toolNameOf(part) === 'respond') byTurn[turn].push(toolInputOf(part));
    }
  }
  return byTurn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function partsOf(m: any): any[] {
  const content = m?.content;
  if (Array.isArray(content)) return content;
  if (Array.isArray(m?.parts)) return m.parts;
  return [];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isToolCallPart(p: any): boolean {
  const t = String(p?.type ?? '');
  return t === 'tool-call' || t === 'tool_call' || t === 'tool-invocation';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolNameOf(p: any): string {
  return String(p?.toolName ?? p?.name ?? p?.payload?.toolName ?? p?.toolInvocation?.toolName ?? '');
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolInputOf(p: any): unknown {
  return p?.input ?? p?.args ?? p?.payload?.input ?? p?.payload?.args ?? p?.toolInvocation?.args ?? {};
}

export interface BuildSheetInput {
  id: string;
  axis: 'capacity' | 'resistance';
  title: string;
  turnTexts: string[];
  records: readonly TurnRecord[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  recorder: Recorder;
  worldCalls: ReadonlyArray<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>;
  outcomes?: Readonly<Record<string, string>>;
  error?: string;
}

/** Fold one finished scenario into its sheet. Pure: no I/O, no model, no clock. */
export function buildScenarioSheet(input: BuildSheetInput): ScenarioSheet {
  const issued = issuedStrings(input.worldCalls);
  const terminalsPerTurn = terminalsByTurn(input.messages, input.records.length);

  const turns: TurnSheet[] = input.records.map((record, i) => {
    const userText = input.turnTexts[i] ?? record.userText;
    const calls = callsOfTurn(input.recorder, i);
    const chars = calls.length ? measureCall(calls[0], userText) : { trunk: 0, protocol: 0, toolSchemas: 0, state: 0, userText: 0, total: 0 };
    const terminals: TerminalSheet[] = (terminalsPerTurn[i] ?? []).map((raw) => {
      const c = classifyTerminal(raw, { issued, ...(input.outcomes ? { outcomes: input.outcomes } : {}) });
      return {
        message: typeof c.args.message === 'string' ? c.args.message : '',
        did: c.args.did,
        format: c.format,
        value: c.value,
        engineRejected: c.engineRejected,
      };
    });
    const events = record.recoveryEvents ?? [];
    return {
      turn: i,
      userText,
      prompt: {
        chars,
        tokensEstimated: estimateTokens(chars),
        reportedInputTokens: record.tokens?.input ?? null,
        reportedOutputTokens: record.tokens?.output ?? null,
      },
      terminals,
      formatDefects: terminals.flatMap((t) => t.format),
      valueDefects: terminals.flatMap((t) => t.value),
      recovery: countRecovery(events),
      closedByModel: terminals.some((t) => t.engineRejected === null),
      validTurn: terminals.length > 0 && terminals[0].format.length === 0 && terminals[0].value.length === 0,
      recoveryEvents: [...events],
      reply: record.assistantFinalText,
    };
  });

  const n = turns.length || 1;
  return {
    id: input.id,
    axis: input.axis,
    title: input.title,
    turns,
    trunk: trunkStability(input.recorder.calls),
    validTurnRate: turns.filter((t) => t.validTurn).length / n,
    redrivesPerTurn: turns.reduce((s, t) => s + t.recovery.redrives, 0) / n,
    refusalToClose: turns.filter((t) => !t.closedByModel).length,
    worldCalls: input.worldCalls.map((c) => ({ name: c.name, args: c.args, ...(c.tookEffect !== undefined ? { tookEffect: c.tookEffect } : {}) })),
    ...(input.error ? { error: input.error } : {}),
  };
}

/** The axis-level roll-up over a set of scenario sheets. */
export interface AxisTotals {
  scenarios: number;
  turns: number;
  validTurns: number;
  validTurnRate: number;
  formatDefects: number;
  valueDefects: number;
  redrives: number;
  redrivesPerTurn: number;
  forcedTerminals: number;
  exhaustionClosures: number;
  terminalRejections: number;
  refusalToClose: number;
  trunkUnstableScenarios: string[];
  errors: string[];
}

export function totalsOf(sheets: readonly ScenarioSheet[]): AxisTotals {
  const turns = sheets.flatMap((s) => s.turns);
  const n = turns.length || 1;
  const sum = (f: (t: TurnSheet) => number) => turns.reduce((acc, t) => acc + f(t), 0);
  return {
    scenarios: sheets.length,
    turns: turns.length,
    validTurns: turns.filter((t) => t.validTurn).length,
    validTurnRate: turns.filter((t) => t.validTurn).length / n,
    formatDefects: sum((t) => t.formatDefects.length),
    valueDefects: sum((t) => t.valueDefects.length),
    redrives: sum((t) => t.recovery.redrives),
    redrivesPerTurn: sum((t) => t.recovery.redrives) / n,
    forcedTerminals: sum((t) => t.recovery.forcedTerminals),
    exhaustionClosures: sum((t) => t.recovery.exhaustionClosures),
    terminalRejections: sum((t) => t.recovery.terminalRejections),
    refusalToClose: turns.filter((t) => !t.closedByModel).length,
    trunkUnstableScenarios: sheets.filter((s) => !s.trunk.stable).map((s) => s.id),
    errors: sheets.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`),
  };
}

/** Where the shape was missed, as a histogram — the CAPACITY axis's actionable output. */
export function defectHistogram(sheets: readonly ScenarioSheet[]): Record<string, number> {
  const hist: Record<string, number> = {};
  for (const s of sheets) {
    for (const t of s.turns) {
      for (const d of [...t.formatDefects, ...t.valueDefects]) {
        const key = `${d.kind} @ ${d.at.replace(/\[\d+\]/g, '[]')}`;
        hist[key] = (hist[key] ?? 0) + 1;
      }
    }
  }
  return hist;
}
