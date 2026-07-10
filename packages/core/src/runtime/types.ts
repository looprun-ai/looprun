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

/** Continuity aliases (the pre-extraction runtime names). */
export type RuntimeTurnInput = TurnInput;
export type RuntimeTurnRecord = TurnRecord;
