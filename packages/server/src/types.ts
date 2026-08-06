/**
 * OpenAI chat-completions wire types (the subset the server speaks) + server config.
 *
 * The server deliberately implements the protocol as a FACADE: the harness believes it is talking
 * to a model, while a full governed turn runs behind the endpoint. Incoming `system` messages,
 * `tools`, `tool_choice` and sampling params are therefore ignored by design — the AgentSpec owns
 * the assembled prompt, the tool surface and the sampling (see README).
 */
import type { ObservedCall } from '@looprun-ai/core';
import type { LoopRunAgent } from '@looprun-ai/mastra';

/**
 * The governed-turn metadata a LoopRunAgent attaches to its result as `result.looprun`.
 *
 * Declared here rather than imported: it is INTERNAL to `@looprun-ai/mastra` (symbol inventory
 * §7.2) and that package has no `/internal` subpath, while this server's own `TurnEvent` is
 * public and must be nameable in the emitted declarations.
 *
 * MIRROR — the source of truth is `LoopRunResultMeta` in `packages/mastra/src/agent.ts`; keep the
 * two identical. `packages/server/test/meta-mirror.test.ts` pins them at compile time.
 */
export interface LoopRunResultMeta {
  sessionId: string;
  turnIndex: number;
  /** Guard activity this turn: veto kinds, 'forced-terminal', 'redrive:*', 'exhaustion-terminal'. */
  corrections: string[];
  exhausted: boolean;
  violations: string[];
  /** This turn's slice of the observed action history. */
  observed: ObservedCall[];
}

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
