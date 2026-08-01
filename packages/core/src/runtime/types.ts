/**
 * @looprun-ai/core runtime — shared types of the governed-turn machine (framework-free).
 */

/** A tool definition (name / description / JSON schema) executed through the world seam. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TokenUsage {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  total: number | null;
}

/** One conversation turn's input (channel-agnostic). */
export interface TurnInput {
  userText: string;
  attachments?: string[];
}

/** A per-turn record emitted by a backend's conversation runner. */
export interface TurnRecord {
  userText: string;
  assistantFinalText: string;
  finalMode: string;
  assistantMsgCount: number;
  iters: number;
  llmCalls: number;
  toolCalls: Array<{ name: string; args: unknown; resultSummary: string; tookEffect?: boolean; latencyMs: number }>;
  /** Calls a guard VETOED before execution (the world never saw them). A FORBIDDEN eval invariant
   *  matches over executed ∪ attempted, so the governed arm's blocked attempts are scored, not lost. */
  attemptedCalls?: Array<{ name: string; args: unknown }>;
  thoughts: string | null;
  tokens: TokenUsage;
  llmCallLatenciesMs: number[];
  durationMs: number;
  maxIterHit: boolean;
  recoveryEvents: string[];
  sseActions?: unknown[];
  attachments?: string[];
}

export interface RunResult {
  turnRecords: TurnRecord[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  errorMsg?: string;
}

/** Continuity alias (the pre-extraction runtime name), still named by `/internal`. */
export type RuntimeTurnRecord = TurnRecord;
