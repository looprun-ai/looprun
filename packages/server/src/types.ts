/**
 * OpenAI chat-completions wire types (the subset the server speaks) + server config.
 *
 * The server deliberately implements the protocol as a FACADE: the harness believes it is talking
 * to a model, while a full governed turn runs behind the endpoint. Incoming `system` messages,
 * `tools`, `tool_choice` and sampling params are therefore ignored by design — the AgentSpec owns
 * the trunk, the tool surface and the sampling (see README).
 */
import type { LoopRunAgent, LoopRunResultMeta } from '@looprun-ai/mastra';

/** One incoming OpenAI message. Content may be a string or an array of typed parts. */
export interface WireMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string }> | null;
}

export interface CompletionRequestBody {
  model: string;
  messages: WireMessage[];
  stream?: boolean;
  /** OpenAI-standard end-user id — second precedence for the looprun session id. */
  user?: string;
  [ignored: string]: unknown;
}

/** Non-standard envelope extension carrying the governed-turn metadata (SDKs ignore it). */
export interface LoopRunEnvelopeMeta {
  sessionId: string;
  turnIndex: number;
  corrections: string[];
  exhausted: boolean;
  violations: string[];
}

export interface TurnEvent {
  model: string;
  sessionId: string;
  meta: LoopRunResultMeta;
}

export interface ModelServerConfig {
  /** Registry: OpenAI `model` field → governed agent. */
  agents: Record<string, LoopRunAgent>;
  /** Listen port; 0 (default) = ephemeral. */
  port?: number;
  /** Bind hostname; default 127.0.0.1. */
  hostname?: string;
  /** `context_length` reported by /v1/models. High default keeps harnesses from compressing
   *  history, which would break the fingerprint session fallback. */
  contextLength?: number;
  /** When set, requests must carry `Authorization: Bearer <apiKey>`. */
  apiKey?: string;
  /** Override the session-id resolution chain (header → body.user → fingerprint). */
  resolveSession?: (body: CompletionRequestBody, headers: Headers) => string;
  /** Idle sessions older than this are disposed via agent.endSession(). Default: no eviction. */
  sessionTtlMs?: number;
  /** Observability: fires after every governed turn (the sim harness asserts through this). */
  onTurn?: (event: TurnEvent) => void;
}

export interface ModelServer {
  url: string;
  port: number;
  handler: (req: Request) => Promise<Response>;
  close(): Promise<void>;
}
